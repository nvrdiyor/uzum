/**
 * Haftalik va oylik Telegram hisoboti (2026-10-24).
 *
 * NEGA API ISHCHISIDA, BOTDA EMAS. Xabardagi har raqam saytda o'sha davr
 * uchun ko'rinadigan raqamning AYNAN o'zi bo'lishi shart:
 *  • haftalik — Boshqaruv paneli KPI'lari: routes/analytics.ts `collectTotals`,
 *    services/pnl.ts `getPeriodCosts` / `comparablePeriod`; qaytarish —
 *    services/returns.ts `summarizeReturns`, paneldagi "Qaytarish va bekor
 *    qilish" kartasi kabi DONA bo'yicha;
 *  • oylik — "Oylik hisobot" sahifasi: services/monthly-report.ts
 *    `buildMonthlyReport` (sahifa, Excel va qo'lda Telegram'ga yuborish ham
 *    shundan).
 * Bot API paketini import qila olmaydi (alohida workspace) va qoidani
 * takrorlasa vaqt o'tib ajralib ketardi — jobs/stock-alert.ts da shunday
 * takror bor, har o'zgarishda ikki joy tuzatiladi.
 *
 * JADVAL — Asia/Tashkent savdo kuni (shared toBusinessDate):
 *  • haftalik — dushanba 09:00 dan: o'tgan to'liq dushanba–yakshanba
 *    (presetPeriod 'lastWeek') undan oldingi hafta bilan ('prev');
 *  • oylik — oyning 1-kuni 09:00 dan: o'tgan kalendar oyi undan oldingi oy
 *    bilan ('prevMonth' — butun oy ↔ butun oy).
 * Ishchi 09:00 da ishlamagan bo'lsa — o'sha kuni keyinroq yuboriladi, lekin
 * HECH QACHON keyingi kuni emas: seshanba kuni kelgan "haftalik hisobot"
 * chalg'itadi (saytdagi «O‘tgan hafta» bilan endi bir xil, lekin xabar
 * "kechikkan" bo'lib, keyingi haftanikiga aralashadi). Yuborish yarim tundan
 * o'tib ketsa, qolganlari to'xtatiladi.
 *
 * TAKRORLANMASLIK — AuditLog: action 'digest.weekly' | 'digest.monthly',
 * entityId `${userId}:${companyId}:${periodKey}` (periodKey — '2026-W42'
 * yoki '2026-09'). Yozuv yuborishdan OLDIN qo'yiladi (band qilish). Keyin
 * qo'yilsa, ikkalasi orasida jarayon qulasa qayta ishga tushganda xabar
 * ikkinchi marta ketardi; bir haftalik hisobotning kelmay qolishi ikki marta
 * kelishidan yaxshiroq. Band qilish ATOMAR: yozuv id'si kalitdan hisoblanadi
 * (`digestClaimId`), ikkinchi ishchi jarayon (SYNC_IN_PROCESS=true va mustaqil
 * worker) xuddi shu id bilan yoza olmaydi — birlamchi kalit rad etadi (P2002).
 * Ilgari "eng erta createdAt yutadi" deb tekshirilardi: e2e ikki parallel
 * yugurishda bitta sotuvchiga ikki xabar ketganini ko'rsatdi — vaqt yozuv
 * bazada ko'rinishidan OLDIN olinadi, ikkala ishchi ham o'zini birinchi deb
 * topardi (2026-10-27). Id bo'yicha qidiruv indekssiz AuditLog'da ham tez.
 *
 * KIMGA — faol, botga ulangan (botChatId), sozlamasi (notifyWeekly /
 * notifyMonthly) yoqilgan foydalanuvchi, HAR BIR a'zoligi bo'yicha alohida
 * xabar (sarlavhada kompaniya nomi). Kompaniya tarifida Telegram
 * bildirishnomalari to'liq ochiq bo'lishi shart (jobs/daily.ts bilan bir
 * qoida): muddati tugagan yoki bekor qilingan obunaga hech narsa — tarif
 * taklifini kunlik hisobot alohida yuboradi, bu yerda takrorlanmaydi.
 *
 * KO'RINISH SHABLONI (Membership.view). Xabar pul raqamlaridan iborat va
 * a'zoning SHAXSIY Telegramiga boradi — u yerda hech narsani yashirib
 * bo'lmaydi (sayt esa pulsiz shablonda JSON'dagi pulni `null` qiladi). Shuning
 * uchun faqat egaga va ko'rinishi null (rolga ko'ra hammasi) yoki 'accountant'
 * (buxgalter — pul uning ishi) bo'lgan a'zoga yuboriladi; 'warehouse'
 * (omborchi) va 'marketer' (marketolog) — yo'q. Qoida saytdagi bilan BITTA
 * manbadan (shared views.ts `viewSeesMoney`, `canReceiveDigest` pastda):
 * yangi pulsiz shablon qo'shilsa, Telegram uni o'zi chetlab o'tmaydi.
 *
 * BO'SH DAVR — ikkala davrda ham buyurtma bo'lmasa xabar YUBORILMAYDI.
 * Kabineti ulanmagan yoki savdoni to'xtatgan sotuvchiga har dushanba "sotuv
 * yo'q" deyish spam: bunday xabarlar botni ovozsiz qo'yishga o'rgatadi va
 * muhim ogohlantirishlar ham o'qilmay qoladi (qoldiq ogohlantirishidagi
 * "aytadigan gap bo'lmasa — jim" qoidasi). Joriy davrda sotuv yo'q, lekin
 * oldingisida bor edi — bu muhim signal, xabar "buyurtma bo'lmadi" satri va
 * −100% bilan ketadi.
 *
 * VAQT. `now` faqat jadval uchun (qaysi hafta/oy, qaysi kun) — sinovlarda
 * beriladi. Raqamlar esa sayt kabi DOIM hozirgi holat bilan hisoblanadi
 * (yo'ldagi tovar, tarif tarixi chegarasi): ishlab chiqarishda ikkalasi bir.
 */
import { createHash } from 'node:crypto';
import type { Request } from 'express';
import { prisma } from '@savdoiq/db';
import {
  BUSINESS_TZ_OFFSET_MS,
  addDays,
  asMemberView,
  businessDayStart,
  deltaPct,
  featureAccess,
  formatMoney,
  formatNumber,
  hasFeature,
  parseISODate,
  pct,
  presetPeriod,
  resolvePlan,
  round,
  toBusinessDate,
  viewSeesMoney,
  type Lang,
  type MonthlyReportFinality,
  type MonthlyReportResponse,
  type Period,
  type PlanId,
  type TopProductRow,
} from '@savdoiq/shared';
import { env } from '../env.js';
import { resolveRange, type ResolvedRange } from '../lib/period.js';
import { collectTotals, type PeriodTotals } from '../routes/analytics.js';
import { loadMonthlyWorkbook } from '../routes/export.js';
import { isoWeekKey } from '../routes/today.js';
import { getSkuCatalog, getStoreIds, type SkuInfo } from './common.js';
import { buildMonthlyReport, monthLabel } from './monthly-report.js';
import {
  absoluteLink,
  escapeHtml,
  sendTelegramDocument,
  sendTelegramMessage,
  type TelegramDocument,
  type TelegramSendResult,
} from './notify.js';
import { loadPlanData, planTable } from './plan.js';
import { comparablePeriod, getAdFeesBySku, getPeriodCosts } from './pnl.js';
import { summarizeReturns } from './returns.js';

// ─────────────────────────── Doimiylar ───────────────────────────

export type DigestKind = 'weekly' | 'monthly';
export const DIGEST_KINDS: readonly DigestKind[] = ['weekly', 'monthly'];

/** Yuborish soati (Toshkent) — botdagi kunlik hisobot (09:00) bilan bir xil ertalabki vaqt */
export const DIGEST_HOUR = 9;
/** Yuborishlar orasidagi pauza (Telegram cheklovi) — bot ishlari bilan bir xil */
const SEND_DELAY_MS = 60;

export const DIGEST_ACTIONS: Record<DigestKind, string> = {
  weekly: 'digest.weekly',
  monthly: 'digest.monthly',
};

/** Salbiy sharh chegarasi — routes/reviews.ts va today.ts NEGATIVE_MAX_RATING bilan bir xil */
const NEGATIVE_MAX_RATING = 3;
/** Xabardagi eng foydali mahsulotlar */
const TOP_LIMIT = 3;
/** Boshqaruv panelidagi "Top mahsulotlar" uzunligi (routes/analytics.ts /dashboard) */
const DASHBOARD_TOP = 8;
/** Mahsulot nomi xabarda shundan uzun bo'lsa qisqartiriladi (telefonda bir qatorga sig'sin) */
const NAME_MAX = 40;
const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

// ─────────────────────────── Jadval ───────────────────────────

export interface DigestDue {
  kind: DigestKind;
  /** Yuborish kuni (Toshkent, YYYY-MM-DD) — xabar faqat shu kuni ketadi */
  day: string;
  /** Hisobot davri: o'tgan hafta yoki o'tgan oy */
  period: Period;
  /** AuditLog kalitining davr qismi: '2026-W42' yoki '2026-09' */
  periodKey: string;
}

const localHour = (now: Date): number => new Date(now.getTime() + BUSINESS_TZ_OFFSET_MS).getUTCHours();

/** Shu paytda hisobot yuborish vaqtimi; bo'lsa — qaysi davr uchun */
export function digestDue(kind: DigestKind, now: Date): DigestDue | null {
  if (localHour(now) < DIGEST_HOUR) return null;
  const day = toBusinessDate(now);
  const date = parseISODate(day);
  if (kind === 'weekly') {
    // getUTCDay: 1 — dushanba (sana savdo kuniga keltirilgan)
    if (date.getUTCDay() !== 1) return null;
    const period = presetPeriod('lastWeek', now);
    return { kind, day, period, periodKey: isoWeekKey(period.from) };
  }
  if (date.getUTCDate() !== 1) return null;
  const period = presetPeriod('lastMonth', now);
  return { kind, day, period, periodKey: period.from.slice(0, 7) };
}

/**
 * Saytdagi so'rov oralig'ining AYNAN o'zi: GET /analytics/kpi?from=&to=&compare=
 * (lib/period.ts — tarif tarixi chegarasi va taqqoslanadigan davr bilan).
 * Qo'lda takrorlansa, chegaradagi bitta kunlik farq ham "raqam saytdagidan
 * farq qiladi" degani bo'lardi.
 */
function rangeOf(period: Period, compare: 'prev' | 'prevMonth', plan: PlanId): ResolvedRange {
  const req = { query: { from: period.from, to: period.to, compare } } as unknown as Request;
  return resolveRange(req, plan);
}

// ─────────────────────────── Ma'lumot ───────────────────────────

export interface DigestMetric {
  value: number;
  /**
   * O'zgarish: pul va sonlarda — nisbiy % (shared deltaPct), ulushlarda (marja,
   * qaytarish) — foiz punkti, saytdagi Delta unit='pp' kabi. Taqqoslab
   * bo'lmasa (tarix yo'q, oldingi davrda asos 0) — null, foiz ko'rsatilmaydi.
   */
  delta: number | null;
}

export interface DigestTopRow {
  skuId: string;
  /** Saytdagi yorliq: "Mahsulot · variant" */
  name: string;
  profit: number;
}

export interface DigestData {
  kind: DigestKind;
  companyId: string;
  companyName: string;
  /** Do'konlar soni — bittadan ko'p bo'lsa izohda "barcha do'konlar" deyiladi */
  stores: number;
  period: Period;
  previous: Period;
  /** Oldingi davr saqlangan tarix ichidami (services/pnl.ts comparablePeriod) */
  comparable: boolean;
  revenue: DigestMetric;
  netProfit: DigestMetric;
  margin: DigestMetric;
  orders: DigestMetric;
  units: DigestMetric;
  returnRate: DigestMetric;
  top: DigestTopRow[];
  /** Buyurtma kerak SKU'lar — Rejalashtiruvchidagi "Kritik" + "Tugayapti"; tarifda bo'lim yopiq bo'lsa null */
  reorder: number | null;
  /** Davrda yozilgan va hali javob berilmagan 1–3★ sharhlar */
  unansweredNegative: number;
  /** Oylik: hisobot yakuniymi yoki oraliq (Excel'dagi "Holat" qatori) */
  finality: MonthlyReportFinality | null;
  /** Ikkala davrda ham buyurtma yo'q — xabar yuborilmaydi */
  empty: boolean;
  /** Joriy davrda buyurtma yo'q (oldingisida bor edi) */
  noOrders: boolean;
  /** Oylik Excel fayli — tarifda oylik hisobot VA Excel eksporti to'liq ochiq bo'lsa */
  file: { fileName: string; data: Uint8Array } | null;
}

/** Hisobot quriladigan kompaniya */
export interface DigestCompany {
  id: string;
  name: string;
  taxRate: number;
}

/**
 * routes/analytics.ts `metric` bilan bir xil: avval yaxlitlanadi, keyin
 * o'zgarish — panel kartasidagi "+1,9%" bilan bitta raqam.
 */
function metric(value: number, previous: number | null, digits = 0): DigestMetric {
  const cur = round(value, digits);
  if (previous === null) return { value: cur, delta: null };
  return { value: cur, delta: deltaPct(cur, round(previous, digits)) };
}

/** Mahsulot nomi va variant orasidagi ajratgichlar — web components/dashboard/productName.ts bilan bir xil */
const NAME_SEP = ' —–-·,:/';

/**
 * Saytdagi yorliq (web splitProductName): SKU nomi ko'pincha faqat variant
 * («ЧЕРН») yoki "mahsulot — variant". Xabarda ikkalasi bitta qatorda.
 */
function productName(title: string, productTitle?: string): string {
  const sku = title.trim();
  const product = productTitle?.trim();
  if (!product) return sku;
  const t = sku.toLowerCase();
  const p = product.toLowerCase();
  if (t.length > p.length && t.startsWith(p)) {
    let i = product.length;
    while (i < sku.length && NAME_SEP.includes(sku.charAt(i))) i += 1;
    const variant = sku.slice(i).trim();
    return variant ? `${product} · ${variant}` : sku;
  }
  if (t.includes(p)) return sku;
  if (p.includes(t)) return product;
  return `${product} · ${sku}`;
}

/**
 * Eng foydali uchtasi — panelning "Qaysi tovar ko‘proq foyda keltiryapti"
 * grafigi qoidasi (web Dashboard): "Top mahsulotlar" ro'yxatidan foydasi
 * musbatlari, foyda bo'yicha. Butun katalogdan alohida qidirilmaydi —
 * xabardagi uchlik saytdagi grafikning birinchi uchta ustuni bilan bir xil
 * bo'lsin.
 */
function topByProfit(rows: Pick<TopProductRow, 'skuId' | 'title' | 'productTitle' | 'profit'>[]): DigestTopRow[] {
  return [...rows]
    .filter((r) => r.profit > 0)
    .sort((a, b) => b.profit - a.profit)
    .slice(0, TOP_LIMIT)
    .map((r) => ({ skuId: r.skuId, name: productName(r.title, r.productTitle), profit: r.profit }));
}

/**
 * Boshqaruv panelidagi "Top mahsulotlar" (routes/analytics.ts /dashboard) —
 * AYNAN o'sha qadamlar: katalogda yo'q SKU tashlanadi, foydadan shu
 * mahsulotning reklama to'lovi ayriladi, tushum bo'yicha 8 tasi. U yerda
 * o'zgarsa — shu yerda ham (e2e ikkalasini solishtiradi).
 */
function dashboardTop(
  totals: PeriodTotals,
  catalog: Map<string, SkuInfo>,
  adBySku: Map<string, number>,
): Pick<TopProductRow, 'skuId' | 'title' | 'productTitle' | 'profit' | 'revenue' | 'units'>[] {
  return [...totals.bySku.entries()]
    .filter(([skuId]) => catalog.has(skuId))
    .map(([skuId, agg]) => {
      const info = catalog.get(skuId);
      return {
        skuId,
        title: info?.title ?? 'Noma’lum SKU',
        productTitle: info?.productTitle,
        revenue: round(agg.revenue),
        profit: round(agg.netProfit - (adBySku.get(skuId) ?? 0)),
        units: agg.units,
      };
    })
    .filter((r) => r.units > 0 || r.revenue > 0)
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, DASHBOARD_TOP);
}

/**
 * Buyurtma kerak SKU'lar — /planner jadvalidagi "Kritik" va "Tugayapti"
 * hisoblagichlari (services/plan.ts planTable, kompaniyaning yetkazish
 * muddati bilan). Holat HOZIRGI: o'tgan hafta emas, bugun nima qilish kerak.
 * Sinov tarifida Rejalashtiruvchi 'preview' — hisoblagichlar /planner/preview
 * da ham ko'rinadi, shuning uchun faqat 'off' da yo'q.
 */
async function reorderCount(companyId: string, storeIds: string[], plan: PlanId): Promise<number | null> {
  if (featureAccess(plan, 'planner') === 'off') return null;
  const table = planTable(await loadPlanData(companyId, storeIds));
  return table.counts.critical + table.counts.ending;
}

/**
 * Javobsiz 1–3★ sharhlar — hisobot DAVRIDA yozilganlari. Davr bo'yicha
 * olinadi: "Sharhlar" sahifasida o'sha davr va "Salbiy" filtri bilan aynan
 * shu sharhlar ko'rinadi; eski, javob vaqti o'tib ketgan sharhlar har hafta
 * qayta sanalib, raqamni ma'nosiz o'stirmaydi.
 */
function unansweredNegative(storeIds: string[], from: Date, toExclusive: Date): Promise<number> {
  if (storeIds.length === 0) return Promise.resolve(0);
  return prisma.review.count({
    where: {
      storeId: { in: storeIds },
      answered: false,
      rating: { lte: NEGATIVE_MAX_RATING },
      publishedAt: { gte: from, lt: toExclusive },
    },
  });
}

/** Haftalik: Boshqaruv paneli «O‘tgan hafta» (taqqoslash — oldingi teng davr) */
async function buildWeekly(company: DigestCompany, plan: PlanId, due: DigestDue): Promise<DigestData> {
  const range = rangeOf(due.period, 'prev', plan);
  const storeIds = await getStoreIds(company.id);
  const prevFrom = businessDayStart(range.previous.from);
  const prevToExclusive = addDays(businessDayStart(range.previous.to), 1);
  // Qaytarish ulushi hozirgi holat bilan — panel kartasi kabi (routes/returnsSummary.ts)
  const asOf = new Date();

  const [cur, prev, costs, prevCosts, comparable, curReturns, catalog, reorder, unanswered] = await Promise.all([
    collectTotals(storeIds, range.from, range.toExclusive),
    collectTotals(storeIds, prevFrom, prevToExclusive),
    getPeriodCosts(company.id, storeIds, range.from, range.toExclusive),
    getPeriodCosts(company.id, storeIds, prevFrom, prevToExclusive),
    comparablePeriod(storeIds, range.previous, plan),
    summarizeReturns(storeIds, range.from, range.toExclusive, asOf),
    getSkuCatalog(storeIds, true),
    reorderCount(company.id, storeIds, plan),
    unansweredNegative(storeIds, range.from, range.toExclusive),
  ]);
  const [prevReturns, adBySku] = await Promise.all([
    comparable ? summarizeReturns(storeIds, prevFrom, prevToExclusive, asOf) : Promise.resolve(null),
    getAdFeesBySku(
      company.id,
      storeIds,
      range.from,
      range.toExclusive,
      new Map([...cur.bySku].map(([id, a]) => [id, a.revenue])),
    ),
  ]);

  // Sof foyda — davr xarajatlaridan keyin (panel, Moliya va Oylik hisobot bilan bir ta'rif)
  const curNet = cur.netProfit - costs.total;
  const prevNet = prev.netProfit - prevCosts.total;
  const was = (v: number): number | null => (comparable ? v : null);

  /*
   * Marja o'zgarishi FOIZ PUNKTIDA — web components/dashboard/rates.ts
   * ppDelta: (joriy − oldingi), ikkalasi 2 xonaga yaxlitlangan qiymatdan;
   * oldingi davrda tushum bo'lmasa asos yo'q.
   */
  const margin = round(pct(curNet, cur.revenue), 2);
  const prevMargin = round(pct(prevNet, prev.revenue), 2);
  const marginDelta = comparable && round(prev.revenue) > 0 ? Math.round((margin - prevMargin) * 10) / 10 : null;

  /*
   * Qaytarish — routes/returnsSummary.ts bilan bir qoida: oldingi davrda dona
   * bo'lmasa taqqoslash yo'q; asos (qabul qilingan + qaytgan) ikki davrdan
   * birida 0 bo'lsa o'zgarish ham yo'q.
   */
  const prevRet = prevReturns && prevReturns.orderedUnits > 0 ? prevReturns : null;
  const base = (s: { soldUnits: number; returned: { qty: number } }): number => s.soldUnits + s.returned.qty;
  const returnDelta =
    prevRet && base(curReturns) > 0 && base(prevRet) > 0
      ? round(curReturns.returned.rate - prevRet.returned.rate, 1)
      : null;

  const empty = cur.ordersTotal === 0 && !(comparable && prev.ordersTotal > 0);

  return {
    kind: 'weekly',
    companyId: company.id,
    companyName: company.name,
    stores: storeIds.length,
    period: range.period,
    previous: range.previous,
    comparable: Boolean(comparable),
    revenue: metric(cur.revenue, was(prev.revenue)),
    netProfit: metric(curNet, was(prevNet)),
    margin: { value: margin, delta: marginDelta },
    // Bekor qilingan va qaytarilgan buyurtmalar sanoqqa kirmaydi (panel bilan bir xil)
    orders: metric(cur.ordersActive, was(prev.ordersActive)),
    units: metric(cur.units, was(prev.units)),
    returnRate: { value: curReturns.returned.rate, delta: returnDelta },
    top: topByProfit(dashboardTop(cur, catalog, adBySku)),
    reorder,
    unansweredNegative: unanswered,
    finality: null,
    empty,
    noOrders: cur.ordersTotal === 0,
    file: null,
  };
}

/**
 * Oylik: "Oylik hisobot" sahifasi `?month=YYYY-MM` (buildMonthlyReport) va
 * undan oldingi oy — o'sha funksiya bilan. Qaytarish ulushi ham sahifadagi
 * (buyurtma bo'yicha) — xabar qaysi sahifaga olib borsa, o'sha raqam.
 */
async function buildMonthly(company: DigestCompany, plan: PlanId, due: DigestDue): Promise<DigestData> {
  const range = rangeOf(due.period, 'prevMonth', plan);
  const storeIds = await getStoreIds(company.id);
  const month = due.period.from.slice(0, 7);
  /*
   * Fayl — Excel tugmasi va POST /reports/send-telegram dagi faylning AYNAN
   * o'zi (routes/export.ts loadMonthlyWorkbook). Tarif sharti ham o'sha
   * marshrutdagidek: oylik hisobot VA Excel eksporti to'liq ochiq bo'lsin —
   * aks holda Telegram yopiq eksportni chetlab o'tgan bo'lardi.
   */
  const withFile = hasFeature(plan, 'monthly_reports') && hasFeature(plan, 'export_excel');
  const input = { companyId: company.id, taxRate: company.taxRate, plan, storeIds, range };

  const [main, comparable, reorder] = await Promise.all([
    withFile
      ? loadMonthlyWorkbook({ company, plan, range, month })
      : buildMonthlyReport({ ...input, month }).then((report) => ({ report, workbook: null, fileName: null })),
    comparablePeriod(storeIds, range.previous, plan),
    reorderCount(company.id, storeIds, plan),
  ]);
  const report: MonthlyReportResponse = main.report;
  const [prevReport, unanswered] = await Promise.all([
    comparable ? buildMonthlyReport({ ...input, month: range.previous.from.slice(0, 7) }) : Promise.resolve(null),
    unansweredNegative(
      storeIds,
      businessDayStart(report.period.from),
      addDays(businessDayStart(report.period.to), 1),
    ),
  ]);

  const p = prevReport;
  const empty = report.ordersTotal === 0 && !(p && p.ordersTotal > 0);
  let file: DigestData['file'] = null;
  if (!empty && main.workbook && main.fileName) {
    file = { fileName: main.fileName, data: new Uint8Array(await main.workbook.xlsx.writeBuffer()) };
  }

  return {
    kind: 'monthly',
    companyId: company.id,
    companyName: company.name,
    stores: storeIds.length,
    period: report.period,
    previous: range.previous,
    comparable: Boolean(p),
    revenue: { value: report.revenue, delta: p ? deltaPct(report.revenue, p.revenue) : null },
    netProfit: { value: report.netProfit, delta: p ? deltaPct(report.netProfit, p.netProfit) : null },
    // Sahifadagi "Sof marja" o'zgarishi (Reports ResultHero): joriy − oldingi oy, p.p.
    margin: { value: report.margin, delta: p && p.revenue > 0 ? Math.round((report.margin - p.margin) * 10) / 10 : null },
    // "Muvaffaqiyatli" buyurtmalar — bekor va qaytarilgansiz, panel KPI'si bilan bir ta'rif
    orders: { value: report.ordersSuccess, delta: p ? deltaPct(report.ordersSuccess, p.ordersSuccess) : null },
    units: { value: report.unitsSold, delta: p ? deltaPct(report.unitsSold, p.unitsSold) : null },
    returnRate: {
      value: report.returnRate,
      delta: p && p.ordersTotal > 0 && report.ordersTotal > 0 ? round(report.returnRate - p.returnRate, 1) : null,
    },
    top: topByProfit(report.topProducts),
    reorder,
    unansweredNegative: unanswered,
    finality: report.finality,
    empty,
    noOrders: report.ordersTotal === 0,
    file,
  };
}

/** Bitta kompaniya uchun hisobot ma'lumoti (har til uchun alohida matn `renderDigest` da) */
export function buildDigestData(kind: DigestKind, company: DigestCompany, plan: PlanId, due: DigestDue): Promise<DigestData> {
  return kind === 'weekly' ? buildWeekly(company, plan, due) : buildMonthly(company, plan, due);
}

// ─────────────────────────── Matn ───────────────────────────

interface Dict {
  weekly: string;
  monthly: string;
  vs: string;
  noCompare: string;
  revenue: string;
  netProfit: string;
  margin: string;
  orders: string;
  units: string;
  returns: string;
  pp: string;
  top: string;
  noOrders: string;
  reorder: string;
  reorderValue: (n: string) => string;
  reviews: string;
  reviewsValue: (n: string) => string;
  none: string;
  status: string;
  final: string;
  preliminary: string;
  current: string;
  inTransit: string;
  done: (pct: string) => string;
  hintWeekly: string;
  hintMonthly: string;
  allStores: string;
  btnWeekly: string;
  btnMonthly: string;
  file: string;
}

/*
 * Davr nomlari saytdagi bilan bir xil yozilgan («O‘tgan hafta», «O‘tgan oy» —
 * davr tanlagichidagi tugmalar): sotuvchi xabardagi raqamni saytda bir
 * bosishda topsin.
 */
const DICT: Record<Lang, Dict> = {
  uz: {
    weekly: 'Haftalik hisobot',
    monthly: 'Oylik hisobot',
    vs: 'taqqoslash',
    noCompare: 'Oldingi davr saqlangan tarixdan tashqarida — o‘zgarish ko‘rsatilmaydi',
    revenue: 'Tushum',
    netProfit: 'Sof foyda',
    margin: 'Marja',
    orders: 'Buyurtmalar',
    units: 'Sotilgan dona',
    returns: 'Qaytarish',
    pp: 'p.p.',
    top: 'Eng foydali 3 mahsulot',
    noOrders: 'Bu davrda buyurtma bo‘lmadi.',
    reorder: 'Buyurtma kerak',
    reorderValue: (n) => `${n} ta SKU`,
    reviews: 'Javobsiz 1–3★ sharh',
    reviewsValue: (n) => `${n} ta`,
    none: 'yo‘q',
    status: 'Holat',
    final: 'Yakuniy',
    preliminary: 'Oraliq',
    current: 'davr hali tugamagan',
    inTransit: 'buyurtmalarning bir qismi hali yo‘lda',
    done: (v) => `${v} yakunlangan`,
    hintWeekly: 'Saytda xuddi shu raqamlar: Boshqaruv paneli → «O‘tgan hafta»',
    hintMonthly: 'Saytda xuddi shu raqamlar: Oylik hisobot → «O‘tgan oy»',
    allStores: 'barcha do‘konlar',
    btnWeekly: 'Boshqaruv panelini ochish',
    btnMonthly: 'Oylik hisobotni ochish',
    file: 'Oylik hisobot fayli (Excel)',
  },
  ru: {
    weekly: 'Недельный отчёт',
    monthly: 'Месячный отчёт',
    vs: 'сравнение',
    noCompare: 'Предыдущий период вне сохранённой истории — изменения не показаны',
    revenue: 'Выручка',
    netProfit: 'Чистая прибыль',
    margin: 'Маржа',
    orders: 'Заказы',
    units: 'Продано штук',
    returns: 'Возвраты',
    pp: 'п.п.',
    top: 'Топ-3 товара по прибыли',
    noOrders: 'За этот период заказов не было.',
    reorder: 'Нужен заказ',
    reorderValue: (n) => `${n} SKU`,
    reviews: 'Отзывы 1–3★ без ответа',
    reviewsValue: (n) => n,
    none: 'нет',
    status: 'Статус',
    final: 'Итоговый',
    preliminary: 'Предварительный',
    current: 'период ещё не закончился',
    inTransit: 'часть заказов ещё в пути',
    done: (v) => `завершено ${v}`,
    hintWeekly: 'На сайте те же цифры: Панель → «Прошлая неделя»',
    hintMonthly: 'На сайте те же цифры: Месячный отчёт → «Прошлый месяц»',
    allStores: 'все магазины',
    btnWeekly: 'Открыть панель',
    btnMonthly: 'Открыть месячный отчёт',
    file: 'Файл месячного отчёта (Excel)',
  },
  en: {
    weekly: 'Weekly report',
    monthly: 'Monthly report',
    vs: 'vs',
    noCompare: 'The previous period is outside stored history — no changes shown',
    revenue: 'Revenue',
    netProfit: 'Net profit',
    margin: 'Margin',
    orders: 'Orders',
    units: 'Units sold',
    returns: 'Returns',
    pp: 'pp',
    top: 'Top 3 products by profit',
    noOrders: 'No orders in this period.',
    reorder: 'Reorder needed',
    reorderValue: (n) => `${n} SKU${n === '1' ? '' : 's'}`,
    reviews: 'Unanswered 1–3★ reviews',
    reviewsValue: (n) => n,
    none: 'none',
    status: 'Status',
    final: 'Final',
    preliminary: 'Preliminary',
    current: 'the period is not over yet',
    inTransit: 'some orders are still in transit',
    done: (v) => `${v} completed`,
    hintWeekly: 'Same numbers on the site: Dashboard → “Last week”',
    hintMonthly: 'Same numbers on the site: Monthly report → “Last month”',
    allStores: 'all stores',
    btnWeekly: 'Open dashboard',
    btnMonthly: 'Open monthly report',
    file: 'Monthly report file (Excel)',
  },
};

export const asLang = (v: string | null | undefined): Lang => (v === 'ru' || v === 'en' ? v : 'uz');

/** Kod nuqtalari bo'yicha qisqartirish — emoji va murakkab harflar o'rtasidan kesilmasin */
function cut(value: string, max = NAME_MAX): string {
  const chars = [...value.trim()];
  return chars.length <= max ? value.trim() : `${chars.slice(0, max - 1).join('')}…`;
}

const dm = (iso: string): string => `${iso.slice(8, 10)}.${iso.slice(5, 7)}`;
const dmy = (iso: string): string => `${dm(iso)}.${iso.slice(0, 4)}`;

/** 12–18.10.2026 · 28.09 — 04.10.2026 · 29.12.2025 — 04.01.2026 (`withYear: false` — yilsiz) */
function spanLabel(p: Period, withYear = true): string {
  const end = withYear ? dmy(p.to) : dm(p.to);
  if (p.from === p.to) return end;
  if (p.from.slice(0, 7) === p.to.slice(0, 7)) return `${p.from.slice(8, 10)}–${end}`;
  if (p.from.slice(0, 4) === p.to.slice(0, 4)) return `${dm(p.from)} — ${end}`;
  return `${dmy(p.from)} — ${dmy(p.to)}`;
}

/** Oy nomi: "Sentabr 2026", "Сентябрь 2026", "September 2026" */
function monthName(key: string, lang: Lang): string {
  if (lang === 'uz') return monthLabel(key);
  const first = new Date(`${key}-01T00:00:00Z`);
  const name = new Intl.DateTimeFormat(lang === 'ru' ? 'ru-RU' : 'en-US', { month: 'long', timeZone: 'UTC' }).format(first);
  return `${name.charAt(0).toUpperCase()}${name.slice(1)} ${key.slice(0, 4)}`;
}

/** " ▲ +1,9%" / " ▼ -2,9 p.p." / " • 0%"; taqqoslab bo'lmasa — bo'sh (saytda tire) */
function change(delta: number | null, unit: 'pct' | 'pp', lang: Lang): string {
  if (delta === null || !Number.isFinite(delta)) return '';
  const arrow = delta > 0 ? '▲' : delta < 0 ? '▼' : '•';
  const tail = unit === 'pp' ? ` ${DICT[lang].pp}` : '%';
  return ` ${arrow} ${delta > 0 ? '+' : ''}${formatNumber(delta, lang, 1)}${tail}`;
}

export interface RenderedDigest {
  text: string;
  button: { text: string; url: string };
  /** Oylik Excel fayli izohi */
  fileCaption: string | null;
}

/** Xabar matni (Telegram HTML) — qisqa, telefonda bir ekranga sig'adigan */
export function renderDigest(d: DigestData, lang: Lang): RenderedDigest {
  const T = DICT[lang];
  const company = escapeHtml(d.companyName);
  const money = (v: number): string => formatMoney(v, lang);
  const share = (v: number): string => `${formatNumber(v, lang, 1)}%`;
  const num = (v: number): string => formatNumber(v, lang);
  const month = d.kind === 'monthly' ? monthName(d.period.from.slice(0, 7), lang) : '';

  const head =
    d.kind === 'weekly' ? `📊 <b>${T.weekly}</b> · ${company}` : `🗓 <b>${T.monthly} — ${month}</b> · ${company}`;
  const vs = d.kind === 'weekly' ? spanLabel(d.previous, false) : monthName(d.previous.from.slice(0, 7), lang);
  const lines: string[] = [head, `📅 ${spanLabel(d.period)}${d.comparable ? ` · ${T.vs}: ${vs}` : ''}`];

  if (d.finality) {
    // Oyning 1-kuni o'tgan oy odatda hali "oraliq": yo'ldagi tovar bekor bo'lishi yoki qaytishi mumkin
    const f = d.finality;
    const why = f.reason === 'current' ? T.current : f.reason === 'in_transit' ? T.inTransit : null;
    lines.push(
      `${T.status}: <b>${f.status === 'final' ? T.final : T.preliminary}</b>${why ? ` — ${why}` : ''} · ${T.done(share(f.completionPct))}`,
    );
  }
  if (!d.comparable) lines.push(`<i>${T.noCompare}</i>`);

  lines.push(
    '',
    `💰 ${T.revenue}: <b>${money(d.revenue.value)}</b>${change(d.revenue.delta, 'pct', lang)}`,
    `📈 ${T.netProfit}: <b>${money(d.netProfit.value)}</b>${change(d.netProfit.delta, 'pct', lang)}`,
    `📐 ${T.margin}: <b>${share(d.margin.value)}</b>${change(d.margin.delta, 'pp', lang)}`,
    `🧾 ${T.orders}: <b>${num(d.orders.value)}</b>${change(d.orders.delta, 'pct', lang)}`,
    `📦 ${T.units}: <b>${num(d.units.value)}</b>${change(d.units.delta, 'pct', lang)}`,
    `↩️ ${T.returns}: <b>${share(d.returnRate.value)}</b>${change(d.returnRate.delta, 'pp', lang)}`,
    '',
  );

  if (d.noOrders) lines.push(T.noOrders);
  else if (d.top.length > 0) {
    lines.push(`🏆 <b>${T.top}</b>`);
    d.top.forEach((r, i) => lines.push(`${i + 1}. ${escapeHtml(cut(r.name))} — <b>${money(r.profit)}</b>`));
  }

  lines.push('');
  if (d.reorder !== null) {
    lines.push(`🛒 ${T.reorder}: <b>${d.reorder > 0 ? T.reorderValue(num(d.reorder)) : T.none}</b>`);
  }
  lines.push(`💬 ${T.reviews}: <b>${d.unansweredNegative > 0 ? T.reviewsValue(num(d.unansweredNegative)) : T.none}</b>`);

  const hint = d.kind === 'weekly' ? T.hintWeekly : T.hintMonthly;
  lines.push('', `<i>${hint}${d.stores > 1 ? `, ${T.allStores}` : ''}</i>`);

  return {
    text: lines.join('\n').replace(/\n{3,}/g, '\n\n'),
    button: {
      text: d.kind === 'weekly' ? T.btnWeekly : T.btnMonthly,
      url: absoluteLink(d.kind === 'weekly' ? '/dashboard' : '/reports') ?? '',
    },
    fileCaption: d.file ? `📎 ${T.file} — ${month} · ${company}` : null,
  };
}

// ─────────────────────────── Yuborish ───────────────────────────

/** Telegram'ga yuborish — sinovlarda soxta transport beriladi (haqiqiy so'rov ketmasin) */
export interface DigestTransport {
  message(chatId: string, text: string, opts?: { markup?: unknown }): Promise<boolean>;
  document(
    chatId: string,
    doc: TelegramDocument,
    opts?: { caption?: string; markup?: unknown },
  ): Promise<TelegramSendResult>;
}

const telegramTransport: DigestTransport = {
  message: (chatId, text, opts) => sendTelegramMessage(chatId, text, opts),
  document: (chatId, doc, opts) => sendTelegramDocument(chatId, doc, opts),
};

export interface DigestStats {
  kind: DigestKind;
  periodKey: string;
  /** Mos a'zoliklar: faol, botga ulangan, sozlamasi yoqilgan */
  candidates: number;
  sent: number;
  /** Oylik Excel fayli ham yuborilgan xabarlar */
  files: number;
  /** Telegram qabul qilmadi (bot bloklangan, chat topilmadi) — qayta urinilmaydi */
  failed: number;
  /** Allaqachon yuborilgan: qayta ishga tushish yoki ikkinchi ishchi */
  duplicate: number;
  /** Ikkala davrda ham buyurtma yo'q */
  empty: number;
  /** Tarifda Telegram bildirishnomalari yopiq (muddati tugagan, bekor qilingan) */
  plan: number;
  /** Ko'rinish shabloni pul raqamlarini yashiradi */
  view: number;
  /** Kompaniya ma'lumotini yig'ib bo'lmadi — keyingi daqiqada qayta urinadi */
  errors: number;
  /** Savdo kuni o'zgarib qoldi — qolganlarga yuborilmadi */
  aborted: boolean;
  /** Bot tokeni sozlanmagan — hech narsa yuborilmadi */
  disabled: boolean;
}

export interface RunDigestOptions {
  /** "Hozir" — faqat jadval uchun (sinovlarda qotirilgan vaqt); berilmasa — haqiqiy soat */
  now?: Date;
  transport?: DigestTransport;
  delayMs?: number;
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Pul raqamlarini ko'rishga ruxsat (Membership.view) — saytdagi pul yashirish
 * bilan BITTA qoida (shared views.ts `viewSeesMoney`, API lib/views.ts): ega —
 * doim; shabloni yo'q (null) va buxgalter ('accountant') — ha; omborchi
 * ('warehouse') va marketolog ('marketer') — yo'q, saytda ularga foyda, marja
 * va tannarx `null` bo'lib keladi. Bazadagi notanish qiymat sayt kabi
 * "shablonsiz" o'qiladi (asMemberView) — xabar sayt ko'rsatgandan ko'p ham,
 * kam ham aytmasin.
 */
export function canReceiveDigest(m: { role: string; view: string | null }): boolean {
  if (m.role === 'owner') return true;
  return viewSeesMoney(asMemberView(m.view));
}

/**
 * Band qilish yozuvining id'si — kalitdan (action + entityId) hisoblanadi.
 * Birlamchi kalit noyob, shuning uchun xuddi shu hisobotni ikkinchi marta
 * band qilib bo'lmaydi: sxemaga indeks qo'shmasdan, SQLite va PostgreSQL'da
 * bir xil ishlaydigan atomar "bor bo'lsa — yozma".
 */
export function digestClaimId(action: string, entityId: string): string {
  return `dg_${createHash('sha256').update(`${action}|${entityId}`).digest('hex').slice(0, 32)}`;
}

const isUniqueViolation = (err: unknown): boolean => (err as { code?: string } | null)?.code === 'P2002';

/** Band qiladi; boshqa ishchi allaqachon band qilgan bo'lsa — null */
async function claim(userId: string, action: string, entityId: string, meta: Record<string, unknown>): Promise<string | null> {
  const id = digestClaimId(action, entityId);
  try {
    await prisma.auditLog.create({
      data: { id, userId, action, entity: 'digest', entityId, meta: JSON.stringify({ ...meta, status: 'claimed' }) },
      select: { id: true },
    });
    return id;
  } catch (err) {
    if (isUniqueViolation(err)) return null;
    throw err;
  }
}

/**
 * Bitta davr (`due`) uchun hisobotlarni hamma mos a'zolarga yuboradi. Bir
 * kompaniya ma'lumoti bir marta yig'iladi (keshlanadi), matn — har kimning
 * tilida. Qayta chaqirish xavfsiz: yuborilganlar AuditLog bo'yicha o'tkaziladi.
 */
export async function runDigest(due: DigestDue, opts: RunDigestOptions = {}): Promise<DigestStats> {
  const stats: DigestStats = {
    kind: due.kind,
    periodKey: due.periodKey,
    candidates: 0,
    sent: 0,
    files: 0,
    failed: 0,
    duplicate: 0,
    empty: 0,
    plan: 0,
    view: 0,
    errors: 0,
    aborted: false,
    disabled: false,
  };
  // Token yo'q — so'rov baribir ketmaydi; har a'zoga "xato" yozuvi qoldirilmasin
  if (!opts.transport && !env.telegram.botToken) {
    stats.disabled = true;
    return stats;
  }
  const transport = opts.transport ?? telegramTransport;
  const delayMs = opts.delayMs ?? SEND_DELAY_MS;
  const clock = (): Date => opts.now ?? new Date();
  const action = DIGEST_ACTIONS[due.kind];

  const memberships = await prisma.membership.findMany({
    where: {
      user: {
        status: 'active',
        botChatId: { not: null },
        ...(due.kind === 'weekly' ? { notifyWeekly: true } : { notifyMonthly: true }),
      },
    },
    select: {
      role: true,
      view: true,
      user: { select: { id: true, botChatId: true, languageCode: true } },
      company: {
        select: {
          id: true,
          name: true,
          taxRate: true,
          subscription: { select: { plan: true, status: true, expiresAt: true, canceledAt: true } },
        },
      },
    },
    orderBy: [{ userId: 'asc' }, { createdAt: 'asc' }],
  });
  stats.candidates = memberships.length;

  const cache = new Map<string, Promise<DigestData>>();

  for (const m of memberships) {
    const now = clock();
    // Yarim tundan o'tdi — "o'tgan hafta" endi boshqa kunga tegishli: qolganlar yuborilmaydi
    if (toBusinessDate(now) !== due.day) {
      stats.aborted = true;
      break;
    }
    const chatId = m.user.botChatId;
    if (!chatId) continue;

    // Tarif — sayt, API va bot bilan bir qoida (`resolvePlan`)
    const plan = resolvePlan(m.company.subscription, now.getTime());
    if (!hasFeature(plan, 'telegram_notifications')) {
      stats.plan += 1;
      continue;
    }
    if (!canReceiveDigest(m)) {
      stats.view += 1;
      continue;
    }

    const entityId = `${m.user.id}:${m.company.id}:${due.periodKey}`;
    // Ma'lumot yig'ishdan oldin: qayta ishga tushganda yuborilganlar uchun hisob qayta qurilmaydi
    const seen = await prisma.auditLog.findUnique({
      where: { id: digestClaimId(action, entityId) },
      select: { id: true },
    });
    if (seen) {
      stats.duplicate += 1;
      continue;
    }

    let pending = cache.get(m.company.id);
    if (!pending) {
      pending = buildDigestData(due.kind, m.company, plan, due);
      cache.set(m.company.id, pending);
    }
    let data: DigestData;
    try {
      data = await pending;
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn(`[digest] ${m.company.id}: hisobot yig‘ilmadi — ${err instanceof Error ? err.message : err}`);
      stats.errors += 1;
      continue;
    }
    if (data.empty) {
      stats.empty += 1;
      continue;
    }

    const lang = asLang(m.user.languageCode);
    const meta = { companyId: m.company.id, period: data.period, lang };
    const claimId = await claim(m.user.id, action, entityId, meta);
    if (!claimId) {
      stats.duplicate += 1;
      continue;
    }

    const msg = renderDigest(data, lang);
    const markup = msg.button.url ? { inline_keyboard: [[{ text: msg.button.text, url: msg.button.url }]] } : undefined;
    // Yuborish xatosi qolgan a'zolarni to'xtatmasin — band qilingan yozuv "xato" bo'lib qoladi
    const ok = await transport.message(chatId, msg.text, { markup }).catch(() => false);
    let fileStatus: 'sent' | 'failed' | null = null;
    if (ok && data.file) {
      await sleep(delayMs);
      const res = await transport
        .document(
          chatId,
          { fileName: data.file.fileName, data: data.file.data, contentType: XLSX_MIME },
          { caption: msg.fileCaption ?? undefined },
        )
        .catch((): TelegramSendResult => ({ ok: false }));
      fileStatus = res.ok ? 'sent' : 'failed';
      if (res.ok) stats.files += 1;
    }
    if (ok) stats.sent += 1;
    else stats.failed += 1;

    await prisma.auditLog
      .update({
        where: { id: claimId },
        data: { meta: JSON.stringify({ ...meta, status: ok ? 'sent' : 'failed', file: fileStatus }) },
      })
      .catch(() => undefined);
    await sleep(delayMs);
  }

  return stats;
}

/** Ishchi logi uchun bir qator */
export function describeDigestStats(s: DigestStats): string {
  const name = s.kind === 'weekly' ? 'haftalik hisobot' : 'oylik hisobot';
  if (s.disabled) return `${name} ${s.periodKey}: bot tokeni sozlanmagan — o‘tkazib yuborildi`;
  return (
    `${name} ${s.periodKey}: yuborildi ${s.sent}${s.files ? ` (Excel ${s.files})` : ''}, xato ${s.failed}, ` +
    `oldin yuborilgan ${s.duplicate}, bo‘sh ${s.empty}, tarif ${s.plan}, ko‘rinish ${s.view}` +
    `${s.errors ? `, yig‘ilmadi ${s.errors}` : ''}${s.aborted ? ' — kun tugadi, to‘xtatildi' : ''}`
  );
}

/**
 * Har daqiqalik tekshiruv (worker/runner.ts). Vaqti kelmagan bo'lsa bazaga
 * so'rov ham ketmaydi; shu jarayonda yakunlangan davr xotirada belgilanadi
 * va o'sha kuni qayta ko'rilmaydi. Qayta ishga tushganda xotira bo'sh —
 * shunda AuditLog takrorlanishdan saqlaydi.
 */
export function createDigestJob(opts: Omit<RunDigestOptions, 'now'> = {}) {
  const finished = new Set<string>();
  let running = false;
  return {
    /** `now` — faqat sinov uchun; ishchi uni bermaydi (haqiqiy soat) */
    async tick(now?: Date): Promise<DigestStats[]> {
      if (running) return [];
      const at = now ?? new Date();
      const due = DIGEST_KINDS.map((kind) => digestDue(kind, at)).filter(
        (d): d is DigestDue => d !== null && !finished.has(`${d.kind}:${d.periodKey}`),
      );
      if (due.length === 0) return [];
      running = true;
      const out: DigestStats[] = [];
      try {
        for (const d of due) {
          const stats = await runDigest(d, { ...opts, now });
          out.push(stats);
          // Yig'ilmagan kompaniya bo'lsa — keyingi daqiqada qayta (yuborilganlar AuditLog bilan o'tkaziladi)
          if (!stats.aborted && stats.errors === 0) finished.add(`${d.kind}:${d.periodKey}`);
        }
      } finally {
        running = false;
      }
      return out;
    },
  };
}
