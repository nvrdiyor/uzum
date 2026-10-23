/**
 * Mahsulotlar moduli — /api/v1/products
 *
 *  GET   /                → ProductsResponse (kartochkalar: sotuv, foyda, ROI, marja, qoldiq)
 *  GET   /abc             → AbcResponse (ABC + XYZ tahlil)
 *  GET   /illiquid        → IlliquidResponse (nolikvid / harakatsiz tovarlar)
 *  GET   /:id             → bitta mahsulot tafsiloti (SKU'lar, 60 kunlik seriya, sharhlar, unit-iqtisod)
 *  PATCH /sku/:id         → tannarx va o'lchamlarni yangilash (+ CostPrice tarixiga yozuv)
 *  POST  /sku/bulk-cost   → tannarxlarni ommaviy yangilash
 *  (ikkalasi ham SKU'ning o'tgan buyurtma pozitsiyalarini yangi tannarx bilan darhol qayta hisoblaydi)
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
  businessDayStart,
  toBusinessDate,
  type AbcResponse,
  type AbcRow,
  type IlliquidResponse,
  type IlliquidRow,
  type Period,
  type ProductCard,
  type ProductCardSku,
  type ProductProfitMoney,
  type ProductProfitResponse,
  type ProductProfitRow,
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
import { aggregateSalesNet, getPeriodCosts, investedIn } from '../services/pnl.js';
import { recalcSkuOrderItems } from '../services/item-cost.js';

const router = Router();
router.use(requireAuth, requireCompany);

/** Nolikvid deb hisoblash chegarasi (kun sotuvsiz) */
const ILLIQUID_DAYS = 30;
/** Tafsilot sahifasidagi seriya uzunligi (kun) */
const DETAIL_DAYS = 60;

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

/** SKU bo'yicha xarid foizi uchun dona: sotib olingan, yo'qotilgan (bekor + qaytgan), yo'lda */
interface BuyoutAgg {
  bought: number;
  lost: number;
  transit: number;
}

/**
 * Davrdagi pozitsiyalardan xarid foizi asosini yig'adi (SKU kesimida).
 *
 * Ilgari kartochkada "Konversiya" turardi: bozor o'rtachasi 2,5% × reyting ×
 * qaytmaganlar ulushi. Seller API ko'rishlarni bermaydi — raqam to'qilgan edi
 * (2026-10-24). Endi faqat haqiqiy pozitsiyalar sanaladi, Boshqaruv panelidagi
 * "Sotib olish darajasi" bilan bir xil ta'rifda (analytics.ts collectTotals):
 *
 *   - sotib olingan — bekor/qaytmagan va buyurtmada `deliveredAt` bor
 *     (xaridor qabul qilgan; `OrderItem.status = 'delivered'` buni bildirmaydi,
 *     importer uni yo'ldagilarga ham qo'yadi);
 *   - yo'qotilgan — bekor qilingan yoki qaytgan dona (`returnedQty`, bo'lmasa `qty`);
 *   - yo'lda — qolgani; yakunlanmagan, shuning uchun foizga KIRMAYDI. Aks holda
 *     yangi buyurtmalar "sotib olindi" bo'lib, foiz sun'iy ko'tarilardi.
 */
async function getBuyoutBySku(
  storeIds: string[],
  from: Date,
  toExclusive: Date,
  skuIds?: string[],
): Promise<Map<string, BuyoutAgg>> {
  const out = new Map<string, BuyoutAgg>();
  if (storeIds.length === 0 || (skuIds && skuIds.length === 0)) return out;

  const items = await prisma.orderItem.findMany({
    where: {
      orderedAt: { gte: from, lt: toExclusive },
      order: { storeId: { in: storeIds } },
      ...(skuIds ? { skuId: { in: skuIds } } : {}),
    },
    select: {
      skuId: true,
      qty: true,
      status: true,
      returnedAt: true,
      returnedQty: true,
      order: { select: { deliveredAt: true } },
    },
  });

  for (const it of items) {
    if (!it.skuId) continue;
    const b = out.get(it.skuId) ?? { bought: 0, lost: 0, transit: 0 };
    const returned = it.status === 'returned' || Boolean(it.returnedAt);
    if (returned || it.status === 'canceled') {
      // Uzum bekor/qaytgan satrda `amount = 0` beradi — haqiqiy dona `returnedQty` da
      b.lost += it.returnedQty > 0 ? it.returnedQty : Math.max(it.qty, 1);
    } else {
      // Qisman qaytgan tirik pozitsiya: qaytgan qismi yo'qotilgan, qolgani o'z holatida
      if (it.returnedQty > 0) b.lost += it.returnedQty;
      if (it.order.deliveredAt) b.bought += it.qty;
      else b.transit += it.qty;
    }
    out.set(it.skuId, b);
  }
  return out;
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
  promoName: string | null;
  promoJoined: boolean;
  promoEndsAt: Date | null;
  volumeL: number;
  weightGr: number;
  /** Uzum hisoblagan oylik saqlash to'lovi, bir dona uchun */
  storagePerItem: number;
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
  hidden: boolean;
  skus: ProductSkuRecord[];
}

/** Barcha SKU'lari arxivda yoki Uzum mahsulotni o'zi arxiv deb bergan */
function isArchivedProduct(p: { status: string; skus: ReadonlyArray<{ archived: boolean }> }): boolean {
  return (p.skus.length > 0 && p.skus.every((s) => s.archived)) || /arch/i.test(p.status);
}

interface CardContext {
  sales: Map<string, SalesAgg>;
  stocks: Map<string, StockInfo>;
  avgDaily: Map<string, number>;
  /** Xarid foizi asosi (`getBuyoutBySku`) */
  buyout: Map<string, BuyoutAgg>;
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
      hidden: true,
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
          promoName: true,
          promoJoined: true,
          promoEndsAt: true,
          volumeL: true,
          weightGr: true,
          // Uzum hisoblagan oylik saqlash to'lovi — taxmindan ustun turadi
          storagePerItem: true,
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
  /** Bir donaga qo'shimcha xarajat yig'indisi — tannarx bilan birga ROI maxraji */
  let otherCost = 0;
  let stockFbo = 0;
  let stockFbs = 0;
  let stockOwn = 0;
  let avgTotal = 0;
  let needOrder = 0;
  let bought = 0;
  let lost = 0;
  let transit = 0;
  /** Joriy narx — katalogdagi eng arzon SKU */
  let minPrice = Number.POSITIVE_INFINITY;
  /** O'sha SKU'ning chegirmadan oldingi narxi (bo'lmasa 0) */
  let listPrice = 0;

  for (const s of p.skus) {
    const agg = c.sales.get(s.id) ?? EMPTY_AGG;
    const st = c.stocks.get(s.id) ?? EMPTY_STOCK;
    const avg = c.avgDaily.get(s.id) ?? 0;
    const bo = c.buyout.get(s.id);

    sold += agg.units;
    bought += bo?.bought ?? 0;
    lost += bo?.lost ?? 0;
    transit += bo?.transit ?? 0;
    returns += agg.returns;
    revenue += agg.revenue;
    profit += agg.netProfit;
    cogs += agg.cogs;
    otherCost += agg.otherCost;
    stockFbo += st.fbo;
    stockFbs += st.fbs;
    stockOwn += st.own;
    avgTotal += avg;
    // Har bir SKU o'z zaxirasiga muhtoj — shuning uchun SKU kesimida qo'shamiz
    needOrder += recommendedQty(avg, c.cover, st.total, 0);
    /*
     * Ko'rsatiladigan narx — JORIY katalog narxi (import aksiya narxini ham shu
     * maydonga yozadi). Davr bo'yicha o'rtacha sotilgan narx alohida qaytadi:
     * ikkalasini bitta raqamga aralashtirish sotuvchini chalg'itardi — o'tgan
     * oyda arzonroq sotilgan tovarning bugungi narxi "chizilgan" bo'lib chiqardi.
     */
    if (s.price > 0 && s.price < minPrice) {
      minPrice = s.price;
      listPrice = s.oldPrice > s.price ? s.oldPrice : 0;
    }

    skus.push({
      id: s.id,
      sku: s.sku,
      title: s.title || p.title,
      price: round(s.price),
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

  /*
   * Faol aksiya. Uzum narxni bermaydi, lekin nomi va tugash sanasi keladi —
   * sotuvchi kamida "chegirma qachongacha" degan savolga javob oladi.
   */
  const joinedSku = p.skus.find((s2) => s2.promoJoined && s2.promoName);
  const promoInfo = joinedSku
    ? {
        name: joinedSku.promoName ?? '',
        endsAt: joinedSku.promoEndsAt ? joinedSku.promoEndsAt.toISOString() : null,
      }
    : null;

  const stockTotal = stockFbo + stockFbs + stockOwn;
  const completed = bought + lost;
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
    avgSoldPrice: sold > 0 ? round(safeDiv(revenue, sold)) : 0,
    promo: promoInfo,
    sold,
    returns,
    revenue: round(revenue),
    profit: round(profit),
    roi: pct(profit, investedIn(cogs, otherCost)),
    margin: pct(profit, revenue),
    // Yakunlangan pozitsiya bo'lmasa null — "0%" sotuvchini "hech kim olmadi" deb chalg'itardi
    buyoutRate: completed > 0 ? pct(bought, completed) : null,
    buyoutUnits: bought,
    completedUnits: completed,
    transitUnits: transit,
    stockFbo,
    stockFbs,
    stockOwn,
    daysLeft: avgTotal > 0 ? Math.round(stockTotal / avgTotal) : null,
    needOrder,
    // Faqat arxivdagi tovar yashirinadi: Uzum'da qayta faollashsa o'zi ko'rinadi
    hidden: p.hidden && isArchivedProduct(p),
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
  // Yakunlangani yo'q tovar (null) kamayish tartibida oxirga tushadi
  buyout: (p) => p.buyoutRate ?? -1,
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
type ProductFilter = 'all' | 'active' | 'archived' | 'need_order' | 'no_stock' | 'out' | 'hidden';
const PRODUCT_FILTERS: ProductFilter[] = ['all', 'active', 'archived', 'need_order', 'no_stock', 'out', 'hidden'];

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
    const [products, sales, stocks, avgDaily, buyout] = await Promise.all([
      loadProducts(storeIds),
      aggregateSalesNet(company.id, storeIds, range.from, range.toExclusive, range.storeId),
      getLatestStocks(storeIds),
      getAvgDaily(storeIds, 30),
      getBuyoutBySku(storeIds, range.from, range.toExclusive),
    ]);

    const volumeBySku = new Map<string, number>();
    for (const p of products) for (const s of p.skus) volumeBySku.set(s.id, s.volumeL);

    let cards = products.map((p) => buildCard(p, { sales, stocks, avgDaily, buyout, cover }));

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

    // O'chirilganlar faqat o'z bo'limida — boshqa hamma ro'yxatdan (tannarx ham shundan oladi) chiqadi
    const hiddenCount = cards.filter((c) => c.hidden).length;
    cards = cards.filter((c) => (filter === 'hidden' ? c.hidden : !c.hidden));

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
        hidden: hiddenCount,
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
      aggregateSalesNet(company.id, storeIds, range.from, range.toExclusive, range.storeId),
      salesBuckets(storeIds, range.from, range.toExclusive),
    ]);

    const search = range.search?.toLowerCase();
    const base = [...sales.values()]
      .map((agg) => ({ agg, info: catalog.get(agg.skuId) }))
      .filter((r): r is { agg: SalesAgg & { adFee: number }; info: SkuInfo } => Boolean(r.info))
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

// ─────────────────────────── GET /profit — mahsulot foydasi ───────────────────────────

const MONEY_KEYS = [
  'revenue',
  'commission',
  'logistics',
  'payout',
  'cogs',
  'otherCost',
  'tax',
  'ads',
  'netProfit',
] as const satisfies readonly (keyof ProductProfitMoney)[];

const emptyMoney = (): ProductProfitMoney => ({
  revenue: 0,
  commission: 0,
  logistics: 0,
  payout: 0,
  cogs: 0,
  otherCost: 0,
  tax: 0,
  ads: 0,
  netProfit: 0,
});

const mapMoney = (m: ProductProfitMoney, f: (v: number) => number): ProductProfitMoney => {
  const out = emptyMoney();
  for (const k of MONEY_KEYS) out[k] = f(m[k]);
  return out;
};

/**
 * Har bir mahsulot qancha pul qoldirdi: tushum → Uzum to'laydigani → sof foyda,
 * jami va bir dona hisobida.
 *
 * Foyda ta'rifi butun saytdagi bilan bir xil (services/pnl.ts): pozitsiya
 * foydasidan shu mahsulotning reklama to'lovi ayriladi. Soliq alohida
 * saqlanmaydi — u ayniyatdan tiklanadi (chiqarishga − tannarx − qo'shimcha −
 * pozitsiya foydasi), shuning uchun kartochkadagi qatorlar so'mgacha yopiladi.
 */
router.get(
  '/profit',
  requireFeature('unit_economics'),
  ah(async (req, res) => {
    const { company, plan } = companyCtx(req);
    const range = resolveRange(req, plan);
    const storeIds = await getStoreIds(company.id, range.storeId);

    const [sales, costs, orderLines] = await Promise.all([
      aggregateSalesNet(company.id, storeIds, range.from, range.toExclusive, range.storeId),
      getPeriodCosts(company.id, storeIds, range.from, range.toExclusive, range.storeId),
      // Buyurtmalar soni mahsulot bo'yicha ANIQ bo'lsin: bitta buyurtmada ikki rang bo'lsa ikki marta sanalmaydi
      storeIds.length
        ? prisma.orderItem.findMany({
            where: {
              orderedAt: { gte: range.from, lt: range.toExclusive },
              order: { storeId: { in: storeIds } },
              status: { notIn: ['canceled', 'returned'] },
              returnedAt: null,
              qty: { gt: 0 },
              skuId: { not: null },
            },
            select: { skuId: true, orderId: true },
          })
        : Promise.resolve([] as { skuId: string | null; orderId: string }[]),
    ]);

    /*
     * SKU ma'lumoti katalogdan EMAS, sotuvi bor SKU'lardan to'g'ridan-to'g'ri.
     * Katalog yashirilgan va arxivlangan mahsulotlarni chiqarib tashlaydi —
     * birinchi versiyada shu sabab sotuvchi yashirgan ikki mahsulotning pullari
     * sahifadan tushib qoldi va yig'indi paneldagi sof foydadan 403 330 kam
     * chiqdi. Pul yashirilgan tovardan kelgan bo'lsa ham — u pul.
     */
    const skuIds = [...new Set([...sales.keys(), ...orderLines.map((l) => l.skuId).filter((id): id is string => Boolean(id))])];
    const skuRows = skuIds.length
      ? await prisma.sku.findMany({
          where: { id: { in: skuIds } },
          select: {
            id: true,
            imageUrl: true,
            productId: true,
            product: { select: { title: true, category: true, imageUrl: true, hidden: true } },
          },
        })
      : [];
    const skuInfo = new Map(skuRows.map((s) => [s.id, s]));
    const productIds = [...new Set(skuRows.map((s) => s.productId))];
    const skuCounts = productIds.length
      ? await prisma.sku.groupBy({ by: ['productId'], where: { productId: { in: productIds } }, _count: { _all: true } })
      : [];
    const skuCount = new Map(skuCounts.map((g) => [g.productId, g._count._all]));

    const ordersOf = new Map<string, Set<string>>();
    for (const line of orderLines) {
      const info = line.skuId ? skuInfo.get(line.skuId) : undefined;
      if (!info) continue;
      const set = ordersOf.get(info.productId) ?? new Set<string>();
      set.add(line.orderId);
      ordersOf.set(info.productId, set);
    }

    type ProductAgg = {
      title: string;
      category: string | null;
      hidden: boolean;
      image: string | null;
      money: ProductProfitMoney;
      units: number;
      returns: number;
    };
    const byProduct = new Map<string, ProductAgg>();
    let attributedAds = 0;
    for (const [skuId, agg] of sales) {
      const info = skuInfo.get(skuId);
      if (!info) continue;
      attributedAds += agg.adFee;
      // Pozitsiya foydasi (reklamagacha) = to'lov − tannarx − qo'shimcha − soliq
      const itemProfit = agg.netProfit + agg.adFee;
      const cur: ProductAgg = byProduct.get(info.productId) ?? {
        title: info.product.title,
        category: info.product.category,
        hidden: info.product.hidden,
        image: info.product.imageUrl,
        money: emptyMoney(),
        units: 0,
        returns: 0,
      };
      cur.money.revenue += agg.revenue;
      cur.money.commission += agg.commission;
      cur.money.logistics += agg.logistics;
      cur.money.payout += agg.payout;
      cur.money.cogs += agg.cogs;
      cur.money.otherCost += agg.otherCost;
      cur.money.tax += agg.payout - agg.cogs - agg.otherCost - itemProfit;
      cur.money.ads += agg.adFee;
      cur.money.netProfit += agg.netProfit;
      cur.units += agg.units;
      cur.returns += agg.returns;
      cur.image ??= info.imageUrl;
      byProduct.set(info.productId, cur);
    }

    const rows: ProductProfitRow[] = [...byProduct.entries()]
      .filter(([, p]) => p.units > 0 || p.money.ads > 0)
      .map(([productId, p]) => ({
        productId,
        title: p.title,
        category: p.category,
        imageUrl: p.image,
        hidden: p.hidden,
        skuCount: skuCount.get(productId) ?? 1,
        units: p.units,
        orders: ordersOf.get(productId)?.size ?? 0,
        returns: p.returns,
        ...mapMoney(p.money, round),
        margin: pct(p.money.netProfit, p.money.revenue),
        roi: pct(p.money.netProfit, investedIn(p.money.cogs, p.money.otherCost)),
        perUnit: p.units > 0 ? mapMoney(p.money, (v) => round(v / p.units)) : emptyMoney(),
      }))
      .sort((a, b) => b.netProfit - a.netProfit);

    const total = emptyMoney();
    for (const r of rows) for (const k of MONEY_KEYS) total[k] += r[k];
    const units = rows.reduce((s, r) => s + r.units, 0);

    const payload: ProductProfitResponse = {
      period: range.period,
      currency: company.currency,
      totals: {
        ...mapMoney(total, round),
        units,
        // Do'kon bo'yicha tirik buyurtmalar (bir buyurtmada ikki mahsulot bo'lsa bir marta)
        orders: new Set(orderLines.map((l) => l.orderId)).size,
        products: rows.length,
        margin: pct(total.netProfit, total.revenue),
        roi: pct(total.netProfit, investedIn(total.cogs, total.otherCost)),
      },
      rows,
      unallocated: round(Math.max(0, costs.total - attributedAds)),
    };

    res.json(payload);
  }),
);

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
    /**
     * Saytda "30 / 60 / 90 kun" filtri bor — u serverga `days` bo'lib keladi.
     * Ilgari e'tiborga olinmagani uchun tanlov jadvalni o'zgartirmasdi.
     */
    const daysParam = Number((req.query as Record<string, string | undefined>).days);
    const minDays = Number.isFinite(daysParam) && daysParam > 0 ? Math.max(ILLIQUID_DAYS, daysParam) : ILLIQUID_DAYS;
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

      // Nolikvid: tanlangan kundan ko'p sotilmagan yoki qoldiq 90 kundan ortiqqa yetadi
      const stale = daysWithoutSale >= minDays;
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
  /** Yangi tannarx bilan qayta yozilgan buyurtma pozitsiyalari (null — qayta hisoblash bajarilmadi) */
  itemsRecalculated: number | null;
  message: string;
}

/**
 * Tannarx saqlangach SKU'ning o'tgan buyurtma pozitsiyalari darhol qayta
 * hisoblanadi (services/item-cost.ts) — foyda va tannarx qamrovi keyingi
 * to'liq sinxronni kutmaydi.
 *
 * Xato saqlashni bekor qilmaydi: tannarx allaqachon yozilgan, pozitsiyalar
 * qayta saqlashda yoki sinxronda tuzaladi (javobda `itemsRecalculated: null`).
 */
async function recalcAfterCostSave(skuIds: string[], taxRate: number): Promise<number | null> {
  try {
    return await recalcSkuOrderItems(skuIds, taxRate);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[products] buyurtma pozitsiyalari qayta hisoblanmadi:', err instanceof Error ? err.message : err);
    return null;
  }
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

    /*
     * O'tgan buyurtmalar ham yangi tannarx bilan. Ilgari faqat Sku yozilardi:
     * 14 kundan eski sotuvlar to'liq sinxrongacha cogs = 0 bilan qolib, foyda
     * oshib ko'rinardi (2026-10-24). Qiymat o'zgarmagan bo'lsa ham ishlaydi —
     * avvalgi saqlashlardan eskirib qolgan pozitsiyalarni ham tuzatadi.
     */
    const costTouched = input.purchasePrice !== undefined || input.extraCost !== undefined;
    const itemsRecalculated = costTouched ? await recalcAfterCostSave([updated.id], company.taxRate) : 0;

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
      itemsRecalculated,
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
  /** Yangi tannarx bilan qayta yozilgan buyurtma pozitsiyalari (null — qayta hisoblash bajarilmadi) */
  itemsRecalculated: number | null;
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

    // O'tgan buyurtmalar ham yangi tannarx bilan — PATCH /sku/:id dagi izohga qarang
    const itemsRecalculated = await recalcAfterCostSave(
      items.map((i) => i.skuId),
      company.taxRate,
    );

    const payload: BulkCostResponse = {
      updated: items.length,
      skipped,
      items,
      itemsRecalculated,
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

// ─────────────────────────── O'chirish / qaytarish ───────────────────────────

/**
 * Uzum kabinetida tovarni o'chirib bo'lmaydi — faqat arxivlanadi. Xato
 * yaratilgan yoki eskirgan kartochka esa ro'yxatlarda va tannarx
 * jadvalida xalaqit beradi. Sotuvchi uni SavdoIQ'da "o'chiradi": tovar
 * "O'chirilganlar" bo'limiga o'tadi va istalgan payt qaytariladi. Sotuv
 * tarixi (hisobotlar, tushum) o'zgarmaydi. Faqat arxivdagi tovar uchun.
 */
async function findOwnProduct(companyId: string, id: string) {
  const storeIds = await getStoreIds(companyId);
  const product = await prisma.product.findFirst({
    where: { id, storeId: { in: storeIds } },
    select: { id: true, title: true, status: true, skus: { select: { archived: true } } },
  });
  if (!product) throw AppError.notFound('Mahsulot topilmadi');
  return product;
}

router.post(
  '/:id/hide',
  requireFeature('products_assortment'),
  requireRole('owner', 'manager'),
  ah(async (req, res) => {
    const { company } = companyCtx(req);
    const product = await findOwnProduct(company.id, String(req.params.id));
    if (!isArchivedProduct(product))
      throw AppError.badRequest('Faqat Uzum’da arxivga olingan tovarni o‘chirish mumkin');
    await prisma.product.update({ where: { id: product.id }, data: { hidden: true, hiddenAt: new Date() } });
    res.json({ ok: true, id: product.id, hidden: true });
  }),
);

router.post(
  '/:id/restore',
  requireFeature('products_assortment'),
  requireRole('owner', 'manager'),
  ah(async (req, res) => {
    const { company } = companyCtx(req);
    const product = await findOwnProduct(company.id, String(req.params.id));
    await prisma.product.update({ where: { id: product.id }, data: { hidden: false, hiddenAt: null } });
    res.json({ ok: true, id: product.id, hidden: false });
  }),
);

/** Oxirgi `DETAIL_DAYS` kunning ISO sanalari (bugun oxirgi) */
function lastDays(days: number): string[] {
  const today = parseISODate(toBusinessDate(new Date()));
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
    const seriesFrom = businessDayStart(lastDays(DETAIL_DAYS)[0] ?? toBusinessDate(new Date()));

    const [sales, stocks, avgDaily, lastSale, storeTitles, orderRows, snapshots, reviewRows, taxCompany, buyout] =
      await Promise.all([
        aggregateSalesNet(company.id, scopedStores, range.from, range.toExclusive),
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
        getBuyoutBySku(scopedStores, range.from, range.toExclusive, skuIds),
      ]);

    const card = buildCard(product, { sales, stocks, avgDaily, buyout, cover });

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
        roi: pct(agg.netProfit, investedIn(agg.cogs, agg.otherCost)),
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
      const key = toBusinessDate(it.orderedAt);
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
    /** Uzumning o'zi bergan oylik saqlash to'lovi (bo'lmasa 0) */
    const avgStoragePerItem = product.skus.length
      ? product.skus.reduce((s, x) => s + x.storagePerItem, 0) / product.skus.length
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
      /*
       * Saqlash: avval Uzumning O'ZI hisoblagan qiymat (oylik → kunlik),
       * faqat u bo'lmaganda hajm bo'yicha taxmin.
       *
       * Ilgari bu yerda to'g'ridan-to'g'ri hajm × DEFAULTS.storagePerLiterPerDay
       * turardi. O'sha konstanta TEKSHIRILMAGAN (o'z izohida shunday yozilgan),
       * ya'ni mahsulot kartasidagi marja va ROI unga bevosita bog'liq edi —
       * oshirilgan saqlash xarajati foydali tovarni zararli ko'rsatib,
       * sotuvchi uni assortimentdan chiqarib tashlashi mumkin edi.
       */
      storagePerDay: round(
        avgStoragePerItem > 0 ? avgStoragePerItem / 30 : avgVolume * DEFAULTS.storagePerLiterPerDay,
      ),
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
