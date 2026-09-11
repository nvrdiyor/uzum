/**
 * Dashboard va yengil KPI marshrutlari.
 *
 * GET /api/v1/analytics/dashboard — asosiy sahifa (barcha tariflarda ochiq).
 * GET /api/v1/analytics/kpi      — widget uchun yengil versiya (4 ta ko'rsatkich).
 *
 * Barcha pul qiymatlari UZS (butun son), sanalar ISO-8601.
 */
import { Router } from 'express';
import { prisma } from '@savdoiq/db';
import type { Prisma } from '@savdoiq/db';
import {
  STOCK_THRESHOLDS,
  addDays,
  deltaPct,
  formatCompact,
  formatNumber,
  parseISODate,
  pct,
  round,
  safeDiv,
  toISODate,
  type DashboardResponse,
  type Insight,
  type MetricValue,
  type Period,
  type TimeSeriesPoint,
  type TopProductRow,
} from '@savdoiq/shared';
import { ah } from '../lib/errors.js';
import { companyCtx, requireAuth, requireCompany } from '../lib/auth.js';
import { resolveRange } from '../lib/period.js';
import {
  daysSince,
  getAvgDaily,
  getDailySeries,
  getExpenses,
  getLastSaleDates,
  getLatestStocks,
  getSkuCatalog,
  getStoreIds,
  getStoreTitles,
  getTaxRate,
  stockState,
  type SkuInfo,
  type StockInfo,
} from '../services/common.js';

const router = Router();
router.use(requireAuth, requireCompany);

/** Widget uchun yengil javob (faqat asosiy 4 ko'rsatkich) */
export interface KpiResponse {
  period: Period;
  currency: string;
  revenue: MetricValue;
  netProfit: MetricValue;
  ordersCount: MetricValue;
  margin: MetricValue;
}

// ─────────────────────────── Ichki yordamchilar ───────────────────────────

interface SkuAgg {
  units: number;
  revenue: number;
  payout: number;
  cogs: number;
  netProfit: number;
  returns: number;
}

interface PeriodTotals {
  revenue: number;
  payout: number;
  netProfit: number;
  cogs: number;
  commission: number;
  logistics: number;
  units: number;
  returnsUnits: number;
  /** Davrdagi barcha buyurtmalar */
  ordersTotal: number;
  /** Bekor qilinmagan va qaytarilmagan buyurtmalar (o'rtacha chek uchun) */
  ordersActive: number;
  ordersDelivered: number;
  ordersCanceled: number;
  ordersReturned: number;
  byStore: Map<string, { revenue: number; orders: number }>;
  bySku: Map<string, SkuAgg>;
}

const emptyTotals = (): PeriodTotals => ({
  revenue: 0,
  payout: 0,
  netProfit: 0,
  cogs: 0,
  commission: 0,
  logistics: 0,
  units: 0,
  returnsUnits: 0,
  ordersTotal: 0,
  ordersActive: 0,
  ordersDelivered: 0,
  ordersCanceled: 0,
  ordersReturned: 0,
  byStore: new Map(),
  bySku: new Map(),
});

/**
 * Davr bo'yicha to'liq yig'indi: buyurtma darajasida (status, do'kon) va
 * SKU darajasida (top mahsulotlar uchun) bir o'tishda hisoblanadi.
 */
async function collectTotals(storeIds: string[], from: Date, toExclusive: Date): Promise<PeriodTotals> {
  const t = emptyTotals();
  if (storeIds.length === 0) return t;

  const orders = await prisma.order.findMany({
    where: { storeId: { in: storeIds }, orderedAt: { gte: from, lt: toExclusive } },
    select: {
      id: true,
      storeId: true,
      status: true,
      items: {
        select: {
          skuId: true,
          qty: true,
          revenue: true,
          payout: true,
          netProfit: true,
          purchasePrice: true,
          commission: true,
          logistics: true,
          status: true,
          returnedAt: true,
        },
      },
    },
  });

  for (const o of orders) {
    t.ordersTotal += 1;
    if (o.status === 'canceled') t.ordersCanceled += 1;
    else if (o.status === 'returned') t.ordersReturned += 1;
    else {
      t.ordersActive += 1;
      if (o.status === 'delivered') t.ordersDelivered += 1;
    }

    let orderRevenue = 0;
    for (const it of o.items) {
      const returned = it.status === 'returned' || Boolean(it.returnedAt);
      const skuAgg = it.skuId
        ? t.bySku.get(it.skuId) ??
          ({ units: 0, revenue: 0, payout: 0, cogs: 0, netProfit: 0, returns: 0 } satisfies SkuAgg)
        : null;

      if (returned) {
        t.returnsUnits += it.qty;
        if (skuAgg) skuAgg.returns += it.qty;
      } else if (it.status !== 'canceled') {
        t.units += it.qty;
        t.revenue += it.revenue;
        t.payout += it.payout;
        t.netProfit += it.netProfit;
        t.cogs += it.purchasePrice * it.qty;
        t.commission += it.commission;
        t.logistics += it.logistics;
        orderRevenue += it.revenue;
        if (skuAgg) {
          skuAgg.units += it.qty;
          skuAgg.revenue += it.revenue;
          skuAgg.payout += it.payout;
          skuAgg.netProfit += it.netProfit;
          skuAgg.cogs += it.purchasePrice * it.qty;
        }
      }

      if (it.skuId && skuAgg) t.bySku.set(it.skuId, skuAgg);
    }

    const store = t.byStore.get(o.storeId) ?? { revenue: 0, orders: 0 };
    store.revenue += orderRevenue;
    store.orders += 1;
    t.byStore.set(o.storeId, store);
  }

  return t;
}

/** Berilgan oyna bo'yicha to'lov (payout) yig'indisi va buyurtmalar soni */
async function payoutWindow(
  storeIds: string[],
  where: Prisma.OrderWhereInput,
): Promise<{ amount: number; orders: number }> {
  if (storeIds.length === 0) return { amount: 0, orders: 0 };
  const rows = await prisma.order.findMany({
    where: { storeId: { in: storeIds }, ...where },
    select: { id: true, items: { select: { payout: true, status: true, returnedAt: true } } },
  });
  let amount = 0;
  for (const o of rows) {
    for (const it of o.items) {
      if (it.status === 'canceled' || it.status === 'returned' || it.returnedAt) continue;
      amount += it.payout;
    }
  }
  return { amount: round(amount), orders: rows.length };
}

/** MetricValue yasash (digits — kasr xonalari, foizlar uchun 2) */
const metric = (value: number, previous: number, digits = 0): MetricValue => {
  const cur = round(value, digits);
  const prev = round(previous, digits);
  return { value: cur, deltaPct: deltaPct(cur, prev), previous: prev };
};

const money = (v: number): string => `${formatCompact(Math.round(v), 'uz')} so‘m`;
const num = (v: number, digits = 0): string => formatNumber(v, 'uz', digits);

// ─────────────────────────── Avtomatik xulosalar ───────────────────────────

interface InsightInput {
  catalog: Map<string, SkuInfo>;
  stocks: Map<string, StockInfo>;
  avgDaily: Map<string, number>;
  lastSale: Map<string, Date>;
  bySku: Map<string, SkuAgg>;
  revenue: MetricValue;
  margin: number;
  returnsRate: number;
  prevReturnsRate: number;
  buyoutRate: number;
  ordersTotal: number;
  avgCheck: number;
  stockValue: { units: number; amount: number; fbo: number; fbs: number };
}

const LEVEL_RANK: Record<Insight['level'], number> = { danger: 0, warning: 1, success: 2, info: 3 };

/**
 * Dashboard uchun 3-6 ta avtomatik xulosa.
 * Har biri aniq raqamlar bilan — foydalanuvchi darhol harakat qila olsin.
 */
function buildInsights(inp: InsightInput): Insight[] {
  const out: Insight[] = [];

  // 1) Tugayotgan qoldiqlar
  const ending: { info: SkuInfo; daysLeft: number; total: number }[] = [];
  for (const [skuId, st] of inp.stocks) {
    const info = inp.catalog.get(skuId);
    if (!info || st.total <= 0) continue;
    const avg = inp.avgDaily.get(skuId) ?? 0;
    const state = stockState(st.total, avg, daysSince(inp.lastSale.get(skuId)));
    if (state.daysLeft !== null && state.daysLeft <= STOCK_THRESHOLDS.low && (state.status === 'critical' || state.status === 'low')) {
      ending.push({ info, daysLeft: state.daysLeft, total: st.total });
    }
  }
  ending.sort((a, b) => a.daysLeft - b.daysLeft);
  const worstStock = ending[0];
  if (worstStock) {
    out.push({
      id: 'stock_ending',
      level: worstStock.daysLeft <= STOCK_THRESHOLDS.critical ? 'danger' : 'warning',
      title: `${worstStock.info.sku} qoldig‘i ${num(worstStock.daysLeft)} kunga yetadi`,
      body:
        ending.length > 1
          ? `“${worstStock.info.title}” — ${num(worstStock.total)} dona qoldi. Jami ${num(ending.length)} ta SKU tugash arafasida, yetkazib berishni bugun rejalashtiring.`
          : `“${worstStock.info.title}” — ${num(worstStock.total)} dona qoldi. Yetkazib berishni bugun rejalashtiring.`,
      link: '/planner',
      metric: 'stock',
    });
  }

  // 2) Zarar keltirayotgan mahsulotlar
  const losing: { info: SkuInfo; profit: number; units: number }[] = [];
  for (const [skuId, agg] of inp.bySku) {
    if (agg.netProfit >= 0 || agg.units <= 0) continue;
    const info = inp.catalog.get(skuId);
    if (!info) continue;
    losing.push({ info, profit: agg.netProfit, units: agg.units });
  }
  losing.sort((a, b) => a.profit - b.profit);
  const worstProfit = losing[0];
  if (worstProfit) {
    out.push({
      id: 'negative_profit',
      level: 'danger',
      title: `“${worstProfit.info.title}” foydasi manfiy`,
      body: `Davrda ${num(worstProfit.units)} dona sotilgan, zarar ${money(Math.abs(worstProfit.profit))}.${
        losing.length > 1 ? ` Yana ${num(losing.length - 1)} ta SKU zarar keltirmoqda.` : ''
      } Narx yoki tannarxni qayta ko‘rib chiqing.`,
      link: '/unit-economics',
      metric: 'netProfit',
    });
  }

  // 3) Nolikvid (harakatsiz) tovarlarda muzlab qolgan pul
  let frozen = 0;
  let frozenSkus = 0;
  let frozenUnits = 0;
  for (const [skuId, st] of inp.stocks) {
    if (st.total <= 0) continue;
    const info = inp.catalog.get(skuId);
    if (!info) continue;
    if (daysSince(inp.lastSale.get(skuId)) < STOCK_THRESHOLDS.deadDays) continue;
    frozen += st.total * (info.purchasePrice + info.extraCost);
    frozenUnits += st.total;
    frozenSkus += 1;
  }
  if (frozen > 0) {
    out.push({
      id: 'illiquid_frozen',
      level: 'warning',
      title: `Nolikvidda ${money(frozen)} muzlab qolgan`,
      body: `${num(frozenSkus)} ta SKU (${num(frozenUnits)} dona) ${num(STOCK_THRESHOLDS.deadDays)} kundan beri sotilmayapti. Chegirma yoki aksiya bilan aylanmaga qaytaring.`,
      link: '/illiquid',
      metric: 'frozen',
    });
  }

  // 4) Qaytarishlar ulushi o'sdi
  if (inp.returnsRate > 0 && inp.returnsRate >= inp.prevReturnsRate + 1) {
    out.push({
      id: 'returns_up',
      level: inp.returnsRate >= 8 ? 'danger' : 'warning',
      title: `Qaytarishlar ulushi ${num(inp.returnsRate, 1)}% ga o‘sdi`,
      body: `Oldingi davrda ${num(inp.prevReturnsRate, 1)}% edi. Sabablarni tekshiring: o‘lcham, sifat yoki tavsif mos kelmayotgan bo‘lishi mumkin.`,
      link: '/returns',
      metric: 'returnsRate',
    });
  }

  // 5) Eng foydali mahsulot
  const best = [...inp.bySku.entries()]
    .map(([skuId, agg]) => ({ info: inp.catalog.get(skuId), agg }))
    .filter((r): r is { info: SkuInfo; agg: SkuAgg } => Boolean(r.info) && r.agg.netProfit > 0)
    .sort((a, b) => b.agg.netProfit - a.agg.netProfit)[0];
  if (best) {
    out.push({
      id: 'best_product',
      level: 'success',
      title: `Eng foydali mahsulot — “${best.info.title}”`,
      body: `Davrda ${num(best.agg.units)} dona sotildi, sof foyda ${money(best.agg.netProfit)} (marja ${num(pct(best.agg.netProfit, best.agg.revenue), 1)}%). Qoldiqni yetarli darajada ushlab turing.`,
      link: '/products',
      metric: 'netProfit',
    });
  }

  // 6) Tushum trendi
  if (inp.revenue.deltaPct !== null && Math.abs(inp.revenue.deltaPct) >= 5 && (inp.revenue.previous ?? 0) > 0) {
    const up = inp.revenue.deltaPct > 0;
    out.push({
      id: 'revenue_trend',
      level: up ? 'success' : 'warning',
      title: `Tushum ${num(Math.abs(inp.revenue.deltaPct), 1)}% ga ${up ? 'o‘sdi' : 'kamaydi'}`,
      body: `Joriy davr: ${money(inp.revenue.value)}, oldingi teng davr: ${money(inp.revenue.previous ?? 0)}.`,
      link: '/sales',
      metric: 'revenue',
    });
  }

  // 7) Past marja
  if (inp.revenue.value > 0 && inp.margin < 10) {
    out.push({
      id: 'low_margin',
      level: inp.margin < 0 ? 'danger' : 'warning',
      title: `Sof marja atigi ${num(inp.margin, 1)}%`,
      body: `Har 100 000 so‘m tushumdan ${money((inp.margin * 100_000) / 100)} foyda qolmoqda. Unit-iqtisodni qayta hisoblang: komissiya, logistika va tannarxni tekshiring.`,
      link: '/unit-economics',
      metric: 'margin',
    });
  }

  // 8) Past sotib olish darajasi
  if (inp.ordersTotal >= 10 && inp.buyoutRate > 0 && inp.buyoutRate < 80) {
    out.push({
      id: 'low_buyout',
      level: 'warning',
      title: `Sotib olish darajasi ${num(inp.buyoutRate, 1)}%`,
      body: `Har 5 ta buyurtmadan kamida bittasi yetib bormayapti. Yetkazib berish turi va mahsulot kartochkasini tekshiring.`,
      link: '/sales',
      metric: 'buyoutRate',
    });
  }

  // 9) Ma'lumot yo'q holati
  if (inp.ordersTotal === 0 && inp.revenue.value === 0) {
    out.push({
      id: 'no_data',
      level: 'info',
      title: 'Tanlangan davrda buyurtma yo‘q',
      body: 'Boshqa davrni tanlang yoki sinxronizatsiya tugashini kuting — birinchi to‘liq yig‘ish ~30 daqiqa davom etadi.',
      link: '/settings',
      metric: 'orders',
    });
  }

  // Kamida 3 ta xulosa bo'lishi uchun umumiy holat kartalari
  const fallbacks: Insight[] = [
    {
      id: 'stock_value',
      level: 'info',
      title: `Omborda ${num(inp.stockValue.units)} dona tovar`,
      body: `Tannarx bo‘yicha qiymati ${money(inp.stockValue.amount)}. FBO: ${num(inp.stockValue.fbo)} dona, FBS: ${num(inp.stockValue.fbs)} dona.`,
      link: '/stocks',
      metric: 'stockValue',
    },
    {
      id: 'avg_check',
      level: 'info',
      title: `O‘rtacha chek ${money(inp.avgCheck)}`,
      body: `Davrda ${num(inp.ordersTotal)} ta buyurtma qayd etildi. Chekni oshirish uchun to‘plam va qo‘shimcha savdoni sinab ko‘ring.`,
      link: '/sales',
      metric: 'avgCheck',
    },
    {
      id: 'margin_now',
      level: 'info',
      title: `Joriy sof marja ${num(inp.margin, 1)}%`,
      body: `Tushum ${money(inp.revenue.value)}. Marja 15% dan yuqori bo‘lsa biznes barqaror hisoblanadi.`,
      link: '/finance',
      metric: 'margin',
    },
  ];
  for (const f of fallbacks) {
    if (out.length >= 3) break;
    if (!out.some((i) => i.id === f.id)) out.push(f);
  }

  return out.sort((a, b) => LEVEL_RANK[a.level] - LEVEL_RANK[b.level]).slice(0, 6);
}

// ─────────────────────────── GET /analytics/dashboard ───────────────────────────

router.get(
  '/dashboard',
  ah(async (req, res) => {
    const { company, plan } = companyCtx(req);
    const range = resolveRange(req, plan);
    const storeIds = await getStoreIds(company.id, range.storeId);

    const prevFrom = parseISODate(range.previous.from);
    const prevToExclusive = addDays(parseISODate(range.previous.to), 1);

    const [cur, prev, catalog, stocks, avgDaily, lastSale, series, exp, taxRate, storeTitles] = await Promise.all([
      collectTotals(storeIds, range.from, range.toExclusive),
      collectTotals(storeIds, prevFrom, prevToExclusive),
      getSkuCatalog(storeIds, true),
      getLatestStocks(storeIds),
      getAvgDaily(storeIds, 30),
      getLastSaleDates(storeIds),
      getDailySeries(storeIds, range.period),
      getExpenses(company.id, range.from, range.toExclusive, range.storeId),
      getTaxRate(company.id),
      getStoreTitles(company.id),
    ]);

    // Bugungi/kechagi to'lovlar — UTC kun chegaralari bo'yicha
    const todayStart = parseISODate(toISODate(new Date()));
    const yesterdayStart = addDays(todayStart, -1);
    const tomorrowStart = addDays(todayStart, 1);

    const [paid, expected] = await Promise.all([
      // Kecha yetkazilgan buyurtmalar bo'yicha to'lov
      payoutWindow(storeIds, { deliveredAt: { gte: yesterdayStart, lt: todayStart } }),
      // Bugun kutilayotgan: bugun yetkazilgan yoki jarayondagi buyurtmalar
      payoutWindow(storeIds, {
        status: { in: ['delivered', 'processing'] },
        OR: [
          { deliveredAt: { gte: todayStart, lt: tomorrowStart } },
          { deliveredAt: null, orderedAt: { gte: todayStart, lt: tomorrowStart } },
        ],
      }),
    ]);

    // Ko'rsatkichlar
    const curMargin = pct(cur.netProfit, cur.revenue);
    const prevMargin = pct(prev.netProfit, prev.revenue);
    const curRoi = pct(cur.netProfit, cur.cogs);
    const prevRoi = pct(prev.netProfit, prev.cogs);
    const curAvgCheck = safeDiv(cur.revenue, cur.ordersActive);
    const prevAvgCheck = safeDiv(prev.revenue, prev.ordersActive);
    // Sotib olish darajasi: yetkazilgan / (yetkazilgan + qaytarilgan + bekor qilingan)
    const curBuyoutBase = cur.ordersDelivered + cur.ordersReturned + cur.ordersCanceled;
    const prevBuyoutBase = prev.ordersDelivered + prev.ordersReturned + prev.ordersCanceled;
    const curBuyout = pct(cur.ordersDelivered, curBuyoutBase);
    const prevBuyout = pct(prev.ordersDelivered, prevBuyoutBase);
    const curReturns = pct(cur.returnsUnits, cur.units + cur.returnsUnits);
    const prevReturns = pct(prev.returnsUnits, prev.units + prev.returnsUnits);

    const revenueMetric = metric(cur.revenue, prev.revenue);

    // Xarajatlar: komissiya/logistika buyurtmalardan, qolganlari Expense jadvalidan
    const taxAmount = exp.tax > 0 ? round(exp.tax) : round((cur.revenue * taxRate) / 100);
    const expenses = {
      // Uzum "Xizmatlarga to'lov" bo'limidagi summalar ham qo'shiladi
      // (omborga yetkazish, mijozga yetkazish, qaytarishlar) — Expense jadvalidan
      commission: round(cur.commission + exp.commission),
      logistics: round(cur.logistics + exp.logistics),
      marketing: round(exp.marketing),
      storage: round(exp.storage),
      tax: taxAmount,
      // Ish haqi va boshqa xarajatlar bitta ustunda
      other: round(exp.other + exp.salary),
      total: 0,
    };
    expenses.total =
      expenses.commission + expenses.logistics + expenses.marketing + expenses.storage + expenses.tax + expenses.other;

    // Do'konlar kesimi
    const storesBreakdown = [...cur.byStore.entries()]
      .map(([storeId, v]) => ({
        storeId,
        title: storeTitles.get(storeId) ?? 'Do‘kon',
        revenue: round(v.revenue),
        orders: v.orders,
      }))
      .sort((a, b) => b.revenue - a.revenue);

    // Top mahsulotlar (tushum bo'yicha 8 ta)
    const topProducts: TopProductRow[] = [...cur.bySku.entries()]
      .map(([skuId, agg]) => {
        const info = catalog.get(skuId);
        return {
          skuId,
          sku: info?.sku ?? '—',
          title: info?.title ?? 'Noma’lum SKU',
          imageUrl: info?.imageUrl ?? null,
          revenue: round(agg.revenue),
          profit: round(agg.netProfit),
          units: agg.units,
          share: pct(agg.revenue, cur.revenue),
          margin: pct(agg.netProfit, agg.revenue),
        } satisfies TopProductRow;
      })
      .filter((r) => r.units > 0 || r.revenue > 0)
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 8);

    // Qoldiq qiymati (tannarx bo'yicha)
    let stockUnits = 0;
    let stockAmount = 0;
    let stockFbo = 0;
    let stockFbs = 0;
    for (const [skuId, st] of stocks) {
      const info = catalog.get(skuId);
      stockUnits += st.total;
      stockFbo += st.fbo;
      stockFbs += st.fbs;
      stockAmount += st.total * ((info?.purchasePrice ?? 0) + (info?.extraCost ?? 0));
    }
    const stockValue = {
      units: stockUnits,
      amount: round(stockAmount),
      fbo: stockFbo,
      fbs: stockFbs,
    };

    const insights = buildInsights({
      catalog,
      stocks,
      avgDaily,
      lastSale,
      bySku: cur.bySku,
      revenue: revenueMetric,
      margin: curMargin,
      returnsRate: curReturns,
      prevReturnsRate: prevReturns,
      buyoutRate: curBuyout,
      ordersTotal: cur.ordersTotal,
      avgCheck: curAvgCheck,
      stockValue,
    });

    const payload: DashboardResponse = {
      period: range.period,
      currency: company.currency,
      revenue: revenueMetric,
      payout: metric(cur.payout, prev.payout),
      netProfit: metric(cur.netProfit, prev.netProfit),
      margin: metric(curMargin, prevMargin, 2),
      roi: metric(curRoi, prevRoi, 2),
      ordersCount: metric(cur.ordersTotal, prev.ordersTotal),
      unitsSold: metric(cur.units, prev.units),
      avgCheck: metric(curAvgCheck, prevAvgCheck),
      buyoutRate: metric(curBuyout, prevBuyout, 2),
      returnsRate: metric(curReturns, prevReturns, 2),
      paidYesterday: paid.amount,
      expectedToday: expected.amount,
      paidOrdersYesterday: paid.orders,
      expectedOrdersToday: expected.orders,
      expenses,
      series: series satisfies TimeSeriesPoint[],
      storesBreakdown,
      topProducts,
      insights,
      stockValue,
    };

    res.json(payload);
  }),
);

// ─────────────────────────── GET /analytics/kpi ───────────────────────────

/** Widget uchun yengil yig'indi (buyurtma pozitsiyalari darajasida) */
async function lightTotals(
  storeIds: string[],
  from: Date,
  toExclusive: Date,
): Promise<{ revenue: number; netProfit: number; orders: number }> {
  if (storeIds.length === 0) return { revenue: 0, netProfit: 0, orders: 0 };
  const items = await prisma.orderItem.findMany({
    where: { orderedAt: { gte: from, lt: toExclusive }, order: { storeId: { in: storeIds } } },
    select: { revenue: true, netProfit: true, status: true, returnedAt: true, orderId: true },
  });
  let revenue = 0;
  let netProfit = 0;
  const orderIds = new Set<string>();
  for (const it of items) {
    const returned = it.status === 'returned' || Boolean(it.returnedAt);
    if (returned || it.status === 'canceled') continue;
    revenue += it.revenue;
    netProfit += it.netProfit;
    orderIds.add(it.orderId);
  }
  return { revenue, netProfit, orders: orderIds.size };
}

router.get(
  '/kpi',
  ah(async (req, res) => {
    const { company, plan } = companyCtx(req);
    const range = resolveRange(req, plan);
    const storeIds = await getStoreIds(company.id, range.storeId);

    const prevFrom = parseISODate(range.previous.from);
    const prevToExclusive = addDays(parseISODate(range.previous.to), 1);

    const [cur, prev] = await Promise.all([
      lightTotals(storeIds, range.from, range.toExclusive),
      lightTotals(storeIds, prevFrom, prevToExclusive),
    ]);

    const payload: KpiResponse = {
      period: range.period,
      currency: company.currency,
      revenue: metric(cur.revenue, prev.revenue),
      netProfit: metric(cur.netProfit, prev.netProfit),
      ordersCount: metric(cur.orders, prev.orders),
      margin: metric(pct(cur.netProfit, cur.revenue), pct(prev.netProfit, prev.revenue), 2),
    };

    res.json(payload);
  }),
);

export default router;
