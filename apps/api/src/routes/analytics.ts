/**
 * Dashboard va yengil KPI marshrutlari.
 *
 * GET /api/v1/analytics/dashboard     — asosiy sahifa (barcha tariflarda ochiq).
 * GET /api/v1/analytics/kpi           — widget uchun yengil versiya (4 ta ko'rsatkich).
 * GET /api/v1/analytics/cost-coverage — davrda sotilgan donalarning tannarx qamrovi.
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
  businessDayStart,
  toBusinessDate,
  type CostCoverageResponse,
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
import {
  comparablePeriod,
  getAdFeesBySku,
  getNetDailySeries,
  getPeriodCosts,
  getPreviousNetSeries,
  investedIn,
} from '../services/pnl.js';
import { getUzumBalance } from '../services/balance.js';

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
  /** Bir donaga qo'shimcha xarajat (qadoq va h.k.) — tannarx bilan birga ROI maxrajiga kiradi */
  otherCost: number;
  netProfit: number;
  returns: number;
}

export interface PeriodTotals {
  revenue: number;
  payout: number;
  netProfit: number;
  cogs: number;
  otherCost: number;
  commission: number;
  logistics: number;
  units: number;
  /** Qaytgan dona: `returnedQty` (bo'lmasa `qty`), tirik satrdagi qisman qaytish ham */
  returnsUnits: number;
  /**
   * Xaridor qabul qilgan dona (buyurtmada `deliveredAt` bor) — qaytarish
   * foizining asosi. `units` dan farqi: yo'ldagilar kirmaydi.
   */
  handedUnits: number;
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
  otherCost: 0,
  commission: 0,
  logistics: 0,
  units: 0,
  returnsUnits: 0,
  handedUnits: 0,
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
// Eksport: oylik maqsadlar (routes/goals.ts) sof foydani aynan shu hisob bilan oladi — ikki joyda ikki xil raqam chiqmasin
export async function collectTotals(storeIds: string[], from: Date, toExclusive: Date): Promise<PeriodTotals> {
  const t = emptyTotals();
  if (storeIds.length === 0) return t;
  const now = Date.now();

  const orders = await prisma.order.findMany({
    where: { storeId: { in: storeIds }, orderedAt: { gte: from, lt: toExclusive } },
    select: {
      id: true,
      storeId: true,
      status: true,
      deliveredAt: true,
      items: {
        select: {
          skuId: true,
          qty: true,
          revenue: true,
          payout: true,
          netProfit: true,
          purchasePrice: true,
          otherCost: true,
          commission: true,
          logistics: true,
          status: true,
          returnedAt: true,
          returnedQty: true,
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
      /*
       * Sotib olingan = xaridor QABUL QILGAN (kabinetdagi "Qabul sanasi").
       * Uzumning 'delivered' (TO_WITHDRAW) holati esa pul chiqarilganini
       * bildiradi va qabuldan ~10 kun keyin qo'yiladi — u bilan sanalsa
       * joriy oyning qabul qilingan buyurtmalari sotib olish darajasidan
       * tushib qolardi, bekor/qaytganlari esa darhol kirardi.
       */
      if (o.deliveredAt) t.ordersDelivered += 1;
    }

    let orderRevenue = 0;
    for (const it of o.items) {
      const returned = it.status === 'returned' || Boolean(it.returnedAt);
      const skuAgg = it.skuId
        ? t.bySku.get(it.skuId) ??
          ({ units: 0, revenue: 0, payout: 0, cogs: 0, otherCost: 0, netProfit: 0, returns: 0 } satisfies SkuAgg)
        : null;

      /*
       * Qaytgan dona `returnedQty` da: Uzum qaytgan satrda `amount = 0`,
       * `amountReturns = N` yuboradi (importer: qty = 0). Ilgari `qty`
       * sanalardi — jonli do'konda qaytarish foizi doim 0% chiqardi va
       * "returns_up" xulosasi hech qachon ishlamasdi. Tirik satrdagi qisman
       * qaytish ham sanaladi (services/common.ts aggregateSales bilan bir xil)
       * (2026-10-24).
       */
      // Qoida services/returns.ts splitLine bilan bir xil: panel kartasi va "Davr xulosalari" bitta foiz aytsin
      let returnedUnits = 0;
      if (returned) returnedUnits = it.returnedQty > 0 ? it.returnedQty : Math.max(it.qty, 1);
      else if (it.status !== 'canceled') returnedUnits = it.returnedQty;
      t.returnsUnits += returnedUnits;
      if (skuAgg) skuAgg.returns += returnedUnits;

      if (!returned && it.status !== 'canceled') {
        // Qaytarish foizi asosi — faqat xaridor HOZIRGACHA qabul qilgan dona, yo'ldagilar emas (summarizeReturns kabi)
        if (o.deliveredAt && o.deliveredAt.getTime() <= now) t.handedUnits += it.qty;
        t.units += it.qty;
        t.revenue += it.revenue;
        t.payout += it.payout;
        t.netProfit += it.netProfit;
        t.cogs += it.purchasePrice * it.qty;
        t.otherCost += it.otherCost;
        t.commission += it.commission;
        t.logistics += it.logistics;
        orderRevenue += it.revenue;
        if (skuAgg) {
          skuAgg.units += it.qty;
          skuAgg.revenue += it.revenue;
          skuAgg.payout += it.payout;
          skuAgg.netProfit += it.netProfit;
          skuAgg.cogs += it.purchasePrice * it.qty;
          skuAgg.otherCost += it.otherCost;
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

/**
 * MetricValue yasash (digits — kasr xonalari, foizlar uchun 2). `previous`
 * null — oldingi davr bilan taqqoslab bo'lmaydi (services/pnl.ts
 * comparablePeriod): o'zgarish ham, "oldin" qiymati ham yo'q.
 */
const metric = (value: number, previous: number | null, digits = 0): MetricValue => {
  const cur = round(value, digits);
  if (previous === null) return { value: cur, deltaPct: null, previous: null };
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
  /** Oldingi davr bilan taqqoslab bo'lmasa null — "o'sdi" xulosasi chiqmaydi */
  prevReturnsRate: number | null;
  buyoutRate: number;
  ordersTotal: number;
  avgCheck: number;
  stockValue: { units: number; amount: number; fbo: number; fbs: number };
}

const LEVEL_RANK: Record<Insight['level'], number> = { danger: 0, warning: 1, success: 2, info: 3 };

/**
 * "Davr xulosalari" — tanlangan davr bo'yicha 0–6 ta avtomatik xulosa.
 * Har biri aniq raqamlar bilan — foydalanuvchi darhol harakat qila olsin.
 * Bugungi vazifalar (pul bo'yicha) alohida: routes/today.ts.
 */
function buildInsights(inp: InsightInput): Insight[] {
  const out: Insight[] = [];

  // 1) Tugayotgan qoldiqlar
  const ending: { info: SkuInfo; daysLeft: number; total: number }[] = [];
  for (const [skuId, st] of inp.stocks) {
    const info = inp.catalog.get(skuId);
    if (!info || st.total <= 0) continue;
    const avg = inp.avgDaily.get(skuId) ?? 0;
    const state = stockState(st.total, avg, daysSince(inp.lastSale.get(skuId)), daysSince(info.createdAt));
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
    // Hech sotilmagan yangi tovar nolikvid emas — katalogdagi yoshi ham hisobga olinadi
    const idle = inp.lastSale.has(skuId)
      ? daysSince(inp.lastSale.get(skuId))
      : daysSince(info.createdAt);
    if (idle < STOCK_THRESHOLDS.deadDays) continue;
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
  if (inp.prevReturnsRate !== null && inp.returnsRate > 0 && inp.returnsRate >= inp.prevReturnsRate + 1) {
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
      body: 'Boshqa davrni tanlang yoki sinxronizatsiya tugashini kuting — birinchi to‘liq yig‘ish odatda bir necha daqiqa oladi.',
      link: '/settings',
      metric: 'orders',
    });
  }

  /*
   * To'ldiruvchi kartalar ATAYLAB yo'q. Ilgari ro'yxat kamida 3 taga
   * "Omborda N dona tovar", "O'rtacha chek", "Joriy sof marja" bilan
   * to'ldirilardi: ular hech narsa topmagan, lekin topilgan muhim nuqta
   * qiyofasida turardi va toza davrda "Hammasi joyida" holati hech qachon
   * chiqmasdi. Bu raqamlar panelning o'zida bor (2026-10-24).
   * `stockValue` va `avgCheck` kirishda qolgan — faqat shu kartalar uchun edi.
   */
  return out.sort((a, b) => LEVEL_RANK[a.level] - LEVEL_RANK[b.level]).slice(0, 6);
}

// ─────────────────────────── GET /analytics/dashboard ───────────────────────────

router.get(
  '/dashboard',
  ah(async (req, res) => {
    const { company, plan } = companyCtx(req);
    const range = resolveRange(req, plan);
    const storeIds = await getStoreIds(company.id, range.storeId);

    const prevFrom = businessDayStart(range.previous.from);
    const prevToExclusive = addDays(businessDayStart(range.previous.to), 1);

    const [cur, prev, catalog, stocks, avgDaily, lastSale, series, previous, costs, prevCosts, taxRate, storeTitles] = await Promise.all([
      collectTotals(storeIds, range.from, range.toExclusive),
      collectTotals(storeIds, prevFrom, prevToExclusive),
      getSkuCatalog(storeIds, true),
      getLatestStocks(storeIds),
      getAvgDaily(storeIds, 30),
      getLastSaleDates(storeIds),
      // Grafik: kunlik seriya, foyda chizig'idan davr xarajatlari ham kunma-kun ayrilgan
      getNetDailySeries(company.id, storeIds, range.period, range.storeId),
      // Oldingi teng davr — grafikdagi uzuq chiziq, AYNAN shu ta'rifda; tarix yetmasa null
      getPreviousNetSeries(company.id, storeIds, range.previous, plan, range.storeId),
      // Davr xarajatlari — Moliya va Oylik hisobot bilan BIR XIL ta'rif (services/pnl.ts)
      getPeriodCosts(company.id, storeIds, range.from, range.toExclusive, range.storeId),
      getPeriodCosts(company.id, storeIds, prevFrom, prevToExclusive, range.storeId),
      getTaxRate(company.id),
      getStoreTitles(company.id),
    ]);

    // Bugungi/kechagi to'lovlar — savdo kuni (Toshkent) chegaralari bo'yicha
    const todayStart = businessDayStart(toBusinessDate(new Date()));
    const yesterdayStart = addDays(todayStart, -1);
    const tomorrowStart = addDays(todayStart, 1);

    /**
     * Uzum kabinetidagi "Umumiy balans" — Moliya va Pul kalendari bilan bitta
     * manbadan: sotuv − komissiya − xizmatlar − saqlash − yechib olingan pul.
     */
    const uzumBalance = (await getUzumBalance(company.id, storeIds, range.storeId)).total;

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

    /*
     * SOF FOYDA — hamma xarajatdan keyin.
     *
     * Buyurtma pozitsiyasidagi foyda (payout − tannarx − soliq) davr
     * xarajatlarini bilmaydi: omborga logistika, reklama va saqlashni Uzum
     * alohida ushlaydi, ularni bitta buyurtmaga bog'lab bo'lmaydi. Ilgari
     * panel aynan shu "tovarlar bo'yicha" raqamni Sof foyda deb ko'rsatardi:
     * sotuvchi 1 481 078 ko'rardi, hisobiga esa 372 ming kam tushardi.
     * Endi sof foyda, marja va ROI davr xarajatlaridan keyin hisoblanadi.
     */
    const curPeriodOnly = costs.total;
    const curNet = cur.netProfit - curPeriodOnly;
    const prevNet = prev.netProfit - prevCosts.total;

    // Ko'rsatkichlar
    const curMargin = pct(curNet, cur.revenue);
    const prevMargin = pct(prevNet, prev.revenue);
    // ROI maxraji — tovarga sarflangan pul: tannarx va bir donaga qo'shimcha xarajat
    const curRoi = pct(curNet, investedIn(cur.cogs, cur.otherCost));
    const prevRoi = pct(prevNet, investedIn(prev.cogs, prev.otherCost));
    const curAvgCheck = safeDiv(cur.revenue, cur.ordersActive);
    const prevAvgCheck = safeDiv(prev.revenue, prev.ordersActive);
    // Sotib olish darajasi: qabul qilingan / (qabul qilingan + qaytarilgan + bekor qilingan); yo'ldagilar kirmaydi
    const curBuyoutBase = cur.ordersDelivered + cur.ordersReturned + cur.ordersCanceled;
    const prevBuyoutBase = prev.ordersDelivered + prev.ordersReturned + prev.ordersCanceled;
    const curBuyout = pct(cur.ordersDelivered, curBuyoutBase);
    const prevBuyout = pct(prev.ordersDelivered, prevBuyoutBase);
    /*
     * Qaytarish foizi: qaytgan / (xaridor qabul qilgan + qaytgan). Ilgari
     * asosga yo'ldagi dona ham kirardi — hali qaytishi mumkin bo'lmagan tovar
     * foizni pasaytirardi (2026-10-24).
     */
    const curReturns = pct(cur.returnsUnits, cur.handedUnits + cur.returnsUnits);
    const prevReturns = pct(prev.returnsUnits, prev.handedUnits + prev.returnsUnits);

    /*
     * Oldingi teng davr saqlangan tarixdan tashqarida bo'lsa (tarif chegarasi
     * yoki birinchi sinxrondan oldin) u yerdagi nol "sotuv bo'lmagan" emas,
     * "ma'lumot yo'q" degani. Ilgari KPI'lar baribir shu qisman oynaga
     * solishtirilardi: yangi do'konda "90 kun" tanlansa tushum "+302%" o'sardi.
     * Endi grafikdagi uzuq chiziq bilan BITTA qoida (comparablePeriod):
     * taqqoslab bo'lmasa o'zgarish ham, "oldin" qiymati ham yo'q (2026-10-24).
     */
    const was = (v: number): number | null => (previous ? v : null);

    const revenueMetric = metric(cur.revenue, was(prev.revenue));

    /*
     * Xarajatlar tuzilmasi. Har kategoriya = buyurtma pozitsiyalaridagi qism +
     * davr xarajati. Yig'indisi: tushum − tannarx − jami xarajat = sof foyda.
     */
    const taxAmount = round((cur.revenue * taxRate) / 100 + costs.tax);
    const expenses = {
      commission: round(cur.commission + costs.commission),
      logistics: round(cur.logistics + costs.logistics),
      marketing: round(costs.marketing),
      // Uzum saqlash to'lovi (StorageFee) ham shu yerda — ilgari u sof foydadan ayrilmasdi
      storage: round(costs.storage),
      tax: taxAmount,
      // Bir donaga qo'shimcha xarajat, ish haqi va boshqalar bitta ustunda
      other: round(cur.otherCost + costs.other + costs.salary),
      total: 0,
      // Davr xarajatlari — sof foydadan ayrilgan
      periodOnly: round(curPeriodOnly),
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

    // Mahsulotga bog'langan reklama to'lovi — mahsulot foydasi va marjasidan ayriladi
    const adBySku = await getAdFeesBySku(
      company.id,
      storeIds,
      range.from,
      range.toExclusive,
      new Map([...cur.bySku].map(([id, a]) => [id, a.revenue])),
      range.storeId,
    );

    // Top mahsulotlar (tushum bo'yicha 8 ta)
    const topProducts: TopProductRow[] = [...cur.bySku.entries()]
      // Katalogda yo'q — o'chirilgan tovar
      .filter(([skuId]) => catalog.has(skuId))
      .map(([skuId, agg]) => {
        const info = catalog.get(skuId);
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
          share: pct(agg.revenue, cur.revenue),
          margin: pct(profit, agg.revenue),
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
      if (!info) continue;
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
      prevReturnsRate: was(prevReturns),
      buyoutRate: curBuyout,
      ordersTotal: cur.ordersTotal,
      avgCheck: curAvgCheck,
      stockValue,
    });

    const payload: DashboardResponse = {
      period: range.period,
      currency: company.currency,
      revenue: revenueMetric,
      payout: metric(cur.payout, was(prev.payout)),
      netProfit: metric(curNet, was(prevNet)),
      itemProfit: round(cur.netProfit),
      margin: metric(curMargin, was(prevMargin), 2),
      roi: metric(curRoi, was(prevRoi), 2),
      // Bekor qilingan va qaytarilgan buyurtmalar sanoqqa kirmaydi (Sotuv tahlili bilan bir xil)
      ordersCount: metric(cur.ordersActive, was(prev.ordersActive)),
      unitsSold: metric(cur.units, was(prev.units)),
      avgCheck: metric(curAvgCheck, was(prevAvgCheck)),
      buyoutRate: metric(curBuyout, was(prevBuyout), 2),
      returnsRate: metric(curReturns, was(prevReturns), 2),
      paidYesterday: paid.amount,
      expectedToday: expected.amount,
      uzumBalance,
      paidOrdersYesterday: paid.orders,
      expectedOrdersToday: expected.orders,
      expenses,
      series: series satisfies TimeSeriesPoint[],
      /*
       * Oldingi teng davr kunma-kun (i-kun ↔ i-kun) — grafikdagi uzuq chiziq.
       * Yig'indisi KPI'dagi `previous` bilan teng: o'sha oyna, o'sha ta'rif.
       * Joriy seriya bugun bilan tugasa ham bu to'liq uzunlikda qoladi.
       */
      previousSeries: (previous?.series ?? null) satisfies TimeSeriesPoint[] | null,
      comparePeriod: previous?.period ?? null,
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

    const prevFrom = businessDayStart(range.previous.from);
    const prevToExclusive = addDays(businessDayStart(range.previous.to), 1);

    const [cur, prev, costs, prevCosts, comparable] = await Promise.all([
      lightTotals(storeIds, range.from, range.toExclusive),
      lightTotals(storeIds, prevFrom, prevToExclusive),
      getPeriodCosts(company.id, storeIds, range.from, range.toExclusive, range.storeId),
      getPeriodCosts(company.id, storeIds, prevFrom, prevToExclusive, range.storeId),
      // Boshqaruv paneli bilan bir qoida: oldingi davr tarixdan tashqarida bo'lsa o'zgarish yo'q
      comparablePeriod(storeIds, range.previous, plan),
    ]);
    // Sof foyda — davr xarajatlaridan keyin, boshqaruv panelidagi bilan bir xil
    const curNet = cur.netProfit - costs.total;
    const prevNet = prev.netProfit - prevCosts.total;
    const was = (v: number): number | null => (comparable ? v : null);

    const payload: KpiResponse = {
      period: range.period,
      currency: company.currency,
      revenue: metric(cur.revenue, was(prev.revenue)),
      netProfit: metric(curNet, was(prevNet)),
      ordersCount: metric(cur.orders, was(prev.orders)),
      margin: metric(pct(curNet, cur.revenue), was(pct(prevNet, prev.revenue)), 2),
    };

    res.json(payload);
  }),
);

// ─────────────────────────── GET /analytics/cost-coverage ───────────────────────────

/**
 * Tannarx qamrovi — sahifa sarlavhasidagi "Tannarx: 87% sotuvda" chipi uchun.
 *
 * Ilgari foyda raqamlari yonida ular qanchalik ishonchli ekani ko'rinmasdi:
 * tannarxi kiritilmagan SKU sotuvida cogs = 0 va foyda shuncha oshib chiqadi.
 * Ogohlantirish faqat mahsulot kartochkasida (hamma SKU'si tannarxsiz
 * bo'lsagina) va Tannarx sahifasida katalog ulushi sifatida bor edi — davrdagi
 * SOTUV bo'yicha emas (2026-10-24).
 *
 * Qoidalar `collectTotals` (Boshqaruv paneli foydasi) bilan bir xil: davr —
 * buyurtma sanasi (Order.orderedAt), bekor qilingan va qaytgan pozitsiyalar
 * kirmaydi. "Tannarxsiz" — foyda formulasidagi kabi pozitsiyadagi
 * `purchasePrice` 0 (cogs = purchasePrice × qty = 0). Kodda "bepul tovar"
 * degan alohida tushuncha yo'q: tannarx 0 hamma joyda "kiritilmagan" deb
 * o'qiladi (Tannarx sahifasi, SKU holati, qoldiq qiymati).
 */
router.get(
  '/cost-coverage',
  ah(async (req, res) => {
    const { company, plan } = companyCtx(req);
    const range = resolveRange(req, plan);
    const storeIds = await getStoreIds(company.id, range.storeId);

    let soldUnits = 0;
    let revenue = 0;
    let unitsNoCost = 0;
    let revenueNoCost = 0;
    let coveredCogs = 0;
    let coveredRevenue = 0;
    const skusNoCost = new Set<string>();

    if (storeIds.length > 0) {
      // SKU × tannarx bo'yicha bazaning o'zida yig'iladi — katta davrda ham qatorlar tashilmaydi
      const groups = await prisma.orderItem.groupBy({
        by: ['skuId', 'purchasePrice'],
        where: {
          order: { storeId: { in: storeIds }, orderedAt: { gte: range.from, lt: range.toExclusive } },
          // collectTotals'dagi `!returned && status !== 'canceled'` (returned = status 'returned' yoki returnedAt bor)
          status: { notIn: ['canceled', 'returned'] },
          returnedAt: null,
        },
        _sum: { qty: true, revenue: true },
      });

      for (const g of groups) {
        const units = g._sum.qty ?? 0;
        const rev = g._sum.revenue ?? 0;
        soldUnits += units;
        revenue += rev;
        if (g.purchasePrice > 0) {
          coveredCogs += g.purchasePrice * units;
          coveredRevenue += rev;
        } else {
          unitsNoCost += units;
          revenueNoCost += rev;
          if (g.skuId && units > 0) skusNoCost.add(g.skuId);
        }
      }
    }

    const payload: CostCoverageResponse = {
      period: range.period,
      soldUnits,
      unitsNoCost,
      revenue: round(revenue),
      revenueNoCost: round(revenueNoCost),
      skusNoCost: skusNoCost.size,
      // PASTGA yaxlitlanadi: 1000 donadan bittasi tannarxsiz bo'lsa ham "100%" deb ko'rsatmaslik uchun
      pct: soldUnits > 0 ? Math.floor(((soldUnits - unitsNoCost) * 1000) / soldUnits) / 10 : 100,
      estMissingCogs:
        unitsNoCost === 0
          ? 0
          : coveredRevenue > 0
            ? round((coveredCogs / coveredRevenue) * revenueNoCost)
            : null,
    };

    res.json(payload);
  }),
);

export default router;
