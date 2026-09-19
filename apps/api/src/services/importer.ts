/**
 * Import qatlami — Uzum adapteridan kelgan normalizatsiyalangan ma'lumotni bazaga yozadi.
 *
 * Shartnoma va qoidalar:
 *  • Har bir funksiya **idempotent**: bir xil ma'lumot bilan qayta chaqirilsa dublikat yaratmaydi.
 *    Tabiiy unique kaliti bo'lmagan jadvallarda (ReturnRecord, LossRecord, StorageFee, Expense)
 *    barqaror `id` hosil qilinadi — `sha1(tabiiy kalit)`, shuning uchun qayta import mavjud
 *    yozuvni **yangilaydi**, yangisini qo'shmaydi.
 *  • Yozuvlar 200 tadan bo'lib (chunk) yoziladi — SQLite va PostgreSQL parametr chegarasi uchun xavfsiz.
 *  • Foydalanuvchi kiritgan qiymatlar import vaqtida **hech qachon** ustidan yozilmaydi:
 *    `Sku.purchasePrice`, `Sku.extraCost`, `StockSnapshot.own`, sharh javoblari.
 *  • Uzum bermagan qiymatlar `DEFAULTS` (packages/shared/src/constants.ts) bo'yicha taxmin qilinadi.
 *  • Har bir funksiya `{ created, updated }` qaytaradi. Ma'lumot bo'lmasa — `{ 0, 0 }` (xato emas).
 *
 * Buyurtma pozitsiyasi moliyasi (seed.ts va analytics/finance modullari bilan bir xil formula):
 *    revenue   = qty * sellPrice
 *    cogs      = qty * sku.purchasePrice
 *    payout    = revenue - commission - logistics
 *    netProfit = payout - cogs - otherCost - revenue * taxRate / 100
 */
import { createHash } from 'node:crypto';
import { prisma } from '@savdoiq/db';
import type { Prisma } from '@savdoiq/db';
import {
  DEFAULTS,
  round,
  toISODate,
  type DeliveryType,
  type ExpenseCategory,
  type OrderStatus,
} from '@savdoiq/shared';
import type {
  UzumExpense,
  UzumLoss,
  UzumOrder,
  UzumProduct,
  UzumReturn,
  UzumReview,
  UzumShop,
  UzumSku,
  UzumStock,
  UzumStorageFee,
} from '../uzum/types.js';

// ─────────────────────────── Umumiy tiplar va yordamchilar ───────────────────────────

/** Har bir import funksiyasining natijasi */
export interface ImportResult {
  created: number;
  updated: number;
}

/** Bir martada bazaga yoziladigan yozuvlar soni */
export const CHUNK_SIZE = 200;

const emptyResult = (): ImportResult => ({ created: 0, updated: 0 });

/** Ikkita natijani qo'shadi (bosqich yakunini hisoblash uchun) */
export function mergeResults(...parts: ImportResult[]): ImportResult {
  return parts.reduce<ImportResult>(
    (acc, p) => ({ created: acc.created + p.created, updated: acc.updated + p.updated }),
    emptyResult(),
  );
}

/** Massivni `size` ta elementli bo'laklarga ajratadi */
function chunked<T>(items: readonly T[], size = CHUNK_SIZE): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size) as T[]);
  return out;
}

/**
 * `createMany` ni bo'laklab bajaradi — bitta so'rovdagi parametrlar soni
 * SQLite/PostgreSQL chegarasidan oshib ketmasligi uchun.
 */
async function createManyChunked<T>(rows: T[], insert: (batch: T[]) => Promise<unknown>): Promise<number> {
  for (const batch of chunked(rows)) await insert(batch);
  return rows.length;
}

/**
 * Tabiiy kalitdan barqaror `id` hosil qiladi.
 * Unique indeksi yo'q jadvallarda idempotentlikni shu ta'minlaydi.
 */
function stableId(prefix: string, ...parts: (string | number | null | undefined)[]): string {
  const raw = parts.map((p) => String(p ?? '')).join('|');
  return `${prefix}_${createHash('sha1').update(raw).digest('hex').slice(0, 24)}`;
}

/** ISO sana/vaqtni Date'ga aylantiradi; noto'g'ri qiymatda `fallback` qaytadi */
function toDate(value: string | null | undefined, fallback: Date | null = null): Date | null {
  if (!value) return fallback;
  const iso = value.length <= 10 ? `${value}T00:00:00.000Z` : value;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? fallback : d;
}

/** Sanani UTC kun boshiga keltiradi (kunlik snapshot kaliti uchun) */
function dayStart(d: Date): Date {
  return new Date(`${toISODate(d)}T00:00:00.000Z`);
}

const int = (n: number | undefined | null, min = 0): number =>
  Math.max(min, Math.round(Number.isFinite(n ?? NaN) ? (n as number) : 0));

const num = (n: number | undefined | null): number => (Number.isFinite(n ?? NaN) ? (n as number) : 0);

const text = (v: string | null | undefined): string | null => {
  const t = v?.trim();
  return t ? t : null;
};

// ─────────────────────────── Katalog ma'lumotnomalari ───────────────────────────

/** Buyurtma/qoldiq importida kerak bo'ladigan qisqa SKU ma'lumoti */
export interface SkuRef {
  id: string;
  sku: string;
  productId: string;
  price: number;
  purchasePrice: number;
  extraCost: number;
}

/**
 * Do'kon SKU'lari — Uzum SKU id'i, SKU kodi va ichki id bo'yicha izlash uchun.
 * Bitta `Map` uchta kalit bilan to'ldiriladi (ustuvorlik: Uzum id → kod → ichki id).
 */
export async function getSkuRefs(storeId: string): Promise<Map<string, SkuRef>> {
  const rows = await prisma.sku.findMany({
    where: { storeId },
    select: {
      id: true,
      sku: true,
      uzumSkuId: true,
      productId: true,
      price: true,
      purchasePrice: true,
      extraCost: true,
    },
  });

  const map = new Map<string, SkuRef>();
  for (const r of rows) {
    const ref: SkuRef = {
      id: r.id,
      sku: r.sku,
      productId: r.productId,
      price: r.price,
      purchasePrice: r.purchasePrice,
      extraCost: r.extraCost,
    };
    map.set(r.id, ref);
    map.set(r.sku, ref);
    if (r.uzumSkuId) map.set(r.uzumSkuId, ref);
  }
  return map;
}

/** Do'kon mahsulotlari: Uzum mahsulot id'i (va ichki id) → ichki id */
export async function getProductRefs(storeId: string): Promise<Map<string, string>> {
  const rows = await prisma.product.findMany({
    where: { storeId },
    select: { id: true, uzumProductId: true },
  });
  const map = new Map<string, string>();
  for (const r of rows) {
    map.set(r.id, r.id);
    if (r.uzumProductId) map.set(r.uzumProductId, r.id);
  }
  return map;
}

/** SKU kodi — Uzum kod bermasa, uning id'i ishlatiladi */
const skuCode = (s: UzumSku): string => text(s.sku) ?? String(s.id);

// ─────────────────────────── Do'konlar ───────────────────────────

export interface ShopsImportResult extends ImportResult {
  /** Tarif chegarasi sabab ulanmagan do'konlar nomi */
  skipped: string[];
}

/**
 * Kabinetdagi do'konlarni yozadi. Tabiiy kalit: `Store(companyId, uzumShopId)`.
 * Mavjud do'konning nomi/holati yangilanadi va kabinetga bog'lanadi.
 *
 * TARIF CHEGARASI: `maxStores` berilsa, undan ortiq YANGI do'kon yaratilmaydi.
 * Butun narx zinapoyamiz do'kon soniga qurilgan (1 / 3 / 10), lekin ilgari bu
 * chegara faqat ekranda ko'rsatilardi — kabinetda 10 ta do'kon bo'lsa,
 * Standart tarifdagi mijozning hammasi sinxronlanib ketaverardi.
 *
 * Mavjud do'konlar hech qachon o'chirilmaydi — tarif pasaysa ular ishlashda
 * davom etadi, faqat YANGISI qo'shilmaydi.
 */
export async function upsertShops(
  companyId: string,
  uzumAccountId: string,
  shops: UzumShop[],
  options: { maxStores?: number } = {},
): Promise<ShopsImportResult> {
  const res: ShopsImportResult = { ...emptyResult(), skipped: [] };
  if (shops.length === 0) return res;

  const limit = Number.isFinite(options.maxStores ?? NaN) ? (options.maxStores as number) : Infinity;
  // Chegarani tekshirish uchun kompaniyada hozir nechta do'kon borligi
  let slots = limit - (await prisma.store.count({ where: { companyId } }));

  const seen = new Set<string>();

  for (const batch of chunked(shops)) {
    const ids = batch.map((s) => String(s.id));
    const existing = await prisma.store.findMany({
      where: { companyId, uzumShopId: { in: ids } },
      select: { id: true, uzumShopId: true },
    });
    const byShop = new Map<string, string>();
    for (const s of existing) if (s.uzumShopId) byShop.set(s.uzumShopId, s.id);

    const creates: Prisma.StoreCreateManyInput[] = [];

    for (const shop of batch) {
      const uzumShopId = String(shop.id);
      if (seen.has(uzumShopId)) continue;
      seen.add(uzumShopId);

      const title = text(shop.title) ?? `Do‘kon ${uzumShopId}`;
      const status = text(shop.status) ?? 'active';
      const current = byShop.get(uzumShopId);

      if (current) {
        await prisma.store.update({ where: { id: current }, data: { title, status, uzumAccountId } });
        res.updated += 1;
      } else {
        if (slots <= 0) {
          res.skipped.push(title);
          continue;
        }
        slots -= 1;
        creates.push({
          id: stableId('st', companyId, uzumShopId),
          companyId,
          uzumAccountId,
          uzumShopId,
          title,
          status,
        });
      }
    }

    if (creates.length) {
      await prisma.store.createMany({ data: creates });
      res.created += creates.length;
    }
  }

  return res;
}

// ─────────────────────────── Mahsulotlar va SKU'lar ───────────────────────────

/**
 * Mahsulot kartochkalari va ularning SKU'lari.
 * Tabiiy kalitlar: `Product(storeId, uzumProductId)`, `Sku(storeId, sku)`.
 *
 * MUHIM: mavjud SKU yangilanganda `purchasePrice` va `extraCost` **tegilmaydi** —
 * bu qiymatlarni foydalanuvchi o'zi kiritadi (tannarx). Xuddi shunday, `rating`/`reviewsCount`
 * faqat Uzum aniq qiymat bergandagina yoziladi (aks holda analitika bosqichida hisoblangani qoladi).
 *
 * `created`/`updated` — mahsulot va SKU yozuvlari **jami** soni.
 */
export async function upsertProducts(storeId: string, products: UzumProduct[]): Promise<ImportResult> {
  const res = emptyResult();
  if (products.length === 0) return res;

  // Bitta SKU kodi bir necha mahsulotda uchrasa — birinchisi qabul qilinadi
  const seenSku = new Set<string>();
  const seenProduct = new Set<string>();

  for (const batch of chunked(products)) {
    const ids = batch.map((p) => String(p.id));
    const existing = await prisma.product.findMany({
      where: { storeId, uzumProductId: { in: ids } },
      select: { id: true, uzumProductId: true },
    });
    const byUzum = new Map<string, string>();
    for (const p of existing) if (p.uzumProductId) byUzum.set(p.uzumProductId, p.id);

    const productCreates: Prisma.ProductCreateManyInput[] = [];
    /** Shu partiyadagi barcha SKU'lar (ichki mahsulot id'i bilan) */
    const pending: { productId: string; sku: UzumSku; fallbackImage: string | null }[] = [];

    for (const p of batch) {
      const uzumProductId = String(p.id);
      if (seenProduct.has(uzumProductId)) continue;
      seenProduct.add(uzumProductId);

      const productId = byUzum.get(uzumProductId) ?? stableId('pr', storeId, uzumProductId);
      const data = {
        title: text(p.title) ?? `Mahsulot ${uzumProductId}`,
        category: text(p.category),
        brand: text(p.brand),
        imageUrl: text(p.imageUrl),
        status: text(p.status) ?? 'active',
        // Reyting/sharh soni faqat kelgan bo'lsa yangilanadi
        ...(p.rating !== undefined ? { rating: round(num(p.rating), 2) } : {}),
        ...(p.reviewsCount !== undefined ? { reviewsCount: int(p.reviewsCount) } : {}),
      };

      if (byUzum.has(uzumProductId)) {
        await prisma.product.update({ where: { id: productId }, data });
        res.updated += 1;
      } else {
        productCreates.push({ id: productId, storeId, uzumProductId, ...data });
      }

      for (const s of p.skus ?? []) {
        pending.push({ productId, sku: s, fallbackImage: text(p.imageUrl) });
      }
    }

    if (productCreates.length) {
      await prisma.product.createMany({ data: productCreates });
      res.created += productCreates.length;
    }

    if (pending.length === 0) continue;

    // Mavjud SKU'ni AVVAL barqaror `uzumSkuId` bo'yicha qidiramiz: Uzum SKU kodini
    // (masalan shtrix-koddan sotuvchi kodiga) o'zgartirsa ham yozuv dublikat bo'lmaydi.
    const codes = pending.map((x) => skuCode(x.sku));
    const uzumIds = pending.map((x) => String(x.sku.id));
    const existingSkus = await prisma.sku.findMany({
      where: { storeId, OR: [{ sku: { in: codes } }, { uzumSkuId: { in: uzumIds } }] },
      select: { id: true, sku: true, uzumSkuId: true },
    });
    const bySku = new Map<string, string>();
    const byUzumId = new Map<string, string>();
    for (const row of existingSkus) {
      bySku.set(row.sku, row.id);
      if (row.uzumSkuId) byUzumId.set(row.uzumSkuId, row.id);
    }

    const skuCreates: Prisma.SkuCreateManyInput[] = [];

    for (const { productId, sku, fallbackImage } of pending) {
      const code = skuCode(sku);
      if (seenSku.has(code)) continue;
      seenSku.add(code);

      /**
       * O'lcham va tannarx — foydalanuvchi qo'lda kiritishi mumkin bo'lgan
       * qiymatlar. Uzum aniq qiymat bermasa, ular USTIDAN YOZILMAYDI: aks holda
       * sotuvchi hajmni kiritgandan keyingi birinchi sinxron uni 0 ga qaytarardi
       * va saqlash xarajati hamda yuk joylari soni nolga tushib qolardi.
       */
      const common = {
        productId,
        uzumSkuId: String(sku.id),
        barcode: text(sku.barcode),
        title: text(sku.title) ?? code,
        imageUrl: text(sku.imageUrl) ?? fallbackImage,
        price: round(num(sku.price)),
        oldPrice: round(num(sku.oldPrice)),
        ...(num(sku.weightGr) > 0 ? { weightGr: num(sku.weightGr) } : {}),
        ...(num(sku.volumeL) > 0 ? { volumeL: num(sku.volumeL) } : {}),
        ...(num(sku.commissionPct) > 0 ? { commissionPct: num(sku.commissionPct) } : {}),
        ...(num(sku.storagePerItem) > 0 ? { storagePerItem: num(sku.storagePerItem) } : {}),
        // MXIK: sotuvchi uni saytda ham tahrirlay oladi, shuning uchun
        // Uzum bo'sh yuborsa mavjud qiymat o'chib ketmasligi kerak
        ...(text(sku.ikpu) ? { ikpu: text(sku.ikpu) } : {}),
        // Uzumda arxivlangan SKU saytda ham arxiv bo'lib ko'rinishi kerak
        archived: Boolean(sku.archived),

        /*
         * Quyidagilar TO'LIQ Uzumdan keladi — foydalanuvchi ularni tahrirlamaydi.
         * Shuning uchun yuqoridagi shartli spread naqshi (`...(x > 0 ? {x} : {})`)
         * BU YERDA ISHLATILMAYDI: aksiya tugaganda yoki blok olib tashlanganda
         * eski qiymat SKU'da abadiy qolib ketmasligi kerak.
         */
        promoName: text(sku.promoName),
        promoPrice: round(num(sku.promoPrice)),
        promoJoined: Boolean(sku.promoJoined),
        promoOffered: Boolean(sku.promoOffered),
        blocked: Boolean(sku.blocked),
        blockingReason: text(sku.blockingReason),
        returnedPct: round(num(sku.returnedPct)),
        qtyDefected: int(sku.qtyDefected),
        qtyMissing: int(sku.qtyMissing),
      };

      const current = byUzumId.get(String(sku.id)) ?? bySku.get(code);
      if (current) {
        // purchasePrice / extraCost — foydalanuvchi kiritadigan qiymatlar, tegilmaydi.
        // SKU kodi o'zgargan bo'lsa (Uzum boshqa maydon bera boshlasa) — yangilaymiz.
        await prisma.sku.update({ where: { id: current }, data: { ...common, sku: code } });
        res.updated += 1;
      } else {
        skuCreates.push({
          id: stableId('sk', storeId, code),
          storeId,
          sku: code,
          purchasePrice: 0,
          extraCost: 0,
          weightGr: num(sku.weightGr),
          volumeL: num(sku.volumeL),
          ...common,
        });
      }
    }

    if (skuCreates.length) {
      res.created += await createManyChunked(skuCreates, (data) => prisma.sku.createMany({ data }));
    }
  }

  return res;
}

// ─────────────────────────── Qoldiqlar ───────────────────────────

/**
 * Kunlik qoldiq snapshot'lari. Tabiiy kalit: `StockSnapshot(skuId, date)` (UTC kun boshi).
 * `own` (o'z omboridagi qoldiq) — platformada qo'lda yuritiladi, import uni o'zgartirmaydi.
 * Katalogda topilmagan SKU'lar e'tiborsiz qoldiriladi (avval `upsertProducts` chaqirilishi kerak).
 */
export async function upsertStocks(storeId: string, stocks: UzumStock[]): Promise<ImportResult> {
  const res = emptyResult();
  if (stocks.length === 0) return res;

  const refs = await getSkuRefs(storeId);
  const today = new Date();

  interface StockRow {
    skuId: string;
    date: Date;
    key: string;
    fbo: number;
    fbs: number;
    reserved: number;
    inTransit: number;
  }

  // Bir SKU + bir kun uchun bitta yozuv (oxirgi kelgan qiymat ustun)
  const dedup = new Map<string, StockRow>();
  for (const st of stocks) {
    const ref = refs.get(String(st.skuId));
    if (!ref) continue;
    const date = dayStart(toDate(st.date, today) ?? today);
    const key = `${ref.id}|${toISODate(date)}`;
    dedup.set(key, {
      skuId: ref.id,
      date,
      key,
      fbo: int(st.fbo),
      fbs: int(st.fbs),
      reserved: int(st.reserved),
      inTransit: int(st.inTransit),
    });
  }

  const rows = [...dedup.values()];
  if (rows.length === 0) return res;

  /**
   * `own` (o'z ombori) va `inTransit` (yo'lda) — Uzumdan kelmaydigan, platformada
   * yuritiladigan qiymatlar. Yangi kun uchun snapshot yaratilganda ular oldingi
   * kundan KO'CHIRILADI: aks holda ertalabki birinchi sinxrondan keyin "Ombor"
   * sahifasi bo'm-bo'sh ko'rinardi.
   */
  const lastOwn = new Map<string, { own: number; inTransit: number }>();
  {
    const skuIds = [...new Set(rows.map((r) => r.skuId))];
    for (const batch of chunked(skuIds)) {
      const prev = await prisma.stockSnapshot.findMany({
        where: { skuId: { in: batch } },
        orderBy: { date: 'desc' },
        select: { skuId: true, own: true, inTransit: true },
      });
      for (const r of prev) {
        if (!lastOwn.has(r.skuId)) lastOwn.set(r.skuId, { own: r.own, inTransit: r.inTransit });
      }
    }
  }

  for (const batch of chunked(rows)) {
    const existing = await prisma.stockSnapshot.findMany({
      where: { skuId: { in: batch.map((r) => r.skuId) }, date: { in: batch.map((r) => r.date) } },
      select: { id: true, skuId: true, date: true },
    });
    const byKey = new Map(existing.map((e) => [`${e.skuId}|${toISODate(e.date)}`, e.id]));

    const creates: Prisma.StockSnapshotCreateManyInput[] = [];

    for (const row of batch) {
      const current = byKey.get(row.key);
      // Uzum "yo'lda" miqdorini bermaydi — 0 kelsa mavjud qiymat saqlanadi
      const data: { fbo: number; fbs: number; reserved: number; inTransit?: number } = {
        fbo: row.fbo,
        fbs: row.fbs,
        reserved: row.reserved,
        ...(row.inTransit > 0 ? { inTransit: row.inTransit } : {}),
      };
      if (current) {
        await prisma.stockSnapshot.update({ where: { id: current }, data });
        res.updated += 1;
      } else {
        const carry = lastOwn.get(row.skuId);
        creates.push({
          id: stableId('ss', row.skuId, toISODate(row.date)),
          skuId: row.skuId,
          storeId,
          date: row.date,
          own: carry?.own ?? 0,
          inTransit: row.inTransit > 0 ? row.inTransit : (carry?.inTransit ?? 0),
          ...data,
        });
      }
    }

    if (creates.length) {
      await prisma.stockSnapshot.createMany({ data: creates });
      res.created += creates.length;
    }
  }

  return res;
}

// ─────────────────────────── Buyurtmalar ───────────────────────────

/** Uzum status kodlari → platforma statuslari */
const ORDER_STATUS_MAP: Record<string, OrderStatus> = {
  CREATED: 'new',
  NEW: 'new',
  PENDING: 'new',
  PACKING: 'processing',
  PROCESSING: 'processing',
  PENDING_DELIVERY: 'processing',
  DELIVERING: 'processing',
  SENT: 'processing',
  DELIVERED: 'delivered',
  ACCEPTED_AT_DP: 'delivered',
  COMPLETED: 'delivered',
  ISSUED: 'delivered',
  CANCELED: 'canceled',
  CANCELLED: 'canceled',
  REJECTED: 'canceled',
  RETURNED: 'returned',
  REFUNDED: 'returned',
  RETURN: 'returned',
};

/** Notanish status "yetkazilgan" deb qabul qilinadi — tushum yo'qolib qolmasligi uchun */
function mapOrderStatus(raw: string | undefined | null): OrderStatus {
  const key = raw?.trim().toUpperCase();
  if (!key) return 'delivered';
  return ORDER_STATUS_MAP[key] ?? 'delivered';
}

function mapDeliveryType(raw: string | undefined | null): DeliveryType {
  const key = raw?.trim().toUpperCase();
  if (key === 'FBS') return 'FBS';
  if (key === 'DBS') return 'DBS';
  return 'FBO';
}

/** Buyurtma darajasidagi summani pozitsiya tushumiga proportsional taqsimlaydi */
function shareOf(total: number | undefined, part: number, whole: number): number | null {
  if (total === undefined || total === null || !Number.isFinite(total)) return null;
  if (whole <= 0) return null;
  return round((total * part) / whole);
}

export interface OrderImportOptions {
  /** Kompaniya soliq stavkasi, % (berilmasa `DEFAULTS.taxPct`) */
  taxRate?: number;
  /**
   * Yangi sotuvlar ro'yxati yig'ilsinmi (Telegram xabari uchun).
   *
   * Birinchi TO'LIQ sinxronda 365 kunlik tarix import qilinadi — o'n minglab
   * buyurtma. Ularni xotirada to'plash ham, xabar yuborish ham keraksiz,
   * shuning uchun bu bayroq faqat inkremental sinxronda yoqiladi.
   */
  collectNew?: boolean;
  /**
   * Faqat shu paytdan keyin berilgan buyurtmalar yig'iladi.
   *
   * Yosh chegarasi AYNAN shu yerda — `NEW_SALES_CAP` dan oldin — tekshirilishi
   * shart. Buyurtmalar eskidan yangiga tartibda keladi, shuning uchun filtrsiz
   * 50 ta joyni oynadagi eng eski buyurtmalar egallab olardi va bugungi
   * haqiqiy sotuvlar ro'yxatga umuman tushmasdi.
   */
  collectNewSince?: Date;
}

/** Telegramga "sotildi" xabarini yuborish uchun zarur minimal ma'lumot */
export interface NewSaleNotice {
  uzumOrderId: string;
  orderedAt: Date;
  /** Mahsulot nomi (nom bo'lmasa SKU kodi) */
  title: string;
  /** Buyurtmadagi pozitsiyalar soni — 1 dan ko'p bo'lsa xabarda ko'rsatiladi */
  positions: number;
  qty: number;
  amount: number;
}

export interface OrdersImportResult extends ImportResult {
  /** Shu importda BIRINCHI marta ko'ringan sotuvlar (`collectNew` yoqilganda) */
  newSales: NewSaleNotice[];
  /** Cheklovdan oldingi haqiqiy son — xabarda "yana N ta" deb yozish uchun */
  newSalesTotal: number;
}

/**
 * Faqat shu statuslar sotuv hisoblanadi. Bekor qilingan va qaytarilgan
 * buyurtma ham `orderCreates` ga tushadi (importer bu yerda filtrlamaydi),
 * lekin ular haqida "tovaringiz sotildi" deb yozish xato bo'lardi.
 */
const SALE_STATUSES = new Set<OrderStatus>(['new', 'processing', 'delivered']);

/** Bitta importda ko'pi bilan shuncha sotuv eslab qolinadi */
const NEW_SALES_CAP = 50;

/**
 * Buyurtmalar va ularning pozitsiyalari.
 * Tabiiy kalit: `Order(storeId, uzumOrderId)`. Pozitsiyalar buyurtma bilan birga
 * qayta yoziladi (avval o'chiriladi, keyin yangidan yaratiladi) — bu eng ishonchli idempotentlik.
 *
 * Komissiya/logistika kelmasa: avval buyurtma darajasidagi summa tushumga qarab taqsimlanadi,
 * u ham bo'lmasa `DEFAULTS.commissionPct` va `DEFAULTS.logisticsPerUnit` bo'yicha taxmin qilinadi.
 *
 * `created`/`updated` — **buyurtmalar** soni (pozitsiyalar buyurtma bilan birga yoziladi).
 */
export async function upsertOrders(
  storeId: string,
  orders: UzumOrder[],
  options: OrderImportOptions = {},
): Promise<OrdersImportResult> {
  /**
   * Uzum moliyaviy javobida har bir pozitsiya uchun tannarx (`purchasePrice`) keladi.
   * Bizda tannarx kiritilmagan SKU'larga uni avtomatik ko'chiramiz — shunda foyda va
   * marja birinchi sinxrondanoq to'g'ri hisoblanadi. Qo'lda kiritilgan qiymat ustidan yozilmaydi.
   */
  const costFromUzum = new Map<string, number>();

  const res: OrdersImportResult = { ...emptyResult(), newSales: [], newSalesTotal: 0 };
  if (orders.length === 0) return res;

  const taxRate = Number.isFinite(options.taxRate ?? NaN) ? (options.taxRate as number) : DEFAULTS.taxPct;
  const refs = await getSkuRefs(storeId);
  const seen = new Set<string>();

  for (const batch of chunked(orders)) {
    const keys = batch.map((o) => String(o.id));
    const existing = await prisma.order.findMany({
      where: { storeId, uzumOrderId: { in: keys } },
      select: { id: true, uzumOrderId: true },
    });
    const byKey = new Map<string, string>();
    for (const o of existing) if (o.uzumOrderId) byKey.set(o.uzumOrderId, o.id);

    const orderCreates: Prisma.OrderCreateManyInput[] = [];
    const itemCreates: Prisma.OrderItemCreateManyInput[] = [];
    /** Shu partiyada qayta yoziladigan buyurtmalarning ichki id'lari */
    const touched: string[] = [];

    for (const order of batch) {
      const uzumOrderId = String(order.id);
      if (seen.has(uzumOrderId)) continue;
      seen.add(uzumOrderId);

      const orderId = byKey.get(uzumOrderId) ?? stableId('or', storeId, uzumOrderId);
      const status = mapOrderStatus(order.status);
      const deliveryType = mapDeliveryType(order.deliveryType);
      const orderedAt = toDate(order.orderedAt, new Date()) ?? new Date();
      const paidAt = toDate(order.paidAt);
      const deliveredAt = toDate(order.deliveredAt);
      const returnedAt = status === 'returned' ? (deliveredAt ?? orderedAt) : null;
      const itemStatus = status === 'returned' ? 'returned' : status === 'canceled' ? 'canceled' : 'delivered';

      // 1-o'tish: umumiy tushum (proportsional taqsimlash uchun kerak)
      const lines = (order.items ?? []).map((it) => {
        // Uzum bekor qilingan/qaytarilgan pozitsiyada `amount = 0` yuboradi — bu sotuv EMAS.
        // Shuning uchun 0 ni saqlab qolamiz; miqdor umuman kelmasa 1 deb olamiz.
        const qty = it.qty === undefined || it.qty === null ? 1 : Math.max(0, int(it.qty, 0));
        const sellPrice = round(num(it.sellPrice));
        return { it, qty, sellPrice, revenue: round(sellPrice * qty) };
      });
      const orderRevenue = lines.reduce((s, l) => s + l.revenue, 0);

      let sumCommission = 0;
      let sumLogistics = 0;
      let sumQty = 0;

      // 2-o'tish: pozitsiya moliyasi
      lines.forEach((line, index) => {
        const { it, qty, sellPrice, revenue } = line;
        const ref = refs.get(String(it.skuId)) ?? (it.skuCode ? refs.get(it.skuCode) : undefined);

        const commission =
          it.commission !== undefined
            ? round(num(it.commission))
            : (shareOf(order.commission, revenue, orderRevenue) ??
              round((revenue * DEFAULTS.commissionPct) / 100));

        const logistics =
          it.logistics !== undefined
            ? round(num(it.logistics))
            : (shareOf(order.logistics, revenue, orderRevenue) ?? round(DEFAULTS.logisticsPerUnit * qty));

        // Tannarx: avval bizdagi (qo'lda kiritilgan) qiymat, bo'lmasa Uzum bergani
        const purchasePrice = round(ref?.purchasePrice || num(it.purchasePrice) || 0);
        if (ref && !(ref.purchasePrice > 0) && num(it.purchasePrice) > 0) {
          costFromUzum.set(ref.id, round(num(it.purchasePrice)));
        }

        const otherCost = round((ref?.extraCost ?? 0) * qty);
        const cogs = round(purchasePrice * qty);
        // Uzum "yechib olish uchun" summasini bersa — o'shani ishlatamiz (aniqroq),
        // aks holda tushumdan komissiya va logistikani ayiramiz
        const payout =
          it.payout !== undefined && num(it.payout) > 0
            ? round(num(it.payout))
            : round(revenue - commission - logistics);
        const tax = round((revenue * taxRate) / 100);
        const netProfit = round(payout - cogs - otherCost - tax);

        sumCommission += commission;
        sumLogistics += logistics;
        sumQty += qty;

        itemCreates.push({
          id: stableId('oi', orderId, index, String(it.skuId)),
          orderId,
          skuId: ref?.id ?? null,
          skuCode: text(it.skuCode) ?? ref?.sku ?? String(it.skuId),
          title: text(it.title),
          qty,
          returnedQty: Math.max(0, int(it.returnedQty, 0)),
          sellPrice,
          purchasePrice,
          commission,
          logistics,
          otherCost,
          revenue,
          payout,
          netProfit,
          status: text(it.status) ? mapItemStatus(it.status, itemStatus) : itemStatus,
          returnedAt,
          orderedAt,
        });
      });

      const data = {
        status,
        deliveryType,
        orderedAt,
        paidAt,
        deliveredAt,
        buyerCity: text(order.buyerCity),
        totalAmount: round(num(order.totalAmount) || orderRevenue),
        commission: sumCommission,
        logistics: sumLogistics,
        discount: round(num(order.discount)),
        itemsCount: sumQty,
      };

      touched.push(orderId);

      if (byKey.has(uzumOrderId)) {
        await prisma.order.update({ where: { id: orderId }, data });
        res.updated += 1;
      } else {
        orderCreates.push({ id: orderId, storeId, uzumOrderId, ...data });

        // Yangi SOTUV — Telegram xabari uchun eslab qolamiz
        if (
          options.collectNew &&
          SALE_STATUSES.has(status) &&
          data.totalAmount > 0 &&
          (!options.collectNewSince || orderedAt.getTime() >= options.collectNewSince.getTime())
        ) {
          res.newSalesTotal += 1;
          if (res.newSales.length < NEW_SALES_CAP) {
            const first = lines[0];
            res.newSales.push({
              uzumOrderId,
              orderedAt,
              // Nom bo'lmasa SKU kodi, u ham bo'lmasa Uzum SKU id'i ko'rsatiladi
              title:
                text(first?.it.title) ??
                text(first?.it.skuCode) ??
                (first?.it.skuId ? String(first.it.skuId) : 'Mahsulot'),
              positions: lines.length,
              qty: sumQty,
              amount: data.totalAmount,
            });
          }
        }
      }
    }

    if (orderCreates.length) {
      await prisma.order.createMany({ data: orderCreates });
      res.created += orderCreates.length;
    }

    // Pozitsiyalar: eskilari o'chirilib, yangidan yoziladi (dublikat bo'lmaydi)
    if (touched.length) {
      await prisma.orderItem.deleteMany({ where: { orderId: { in: touched } } });
    }
    if (itemCreates.length) {
      await createManyChunked(itemCreates, (data) => prisma.orderItem.createMany({ data }));
    }
  }

  // Kod o'zgargani sababli bog'lanmay qolgan eski pozitsiyalarni qayta bog'laymiz
  await relinkOrphanItems(storeId);

  // Uzum bergan tannarxni bo'sh SKU'larga yozamiz
  for (const [skuId, value] of costFromUzum) {
    await prisma.sku.updateMany({
      where: { id: skuId, purchasePrice: 0 },
      data: { purchasePrice: value },
    });
  }

  return res;
}

/**
 * Pozitsiya statusi: pozitsiya "qaytarilgan"/"bekor" bo'lsa shu qiymat, aks holda
 * buyurtma statusidan kelib chiqqan qiymat ishlatiladi (common.ts shu uchlikka tayanadi).
 */
function mapItemStatus(raw: string | undefined, fallback: string): string {
  const mapped = mapOrderStatus(raw);
  if (mapped === 'returned') return 'returned';
  if (mapped === 'canceled') return 'canceled';
  return fallback;
}

// ─────────────────────────── Qaytarishlar ───────────────────────────

/**
 * Mijoz qaytarishlari. Unique indeksi yo'q — barqaror `id` (store + Uzum id) idempotentlikni beradi.
 */
export async function upsertReturns(storeId: string, returns: UzumReturn[]): Promise<ImportResult> {
  const res = emptyResult();
  if (returns.length === 0) return res;

  const refs = await getSkuRefs(storeId);
  const seen = new Set<string>();

  for (const batch of chunked(returns)) {
    const rows = batch
      .filter((r) => {
        const key = String(r.id);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .map((r) => {
        const ref = refs.get(String(r.skuId));
        const returnedAt = toDate(r.returnedAt, new Date()) ?? new Date();
        return {
          id: stableId('rr', storeId, String(r.id)),
          storeId,
          skuId: ref?.id ?? null,
          orderCode: text(r.orderCode),
          qty: Math.max(1, int(r.qty, 1)),
          amount: round(num(r.amount)),
          reason: text(r.reason),
          status: 'returned',
          returnedAt,
        };
      });

    if (rows.length === 0) continue;

    const existing = await prisma.returnRecord.findMany({
      where: { id: { in: rows.map((r) => r.id) } },
      select: { id: true },
    });
    const known = new Set(existing.map((e) => e.id));

    const creates: Prisma.ReturnRecordCreateManyInput[] = [];
    for (const row of rows) {
      if (known.has(row.id)) {
        const { id, storeId: _storeId, ...data } = row;
        await prisma.returnRecord.update({ where: { id }, data });
        res.updated += 1;
      } else {
        creates.push(row);
      }
    }

    if (creates.length) {
      await prisma.returnRecord.createMany({ data: creates });
      res.created += creates.length;
    }
  }

  return res;
}

// ─────────────────────────── Yo'qotishlar ───────────────────────────

const LOSS_TYPES = new Set(['lost', 'damaged', 'not_delivered']);
const LOSS_STATUSES = new Set(['open', 'claimed', 'compensated', 'rejected']);

/**
 * Marketpleys aybi bilan yo'qolgan/shikastlangan tovarlar.
 * `claimSentAt` va `note` — platformada yuritiladi, import ularga tegmaydi.
 */
export async function upsertLosses(storeId: string, losses: UzumLoss[]): Promise<ImportResult> {
  const res = emptyResult();
  if (losses.length === 0) return res;

  const refs = await getSkuRefs(storeId);
  const seen = new Set<string>();

  for (const batch of chunked(losses)) {
    const rows = batch
      .filter((l) => {
        const key = String(l.id);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .map((l) => {
        const ref = refs.get(String(l.skuId));
        return {
          id: stableId('ls', storeId, String(l.id)),
          storeId,
          skuId: ref?.id ?? null,
          type: LOSS_TYPES.has(l.type) ? l.type : 'lost',
          scheme: l.scheme === 'FBS' ? 'FBS' : 'FBO',
          qty: Math.max(1, int(l.qty, 1)),
          amount: round(num(l.amount)),
          compensated: round(num(l.compensated)),
          status: LOSS_STATUSES.has(l.status) ? l.status : 'open',
          happenedAt: toDate(l.happenedAt, new Date()) ?? new Date(),
        };
      });

    if (rows.length === 0) continue;

    const existing = await prisma.lossRecord.findMany({
      where: { id: { in: rows.map((r) => r.id) } },
      select: { id: true },
    });
    const known = new Set(existing.map((e) => e.id));

    const creates: Prisma.LossRecordCreateManyInput[] = [];
    for (const row of rows) {
      if (known.has(row.id)) {
        const { id, storeId: _storeId, ...data } = row;
        await prisma.lossRecord.update({ where: { id }, data });
        res.updated += 1;
      } else {
        creates.push(row);
      }
    }

    if (creates.length) {
      await prisma.lossRecord.createMany({ data: creates });
      res.created += creates.length;
    }
  }

  return res;
}

// ─────────────────────────── Pullik saqlash ───────────────────────────

/**
 * Kunlik pullik saqlash to'lovlari. Tabiiy kalit: do'kon + SKU + kun.
 * Bir kun uchun bir nechta yozuv kelsa — summalar qo'shiladi (dublikat hisob bo'lmaydi).
 */
export async function upsertStorageFees(storeId: string, fees: UzumStorageFee[]): Promise<ImportResult> {
  const res = emptyResult();
  if (fees.length === 0) return res;

  const refs = await getSkuRefs(storeId);
  const today = new Date();

  interface FeeRow {
    id: string;
    storeId: string;
    skuId: string | null;
    date: Date;
    qty: number;
    volumeL: number;
    amount: number;
  }

  const merged = new Map<string, FeeRow>();
  for (const f of fees) {
    const ref = refs.get(String(f.skuId));
    const date = dayStart(toDate(f.date, today) ?? today);
    const skuId = ref?.id ?? null;
    const id = stableId('sf', storeId, skuId ?? String(f.skuId), toISODate(date));
    const cur = merged.get(id);
    if (cur) {
      cur.qty += int(f.qty);
      cur.volumeL += num(f.volumeL);
      cur.amount += round(num(f.amount));
    } else {
      merged.set(id, {
        id,
        storeId,
        skuId,
        date,
        qty: int(f.qty),
        volumeL: num(f.volumeL),
        amount: round(num(f.amount)),
      });
    }
  }

  const rows = [...merged.values()];
  for (const batch of chunked(rows)) {
    const existing = await prisma.storageFee.findMany({
      where: { id: { in: batch.map((r) => r.id) } },
      select: { id: true },
    });
    const known = new Set(existing.map((e) => e.id));

    const creates: Prisma.StorageFeeCreateManyInput[] = [];
    for (const row of batch) {
      if (known.has(row.id)) {
        await prisma.storageFee.update({
          where: { id: row.id },
          data: { skuId: row.skuId, date: row.date, qty: row.qty, volumeL: row.volumeL, amount: row.amount },
        });
        res.updated += 1;
      } else {
        creates.push(row);
      }
    }

    if (creates.length) {
      await prisma.storageFee.createMany({ data: creates });
      res.created += creates.length;
    }
  }

  return res;
}

// ─────────────────────────── Sharhlar ───────────────────────────

/**
 * Mijoz sharhlari. Tabiiy kalit: `Review(storeId, uzumReviewId)`.
 * Platformada berilgan javob (`answered`/`answerText`) import vaqtida o'chirilmaydi —
 * javob faqat "yo'q"dan "bor"ga o'zgarishi mumkin.
 */
export async function upsertReviews(storeId: string, reviews: UzumReview[]): Promise<ImportResult> {
  const res = emptyResult();
  if (reviews.length === 0) return res;

  const [skuRefs, productRefs] = await Promise.all([getSkuRefs(storeId), getProductRefs(storeId)]);
  const seen = new Set<string>();

  for (const batch of chunked(reviews)) {
    const ids = batch.map((r) => String(r.id));
    const existing = await prisma.review.findMany({
      where: { storeId, uzumReviewId: { in: ids } },
      select: { id: true, uzumReviewId: true, answered: true },
    });
    const byUzum = new Map(existing.filter((e) => e.uzumReviewId).map((e) => [e.uzumReviewId as string, e]));

    const creates: Prisma.ReviewCreateManyInput[] = [];

    for (const r of batch) {
      const uzumReviewId = String(r.id);
      if (seen.has(uzumReviewId)) continue;
      seen.add(uzumReviewId);

      const sku = r.skuId ? skuRefs.get(String(r.skuId)) : undefined;
      const productId = r.productId ? (productRefs.get(String(r.productId)) ?? null) : (sku?.productId ?? null);
      const rating = Math.min(5, Math.max(1, int(r.rating, 1) || 5));

      const common = {
        productId,
        skuId: sku?.id ?? null,
        rating,
        text: text(r.text),
        author: text(r.author),
        publishedAt: toDate(r.publishedAt, new Date()) ?? new Date(),
      };

      const current = byUzum.get(uzumReviewId);
      if (current) {
        // Javob faqat "yo'q → bor" yo'nalishida yangilanadi
        const answerPatch =
          r.answered === true && !current.answered
            ? { answered: true, answerText: text(r.answerText), answeredAt: new Date() }
            : {};
        await prisma.review.update({ where: { id: current.id }, data: { ...common, ...answerPatch } });
        res.updated += 1;
      } else {
        creates.push({
          id: stableId('rv', storeId, uzumReviewId),
          storeId,
          uzumReviewId,
          ...common,
          answered: r.answered === true,
          answerText: r.answered === true ? text(r.answerText) : null,
          answeredAt: r.answered === true ? new Date() : null,
          autoAnswered: false,
        });
      }
    }

    if (creates.length) {
      await prisma.review.createMany({ data: creates });
      res.created += creates.length;
    }
  }

  return res;
}

// ─────────────────────────── Xarajatlar ───────────────────────────

/**
 * Uzum'dan import qilinadigan xarajat kategoriyalari.
 *
 * DIQQAT: `commission`, `logistics` buyurtma pozitsiyalaridan, `storage` — `StorageFee`dan,
 * `tax` — kompaniya soliq stavkasidan hisoblanadi (`routes/finance.ts`).
 * Ularni `Expense` sifatida ham yozish **ikki marta hisoblashga** olib keladi,
 * shuning uchun faqat boshqa manbadan kelmaydigan kategoriyalar import qilinadi.
 */
/**
 * Uzumdan import qilinadigan xarajat kategoriyalari.
 *
 * `logistics` shu ro'yxatda: Uzum "Xizmatlarga to'lov" bo'limida logistikani ALOHIDA
 * to'lov sifatida yuritadi (omborga yetkazib berish va har bir buyurtmani mijozga
 * yetkazish), buyurtma pozitsiyasida esa `logisticDeliveryFee` odatda 0 bo'ladi.
 * Shuning uchun ular ikki marta hisoblanmaydi.
 *
 * `commission` kiritilmagan — u har bir buyurtma pozitsiyasidan olinadi.
 * `storage` kiritilmagan — u `StorageFee` jadvalida alohida yuritiladi.
 */
/**
 * `skuId` bo'sh qolgan buyurtma pozitsiyalarini SKU kodi bo'yicha qayta bog'laydi.
 *
 * Bu kerak bo'ladi, chunki katalog va buyurtmalar turli vaqtda sinxronlanadi yoki
 * Uzum SKU kodini o'zgartiradi. Bog'lanmagan pozitsiya = mahsulot "hech qachon
 * sotilmagan" deb ko'rinadi (nolikvid, ABC va rejalashtiruvchi noto'g'ri ishlaydi).
 */
export async function relinkOrphanItems(storeId: string): Promise<number> {
  const orphans = await prisma.orderItem.findMany({
    where: { skuId: null, order: { storeId } },
    select: { id: true, skuCode: true },
  });
  if (orphans.length === 0) return 0;

  const refs = await getSkuRefs(storeId);
  let linked = 0;

  for (const batch of chunked(orphans)) {
    for (const item of batch) {
      const code = text(item.skuCode);
      const ref = code ? refs.get(code) : undefined;
      if (!ref) continue;
      await prisma.orderItem.update({ where: { id: item.id }, data: { skuId: ref.id } });
      linked += 1;
    }
  }

  return linked;
}

export const IMPORTED_EXPENSE_CATEGORIES: ExpenseCategory[] = ['marketing', 'logistics', 'other'];

/**
 * Kunlik xarajatlar. Tabiiy kalit: kompaniya + do'kon + kun + kategoriya.
 * Bir kunda bir kategoriya bo'yicha bir nechta yozuv kelsa — summalar qo'shiladi.
 * Qo'lda kiritilgan xarajatlar (`source: 'manual'`) alohida id'ga ega, ustidan yozilmaydi.
 */
export async function upsertExpenses(
  companyId: string,
  storeId: string | null,
  expenses: UzumExpense[],
): Promise<ImportResult> {
  const res = emptyResult();
  if (expenses.length === 0) return res;

  const allowed = new Set<string>(IMPORTED_EXPENSE_CATEGORIES);
  const today = new Date();

  interface ExpenseRow {
    id: string;
    companyId: string;
    storeId: string | null;
    date: Date;
    category: string;
    amount: number;
    note: string | null;
    source: string;
  }

  const merged = new Map<string, ExpenseRow>();
  for (const e of expenses) {
    // Boshqa manbadan hisoblanadigan kategoriyalar tashlab yuboriladi (ikki marta hisob bo'lmasin)
    if (!allowed.has(e.category)) continue;
    const category = e.category;

    const date = dayStart(toDate(e.date, today) ?? today);
    /**
     * To'lov summasida allaqachon ayrilgan xarajatlar alohida manbada
     * saqlanadi: foyda hisobiga kirmaydi, ammo hisobdagi balansni
     * Uzumdagi kabi hisoblash uchun kerak.
     */
    const source = e.inPayout ? 'uzum-payout' : 'uzum';
    const id = stableId('ex', companyId, storeId ?? '', toISODate(date), category, source);
    const amount = round(num(e.amount));
    const cur = merged.get(id);
    if (cur) {
      cur.amount += amount;
      if (!cur.note && text(e.note)) cur.note = text(e.note);
    } else {
      merged.set(id, {
        id,
        companyId,
        storeId,
        date,
        category,
        amount,
        note: text(e.note),
        source,
      });
    }
  }

  const rows = [...merged.values()].filter((r) => r.amount !== 0);
  if (rows.length === 0) return res;

  for (const batch of chunked(rows)) {
    const existing = await prisma.expense.findMany({
      where: { id: { in: batch.map((r) => r.id) } },
      select: { id: true },
    });
    const known = new Set(existing.map((e) => e.id));

    const creates: Prisma.ExpenseCreateManyInput[] = [];
    for (const row of batch) {
      if (known.has(row.id)) {
        await prisma.expense.update({
          where: { id: row.id },
          data: { amount: row.amount, note: row.note, category: row.category, date: row.date },
        });
        res.updated += 1;
      } else {
        creates.push(row);
      }
    }

    if (creates.length) {
      await prisma.expense.createMany({ data: creates });
      res.created += creates.length;
    }
  }

  return res;
}
