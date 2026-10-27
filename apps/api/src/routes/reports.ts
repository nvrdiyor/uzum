/**
 * Oylik hisobot moduli — /api/v1/reports
 *
 *  GET  /monthly        → MonthlyReportResponse (oyning to'liq moliyaviy va sotuv kesimi)
 *  GET  /compare        → oxirgi 6 oy taqqoslovi: { month, revenue, profit, margin }[]
 *  POST /send-telegram  → o'sha hisobotning Excel faylini foydalanuvchining Telegram chatiga yuboradi
 *
 * Davrni tanlash: `?month=YYYY-MM` (o'sha oy) yoki umumiy `from`/`to`/`preset` filtrlari.
 * Tarif tarix chuqurligidan tashqaridagi sanalar avtomatik qisqartiriladi.
 * `?basis=receipt` — sotuv xaridor qabul qilgan kun bo'yicha (lib/period.ts
 * DateBasis); berilmasa — buyurtma sanasi, javob avvalgidek.
 *
 * Hisob services/monthly-report.ts da — sahifa, Excel fayl (GET /export/monthly)
 * va Telegram nusxasi uchun BITTA:
 *   grossProfit = tushum − tannarx
 *   netProfit   = tovarlar bo'yicha foyda − davr xarajatlari (Boshqaruv paneli bilan bir xil)
 *
 * Ma'lumot bo'lmasa ham 200 va bo'sh/nol qiymatlar qaytariladi.
 */
import { Router, type Request } from 'express';
import { formatMoney, formatNumber, type Lang, type MonthlyReportResponse } from '@savdoiq/shared';
import { ah, AppError } from '../lib/errors.js';
import { companyCtx, requireAuth, requireCompany, requireFeature } from '../lib/auth.js';
import { resolveRange, type DateBasis } from '../lib/period.js';
import { env } from '../env.js';
import { getStoreIds } from '../services/common.js';
import {
  buildMonthlyReport,
  collectMonthCompare,
  isMonthKey,
  monthLabel,
  type MonthCompareRow,
} from '../services/monthly-report.js';
import { escapeHtml, sendTelegramDocument, type TelegramSendResult } from '../services/notify.js';
import { loadMonthlyWorkbook } from './export.js';

export type { MonthCompareRow };

const router = Router();
router.use(requireAuth, requireCompany);

// ─────────────────────────── GET /monthly ───────────────────────────

router.get(
  '/monthly',
  requireFeature('monthly_reports'),
  ah(async (req, res) => {
    const { company, plan } = companyCtx(req);
    const range = resolveRange(req, plan);
    const q = req.query as Record<string, string | undefined>;
    const storeIds = await getStoreIds(company.id, range.storeId);

    const payload: MonthlyReportResponse = await buildMonthlyReport({
      companyId: company.id,
      taxRate: company.taxRate,
      plan,
      storeIds,
      range,
      // `?month=YYYY-MM` ustuvor, aks holda umumiy davr filtri ishlaydi
      month: q.month,
    });

    res.json(payload);
  }),
);

// ─────────────────────────── GET /compare — oxirgi 6 oy ───────────────────────────

router.get(
  '/compare',
  requireFeature('monthly_reports'),
  ah(async (req, res) => {
    const { company, plan } = companyCtx(req);
    const range = resolveRange(req, plan);
    const storeIds = await getStoreIds(company.id, range.storeId);
    // Sahifadagi hisobot bilan bitta sana asosida (`?basis=`) — "oldingi oy marjasi" shu jadvaldan olinadi
    const payload: MonthCompareRow[] = await collectMonthCompare(company.id, storeIds, plan, range.storeId, range.basis);
    res.json(payload);
  }),
);

// ─────────────────────────── POST /send-telegram ───────────────────────────

/**
 * Yuborish chegarasi — bitta foydalanuvchiga soatiga 5 ta fayl.
 *
 * Har yuborish butun hisobotni qaytadan yig'adi (bir necha og'ir so'rov) va
 * bot nomidan fayl jo'natadi: tugmani ketma-ket bosish bazani ham, botning
 * Telegram oldidagi chegarasini ham yeb qo'ymasin. Xotirada saqlanadi — API
 * bitta jarayon (deploy/update.sh), qayta ishga tushganda hisob nolga tushadi,
 * bu xavfli emas. Telegram ulanmagan so'rov chegaraga kirmaydi: u hech narsa
 * yubormaydi.
 */
const TG_SEND_LIMIT = 5;
const TG_SEND_WINDOW_MS = 60 * 60_000;
const tgSends = new Map<string, number[]>();

function takeTelegramSlot(userId: string, now = Date.now()): { ok: true; remaining: number } | { ok: false; retryAfterSec: number } {
  // Eskirgan foydalanuvchilar xaritada to'planib qolmasin
  if (tgSends.size > 1000) {
    for (const [id, list] of tgSends) if (list.every((t) => now - t >= TG_SEND_WINDOW_MS)) tgSends.delete(id);
  }
  const recent = (tgSends.get(userId) ?? []).filter((t) => now - t < TG_SEND_WINDOW_MS);
  if (recent.length >= TG_SEND_LIMIT) {
    tgSends.set(userId, recent);
    return { ok: false, retryAfterSec: Math.max(1, Math.ceil((recent[0] + TG_SEND_WINDOW_MS - now) / 1000)) };
  }
  recent.push(now);
  tgSends.set(userId, recent);
  return { ok: true, remaining: TG_SEND_LIMIT - recent.length };
}

/**
 * Davr maydonlari — GET /monthly so'rov qatoridagi bilan bir xil nomlar.
 * `basis` ham shu yerda: tugma ekrandagi hisobotni yuborsin — "Qabul sanasi"
 * tanlangan bo'lsa, fayl ham qabul sanasi bo'yicha (2026-10-27).
 */
const PERIOD_FIELDS = ['month', 'from', 'to', 'preset', 'storeId', 'basis'] as const;

/**
 * Davr so'rov qatorida ham, tanada ham kelishi mumkin (tana ustuvor) — sayt
 * Excel tugmasidagi parametrlarni o'zgarishsiz yuboradi, tashqi chaqiruv esa
 * `{ month: '2026-09' }` tanasi bilan.
 */
function periodQuery(req: Request): Record<string, string> {
  const out: Record<string, string> = {};
  const sources = [req.query as Record<string, unknown>, (req.body ?? {}) as Record<string, unknown>];
  for (const src of sources) {
    for (const key of PERIOD_FIELDS) {
      const v = src[key];
      if (typeof v === 'string' && v.trim()) out[key] = v.trim();
    }
  }
  return out;
}

/**
 * resolveRange faqat `req.query` ni o'qiydi — tanadagi davr ham shu yo'l bilan
 * o'tadi. Asl so'rov o'zgartirilmaydi: `query` yangi obyektning o'z xossasi.
 */
const withQuery = (req: Request, query: Record<string, string>): Request =>
  Object.create(req, { query: { value: query, enumerable: true } }) as Request;

/** Fayl izohi tillari — sayt tili (foydalanuvchining `languageCode`) bo'yicha */
const CAPTION: Record<
  Lang,
  {
    title: string;
    final: string;
    preliminary: string;
    current: string;
    inTransit: string;
    done: (pct: string) => string;
    status: string;
    revenue: string;
    profit: string;
    margin: string;
    /** Qabul sanasi rejimidagi qo'shimcha qator (standart rejimda izoh o'zgarmaydi) */
    receipt: string;
  }
> = {
  uz: {
    title: 'Oylik hisobot',
    final: 'Yakuniy',
    preliminary: 'Oraliq',
    current: 'davr hali tugamagan',
    inTransit: 'buyurtmalarning bir qismi hali yo‘lda',
    done: (v) => `${v} yakunlangan`,
    status: 'Holat',
    revenue: 'Tushum',
    profit: 'Sof foyda',
    margin: 'marja',
    receipt: 'Qabul sanasi bo‘yicha — Uzum hisoboti va to‘lovlari kabi',
  },
  ru: {
    title: 'Месячный отчёт',
    final: 'Итоговый',
    preliminary: 'Предварительный',
    current: 'период ещё не закончился',
    inTransit: 'часть заказов ещё в пути',
    done: (v) => `завершено ${v}`,
    status: 'Статус',
    revenue: 'Выручка',
    profit: 'Чистая прибыль',
    margin: 'маржа',
    receipt: 'По дате получения — как в отчёте и выплатах Uzum',
  },
  en: {
    title: 'Monthly report',
    final: 'Final',
    preliminary: 'Preliminary',
    current: 'the period is not over yet',
    inTransit: 'some orders are still in transit',
    done: (v) => `${v} completed`,
    status: 'Status',
    revenue: 'Revenue',
    profit: 'Net profit',
    margin: 'margin',
    receipt: 'By receipt date — as in Uzum’s report and payouts',
  },
};

const asLang = (v: string | null | undefined): Lang => (v === 'ru' || v === 'en' ? v : 'uz');

/** Davr bitta kalendar oyimi (oy boshidan, o'sha oy ichida tugaydi) — sarlavhada oy nomi chiqadi */
function monthTitle(period: { from: string; to: string }, lang: Lang): string | null {
  const key = period.from.slice(0, 7);
  if (!period.from.endsWith('-01') || period.to.slice(0, 7) !== key) return null;
  if (lang === 'uz') return monthLabel(key);
  const first = new Date(`${key}-01T00:00:00Z`);
  return new Intl.DateTimeFormat(lang === 'ru' ? 'ru-RU' : 'en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(first);
}

const dmy = (iso: string): string => `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}`;

/**
 * Fayl ostidagi izoh: oy, holat va ikki asosiy raqam — fayl ochilmasdan ham ko'rinsin.
 * Qabul sanasi rejimida sana asosi alohida qatorda aytiladi: buxgalter ikki
 * xil "oktabr"ni bir-biri bilan adashtirmasin. Standart rejimda izoh avvalgidek.
 */
function reportCaption(r: MonthlyReportResponse, companyName: string, lang: Lang, basis: DateBasis): string {
  const c = CAPTION[lang];
  const pctText = (v: number) => `${formatNumber(v, lang, 1)}%`;
  const month = monthTitle(r.period, lang);
  const fin = r.finality;
  const why = fin.reason === 'current' ? c.current : fin.reason === 'in_transit' ? c.inTransit : null;
  return [
    `<b>${escapeHtml(month ? `${c.title} — ${month}` : c.title)}</b>`,
    `${escapeHtml(companyName)} · ${dmy(r.period.from)} — ${dmy(r.period.to)}`,
    ...(basis === 'receipt' ? [c.receipt] : []),
    `${c.status}: <b>${fin.status === 'final' ? c.final : c.preliminary}</b>${why ? ` — ${why}` : ''} · ${c.done(pctText(fin.completionPct))}`,
    `${c.revenue}: ${formatMoney(r.revenue, lang)}`,
    `${c.profit}: ${formatMoney(r.netProfit, lang)} · ${c.margin} ${pctText(r.margin)}`,
  ].join('\n');
}

/** Telegram rad etgan sababni sotuvchiga tushunarli xatoga aylantiradi */
function telegramError(result: TelegramSendResult): AppError {
  const reason = (result.description ?? '').toLowerCase();
  // 403 — foydalanuvchi botni bloklagan yoki hisobini o'chirgan
  if (result.status === 403) {
    return new AppError(409, 'telegram_blocked', 'Bot bloklangan — Telegram’da botni oching va /start bosing');
  }
  // Saqlangan chat endi yo'q — sotuvchi botni qaytadan ulashi kerak
  if (result.status === 400 && reason.includes('chat not found')) {
    return new AppError(409, 'telegram_not_linked', 'Avval Sozlamalarda Telegram’ni ulang');
  }
  return new AppError(502, 'telegram_failed', 'Telegram’ga yuborib bo‘lmadi — birozdan keyin qayta urinib ko‘ring');
}

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/**
 * Oylik hisobotni Telegram'ga yuborish — Excel tugmasidagi fayl AYNAN o'zi
 * (routes/export.ts loadMonthlyWorkbook), foydalanuvchining botdagi chatiga.
 * Tarif: Excel eksporti bilan bir xil (monthly_reports + export_excel).
 *
 * Xatolar (sayt kod bo'yicha matnga aylantiradi):
 *   409 telegram_not_linked  — Telegram ulanmagan (botChatId yo'q yoki chat topilmadi)
 *   409 telegram_blocked     — bot bloklangan
 *   429 too_many_requests    — soatlik chegara (Retry-After sarlavhasi bilan)
 *   502 telegram_failed      — Telegram javob bermadi
 *   503 telegram_unavailable — serverda bot sozlanmagan
 */
router.post(
  '/send-telegram',
  requireFeature('monthly_reports'),
  requireFeature('export_excel'),
  ah(async (req, res) => {
    const { user, company, plan } = companyCtx(req);
    const query = periodQuery(req);
    if (query.month !== undefined && !isMonthKey(query.month)) {
      throw AppError.badRequest('Oy YYYY-MM ko‘rinishida bo‘lishi kerak (masalan, 2026-09)');
    }

    // Sozlamalardagi "Bot ulangan" belgisi bilan bitta qoida (notifications.ts telegramConnected)
    const chatId = user.botChatId;
    if (!chatId) throw new AppError(409, 'telegram_not_linked', 'Avval Sozlamalarda Telegram’ni ulang');
    if (!env.telegram.botToken) {
      throw new AppError(503, 'telegram_unavailable', 'Telegram bot hozircha ulanmagan — keyinroq urinib ko‘ring');
    }

    const slot = takeTelegramSlot(user.id);
    if (!slot.ok) {
      res.setHeader('Retry-After', String(slot.retryAfterSec));
      throw new AppError(
        429,
        'too_many_requests',
        `Soatiga ${TG_SEND_LIMIT} martagacha yuborish mumkin — ${Math.ceil(slot.retryAfterSec / 60)} daqiqadan keyin qayta urinib ko‘ring`,
        { retryAfterSec: slot.retryAfterSec, limit: TG_SEND_LIMIT },
      );
    }

    // `basis` ham shu davr qatoridan (PERIOD_FIELDS) — Excel tugmasi va sahifa bilan bitta qoida
    const range = resolveRange(withQuery(req, query), plan);
    const { report, workbook, fileName } = await loadMonthlyWorkbook({
      company,
      plan,
      range,
      month: query.month,
    });
    const buffer = Buffer.from((await workbook.xlsx.writeBuffer()) as ArrayBuffer);

    const sent = await sendTelegramDocument(
      chatId,
      { fileName, data: buffer, contentType: XLSX_MIME },
      { caption: reportCaption(report, company.name, asLang(user.languageCode), range.basis) },
    );
    if (!sent.ok) throw telegramError(sent);

    res.json({
      ok: true,
      fileName,
      period: report.period,
      finality: report.finality.status,
      // Shu soatda yana nechta yuborish mumkin
      remaining: slot.remaining,
    });
  }),
);

export default router;
