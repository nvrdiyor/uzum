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
  active: { chip: 'bg-brand/12 text-brand', dot: 'bg-brand', text: 'text-brand' },
  need_order: { chip: 'bg-warn/14 text-warn', dot: 'bg-warn', text: 'text-warn' },
  out: { chip: 'bg-danger/12 text-danger', dot: 'bg-danger', text: 'text-danger' },
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

/** SKU'lar bo'yicha o'rtacha tannarx (0 bo'lganlari hisobga olinmaydi) */
export function avgPurchasePrice(skus: ProductCardSku[] | undefined): number {
  const list = (skus ?? []).filter((s) => (s.purchasePrice ?? 0) > 0);
  if (!list.length) return 0;
  return Math.round(list.reduce((sum, s) => sum + s.purchasePrice, 0) / list.length);
}

// ─────────────────────────── Mahsulot tafsiloti (GET /products/:id) ───────────────────────────

export interface ProductDetailSku extends ProductCardSku {
  /** Qo'shimcha xarajat (qadoq, marker va h.k.) */
  extraCost?: number;
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
  return (skus ?? []).filter((s) => !s.purchasePrice || s.purchasePrice <= 0);
}
