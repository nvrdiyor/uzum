/**
 * Hisobot xabari va unga kirish sharti.
 *
 * Ikki joy ishlatadi: menyu (menu.ts — «📊 Bugungi hisobot» va davr tugmalari)
 * va qo'lda sinxron (sync.ts — sinxron tugagach o'sha xabar shu yerda qayta
 * chiziladi). Alohida faylda turibdi, toki menu.ts va sync.ts bir-birini
 * import qilmasin.
 */
import type { InlineKeyboard } from 'grammy';
import { hasFeature } from '@savdoiq/shared';
import { prisma } from '../lib/db.js';
import { env } from '../lib/env.js';
import { tr, type BotLang } from '../i18n.js';
import { clampMessage, t, type BotCompany, type BotContext } from './context.js';
import { mainMenu, pricingKeyboard, reportKeyboard } from './keyboards.js';
import { buildPeriodReport } from './data.js';
import { periodReportText } from './reports.js';
import { resolveReportPeriod, type ReportPeriod } from '../lib/dashboard-kpi.js';

/**
 * Kompaniya bor-yo'qligini tekshiradi. Bo'lmasa — foydalanuvchini ro'yxatdan o'tishga yo'naltiradi.
 * Ma'lumot hali yig'ilmagan bo'lsa ham xato emas: shunchaki holat haqida xabar beriladi.
 */
export async function requireCompany(ctx: BotContext): Promise<string | null> {
  const { user, company } = ctx.sp;
  if (!user) {
    await ctx.reply(t(ctx, 'need_start'));
    return null;
  }
  if (!company) {
    await ctx.reply(t(ctx, 'need_company'), { reply_markup: mainMenu(ctx.sp.lang) });
    return null;
  }
  /*
   * Obuna tugagan (yoki bekor qilingan) kompaniya — sayt va API bilan bir xil
   * qoida: hisobotlar o'rniga tarifni yangilash taklifi. Ilgari bot tarifni
   * umuman tekshirmasdi va to'lovni to'xtatgan mijoz raqamlarni shu yerdan
   * olishda davom etardi.
   */
  if (!hasFeature(company.plan, 'telegram_notifications')) {
    await ctx.reply(t(ctx, 'plan_locked_reports'), {
      parse_mode: 'HTML',
      reply_markup: pricingKeyboard(ctx.sp.lang),
    });
    return null;
  }
  if (!company.hasApiKey) {
    // A'zo kalitni o'zi ulay olmaydi — /start ga yuborish uni aylanib qaytarardi
    await ctx.reply(t(ctx, company.role === 'owner' ? 'need_api_key' : 'set_api_owner_only'));
    return null;
  }
  return company.id;
}

/**
 * Sinxronni kim boshlay oladi — saytdagi `POST /sync/start` bilan bir qoida
 * (`requireRole('owner', 'manager')`). Kuzatuvchi (viewer) raqamlarni ko'radi,
 * lekin Uzum'ga so'rov yuborolmaydi.
 */
export function canStartSync(company: Pick<BotCompany, 'role'> | null | undefined): boolean {
  return company?.role === 'owner' || company?.role === 'manager';
}

const OFFSET_MS = env.timezoneOffsetMinutes * 60_000;
const pad2 = (n: number): string => String(n).padStart(2, '0');

/**
 * Toshkent vaqti: bugun bo'lsa "21:47", boshqa kun bo'lsa "11.11 21:47".
 * Bot jarayoni UTC'da ishlaydi — mahalliy soat ofset bilan hisoblanadi
 * (data.ts dagi kun chegarasi bilan bir xil yo'l).
 */
export function clock(value: Date, now = new Date()): string {
  const local = new Date(value.getTime() + OFFSET_MS);
  const today = new Date(now.getTime() + OFFSET_MS);
  const time = `${pad2(local.getUTCHours())}:${pad2(local.getUTCMinutes())}`;
  const sameDay =
    local.getUTCFullYear() === today.getUTCFullYear() &&
    local.getUTCMonth() === today.getUTCMonth() &&
    local.getUTCDate() === today.getUTCDate();
  return sameDay ? time : `${pad2(local.getUTCDate())}.${pad2(local.getUTCMonth() + 1)} ${time}`;
}

/**
 * «… dan keyin mumkin» uchun vaqt — daqiqaga YUQORIGA yaxlitlanadi: 23:31:30
 * ni "23:31" deb yozsak, 23:31:10 da bosgan sotuvchi "allaqachon mumkin"
 * degan matn bilan rad etilardi.
 */
export function clockAfter(value: Date, now = new Date()): string {
  return clock(new Date(Math.ceil(value.getTime() / 60_000) * 60_000), now);
}

export interface SyncInfo {
  /** Oxirgi MUVAFFAQIYATLI sinxron (kabinetlarning eng yangisi) */
  lastSyncAt: Date | null;
  /** Keyingi avtomatik sinxron (faol kabinetlarning eng yaqini) */
  nextSyncAt: Date | null;
}

/**
 * Ma'lumot qachon yangilangani va keyingi avtomatik sinxron — saytdagi
 * `getSyncStatus` bilan bir qoida (api services/sync.ts): `lastSyncAt` faqat
 * muvaffaqiyatli sinxronda yoziladi, keyingisi — faol kabinetlardan.
 */
export async function loadSyncInfo(companyId: string): Promise<SyncInfo> {
  const accounts = await prisma.uzumAccount.findMany({
    where: { companyId },
    select: { status: true, lastSyncAt: true, nextSyncAt: true },
  });
  let lastSyncAt: Date | null = null;
  let nextSyncAt: Date | null = null;
  for (const a of accounts) {
    if (a.lastSyncAt && (!lastSyncAt || a.lastSyncAt > lastSyncAt)) lastSyncAt = a.lastSyncAt;
    if (a.status === 'active' && a.nextSyncAt && (!nextSyncAt || a.nextSyncAt < nextSyncAt)) nextSyncAt = a.nextSyncAt;
  }
  return { lastSyncAt, nextSyncAt };
}

/** «🕒 Ma'lumot 21:17 holatiga · keyingi sinxron 21:47» — sinxron bo'lmagan bo'lsa bo'sh */
export function asOfLine(lang: BotLang, info: SyncInfo, now = new Date()): string {
  if (!info.lastSyncAt) return '';
  const time = clock(info.lastSyncAt, now);
  return info.nextSyncAt && info.nextSyncAt.getTime() > now.getTime()
    ? tr(lang, 'sync_as_of_next', { time, next: clock(info.nextSyncAt, now) })
    : tr(lang, 'sync_as_of', { time });
}

export interface ReportViewOptions {
  /** Hisobot tepasidagi holat qatori (masalan «✅ Ma'lumot yangilandi» yoki «⚠️ Sinxron bajarilmadi») */
  banner?: string;
  /** Shu xabar uchun sinxron ketyapti — tugma o'rnida foiz */
  syncProgress?: number | null;
}

/**
 * Hisobot matni va tugmalari. Davr va raqamlar saytdagi Boshqaruv paneli
 * bilan bir ta'rifda (lib/dashboard-kpi.ts): o'sha tarif chegarasi, o'sha sof
 * foyda (davr xarajatlaridan keyin). `null` — birinchi sinxron hali tugamagan
 * va ko'rsatadigan raqam yo'q.
 *
 * Pastda ma'lumot qaysi paytniki ekani va keyingi avtomatik sinxron doim
 * yoziladi (2026-11-12): sinxron 30–60 daqiqada bir yuradi va sotuvchi raqam
 * eskirganini bilmasdan qaror qilardi — endi ko'rib turadi va kerak bo'lsa
 * «🔄 Sinxronlash»ni bosadi. Banner bo'lsa ham qator qoladi: sinxron yiqilgan
 * yoki bekor qilinganda aynan shu qator raqamlar qanchalik eskiligini aytadi.
 */
export async function buildReportView(
  lang: BotLang,
  company: BotCompany,
  kind: ReportPeriod,
  opts: ReportViewOptions = {},
): Promise<{ text: string; markup: InlineKeyboard } | null> {
  const range = resolveReportPeriod(kind, company.plan);
  const [report, info] = await Promise.all([buildPeriodReport(company.id, range), loadSyncInfo(company.id)]);

  // Sinxronizatsiya tugamagan bo'lsa — bo'sh hisobot sababini chaqiruvchi tushuntiradi
  if (report.orders === 0 && company.onboardStep === 'syncing') return null;

  const body = periodReportText(lang, range, report, company.seesMoney);
  const text = [opts.banner ?? '', body, asOfLine(lang, info)].filter(Boolean).join('\n\n');

  return {
    text: clampMessage(text),
    markup: reportKeyboard(lang, kind, { canSync: canStartSync(company), syncProgress: opts.syncProgress ?? null }),
  };
}
