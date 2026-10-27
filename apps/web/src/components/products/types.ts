/**
 * Mahsulotlar bo'limi uchun mahalliy tiplar va yordamchilar.
 * `ProductsResponse` / `ProductCard` — @savdoiq/shared dan, mahsulot tafsiloti (GET /products/:id)
 * esa shu yerda tavsiflangan (javob konverti shu bo'limga xos).
 */

import {
  STOCK_THRESHOLDS,
  type ProductCard,
  type ProductCardSku,
  type ProductQualityStats,
  type ReviewRow,
  type StockPlanSummary,
  type TimeSeriesPoint,
} from '@savdoiq/shared';
import type { Tone } from '@/components/ui';

/*
 * Zaxira davri endi sahifada tanlanmaydi — kompaniya sozlamasi (Rejalashtiruvchi,
 * GET /planner/settings), javobda `planner`. Ilgari bu yerda 7/14/30/60/90
 * tanlovi bor edi va sahifa doim cover=30 so'rardi: sozlamada 45 kun turgan
 * kompaniyada Mahsulotlar va Rejalashtiruvchi ikki xil "buyurtma kerak"
 * ko'rsatardi (2026-10-24).
 */

/** Ro'yxat filtri (query: filter=) */
export const PRODUCT_FILTERS = ['all', 'active', 'need_order', 'out', 'archived', 'hidden'] as const;
export type ProductFilter = (typeof PRODUCT_FILTERS)[number];

export type ProductView = 'cards' | 'table';

export const PRODUCT_SORTS = ['revenue', 'profit', 'sold', 'needOrder', 'daysLeft', 'margin', 'title'] as const;
export type ProductSort = (typeof PRODUCT_SORTS)[number];

/** Kartochkada ko'rsatiladigan hosilaviy holat */
export type ProductState = 'active' | 'need_order' | 'out' | 'archived' | 'hidden';

export function totalStock(p: Pick<ProductCard, 'stockFbo' | 'stockFbs' | 'stockOwn'>): number {
  return (p.stockFbo ?? 0) + (p.stockFbs ?? 0) + (p.stockOwn ?? 0);
}

export function isArchivedStatus(status: string | null | undefined): boolean {
  const raw = (status ?? '').toLowerCase();
  return raw.includes('arch') || raw.includes('arxiv') || raw.includes('архив');
}

export function productState(p: ProductCard): ProductState {
  if (p.hidden) return 'hidden';
  if (isArchivedStatus(p.status)) return 'archived';
  if (totalStock(p) <= 0) return 'out';
  if ((p.needOrder ?? 0) > 0) return 'need_order';
  return 'active';
}

/**
 * Kartochka rasmi ustidagi holat — faqat "hayot bosqichi" (sotuvda, qoldiqsiz,
 * arxiv, o'chirilgan). "Buyurtma kerak" kartochkada alohida, miqdori bilan
 * turadi — ikki joyda bir gapni takrorlamasin.
 */
export function lifecycleState(p: ProductCard): Exclude<ProductState, 'need_order'> {
  const s = productState(p);
  return s === 'need_order' ? 'active' : s;
}

/**
 * "Yetadi" rangi — Rejalashtiruvchi holati bo'yicha (kompaniyaning yetkazish
 * muddati bilan): kritik — qizil, buyurtma vaqti — sariq, yetarli — brend,
 * 90+ kun — ko'k (ortiqcha), sotuv yo'q — kulrang. Ilgari rang qat'iy 7/14 kun
 * chegarasidan olinardi: yetkazish 14 kun bo'lgan sotuvchida 12 kunlik tovar
 * kartochkada sariq, Rejalashtiruvchida esa "Kritik" edi (2026-10-24). Reja
 * bo'lmasa (arxivdagi tovar) — eski chegaralar.
 */
export function planTone(plan: StockPlanSummary | null | undefined, daysLeft?: number | null): Tone {
  if (!plan) return coverTone(daysLeft);
  if (plan.status === 'critical') return 'danger';
  if (plan.status === 'ending') return 'warn';
  if (plan.status === 'no_action') return 'muted';
  return plan.daysLeft !== null && plan.daysLeft >= STOCK_THRESHOLDS.excess ? 'info' : 'brand';
}

/**
 * "Yetadi" chizig'i shu kunga nisbatan to'ladi: yetkazish muddati + zaxira
 * davri (Rejalashtiruvchidagi chiziq bilan bir xil). Reja bo'lmasa — 30 kun.
 */
export function coverHorizon(plan: StockPlanSummary | null | undefined): number {
  return plan ? Math.max(1, plan.leadDays + plan.coverDays) : 30;
}

/** Holat uchun token ranglari (faqat dizayn tokenlari) */
export const STATE_STYLE: Record<ProductState, { chip: string; dot: string; text: string }> = {
  active: { chip: 'bg-brand/10 text-brand-ink', dot: 'bg-brand', text: 'text-brand-ink' },
  need_order: { chip: 'bg-warn/10 text-warn-ink', dot: 'bg-warn', text: 'text-warn-ink' },
  out: { chip: 'bg-danger/10 text-danger-ink', dot: 'bg-danger', text: 'text-danger-ink' },
  archived: { chip: 'bg-surface-3 text-muted', dot: 'bg-muted', text: 'text-muted' },
  hidden: { chip: 'bg-danger/10 text-danger-ink', dot: 'bg-danger', text: 'text-muted' },
};

/**
 * "Necha kunga yetadi" chizig'i uchun rang. Chegaralar Qoldiqlar, Sotuv va
 * qoldiq sahifalaridagi holat nishoni bilan bir xil (STOCK_THRESHOLDS): ilgari
 * bu yerda ortiqcha 120 kundan boshlanardi va 100 kunlik mahsulot kartochkada
 * yashil, Qoldiqlar sahifasida "Ortiqcha" bo'lib chiqardi.
 */
export function coverTone(daysLeft: number | null | undefined): 'brand' | 'info' | 'warn' | 'danger' | 'muted' {
  if (daysLeft === null || daysLeft === undefined) return 'muted';
  if (daysLeft <= STOCK_THRESHOLDS.critical) return 'danger';
  if (daysLeft <= STOCK_THRESHOLDS.low) return 'warn';
  if (daysLeft >= STOCK_THRESHOLDS.excess) return 'info';
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
  /*
   * Quyidagilarni server (GET /products/:id) allaqachon qaytaradi — ilgari
   * tipda e'lon qilinmagani uchun SKU jadvali holat, sur'at va "yetadi"ni
   * ko'rsatmasdi. Eski javobda bo'lmasligi mumkin, shuning uchun ixtiyoriy.
   */
  barcode?: string | null;
  /** Uzum SKU ID — qidiruvda ham shu raqam ishlaydi */
  uzumSkuId?: string | null;
  archived?: boolean;
  reserved?: number;
  inTransit?: number;
  avgDaily?: number;
  daysLeft?: number | null;
  status?: 'critical' | 'low' | 'ok' | 'excess' | 'dead';
  lastSaleAt?: string | null;
  /** Rejalashtiruvchi xulosasi (sotib olish, jo'natish, tugash sanasi); arxivdagi SKU'da yo'q */
  plan?: StockPlanSummary;
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
  /** Mahsulot qaysi do'konda — sarlavha chipi uchun (server `store` qaytaradi) */
  store?: { id: string; title: string } | null;
  skus?: ProductDetailSku[];
  /** Sotuv dinamikasi (60 kun) */
  series?: TimeSeriesPoint[];
  /** Qoldiqlar tarixi */
  stocks?: ProductStockPoint[];
  reviews?: ProductReviewsBlock;
  unit?: ProductUnitBreakdown;
  /** "Sifat" kartasi: qaytarish ulushi, eng ko'p sabab, salbiy sharhlar (eski javobda yo'q) */
  quality?: ProductQualityStats;
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

  const u = (r.unit ?? {}) as Record<string, number | null>;
  const ui = (r.unitInput ?? {}) as Record<string, number | null>;
  /*
   * Pulsiz ko'rinish shablonida (views.ts) server tannarx, soliq, foyda, marja
   * va nol foyda narxini ATAYLAB null yuboradi. `?? 0` ularni "0 so'm" / "0%"
   * qilib ko'rsatardi — yolg'on nol. null saqlanadi: f.money / f.pct uni "—"
   * qilib chizadi (2026-10-24). Kalit umuman yo'q bo'lsa — avvalgidek 0.
   */
  const hidden = (...vals: (number | null | undefined)[]): number => {
    const v = vals.find((x) => x !== undefined);
    return (v === null ? null : Number(v ?? 0)) as number;
  };
  const unit: ProductUnitBreakdown | undefined =
    Object.keys(u).length === 0
      ? undefined
      : {
          // Server `UnitCalcResult` (bir dona uchun) qaytaradi — nomlarni moslaymiz
          price: Number(u.price ?? ui.price ?? 0),
          purchasePrice: hidden(u.cogs, ui.purchasePrice),
          commission: Number(u.commission ?? 0),
          logistics: Number(u.logisticsTotal ?? ui.logistics ?? 0),
          storage: Number(u.storageTotal ?? 0),
          otherCost: hidden(ui.otherCost),
          tax: hidden(u.tax),
          netProfit: hidden(u.netProfitPerUnit, u.netProfit),
          margin: hidden(u.margin),
          roi: hidden(u.roi),
          breakEvenPrice: hidden(u.breakEvenPrice),
        };

  const store = r.store as { id?: unknown; title?: unknown } | null | undefined;

  return {
    product,
    store:
      store && typeof store.title === 'string' && store.title
        ? { id: String(store.id ?? ''), title: store.title }
        : null,
    skus: (r.skus ?? []) as ProductDetailSku[],
    series: (r.series ?? []) as TimeSeriesPoint[],
    stocks: (r.stocks ?? r.stockHistory ?? []) as ProductStockPoint[],
    reviews,
    unit,
    quality: (r.quality ?? undefined) as ProductQualityStats | undefined,
  };
}
