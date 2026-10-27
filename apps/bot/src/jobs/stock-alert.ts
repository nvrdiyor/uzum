/**
 * Qoldiq va pullik saqlash ogohlantirishi — har kuni soat 10:00 (Asia/Tashkent)
 * `notifyStock` yoqilgan foydalanuvchilarga BITTA qisqa xabar:
 *   • pullik saqlashga o'tgan SKU'lar (kecha bepul yoki omborda yo'q edi,
 *     bugun pullik) — kunlik to'lov va nechta dona ortiqcha bilan;
 *   • "tez orada pullik" — aylanma 45–60 kun: pullik bo'lsa kuniga qancha;
 *   • yaqin kunlarda tugaydigan SKU'lar.
 * Aytadigan narsa bo'lmasa xabar YUBORILMAYDI. Ilgari `notifyStock` sozlamasi
 * botda ham, saytda ham bor edi, lekin unga hech narsa yuborilmasdi.
 *
 * AYLANMA VA TARIF — apps/api/src/services/storage-turnover.ts bilan AYNAN bir
 * xil qoida: tugagan 15 savdo kuni, faqat FBO qoldig'i, ilovadagi "sotilgan"
 * ta'rifi (bekor va qaytarilganlarsiz), do'kon ulanganidan keyin paydo bo'lgan
 * SKU'gagina yangi SKU bepul davri, tariffs.ts funksiyalari. Sayt va bot bir
 * xil raqam ko'rsatishi shart. Bot API paketini import qila olmaydi (alohida
 * workspace), shuning uchun ma'lumot yig'ish shu yerda takrorlangan — u
 * yerda qoida o'zgarsa, bu yerda ham o'zgartiring.
 *
 * "PULLIK BO'LDI" — kechagi holat xuddi shu ma'lumotdan qayta hisoblanadi
 * (holat hech qayerda saqlanmaydi): bot qayta ishga tushsa ham, bir kun
 * o'tkazib yuborilsa ham natija to'g'ri.
 *
 * TUGASH — Rejalashtiruvchining (apps/api/src/services/plan.ts buildRow)
 * "kritik" qoidasi, soddalashtirilgan: tezlik = oxirgi 30 kundagi sotuv ÷
 * tovar SOTUVDA BO'LGAN kunlar (kamida 7; services/demand.ts g'oyasi — tugab
 * turgan kunlar tezlikni pasaytirmasin), ta'minot = jami qoldiq (FBO + FBS +
 * o'z ombori) + Uzum omboriga yo'ldagi yetkazma. Ta'minot KOMPANIYANING
 * yetkazish muddatidan (CompanySetting 'planner.leadDays', standart 7 kun)
 * oldin tugasa — tugayapti: bugun buyurtma berilsa ham tovar kelguncha
 * tugaydi, Rejalashtiruvchidagi "Kritik" aynan shu. Kunlar — Toshkent savdo
 * kuni bo'yicha.
 *
 * Ilgari chegara qat'iy 7 kun (STOCK_THRESHOLDS.critical) edi: sotuvchi
 * Rejalashtiruvchida yetkazishni 14 kun qilib saqlasa ham bot 7 kun bilan
 * hisoblardi — sayt "Kritik" degan SKU haqida bot jim turardi (2026-10-24).
 * Bot API paketini import qila olmaydi, shuning uchun sozlama o'qish ham shu
 * yerda takrorlangan (`readLeadDays`); API'da qoida o'zgarsa — bu yerda ham.
 */
import { InlineKeyboard, type Bot } from 'grammy';
import {
  FREE_TURNOVER_DAYS,
  NEW_AFTER_CONNECT_MS,
  NEW_SKU_FREE_DAYS,
  TURNOVER_WINDOW_DAYS,
  addDays,
  billableLiters,
  businessDayStart,
  daysBetween,
  formatMoney,
  formatNumber,
  hasExtendedNewSkuFree,
  hasFeature,
  parseISODate,
  resolvePlan,
  round,
  skuSaleAge,
  storageFeePerDay,
  storageTariffKind,
  toBusinessDate,
  toISODate,
  turnoverDays,
} from '@savdoiq/shared';
import { prisma } from '../lib/db.js';
import { toBotLang, tr, type BotLang } from '../i18n.js';
import { clampMessage, cut, escapeHtml, sleep, webLink, type BotContext } from '../handlers/context.js';
import { displayDate, getStoreIds, localDateKey, localHour } from '../handlers/data.js';

/** Har daqiqada tekshiramiz — kerakli soat kelganida bir marta ishlaydi */
const CHECK_INTERVAL_MS = 60_000;
/** Yuborishlar orasidagi pauza (Telegram limiti) */
const SEND_DELAY_MS = 60;
/** Takrorlanishni oldini oluvchi belgi (AuditLog) */
const AUDIT_ACTION = 'bot.stock_alert';
/**
 * Yuborish soati (mahalliy). Kunlik hisobotdan (09:00) keyin va alohida:
 * ular ikki xil sozlama, bittasini o'chirgan sotuvchi ikkinchisini oladi.
 */
export const STOCK_ALERT_HOUR = 10;

/** API: services/storage-turnover.ts NEAR_TURNOVER_DAYS bilan bir xil */
const NEAR_TURNOVER_DAYS = 45;
/** Oynadan oldingi oxirgi qoldiq shu chuqurlikda qidiriladi (API bilan bir xil) */
const SEED_LOOKBACK_DAYS = 30;
/** Tugash tezligi oynasi va eng kichik bo'luvchi (services/demand.ts) */
const DEMAND_DAYS = 30;
const MIN_DEMAND_DAYS = 7;
/**
 * Yetkazish muddati — API services/plan.ts dagi kalit, oraliq va standart
 * qiymat bilan bir xil (PLANNER_SETTING_KEYS.leadDays, LEAD_MIN/LEAD_MAX,
 * DEFAULT_LEAD).
 */
const LEAD_SETTING_KEY = 'planner.leadDays';
const LEAD_MIN = 0;
const LEAD_MAX = 120;
const DEFAULT_LEAD = 7;
/** Har bo'limda ko'rsatiladigan qatorlar — xabar qisqa qolsin */
const LIST_LIMIT = 5;
const IN_CHUNK = 500;
const EPS = 1e-6;

type TurnoverStatus = 'free' | 'near' | 'paid' | 'new_free' | 'no_volume';

export interface PaidAlertRow {
  title: string;
  /** null — 15 kunda sotuv yo'q */
  turnover: number | null;
  feePerDay: number;
  excess: number;
}

export interface NearAlertRow {
  title: string;
  turnover: number;
  /** Birinchi pullik guruhga (61 kun) o'tsa kunlik to'lov; hajm noma'lum bo'lsa null */
  feeIfPaid: number | null;
}

export interface OutAlertRow {
  title: string;
  stock: number;
  daysLeft: number;
}

export interface StockAlertData {
  /** Toshkent kuni */
  date: string;
  /** Hozir pullik saqlashdagi barcha SKU'lar (xulosa satri uchun) */
  paid: { count: number; feePerDay: number; noVolume: number };
  newlyPaid: { rows: PaidAlertRow[]; total: number };
  near: { rows: NearAlertRow[]; total: number };
  /** Qoldig'i bor, lekin kompaniyaning yetkazish muddati ichida tugaydi (Rejalashtiruvchidagi "Kritik") */
  runningOut: { rows: OutAlertRow[]; total: number };
  /** Qoldig'i allaqachon tugagan (sotuvi bor edi) — faqat soni, xabar sababi emas */
  outOfStock: number;
  /**
   * "Tugayapti" qaysi yetkazish muddati bilan hisoblangani (`readLeadDays`) —
   * xabarda aytiladi. Ilgari aytilmasdi: sotuvchi Rejalashtiruvchida 14 kun
   * saqlagan bo'lsa ham, "3 kunga yetadi" degan SKU nega ro'yxatda ekanini
   * (7 kunlik standart bo'yicha emas, 14 kun bo'yicha) xabardan bilib
   * bo'lmasdi (2026-10-24).
   */
  leadDays: number;
}

interface StockAlertStats {
  sent: number;
  /** Aytadigan narsa yo'q — xabar yuborilmadi */
  empty: number;
  skipped: number;
  failed: number;
}

interface DaySnap {
  fbo: number;
  /** FBO + FBS + o'z ombori */
  total: number;
}

const mean = (xs: number[]): number => xs.reduce((s, x) => s + x, 0) / xs.length;

/**
 * Kompaniyaning yetkazish muddati (kun) — API getPlannerSettings / parseLead
 * bilan AYNAN bir xil o'qish: butun songa yaxlitlanadi, 0..120 oraliqqa
 * tortiladi; yo'q, bo'sh yoki buzilgan bo'lsa (masalan, umumiy PUT
 * /company/settings orqali "abc" yozilgan) — 7 kun.
 *
 * Zaxira davri ('planner.coverDays') ATAYLAB o'qilmaydi: u faqat sotib olish
 * MIQDORINI o'zgartiradi, "tugayapti" qoidasi esa faqat yetkazish muddatiga
 * bog'liq — bot miqdor aytmaydi, uni Rejalashtiruvchi ko'rsatadi.
 */
export async function readLeadDays(companyId: string): Promise<number> {
  const row = await prisma.companySetting.findUnique({
    where: { companyId_key: { companyId, key: LEAD_SETTING_KEY } },
    select: { value: true },
  });
  const raw = row?.value;
  if (raw === undefined || raw.trim() === '') return DEFAULT_LEAD;
  const n = Math.round(Number(raw));
  if (!Number.isFinite(n)) return DEFAULT_LEAD;
  return Math.min(LEAD_MAX, Math.max(LEAD_MIN, n));
}

const dayKeys = (from: Date, count: number): string[] =>
  Array.from({ length: count }, (_, i) => toISODate(addDays(from, i)));

/**
 * Bir SKU holati — API `analyzeTurnover` ning bugungi (k = 0) qismi bilan
 * AYNAN bir xil: bepul davr faqat yoshi aniq SKU'ga, hajm noma'lum bo'lsa summa yo'q.
 */
function turnoverState(inp: {
  stock: number;
  history: number[];
  sold: number;
  volumeL: number;
  category: string | null;
  daysOnSale: number;
  ageKnown: boolean;
}): { status: TurnoverStatus; turnover: number; fee: number; feeIfPaid: number | null; excess: number } {
  const kind = storageTariffKind(inp.category);
  const extended = hasExtendedNewSkuFree(inp.category);
  const freeDays = extended ? NEW_SKU_FREE_DAYS.extended : NEW_SKU_FREE_DAYS.default;
  const liters = billableLiters(inp.volumeL);
  const avgDaily = inp.sold / TURNOVER_WINDOW_DAYS;
  const avgStock = inp.history.length > 0 ? mean(inp.history) : inp.stock;
  const turnover = turnoverDays(avgStock, avgDaily);

  let status: TurnoverStatus;
  if (inp.ageKnown && inp.daysOnSale < freeDays) status = 'new_free';
  else if (turnover <= FREE_TURNOVER_DAYS) status = turnover >= NEAR_TURNOVER_DAYS ? 'near' : 'free';
  else status = liters > 0 ? 'paid' : 'no_volume';

  const fee =
    status === 'paid'
      ? round(
          storageFeePerDay({
            units: inp.stock,
            volumeL: inp.volumeL,
            turnover,
            kind,
            daysOnSale: inp.ageKnown ? inp.daysOnSale : null,
            extendedNewSkuFree: extended,
          }),
        )
      : 0;
  const feeIfPaid =
    liters > 0
      ? round(storageFeePerDay({ units: inp.stock, volumeL: inp.volumeL, turnover: FREE_TURNOVER_DAYS + 1, kind }))
      : null;

  return {
    status,
    turnover,
    fee,
    feeIfPaid,
    excess: Math.max(0, Math.ceil(inp.stock - FREE_TURNOVER_DAYS * avgDaily - EPS)),
  };
}

/**
 * Kompaniya bo'yicha ogohlantirish ma'lumoti. `sections` — tarifda ochiq
 * bo'limlar: pullik saqlash (`paid_storage`) va qoldiqlar (`stocks_fbo_fbs`).
 * Bo'sh natija — xabar kerak emas.
 */
export async function buildStockAlert(
  companyId: string,
  now = new Date(),
  sections: { storage: boolean; stock: boolean } = { storage: true, stock: true },
): Promise<StockAlertData> {
  const todayKey = toBusinessDate(now);
  const today = parseISODate(todayKey);
  const yesterdayKey = toISODate(addDays(today, -1));

  const out: StockAlertData = {
    date: todayKey,
    paid: { count: 0, feePerDay: 0, noVolume: 0 },
    newlyPaid: { rows: [], total: 0 },
    near: { rows: [], total: 0 },
    runningOut: { rows: [], total: 0 },
    outOfStock: 0,
    leadDays: DEFAULT_LEAD,
  };
  if (!sections.storage && !sections.stock) return out;
  const storeIds = await getStoreIds(companyId);
  if (storeIds.length === 0) return out;

  // Qoldiq: kechagi oynadan 30 kun oldingacha (kechagi holatni ham qayta hisoblash uchun)
  const snapFrom = addDays(today, -(1 + TURNOVER_WINDOW_DAYS + SEED_LOOKBACK_DAYS));
  // Sotuv: tugash tezligi oynasi (30 kun) ham, kechagi aylanma oynasi ham sig'adi
  const ordersFromKey = toISODate(addDays(today, -Math.max(DEMAND_DAYS - 1, TURNOVER_WINDOW_DAYS + 1)));

  const [skus, snaps, items, inboundItems] = await Promise.all([
    // API getSkuCatalog(storeIds, true) bilan bir xil to'plam: arxiv ham (omborda tursa to'lov olinadi)
    prisma.sku.findMany({
      where: { storeId: { in: storeIds }, NOT: { archived: true, product: { hidden: true } } },
      select: {
        id: true,
        storeId: true,
        sku: true,
        title: true,
        volumeL: true,
        createdAt: true,
        archived: true,
        product: { select: { title: true, category: true } },
      },
    }),
    prisma.stockSnapshot.findMany({
      where: { storeId: { in: storeIds }, date: { gte: snapFrom, lte: today } },
      select: { skuId: true, storeId: true, date: true, fbo: true, fbs: true, own: true },
      orderBy: { date: 'asc' },
    }),
    prisma.orderItem.findMany({
      where: {
        orderedAt: { gte: businessDayStart(ordersFromKey) },
        order: { storeId: { in: storeIds } },
        skuId: { not: null },
      },
      select: { skuId: true, qty: true, status: true, returnedAt: true, orderedAt: true },
    }),
    // Rejalashtiruvchi getInbound: jo'natilgan, hali qabul qilinmagan dona
    sections.stock
      ? prisma.shipmentItem.findMany({
          where: { shipment: { companyId, status: 'in_transit' }, sku: { storeId: { in: storeIds } } },
          select: { skuId: true, qty: true, accepted: true, shipment: { select: { source: true } } },
        })
      : Promise.resolve([]),
  ]);
  // "Tugayapti" chegarasi — kompaniyaning yetkazish muddati (Rejalashtiruvchi sozlamasi), qat'iy 7 kun emas
  const leadDays = sections.stock ? await readLeadDays(companyId) : DEFAULT_LEAD;
  out.leadDays = leadDays;

  // ── Qoldiq: SKU → kun → {fbo, jami}; do'kon → kuzatilgan kunlar (o'sish tartibida) ──
  const snapBySku = new Map<string, Map<string, DaySnap>>();
  const storeDays = new Map<string, string[]>();
  for (const s of snaps) {
    const key = toISODate(s.date);
    const m = snapBySku.get(s.skuId) ?? new Map<string, DaySnap>();
    m.set(key, { fbo: s.fbo, total: s.fbo + s.fbs + s.own });
    snapBySku.set(s.skuId, m);
    const days = storeDays.get(s.storeId) ?? [];
    if (days[days.length - 1] !== key) days.push(key);
    storeDays.set(s.storeId, days);
  }

  // ── Sotuv kunlar bo'yicha; buyurtma tushgan kunlar (bekor qilingani ham — tovar bor edi) ──
  const soldByDay = new Map<string, Map<string, number>>();
  const orderedDays = new Map<string, Set<string>>();
  for (const it of items) {
    if (!it.skuId) continue;
    const day = toBusinessDate(it.orderedAt);
    const seen = orderedDays.get(it.skuId) ?? new Set<string>();
    seen.add(day);
    orderedDays.set(it.skuId, seen);
    const returned = it.status === 'returned' || Boolean(it.returnedAt);
    if (returned || it.status === 'canceled') continue;
    const m = soldByDay.get(it.skuId) ?? new Map<string, number>();
    m.set(day, (m.get(day) ?? 0) + it.qty);
    soldByDay.set(it.skuId, m);
  }

  const titleOf = (s: (typeof skus)[number]): string => s.title || s.product.title || s.sku;

  if (sections.storage) {
    // ── Yangi SKU yoshi: do'konning birinchi katalog importidan keyin paydo bo'lganlar ──
    const catalogStart = new Map<string, number>();
    for (const s of skus) {
      const at = s.createdAt.getTime();
      const cur = catalogStart.get(s.storeId);
      if (cur === undefined || at < cur) catalogStart.set(s.storeId, at);
    }
    const isCandidate = (s: (typeof skus)[number]): boolean => {
      const start = catalogStart.get(s.storeId);
      return start !== undefined && s.createdAt.getTime() - start > NEW_AFTER_CONNECT_MS;
    };
    /*
     * Ulanganda qoldig'i NOL bo'lib, qoldiq keyin kelgan SKU — o'sha kuni
     * sotuvga chiqqan (shared skuSaleAge, 2-holat). So'rov API'dagi
     * `loadStockFirsts` bilan bir xil: birinchi qoldiq yozuvi va FBO/FBS > 0
     * bo'lgan birinchi kun.
     */
    const stockFirsts = new Map<string, { firstSeen: Date; firstOnSale?: Date }>();
    const plain = skus.filter((s) => !isCandidate(s)).map((s) => s.id);
    for (let i = 0; i < plain.length; i += IN_CHUNK) {
      const chunk = plain.slice(i, i + IN_CHUNK);
      const [seen, onSale] = await Promise.all([
        prisma.stockSnapshot.groupBy({ by: ['skuId'], where: { skuId: { in: chunk } }, _min: { date: true } }),
        prisma.stockSnapshot.groupBy({
          by: ['skuId'],
          where: { skuId: { in: chunk }, OR: [{ fbo: { gt: 0 } }, { fbs: { gt: 0 } }] },
          _min: { date: true },
        }),
      ]);
      const firstOnSale = new Map(onSale.map((r) => [r.skuId, r._min.date ?? undefined]));
      for (const r of seen) {
        if (r._min.date) stockFirsts.set(r.skuId, { firstSeen: r._min.date, firstOnSale: firstOnSale.get(r.skuId) });
      }
    }
    const arrivedLater = (id: string): boolean => {
      const st = stockFirsts.get(id);
      return Boolean(st?.firstOnSale && st.firstOnSale.getTime() > st.firstSeen.getTime());
    };

    const candidates = skus.filter((s) => isCandidate(s) || arrivedLater(s.id)).map((s) => s.id);
    const firstOrder = new Map<string, Date>();
    for (let i = 0; i < candidates.length; i += IN_CHUNK) {
      const rows = await prisma.orderItem.groupBy({
        by: ['skuId'],
        where: { skuId: { in: candidates.slice(i, i + IN_CHUNK) } },
        _min: { orderedAt: true },
      });
      for (const r of rows) {
        if (r.skuId && r._min.orderedAt) firstOrder.set(r.skuId, r._min.orderedAt);
      }
    }

    /** SKU holati berilgan kun (bugun yoki kecha) bo'yicha; Uzum omborida qoldiq bo'lmasa null */
    const stateAt = (s: (typeof skus)[number], asOfKey: string) => {
      const m = snapBySku.get(s.id);
      if (!m) return null;
      const asOf = parseISODate(asOfKey);
      const windowFrom = addDays(asOf, -TURNOVER_WINDOW_DAYS);
      const keys = dayKeys(windowFrom, TURNOVER_WINDOW_DAYS);
      const fromKey = keys[0] as string;
      const seedFromKey = toISODate(addDays(windowFrom, -SEED_LOOKBACK_DAYS));

      // Oynadan oldingi oxirgi qoldiq va shu kungi yozuv (Map — sana tartibida)
      let seed: number | null = null;
      let onDay: number | null = null;
      for (const [k, v] of m) {
        if (k >= seedFromKey && k < fromKey) seed = v.fbo;
        else if (k === asOfKey) onDay = v.fbo;
      }
      // Do'kon qachondan kuzatiladi — API'dagi kabi o'sha oraliqdagi birinchi yozuv
      const observedFrom = (storeDays.get(s.storeId) ?? []).find((k) => k >= seedFromKey && k <= asOfKey);

      let have: number | null = seed;
      const history: number[] = [];
      for (const k of keys) {
        const v = m.get(k);
        if (v !== undefined) have = v.fbo;
        if (have !== null) history.push(have);
        else if (observedFrom !== undefined && k >= observedFrom) history.push(0);
      }
      const stock = onDay ?? have ?? 0;
      if (stock <= 0) return null;

      const sales = soldByDay.get(s.id);
      let sold = 0;
      if (sales) for (const k of keys) sold += sales.get(k) ?? 0;

      // Yosh — API bilan BITTA qoida (shared skuSaleAge)
      const age = skuSaleAge({
        createdAt: s.createdAt,
        storeCatalogStart: catalogStart.get(s.storeId),
        firstOrder: firstOrder.get(s.id),
        stock: stockFirsts.get(s.id),
        todayKey: asOfKey,
      });

      return turnoverState({
        stock,
        history,
        sold,
        volumeL: s.volumeL,
        category: s.product.category,
        daysOnSale: age.daysOnSale,
        ageKnown: age.ageKnown,
      });
    };

    const newly: PaidAlertRow[] = [];
    const near: NearAlertRow[] = [];
    for (const s of skus) {
      const now0 = stateAt(s, todayKey);
      if (!now0) continue;
      if (now0.status === 'paid' || now0.status === 'no_volume') {
        out.paid.count += 1;
        out.paid.feePerDay += now0.fee;
        if (now0.status === 'no_volume') out.paid.noVolume += 1;
      }
      if (now0.status === 'paid') {
        const before = stateAt(s, yesterdayKey);
        // Kecha omborda yo'q edi yoki bepul edi — bugun pullik bo'ldi
        if (!before || (before.status !== 'paid' && before.status !== 'no_volume')) {
          newly.push({
            title: titleOf(s),
            turnover: Number.isFinite(now0.turnover) ? now0.turnover : null,
            feePerDay: now0.fee,
            excess: now0.excess,
          });
        }
      } else if (now0.status === 'near') {
        near.push({ title: titleOf(s), turnover: now0.turnover, feeIfPaid: now0.feeIfPaid });
      }
    }
    // Eng qimmati birinchi
    newly.sort((a, b) => b.feePerDay - a.feePerDay);
    // Chegaraga eng yaqini (aylanmasi uzunrog'i) birinchi
    near.sort((a, b) => b.turnover - a.turnover || (b.feeIfPaid ?? 0) - (a.feeIfPaid ?? 0));
    out.newlyPaid = { rows: newly.slice(0, LIST_LIMIT), total: newly.length };
    out.near = { rows: near.slice(0, LIST_LIMIT), total: near.length };
    out.paid.feePerDay = round(out.paid.feePerDay);
  }

  if (sections.stock) {
    const inbound = new Map<string, number>();
    {
      const bySource = new Map<string, { uzum: number; manual: number }>();
      for (const it of inboundItems) {
        const left = Math.max(0, it.qty - it.accepted);
        if (left <= 0) continue;
        const cur = bySource.get(it.skuId) ?? { uzum: 0, manual: 0 };
        if (it.shipment.source === 'uzum') cur.uzum += left;
        else cur.manual += left;
        bySource.set(it.skuId, cur);
      }
      // Qo'lda yaratilgan yetkazma va Uzum nakladnoyi bitta yukning ikki yozuvi bo'lishi mumkin — kattasi
      for (const [skuId, v] of bySource) inbound.set(skuId, Math.max(v.uzum, v.manual));
    }

    const demandKeys = dayKeys(addDays(today, -(DEMAND_DAYS - 1)), DEMAND_DAYS);
    const firstDemandKey = demandKeys[0] as string;
    const ending: (OutAlertRow & { exact: number })[] = [];
    for (const s of skus) {
      // Rejalashtiruvchi arxivdagi SKU'ni ko'rsatmaydi — bu yerda ham
      if (s.archived) continue;
      const sales = soldByDay.get(s.id);
      let units = 0;
      if (sales) for (const k of demandKeys) units += sales.get(k) ?? 0;
      if (units <= 0) continue;
      const m = snapBySku.get(s.id);
      if (!m) continue; // qoldiq ma'lumoti yo'q — ogohlantirmaymiz

      // Sotuvda bo'lgan kunlar: qoldiq bor (oldingi ma'lum holat davom etadi) yoki buyurtma tushgan
      let have: boolean | null = null;
      let latest: number | null = null;
      for (const [k, v] of m) {
        if (k < firstDemandKey) have = v.total > 0;
        latest = v.total;
      }
      const ordered = orderedDays.get(s.id);
      let inStockDays = 0;
      for (const k of demandKeys) {
        const v = m.get(k);
        if (v !== undefined) have = v.total > 0;
        if (ordered?.has(k) || have === true) inStockDays += 1;
      }
      if (latest === null) continue;
      const rate = units / Math.max(MIN_DEMAND_DAYS, inStockDays);
      const supply = latest + (inbound.get(s.id) ?? 0);
      const exact = supply / rate;
      // Rejalashtiruvchidagi "Kritik": tovar yetkazish muddatidan oldin tugaydi (services/plan.ts: daysExact <= lead)
      if (exact > leadDays) continue;
      /*
       * Allaqachon tugagani alohida sanaladi. Ilgari ular ro'yxat boshiga
       * chiqib, hali buyurtma berib ulgursa bo'ladigan "3 kunga yetadi"
       * qatorlarini beshlikdan siqib chiqarardi.
       */
      if (latest <= 0) {
        out.outOfStock += 1;
        continue;
      }
      ending.push({ title: titleOf(s), stock: latest, daysLeft: Math.floor(exact), exact });
    }
    ending.sort((a, b) => a.exact - b.exact || a.stock - b.stock);
    out.runningOut = {
      rows: ending.slice(0, LIST_LIMIT).map(({ exact: _exact, ...r }) => r),
      total: ending.length,
    };
  }

  return out;
}

/** Ro'yxat oxiridagi "… va yana N ta" */
function moreLine(lang: BotLang, total: number, shown: number): string[] {
  return total > shown ? [tr(lang, 'stock_alert_more', { count: formatNumber(total - shown, lang) })] : [];
}

/**
 * Xabar matni (HTML). Aytadigan narsa bo'lmasa — null: na pullik bo'lgan,
 * na chegaraga yaqin, na tugayotgan SKU. Allaqachon pullik va allaqachon
 * tugagan SKU'lar o'zi xabar sababi EMAS (har kuni bir xil gap takrorlanardi,
 * qoldiqsiz SKU'ni kunlik hisobot ham ko'rsatadi) — boshqa sabab bilan xabar
 * ketganda xulosa satrlarida ko'rinadi.
 */
export function stockAlertText(lang: BotLang, data: StockAlertData): string | null {
  if (data.newlyPaid.total === 0 && data.near.total === 0 && data.runningOut.total === 0) return null;
  const money = (v: number): string => formatMoney(v, lang);
  const title = (v: string): string => escapeHtml(cut(v));
  const blocks: string[] = [tr(lang, 'stock_alert_title', { date: displayDate(data.date) })];

  if (data.newlyPaid.total > 0) {
    const lines = [tr(lang, 'stock_alert_paid_head', { count: formatNumber(data.newlyPaid.total, lang) })];
    for (const r of data.newlyPaid.rows) {
      lines.push(
        r.turnover === null
          ? tr(lang, 'stock_alert_paid_row_nosales', { title: title(r.title), fee: money(r.feePerDay) })
          : tr(lang, 'stock_alert_paid_row', {
              title: title(r.title),
              turnover: formatNumber(r.turnover, lang),
              fee: money(r.feePerDay),
            }),
      );
      if (r.excess > 0) lines.push(tr(lang, 'stock_alert_excess', { n: formatNumber(r.excess, lang) }));
    }
    lines.push(...moreLine(lang, data.newlyPaid.total, data.newlyPaid.rows.length));
    blocks.push(lines.join('\n'));
  }

  if (data.near.total > 0) {
    const lines = [
      tr(lang, 'stock_alert_near_head', {
        count: formatNumber(data.near.total, lang),
        from: NEAR_TURNOVER_DAYS,
        to: FREE_TURNOVER_DAYS,
      }),
    ];
    for (const r of data.near.rows) {
      lines.push(
        r.feeIfPaid === null
          ? tr(lang, 'stock_alert_near_row_novol', { title: title(r.title), turnover: formatNumber(r.turnover, lang) })
          : tr(lang, 'stock_alert_near_row', {
              title: title(r.title),
              turnover: formatNumber(r.turnover, lang),
              fee: money(r.feeIfPaid),
            }),
      );
    }
    lines.push(...moreLine(lang, data.near.total, data.near.rows.length));
    blocks.push(lines.join('\n'));
  }

  if (data.runningOut.total > 0) {
    // Qaysi yetkazish muddati bilan — Rejalashtiruvchidagi "Kritik" bilan solishtirib bo'lsin
    const lines = [
      tr(lang, 'stock_alert_out_head', {
        count: formatNumber(data.runningOut.total, lang),
        lead: formatNumber(data.leadDays, lang),
      }),
    ];
    for (const r of data.runningOut.rows) {
      lines.push(
        tr(lang, 'stock_alert_out_row', {
          title: title(r.title),
          stock: formatNumber(r.stock, lang),
          // Bir kundan kam qolgan bo'lsa ham "~0 kunga" emas — "~1 kunga"
          days: formatNumber(Math.max(1, r.daysLeft), lang),
        }),
      );
    }
    lines.push(...moreLine(lang, data.runningOut.total, data.runningOut.rows.length));
    blocks.push(lines.join('\n'));
  }

  // Xulosa satrlari — o'zi xabar sababi emas
  const summary: string[] = [];
  if (data.outOfStock > 0) {
    summary.push(tr(lang, 'stock_alert_out_zero', { count: formatNumber(data.outOfStock, lang) }));
  }
  if (data.paid.count > 0) {
    summary.push(
      tr(lang, 'stock_alert_total', { count: formatNumber(data.paid.count, lang), fee: money(data.paid.feePerDay) }) +
        (data.paid.noVolume > 0 ? tr(lang, 'stock_alert_total_novol', { n: formatNumber(data.paid.noVolume, lang) }) : ''),
    );
  }
  if (summary.length > 0) blocks.push(summary.join('\n'));

  return clampMessage(blocks.join('\n\n'));
}

/** Xabar ostidagi tugmalar: pullik saqlash va rejalashtiruvchi sahifalari */
function alertKeyboard(lang: BotLang): InlineKeyboard {
  return new InlineKeyboard()
    .url(tr(lang, 'btn_storage'), webLink('/storage'))
    .url(tr(lang, 'btn_planner'), webLink('/planner'));
}

/**
 * Ogohlantirishni barcha mos foydalanuvchilarga yuboradi (jobs/daily.ts
 * naqshi): faol, botga ulangan, `notifyStock` yoqilgan; birinchi kompaniyasi
 * Uzum kabinetiga ulangan va tarifida Telegram bildirishnomalari ochiq.
 * Bir kompaniya uchun hisob bir marta (keshlanadi).
 */
export async function runStockAlerts(bot: Bot<BotContext>, now = new Date()): Promise<StockAlertStats> {
  const stats: StockAlertStats = { sent: 0, empty: 0, skipped: 0, failed: 0 };

  const users = await prisma.user.findMany({
    where: { notifyStock: true, status: 'active', botChatId: { not: null } },
    select: {
      id: true,
      botChatId: true,
      languageCode: true,
      memberships: { select: { companyId: true }, orderBy: { createdAt: 'asc' }, take: 1 },
    },
  });
  if (users.length === 0) return stats;

  const companyIds = [...new Set(users.flatMap((u) => u.memberships.map((m) => m.companyId)))];
  if (companyIds.length === 0) return stats;

  const [accounts, subs] = await Promise.all([
    prisma.uzumAccount.findMany({ where: { companyId: { in: companyIds } }, select: { companyId: true } }),
    prisma.subscription.findMany({
      where: { companyId: { in: companyIds } },
      select: { companyId: true, plan: true, status: true, expiresAt: true, canceledAt: true },
    }),
  ]);
  const connected = new Set(accounts.map((a) => a.companyId));
  const subByCompany = new Map(subs.map((s) => [s.companyId, s]));
  const cache = new Map<string, StockAlertData>();

  for (const user of users) {
    const companyId = user.memberships[0]?.companyId;
    const chatId = user.botChatId;
    if (!companyId || !chatId || !connected.has(companyId)) {
      stats.skipped += 1;
      continue;
    }

    // Tarif — sayt va API bilan bir xil qoida; muddati tugaganga raqam yuborilmaydi
    // (to'lov taklifini kunlik hisobot yuboradi — bu yerda takrorlanmaydi)
    const plan = resolvePlan(subByCompany.get(companyId) ?? null, now.getTime());
    if (!hasFeature(plan, 'telegram_notifications')) {
      stats.skipped += 1;
      continue;
    }

    let data = cache.get(companyId);
    if (!data) {
      data = await buildStockAlert(companyId, now, {
        storage: hasFeature(plan, 'paid_storage'),
        stock: hasFeature(plan, 'stocks_fbo_fbs'),
      });
      cache.set(companyId, data);
    }

    const lang = toBotLang(user.languageCode);
    const text = stockAlertText(lang, data);
    if (!text) {
      stats.empty += 1;
      continue;
    }

    try {
      await bot.api.sendMessage(chatId, text, {
        parse_mode: 'HTML',
        link_preview_options: { is_disabled: true },
        reply_markup: alertKeyboard(lang),
      });
      stats.sent += 1;
    } catch {
      // Foydalanuvchi botni bloklagan bo'lishi mumkin — jarayon to'xtamaydi
      stats.failed += 1;
    }
    await sleep(SEND_DELAY_MS);
  }

  return stats;
}

/** Xotiradagi belgi — bazaga ortiqcha so'rov bo'lmasligi uchun */
let lastRunDay: string | null = null;
/**
 * Yuborish davom etayotgan payt. Ko'p foydalanuvchida bitta yugurish bir
 * daqiqadan uzoq cho'zilishi mumkin — keyingi tekshiruv uni qayta boshlab,
 * xabarni ikki marta yubormasin.
 */
let running = false;

async function alreadySent(dayKey: string): Promise<boolean> {
  const row = await prisma.auditLog.findFirst({
    where: { action: AUDIT_ACTION, entityId: dayKey },
    select: { id: true },
  });
  return Boolean(row);
}

async function tick(bot: Bot<BotContext>): Promise<void> {
  const now = new Date();
  if (running || localHour(now) < STOCK_ALERT_HOUR) return;

  const dayKey = localDateKey(now);
  if (lastRunDay === dayKey) return;

  running = true;
  try {
    if (await alreadySent(dayKey)) {
      lastRunDay = dayKey;
      return;
    }

    const stats = await runStockAlerts(bot, now);
    lastRunDay = dayKey;

    await prisma.auditLog.create({
      data: { action: AUDIT_ACTION, entity: 'bot', entityId: dayKey, meta: JSON.stringify(stats) },
    });

    // eslint-disable-next-line no-console
    console.log(
      `[bot] qoldiq va saqlash ogohlantirishi ${dayKey}: yuborildi ${stats.sent}, aytadigan gap yo'q ${stats.empty}, xato ${stats.failed}`,
    );
  } finally {
    running = false;
  }
}

/** Kunlik qoldiq va saqlash ogohlantirishini ishga tushiradi */
export function startStockAlertJob(bot: Bot<BotContext>): NodeJS.Timeout {
  const timer = setInterval(() => {
    void tick(bot).catch((err: unknown) => {
      // eslint-disable-next-line no-console
      console.warn('[bot] qoldiq ogohlantirishi xatosi:', err instanceof Error ? err.message : err);
    });
  }, CHECK_INTERVAL_MS);
  timer.unref();
  return timer;
}
