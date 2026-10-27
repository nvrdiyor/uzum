/**
 * Oylik hisobot — YAGONA hisob (2026-10-24).
 *
 * "Oylik hisobot" sahifasi (GET /reports/monthly), uning Excel fayli
 * (GET /export/monthly) va Telegram'ga yuboriladigan nusxasi
 * (POST /reports/send-telegram) shu fayldagi `buildMonthlyReport` javobidan
 * quriladi — fayldagi har raqam ekrandagining aynan o'zi. Ilgari Excel o'zicha
 * hisoblardi: kunlik varaqdagi foyda davr xarajatlari ayrilmasdan, soliq faqat
 * qo'lda kiritilmagan bo'lsagina, Uzum saqlash to'lovi esa umuman yo'q edi —
 * fayldagi foyda va marja sahifadagidan baland chiqardi.
 *
 * Foyda — Boshqaruv paneli bilan AYNAN bir ta'rif (services/pnl.ts):
 *   yalpi foyda = tushum − tannarx
 *   sof foyda   = tovarlar bo'yicha foyda (Σ pozitsiya netProfit) − davr xarajatlari
 *
 * Ilgari hisobot sof foydani "tushum − tannarx − kategoriyalar" deb qaytadan
 * yig'ardi. Soliq stavkasi o'zgargach (eski pozitsiyalarda eski stavka
 * ayrilgan), Uzum to'lovi komissiyaga mos kelmagan satrda yoki SKU'si
 * topilmagan pozitsiyada panel va hisobot bitta oy uchun ikki xil sof foyda
 * ko'rsatardi. Endi "Soliq" qatori ham pozitsiyalarda HAQIQATDA ayrilgan soliq
 * (+ qo'lda kiritilgani), shuning uchun "Tushum qayerga ketdi" lentasi
 * yopiladi: tannarx + xarajatlar + sof foyda = tushum.
 *
 * Ma'lumot bo'lmasa ham nol qiymatli to'liq javob qaytariladi.
 */
import { prisma } from '@savdoiq/db';
import {
  addDays,
  businessDayStart,
  formatCompact,
  formatNumber,
  getPlan,
  parseISODate,
  pct,
  round,
  safeDiv,
  toBusinessDate,
  toISODate,
  type DeliveryType,
  type ExpenseCategory,
  type Insight,
  type MonthlyReportFinality,
  type MonthlyReportResponse,
  type Period,
  type PlanId,
  type TimeSeriesPoint,
  type TopProductRow,
} from '@savdoiq/shared';
import type { DateBasis, ResolvedRange } from '../lib/period.js';
import { getLatestStocks, getSkuCatalog, type SkuInfo } from './common.js';
import { getAdFeesBySku, getPeriodCosts, getPeriodCostsByDay } from './pnl.js';
import { returnsRate, splitLine, summarizeReturns } from './returns.js';
import { getDailySeriesByBasis, lineDate, lineDateWhere, orderDateWhere } from './sale-basis.js';

// ─────────────────────────── Doimiylar ───────────────────────────

/** Xarajat kategoriyalari — javoblarda doimo shu tartibda */
export const CATEGORY_ORDER: ExpenseCategory[] = [
  'commission',
  'logistics',
  'marketing',
  'storage',
  'tax',
  'salary',
  'other',
];

const CATEGORY_LABEL: Record<ExpenseCategory, string> = {
  commission: 'Komissiya',
  logistics: 'Logistika',
  marketing: 'Marketing',
  storage: 'Ombor (saqlash)',
  tax: 'Soliq',
  salary: 'Ish haqi',
  other: 'Boshqa',
};

const DELIVERY_TYPES: DeliveryType[] = ['FBO', 'FBS', 'DBS'];

const MONTHS_UZ = [
  'Yanvar',
  'Fevral',
  'Mart',
  'Aprel',
  'May',
  'Iyun',
  'Iyul',
  'Avgust',
  'Sentabr',
  'Oktabr',
  'Noyabr',
  'Dekabr',
];

const UNKNOWN_CATEGORY = 'Kategoriyasiz';

/**
 * Hisobot YAKUNIY bo'lishi uchun taqdiri hal bo'lgan donaning eng kichik
 * ulushi, %. Qolgan 5% — bitta-ikkita kechikkan buyurtma: ular uchun butun
 * oyni "oraliq" deb turish shart emas, 5% dan ko'p esa — oy natijasi hali
 * sezilarli o'zgaradi (yo'ldagi tovar bekor bo'lishi yoki qaytishi mumkin).
 */
export const FINAL_COMPLETION_PCT = 95;

/**
 * Qaytarish ulushi chegaralari, % — Boshqaruv panelidagi kartaniki bilan bir
 * xil (web components/dashboard/rates.ts returnsTone, analytics.ts
 * tavsiyalari): 4% dan — diqqat, 8% dan — xavfli. Ulush endi panelniki
 * bo'lgani uchun (dona bo'yicha) chegaralar ham o'sha: ilgari hisobot 5/10
 * ishlatardi va bir xil 9% panelda qizil, hisobotda sariq chiqardi (2026-10-27).
 */
export const RETURNS_WARN_PCT = 4;
export const RETURNS_DANGER_PCT = 8;

const money = (v: number): string => `${formatCompact(Math.round(v), 'uz')} so‘m`;
const num = (v: number, digits = 0): string => formatNumber(v, 'uz', digits);

/** Oy kaliti (2026-09) → "Sentabr 2026" */
export function monthLabel(key: string): string {
  const year = Number(key.slice(0, 4));
  const name = MONTHS_UZ[Number(key.slice(5, 7)) - 1];
  return name && Number.isFinite(year) ? `${name} ${year}` : key;
}

/**
 * Oy kaliti SAVDO kuni bo'yicha. Ilgari oylar taqqoslovi `toISODate` (UTC)
 * bilan ajratardi: Toshkentda oyning 1-kuni soat 00:00–05:00 dagi buyurtma
 * oldingi oyga tushardi, oy chegaralari esa savdo kuni bo'yicha edi.
 */
const monthKeyOf = (d: Date): string => toBusinessDate(d).slice(0, 7);

// ─────────────────────────── Davrni aniqlash ───────────────────────────

const MONTH_KEY = /^\d{4}-(0[1-9]|1[0-2])$/;

/** `YYYY-MM` ko'rinishidagi oy kalitimi */
export const isMonthKey = (v: unknown): v is string => typeof v === 'string' && MONTH_KEY.test(v);

/** `YYYY-MM` kalitidan davr; kelajakdagi kunlar bugungi sanagacha kesiladi */
function monthPeriod(key: string, now = new Date()): Period {
  const year = Number(key.slice(0, 4));
  const month = Number(key.slice(5, 7));
  const first = new Date(Date.UTC(year, month - 1, 1));
  // `day = 0` — oldingi oyning oxirgi kuni, ya'ni shu oyning oxiri
  const last = new Date(Date.UTC(year, month, 0));
  const today = parseISODate(toBusinessDate(now));
  const to = last.getTime() > today.getTime() ? today : last;
  if (to.getTime() < first.getTime()) return { from: toISODate(first), to: toISODate(first) };
  return { from: toISODate(first), to: toISODate(to) };
}

/** Tarif tarix chuqurligiga qarab davrni qisqartirish */
function clampToPlan(period: Period, plan: PlanId): Period {
  const earliest = toBusinessDate(addDays(new Date(), -getPlan(plan).limits.historyDays));
  if (period.from >= earliest) return period;
  return { from: earliest, to: period.to < earliest ? earliest : period.to };
}

/** `?month=YYYY-MM` ustuvor, aks holda umumiy davr filtri (from/to/preset) */
export function reportPeriod(range: ResolvedRange, plan: PlanId, month?: string | null): Period {
  return isMonthKey(month) ? clampToPlan(monthPeriod(month), plan) : range.period;
}

// ─────────────────────────── Oylik kesim ───────────────────────────

interface ReportSnapshot {
  revenue: number;
  payout: number;
  cogs: number;
  units: number;
  /** Tovarlar bo'yicha foyda — Σ pozitsiya netProfit (top mahsulotlar bilan izchil) */
  itemProfit: number;
  categories: Record<ExpenseCategory, number>;
  expensesTotal: number;
  /** Soliq: pozitsiyalarda ayrilgani + qo'lda kiritilgani ("Davr xarajatlari"dagi qator) */
  taxAmount: number;
  grossProfit: number;
  netProfit: number;
  /** SKU kesimidagi sotuvlar (top mahsulot va kategoriyalar uchun) */
  bySku: Map<string, { units: number; revenue: number; netProfit: number }>;
  /** Davrda buyurtma qilingan va taqdiri hal bo'lgan dona — yakuniylik uchun */
  fate: { ordered: number; completed: number };
  /**
   * Qabul sanasi rejimidagi qaytarish ulushi asosi (splitLine): davrda xaridor
   * qabul qilgan buyurtmalardagi tirik va qaytgan dona. Buyurtma sanasi
   * rejimida ishlatilmaydi — u yerda Boshqaruv paneli kartasi (summarizeReturns).
   */
  received: { sold: number; returned: number };
}

/**
 * Davr bo'yicha moliyaviy kesim — buyurtma pozitsiyalari bitta o'qishda.
 *
 * Pozitsiyalar SKU'siz ham olinadi (Boshqaruv panelidagi collectTotals kabi):
 * Uzum'dan kelgan, lekin katalogda topilmagan tovarning sotuvi ham haqiqiy
 * pul. Ilgari bu yerda `aggregateSales` ishlatilardi va u SKU'siz satrni
 * tashlab yuborardi — hisobot tushumi paneldagidan kam chiqardi.
 *
 * `basis` — pozitsiya davrga qaysi sana bilan tushadi (services/sale-basis.ts).
 * Davr xarajatlari ikkala rejimda ham o'z sanasida (2026-10-27).
 */
async function collectSnapshot(
  companyId: string,
  storeIds: string[],
  from: Date,
  toExclusive: Date,
  storeId: string | undefined,
  now: Date,
  basis: DateBasis,
): Promise<ReportSnapshot> {
  const [items, costs] = await Promise.all([
    storeIds.length
      ? prisma.orderItem.findMany({
          where: lineDateWhere(storeIds, from, toExclusive, basis, now),
          select: {
            skuId: true,
            qty: true,
            returnedQty: true,
            sellPrice: true,
            revenue: true,
            payout: true,
            purchasePrice: true,
            commission: true,
            logistics: true,
            otherCost: true,
            netProfit: true,
            status: true,
            returnedAt: true,
            order: { select: { deliveredAt: true } },
          },
        })
      : Promise.resolve([]),
    // Davr xarajatlari — Boshqaruv paneli va Moliya bilan BIR XIL manba (qo'lda kiritilgan + Uzum saqlash to'lovi)
    getPeriodCosts(companyId, storeIds, from, toExclusive, storeId),
  ]);

  let revenue = 0;
  let payout = 0;
  let cogs = 0;
  let units = 0;
  let commission = 0;
  let logistics = 0;
  let otherCost = 0;
  let itemProfit = 0;
  let itemTax = 0;
  let ordered = 0;
  let completed = 0;
  let receivedSold = 0;
  let receivedReturned = 0;
  const bySku = new Map<string, { units: number; revenue: number; netProfit: number }>();
  const nowMs = now.getTime();

  for (const it of items) {
    /*
     * Yakuniylik — "Qaytarishlar" bilan bitta qoida (services/returns.ts
     * splitLine): bekor qilingan va qaytgan dona taqdiri hal bo'lgan, tirik
     * dona esa xaridor QABUL QILGANDAN keyingina. Kelajakdagi `deliveredAt`
     * (demo ma'lumot) hali yo'lda sanaladi.
     *
     * Qabul sanasi rejimida bu yerga faqat qabul qilingan buyurtmalar keladi
     * (lineDateWhere: deliveredAt ≤ hozir) — har dona `handed`, ya'ni
     * yakunlangan ulushi doim 100%. Bu ATAYLAB: bu rejimda yo'ldagi tovar
     * hisobotda umuman yo'q, shuning uchun "oraliq" bo'lishining yagona sababi
     * — davr hali tugamagani (finalityOf, 'current'). Qabul qilingan tovar
     * keyin qaytishi mumkinligi buyurtma sanasidagi "yakuniy" kabi hisobga
     * olinmaydi: u yerda ham qabul qilingan dona yakunlangan sanaladi.
     */
    const fate = splitLine(it);
    ordered += fate.live + fate.lost;
    const handed = it.order.deliveredAt !== null && it.order.deliveredAt.getTime() <= nowMs;
    completed += fate.lost + (handed ? fate.live : 0);
    if (handed) receivedSold += fate.live;
    if (fate.kind === 'returned') receivedReturned += fate.lost;

    // Bekor qilingan va qaytarilgan pozitsiyalar pulda hisoblanmaydi
    if (it.status === 'canceled' || it.status === 'returned' || it.returnedAt) continue;
    const lineCogs = it.purchasePrice * it.qty;
    revenue += it.revenue;
    payout += it.payout;
    cogs += lineCogs;
    units += it.qty;
    commission += it.commission;
    logistics += it.logistics;
    otherCost += it.otherCost;
    itemProfit += it.netProfit;
    /*
     * Pozitsiyadan aynan qancha soliq ayrilgan: netProfit = to'lov − tannarx −
     * qo'shimcha − soliq (importer.ts, item-cost.ts). Ilgari bu yerda
     * "tushum × joriy stavka" turardi — stavka o'zgargach eski oylarda soliq
     * qatori sof foydaga kirgan soliqdan farq qilib, lenta yopilmasdi.
     */
    itemTax += it.payout - lineCogs - it.otherCost - it.netProfit;
    if (it.skuId) {
      const sku = bySku.get(it.skuId) ?? { units: 0, revenue: 0, netProfit: 0 };
      sku.units += it.qty;
      sku.revenue += it.revenue;
      sku.netProfit += it.netProfit;
      bySku.set(it.skuId, sku);
    }
  }

  const taxAmount = itemTax + costs.tax;
  const categories: Record<ExpenseCategory, number> = {
    commission: commission + costs.commission,
    logistics: logistics + costs.logistics,
    marketing: costs.marketing,
    storage: costs.storage,
    tax: taxAmount,
    salary: costs.salary,
    other: otherCost + costs.other,
  };

  const expensesTotal = CATEGORY_ORDER.reduce((s, c) => s + categories[c], 0);
  const grossProfit = revenue - cogs;

  return {
    revenue,
    payout,
    cogs,
    units,
    itemProfit,
    categories,
    expensesTotal,
    taxAmount,
    grossProfit,
    // Boshqaruv panelidagi `netProfit` bilan aynan bir formula (routes/analytics.ts)
    netProfit: itemProfit - costs.total,
    bySku,
    fate: { ordered, completed },
    received: { sold: receivedSold, returned: receivedReturned },
  };
}

/**
 * Yakuniy yoki oraliq: davr tugaganmi va buyurtma qilingan donaning qanchasi taqdiri hal bo'lgan.
 *
 * Qabul sanasi rejimida `fate` faqat qabul qilingan buyurtmalardan
 * (collectSnapshot) — yakunlangan ulushi 100%, 'in_transit' chiqmaydi: hisobot
 * davr tugashi bilan yakuniy. Bu rejimning ma'nosi ham shu — Uzum oyni qabul
 * sanasi bo'yicha yopadi, keyingi oy qabullari keyingi oyga yoziladi.
 */
function finalityOf(period: Period, fate: ReportSnapshot['fate'], now: Date): MonthlyReportFinality {
  const done = Math.min(fate.completed, fate.ordered);
  const completionPct = fate.ordered > 0 ? pct(done, fate.ordered) : 100;
  // Davr bugun bilan tugasa (joriy oy, "oxirgi 30 kun") — hali yangi buyurtmalar qo'shiladi
  const current = period.to >= toBusinessDate(now);
  const inTransit = completionPct < FINAL_COMPLETION_PCT;
  return {
    status: current || inTransit ? 'preliminary' : 'final',
    reason: current ? 'current' : inTransit ? 'in_transit' : null,
    completionPct,
    thresholdPct: FINAL_COMPLETION_PCT,
    orderedUnits: fate.ordered,
    completedUnits: done,
    inTransitUnits: fate.ordered - done,
  };
}

interface OrderStats {
  total: number;
  success: number;
  canceled: number;
  returned: number;
  /** bekor qilinmagan va qaytarilmagan buyurtmalar (o'rtacha chek uchun) */
  active: number;
  byDelivery: Map<DeliveryType, { orders: number; success: number }>;
}

/**
 * Buyurtma darajasidagi statistika (holat va yetkazish turi kesimida).
 *
 * Qabul sanasi rejimida — davrda xaridor QABUL QILGAN buyurtmalar (pul
 * raqamlari bilan bitta to'plam, services/sale-basis.ts): o'rtacha chek ham,
 * "Jami / Muvaffaqiyatli" ham shulardan. Bekor qilingan buyurtma qabul
 * qilinmaydi, shuning uchun bu rejimda "bekor" deyarli doim 0; "qaytarilgan" —
 * qabul qilib, keyin qaytarilgani (2026-10-27).
 */
async function collectOrderStats(
  storeIds: string[],
  from: Date,
  toExclusive: Date,
  basis: DateBasis,
  now: Date,
): Promise<OrderStats> {
  const stats: OrderStats = {
    total: 0,
    success: 0,
    canceled: 0,
    returned: 0,
    active: 0,
    byDelivery: new Map(DELIVERY_TYPES.map((t) => [t, { orders: 0, success: 0 }])),
  };
  if (storeIds.length === 0) return stats;

  const rows = await prisma.order.findMany({
    where: orderDateWhere(storeIds, from, toExclusive, basis, now),
    select: { status: true, deliveryType: true },
  });

  /*
   * Muvaffaqiyatli = bekor qilinmagan va qaytarilmagan (boshqa sahifalardagi
   * "faol buyurtma" bilan bir xil). Ilgari faqat 'delivered' sanalardi — jonli
   * Uzumda bu "pul chiqarildi" degani va qabuldan ~10 kun keyin qo'yiladi,
   * shuning uchun joriy oy hisobotida 42 tadan 6 tasi "muvaffaqiyatli" (14%)
   * chiqib, qizil ogohlantirish berardi.
   */

  for (const o of rows) {
    stats.total += 1;
    if (o.status === 'canceled') stats.canceled += 1;
    else if (o.status === 'returned') stats.returned += 1;
    else {
      stats.active += 1;
      stats.success += 1;
    }

    const type = (DELIVERY_TYPES as string[]).includes(o.deliveryType)
      ? (o.deliveryType as DeliveryType)
      : 'FBO';
    const bucket = stats.byDelivery.get(type);
    if (bucket) {
      bucket.orders += 1;
      if (o.status !== 'canceled' && o.status !== 'returned') bucket.success += 1;
    }
  }

  return stats;
}

// ─────────────────────────── Avtomatik xulosalar ───────────────────────────

const LEVEL_RANK: Record<Insight['level'], number> = { danger: 0, warning: 1, success: 2, info: 3 };

interface InsightInput {
  periodLabel: string;
  revenue: number;
  netProfit: number;
  grossProfit: number;
  margin: number;
  grossMargin: number;
  avgCheck: number;
  ordersTotal: number;
  ordersSuccess: number;
  /** Bekor qilingan va qaytarilgan BUYURTMALAR soni */
  canceled: number;
  returns: number;
  /** Muvaffaqiyatli buyurtmalar ÷ jami buyurtmalar, % */
  successRate: number;
  /** Qaytarish ulushi DONA bo'yicha — Boshqaruv paneli bilan bir ta'rif (services/returns.ts) */
  returnRate: number;
  returnedUnits: number;
  receivedUnits: number;
  categories: Record<ExpenseCategory, number>;
  expensesTotal: number;
  taxAmount: number;
  topProducts: TopProductRow[];
  categoriesShare: { category: string; revenue: number; share: number }[];
  warehouse: { fbo: number; fboAmount: number; fbs: number; fbsAmount: number };
  daily: TimeSeriesPoint[];
  /** Sana asosi — qaytarish ulushi matni qaysi to'plamdan ekanini aytadi */
  basis: DateBasis;
}

/** Oylik hisobot uchun 3-5 ta xulosa — har biri aniq raqamlar bilan */
function buildInsights(inp: InsightInput): Insight[] {
  const out: Insight[] = [];

  // 1) Oy yakuni
  if (inp.ordersTotal > 0 || inp.revenue > 0) {
    const profitable = inp.netProfit >= 0;
    out.push({
      id: 'month_result',
      level: profitable ? (inp.margin >= 10 ? 'success' : 'warning') : 'danger',
      title: profitable
        ? `${inp.periodLabel}: sof foyda ${money(inp.netProfit)}`
        : `${inp.periodLabel}: zarar ${money(Math.abs(inp.netProfit))}`,
      body: `Tushum ${money(inp.revenue)}, yalpi foyda ${money(inp.grossProfit)} (${num(inp.grossMargin, 1)}%), sof marja ${num(inp.margin, 1)}%. O‘rtacha chek ${money(inp.avgCheck)}.`,
      link: '/finance',
      metric: 'netProfit',
    });
  }

  // 2) Eng katta xarajat moddasi
  const topCost = CATEGORY_ORDER.map((category) => ({ category, amount: inp.categories[category] }))
    .filter((c) => c.amount > 0)
    .sort((a, b) => b.amount - a.amount)[0];
  if (topCost) {
    const shareOfRevenue = pct(topCost.amount, inp.revenue);
    out.push({
      id: 'top_expense',
      level: shareOfRevenue >= 30 ? 'warning' : 'info',
      title: `Eng katta xarajat — ${CATEGORY_LABEL[topCost.category]} ${money(topCost.amount)}`,
      body: `Bu tushumning ${num(shareOfRevenue, 1)}% i va barcha xarajatlarning ${num(pct(topCost.amount, inp.expensesTotal), 1)}% i. Jami xarajatlar ${money(inp.expensesTotal)}, shundan soliq ${money(inp.taxAmount)}.`,
      link: '/finance',
      metric: 'expenses',
    });
  }

  /*
   * 3) Bekor qilingan va qaytarilgan buyurtmalar. Sonlar — BUYURTMA, qaytarish
   * ulushi esa DONA bo'yicha: Boshqaruv paneli kartasi bilan bitta ta'rif
   * (services/returns.ts). Ilgari ulush "qaytgan buyurtma ÷ barcha buyurtma"
   * edi — bir oy uchun panel va hisobot ikki xil "qaytarish ulushi"
   * ko'rsatardi (2026-10-27). Tirik buyurtmadagi qisman qaytish (buyurtma
   * "qaytarilgan" emas, lekin dona qaytgan) ham xulosa beradi.
   */
  const returnBase = inp.receivedUnits + inp.returnedUnits;
  if (inp.ordersTotal > 0 && (inp.canceled > 0 || inp.returns > 0 || inp.returnedUnits > 0)) {
    const lost = inp.canceled + inp.returns;
    // Qabul sanasi rejimida ulush panel kartasi emas — davrda qabul qilingan buyurtmalardan (buildMonthlyReport)
    const rateBase =
      inp.basis === 'receipt' ? 'dona bo‘yicha, davrda qabul qilingan buyurtmalardan' : 'dona bo‘yicha, Boshqaruv panelidagi kabi';
    const rateText =
      returnBase > 0
        ? ` Qaytarish ulushi ${num(inp.returnRate, 1)}% (${rateBase}): xaridorlar ${num(inp.receivedUnits)} dona qabul qildi, ${num(inp.returnedUnits)} dona qaytdi.`
        : ' Qaytarish ulushi hali yo‘q — xaridorlar hali birorta donani qabul qilmagan.';
    out.push({
      id: 'order_quality',
      level:
        inp.successRate < 80 || inp.returnRate >= RETURNS_DANGER_PCT
          ? 'danger'
          : inp.returnRate >= RETURNS_WARN_PCT
            ? 'warning'
            : 'info',
      title: `Buyurtmalarning ${num(inp.successRate, 1)}% i muvaffaqiyatli yakunlangan`,
      body: `${num(inp.ordersTotal)} ta buyurtmadan ${num(inp.canceled)} tasi bekor qilingan, ${num(inp.returns)} tasi qaytarilgan — jami ${num(lost)} ta buyurtma yo‘qotildi.${rateText}`,
      link: '/returns',
      metric: 'successRate',
    });
  }

  // 4) Oyning yetakchi mahsuloti
  const best = inp.topProducts[0];
  if (best && best.revenue > 0) {
    out.push({
      id: 'top_product',
      level: 'success',
      title: `Oyning yetakchisi — “${best.title}”`,
      body: `${num(best.units)} dona sotildi, tushum ${money(best.revenue)} (barcha savdoning ${num(best.share, 1)}% i), foyda ${money(best.profit)} (marja ${num(best.margin, 1)}%). Qoldiqni yetarli ushlab turing.`,
      link: '/products',
      metric: 'revenue',
    });
  }

  // 5) Eng samarali kun
  const bestDay = [...inp.daily].sort((a, b) => b.revenue - a.revenue)[0];
  if (bestDay && bestDay.revenue > 0) {
    out.push({
      id: 'best_day',
      level: 'info',
      title: `Eng kuchli kun — ${bestDay.date}`,
      body: `O‘sha kuni ${num(bestDay.orders)} ta buyurtma va ${money(bestDay.revenue)} tushum qayd etildi. Kunlik o‘rtacha ${money(safeDiv(inp.revenue, Math.max(1, inp.daily.length)))}.`,
      link: '/sales',
      metric: 'revenue',
    });
  }

  // 6) Yetakchi kategoriya
  const topCategory = inp.categoriesShare[0];
  if (topCategory && topCategory.share >= 25) {
    out.push({
      id: 'top_category',
      level: topCategory.share >= 70 ? 'warning' : 'info',
      title: `Savdoning ${num(topCategory.share, 1)}% i — “${topCategory.category}” kategoriyasi`,
      body:
        topCategory.share >= 70
          ? `${money(topCategory.revenue)} tushum bitta kategoriyaga bog‘liq. Assortimentni kengaytirish xavfni kamaytiradi.`
          : `${money(topCategory.revenue)} tushum shu kategoriyadan keldi. Uni kengaytirish eng tez natija beradi.`,
      link: '/abc',
      metric: 'categories',
    });
  }

  // 7) Ombor holati
  const stockUnits = inp.warehouse.fbo + inp.warehouse.fbs;
  if (stockUnits > 0) {
    out.push({
      id: 'warehouse',
      level: 'info',
      title: `Omborda ${num(stockUnits)} dona tovar qoldi`,
      body: `FBO: ${num(inp.warehouse.fbo)} dona (${money(inp.warehouse.fboAmount)}), FBS: ${num(inp.warehouse.fbs)} dona (${money(inp.warehouse.fbsAmount)}). Tannarx bo‘yicha jami ${money(inp.warehouse.fboAmount + inp.warehouse.fbsAmount)}.`,
      link: '/stocks',
      metric: 'stockValue',
    });
  }

  // 8) Ma'lumot yo'q holati
  if (inp.ordersTotal === 0 && inp.revenue === 0) {
    out.push({
      id: 'no_data',
      level: 'info',
      title: `${inp.periodLabel} uchun buyurtma topilmadi`,
      body: 'Boshqa oyni tanlang yoki sinxronizatsiya tugashini kuting — birinchi to‘liq yig‘ish odatda bir necha daqiqa oladi.',
      link: '/settings',
      metric: 'orders',
    });
  }

  // Kamida 3 ta xulosa bo'lishi uchun umumiy holat kartalari
  const fallbacks: Insight[] = [
    {
      id: 'tax_note',
      level: 'info',
      title: `Soliq ${money(inp.taxAmount)}`,
      body: `Davr tushumi ${money(inp.revenue)} bo‘yicha hisoblangan. Soliq stavkasini sozlamalarda o‘zgartirish mumkin.`,
      link: '/settings',
      metric: 'tax',
    },
    {
      id: 'avg_check',
      level: 'info',
      title: `O‘rtacha chek ${money(inp.avgCheck)}`,
      body: `Davrda ${num(inp.ordersTotal)} ta buyurtma, ${num(inp.ordersSuccess)} tasi muvaffaqiyatli. To‘plam va qo‘shimcha savdo chekni oshiradi.`,
      link: '/sales',
      metric: 'avgCheck',
    },
    {
      id: 'margin_note',
      level: 'info',
      title: `Sof marja ${num(inp.margin, 1)}%`,
      body: `Yalpi marja ${num(inp.grossMargin, 1)}%. Farq — komissiya, logistika, ombor va soliq. Unit-iqtisodni tekshiring.`,
      link: '/unit-economics',
      metric: 'margin',
    },
  ];
  for (const f of fallbacks) {
    if (out.length >= 3) break;
    if (!out.some((i) => i.id === f.id)) out.push(f);
  }

  return out.sort((a, b) => LEVEL_RANK[a.level] - LEVEL_RANK[b.level]).slice(0, 5);
}

// ─────────────────────────── Hisobot ───────────────────────────

export interface MonthlyReportInput {
  companyId: string;
  taxRate: number;
  plan: PlanId;
  /** Hisobotga kiradigan do'konlar (getStoreIds — `range.storeId` filtri bilan) */
  storeIds: string[];
  /** resolveRange natijasi: umumiy davr filtri va do'kon */
  range: ResolvedRange;
  /** `YYYY-MM` — berilsa davr shu oy (tarif tarixi chegarasida) */
  month?: string | null;
  /** Sinov uchun: "hozir" (yakuniylik va kunlar chegarasi) */
  now?: Date;
}

/** Oylik hisobot — sahifa, Excel va Telegram nusxasi uchun bitta javob */
export async function buildMonthlyReport(input: MonthlyReportInput): Promise<MonthlyReportResponse> {
  const { companyId, taxRate, plan, storeIds, range } = input;
  const now = input.now ?? new Date();
  const period = reportPeriod(range, plan, input.month);
  const from = businessDayStart(period.from);
  const toExclusive = addDays(businessDayStart(period.to), 1);
  /*
   * Sana asosi (`?basis=`, lib/period.ts): tushum, foyda, dona, buyurtmalar,
   * kunlik grafik, top mahsulot va kategoriyalar — hammasi bitta to'plamdan.
   * Davr xarajatlari va ombor qoldig'i ikkala rejimda bir xil (2026-10-27).
   */
  const basis = range.basis;

  const [snap, stats, catalog, stocks, series, returnsSummary] = await Promise.all([
    collectSnapshot(companyId, storeIds, from, toExclusive, range.storeId, now, basis),
    collectOrderStats(storeIds, from, toExclusive, basis, now),
    getSkuCatalog(storeIds, true),
    getLatestStocks(storeIds),
    getDailySeriesByBasis(storeIds, period, basis),
    /*
     * Qaytarish ulushi — Boshqaruv panelidagi "Qaytarish va bekor qilish"
     * kartasining AYNAN o'zi (routes/returnsSummary.ts → summarizeReturns):
     * qaytgan dona ÷ (xaridor qabul qilgan + qaytgan dona), buyurtma sanasi
     * bo'yicha, xuddi shu "hozir" holatida. Ilgari hisobot "qaytgan buyurtma ÷
     * barcha buyurtma" deb o'zi hisoblardi va bir oy uchun panel bilan ikki xil
     * foiz chiqardi (2026-10-27). Buyurtma sonlari (bekor/qaytarilgan) — son
     * bo'lib qoladi.
     *
     * Qabul sanasi rejimida esa — o'sha formula, lekin davrda QABUL QILINGAN
     * buyurtmalardan (snap.received): hisobotdagi buyurtma sonlari va "qaytarilgan
     * buyurtma" ham shu to'plamdan, karta ichida ikki asos aralashmasin.
     * Olib ketilmagan (qabul qilinmagan) qaytish bu rejimda hech qaysi davrga
     * tushmaydi — Uzumning qabul sanasi bo'yicha hisobotida ham u yo'q.
     */
    basis === 'order' ? summarizeReturns(storeIds, from, toExclusive, now) : Promise.resolve(null),
  ]);

  // Mahsulotga bog'langan reklama to'lovi (mahsulot foydasidan) va davr xarajatlari kunma-kun (grafik uchun)
  const [adBySku, costsByDay] = await Promise.all([
    getAdFeesBySku(
      companyId,
      storeIds,
      from,
      toExclusive,
      new Map([...snap.bySku].map(([id, a]) => [id, a.revenue])),
      range.storeId,
    ),
    getPeriodCostsByDay(companyId, storeIds, from, toExclusive, range.storeId),
  ]);

  // ── Top mahsulotlar (tushum bo'yicha 10 ta) ──
  const topProducts: TopProductRow[] = [...snap.bySku.entries()]
    // Katalogda yo'q — o'chirilgan tovar
    .filter(([skuId]) => catalog.has(skuId))
    .map(([skuId, agg]) => {
      const info: SkuInfo | undefined = catalog.get(skuId);
      const profit = agg.netProfit - (adBySku.get(skuId) ?? 0);
      return {
        skuId,
        sku: info?.sku ?? '—',
        title: info?.title ?? 'Noma’lum SKU',
        productTitle: info?.productTitle,
        imageUrl: info?.imageUrl ?? null,
        revenue: round(agg.revenue),
        profit: round(profit),
        units: agg.units,
        share: pct(agg.revenue, snap.revenue),
        margin: pct(profit, agg.revenue),
      } satisfies TopProductRow;
    })
    .filter((r) => r.units > 0 || r.revenue > 0)
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 10);

  // ── Kategoriyalar ulushi ──
  const byCategory = new Map<string, number>();
  for (const [skuId, agg] of snap.bySku) {
    if (agg.revenue <= 0 || !catalog.has(skuId)) continue;
    const name = catalog.get(skuId)?.category?.trim() || UNKNOWN_CATEGORY;
    byCategory.set(name, (byCategory.get(name) ?? 0) + agg.revenue);
  }
  const categories = [...byCategory.entries()]
    .map(([category, revenue]) => ({ category, revenue: round(revenue), share: pct(revenue, snap.revenue) }))
    .sort((a, b) => b.revenue - a.revenue);

  // ── Ombor (FBO/FBS dona va tannarx bo'yicha summa) ──
  let fbo = 0;
  let fbs = 0;
  let fboAmount = 0;
  let fbsAmount = 0;
  for (const [skuId, st] of stocks) {
    const info = catalog.get(skuId);
    if (!info) continue;
    const unitCost = info.purchasePrice + info.extraCost;
    fbo += st.fbo;
    fbs += st.fbs;
    fboAmount += st.fbo * unitCost;
    fbsAmount += st.fbs * unitCost;
  }
  const warehouse = {
    fbo,
    fboAmount: round(fboAmount),
    fbs,
    fbsAmount: round(fbsAmount),
  };

  // ── Ko'rsatkichlar ──
  // Buyurtmalar bo'yicha (sonlar ulushi) — "Buyurtmalar oqimi"
  const successRate = pct(stats.success, stats.total);
  // Dona bo'yicha — panel kartasi bilan bir xil son (yuqoridagi summarizeReturns); qabul sanasida — qabul qilinganlardan
  const returnedUnits = returnsSummary ? returnsSummary.returned.qty : snap.received.returned;
  const receivedUnits = returnsSummary ? returnsSummary.soldUnits : snap.received.sold;
  const returnRate = returnsSummary
    ? returnsSummary.returned.rate
    : returnsRate('returned', returnedUnits, { soldUnits: receivedUnits, orderedUnits: 0 });
  const grossMargin = pct(snap.grossProfit, snap.revenue);
  const margin = pct(snap.netProfit, snap.revenue);
  const avgCheck = safeDiv(snap.revenue, stats.active);

  const daily: TimeSeriesPoint[] = series.map((row) => ({
    date: row.date,
    revenue: round(row.revenue),
    // Kunlik foyda ham davr xarajatlaridan keyin — kunlar yig'indisi yuqoridagi "Sof foyda"ga teng
    profit: round(row.profit - (costsByDay.get(row.date) ?? 0)),
    orders: row.orders,
    units: row.units,
    payout: round(row.payout),
    returns: row.returns,
  }));

  const insights = buildInsights({
    periodLabel: monthLabel(period.from.slice(0, 7)),
    revenue: snap.revenue,
    netProfit: snap.netProfit,
    grossProfit: snap.grossProfit,
    margin,
    grossMargin,
    avgCheck,
    ordersTotal: stats.total,
    ordersSuccess: stats.success,
    canceled: stats.canceled,
    returns: stats.returned,
    successRate,
    returnRate,
    returnedUnits,
    receivedUnits,
    categories: snap.categories,
    expensesTotal: snap.expensesTotal,
    taxAmount: snap.taxAmount,
    topProducts,
    categoriesShare: categories,
    warehouse,
    daily,
    basis,
  });

  return {
    period,
    revenue: round(snap.revenue),
    grossProfit: round(snap.grossProfit),
    netProfit: round(snap.netProfit),
    payout: round(snap.payout),
    cogs: round(snap.cogs),
    margin,
    finality: finalityOf(period, snap.fate, now),
    avgCheck: round(avgCheck),
    ordersTotal: stats.total,
    ordersSuccess: stats.success,
    unitsSold: snap.units,
    canceled: stats.canceled,
    returns: stats.returned,
    returnRate,
    returnedUnits,
    receivedUnits,
    successRate,
    grossMargin,
    taxRate,
    expenses: CATEGORY_ORDER.map((category) => ({ category, amount: round(snap.categories[category]) })),
    expensesTotal: round(snap.expensesTotal),
    topProducts,
    categories,
    deliveryTypes: DELIVERY_TYPES.map((type) => {
      const agg = stats.byDelivery.get(type) ?? { orders: 0, success: 0 };
      return { type, orders: agg.orders, success: agg.success };
    }),
    warehouse,
    daily,
    insights,
  };
}

// ─────────────────────────── Oxirgi 6 oy taqqoslovi ───────────────────────────

/** Oylar taqqoslovi satri */
export interface MonthCompareRow {
  /** oy kaliti, `YYYY-MM` */
  month: string;
  revenue: number;
  profit: number;
  /** sof marja, % */
  margin: number;
}

/** Bir oy uchun yig'ilayotgan xom qiymatlar */
interface MonthBucket {
  revenue: number;
  /** Σ pozitsiya netProfit — tovarlar bo'yicha foyda */
  itemProfit: number;
  /** davr xarajatlari: qo'lda kiritilgan (uzum-payout'siz) va Uzum saqlash to'lovi */
  periodCosts: number;
}

const emptyBucket = (): MonthBucket => ({ revenue: 0, itemProfit: 0, periodCosts: 0 });

/**
 * Oxirgi 6 oy (joriy oy bilan birga), tarif tarix chuqurligiga qarab qisqartiriladi.
 *
 * Foyda — hisobot sarlavhasi va Boshqaruv paneli bilan bitta ta'rif: tovarlar
 * bo'yicha foyda − davr xarajatlari. Ilgari bu yerda "tushum − tannarx −
 * kategoriyalar" alohida yig'ilardi va joriy oy ustuni yuqoridagi sof
 * foydadan farq qilishi mumkin edi.
 *
 * `basis` — oylar sahifadagi hisobot bilan BITTA sana asosida (`?basis=`):
 * qabul sanasi rejimida tushum va foyda qabul qilingan oyga yoziladi, davr
 * xarajatlari esa o'z sanasida. Aks holda joriy oy ustuni sarlavhadagi sof
 * foydadan, "oldingi oy marjasi" esa hisobotning o'zidan boshqa asosda
 * chiqardi (2026-10-27).
 */
export async function collectMonthCompare(
  companyId: string,
  storeIds: string[],
  plan: PlanId,
  storeId?: string,
  basis: DateBasis = 'order',
): Promise<MonthCompareRow[]> {
  const todayIso = toBusinessDate(new Date());
  const today = parseISODate(todayIso);
  const earliest = addDays(new Date(), -getPlan(plan).limits.historyDays);
  /*
   * Joriy oy BUGUN bilan tugaydi — hisobot sarlavhasidagi "Shu oy" (va joriy
   * oy uchun `?month=`) bilan bitta oyna. Ilgari oy oxirigacha olinardi:
   * kelajak sanasiga yozilgan xarajat (masalan, oy oxiriga kiritilgan ish
   * haqi) faqat shu ustunda ayrilib, joriy oy ustuni sarlavhadagi sof
   * foydadan farq qilardi (2026-10-24).
   */
  const tomorrow = addDays(businessDayStart(todayIso), 1);

  const months: { key: string; from: Date; toExclusive: Date }[] = [];
  for (let back = 5; back >= 0; back -= 1) {
    const first = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - back, 1));
    const next = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 1));
    // Butunlay ruxsat etilgan tarixdan tashqarida qolgan oylarni tashlab ketamiz
    if (next.getTime() <= earliest.getTime()) continue;
    // Oy chegaralari ham savdo kuni bo'yicha: 1-kun Toshkentda 00:00 da boshlanadi
    const monthEnd = businessDayStart(toISODate(next));
    months.push({
      key: toISODate(first).slice(0, 7),
      from: businessDayStart(toISODate(first)),
      toExclusive: monthEnd.getTime() < tomorrow.getTime() ? monthEnd : tomorrow,
    });
  }

  if (months.length === 0) return [];

  const spanFrom = months[0].from;
  const spanTo = months[months.length - 1].toExclusive;
  const buckets = new Map<string, MonthBucket>(months.map((m) => [m.key, emptyBucket()]));

  const [items, manualRows, feeRows] = await Promise.all([
    storeIds.length
      ? basis === 'receipt'
        ? prisma.orderItem.findMany({
            where: lineDateWhere(storeIds, spanFrom, spanTo, basis),
            select: {
              orderedAt: true,
              revenue: true,
              netProfit: true,
              status: true,
              returnedAt: true,
              order: { select: { deliveredAt: true } },
            },
          })
        : prisma.orderItem.findMany({
            where: { orderedAt: { gte: spanFrom, lt: spanTo }, order: { storeId: { in: storeIds } } },
            select: { orderedAt: true, revenue: true, netProfit: true, status: true, returnedAt: true },
          })
      : Promise.resolve([]),
    prisma.expense.findMany({
      where: {
        companyId,
        // /monthly bilan bir xil qoida: yetkazish to'lovi buyurtma satrlarida hisoblangan
        source: { not: 'uzum-payout' },
        date: { gte: spanFrom, lt: spanTo },
        ...(storeId ? { storeId } : {}),
      },
      select: { date: true, amount: true },
    }),
    storeIds.length
      ? prisma.storageFee.findMany({
          where: { storeId: { in: storeIds }, date: { gte: spanFrom, lt: spanTo } },
          select: { date: true, amount: true },
        })
      : Promise.resolve([]),
  ]);

  for (const it of items) {
    // Bekor qilingan va qaytarilgan pozitsiyalar pulda hisoblanmaydi
    if (it.status === 'canceled' || it.status === 'returned' || it.returnedAt) continue;
    // Oy — sana asosi bo'yicha: qabul sanasida xaridor olgan oy (services/sale-basis.ts)
    const bucket = buckets.get(monthKeyOf(lineDate(it, basis)));
    if (!bucket) continue;
    bucket.revenue += it.revenue;
    bucket.itemProfit += it.netProfit;
  }
  for (const r of [...manualRows, ...feeRows]) {
    const bucket = buckets.get(monthKeyOf(r.date));
    if (bucket) bucket.periodCosts += r.amount;
  }

  return months.map(({ key }) => {
    const b = buckets.get(key) ?? emptyBucket();
    const profit = b.itemProfit - b.periodCosts;
    return {
      month: key,
      revenue: round(b.revenue),
      profit: round(profit),
      margin: pct(profit, b.revenue),
    };
  });
}
