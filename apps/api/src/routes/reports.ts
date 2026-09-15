/**
 * Oylik hisobot moduli — /api/v1/reports
 *
 *  GET /monthly  → MonthlyReportResponse (oyning to'liq moliyaviy va sotuv kesimi)
 *  GET /compare  → oxirgi 6 oy taqqoslovi: { month, revenue, profit, margin }[]
 *
 * Davrni tanlash: `?month=YYYY-MM` (o'sha oy) yoki umumiy `from`/`to`/`preset` filtrlari.
 * Tarif tarix chuqurligidan tashqaridagi sanalar avtomatik qisqartiriladi.
 *
 * Foyda hisobi finance.ts bilan bir xil:
 *   grossProfit = tushum − tannarx
 *   netProfit   = grossProfit − barcha xarajatlar (komissiya, logistika, ombor, marketing,
 *                 soliq, ish haqi, boshqa — platforma va qo'lda kiritilganlari birga)
 *
 * Ma'lumot bo'lmasa ham 200 va bo'sh/nol qiymatlar qaytariladi.
 */
import { Router } from 'express';
import { prisma } from '@savdoiq/db';
import {
  addDays,
  formatCompact,
  formatNumber,
  getPlan,
  parseISODate,
  pct,
  round,
  safeDiv,
  toISODate,
  type DeliveryType,
  type ExpenseCategory,
  type Insight,
  type MonthlyReportResponse,
  type Period,
  type PlanId,
  type TimeSeriesPoint,
  type TopProductRow,
} from '@savdoiq/shared';
import { ah } from '../lib/errors.js';
import { companyCtx, requireAuth, requireCompany, requireFeature } from '../lib/auth.js';
import { resolveRange } from '../lib/period.js';
import {
  aggregateSales,
  getDailySeries,
  getExpenses,
  getLatestStocks,
  getSkuCatalog,
  getStoreIds,
  type SkuInfo,
} from '../services/common.js';

const router = Router();
router.use(requireAuth, requireCompany);

// ─────────────────────────── Doimiylar ───────────────────────────

/** Xarajat kategoriyalari — javoblarda doimo shu tartibda */
const CATEGORY_ORDER: ExpenseCategory[] = [
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

const emptyCategories = (): Record<ExpenseCategory, number> => ({
  commission: 0,
  logistics: 0,
  marketing: 0,
  storage: 0,
  tax: 0,
  salary: 0,
  other: 0,
});

const money = (v: number): string => `${formatCompact(Math.round(v), 'uz')} so‘m`;
const num = (v: number, digits = 0): string => formatNumber(v, 'uz', digits);

/** Oy kaliti (2026-09) → "Sentabr 2026" */
function monthLabel(key: string): string {
  const year = Number(key.slice(0, 4));
  const name = MONTHS_UZ[Number(key.slice(5, 7)) - 1];
  return name && Number.isFinite(year) ? `${name} ${year}` : key;
}

const monthKeyOf = (d: Date): string => toISODate(d).slice(0, 7);

// ─────────────────────────── Davrni aniqlash ───────────────────────────

/** `YYYY-MM` kalitidan davr; kelajakdagi kunlar bugungi sanagacha kesiladi */
function monthPeriod(key: string, now = new Date()): Period {
  const year = Number(key.slice(0, 4));
  const month = Number(key.slice(5, 7));
  const first = new Date(Date.UTC(year, month - 1, 1));
  // `day = 0` — oldingi oyning oxirgi kuni, ya'ni shu oyning oxiri
  const last = new Date(Date.UTC(year, month, 0));
  const today = parseISODate(toISODate(now));
  const to = last.getTime() > today.getTime() ? today : last;
  if (to.getTime() < first.getTime()) return { from: toISODate(first), to: toISODate(first) };
  return { from: toISODate(first), to: toISODate(to) };
}

/** Tarif tarix chuqurligiga qarab davrni qisqartirish */
function clampToPlan(period: Period, plan: PlanId): Period {
  const earliest = toISODate(addDays(new Date(), -getPlan(plan).limits.historyDays));
  if (period.from >= earliest) return period;
  return { from: earliest, to: period.to < earliest ? earliest : period.to };
}

// ─────────────────────────── Oylik kesim ───────────────────────────

interface ReportSnapshot {
  revenue: number;
  cogs: number;
  units: number;
  /** buyurtma satrlaridan kelgan sof foyda (top mahsulotlar bilan izchil) */
  itemProfit: number;
  categories: Record<ExpenseCategory, number>;
  expensesTotal: number;
  taxAmount: number;
  grossProfit: number;
  netProfit: number;
  /** SKU kesimidagi sotuvlar (top mahsulot va kategoriyalar uchun) */
  bySku: Map<string, { units: number; revenue: number; netProfit: number }>;
}

/** Davr bo'yicha moliyaviy kesim (finance.ts dagi formulaning aynan o'zi) */
async function collectSnapshot(
  companyId: string,
  storeIds: string[],
  from: Date,
  toExclusive: Date,
  taxRate: number,
  storeId?: string,
): Promise<ReportSnapshot> {
  const [sales, manual, storageAgg] = await Promise.all([
    aggregateSales(storeIds, from, toExclusive),
    getExpenses(companyId, from, toExclusive, storeId),
    prisma.storageFee.aggregate({
      _sum: { amount: true },
      where: { storeId: { in: storeIds }, date: { gte: from, lt: toExclusive } },
    }),
  ]);

  let revenue = 0;
  let cogs = 0;
  let units = 0;
  let commission = 0;
  let logistics = 0;
  let otherCost = 0;
  let itemProfit = 0;
  const bySku = new Map<string, { units: number; revenue: number; netProfit: number }>();

  for (const agg of sales.values()) {
    revenue += agg.revenue;
    cogs += agg.cogs;
    units += agg.units;
    commission += agg.commission;
    logistics += agg.logistics;
    otherCost += agg.otherCost;
    itemProfit += agg.netProfit;
    bySku.set(agg.skuId, { units: agg.units, revenue: agg.revenue, netProfit: agg.netProfit });
  }

  const storage = storageAgg._sum.amount ?? 0;
  const taxAmount = (revenue * taxRate) / 100;

  const categories: Record<ExpenseCategory, number> = {
    commission: commission + manual.commission,
    logistics: logistics + manual.logistics,
    marketing: manual.marketing,
    storage: storage + manual.storage,
    tax: taxAmount + manual.tax,
    salary: manual.salary,
    other: otherCost + manual.other,
  };

  const expensesTotal = CATEGORY_ORDER.reduce((s, c) => s + categories[c], 0);
  const grossProfit = revenue - cogs;

  return {
    revenue,
    cogs,
    units,
    itemProfit,
    categories,
    expensesTotal,
    taxAmount,
    grossProfit,
    netProfit: grossProfit - expensesTotal,
    bySku,
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

/** Buyurtma darajasidagi statistika (holat va yetkazish turi kesimida) */
async function collectOrderStats(storeIds: string[], from: Date, toExclusive: Date): Promise<OrderStats> {
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
    where: { storeId: { in: storeIds }, orderedAt: { gte: from, lt: toExclusive } },
    select: { status: true, deliveryType: true },
  });

  for (const o of rows) {
    stats.total += 1;
    if (o.status === 'canceled') stats.canceled += 1;
    else if (o.status === 'returned') stats.returned += 1;
    else {
      stats.active += 1;
      if (o.status === 'delivered') stats.success += 1;
    }

    const type = (DELIVERY_TYPES as string[]).includes(o.deliveryType)
      ? (o.deliveryType as DeliveryType)
      : 'FBO';
    const bucket = stats.byDelivery.get(type);
    if (bucket) {
      bucket.orders += 1;
      if (o.status === 'delivered') bucket.success += 1;
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
  canceled: number;
  returns: number;
  successRate: number;
  returnRate: number;
  categories: Record<ExpenseCategory, number>;
  expensesTotal: number;
  taxAmount: number;
  topProducts: TopProductRow[];
  categoriesShare: { category: string; revenue: number; share: number }[];
  warehouse: { fbo: number; fboAmount: number; fbs: number; fbsAmount: number };
  daily: TimeSeriesPoint[];
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

  // 3) Bekor qilingan va qaytarilgan buyurtmalar
  if (inp.ordersTotal > 0 && (inp.canceled > 0 || inp.returns > 0)) {
    const lost = inp.canceled + inp.returns;
    out.push({
      id: 'order_quality',
      level: inp.successRate < 80 ? 'danger' : inp.returnRate >= 5 ? 'warning' : 'info',
      title: `Buyurtmalarning ${num(inp.successRate, 1)}% i muvaffaqiyatli yakunlangan`,
      body: `${num(inp.ordersTotal)} ta buyurtmadan ${num(inp.canceled)} tasi bekor qilingan, ${num(inp.returns)} tasi qaytarilgan (qaytarish ulushi ${num(inp.returnRate, 1)}%). Jami ${num(lost)} ta buyurtma yo‘qotildi.`,
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
      body: 'Boshqa oyni tanlang yoki sinxronizatsiya tugashini kuting — birinchi to‘liq yig‘ish ~30 daqiqa davom etadi.',
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
      body: `Davrda ${num(inp.ordersTotal)} ta buyurtma, ${num(inp.ordersSuccess)} tasi yetkazildi. To‘plam va qo‘shimcha savdo chekni oshiradi.`,
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

// ─────────────────────────── GET /monthly ───────────────────────────

router.get(
  '/monthly',
  requireFeature('monthly_reports'),
  ah(async (req, res) => {
    const { company, plan } = companyCtx(req);
    const range = resolveRange(req, plan);
    const q = req.query as Record<string, string | undefined>;

    // `?month=YYYY-MM` ustuvor, aks holda umumiy davr filtri ishlaydi
    const period =
      q.month && /^\d{4}-(0[1-9]|1[0-2])$/.test(q.month) ? clampToPlan(monthPeriod(q.month), plan) : range.period;
    const from = parseISODate(period.from);
    const toExclusive = addDays(parseISODate(period.to), 1);

    const storeIds = await getStoreIds(company.id, range.storeId);
    const taxRate = company.taxRate;

    const [snap, stats, catalog, stocks, series] = await Promise.all([
      collectSnapshot(company.id, storeIds, from, toExclusive, taxRate, range.storeId),
      collectOrderStats(storeIds, from, toExclusive),
      getSkuCatalog(storeIds, true),
      getLatestStocks(storeIds),
      getDailySeries(storeIds, period),
    ]);

    // ── Top mahsulotlar (tushum bo'yicha 10 ta) ──
    const topProducts: TopProductRow[] = [...snap.bySku.entries()]
      .map(([skuId, agg]) => {
        const info: SkuInfo | undefined = catalog.get(skuId);
        return {
          skuId,
          sku: info?.sku ?? '—',
          title: info?.title ?? 'Noma’lum SKU',
          imageUrl: info?.imageUrl ?? null,
          revenue: round(agg.revenue),
          profit: round(agg.netProfit),
          units: agg.units,
          share: pct(agg.revenue, snap.revenue),
          margin: pct(agg.netProfit, agg.revenue),
        } satisfies TopProductRow;
      })
      .filter((r) => r.units > 0 || r.revenue > 0)
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10);

    // ── Kategoriyalar ulushi ──
    const byCategory = new Map<string, number>();
    for (const [skuId, agg] of snap.bySku) {
      if (agg.revenue <= 0) continue;
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
      const unitCost = (info?.purchasePrice ?? 0) + (info?.extraCost ?? 0);
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
    const successRate = pct(stats.success, stats.total);
    const returnRate = pct(stats.returned, stats.total);
    const grossMargin = pct(snap.grossProfit, snap.revenue);
    const margin = pct(snap.netProfit, snap.revenue);
    const avgCheck = safeDiv(snap.revenue, stats.active);

    const daily: TimeSeriesPoint[] = series.map((row) => ({
      date: row.date,
      revenue: round(row.revenue),
      profit: round(row.profit),
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
      categories: snap.categories,
      expensesTotal: snap.expensesTotal,
      taxAmount: snap.taxAmount,
      topProducts,
      categoriesShare: categories,
      warehouse,
      daily,
    });

    const payload: MonthlyReportResponse = {
      period,
      revenue: round(snap.revenue),
      grossProfit: round(snap.grossProfit),
      netProfit: round(snap.netProfit),
      avgCheck: round(avgCheck),
      ordersTotal: stats.total,
      ordersSuccess: stats.success,
      unitsSold: snap.units,
      canceled: stats.canceled,
      returns: stats.returned,
      returnRate,
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

    res.json(payload);
  }),
);

// ─────────────────────────── GET /compare — oxirgi 6 oy ───────────────────────────

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
  cogs: number;
  commission: number;
  logistics: number;
  otherCost: number;
  /** qo'lda kiritilgan xarajatlar (barcha kategoriyalar) */
  manual: number;
  /** pullik saqlash to'lovlari */
  storage: number;
}

const emptyBucket = (): MonthBucket => ({
  revenue: 0,
  cogs: 0,
  commission: 0,
  logistics: 0,
  otherCost: 0,
  manual: 0,
  storage: 0,
});

router.get(
  '/compare',
  requireFeature('monthly_reports'),
  ah(async (req, res) => {
    const { company, plan } = companyCtx(req);
    const range = resolveRange(req, plan);
    const storeIds = await getStoreIds(company.id, range.storeId);
    const taxRate = company.taxRate;

    // Oxirgi 6 oy (joriy oy bilan birga), tarif tarix chuqurligiga qarab qisqartiriladi
    const today = parseISODate(toISODate(new Date()));
    const earliest = addDays(new Date(), -getPlan(plan).limits.historyDays);

    const months: { key: string; from: Date; toExclusive: Date }[] = [];
    for (let back = 5; back >= 0; back -= 1) {
      const first = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - back, 1));
      const next = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 1));
      // Butunlay ruxsat etilgan tarixdan tashqarida qolgan oylarni tashlab ketamiz
      if (next.getTime() <= earliest.getTime()) continue;
      months.push({ key: monthKeyOf(first), from: first, toExclusive: next });
    }

    if (months.length === 0) {
      res.json([] satisfies MonthCompareRow[]);
      return;
    }

    const spanFrom = months[0].from;
    const spanTo = months[months.length - 1].toExclusive;
    const buckets = new Map<string, MonthBucket>(months.map((m) => [m.key, emptyBucket()]));

    const [items, manualRows, feeRows] = await Promise.all([
      storeIds.length
        ? prisma.orderItem.findMany({
            where: { orderedAt: { gte: spanFrom, lt: spanTo }, order: { storeId: { in: storeIds } } },
            select: {
              orderedAt: true,
              qty: true,
              revenue: true,
              purchasePrice: true,
              commission: true,
              logistics: true,
              otherCost: true,
              status: true,
              returnedAt: true,
            },
          })
        : Promise.resolve([]),
      prisma.expense.findMany({
        where: {
          companyId: company.id,
          // /monthly bilan bir xil qoida: yetkazish to'lovi buyurtma satrlarida hisoblangan
          source: { not: 'uzum-payout' },
          date: { gte: spanFrom, lt: spanTo },
          ...(range.storeId ? { storeId: range.storeId } : {}),
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
      const bucket = buckets.get(monthKeyOf(it.orderedAt));
      if (!bucket) continue;
      bucket.revenue += it.revenue;
      bucket.cogs += it.purchasePrice * it.qty;
      bucket.commission += it.commission;
      bucket.logistics += it.logistics;
      bucket.otherCost += it.otherCost;
    }
    for (const r of manualRows) {
      const bucket = buckets.get(monthKeyOf(r.date));
      if (bucket) bucket.manual += r.amount;
    }
    for (const r of feeRows) {
      const bucket = buckets.get(monthKeyOf(r.date));
      if (bucket) bucket.storage += r.amount;
    }

    const payload: MonthCompareRow[] = months.map(({ key }) => {
      const b = buckets.get(key) ?? emptyBucket();
      const expensesTotal =
        b.commission + b.logistics + b.otherCost + b.manual + b.storage + (b.revenue * taxRate) / 100;
      const profit = b.revenue - b.cogs - expensesTotal;
      return {
        month: key,
        revenue: round(b.revenue),
        profit: round(profit),
        margin: pct(profit, b.revenue),
      };
    });

    res.json(payload);
  }),
);

export default router;
