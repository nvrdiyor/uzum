/**
 * Mahsulotlar moduli — /api/v1/products
 *
 *  GET   /                → ProductsResponse (kartochkalar: sotuv, foyda, ROI, marja, qoldiq)
 *  GET   /abc             → AbcResponse (ABC + XYZ tahlil)
 *  GET   /illiquid        → IlliquidResponse (nolikvid / harakatsiz tovarlar)
 *  GET   /:id             → bitta mahsulot tafsiloti (SKU'lar, 60 kunlik seriya, sharhlar, unit-iqtisod)
 *  PATCH /sku/:id         → tannarx va o'lchamlarni yangilash (+ CostPrice tarixiga yozuv)
 *  POST  /sku/bulk-cost   → tannarxlarni ommaviy yangilash
 *
 * Barcha pul qiymatlari UZS (butun son), sanalar ISO-8601.
 * Ma'lumot bo'lmasa marshrutlar 200 va bo'sh/nol qiymat qaytaradi (xato emas).
 */
import { Router } from 'express';
import type { Request } from 'express';
import { z } from 'zod';
import { prisma } from '@savdoiq/db';
import type { Prisma } from '@savdoiq/db';
import {
  DEFAULTS,
  STOCK_THRESHOLDS,
  abcGroup,
  addDays,
  calcUnitEconomics,
  costPriceBulkSchema,
  parseISODate,
  pct,
  recommendedQty,
  round,
  safeDiv,
  toISODate,
  type AbcResponse,
  type AbcRow,
  type IlliquidResponse,
  type IlliquidRow,
  type Period,
  type ProductCard,
  type ProductCardSku,
  type ProductsResponse,
  type UnitCalcInput,
  type UnitCalcResult,
} from '@savdoiq/shared';
import { AppError, ah } from '../lib/errors.js';
import { companyCtx, requireAuth, requireCompany, requireFeature, requireRole } from '../lib/auth.js';
import { paginate, resolveRange } from '../lib/period.js';
import {
  aggregateSales,
  daysSince,
  getAvgDaily,
  getLastSaleDates,
  getLatestStocks,
  getSkuCatalog,
  getStoreIds,
  getStoreTitles,
  stockState,
  type SalesAgg,
  type SkuInfo,
  type StockInfo,
} from '../services/common.js';

const router = Router();
router.use(requireAuth, requireCompany);

/** Nolikvid deb hisoblash chegarasi (kun sotuvsiz) */
const ILLIQUID_DAYS = 30;
/** Tafsilot sahifasidagi seriya uzunligi (kun) */
const DETAIL_DAYS = 60;
/**
 * Bozor bo'yicha o'rtacha kartochka konversiyasi (%) — bilvosita baholash uchun asos.
 * Uzum seller API kartochka ko'rishlari (impressions) sonini bermaydi, shuning uchun
 * konversiya taxminiy hisoblanadi (pastdagi `estimateConversion`).
 */
const BASE_CONVERSION = 2.5;
/** Yaxshi hisoblangan reyting — konversiya koeffitsiyenti shu qiymatga nisbatan olinadi */
const TARGET_RATING = 4.5;

// ─────────────────────────── Umumiy yordamchilar ───────────────────────────

/** Zaxira davri (kun): qoldiq necha kunga yetishi kerak. Standart — 30 */
function coverParam(req: Request, def = 30): number {
  const raw = Number((req.query as Record<string, string | undefined>).cover ?? def);
  if (!Number.isFinite(raw)) return def;
  return Math.min(365, Math.max(1, Math.round(raw)));
}

type SortValue = number | string;

/** Umumiy saralash (matn — alifbo bo'yicha, son — kattaligi bo'yicha) */
function applySort<T>(rows: T[], order: 'asc' | 'desc', value: (row: T) => SortValue): T[] {
  const dir = order === 'asc' ? 1 : -1;
  return rows.sort((a, b) => {
    const va = value(a);
    const vb = value(b);
    if (typeof va === 'string' || typeof vb === 'string') return String(va).localeCompare(String(vb)) * dir;
    return (va - vb) * dir;
  });
}

/**
 * Taxminiy konversiya (%).
 * Ko'rishlar statistikasi bo'lmagani uchun uchta real signaldan foydalanamiz:
 * bozor o'rtachasi, kartochka reytingi va sotib olish (buyout) darajasi.
 * Ko'rishlar API'ga qo'shilganda shu funksiya haqiqiy nisbat bilan almashtiriladi.
 */
function estimateConversion(rating: number, units: number, returns: number): number {
  if (units <= 0) return 0;
  const ratingFactor = rating > 0 ? Math.min(1.4, Math.max(0.5, rating / TARGET_RATING)) : 1;
  const total = units + returns;
  const buyoutFactor = total > 0 ? units / total : 1;
  return round(BASE_CONVERSION * ratingFactor * buyoutFactor, 2);
}

/** Bo'sh sotuv yig'indisi (SKU bo'yicha ma'lumot bo'lmaganda) */
const EMPTY_AGG: SalesAgg = {
  skuId: '',
  units: 0,
  revenue: 0,
  payout: 0,
  cogs: 0,
  commission: 0,
  logistics: 0,
  otherCost: 0,
  netProfit: 0,
  orders: 0,
  returns: 0,
  lastSaleAt: null,
  firstSaleAt: null,
};

const EMPTY_STOCK: StockInfo = { fbo: 0, fbs: 0, own: 0, reserved: 0, inTransit: 0, total: 0, date: null };

// ─────────────────────────── Mahsulot kartochkasi ───────────────────────────

interface ProductSkuRecord {
  id: string;
  sku: string;
  title: string;
  imageUrl: string | null;
  price: number;
  oldPrice: number;
  purchasePrice: number;
  extraCost: number;
  volumeL: number;
  weightGr: number;
  barcode: string | null;
  archived: boolean;
  createdAt: Date;
}

interface ProductRecord {
  id: string;
  storeId: string;
  uzumProductId: string | null;
  title: string;
  category: string | null;
  brand: string | null;
  imageUrl: string | null;
  status: string;
  rating: number;
  reviewsCount: number;
  skus: ProductSkuRecord[];
}

interface CardContext {
  sales: Map<string, SalesAgg>;
  stocks: Map<string, StockInfo>;
  avgDaily: Map<string, number>;
  /** Zaxira davri (kun) — `needOrder` shu davr uchun hisoblanadi */
  cover: number;
}

/** Mahsulotlar (SKU'lari bilan) — do'kon filtri bo'yicha */
async function loadProducts(storeIds: string[], where: { id?: string } = {}): Promise<ProductRecord[]> {
  if (storeIds.length === 0) return [];
  return prisma.product.findMany({
    where: { storeId: { in: storeIds }, ...(where.id ? { id: where.id } : {}) },
    select: {
      id: true,
      storeId: true,
      uzumProductId: true,
      title: true,
      category: true,
      brand: true,
      imageUrl: true,
      status: true,
      rating: true,
      reviewsCount: true,
      skus: {
        select: {
          id: true,
          sku: true,
          title: true,
          imageUrl: true,
          price: true,
          oldPrice: true,
          purchasePrice: true,
          extraCost: true,
          volumeL: true,
          weightGr: true,
          barcode: true,
          archived: true,
          createdAt: true,
        },
        orderBy: { sku: 'asc' },
      },
    },
    orderBy: { title: 'asc' },
  });
}

/**
 * Bitta mahsulot kartochkasi.
 * Foyda/ROI/marja davr bo'yicha buyurtma satrlaridan, qoldiq — so'nggi snapshot'dan olinadi.
 */
function buildCard(p: ProductRecord, c: CardContext): ProductCard {
  const skus: ProductCardSku[] = [];
  let sold = 0;
  let returns = 0;
  let revenue = 0;
  let profit = 0;
  let cogs = 0;
  let stockFbo = 0;
  let stockFbs = 0;
  let stockOwn = 0;
  let avgTotal = 0;
  let needOrder = 0;
  let minPrice = Number.POSITIVE_INFINITY;
  /** Katalogdagi ro'yxat narxi (sotuv narxi bilan solishtirish uchun) */
  let listPrice = 0;

  for (const s of p.skus) {
    const agg = c.sales.get(s.id) ?? EMPTY_AGG;
    const st = c.stocks.get(s.id) ?? EMPTY_STOCK;
    const avg = c.avgDaily.get(s.id) ?? 0;

    sold += agg.units;
    returns += agg.returns;
    revenue += agg.revenue;
    profit += agg.netProfit;
    cogs += agg.cogs;
    stockFbo += st.fbo;
    stockFbs += st.fbs;
    stockOwn += st.own;
    avgTotal += avg;
    // Har bir SKU o'z zaxirasiga muhtoj — shuning uchun SKU kesimida qo'shamiz
    needOrder += recommendedQty(avg, c.cover, st.total, 0);
    /**
     * Ko'rsatiladigan narx — xaridor HAQIQATDA to'lagan narx (tushum / dona).
     * Katalog joriy chegirmali narxni bermaydi, shuning uchun sotuvi bo'lgan
     * tovarda katalog narxi kabinetdagidan katta ko'rinardi
     * (masalan 299 000 ko'rsatilardi, aslida 245 000 ga sotilgan).
     * Sotuv bo'lmasa — katalog narxi.
     */
    const realPrice = agg.units > 0 ? safeDiv(agg.revenue, agg.units) : s.price;
    if (realPrice > 0 && realPrice < minPrice) {
      minPrice = realPrice;
      listPrice = Math.max(s.price, s.oldPrice);
    }

    skus.push({
      id: s.id,
      sku: s.sku,
      title: s.title || p.title,
      price: round(agg.units > 0 ? safeDiv(agg.revenue, agg.units) : s.price),
      purchasePrice: round(s.purchasePrice),
      extraCost: round(s.extraCost),
      totalCost: round(s.purchasePrice + s.extraCost),
      stockFbo: st.fbo,
      stockFbs: st.fbs,
      stockOwn: st.own,
      sold: agg.units,
      revenue: round(agg.revenue),
      profit: round(agg.netProfit),
    });
  }

  const stockTotal = stockFbo + stockFbs + stockOwn;
  // Barcha SKU'lari arxivlangan mahsulot ham arxiv hisoblanadi (filtr uchun qulay)
  const archived = p.skus.length > 0 && p.skus.every((s) => s.archived);

  return {
    id: p.id,
    uzumProductId: p.uzumProductId,
    title: p.title,
    category: p.category,
    imageUrl: p.imageUrl ?? p.skus.find((s) => s.imageUrl)?.imageUrl ?? null,
    status: archived ? 'archived' : p.status,
    rating: round(p.rating, 2),
    reviewsCount: p.reviewsCount,
    skuCount: p.skus.length,
    minPrice: Number.isFinite(minPrice) ? round(minPrice) : 0,
    listPrice: round(listPrice),
    sold,
    returns,
    revenue: round(revenue),
    profit: round(profit),
    roi: pct(profit, cogs),
    margin: pct(profit, revenue),
    conversion: estimateConversion(p.rating, sold, returns),
    stockFbo,
    stockFbs,
    stockOwn,
    daysLeft: avgTotal > 0 ? Math.round(stockTotal / avgTotal) : null,
    needOrder,
    skus,
  };
}

/**
 * Kunlik saqlash xarajati.
 * Avval haqiqiy StorageFee yozuvlari (oxirgi 30 kun o'rtachasi), ular bo'lmasa —
 * FBO qoldiq hajmidan taxmin (`DEFAULTS.storagePerLiterPerDay`).
 */
async function storageCostPerDay(
  storeIds: string[],
  stocks: Map<string, StockInfo>,
  volumeBySku: Map<string, number>,
): Promise<number> {
  if (storeIds.length === 0) return 0;
  const since = addDays(new Date(), -30);
  const agg = await prisma.storageFee.aggregate({
    _sum: { amount: true },
    where: { storeId: { in: storeIds }, date: { gte: since } },
  });
  const real = (agg._sum.amount ?? 0) / 30;
  if (real > 0) return round(real);

  let volume = 0;
  for (const [skuId, st] of stocks) volume += st.fbo * (volumeBySku.get(skuId) ?? 0);
  return round(volume * DEFAULTS.storagePerLiterPerDay);
}

/** Oxirgi `days` kundagi haqiqiy saqlash to'lovi (SKU kesimida) */
async function storageFeeBySku(storeIds: string[], days = 30): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (storeIds.length === 0) return out;
  const rows = await prisma.storageFee.findMany({
    where: { storeId: { in: storeIds }, date: { gte: addDays(new Date(), -days) } },
    select: { skuId: true, amount: true },
  });
  for (const r of rows) {
    if (!r.skuId) continue;
    out.set(r.skuId, (out.get(r.skuId) ?? 0) + r.amount);
  }
  return out;
}

// ─────────────────────────── GET / — mahsulotlar ro'yxati ───────────────────────────

const PRODUCT_SORT: Record<string, (p: ProductCard) => SortValue> = {
  revenue: (p) => p.revenue,
  profit: (p) => p.profit,
  sold: (p) => p.sold,
  returns: (p) => p.returns,
  margin: (p) => p.margin,
  roi: (p) => p.roi,
  conversion: (p) => p.conversion,
  rating: (p) => p.rating,
  price: (p) => p.minPrice,
  stock: (p) => p.stockFbo + p.stockFbs + p.stockOwn,
  needOrder: (p) => p.needOrder,
  daysLeft: (p) => p.daysLeft ?? Number.MAX_SAFE_INTEGER,
  title: (p) => p.title,
};

/**
 * Ro'yxat filtri. Sayt tarixan `out` nomini ishlatadi, API esa `no_stock` —
 * ikkalasi ham qabul qilinadi, aks holda "Qoldiqsiz" tugmasi bosilganda
 * server jimgina `all` ga tushib, hech narsa filtrlanmasdi.
 */
type ProductFilter = 'all' | 'active' | 'archived' | 'need_order' | 'no_stock' | 'out';
const PRODUCT_FILTERS: ProductFilter[] = ['all', 'active', 'archived', 'need_order', 'no_stock', 'out'];

router.get(
  '/',
  requireFeature('products_assortment'),
  ah(async (req, res) => {
    const { company, plan } = companyCtx(req);
    const range = resolveRange(req, plan);
    const cover = coverParam(req);
    const q = req.query as Record<string, string | undefined>;
    const filter: ProductFilter = PRODUCT_FILTERS.includes((q.filter ?? 'all') as ProductFilter)
      ? ((q.filter ?? 'all') as ProductFilter)
      : 'all';

    const storeIds = await getStoreIds(company.id, range.storeId);
    const [products, sales, stocks, avgDaily] = await Promise.all([
      loadProducts(storeIds),
      aggregateSales(storeIds, range.from, range.toExclusive),
      getLatestStocks(storeIds),
      getAvgDaily(storeIds, 30),
    ]);

    const volumeBySku = new Map<string, number>();
    for (const p of products) for (const s of p.skus) volumeBySku.set(s.id, s.volumeL);

    let cards = products.map((p) => buildCard(p, { sales, stocks, avgDaily, cover }));

    // Qidiruv: nomi, kategoriyasi yoki SKU kodi bo'yicha (registrga bog'liq emas)
    const search = range.search?.toLowerCase();
    if (search) {
      cards = cards.filter(
        (c) =>
          c.title.toLowerCase().includes(search) ||
          (c.category ?? '').toLowerCase().includes(search) ||
          c.skus.some((s) => s.sku.toLowerCase().includes(search) || s.title.toLowerCase().includes(search)),
      );
    }

    if (filter === 'active') cards = cards.filter((c) => c.status !== 'archived');
    else if (filter === 'archived') cards = cards.filter((c) => c.status === 'archived');
    else if (filter === 'need_order') cards = cards.filter((c) => c.needOrder > 0);
    else if (filter === 'no_stock' || filter === 'out')
      cards = cards.filter((c) => c.stockFbo + c.stockFbs + c.stockOwn <= 0);

    const sorter = PRODUCT_SORT[range.sort ?? 'revenue'] ?? PRODUCT_SORT.revenue;
    applySort(cards, range.order, sorter);

    // Jamlanma — foydalanuvchi ko'rayotgan (filtrlangan) to'plam bo'yicha
    let skuCount = 0;
    let inStock = 0;
    let needOrder = 0;
    for (const c of cards) {
      skuCount += c.skuCount;
      inStock += c.stockFbo + c.stockFbs + c.stockOwn;
      needOrder += c.needOrder;
    }

    const payload: ProductsResponse = {
      totals: {
        products: cards.length,
        skus: skuCount,
        inStock,
        needOrder,
        storageCostPerDay: await storageCostPerDay(storeIds, stocks, volumeBySku),
      },
      items: paginate(cards, range.page, range.pageSize),
    };

    res.json(payload);
  }),
);

// ─────────────────────────── GET /abc — ABC va XYZ tahlil ───────────────────────────

/** Sotuv o'zgaruvchanligi (CV) bo'yicha XYZ guruh: <10% X, <25% Y, aks holda Z */
function xyzGroup(buckets: number[]): 'X' | 'Y' | 'Z' {
  if (buckets.length < 2) return 'Z';
  const mean = buckets.reduce((s, v) => s + v, 0) / buckets.length;
  if (mean <= 0) return 'Z';
  const variance = buckets.reduce((s, v) => s + (v - mean) ** 2, 0) / buckets.length;
  const cv = (Math.sqrt(variance) / mean) * 100;
  if (cv < 10) return 'X';
  if (cv < 25) return 'Y';
  return 'Z';
}

/**
 * Davr ichidagi sotuvni SKU × oyna kesimida to'playdi.
 * Kunlik sotuv juda "sakrab" turadi, shuning uchun uzoq davrlarda haftalik oynadan
 * foydalanamiz — XYZ guruhlash shunda mazmunli bo'ladi.
 */
async function salesBuckets(
  storeIds: string[],
  from: Date,
  toExclusive: Date,
): Promise<Map<string, number[]>> {
  const totalDays = Math.max(1, Math.round((toExclusive.getTime() - from.getTime()) / 86_400_000));
  const size = totalDays >= 21 ? 7 : 1;
  // Faqat to'liq oynalar: oxirgi chala hafta alohida "bo'sh" ustun yasab, CV'ni sun'iy oshirmasin
  const count = Math.max(1, Math.floor(totalDays / size));
  const buckets = new Map<string, number[]>();
  if (storeIds.length === 0) return buckets;

  const items = await prisma.orderItem.findMany({
    where: {
      orderedAt: { gte: from, lt: toExclusive },
      status: { notIn: ['canceled', 'returned'] },
      order: { storeId: { in: storeIds } },
    },
    select: { skuId: true, qty: true, orderedAt: true },
  });

  for (const it of items) {
    if (!it.skuId) continue;
    const offset = Math.floor((it.orderedAt.getTime() - from.getTime()) / 86_400_000);
    const idx = Math.min(count - 1, Math.max(0, Math.floor(offset / size)));
    const arr = buckets.get(it.skuId) ?? new Array<number>(count).fill(0);
    arr[idx] += it.qty;
    buckets.set(it.skuId, arr);
  }

  return buckets;
}

router.get(
  '/abc',
  requireFeature('abc_analysis'),
  ah(async (req, res) => {
    const { company, plan } = companyCtx(req);
    const range = resolveRange(req, plan);
    const storeIds = await getStoreIds(company.id, range.storeId);

    const [catalog, sales, buckets] = await Promise.all([
      getSkuCatalog(storeIds, true),
      aggregateSales(storeIds, range.from, range.toExclusive),
      salesBuckets(storeIds, range.from, range.toExclusive),
    ]);

    const search = range.search?.toLowerCase();
    const base = [...sales.values()]
      .map((agg) => ({ agg, info: catalog.get(agg.skuId) }))
      .filter((r): r is { agg: SalesAgg; info: SkuInfo } => Boolean(r.info))
      .filter((r) => r.agg.units > 0 || r.agg.revenue > 0)
      .filter(
        (r) =>
          !search || r.info.title.toLowerCase().includes(search) || r.info.sku.toLowerCase().includes(search),
      )
      .sort((a, b) => b.agg.revenue - a.agg.revenue);

    const totalRevenue = base.reduce((s, r) => s + r.agg.revenue, 0);

    let cumulative = 0;
    const rows: AbcRow[] = base.map((r) => {
      const share = pct(r.agg.revenue, totalRevenue);
      cumulative += share;
      const group = abcGroup(round(cumulative, 2));
      return {
        skuId: r.agg.skuId,
        sku: r.info.sku,
        title: r.info.title,
        imageUrl: r.info.imageUrl,
        revenue: round(r.agg.revenue),
        profit: round(r.agg.netProfit),
        units: r.agg.units,
        share,
        cumulativeShare: round(Math.min(100, cumulative), 2),
        group,
        xyzGroup: xyzGroup(buckets.get(r.agg.skuId) ?? []),
      } satisfies AbcRow;
    });

    const groups = (['A', 'B', 'C'] as const).map((group) => {
      const inGroup = rows.filter((r) => r.group === group);
      const revenue = inGroup.reduce((s, r) => s + r.revenue, 0);
      return {
        group,
        skuCount: inGroup.length,
        revenue: round(revenue),
        units: inGroup.reduce((s, r) => s + r.units, 0),
        revenueShare: pct(revenue, totalRevenue),
      };
    });

    const payload: AbcResponse = { period: range.period, groups, rows };
    res.json(payload);
  }),
);

// ─────────────────────────── GET /illiquid — nolikvid tovarlar ───────────────────────────

/**
 * Tavsiya: qancha uzoq turgan bo'lsa, shunchalik qat'iy chora.
 *  withdraw — omborni bo'shatish, discount — chegirma, promo — aksiya, watch — kuzatuv.
 */
function illiquidAdvice(
  daysWithoutSale: number,
  avgDaily: number,
  daysLeft: number | null,
): IlliquidRow['recommendation'] {
  if (daysWithoutSale >= 90 || (avgDaily <= 0 && daysWithoutSale >= 60)) return 'withdraw';
  if (daysWithoutSale >= 45) return 'discount';
  if (daysWithoutSale >= ILLIQUID_DAYS) return 'promo';
  // Sotuv bor, ammo zaxira yarim yildan ortiqqa yetadi — aylanmani aksiya bilan tezlatish kerak
  if (daysLeft !== null && daysLeft > 180) return 'promo';
  return 'watch';
}

router.get(
  '/illiquid',
  requireFeature('illiquid'),
  ah(async (req, res) => {
    const { company, plan } = companyCtx(req);
    const range = resolveRange(req, plan);
    const storeIds = await getStoreIds(company.id, range.storeId);

    const [catalog, stocks, avgDaily, lastSale, fees] = await Promise.all([
      getSkuCatalog(storeIds, true),
      getLatestStocks(storeIds),
      getAvgDaily(storeIds, 30),
      getLastSaleDates(storeIds),
      storageFeeBySku(storeIds, 30),
    ]);

    const search = range.search?.toLowerCase();
    const rows: IlliquidRow[] = [];
    let totalFrozen = 0;
    let totalUnits = 0;

    for (const [skuId, st] of stocks) {
      const info = catalog.get(skuId);
      if (!info || st.total <= 0) continue;
      if (search && !info.title.toLowerCase().includes(search) && !info.sku.toLowerCase().includes(search)) continue;

      const avg = avgDaily.get(skuId) ?? 0;
      const last = lastSale.get(skuId) ?? null;
      /**
       * Hech sotilmagan tovarda "sotilmagan kunlar" — katalogga qo'shilgandan
       * beri o'tgan kunlar. Ilgari 9999 chiqardi va kecha qo'shilgan tovar ham
       * "nolikvid" ro'yxatiga tushardi.
       */
      const daysWithoutSale = last ? daysSince(last) : daysSince(info.createdAt);
      const daysLeft = avg > 0 ? Math.round(st.total / avg) : null;

      // Nolikvid: 30+ kun sotilmagan yoki qoldiq 90 kundan ortiqqa yetadi
      const stale = daysWithoutSale >= ILLIQUID_DAYS;
      const excess = daysLeft !== null && daysLeft > STOCK_THRESHOLDS.excess;
      if (!stale && !excess) continue;

      const unitCost = info.purchasePrice + info.extraCost;
      const frozenCapital = round(st.total * unitCost);
      // Haqiqiy saqlash to'lovi bo'lsa — o'sha, aks holda hajm bo'yicha taxmin
      /**
       * Saqlash to'lovi tartibi: haqiqiy to'lov → Uzumning o'z hisobi
       * (`paidStoragePriceItem`) → hajm bo'yicha taxmin.
       *
       * Taxmin oxirgi chora: 397×68×75 mm quti uchun u ~7 300 so'm/oy beradi,
       * Uzumning o'z raqami esa 36 so'm — ya'ni 200 barobar farq, va shu farq
       * "muzlatilgan kapital" hamda nol foyda narxini butunlay buzardi.
       */
      const storageCostPerMonth = round(
        fees.get(skuId) ??
          (info.storagePerItem > 0
            ? info.storagePerItem * st.fbo
            : st.fbo * info.volumeL * DEFAULTS.storagePerLiterPerDay * 30),
      );

      totalFrozen += frozenCapital;
      totalUnits += st.total;

      rows.push({
        skuId,
        sku: info.sku,
        title: info.title,
        imageUrl: info.imageUrl,
        stock: st.total,
        // Sotuv narxidagi qiymat (potentsial tushum)
        stockValue: round(st.total * info.price),
        daysWithoutSale,
        lastSaleAt: last ? last.toISOString() : null,
        storageCostPerMonth,
        recommendation: illiquidAdvice(daysWithoutSale, avg, daysLeft),
        frozenCapital,
      });
    }

    const sorter =
      range.sort === 'days'
        ? (r: IlliquidRow) => r.daysWithoutSale
        : range.sort === 'stock'
          ? (r: IlliquidRow) => r.stock
          : range.sort === 'storage'
            ? (r: IlliquidRow) => r.storageCostPerMonth
            : (r: IlliquidRow) => r.frozenCapital;
    applySort(rows, range.order, sorter);

    const payload: IlliquidResponse = {
      period: range.period,
      totalFrozen: round(totalFrozen),
      totalUnits,
      rows: paginate(rows, range.page, range.pageSize),
    };

    res.json(payload);
  }),
);

// ─────────────────────────── PATCH /sku/:id — tannarx va o'lchamlar ───────────────────────────

const skuUpdateSchema = z.object({
  purchasePrice: z.coerce.number().min(0).max(1_000_000_000).optional(),
  extraCost: z.coerce.number().min(0).max(1_000_000_000).optional(),
  volumeL: z.coerce.number().min(0).max(10_000).optional(),
  weightGr: z.coerce.number().min(0).max(1_000_000).optional(),
  note: z.string().max(200).optional(),
});

interface SkuUpdateResponse {
  id: string;
  sku: string;
  title: string;
  price: number;
  purchasePrice: number;
  extraCost: number;
  volumeL: number;
  weightGr: number;
  /** Tannarx tarixiga yangi yozuv qo'shildimi */
  costHistoryAdded: boolean;
  message: string;
}

router.patch(
  '/sku/:id',
  requireFeature('cost_price'),
  requireRole('owner', 'manager'),
  ah(async (req, res) => {
    const { company } = companyCtx(req);
    const input = skuUpdateSchema.parse(req.body);

    if (
      input.purchasePrice === undefined &&
      input.extraCost === undefined &&
      input.volumeL === undefined &&
      input.weightGr === undefined
    ) {
      throw AppError.badRequest('O‘zgartirish uchun kamida bitta maydon yuboring');
    }

    const storeIds = await getStoreIds(company.id);
    const existing = await prisma.sku.findFirst({
      where: { id: req.params.id, storeId: { in: storeIds } },
      select: { id: true, sku: true, title: true, price: true, purchasePrice: true, extraCost: true },
    });
    if (!existing) throw AppError.notFound('SKU topilmadi');

    const updated = await prisma.sku.update({
      where: { id: existing.id },
      data: {
        ...(input.purchasePrice !== undefined ? { purchasePrice: input.purchasePrice } : {}),
        ...(input.extraCost !== undefined ? { extraCost: input.extraCost } : {}),
        ...(input.volumeL !== undefined ? { volumeL: input.volumeL } : {}),
        ...(input.weightGr !== undefined ? { weightGr: input.weightGr } : {}),
      },
      select: {
        id: true,
        sku: true,
        title: true,
        price: true,
        purchasePrice: true,
        extraCost: true,
        volumeL: true,
        weightGr: true,
      },
    });

    // Tannarx haqiqatan o'zgargan bo'lsa — CostPrice tarixiga yozamiz
    const costChanged =
      updated.purchasePrice !== existing.purchasePrice || updated.extraCost !== existing.extraCost;
    if (costChanged) {
      await prisma.costPrice.create({
        data: {
          skuId: updated.id,
          value: updated.purchasePrice,
          extraCost: updated.extraCost,
          fromDate: new Date(),
          note: input.note ?? null,
        },
      });
    }

    const payload: SkuUpdateResponse = {
      id: updated.id,
      sku: updated.sku,
      title: updated.title,
      price: round(updated.price),
      purchasePrice: round(updated.purchasePrice),
      extraCost: round(updated.extraCost),
      volumeL: updated.volumeL,
      weightGr: updated.weightGr,
      costHistoryAdded: costChanged,
      message: costChanged ? 'Tannarx yangilandi va tarixga yozildi' : 'SKU ma’lumotlari yangilandi',
    };

    res.json(payload);
  }),
);

// ─────────────────────────── POST /sku/bulk-cost — ommaviy tannarx ───────────────────────────

interface BulkCostResponse {
  updated: number;
  /** Kompaniyaga tegishli bo'lmagan yoki topilmagan SKU id'lari */
  skipped: string[];
  items: { skuId: string; sku: string; purchasePrice: number; extraCost: number }[];
  message: string;
}

router.post(
  '/sku/bulk-cost',
  requireFeature('cost_price'),
  requireRole('owner', 'manager'),
  ah(async (req, res) => {
    const { company } = companyCtx(req);
    const input = costPriceBulkSchema.parse(req.body);

    const storeIds = await getStoreIds(company.id);
    const ids = [...new Set(input.items.map((i) => i.skuId))];
    const owned = await prisma.sku.findMany({
      where: { id: { in: ids }, storeId: { in: storeIds } },
      select: { id: true, sku: true },
    });
    const ownedMap = new Map(owned.map((s) => [s.id, s.sku]));

    const now = new Date();
    const items: BulkCostResponse['items'] = [];
    const skipped: string[] = [];
    const ops: Prisma.PrismaPromise<unknown>[] = [];

    for (const item of input.items) {
      const skuCode = ownedMap.get(item.skuId);
      if (!skuCode) {
        if (!skipped.includes(item.skuId)) skipped.push(item.skuId);
        continue;
      }
      ops.push(
        prisma.sku.update({
          where: { id: item.skuId },
          data: { purchasePrice: item.purchasePrice, extraCost: item.extraCost },
        }),
        prisma.costPrice.create({
          data: {
            skuId: item.skuId,
            value: item.purchasePrice,
            extraCost: item.extraCost,
            fromDate: now,
            note: item.note ?? null,
          },
        }),
      );
      items.push({
        skuId: item.skuId,
        sku: skuCode,
        purchasePrice: round(item.purchasePrice),
        extraCost: round(item.extraCost),
      });
    }

    if (ops.length === 0) throw AppError.badRequest('Yuborilgan SKU’lar bu kompaniyada topilmadi', { skipped });
    await prisma.$transaction(ops);

    const payload: BulkCostResponse = {
      updated: items.length,
      skipped,
      items,
      message: `${items.length} ta SKU tannarxi yangilandi${skipped.length ? `, ${skipped.length} tasi topilmadi` : ''}`,
    };

    res.json(payload);
  }),
);

// ─────────────────────────── GET /:id — mahsulot tafsiloti ───────────────────────────

export interface ProductDetailSku extends ProductCardSku {
  barcode: string | null;
  extraCost: number;
  volumeL: number;
  weightGr: number;
  archived: boolean;
  reserved: number;
  inTransit: number;
  avgDaily: number;
  daysLeft: number | null;
  status: 'critical' | 'low' | 'ok' | 'excess' | 'dead';
  margin: number;
  roi: number;
  lastSaleAt: string | null;
}

export interface ProductSalesPoint {
  date: string;
  units: number;
  revenue: number;
  profit: number;
  orders: number;
}

export interface ProductStockPoint {
  date: string;
  fbo: number;
  fbs: number;
  own: number;
  total: number;
}

export interface ProductReviewsStats {
  count: number;
  avgRating: number;
  answered: number;
  unanswered: number;
  distribution: { rating: number; count: number }[];
  last: { id: string; rating: number; text: string | null; author: string | null; publishedAt: string; answered: boolean }[];
}

export interface ProductDetailResponse {
  period: Period;
  /** Davr bo'yicha umumiy kartochka (ro'yxatdagi bilan bir xil formulalar) */
  card: ProductCard;
  store: { id: string; title: string };
  brand: string | null;
  skus: ProductDetailSku[];
  /** Oxirgi 60 kunlik sotuv seriyasi */
  series: ProductSalesPoint[];
  /** Oxirgi 60 kunlik qoldiq tarixi */
  stockHistory: ProductStockPoint[];
  reviews: ProductReviewsStats;
  /** Unit-iqtisod: kirish qiymatlari va hisob natijasi (1 dona uchun) */
  unitInput: UnitCalcInput;
  unit: UnitCalcResult;
}

/** Oxirgi `DETAIL_DAYS` kunning ISO sanalari (bugun oxirgi) */
function lastDays(days: number): string[] {
  const today = parseISODate(toISODate(new Date()));
  const out: string[] = [];
  for (let i = days - 1; i >= 0; i -= 1) out.push(toISODate(addDays(today, -i)));
  return out;
}

router.get(
  '/:id',
  requireFeature('products_assortment'),
  ah(async (req, res) => {
    const { company, plan } = companyCtx(req);
    const range = resolveRange(req, plan);
    const cover = coverParam(req);
    const storeIds = await getStoreIds(company.id);

    const [product] = await loadProducts(storeIds, { id: req.params.id });
    if (!product) throw AppError.notFound('Mahsulot topilmadi');

    const skuIds = product.skus.map((s) => s.id);
    const scopedStores = [product.storeId];
    const seriesFrom = parseISODate(lastDays(DETAIL_DAYS)[0]);

    const [sales, stocks, avgDaily, lastSale, storeTitles, orderRows, snapshots, reviewRows, taxCompany] =
      await Promise.all([
        aggregateSales(scopedStores, range.from, range.toExclusive),
        getLatestStocks(scopedStores),
        getAvgDaily(scopedStores, 30),
        getLastSaleDates(scopedStores),
        getStoreTitles(company.id),
        skuIds.length
          ? prisma.orderItem.findMany({
              where: { skuId: { in: skuIds }, orderedAt: { gte: seriesFrom } },
              select: {
                orderedAt: true,
                qty: true,
                revenue: true,
                netProfit: true,
                status: true,
                returnedAt: true,
                orderId: true,
              },
            })
          : Promise.resolve([]),
        skuIds.length
          ? prisma.stockSnapshot.findMany({
              where: { skuId: { in: skuIds }, date: { gte: seriesFrom } },
              select: { date: true, fbo: true, fbs: true, own: true },
              orderBy: { date: 'asc' },
            })
          : Promise.resolve([]),
        prisma.review.findMany({
          where: { productId: product.id },
          select: { id: true, rating: true, text: true, author: true, publishedAt: true, answered: true },
          orderBy: { publishedAt: 'desc' },
          take: 5000,
        }),
        prisma.company.findUnique({ where: { id: company.id }, select: { taxRate: true } }),
      ]);

    const card = buildCard(product, { sales, stocks, avgDaily, cover });

    // ── SKU tafsilotlari ──
    const skus: ProductDetailSku[] = product.skus.map((s) => {
      const agg = sales.get(s.id) ?? EMPTY_AGG;
      const st = stocks.get(s.id) ?? EMPTY_STOCK;
      const avg = avgDaily.get(s.id) ?? 0;
      const state = stockState(st.total, avg, daysSince(lastSale.get(s.id)), daysSince(s.createdAt));
      return {
        id: s.id,
        sku: s.sku,
        title: s.title || product.title,
        price: round(s.price),
        purchasePrice: round(s.purchasePrice),
        totalCost: round(s.purchasePrice + s.extraCost),
        stockFbo: st.fbo,
        stockFbs: st.fbs,
        stockOwn: st.own,
        sold: agg.units,
        revenue: round(agg.revenue),
        profit: round(agg.netProfit),
        barcode: s.barcode,
        extraCost: round(s.extraCost),
        volumeL: s.volumeL,
        weightGr: s.weightGr,
        archived: s.archived,
        reserved: st.reserved,
        inTransit: st.inTransit,
        avgDaily: round(avg, 2),
        daysLeft: state.daysLeft,
        status: state.status,
        margin: pct(agg.netProfit, agg.revenue),
        roi: pct(agg.netProfit, agg.cogs),
        lastSaleAt: agg.lastSaleAt ? agg.lastSaleAt.toISOString() : null,
      } satisfies ProductDetailSku;
    });

    // ── 60 kunlik sotuv seriyasi ──
    const days = lastDays(DETAIL_DAYS);
    const seriesMap = new Map<string, ProductSalesPoint>(
      days.map((date) => [date, { date, units: 0, revenue: 0, profit: 0, orders: 0 }]),
    );
    const ordersPerDay = new Map<string, Set<string>>();
    for (const it of orderRows) {
      const key = toISODate(it.orderedAt);
      const row = seriesMap.get(key);
      if (!row) continue;
      const returned = it.status === 'returned' || Boolean(it.returnedAt);
      if (!returned && it.status !== 'canceled') {
        row.units += it.qty;
        row.revenue += it.revenue;
        row.profit += it.netProfit;
        const set = ordersPerDay.get(key) ?? new Set<string>();
        set.add(it.orderId);
        ordersPerDay.set(key, set);
      }
    }
    const series = days.map((date) => {
      const row = seriesMap.get(date)!;
      return {
        date,
        units: row.units,
        revenue: round(row.revenue),
        profit: round(row.profit),
        orders: ordersPerDay.get(date)?.size ?? 0,
      } satisfies ProductSalesPoint;
    });

    // ── Qoldiq tarixi: snapshot bo'lmagan kunlarda oxirgi ma'lum qiymat saqlanadi ──
    const snapByDay = new Map<string, { fbo: number; fbs: number; own: number }>();
    for (const s of snapshots) {
      const key = toISODate(s.date);
      const cur = snapByDay.get(key) ?? { fbo: 0, fbs: 0, own: 0 };
      cur.fbo += s.fbo;
      cur.fbs += s.fbs;
      cur.own += s.own;
      snapByDay.set(key, cur);
    }
    let carry = { fbo: 0, fbs: 0, own: 0 };
    const stockHistory: ProductStockPoint[] = days.map((date) => {
      const found = snapByDay.get(date);
      if (found) carry = found;
      return { date, fbo: carry.fbo, fbs: carry.fbs, own: carry.own, total: carry.fbo + carry.fbs + carry.own };
    });

    // ── Sharhlar statistikasi ──
    const distribution = [5, 4, 3, 2, 1].map((rating) => ({
      rating,
      count: reviewRows.filter((r) => r.rating === rating).length,
    }));
    const answered = reviewRows.filter((r) => r.answered).length;
    const reviews: ProductReviewsStats = {
      count: reviewRows.length,
      avgRating: round(safeDiv(reviewRows.reduce((s, r) => s + r.rating, 0), reviewRows.length), 2),
      answered,
      unanswered: reviewRows.length - answered,
      distribution,
      last: reviewRows.slice(0, 5).map((r) => ({
        id: r.id,
        rating: r.rating,
        text: r.text,
        author: r.author,
        publishedAt: r.publishedAt.toISOString(),
        answered: r.answered,
      })),
    };

    // ── Unit-iqtisod (1 dona uchun, davr ma'lumotlari asosida) ──
    let units = 0;
    let revenue = 0;
    let commission = 0;
    let logistics = 0;
    let cogs = 0;
    let returns = 0;
    for (const s of product.skus) {
      const agg = sales.get(s.id) ?? EMPTY_AGG;
      units += agg.units;
      revenue += agg.revenue;
      commission += agg.commission;
      logistics += agg.logistics;
      cogs += agg.cogs;
      returns += agg.returns;
    }
    const avgVolume = product.skus.length
      ? product.skus.reduce((s, x) => s + x.volumeL, 0) / product.skus.length
      : 0;
    const avgExtra = product.skus.length
      ? product.skus.reduce((s, x) => s + x.extraCost, 0) / product.skus.length
      : 0;
    const price = units > 0 ? safeDiv(revenue, units) : card.minPrice;
    const purchasePrice =
      units > 0
        ? safeDiv(cogs, units)
        : safeDiv(
            product.skus.reduce((s, x) => s + x.purchasePrice, 0),
            product.skus.length,
          );

    const unitInput: UnitCalcInput = {
      price: round(price),
      purchasePrice: round(purchasePrice),
      commissionPct: revenue > 0 ? pct(commission, revenue) : DEFAULTS.commissionPct,
      logistics: units > 0 ? round(safeDiv(logistics, units)) : DEFAULTS.logisticsPerUnit,
      storagePerDay: round(avgVolume * DEFAULTS.storagePerLiterPerDay),
      storageDays: 30,
      packaging: 0,
      otherCost: round(avgExtra),
      taxPct: taxCompany?.taxRate ?? DEFAULTS.taxPct,
      buyoutPct: units + returns > 0 ? round(pct(units, units + returns)) : DEFAULTS.buyoutPct,
      returnLogistics: 0,
      qty: 1,
    };

    const payload: ProductDetailResponse = {
      period: range.period,
      card,
      store: { id: product.storeId, title: storeTitles.get(product.storeId) ?? 'Do‘kon' },
      brand: product.brand,
      skus,
      series,
      stockHistory,
      reviews,
      unitInput,
      unit: calcUnitEconomics(unitInput),
    };

    res.json(payload);
  }),
);

export default router;
