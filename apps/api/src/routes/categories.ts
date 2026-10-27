/**
 * "Kategoriyalarim" — /api/v1/growth/categories
 *
 *  GET / → CategoriesResponse: sotuvchining O'Z katalogidagi har bir
 *          kategoriya (Product.category) tanlangan davrda qancha pul
 *          qoldirdi, qanchasi qaytdi va qancha pul qoldiqda turibdi.
 *
 * FAQAT O'Z MA'LUMOTI. Bozor, raqobatchilar yoki Uzum vitrinasi ATAYLAB
 * o'qilmaydi (scrape qilinmaydi): bu yerdagi har bir raqam sotuvchining
 * kalitidan sinxron qilingan buyurtma, katalog va qoldiqdan. Shuning uchun
 * sahifa "bozordagi ulush" emas, "mening savdomdagi ulush"ni ko'rsatadi
 * (2026-10-24).
 *
 * TA'RIFLAR — har biri boshqa sahifadagi bilan BITTA:
 *  • tushum, komissiya, sof foyda, marja — "Mahsulot foydasi" hisobi
 *    (services/product-profit.ts): kategoriyalar yig'indisi o'sha sahifadagi
 *    mahsulotlar yig'indisiga so'mgacha teng. Mahsulotga bog'lab bo'lmaydigan
 *    xarajatlar (`unallocated`) u yerdagidek kategoriyaga taqsimlanmaydi —
 *    taqsimlash qoidasini o'ylab topish raqamni "aniq"dek ko'rsatib, aslida
 *    taxmin bo'lardi;
 *  • qaytarish / bekor qilish ulushi — services/returns.ts (`splitLine`):
 *    qaytgan ÷ (xaridor qabul qilgan + qaytgan), bekor ÷ buyurtma qilingan
 *    barcha dona; davr buyurtma sanasi bo'yicha. Ikkala davr ham HOZIRGI
 *    holat bilan — Boshqaruv panelidagi qaytarish kartasi (returnsSummary.ts)
 *    bilan bir xil sabab: qaytgan dona sanasini Uzum bermaydi;
 *  • qoldiq qiymati — "Qoldiqlar" sahifasi (stocks.ts): qoldiq × (tannarx +
 *    qo'shimcha), arxivdagi SKU ham (yashirilgan mahsulotnikidan tashqari);
 *  • muzlagan (nolikvid) qoldiq — "Nolikvidlar" sahifasi qoidasi
 *    (products.ts GET /illiquid): 30+ kun sotilmagan yoki qoldiq 90 kundan
 *    ortiqqa yetadi. Qoldiq — HOZIRGI holat, davr filtriga bog'liq emas.
 *
 * TAQQOSLASH (`?compare=`) — lib/period.ts `range.previous`. Oldingi davr
 * saqlangan tarixdan tashqarida bo'lsa (services/pnl.ts comparablePeriod)
 * oldingi qiymatlar ham, o'zgarishlar ham null: u yerdagi nol "sotuv
 * bo'lmagan" emas, "ma'lumot yo'q" degani. Oldingi davr mahsulotlari HOZIRGI
 * kategoriyasi bo'yicha guruhlanadi — sotuvchi tovarni boshqa kategoriyaga
 * o'tkazgan bo'lsa ham, solishtirish bir xil to'plam bo'yicha.
 */
import { Router } from 'express';
import { prisma } from '@savdoiq/db';
import type { Prisma } from '@savdoiq/db';
import {
  STOCK_THRESHOLDS,
  addDays,
  businessDayStart,
  deltaPct,
  pct,
  round,
  type CategoriesResponse,
  type CategoryDeltas,
  type CategoryMetrics,
  type CategoryPrevious,
  type CategoryProduct,
  type CategoryRow,
  type Period,
  type ProductProfitRow,
} from '@savdoiq/shared';
import { ah } from '../lib/errors.js';
import { companyCtx, requireAuth, requireCompany, requireFeature } from '../lib/auth.js';
import { resolveRange, type ResolvedRange } from '../lib/period.js';
import { daysSince, getAvgDaily, getLastSaleDates, getLatestStocks, getSkuCatalog, getStoreIds } from '../services/common.js';
import { comparablePeriod } from '../services/pnl.js';
import { buildProductProfit } from '../services/product-profit.js';
import { splitLine } from '../services/returns.js';

const router = Router();
router.use(requireAuth, requireCompany);

// ─────────────────────────── Chegaralar ───────────────────────────

/**
 * Nolikvid: shuncha kundan beri sotilmagan — products.ts GET /illiquid dagi
 * ILLIQUID_DAYS bilan bir xil (u yerda eksport qilinmagan konstanta; o'zgarsa
 * ikkalasi birga). "Ortiqcha" chegarasi — umumiy STOCK_THRESHOLDS.excess.
 */
const ILLIQUID_DAYS = 30;
/** O'rtacha kunlik sotuv oynasi — Nolikvidlar sahifasidagi getAvgDaily(…, 30) bilan bir xil */
const ILLIQUID_AVG_WINDOW = 30;
/** Qator ochilganda ko'rinadigan eng foydali mahsulotlar soni */
const TOP_PRODUCTS = 5;

// ─────────────────────────── Yig'ish ───────────────────────────

type CategoryKey = string | null;

/** Kategoriya nomi: bo'sh matn — kategoriyasiz (importer ham shunday saqlaydi, bu yerda — himoya) */
const keyOf = (raw: string | null | undefined): CategoryKey => raw?.trim() || null;

/** Bitta kategoriya (yoki davr jami) bo'yicha buyurtma qilingan donalarning holati */
interface LineBucket {
  ordered: number;
  /** Xaridor qabul qilgan tirik dona — qaytarish ulushining asosi */
  handed: number;
  canceled: number;
  returned: number;
}

const emptyLines = (): LineBucket => ({ ordered: 0, handed: 0, canceled: 0, returned: 0 });

const LINE_SELECT = {
  skuId: true,
  qty: true,
  returnedQty: true,
  sellPrice: true,
  revenue: true,
  status: true,
  returnedAt: true,
  order: { select: { deliveredAt: true } },
} as const satisfies Prisma.OrderItemSelect;

/**
 * Davrda BUYURTMA qilingan pozitsiyalar SKU kesimida — services/returns.ts
 * `buildSummary` bilan aynan bir xil bo'linish (`splitLine`): yo'qotilgan
 * dona turi bo'yicha, tirik dona `deliveredAt` hozirdan kech bo'lmasa
 * "xaridor qabul qildi" (kelajakdagi sana — demo ma'lumotda bor — hali yo'lda).
 *
 * "Mahsulot foydasi" xarid foizi uchun xuddi shu pozitsiyalarni o'qiydi, lekin
 * bekor qilingan va qaytgan donani alohida bermaydi — shu sabab ikkinchi
 * o'qish. SKU'siz satrlar kategoriyaga bog'lanmaydi va tushib qoladi
 * (ular "Mahsulot foydasi" da ham yo'q).
 */
async function collectLines(
  storeIds: string[],
  from: Date,
  toExclusive: Date,
  asOf: number,
): Promise<Map<string, LineBucket>> {
  const out = new Map<string, LineBucket>();
  if (storeIds.length === 0) return out;
  const items = await prisma.orderItem.findMany({
    where: { orderedAt: { gte: from, lt: toExclusive }, order: { storeId: { in: storeIds } }, skuId: { not: null } },
    select: LINE_SELECT,
  });
  for (const it of items) {
    if (!it.skuId) continue;
    const s = splitLine(it);
    const b = out.get(it.skuId) ?? emptyLines();
    b.ordered += s.live + s.lost;
    if (s.kind === 'canceled') b.canceled += s.lost;
    else if (s.kind === 'returned') b.returned += s.lost;
    const deliveredAt = it.order.deliveredAt;
    if (deliveredAt !== null && deliveredAt.getTime() <= asOf) b.handed += s.live;
    out.set(it.skuId, b);
  }
  return out;
}

/** Ulushlar — services/returns.ts `returnsRate` bilan bir xil asos; asosi yo'q bo'lsa null ("0%" emas) */
function ratesOf(b: LineBucket): { returnRate: number | null; cancelRate: number | null } {
  const base = b.handed + b.returned;
  return {
    returnRate: base > 0 ? pct(b.returned, base) : null,
    cancelRate: b.ordered > 0 ? pct(b.canceled, b.ordered) : null,
  };
}

/** Bitta kategoriyaning yig'ilayotgan ko'rsatkichlari */
interface Agg {
  revenue: number;
  units: number;
  commission: number;
  logistics: number;
  netProfit: number;
  lines: LineBucket;
  products: ProductProfitRow[];
  sellingSkus: Set<string>;
  skuCount: number;
  stockUnits: number;
  stockValue: number;
  frozenValue: number;
  frozenSkus: number;
  /** Taqqoslash davri */
  prev: { revenue: number; units: number; netProfit: number; lines: LineBucket };
}

const emptyAgg = (): Agg => ({
  revenue: 0,
  units: 0,
  commission: 0,
  logistics: 0,
  netProfit: 0,
  lines: emptyLines(),
  products: [],
  sellingSkus: new Set(),
  skuCount: 0,
  stockUnits: 0,
  stockValue: 0,
  frozenValue: 0,
  frozenSkus: 0,
  prev: { revenue: 0, units: 0, netProfit: 0, lines: emptyLines() },
});

function addLines(into: LineBucket, b: LineBucket): void {
  into.ordered += b.ordered;
  into.handed += b.handed;
  into.canceled += b.canceled;
  into.returned += b.returned;
}

/** Taqqoslash davri uchun o'sha ResolvedRange — product-profit faqat chegaralar va davrni o'qiydi */
function rangeFor(range: ResolvedRange, period: Period): ResolvedRange {
  const from = businessDayStart(period.from);
  const to = businessDayStart(period.to);
  return { ...range, period, from, to, toExclusive: addDays(to, 1) };
}

/** Pul va ulushlar — kategoriya ham, jami ham bitta formula bilan */
function metricsOf(a: { revenue: number; units: number; commission: number; logistics: number; netProfit: number; lines: LineBucket }): CategoryMetrics {
  return {
    revenue: round(a.revenue),
    units: a.units,
    commission: round(a.commission),
    logistics: round(a.logistics),
    netProfit: round(a.netProfit),
    margin: pct(a.netProfit, a.revenue),
    commissionShare: a.revenue > 0 ? pct(a.commission, a.revenue) : null,
    orderedUnits: a.lines.ordered,
    returnedUnits: a.lines.returned,
    canceledUnits: a.lines.canceled,
    ...ratesOf(a.lines),
  };
}

/**
 * Foiz punktidagi o'zgarish — returnsSummary.ts `ppDelta` qoidasi: ikki
 * davrdan birida asos bo'lmasa null ("0% → 5%" "+5 p.p. yomonlashdi" emas).
 */
const ppDelta = (cur: number | null, prev: number | null): number | null =>
  cur === null || prev === null ? null : round(cur - prev, 1);

const NO_DELTAS: CategoryDeltas = {
  revenue: null,
  units: null,
  netProfit: null,
  margin: null,
  returnRate: null,
  revenueShare: null,
};

function previousOf(
  p: Agg['prev'],
  totalPrevRevenue: number,
): CategoryPrevious {
  return {
    revenue: round(p.revenue),
    units: p.units,
    netProfit: round(p.netProfit),
    margin: pct(p.netProfit, p.revenue),
    returnRate: ratesOf(p.lines).returnRate,
    revenueShare: totalPrevRevenue > 0 ? pct(p.revenue, totalPrevRevenue) : 0,
  };
}

function deltasOf(
  cur: CategoryMetrics & { revenueShare: number | null },
  prev: CategoryPrevious,
  sharesComparable: boolean,
): CategoryDeltas {
  return {
    revenue: deltaPct(cur.revenue, prev.revenue),
    units: deltaPct(cur.units, prev.units),
    netProfit: deltaPct(cur.netProfit, prev.netProfit),
    // Marja faqat ikkala davrda ham tushum bo'lsa solishtiriladi — tushumsiz davrda "0%" marja yo'q narsa
    margin: cur.revenue > 0 && prev.revenue > 0 ? round(cur.margin - prev.margin, 1) : null,
    returnRate: ppDelta(cur.returnRate, prev.returnRate),
    revenueShare: sharesComparable && cur.revenueShare !== null ? round(cur.revenueShare - prev.revenueShare, 1) : null,
  };
}

/** Kategoriyasiz guruh oxirida, qolganlari: sof foyda → tushum → qoldiq qiymati → nom */
function compareRows(a: CategoryRow, b: CategoryRow): number {
  if ((a.category === null) !== (b.category === null)) return a.category === null ? 1 : -1;
  return (
    b.netProfit - a.netProfit ||
    b.revenue - a.revenue ||
    b.stockValue - a.stockValue ||
    (a.category ?? '').localeCompare(b.category ?? '')
  );
}

// ─────────────────────────── GET / ───────────────────────────

/**
 * Tarif: 'abc_analysis' — ABC tahlil bilan bir oila (assortiment tuzilmasi:
 * "qaysi qism pul keltiradi"), sinovda faqat ko'rish uchun. Sahifada
 * muzlagan qoldiq ham bor — "Nolikvidlar" ham sinovda faqat ko'rish uchun
 * ochiq, bu yerda u yashirin eshik bo'lib qolmasin.
 */
router.get(
  '/',
  requireFeature('abc_analysis'),
  ah(async (req, res) => {
    const { company, plan } = companyCtx(req);
    const range = resolveRange(req, plan);
    const storeIds = await getStoreIds(company.id, range.storeId);
    const now = Date.now();

    const [cur, compare, lines, catalog, stocks, avgDaily, lastSale] = await Promise.all([
      buildProductProfit(company, range, storeIds),
      comparablePeriod(storeIds, range.previous, plan).then(async (period) => {
        if (!period) return null;
        const prevRange = rangeFor(range, period);
        const [profit, prevLines] = await Promise.all([
          buildProductProfit(company, prevRange, storeIds),
          collectLines(storeIds, prevRange.from, prevRange.toExclusive, now),
        ]);
        return { period, profit, lines: prevLines };
      }),
      collectLines(storeIds, range.from, range.toExclusive, now),
      // Arxivdagi SKU ham: qoldig'i bor bo'lsa u pul (Qoldiqlar va Nolikvidlar sahifalari kabi)
      getSkuCatalog(storeIds, true),
      getLatestStocks(storeIds),
      getAvgDaily(storeIds, ILLIQUID_AVG_WINDOW),
      getLastSaleDates(storeIds),
    ]);

    const aggs = new Map<CategoryKey, Agg>();
    const aggOf = (key: CategoryKey): Agg => {
      let a = aggs.get(key);
      if (!a) {
        a = emptyAgg();
        aggs.set(key, a);
      }
      return a;
    };

    // ── Pul: "Mahsulot foydasi" qatorlari (yashirilgan mahsulot ham — pul baribir hisobda) ──
    for (const r of cur.rows) {
      const a = aggOf(keyOf(r.category));
      a.revenue += r.revenue;
      a.units += r.units;
      a.commission += r.commission;
      a.logistics += r.logistics;
      a.netProfit += r.netProfit;
      a.products.push(r);
      for (const v of r.variants) if (v.units > 0) a.sellingSkus.add(v.skuId);
    }
    if (compare) {
      for (const r of compare.profit.rows) {
        const a = aggOf(keyOf(r.category));
        a.prev.revenue += r.revenue;
        a.prev.units += r.units;
        a.prev.netProfit += r.netProfit;
      }
    }

    /*
     * ── Qaytarish va bekor qilish: SKU → kategoriya ──
     * Katalogdan EMAS, bazadagi SKU yozuvidan: davrda hammasi bekor qilingan
     * yoki yashirilgan mahsulotning donalari ham o'z kategoriyasiga tushsin.
     */
    const lineSkuIds = [...new Set([...lines.keys(), ...(compare ? compare.lines.keys() : [])])];
    const skuCategory = new Map<string, CategoryKey>();
    for (const info of catalog.values()) skuCategory.set(info.id, keyOf(info.category));
    const unknown = lineSkuIds.filter((id) => !skuCategory.has(id));
    if (unknown.length > 0) {
      const extra = await prisma.sku.findMany({
        where: { id: { in: unknown } },
        select: { id: true, product: { select: { category: true } } },
      });
      for (const s of extra) skuCategory.set(s.id, keyOf(s.product.category));
    }
    for (const [skuId, b] of lines) {
      if (!skuCategory.has(skuId)) continue;
      addLines(aggOf(skuCategory.get(skuId) ?? null).lines, b);
    }
    if (compare) {
      for (const [skuId, b] of compare.lines) {
        if (!skuCategory.has(skuId)) continue;
        addLines(aggOf(skuCategory.get(skuId) ?? null).prev.lines, b);
      }
    }

    // ── Katalog va qoldiq (hozirgi holat) ──
    for (const info of catalog.values()) {
      const total = stocks.get(info.id)?.total ?? 0;
      // Arxivdagi, qoldig'i yo'q SKU kategoriya qatorini yaratmaydi — u faqat shovqin
      if (info.archived && total === 0) continue;
      const a = aggOf(keyOf(info.category));
      if (!info.archived) a.skuCount += 1;
      if (total === 0) continue;
      const unitCost = info.purchasePrice + info.extraCost;
      a.stockUnits += total;
      // Qoldiqlar sahifasidagi har qator kabi alohida yaxlitlanadi — yig'indi o'sha jami bilan teng chiqsin
      a.stockValue += round(total * unitCost);
      if (total < 0) continue;
      /*
       * Nolikvid — products.ts GET /illiquid qoidasi aynan: hech sotilmagan
       * tovarda "sotilmagan kunlar" katalogga qo'shilgandan beri sanaladi
       * (kecha qo'shilgan tovar nolikvid emas); sotuv bor-u qoldiq 90 kundan
       * ortiqqa yetsa ham nolikvid.
       */
      const avg = avgDaily.get(info.id) ?? 0;
      const last = lastSale.get(info.id) ?? null;
      const daysWithoutSale = last ? daysSince(last) : daysSince(info.createdAt);
      const daysLeft = avg > 0 ? Math.round(total / avg) : null;
      const stale = daysWithoutSale >= ILLIQUID_DAYS;
      const excess = daysLeft !== null && daysLeft > STOCK_THRESHOLDS.excess;
      if (stale || excess) {
        a.frozenValue += round(total * unitCost);
        a.frozenSkus += 1;
      }
    }

    // ── Qatorlar ──
    const totalRevenue = [...aggs.values()].reduce((s, a) => s + a.revenue, 0);
    const totalPrevRevenue = [...aggs.values()].reduce((s, a) => s + a.prev.revenue, 0);
    // Ulush o'zgarishi faqat ikkala davrda ham tushum bo'lsa — aks holda "0% → 40%" yo'q o'sish
    const sharesComparable = Boolean(compare) && totalRevenue > 0 && totalPrevRevenue > 0;

    const rows: CategoryRow[] = [...aggs.entries()].map(([category, a]) => {
      const m = metricsOf(a);
      const revenueShare = totalRevenue > 0 ? pct(a.revenue, totalRevenue) : 0;
      const previous = compare ? previousOf(a.prev, totalPrevRevenue) : null;
      const topProducts: CategoryProduct[] = a.products
        .slice()
        .sort((x, y) => y.netProfit - x.netProfit || y.revenue - x.revenue)
        .slice(0, TOP_PRODUCTS)
        .map((p) => ({
          productId: p.productId,
          title: p.title,
          imageUrl: p.imageUrl,
          units: p.units,
          revenue: p.revenue,
          netProfit: p.netProfit,
          margin: p.margin,
          share: a.revenue > 0 ? pct(p.revenue, a.revenue) : 0,
          noCost: p.flags.includes('noCost'),
          hidden: p.hidden,
        }));
      return {
        category,
        ...m,
        revenueShare,
        products: a.products.length,
        skuCount: a.skuCount,
        sellingSkus: a.sellingSkus.size,
        stockUnits: a.stockUnits,
        stockValue: round(a.stockValue),
        frozenValue: round(a.frozenValue),
        frozenSkus: a.frozenSkus,
        noCostProducts: a.products.filter((p) => p.flags.includes('noCost')).length,
        previous,
        deltas: previous ? deltasOf({ ...m, revenueShare }, previous, sharesComparable) : NO_DELTAS,
        topProducts,
        moreProducts: Math.max(0, a.products.length - topProducts.length),
      };
    });
    rows.sort(compareRows);

    // ── Jami — qatorlar yig'indisi (kategoriya ham, jami ham bitta formula) ──
    const all = [...aggs.values()];
    const sum = (f: (a: Agg) => number) => all.reduce((s, a) => s + f(a), 0);
    const totalLines = emptyLines();
    const totalPrevLines = emptyLines();
    for (const a of all) {
      addLines(totalLines, a.lines);
      addLines(totalPrevLines, a.prev.lines);
    }
    const totalMetrics = metricsOf({
      revenue: sum((a) => a.revenue),
      units: sum((a) => a.units),
      commission: sum((a) => a.commission),
      logistics: sum((a) => a.logistics),
      netProfit: sum((a) => a.netProfit),
      lines: totalLines,
    });
    const totalPrev = compare
      ? previousOf(
          { revenue: totalPrevRevenue, units: sum((a) => a.prev.units), netProfit: sum((a) => a.prev.netProfit), lines: totalPrevLines },
          totalPrevRevenue,
        )
      : null;
    const totalDeltas = totalPrev ? deltasOf({ ...totalMetrics, revenueShare: null }, totalPrev, false) : NO_DELTAS;

    const payload: CategoriesResponse = {
      period: range.period,
      comparePeriod: compare?.period ?? null,
      currency: company.currency,
      totals: {
        ...totalMetrics,
        categories: rows.filter((r) => r.category !== null).length,
        products: cur.rows.length,
        skuCount: sum((a) => a.skuCount),
        sellingSkus: sum((a) => a.sellingSkus.size),
        stockUnits: sum((a) => a.stockUnits),
        stockValue: round(sum((a) => a.stockValue)),
        frozenValue: round(sum((a) => a.frozenValue)),
        frozenSkus: sum((a) => a.frozenSkus),
        noCostProducts: cur.rows.filter((r) => r.flags.includes('noCost')).length,
        previous: totalPrev
          ? {
              revenue: totalPrev.revenue,
              units: totalPrev.units,
              netProfit: totalPrev.netProfit,
              margin: totalPrev.margin,
              returnRate: totalPrev.returnRate,
            }
          : null,
        deltas: {
          revenue: totalDeltas.revenue,
          units: totalDeltas.units,
          netProfit: totalDeltas.netProfit,
          margin: totalDeltas.margin,
          returnRate: totalDeltas.returnRate,
        },
      },
      rows,
      unallocated: cur.unallocated,
      thresholds: { illiquidDays: ILLIQUID_DAYS, excessDays: STOCK_THRESHOLDS.excess, topProducts: TOP_PRODUCTS },
    };
    res.json(payload);
  }),
);

export default router;
