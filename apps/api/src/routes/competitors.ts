/**
 * Raqobatchilar narxi — /api/v1/competitors
 *
 *  GET    /?productId=  → CompetitorListResponse: mahsulot raqobatchilari, bizning
 *                         joriy narx, nol foyda narxi va marja (?from&to — mahsulot
 *                         sahifasidagi davr bilan bir xil)
 *  GET    /price-map    → PriceMapResponse: raqobatchi narxi kiritilgan har bir mahsulot
 *                         (?storeId, ?search, ?category, ?sort=gap|stale|name, ?order)
 *  POST   /             → CompetitorPriceDto (egasi va menejer)
 *  PATCH  /:id          → CompetitorPriceDto (egasi va menejer): narx o'zgarsa eski
 *                         narx `prevPrice` ga o'tadi, `checkedAt` — berilmasa hozir
 *  DELETE /:id          → { ok, id } (egasi va menejer)
 *
 * NARXNI SOTUVCHI O'ZI KIRITADI (2026-10-24, ATAYLAB: bepul va xavfsiz). Biz
 * raqobatchi havolasini HECH QACHON ochmaymiz — serverda ham, saytda ham
 * (yuklash, oldindan ko'rish, rasm — hech biri yo'q). Havola faqat saqlanadi
 * va sotuvchiga oddiy havola bo'lib chiqadi. uzum.uz havolasidan faqat
 * mahsulot ID'si MATNDAN ajratiladi (shared competitors.ts → search.ts).
 *
 * NOL FOYDA NARXI VA MARJA — mahsulot sahifasining O'ZI (services/product-unit.ts),
 * o'sha davr, o'sha do'kon so'rovi bilan: xaritadagi "raqobatchi nol foyda
 * narxidan past" va sahifadagi "Zararsizlik narxi" bir xil raqamdan.
 *
 * TARIF — 'products_assortment' (Mahsulotlar oilasi: narx mahsulot kartochkasi
 * bilan birga yuradi). Yozish — egasi va menejer, kuzatuvchi faqat ko'radi.
 * Hammasi kompaniyaning o'z do'konlari va mahsulotlari bilan cheklangan:
 * boshqa kompaniyaning yozuvi yoki mahsuloti — 404 (borligi ham aytilmaydi).
 */
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '@savdoiq/db';
import type { Prisma } from '@savdoiq/db';
import {
  COMPETITOR_LIMITS,
  asMemberView,
  businessDayStart,
  calcUnitEconomics,
  checkedDaysAgo,
  competitorPosition,
  isStaleCheck,
  matchesProductQuery,
  medianOf,
  normalizeCompetitorUrl,
  parseCompetitorUrl,
  parseISODate,
  parseSkuQuery,
  priceGapPct,
  round,
  toBusinessDate,
  toISODate,
  viewSeesMoney,
  type CompetitorListResponse,
  type CompetitorPriceDto,
  type CompetitorReference,
  type CompetitorStats,
  type PriceMapEntry,
  type PriceMapResponse,
  type PriceMapRow,
  type PriceMapSort,
  type PriceMapSummary,
  type SkuQuery,
} from '@savdoiq/shared';
import { AppError, ah } from '../lib/errors.js';
import { companyCtx, requireAuth, requireCompany, requireFeature, requireRole } from '../lib/auth.js';
import { resolveRange } from '../lib/period.js';
import { aggregateSales, getStoreIds, getStoreTitles } from '../services/common.js';
import {
  catalogMinPrice,
  productUnitInput,
  storageEstimateBySku,
  type StorageEstimates,
  type UnitSales,
} from '../services/product-unit.js';

const router = Router();
router.use(requireAuth, requireCompany, requireFeature('products_assortment'));

/** Yozish — egasi va menejer; kuzatuvchi (viewer) faqat ko'radi */
const canWrite = requireRole('owner', 'manager');
const isWriter = (role: string | undefined): boolean => role === 'owner' || role === 'manager';

/**
 * Pulsiz ko'rinish shabloni (Omborchi, Marketolog): nol foyda narxi va marja
 * `requireCompany` dagi umumiy qadamda null bo'ladi (lib/views.ts). Ulardan
 * kelib chiqadigan "raqobatchi zararsizlikdan past" belgisi ham shu yerda
 * yashiriladi — aks holda nol foyda narxi belgi orqali taxmin qilinardi.
 * Egasiga shablon qo'llanmaydi (lib/views.ts effectiveView bilan bir xil).
 */
function seesMoney(m: { role: string; view?: string | null } | undefined): boolean {
  return !m || m.role === 'owner' || viewSeesMoney(asMemberView(m.view));
}

// ─────────────────────────── Ma'lumot ───────────────────────────

/**
 * Mahsulot va variantlari. SKU maydonlari va TARTIBI products.ts loadProducts
 * bilan bir xil: unit-iqtisod yig'indilari aynan bir tartibda qo'shilsin.
 */
const PRODUCT_SELECT = {
  id: true,
  storeId: true,
  uzumProductId: true,
  title: true,
  category: true,
  imageUrl: true,
  status: true,
  hidden: true,
  skus: {
    select: {
      id: true,
      sku: true,
      title: true,
      imageUrl: true,
      price: true,
      purchasePrice: true,
      extraCost: true,
      storagePerItem: true,
      barcode: true,
      uzumSkuId: true,
      archived: true,
    },
    orderBy: { sku: 'asc' },
  },
} as const;

type CompetitorProduct = Prisma.ProductGetPayload<{ select: typeof PRODUCT_SELECT }>;

const ROW_SELECT = {
  id: true,
  productId: true,
  skuId: true,
  url: true,
  title: true,
  price: true,
  prevPrice: true,
  checkedAt: true,
  note: true,
  createdAt: true,
  updatedAt: true,
} as const;

type CompetitorRow = Prisma.CompetitorPriceGetPayload<{ select: typeof ROW_SELECT }>;

/** Kompaniyaning o'z do'konidagi mahsulot; boshqasi — 404 */
async function ownProduct(companyId: string, productId: string): Promise<CompetitorProduct> {
  const storeIds = await getStoreIds(companyId);
  const product = storeIds.length
    ? await prisma.product.findFirst({ where: { id: productId, storeId: { in: storeIds } }, select: PRODUCT_SELECT })
    : null;
  if (!product) throw AppError.notFound('Mahsulot topilmadi');
  return product;
}

/** products.ts isArchivedProduct bilan bir xil: hamma varianti arxivda yoki Uzum o'zi arxiv degan */
const isArchived = (p: CompetitorProduct): boolean =>
  (p.skus.length > 0 && p.skus.every((s) => s.archived)) || /arch/i.test(p.status);

/** GET /products qidiruvi bilan bir xil (products.ts productMatches → shared search.ts) */
function productMatches(p: CompetitorProduct, query: SkuQuery): boolean {
  return matchesProductQuery(
    query,
    { id: p.id, title: p.title, category: p.category, uzumProductId: p.uzumProductId },
    p.skus.map((s) => ({ id: s.id, sku: s.sku, title: s.title, barcode: s.barcode, uzumSkuId: s.uzumSkuId })),
  );
}

/** Variant shu mahsulotniki bo'lishi shart */
function checkSku(p: CompetitorProduct, skuId: string | null): string | null {
  if (skuId === null) return null;
  if (!p.skus.some((s) => s.id === skuId)) throw AppError.badRequest('Variant bu mahsulotga tegishli emas');
  return skuId;
}

// ─────────────────────────── Solishtirish ───────────────────────────

/** Sotuvdagi (arxivda emas) va narxi bor variantlar — "bizning joriy narx" shulardan */
const activeSkus = (p: CompetitorProduct) => p.skus.filter((s) => !s.archived && s.price > 0);

function minActivePrice(p: CompetitorProduct): number | null {
  const prices = activeSkus(p).map((s) => s.price);
  return prices.length ? round(Math.min(...prices)) : null;
}

/**
 * Bizning mos yozuvlar. Nol foyda narxi va marja — mahsulot sahifasi hisobi
 * (`productUnitInput` → `calcUnitEconomics`), qiymatlar o'zgartirilmaydi:
 * sahifa nima ko'rsatsa, karta va xarita ham shuni.
 */
async function referenceFor(
  p: CompetitorProduct,
  sales: UnitSales,
  taxRate: number,
  storage: () => Promise<StorageEstimates>,
): Promise<CompetitorReference> {
  const prices = activeSkus(p).map((s) => s.price);
  const input = await productUnitInput(p.skus, sales, {
    fallbackPrice: catalogMinPrice(p.skus),
    taxRate,
    storageEstimates: storage,
  });
  const unit = calcUnitEconomics(input);
  return {
    minPrice: prices.length ? round(Math.min(...prices)) : null,
    maxPrice: prices.length ? round(Math.max(...prices)) : null,
    breakEvenPrice: unit.breakEvenPrice,
    margin: unit.margin,
    price: input.price,
    // products.ts cardFlags 'noCost' qoidasi: sotuvdagi yoki davrda sotilgan variant
    costMissing: p.skus.some((s) => (!s.archived || (sales.get(s.id)?.units ?? 0) > 0) && s.purchasePrice <= 0),
  };
}

/** Bog'langan faol variant narxi, bo'lmasa eng arzon faol variant */
function ourPriceFor(row: CompetitorRow, p: CompetitorProduct): number | null {
  const sku = row.skuId ? activeSkus(p).find((s) => s.id === row.skuId) : undefined;
  return sku ? round(sku.price) : minActivePrice(p);
}

/**
 * Mediana bilan solishtiriladigan bizning narx. Hamma yozuv bitta faol
 * variantga bog'langan bo'lsa — o'sha variant narxi: 2 kishilik choyshab
 * raqobatchisi 1,5 kishilik variantimizning narxi bilan solishtirilmasin.
 * Aks holda — eng arzon faol variant (Uzum vitrinasi ham "…dan" deb shuni yozadi).
 */
function comparePriceFor(rows: CompetitorRow[], p: CompetitorProduct): number | null {
  const linked = new Set(rows.map((r) => r.skuId));
  if (linked.size === 1) {
    const only = [...linked][0];
    const sku = only ? activeSkus(p).find((s) => s.id === only) : undefined;
    if (sku) return round(sku.price);
  }
  return minActivePrice(p);
}

const belowBreakEven = (price: number | null, breakEven: number | null): boolean =>
  price !== null && breakEven !== null && breakEven > 0 && price < breakEven;

function statsFor(rows: CompetitorRow[], p: CompetitorProduct, our: CompetitorReference, now: Date): CompetitorStats {
  const prices = rows.map((r) => r.price);
  const last = rows.reduce((max, r) => (r.checkedAt.getTime() > max.getTime() ? r.checkedAt : max), rows[0]!.checkedAt);
  const days = checkedDaysAgo(last, now);
  const median = medianOf(prices);
  // Ko'rsatiladigan (butun so'm) mediana bilan solishtiriladi — ekrandagi foiz shu sondan
  const medianPrice = median === null ? null : round(median);
  const minPrice = prices.length ? Math.min(...prices) : null;
  const comparePrice = comparePriceFor(rows, p);
  const gapPct = priceGapPct(comparePrice, medianPrice);
  return {
    count: rows.length,
    minPrice,
    medianPrice,
    maxPrice: prices.length ? Math.max(...prices) : null,
    lastCheckedAt: last.toISOString(),
    daysSinceCheck: days,
    stale: isStaleCheck(days),
    staleCount: rows.filter((r) => isStaleCheck(checkedDaysAgo(r.checkedAt, now))).length,
    comparePrice,
    gapPct,
    position: competitorPosition(gapPct),
    belowBreakEven: belowBreakEven(minPrice, our.breakEvenPrice),
  };
}

/** Oldingi narxga nisbatan yo'nalish; oldingi narx yo'q yoki teng — null */
const changeOf = (row: CompetitorRow): 'up' | 'down' | null =>
  row.prevPrice === null || row.prevPrice === row.price ? null : row.price > row.prevPrice ? 'up' : 'down';

function toDto(row: CompetitorRow, p: CompetitorProduct, now: Date): CompetitorPriceDto {
  const sku = row.skuId ? p.skus.find((s) => s.id === row.skuId) : undefined;
  const ourPrice = ourPriceFor(row, p);
  const daysAgo = checkedDaysAgo(row.checkedAt, now);
  const ids = parseCompetitorUrl(row.url);
  return {
    id: row.id,
    productId: row.productId,
    skuId: row.skuId,
    sku: sku ? { id: sku.id, sku: sku.sku, title: sku.title || p.title } : null,
    url: row.url,
    uzumProductId: ids.uzumProductId,
    uzumSkuId: ids.uzumSkuId,
    title: row.title,
    price: row.price,
    prevPrice: row.prevPrice,
    change: changeOf(row),
    ourPrice,
    diffPct: priceGapPct(row.price, ourPrice),
    checkedAt: row.checkedAt.toISOString(),
    daysAgo,
    stale: isStaleCheck(daysAgo),
    note: row.note,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** Eng arzon raqobatchi tepada; teng narxda — nom bo'yicha */
const byPrice = (rows: CompetitorRow[]): CompetitorRow[] =>
  [...rows].sort((a, b) => a.price - b.price || a.title.localeCompare(b.title) || a.id.localeCompare(b.id));

// ─────────────────────────── Tekshiruv (zod) ───────────────────────────

function fail(ctx: z.RefinementCtx, message: string): never {
  ctx.addIssue({ code: z.ZodIssueCode.custom, message });
  return z.NEVER;
}

const URL_ERROR = {
  protocol: 'Havola http:// yoki https:// bilan boshlansin',
  invalid: 'Havola noto‘g‘ri',
  tooLong: `Havola ${COMPETITOR_LIMITS.urlMax} belgidan oshmasin`,
} as const;

/** Havola: bo'sh yoki null — havolasiz; faqat http(s), 500 belgigacha. Faqat matn tekshiriladi — havola OCHILMAYDI */
const urlField = z
  .string({ invalid_type_error: 'Havola matn bo‘lishi kerak' })
  .nullable()
  .transform((value, ctx) => {
    const r = normalizeCompetitorUrl(value);
    return r.ok ? r.url : fail(ctx, URL_ERROR[r.reason]);
  });

const titleField = z
  .string({ required_error: 'Raqobatchi nomini yozing', invalid_type_error: 'Nom matn bo‘lishi kerak' })
  .trim()
  .min(1, 'Raqobatchi nomini yozing')
  .max(COMPETITOR_LIMITS.titleMax, `Nom ${COMPETITOR_LIMITS.titleMax} belgidan oshmasin`)
  // Nusxalangan nomdagi qator uzilishi va qo'sh bo'shliqlar bitta bo'shliq bo'ladi
  .transform((v) => v.replace(/\s+/g, ' '));

const priceField = z
  .number({ required_error: 'Narxni kiriting', invalid_type_error: 'Narx son bo‘lishi kerak' })
  .finite('Narx son bo‘lishi kerak')
  .gt(0, 'Narx 0 dan katta bo‘lsin')
  .max(COMPETITOR_LIMITS.priceMax, 'Narx 1 mlrd so‘mdan oshmasin')
  // So'm — butun son, ilovadagi boshqa pul qiymatlari kabi (shared round)
  .transform((v) => round(v))
  .refine((v) => v > 0, 'Narx 0 dan katta bo‘lsin');

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
/** Telefon soati bir necha daqiqa oldinda bo'lsa ham "kelajak" deb rad etilmasin */
const CLOCK_SKEW_MS = 5 * 60_000;
/** Undan oldingi sana — xato yozilgan yil ("0202-10-24") */
const EARLIEST_CHECK_MS = Date.UTC(2020, 0, 1);

/**
 * Narx qachon tekshirilgan: "YYYY-MM-DD" — Toshkent savdo kuni (bugun — hozirgi
 * vaqt, o'tgan kun — o'sha kun boshi; "N kun oldin" savdo kunidan sanaladi),
 * yoki to'liq ISO vaqt. Kelajakdagi sana rad etiladi.
 */
const checkedAtField = z
  .string({ invalid_type_error: 'Sana matn bo‘lishi kerak' })
  .trim()
  .max(40, 'Sana noto‘g‘ri')
  .transform((value, ctx): Date => {
    const now = Date.now();
    const today = toBusinessDate(new Date(now));
    let at: Date;
    if (DATE_ONLY.test(value)) {
      const day = parseISODate(value);
      // 2026-02-30 kabi yo'q sana
      if (!Number.isFinite(day.getTime()) || toISODate(day) !== value) return fail(ctx, 'Sana noto‘g‘ri');
      if (value > today) return fail(ctx, 'Tekshirilgan sana kelajakda bo‘lishi mumkin emas');
      at = value === today ? new Date(now) : businessDayStart(value);
    } else {
      const ms = Date.parse(value);
      if (!Number.isFinite(ms)) return fail(ctx, 'Sana noto‘g‘ri');
      if (ms > now + CLOCK_SKEW_MS) return fail(ctx, 'Tekshirilgan sana kelajakda bo‘lishi mumkin emas');
      at = new Date(Math.min(ms, now));
    }
    if (at.getTime() < EARLIEST_CHECK_MS) return fail(ctx, 'Sana noto‘g‘ri');
    return at;
  });

const noteField = z
  .string({ invalid_type_error: 'Izoh matn bo‘lishi kerak' })
  .trim()
  .max(COMPETITOR_LIMITS.noteMax, `Izoh ${COMPETITOR_LIMITS.noteMax} belgidan oshmasin`)
  .nullable()
  .transform((v) => (v ? v : null));

const skuIdField = z
  .string({ invalid_type_error: 'skuId matn bo‘lishi kerak' })
  .trim()
  .max(64, 'skuId noto‘g‘ri')
  .nullable()
  .transform((v) => (v ? v : null));

const createSchema = z.object({
  productId: z
    .string({ required_error: 'productId kerak', invalid_type_error: 'productId matn bo‘lishi kerak' })
    .trim()
    .min(1, 'productId kerak')
    .max(64, 'productId noto‘g‘ri'),
  skuId: skuIdField.optional(),
  url: urlField.optional(),
  title: titleField,
  price: priceField,
  checkedAt: checkedAtField.optional(),
  note: noteField.optional(),
});

const updateSchema = z
  .object({
    skuId: skuIdField.optional(),
    url: urlField.optional(),
    title: titleField.optional(),
    price: priceField.optional(),
    checkedAt: checkedAtField.optional(),
    note: noteField.optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), {
    message: 'O‘zgartirish uchun kamida bitta maydon yuboring',
  });

// ─────────────────────────── GET /price-map ───────────────────────────

const MAP_SORTS: readonly PriceMapSort[] = ['gap', 'stale', 'name'];

/**
 * Saralash: 'gap' — biz medianadan qanchalik qimmat (standart: eng qimmati
 * tepada), 'stale' — oxirgi tekshiruvdan beri kunlar (eng eskisi tepada),
 * 'name' — nom. Solishtirib bo'lmagan qator (bizning narx yo'q) doim oxirida.
 */
function sortRows(rows: PriceMapRow[], sort: PriceMapSort, order: 'asc' | 'desc'): void {
  const dir = order === 'asc' ? 1 : -1;
  const byName = (a: PriceMapRow, b: PriceMapRow) => a.title.localeCompare(b.title) || a.productId.localeCompare(b.productId);
  rows.sort((a, b) => {
    if (sort === 'name') return byName(a, b) * dir;
    const va = sort === 'gap' ? a.stats.gapPct : a.stats.daysSinceCheck;
    const vb = sort === 'gap' ? b.stats.gapPct : b.stats.daysSinceCheck;
    if (va === null || vb === null) return va === vb ? byName(a, b) : va === null ? 1 : -1;
    return (va - vb) * dir || byName(a, b);
  });
}

router.get(
  '/price-map',
  ah(async (req, res) => {
    const { company, plan, membership } = companyCtx(req);
    const range = resolveRange(req, plan);
    const q = req.query as Record<string, string | undefined>;
    const sort: PriceMapSort = MAP_SORTS.includes(q.sort as PriceMapSort) ? (q.sort as PriceMapSort) : 'gap';
    const order: 'asc' | 'desc' =
      q.order === 'asc' || q.order === 'desc' ? q.order : sort === 'name' ? 'asc' : 'desc';
    // Kategoriya — ANIQ moslik, GET /products?category= kabi
    const category = typeof q.category === 'string' ? q.category.trim() : '';
    const query = parseSkuQuery(range.search);
    const now = new Date();

    const storeIds = await getStoreIds(company.id, range.storeId);
    const rows = storeIds.length
      ? await prisma.competitorPrice.findMany({
          where: { companyId: company.id, product: { storeId: { in: storeIds } } },
          select: ROW_SELECT,
        })
      : [];
    const byProduct = new Map<string, CompetitorRow[]>();
    for (const r of rows) {
      const list = byProduct.get(r.productId) ?? [];
      list.push(r);
      byProduct.set(r.productId, list);
    }

    const products = byProduct.size
      ? await prisma.product.findMany({
          where: { id: { in: [...byProduct.keys()] }, storeId: { in: storeIds } },
          select: PRODUCT_SELECT,
        })
      : [];
    // Sotuvchi o'chirgan (yashirilgan arxiv) tovar xaritada ham ko'rinmaydi — boshqa ro'yxatlardagi kabi
    const visible = products.filter((p) => !(p.hidden && isArchived(p)));
    const categories = [...new Set(visible.map((p) => p.category).filter((c): c is string => Boolean(c)))].sort((a, b) =>
      a.localeCompare(b),
    );
    const found = visible.filter((p) => (!category || p.category === category) && (!query || productMatches(p, query)));

    /*
     * Mahsulot sahifasidagi bilan AYNAN bir xil so'rovlar: sotuv — har do'kon
     * alohida, tanlangan davr bo'yicha; saqlash taxmini — faqat kerak bo'lsa,
     * do'kon bo'yicha bir marta. Shunda xaritadagi nol foyda narxi sahifadagi
     * bilan tiyinigacha bir xil chiqadi.
     */
    const storesNeeded = [...new Set(found.map((p) => p.storeId))];
    const salesByStore = new Map(
      await Promise.all(
        storesNeeded.map(async (id) => [id, await aggregateSales([id], range.from, range.toExclusive)] as const),
      ),
    );
    const storageByStore = new Map<string, Promise<StorageEstimates>>();
    const storageOf = (storeId: string) => (): Promise<StorageEstimates> => {
      let pending = storageByStore.get(storeId);
      if (!pending) {
        pending = storageEstimateBySku([storeId]);
        storageByStore.set(storeId, pending);
      }
      return pending;
    };
    const titles = await getStoreTitles(company.id);

    const out: PriceMapRow[] = await Promise.all(
      found.map(async (p) => {
        const list = byPrice(byProduct.get(p.id) ?? []);
        const our = await referenceFor(p, salesByStore.get(p.storeId) ?? new Map(), company.taxRate, storageOf(p.storeId));
        const entries: PriceMapEntry[] = list.map((r) => {
          const daysAgo = checkedDaysAgo(r.checkedAt, now);
          const ourPrice = ourPriceFor(r, p);
          return {
            id: r.id,
            title: r.title,
            url: r.url,
            price: r.price,
            prevPrice: r.prevPrice,
            change: changeOf(r),
            ourPrice,
            diffPct: priceGapPct(r.price, ourPrice),
            checkedAt: r.checkedAt.toISOString(),
            daysAgo,
            stale: isStaleCheck(daysAgo),
            belowBreakEven: belowBreakEven(r.price, our.breakEvenPrice),
          };
        });
        return {
          productId: p.id,
          title: p.title,
          category: p.category,
          imageUrl: p.imageUrl ?? p.skus.find((s) => s.imageUrl)?.imageUrl ?? null,
          storeId: p.storeId,
          storeTitle: titles.get(p.storeId) ?? 'Do‘kon',
          uzumProductId: p.uzumProductId,
          our,
          stats: statsFor(list, p, our, now),
          entries,
        } satisfies PriceMapRow;
      }),
    );
    sortRows(out, sort, order);

    const summary: PriceMapSummary = {
      products: out.length,
      cheaper: 0,
      similar: 0,
      pricier: 0,
      unknown: 0,
      belowBreakEven: 0,
      stale: 0,
    };
    let below = 0;
    for (const r of out) {
      if (r.stats.position) summary[r.stats.position] += 1;
      else summary.unknown += 1;
      if (r.stats.belowBreakEven) below += 1;
      if (r.stats.stale) summary.stale += 1;
    }
    summary.belowBreakEven = below;
    if (!seesMoney(membership)) {
      summary.belowBreakEven = null;
      for (const r of out) {
        r.stats.belowBreakEven = null;
        for (const e of r.entries) e.belowBreakEven = null;
      }
    }

    const payload: PriceMapResponse = {
      period: range.period,
      sort,
      order,
      summary,
      categories,
      rows: out,
      limits: { ...COMPETITOR_LIMITS },
    };
    res.json(payload);
  }),
);

// ─────────────────────────── GET /?productId= ───────────────────────────

router.get(
  '/',
  ah(async (req, res) => {
    const { company, plan, membership } = companyCtx(req);
    const raw = req.query.productId;
    const productId = typeof raw === 'string' ? raw.trim() : '';
    if (!productId) throw AppError.badRequest('productId kerak');
    const range = resolveRange(req, plan);
    const product = await ownProduct(company.id, productId);

    const [rows, sales] = await Promise.all([
      prisma.competitorPrice.findMany({ where: { companyId: company.id, productId: product.id }, select: ROW_SELECT }),
      // GET /products/:id bilan bir xil: faqat mahsulot do'koni, tanlangan davr
      aggregateSales([product.storeId], range.from, range.toExclusive),
    ]);
    const our = await referenceFor(product, sales, company.taxRate, () => storageEstimateBySku([product.storeId]));
    const now = new Date();
    const sorted = byPrice(rows);
    const stats = sorted.length ? statsFor(sorted, product, our, now) : null;
    if (stats && !seesMoney(membership)) stats.belowBreakEven = null;

    const payload: CompetitorListResponse = {
      productId: product.id,
      period: range.period,
      our,
      items: sorted.map((r) => toDto(r, product, now)),
      stats,
      canEdit: isWriter(membership?.role),
      limits: { ...COMPETITOR_LIMITS },
    };
    res.json(payload);
  }),
);

// ─────────────────────────── Yozish ───────────────────────────

router.post(
  '/',
  canWrite,
  ah(async (req, res) => {
    const { company, user } = companyCtx(req);
    const input = createSchema.parse(req.body ?? {});
    const product = await ownProduct(company.id, input.productId);
    const skuId = checkSku(product, input.skuId ?? null);

    const count = await prisma.competitorPrice.count({ where: { companyId: company.id, productId: product.id } });
    if (count >= COMPETITOR_LIMITS.maxPerProduct) {
      throw AppError.badRequest(
        `Bitta mahsulotga ko‘pi bilan ${COMPETITOR_LIMITS.maxPerProduct} ta raqobatchi narxi — keraksizini o‘chiring`,
        { limit: COMPETITOR_LIMITS.maxPerProduct },
      );
    }

    const row = await prisma.competitorPrice.create({
      data: {
        companyId: company.id,
        productId: product.id,
        skuId,
        url: input.url ?? null,
        title: input.title,
        price: input.price,
        checkedAt: input.checkedAt ?? new Date(),
        note: input.note ?? null,
        createdById: user.id,
      },
      select: ROW_SELECT,
    });
    res.status(201).json(toDto(row, product, new Date()) satisfies CompetitorPriceDto);
  }),
);

router.patch(
  '/:id',
  canWrite,
  ah(async (req, res) => {
    const { company } = companyCtx(req);
    const input = updateSchema.parse(req.body ?? {});
    const row = await prisma.competitorPrice.findFirst({
      where: { id: String(req.params.id), companyId: company.id },
      select: ROW_SELECT,
    });
    if (!row) throw AppError.notFound('Raqobatchi narxi topilmadi');
    const product = await ownProduct(company.id, row.productId);

    const data: Prisma.CompetitorPriceUncheckedUpdateManyInput = {};
    if (input.title !== undefined) data.title = input.title;
    if (input.url !== undefined) data.url = input.url;
    if (input.note !== undefined) data.note = input.note;
    if (input.skuId !== undefined) data.skuId = checkSku(product, input.skuId);
    const priceChanged = input.price !== undefined && input.price !== row.price;
    if (priceChanged) {
      // Eski narx o'zgarish yo'nalishi uchun saqlanadi; yangi narx — hozir tekshirilgan (sana berilmasa)
      data.price = input.price;
      data.prevPrice = row.price;
      data.checkedAt = input.checkedAt ?? new Date();
    } else if (input.checkedAt !== undefined) {
      // Narx o'zgarmagan, sotuvchi qayta tekshirdi — faqat sana yangilanadi
      data.checkedAt = input.checkedAt;
    }

    if (Object.keys(data).length > 0) {
      /*
       * Narx o'zgarsa — "taqqoslab yozish": o'qilgan narx hali o'sha bo'lsagina.
       * Ikki oynada bir vaqtda narx tahrirlansa, ikkinchisi oldingi narxni
       * noto'g'ri (o'qilgan, eskirgan) qiymat bilan yozib qo'ymasin.
       */
      const done = await prisma.competitorPrice.updateMany({
        where: { id: row.id, companyId: company.id, ...(priceChanged ? { price: row.price } : {}) },
        data,
      });
      if (done.count === 0) {
        throw AppError.conflict('Narx boshqa oynada o‘zgardi — sahifani yangilab, qayta urinib ko‘ring');
      }
    }
    const fresh = await prisma.competitorPrice.findFirst({ where: { id: row.id, companyId: company.id }, select: ROW_SELECT });
    if (!fresh) throw AppError.notFound('Raqobatchi narxi topilmadi');
    res.json(toDto(fresh, product, new Date()) satisfies CompetitorPriceDto);
  }),
);

router.delete(
  '/:id',
  canWrite,
  ah(async (req, res) => {
    const { company } = companyCtx(req);
    const done = await prisma.competitorPrice.deleteMany({ where: { id: String(req.params.id), companyId: company.id } });
    if (done.count === 0) throw AppError.notFound('Raqobatchi narxi topilmadi');
    res.json({ ok: true, id: String(req.params.id) });
  }),
);

export default router;
