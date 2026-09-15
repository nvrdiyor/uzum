/**
 * Mahsulotlar bo'limi uchun mahalliy tiplar va yordamchilar.
 * `ProductsResponse` / `ProductCard` — @savdoiq/shared dan, mahsulot tafsiloti (GET /products/:id)
 * esa shu yerda tavsiflangan (javob konverti shu bo'limga xos).
 */

import type { ProductCard, ProductCardSku, ReviewRow, TimeSeriesPoint } from '@savdoiq/shared';

/** Zaxira davri (kun) — "qoldiq necha kunga yetadi" hisobi uchun */
export const COVER_OPTIONS = ['7', '14', '30', '60', '90'] as const;
export type CoverDays = (typeof COVER_OPTIONS)[number];

/** Ro'yxat filtri (query: filter=) */
export const PRODUCT_FILTERS = ['all', 'active', 'need_order', 'out', 'archived'] as const;
export type ProductFilter = (typeof PRODUCT_FILTERS)[number];

export type ProductView = 'cards' | 'table';

export const PRODUCT_SORTS = ['revenue', 'profit', 'sold', 'daysLeft', 'margin', 'title'] as const;
export type ProductSort = (typeof PRODUCT_SORTS)[number];

/** Kartochkada ko'rsatiladigan hosilaviy holat */
export type ProductState = 'active' | 'need_order' | 'out' | 'archived';

export function totalStock(p: Pick<ProductCard, 'stockFbo' | 'stockFbs' | 'stockOwn'>): number {
  return (p.stockFbo ?? 0) + (p.stockFbs ?? 0) + (p.stockOwn ?? 0);
}

export function productState(p: ProductCard): ProductState {
  const raw = (p.status ?? '').toLowerCase();
  if (raw.includes('arch') || raw.includes('arxiv') || raw.includes('архив')) return 'archived';
  if (totalStock(p) <= 0) return 'out';
  if ((p.needOrder ?? 0) > 0) return 'need_order';
  return 'active';
}

/** Holat uchun token ranglari (faqat dizayn tokenlari) */
export const STATE_STYLE: Record<ProductState, { chip: string; dot: string; text: string }> = {
  active: { chip: 'bg-brand/[0.12] text-brand', dot: 'bg-brand', text: 'text-brand' },
  need_order: { chip: 'bg-warn/[0.14] text-warn', dot: 'bg-warn', text: 'text-warn' },
  out: { chip: 'bg-danger/[0.12] text-danger', dot: 'bg-danger', text: 'text-danger' },
  archived: { chip: 'bg-surface-3 text-muted', dot: 'bg-muted', text: 'text-muted' },
};

/** "Necha kunga yetadi" chizig'i uchun rang */
export function coverTone(daysLeft: number | null | undefined): 'brand' | 'info' | 'warn' | 'danger' | 'muted' {
  if (daysLeft === null || daysLeft === undefined) return 'muted';
  if (daysLeft <= 7) return 'danger';
  if (daysLeft <= 14) return 'warn';
  if (daysLeft >= 120) return 'info';
  return 'brand';
}

/** Bir dona uchun to'liq tannarx: sotib olish narxi + qo'shimcha xarajat */
export function skuTotalCost(sku: { purchasePrice?: number; extraCost?: number; totalCost?: number }): number {
  if (typeof sku.totalCost === 'number' && Number.isFinite(sku.totalCost)) return sku.totalCost;
  return (sku.purchasePrice ?? 0) + (sku.extraCost ?? 0);
}

/** SKU'lar bo'yicha o'rtacha to'liq tannarx (0 bo'lganlari hisobga olinmaydi) */
export function avgPurchasePrice(skus: ProductCardSku[] | undefined): number {
  const list = (skus ?? []).filter((s) => skuTotalCost(s) > 0);
  if (!list.length) return 0;
  return Math.round(list.reduce((sum, s) => sum + skuTotalCost(s), 0) / list.length);
}

// ─────────────────────────── Mahsulot tafsiloti (GET /products/:id) ───────────────────────────

export interface ProductDetailSku extends ProductCardSku {
  /** Qo'shimcha xarajat (qadoq, marker va h.k.) */
  extraCost: number;
  volumeL?: number;
  weightGr?: number;
  margin?: number;
  roi?: number;
}

export interface ProductStockPoint {
  date: string;
  fbo: number;
  fbs: number;
  own: number;
}

export interface ProductUnitBreakdown {
  price: number;
  purchasePrice: number;
  commission: number;
  logistics: number;
  storage: number;
  otherCost: number;
  tax: number;
  netProfit: number;
  margin: number;
  roi: number;
  breakEvenPrice: number;
}

export interface ProductReviewsBlock {
  totals: { count: number; avgRating: number; answered: number; unanswered: number };
  distribution: { rating: number; count: number }[];
  rows: ReviewRow[];
}

export interface ProductDetailResponse {
  product: ProductCard;
  skus?: ProductDetailSku[];
  /** Sotuv dinamikasi (60 kun) */
  series?: TimeSeriesPoint[];
  /** Qoldiqlar tarixi */
  stocks?: ProductStockPoint[];
  reviews?: ProductReviewsBlock;
  unit?: ProductUnitBreakdown;
}

/** Tannarxi kiritilmagan SKU'lar */
export function skusWithoutCost(skus: ProductDetailSku[] | undefined): ProductDetailSku[] {
  // Qo'shimcha xarajat kiritilgani tannarx kiritilganini anglatmaydi
  return (skus ?? []).filter((s) => !s.purchasePrice || s.purchasePrice <= 0);
}

// ─────────── GET /products/:id javobini bir ko'rinishga keltirish ───────────

/**
 * Server `card`, `stockHistory` va yassi `reviews` qaytaradi, sahifa esa
 * `product`, `stocks` va `reviews.totals` kutadi. Ilgari nomlar mos
 * kelmagani uchun kartochka ochilganda doim "Mahsulot topilmadi" chiqardi.
 */
export function normalizeProductDetail(raw: unknown): ProductDetailResponse | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as Record<string, unknown>;
  const product = (r.product ?? r.card) as ProductCard | undefined;
  if (!product) return undefined;

  const rev = (r.reviews ?? {}) as Record<string, unknown>;
  const hasTotals = rev && typeof rev === 'object' && 'totals' in rev;
  const reviews: ProductReviewsBlock | undefined = hasTotals
    ? (rev as unknown as ProductReviewsBlock)
    : {
        totals: {
          count: Number(rev.count ?? 0),
          avgRating: Number(rev.avgRating ?? 0),
          answered: Number(rev.answered ?? 0),
          unanswered: Number(rev.unanswered ?? 0),
        },
        distribution: (rev.distribution ?? []) as { rating: number; count: number }[],
        rows: ((rev.last ?? rev.rows ?? []) as ReviewRow[]) ?? [],
      };

  const u = (r.unit ?? {}) as Record<string, number>;
  const ui = (r.unitInput ?? {}) as Record<string, number>;
  const unit: ProductUnitBreakdown | undefined =
    Object.keys(u).length === 0
      ? undefined
      : {
          // Server `UnitCalcResult` (bir dona uchun) qaytaradi — nomlarni moslaymiz
          price: Number(u.price ?? ui.price ?? 0),
          purchasePrice: Number(u.cogs ?? ui.purchasePrice ?? 0),
          commission: Number(u.commission ?? 0),
          logistics: Number(u.logisticsTotal ?? ui.logistics ?? 0),
          storage: Number(u.storageTotal ?? 0),
          otherCost: Number(ui.otherCost ?? 0),
          tax: Number(u.tax ?? 0),
          netProfit: Number(u.netProfitPerUnit ?? u.netProfit ?? 0),
          margin: Number(u.margin ?? 0),
          roi: Number(u.roi ?? 0),
          breakEvenPrice: Number(u.breakEvenPrice ?? 0),
        };

  return {
    product,
    skus: (r.skus ?? []) as ProductDetailSku[],
    series: (r.series ?? []) as TimeSeriesPoint[],
    stocks: (r.stocks ?? r.stockHistory ?? []) as ProductStockPoint[],
    reviews,
    unit,
  };
}
