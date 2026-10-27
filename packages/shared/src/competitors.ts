/**
 * Raqobatchilar narxi — sotuvchi O'ZI kiritadi (2026-10-24).
 *
 * QOIDA (ATAYLAB: bepul va xavfsiz). SavdoIQ raqobatchi havolasini HECH QACHON
 * ochmaydi — na serverda, na brauzerda: yuklab olinmaydi, oldindan ko'rish,
 * rasm yoki favicon ham so'ralmaydi. Havola faqat saqlanadi va sotuvchiga
 * oddiy havola bo'lib chiqadi (rel="noopener noreferrer nofollow"). Uzum
 * sahifalarini o'qish uning qoidalariga zid, pullik proksi va bloklanishga olib
 * keladi va xato narx beradi — sotuvchi esa narxni bir qarashda o'zi ko'radi.
 *
 * Solishtirish qoidalari (server ham, sayt ham shu funksiyalardan):
 *  - yozuv: raqobatchi narxi BIZNING narxdan necha % farq qiladi — bog'langan
 *    variant narxi, bo'lmasa mahsulotning eng arzon faol varianti;
 *  - mahsulot: bizning narx raqobatchilar MEDIANASIDAN necha % farq qiladi —
 *    ±3% ichida "teng", −3% va undan past "arzonroq", +3% va undan yuqori
 *    "qimmatroq". Chegara ko'rsatilgan (1 xonali) foizning o'zidan olinadi —
 *    "−3,0%" yozilgan qator "teng" bo'lib chiqmasin;
 *  - raqobatchining eng past narxi nol foyda narxidan past — unga tenglashish
 *    zarar (ogohlantirish);
 *  - oxirgi tekshiruv 14 kundan eski — narx o'zgargan bo'lishi mumkin.
 */
import { round } from './calc.js';
import { daysBetween, toBusinessDate } from './format.js';
import { parseSkuQuery } from './search.js';
import type { Period } from './types.js';

export const COMPETITOR_LIMITS = {
  /** Bitta mahsulotga ko'pi bilan shuncha raqobatchi — ro'yxat o'qiladigan bo'lib qolsin */
  maxPerProduct: 20,
  /** Raqobatchi do'kon yoki tovar nomi */
  titleMax: 120,
  noteMax: 500,
  urlMax: 500,
  /** 1 mlrd so'm — ortiqcha yozilgan nollarni ushlaydi */
  priceMax: 1_000_000_000,
  /** Oxirgi tekshiruv shundan ko'p kun oldin bo'lsa — eskirgan */
  staleDays: 14,
  /** Medianadan ±shuncha foiz — "teng" */
  similarPct: 3,
} as const;

export type CompetitorLimits = { [K in keyof typeof COMPETITOR_LIMITS]: number };

// ─────────────────────────── Havola ───────────────────────────

/** Sxemasi bormi ("https:", "javascript:" ...) — bo'lmasa https:// qo'shiladi */
const HAS_SCHEME = /^[a-z][a-z0-9+.-]*:/i;

export type CompetitorUrlCheck =
  | { ok: true; url: string | null }
  | { ok: false; reason: 'protocol' | 'invalid' | 'tooLong' };

/**
 * Sotuvchi yozgan havolani tekshiradi va bir ko'rinishga keltiradi. Bo'sh —
 * havolasiz yozuv (null). Faqat http(s); "uzum.uz/product/…" kabi sxemasiz
 * nusxaga https:// qo'shiladi. Login/parol qo'shilgan (https://a:b@…) va
 * nuqtasiz xostli havola qabul qilinmaydi. Tekshiruv faqat matn ustida —
 * havola OCHILMAYDI.
 */
export function normalizeCompetitorUrl(raw: string | null | undefined): CompetitorUrlCheck {
  const value = (raw ?? '').trim();
  if (!value) return { ok: true, url: null };
  if (value.length > COMPETITOR_LIMITS.urlMax) return { ok: false, reason: 'tooLong' };
  const candidate = HAS_SCHEME.test(value) ? value : `https://${value}`;
  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    return { ok: false, reason: 'invalid' };
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return { ok: false, reason: 'protocol' };
  if (parsed.username || parsed.password || !parsed.hostname.includes('.')) return { ok: false, reason: 'invalid' };
  const url = parsed.href;
  if (url.length > COMPETITOR_LIMITS.urlMax) return { ok: false, reason: 'tooLong' };
  return { ok: true, url };
}

/**
 * uzum.uz (va uning subdomenlari) havolasidagi raqobatchi mahsulot va SKU
 * ID'si — faqat ko'rsatish uchun. Mahsulot ID'si qidiruvdagi umumiy
 * tahlilchidan (search.ts parseSkuQuery) olinadi, so'rov qismisiz: aks holda
 * ?skuId= ham "mahsulot ID" bo'lib qolardi. Boshqa sayt — ikkalasi null.
 */
export function parseCompetitorUrl(url: string | null | undefined): {
  uzumProductId: string | null;
  uzumSkuId: string | null;
} {
  const none = { uzumProductId: null, uzumSkuId: null };
  if (!url) return none;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return none;
  }
  const host = parsed.hostname.toLowerCase();
  if (host !== 'uzum.uz' && !host.endsWith('.uzum.uz')) return none;
  const query = parseSkuQuery(`${parsed.origin}${parsed.pathname}`);
  const sku = parsed.searchParams.get('skuId');
  return {
    uzumProductId: query?.url ? (query.ids[0] ?? null) : null,
    uzumSkuId: sku && /^\d+$/.test(sku) ? sku : null,
  };
}

// ─────────────────────────── Solishtirish ───────────────────────────

/** Mediana: juft sonda o'rtadagi ikkitaning o'rtachasi; bo'sh — null */
export function medianOf(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? (s[mid] as number) : ((s[mid - 1] as number) + (s[mid] as number)) / 2;
}

/** `a` `b` dan necha foiz farq qiladi: (a − b) ÷ b × 100, 1 xona; b musbat bo'lmasa null */
export function priceGapPct(a: number | null | undefined, b: number | null | undefined): number | null {
  if (a === null || a === undefined || b === null || b === undefined) return null;
  if (!Number.isFinite(a) || !(b > 0)) return null;
  return round(((a - b) / b) * 100, 1);
}

export type CompetitorPosition = 'cheaper' | 'similar' | 'pricier';

/** Bizning narx medianaga nisbatan (`gapPct` — priceGapPct(biz, mediana)) */
export function competitorPosition(gapPct: number | null | undefined): CompetitorPosition | null {
  if (gapPct === null || gapPct === undefined || !Number.isFinite(gapPct)) return null;
  if (gapPct <= -COMPETITOR_LIMITS.similarPct) return 'cheaper';
  if (gapPct >= COMPETITOR_LIMITS.similarPct) return 'pricier';
  return 'similar';
}

/** Tekshiruvdan beri o'tgan savdo kunlari (Toshkent): bugun — 0, kecha — 1 */
export function checkedDaysAgo(checkedAt: Date | string, now: Date = new Date()): number {
  return daysBetween(toBusinessDate(new Date(checkedAt)), toBusinessDate(now));
}

/** Oxirgi tekshiruv 14 kundan eski */
export const isStaleCheck = (daysAgo: number): boolean => daysAgo > COMPETITOR_LIMITS.staleDays;

// ─────────────────────────── API javoblari ───────────────────────────

/** Raqobatchi narxi yozuvi */
export interface CompetitorPriceDto {
  id: string;
  productId: string;
  /** Bog'langan variant; null — butun mahsulot */
  skuId: string | null;
  /** Variant ko'rinishi uchun; bog'lanmagan yoki variant o'chgan — null */
  sku: { id: string; sku: string; title: string } | null;
  url: string | null;
  /** uzum.uz havolasidagi raqobatchi mahsulot / SKU ID'si — faqat ko'rsatish uchun */
  uzumProductId: string | null;
  uzumSkuId: string | null;
  title: string;
  price: number | null;
  /** Oldingi kiritilgan narx (narx o'zgartirilganda saqlanadi) */
  prevPrice: number | null;
  /** Oldingi narxga nisbatan: 'up' — oshgan, 'down' — tushgan; oldingi narx yo'q yoki teng — null */
  change: 'up' | 'down' | null;
  /** Solishtirilgan bizning narx: bog'langan faol variant narxi, bo'lmasa eng arzon faol variant */
  ourPrice: number | null;
  /** (raqobatchi − biz) ÷ biz × 100, 1 xona: manfiy — raqobatchi arzonroq */
  diffPct: number | null;
  checkedAt: string;
  /** Tekshiruvdan beri savdo kunlari */
  daysAgo: number;
  stale: boolean;
  note: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Bizning mos yozuvlar. Nol foyda narxi va marja — mahsulot sahifasidagi
 * unit-iqtisodning O'ZI (GET /products/:id `unit.breakEvenPrice` va
 * `unit.margin`, o'sha davr bilan): apps/api services/product-unit.ts.
 * Pul maydonlari cheklangan ko'rinishli a'zoga null bo'lib kelishi mumkin.
 */
export interface CompetitorReference {
  /** Faol variantlarning eng arzon va eng qimmat joriy narxi; narx yo'q — null */
  minPrice: number | null;
  maxPrice: number | null;
  /** Zararsizlik (nol foyda) narxi, 1 dona */
  breakEvenPrice: number | null;
  /** Marja, % — `price` narxida */
  margin: number | null;
  /** Marja hisoblangan narx: davrda o'rtacha sotilgan narx, sotuv bo'lmasa joriy narx */
  price: number | null;
  /** Sotuvdagi yoki davrda sotilgan variantlardan birining tannarxi yo'q — nol foyda narxi to'liq emas */
  costMissing: boolean;
}

/** Bitta mahsulot raqobatchilari jamlanmasi */
export interface CompetitorStats {
  count: number;
  minPrice: number | null;
  medianPrice: number | null;
  maxPrice: number | null;
  /** Eng yangi tekshiruv */
  lastCheckedAt: string;
  daysSinceCheck: number;
  /** Eng yangi tekshiruv ham 14 kundan eski */
  stale: boolean;
  /** 14 kundan eski yozuvlar soni */
  staleCount: number;
  /** Solishtirilgan bizning narx: hamma yozuv bitta faol variantga bog'langan bo'lsa — o'sha narx, aks holda eng arzon faol variant */
  comparePrice: number | null;
  /** (biz − mediana) ÷ mediana × 100, 1 xona */
  gapPct: number | null;
  position: CompetitorPosition | null;
  /**
   * Raqobatchining eng past narxi nol foyda narxidan past. Pulsiz ko'rinish
   * shablonida (nol foyda narxi yashirin) — null: belgi orqali ham taxmin qilinmasin.
   */
  belowBreakEven: boolean | null;
}

/** GET /competitors?productId= */
export interface CompetitorListResponse {
  productId: string;
  /** Nol foyda narxi va marja hisoblangan davr */
  period: Period;
  our: CompetitorReference;
  /** Narx bo'yicha o'sish tartibida */
  items: CompetitorPriceDto[];
  /** Yozuv yo'q — null */
  stats: CompetitorStats | null;
  /** Joriy a'zo qo'sha / tahrirlay oladimi (egasi va menejer) */
  canEdit: boolean;
  limits: CompetitorLimits;
}

export type PriceMapSort = 'gap' | 'stale' | 'name';

/** Xarita qatoridagi bitta raqobatchi */
export interface PriceMapEntry {
  id: string;
  title: string;
  url: string | null;
  price: number | null;
  prevPrice: number | null;
  change: 'up' | 'down' | null;
  /** Solishtirilgan bizning narx va farq — CompetitorPriceDto bilan bir xil qoida */
  ourPrice: number | null;
  diffPct: number | null;
  checkedAt: string;
  daysAgo: number;
  stale: boolean;
  /** Bizning nol foyda narxidan past; pulsiz ko'rinishda — null */
  belowBreakEven: boolean | null;
}

export interface PriceMapRow {
  productId: string;
  title: string;
  category: string | null;
  imageUrl: string | null;
  storeId: string;
  storeTitle: string;
  uzumProductId: string | null;
  our: CompetitorReference;
  stats: CompetitorStats;
  /** Narx bo'yicha o'sish tartibida */
  entries: PriceMapEntry[];
}

export interface PriceMapSummary {
  products: number;
  cheaper: number;
  similar: number;
  pricier: number;
  /** Bizning narx yo'q — solishtirilmadi */
  unknown: number;
  /** Pulsiz ko'rinishda — null */
  belowBreakEven: number | null;
  stale: number;
}

/** GET /competitors/price-map */
export interface PriceMapResponse {
  period: Period;
  sort: PriceMapSort;
  order: 'asc' | 'desc';
  /** Qidiruv va kategoriya filtridan keyingi qatorlar bo'yicha */
  summary: PriceMapSummary;
  /** Filtr uchun: raqobatchi narxi kiritilgan mahsulotlar kategoriyalari (do'kon filtri bo'yicha) */
  categories: string[];
  rows: PriceMapRow[];
  limits: CompetitorLimits;
}
