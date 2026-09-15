/**
 * `LiveUzumClient` — haqiqiy Uzum Seller API bilan ishlaydigan adapter.
 *
 * Asosiy tamoyillar:
 *  • **Hech qachon exception tashlamaydi** (`verify()` dan tashqari — u ham `{ok:false}` qaytaradi).
 *    Har bir `get*` metodi xatolikda bo'sh massiv beradi, chunki sinxronizatsiya bosqichi
 *    bitta endpoint ishlamagani uchun qulab tushmasligi kerak.
 *  • **Himoyalangan parsing**: javob JSON tuzilmasi tasdiqlanmagan (`docs/UZUM-API.md` 4-bo'lim),
 *    shuning uchun har bir maydon `asNumber` / `asString` / `asArray` orqali o'qiladi va
 *    topilmasa 0 / '' / [] qiymat oladi. Maydon nomlarining bir nechta varianti sinab ko'riladi.
 *  • Endpoint umuman mavjud bo'lmasa (masalan sharhlar) — bo'sh massiv.
 *
 * Yo'llar `endpoints.ts` da, transport `http.ts` da.
 */
import {
  UZUM_ORDER_STATUSES,
  UZUM_PAGE_LIMITS,
  uzumPath,
} from './endpoints.js';
import {
  UzumHttp,
  isRecord,
  toUzumApiError,
  uzumErrorMessage,
  type UzumQuery,
} from './http.js';
import type {
  UzumClient,
  UzumClientOptions,
  UzumDeliveryType,
  UzumExpense,
  UzumExpenseCategory,
  UzumLoss,
  UzumOrder,
  UzumOrderItem,
  UzumProduct,
  UzumReview,
  UzumReturn,
  UzumShop,
  UzumSku,
  UzumStock,
  UzumStorageFee,
} from './types.js';

// ─────────────────────────── Himoyalangan o'qish yordamchilari ───────────────────────────

/** Ixtiyoriy qiymatni obyektga keltiradi (bo'lmasa — bo'sh obyekt) */
function asRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

/** Ixtiyoriy qiymatni massivga keltiradi (bo'lmasa — bo'sh massiv) */
function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

/** Sonni xavfsiz o'qish. Matn ichidagi son ham qabul qilinadi. */
function asNumber(value: unknown, fallback = 0): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : fallback;
  if (typeof value === 'string') {
    const cleaned = value.replace(/\s+/g, '').replace(',', '.');
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : fallback;
  }
  if (typeof value === 'boolean') return value ? 1 : 0;
  return fallback;
}

/** Pul qiymati — UZS, butun son */
function asMoney(value: unknown, fallback = 0): number {
  return Math.round(asNumber(value, fallback));
}

/** Matnni xavfsiz o'qish */
function asString(value: unknown, fallback = ''): string {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value === 'bigint') return String(value);
  return fallback;
}

/** Mantiqiy qiymatni xavfsiz o'qish */
function asBool(value: unknown, fallback = false): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') return ['true', '1', 'yes', 'ok'].includes(value.toLowerCase());
  if (typeof value === 'number') return value !== 0;
  return fallback;
}

/** Obyektdan birinchi mavjud maydonni oladi (nomlar varianti ko'p bo'lgani uchun) */
function firstOf(source: Record<string, unknown>, keys: readonly string[]): unknown {
  for (const key of keys) {
    const value = source[key];
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return undefined;
}

/**
 * Sanani ISO-8601 ga keltiradi.
 * Uzum epoch millisekund yoki soniya, yoxud ISO matn qaytarishi mumkin — uchalasi ham qo'llanadi.
 * TODO(uzum): real kalit bilan format aniqlangach soddalashtirish mumkin.
 */
function asIso(value: unknown, fallback: string): string {
  if (typeof value === 'number' && Number.isFinite(value)) {
    // 1e12 dan kichik bo'lsa — soniyalarda (2001-yilgacha bo'lgan ms qiymatlari bizga uchramaydi)
    const ms = value < 1e12 ? value * 1000 : value;
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? fallback : d.toISOString();
  }
  if (typeof value === 'string' && value.trim()) {
    const raw = value.trim();
    const numeric = Number(raw);
    if (Number.isFinite(numeric) && /^\d+$/.test(raw)) return asIso(numeric, fallback);
    const d = new Date(raw);
    return Number.isNaN(d.getTime()) ? fallback : d.toISOString();
  }
  return fallback;
}

/** Ixtiyoriy sana: maydon bo'lmasa yoki o'qib bo'lmasa — `undefined` */
function optionalIso(value: unknown): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  return asIso(value, '') || undefined;
}

/** Umumiy ro'yxat kalitlari (Spring Pageable odatda `content` beradi) */
const GENERIC_LIST_KEYS = ['items', 'content', 'list', 'result', 'records', 'rows', 'data'] as const;

/**
 * Javobdan elementlar massivini ajratib oladi.
 * Avval berilgan nomlar, keyin umumiy nomlar, oxirida — yagona massiv maydoni.
 */
function pickList(payload: unknown, keys: readonly string[] = []): unknown[] {
  if (Array.isArray(payload)) return payload;
  if (!isRecord(payload)) return [];

  for (const key of [...keys, ...GENERIC_LIST_KEYS]) {
    const value = payload[key];
    if (Array.isArray(value)) return value;
  }

  // Oxirgi chora: obyektda faqat bitta massiv bo'lsa, o'sha ro'yxat deb qaraymiz
  const arrays = Object.values(payload).filter(Array.isArray) as unknown[][];
  return arrays.length === 1 ? arrays[0] : [];
}

/** Sana oraliqqa tushadimi (ikkala chegara ham qo'shiladi) */
function inRange(iso: string, from: Date, to: Date): boolean {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return false;
  return t >= from.getTime() && t <= to.getTime();
}

// ─────────────────────────── Maydon nomlari varianti ───────────────────────────

const KEYS = {
  shopId: ['id', 'shopId', 'organizationId', 'shopID'],
  shopTitle: ['name', 'title', 'shopName', 'organizationName'],
  status: ['status', 'state', 'orderStatus', 'shopStatus'],

  productId: ['productId', 'id', 'productID', 'product_id'],
  productTitle: ['productTitle', 'title', 'name', 'productName'],
  category: ['category', 'categoryName', 'categoryTitle'],
  brand: ['brand', 'brandName'],
  image: ['image', 'imageUrl', 'photo', 'photoUrl', 'mainImage', 'images'],
  rating: ['rating', 'avgRating', 'ratingValue'],
  reviewsCount: ['reviewsCount', 'reviewsAmount', 'feedbackCount', 'commentsCount'],
  skuList: ['skuList', 'skus', 'skuDtoList', 'variants', 'items', 'skuInfoList'],

  skuId: ['skuId', 'id', 'skuID', 'sku_id'],
  // Moliyaviy javobda buyurtma pozitsiyasi "skuTitle" maydonida sotuvchi kodini
  // (masalan LOOTBOX-LBTSK20-ЧЕРН) yuboradi — katalogda ham shu kodni asosiy qilamiz
  // Katalogda sotuvchi kodi `skuFullTitle` da keladi (masalan "LOOTBOX-LBTSK20-ЧЕРН"),
  // moliyaviy javobda esa xuddi shu qiymat `skuTitle` maydonida bo'ladi — buyurtmalar
  // katalogga aynan shu kod orqali bog'lanadi.
  skuCode: ['skuFullTitle', 'sellerItemCode', 'article', 'sku', 'skuCode', 'vendorCode', 'skuTitle', 'barcode'],
  skuTitle: ['skuTitle', 'title', 'name', 'productTitle'],
  barcode: ['barcode', 'barCode', 'ean'],
  price: ['price', 'sellPrice', 'sellerPrice', 'currentPrice'],
  oldPrice: ['fullPrice', 'oldPrice', 'basePrice'],
  weight: ['weight', 'weightGr', 'grossWeight'],
  volume: ['volume', 'volumeL', 'volumeLiters'],

  amount: ['amount', 'quantity', 'qty', 'count', 'activeSkuAmount'],
  // Uzum katalogida (SkuForTable): quantityActive — FBO, quantityFbs — FBS
  fbo: ['quantityActive', 'fbo', 'fboAmount', 'fboQuantity'],
  fbs: ['quantityFbs', 'fbs', 'fbsAmount', 'fbsQuantity'],
  pending: ['quantityPending', 'pending'],
  purchasePrice: ['purchasePrice', 'costPrice', 'purchase_price'],
  commissionPct: ['commission', 'commissionPercent', 'commissionRate'],
  reserved: ['reserved', 'reservedAmount', 'reservedQuantity'],
  inTransit: ['inTransit', 'inWay', 'transitAmount', 'onTheWay'],

  orderId: ['orderId', 'id', 'orderID', 'order_id'],
  orderCode: ['orderNumber', 'code', 'orderCode', 'externalId'],
  scheme: ['scheme', 'deliveryType', 'deliveryScheme', 'orderScheme', 'type'],
  orderedAt: ['dateCreated', 'createdAt', 'orderDate', 'date', 'creationDate', 'created'],
  paidAt: ['datePaid', 'paidAt', 'paymentDate'],
  deliveredAt: ['dateDelivered', 'deliveredAt', 'deliveryDate', 'dateCompleted'],
  city: ['city', 'buyerCity', 'cityName', 'deliveryCity', 'regionName'],
  total: ['sellerPrice', 'totalAmount', 'totalPrice', 'amount', 'price', 'sum'],
  commission: ['commission', 'commissionAmount', 'fee', 'commissionValue'],
  logistics: ['deliveryCost', 'logistics', 'deliveryPrice', 'logisticsCost', 'deliveryAmount'],
  discount: ['discount', 'discountAmount', 'sellerDiscount'],
  orderItems: ['items', 'orderItems', 'products', 'skus', 'orderProducts'],
  qty: ['quantity', 'amount', 'qty', 'count'],

  payout: ['toWithdraw', 'sellerProfit', 'payout', 'withdrawAmount', 'profit'],

  returnId: ['returnId', 'id', 'returnID'],
  returnedAt: ['returnDate', 'returnedAt', 'date', 'createdAt', 'dateCreated'],
  reason: ['reason', 'returnReason', 'reasonName', 'comment'],

  expenseDate: ['date', 'createdAt', 'dateCreated', 'operationDate'],
  expenseAmount: ['amount', 'sum', 'value', 'price'],
  expenseSource: ['source', 'type', 'category', 'expenseType', 'operationType'],
  expenseNote: ['description', 'comment', 'note', 'title', 'name'],

  reviewId: ['reviewId', 'id', 'feedbackId'],
  reviewRating: ['rating', 'grade', 'stars', 'mark'],
  reviewText: ['text', 'comment', 'content', 'body'],
  reviewAuthor: ['author', 'customerName', 'userName', 'clientName'],
  reviewDate: ['publishedAt', 'createdAt', 'date', 'dateCreated'],
  reviewAnswer: ['answerText', 'answer', 'reply', 'sellerAnswer'],
  answered: ['answered', 'hasAnswer', 'isAnswered', 'replied'],
} as const;

// ─────────────────────────── Qiymatlarni moslashtirish ───────────────────────────

/**
 * Uzum buyurtma statusini bizning yagona ro'yxatimizga o'giradi
 * (`OrderStatus`: new | processing | delivered | canceled | returned).
 */
function mapOrderStatus(raw: string): string {
  const s = raw.toUpperCase();
  if (s.includes('RETURN')) return 'returned';
  if (s.includes('CANCEL')) return 'canceled';
  // TO_WITHDRAW — tovar mijozga topshirilgan, pul to'lovga tayyor (ya'ni yakunlangan sotuv)
  if (s === 'TO_WITHDRAW' || s === 'WITHDRAWN' || s.includes('WITHDRAW')) return 'delivered';
  if (s === 'DELIVERED' || s === 'COMPLETED' || s.includes('COMPLETE')) return 'delivered';
  if (s === 'CREATED' || s === 'NEW') return 'new';
  if (s === '') return 'delivered';
  // PACKING, PENDING_DELIVERY, DELIVERING, ACCEPTED_AT_DP, PROCESSING va boshqalar
  return 'processing';
}

/** Yetkazish sxemasi: FBS/DBS aniq ko'rsatilmasa — FBO */
function mapDeliveryType(raw: string): UzumDeliveryType {
  const s = raw.toUpperCase();
  if (s.includes('DBS')) return 'DBS';
  if (s.includes('FBS')) return 'FBS';
  return 'FBO';
}

/** Xarajat manbasini bizning kategoriyaga moslash */
const EXPENSE_RULES: ReadonlyArray<readonly [RegExp, UzumExpenseCategory]> = [
  [/commis|комисс|komiss/i, 'commission'],
  [/logist|deliver|достав|логист|yetkaz|shipping/i, 'logistics'],
  [/market|reklam|реклам|promo|advert|ads/i, 'marketing'],
  [/storage|хранен|склад|saqlash|ombor/i, 'storage'],
  [/tax|налог|soliq|ndfl|nds/i, 'tax'],
];

function mapExpenseCategory(source: string): UzumExpenseCategory {
  for (const [re, category] of EXPENSE_RULES) if (re.test(source)) return category;
  return 'other';
}

/** Rasm maydoni matn, obyekt yoki massiv bo'lishi mumkin */
function pickImage(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (Array.isArray(value)) {
    for (const item of value) {
      const url = pickImage(item);
      if (url) return url;
    }
    return '';
  }
  if (isRecord(value)) {
    return asString(firstOf(value, ['url', 'link', 'high', 'origin', 'image', 'photo']));
  }
  return '';
}

// ─────────────────────────── Klient ───────────────────────────

export class LiveUzumClient implements UzumClient {
  private readonly http: UzumHttp;

  constructor(opts: UzumClientOptions) {
    this.http = new UzumHttp({
      apiKey: opts.apiKey,
      baseUrl: opts.baseUrl,
      timeoutMs: opts.timeoutMs,
      maxRetries: opts.maxRetries,
      rpsLimit: opts.rpsLimit,
    });
  }

  // ─────────────── Kalitni tekshirish ───────────────

  /**
   * Eng yengil endpoint (`/v1/shops`) bilan kalitni tekshiradi.
   * Xatolik matni foydalanuvchiga ko'rsatiladigan darajada tushunarli bo'lishi shart.
   */
  async verify(): Promise<{ ok: boolean; message?: string }> {
    try {
      // Tekshiruv tez javob berishi kerak — ko'pi bilan bitta qayta urinish
      const retries = Math.min(1, this.http.retryCount);
      const payload = await this.http.get(uzumPath('shops'), undefined, { retries });
      const shops = pickList(payload, ['shops', 'organizations']);
      if (shops.length === 0) {
        return {
          ok: true,
          message: 'Kalit ishlayapti, lekin unga hech qanday do‘kon biriktirilmagan',
        };
      }
      return { ok: true, message: `Ulanish muvaffaqiyatli — ${shops.length} ta do‘kon topildi` };
    } catch (err) {
      const e = toUzumApiError(err);
      return { ok: false, message: uzumErrorMessage(e) };
    }
  }

  // ─────────────── Do'konlar ───────────────

  async getShops(): Promise<UzumShop[]> {
    try {
      const payload = await this.http.get(uzumPath('shops'));
      const rows = pickList(payload, ['shops', 'organizations']);
      const out: UzumShop[] = [];

      for (const raw of rows) {
        const r = asRecord(raw);
        const id = asString(firstOf(r, KEYS.shopId));
        if (!id) continue;
        out.push({
          id,
          title: asString(firstOf(r, KEYS.shopTitle)) || `Do‘kon ${id}`,
          status: asString(firstOf(r, KEYS.status), 'active'),
        });
      }

      return out;
    } catch (err) {
      this.warn('do‘konlar ro‘yxati', err);
      return [];
    }
  }

  // ─────────────── Mahsulotlar / SKU ───────────────

  async getProducts(shopId: string): Promise<UzumProduct[]> {
    try {
      const rows = await this.http.fetchAllPages(
        uzumPath('products', { shopId }),
        { filter: 'ALL', sortBy: 'DEFAULT', order: 'ASC' },
        (payload) => pickList(payload, ['productList', 'products', 'productViewList']),
        { size: UZUM_PAGE_LIMITS.products },
      );
      return this.normalizeProducts(rows);
    } catch (err) {
      this.warn(`mahsulotlar (shop ${shopId})`, err);
      return [];
    }
  }

  /**
   * Javob ikki xil ko'rinishda kelishi mumkin:
   *  a) mahsulot obyektlari, ichida `skuList[]`;
   *  b) tekis SKU satrlari (`productId` + `skuId` bir qatorda).
   * Ikkalasi ham qo'llab-quvvatlanadi — natija doimo mahsulot → SKU'lar daraxti.
   */
  private normalizeProducts(rows: unknown[]): UzumProduct[] {
    const byId = new Map<string, UzumProduct>();

    for (const raw of rows) {
      const r = asRecord(raw);
      const productId = asString(firstOf(r, KEYS.productId));
      const skuRows = asArray(firstOf(r, KEYS.skuList));

      const key = productId || asString(firstOf(r, KEYS.skuId));
      if (!key) continue;

      let product = byId.get(key);
      if (!product) {
        product = {
          id: key,
          title: asString(firstOf(r, KEYS.productTitle)) || `Mahsulot ${key}`,
          category: asString(firstOf(r, KEYS.category)) || undefined,
          brand: asString(firstOf(r, KEYS.brand)) || undefined,
          imageUrl: pickImage(firstOf(r, KEYS.image)) || undefined,
          status: asString(firstOf(r, KEYS.status), 'active'),
          rating: asNumber(firstOf(r, KEYS.rating)),
          reviewsCount: Math.round(asNumber(firstOf(r, KEYS.reviewsCount))),
          skus: [],
        };
        byId.set(key, product);
      }

      if (skuRows.length > 0) {
        for (const skuRaw of skuRows) {
          const sku = this.toSku(asRecord(skuRaw), product);
          if (sku) product.skus.push(sku);
        }
      } else {
        // Tekis satr — mahsulot ma'lumoti bilan bitta SKU
        const sku = this.toSku(r, product);
        if (sku) product.skus.push(sku);
      }
    }

    // SKU'siz mahsulot bizga foydasiz (narx va qoldiq SKU darajasida)
    return [...byId.values()].filter((p) => p.skus.length > 0);
  }

  private toSku(r: Record<string, unknown>, product: UzumProduct): UzumSku | null {
    const id = asString(firstOf(r, KEYS.skuId));
    if (!id) return null;

    const code = asString(firstOf(r, KEYS.skuCode)) || id;
    const title = asString(firstOf(r, KEYS.skuTitle)) || product.title;
    const imageUrl = pickImage(firstOf(r, KEYS.image)) || product.imageUrl;

    return {
      id,
      sku: code,
      barcode: asString(firstOf(r, KEYS.barcode)) || undefined,
      title,
      imageUrl: imageUrl || undefined,
      price: asMoney(firstOf(r, KEYS.price)),
      oldPrice: asMoney(firstOf(r, KEYS.oldPrice)) || undefined,
      weightGr: asNumber(firstOf(r, KEYS.weight)) || undefined,
      volumeL: asNumber(firstOf(r, KEYS.volume)) || undefined,
      // Uzum katalogi qoldiqni ham qaytaradi — FBO uchun asosiy manba shu
      quantityFbo: Math.round(asNumber(firstOf(r, KEYS.fbo))),
      quantityFbs: Math.round(asNumber(firstOf(r, KEYS.fbs))),
      reserved: Math.round(asNumber(firstOf(r, KEYS.pending))),
      purchasePrice: asMoney(firstOf(r, KEYS.purchasePrice)) || undefined,
      commissionPct: asNumber(firstOf(r, KEYS.commissionPct)) || undefined,
    };
  }

  // ─────────────── Qoldiqlar ───────────────

  /**
   * `/v3/fbs/sku/stocks` — sahifalangan (size<=100).
   * TODO(uzum): tekshirish — endpoint butun kabinet bo'yicha qaytaradi, do'kon filtri yo'q.
   * FBO/FBS ajratmasi topilmasa, butun miqdor FBS deb yoziladi.
   */
  /**
   * Qoldiqlar.
   *
   * MUHIM: `/v3/fbs/sku/stocks` faqat FBS (o'z ombori) qoldiqlarini qaytaradi.
   * FBO — ya'ni Uzum omboridagi asosiy qoldiq — mahsulot katalogidagi
   * `quantityActive` maydonida keladi. Shuning uchun asosiy manba katalog,
   * FBS raqamlari esa maxsus endpoint bilan aniqlashtiriladi.
   */
  async getStocks(shopId: string): Promise<UzumStock[]> {
    const today = new Date().toISOString().slice(0, 10);
    const bySku = new Map<string, UzumStock>();

    // 1) Katalogdan — FBO va FBS
    try {
      const products = await this.getProducts(shopId);
      for (const p of products) {
        for (const s of p.skus) {
          bySku.set(s.id, {
            skuId: s.id,
            fbo: Math.max(0, s.quantityFbo ?? 0),
            fbs: Math.max(0, s.quantityFbs ?? 0),
            reserved: Math.max(0, s.reserved ?? 0),
            inTransit: 0,
            date: today,
          });
        }
      }
    } catch (err) {
      this.warn(`katalogdan qoldiqlar (shop ${shopId})`, err);
    }

    // 2) FBS endpointi — mavjud bo'lsa FBS raqamini aniqlashtiramiz
    try {
      const rows = await this.http.fetchAllPages(
        uzumPath('stocks'),
        {},
        (payload) => pickList(payload, ['stocks', 'skuStocks', 'skuList', 'skuAmountList']),
        { size: UZUM_PAGE_LIMITS.stocks },
      );

      for (const raw of rows) {
        const r = asRecord(raw);
        const skuId = asString(firstOf(r, KEYS.skuId));
        if (!skuId) continue;

        const fbsRaw = Math.round(asNumber(firstOf(r, KEYS.fbs)));
        const total = Math.round(asNumber(firstOf(r, KEYS.amount)));
        const fbs = fbsRaw > 0 ? fbsRaw : Math.max(0, total);
        const reserved = Math.round(asNumber(firstOf(r, KEYS.reserved)));
        const inTransit = Math.round(asNumber(firstOf(r, KEYS.inTransit)));

        const cur = bySku.get(skuId);
        if (cur) {
          if (fbs > 0) cur.fbs = fbs;
          if (reserved > 0) cur.reserved = reserved;
          if (inTransit > 0) cur.inTransit = inTransit;
        } else {
          bySku.set(skuId, { skuId, fbo: 0, fbs, reserved, inTransit, date: today });
        }
      }
    } catch (err) {
      this.warn(`FBS qoldiqlari (shop ${shopId})`, err);
    }

    return [...bySku.values()];
  }

  /**
   * Buyurtmalar.
   *
   * Asosiy manba — `/v1/finance/orders`: u FBO, FBS va DBS sxemalarining HAMMASINI
   * qamrab oladi va pul ko'rsatkichlarini beradi (`/v2/fbs/orders` faqat FBS/DBS).
   *
   * DIQQAT: bu endpointda `dateFrom`/`dateTo` — Unix vaqti SEKUNDDA
   * (millisekundda yuborilsa bo'sh natija qaytaradi), javobdagi `date` esa millisekundda.
   */
  async getOrders(shopId: string, from: Date, to: Date): Promise<UzumOrder[]> {
    const dateFrom = Math.floor(from.getTime() / 1000);
    const dateTo = Math.ceil(to.getTime() / 1000);

    const orders = new Map<string, UzumOrder>();

    // 1) Moliyaviy pozitsiyalar — buyurtma raqami bo'yicha guruhlanadi
    let rows: unknown[] = [];
    try {
      rows = await this.http.fetchAllPages(
        uzumPath('financeOrders'),
        { shopIds: shopId, dateFrom, dateTo, group: false },
        (payload) => pickList(payload, ['orderItems', 'orders', 'financeOrders']),
        { size: UZUM_PAGE_LIMITS.financeOrders },
      );
    } catch (err) {
      this.warn(`moliyaviy buyurtmalar (shop ${shopId})`, err);
    }

    for (const raw of rows) {
      const r = asRecord(raw);
      const orderId = asString(r.orderId) || asString(r.id);
      if (!orderId) continue;

      const code = asString(r.skuTitle);
      const productId = asString(r.productId);
      const qty = Math.round(asNumber(r.amount));
      const returnedQty = Math.round(asNumber(r.amountReturns));
      const sellPrice = asMoney(r.sellPrice);
      const commission = asMoney(r.commission);
      const payoutRaw = asMoney(r.sellerProfit);
      // Uzum `logisticDeliveryFee` ni ko'pincha 0 yuboradi, lekin yetkazish to'lovi
      // `sellerProfit` dan ayrilgan bo'ladi. Pul ayniyati aniq qiymatni beradi:
      //   tushum − komissiya − yetkazish = sellerProfit
      const logisticsRaw = asMoney(r.logisticDeliveryFee);
      const qtyForCalc = Math.round(asNumber(r.amount));
      const derivedLogistics =
        payoutRaw > 0 && qtyForCalc > 0
          ? Math.max(0, asMoney(r.sellPrice) * qtyForCalc - asMoney(r.commission) - payoutRaw)
          : 0;
      const logistics = logisticsRaw > 0 ? logisticsRaw : derivedLogistics;
      const payout = payoutRaw;
      const purchasePrice = asMoney(r.purchasePrice);
      const status = mapOrderStatus(asString(r.status));
      const orderedAt = asIso(r.date, new Date().toISOString());
      const deliveredAt = asNumber(r.dateIssued) > 0 ? asIso(r.dateIssued, '') : undefined;

      const item: UzumOrderItem = {
        skuId: code || productId || orderId,
        skuCode: code || undefined,
        title: asString(r.productTitle) || undefined,
        qty: Math.max(qty, 0),
        sellPrice,
        commission,
        logistics,
        status: returnedQty > 0 && qty === 0 ? 'returned' : status,
        returnedQty,
        payout,
        purchasePrice: purchasePrice || undefined,
        productId: productId || undefined,
      };

      const existing = orders.get(orderId);
      if (existing) {
        existing.items.push(item);
        existing.totalAmount += sellPrice * Math.max(qty, 0);
        existing.commission = (existing.commission ?? 0) + commission;
        existing.logistics = (existing.logistics ?? 0) + logistics;
      } else {
        orders.set(orderId, {
          id: orderId,
          shopId,
          status,
          // Sxema keyingi bosqichda aniqlanadi; moliyada bor-u FBS ro'yxatida yo'q — demak FBO
          deliveryType: 'FBO',
          orderedAt,
          deliveredAt: deliveredAt || undefined,
          totalAmount: sellPrice * Math.max(qty, 0),
          commission,
          logistics,
          discount: 0,
          items: [item],
        });
      }
    }

    // 2) FBS/DBS ro'yxati — sxemani va shahar ma'lumotini aniqlashtirish uchun
    try {
      const fbsRows = await this.http.fetchAllPages(
        uzumPath('orders'),
        { shopIds: shopId, dateFrom, dateTo },
        (payload) => pickList(payload, ['orders', 'orderList']),
        { size: UZUM_PAGE_LIMITS.orders },
      );

      for (const raw of fbsRows) {
        const r = asRecord(raw);
        const id = asString(firstOf(r, KEYS.orderId));
        if (!id) continue;

        const scheme = mapDeliveryType(asString(firstOf(r, KEYS.scheme)));
        const city = asString(firstOf(r, KEYS.city)) || undefined;

        const existing = orders.get(id);
        if (existing) {
          // Bu ro'yxatda faqat FBS va DBS bo'ladi — sxemani aniqlashtiramiz
          existing.deliveryType = scheme === 'FBO' ? 'FBS' : scheme;
          if (city) existing.buyerCity = city;
          continue;
        }

        // Moliyada hali ko'rinmagan (yangi) FBS buyurtmasi
        const itemRows = asArray(firstOf(r, KEYS.orderItems));
        const items: UzumOrderItem[] = itemRows.map((rawItem) => {
          const i = asRecord(rawItem);
          return {
            skuId:
              asString(firstOf(i, KEYS.skuCode)) ||
              asString(firstOf(i, KEYS.skuId)) ||
              id,
            skuCode: asString(firstOf(i, KEYS.skuCode)) || undefined,
            title: asString(firstOf(i, KEYS.skuTitle)) || undefined,
            qty: Math.max(1, Math.round(asNumber(firstOf(i, KEYS.qty), 1))),
            sellPrice: asMoney(firstOf(i, KEYS.price)),
            commission: asMoney(firstOf(i, KEYS.commission)),
            logistics: asMoney(firstOf(i, KEYS.logistics)),
          };
        });

        orders.set(id, {
          id,
          shopId,
          status: mapOrderStatus(asString(firstOf(r, KEYS.status))),
          deliveryType: scheme === 'FBO' ? 'FBS' : scheme,
          orderedAt: asIso(firstOf(r, KEYS.orderedAt), new Date().toISOString()),
          buyerCity: city,
          totalAmount: asMoney(firstOf(r, KEYS.total)),
          commission: 0,
          logistics: 0,
          discount: asMoney(firstOf(r, KEYS.discount)),
          items,
        });
      }
    } catch (err) {
      this.warn(`FBS buyurtmalari (shop ${shopId})`, err);
    }

    return [...orders.values()].filter((o) => inRange(o.orderedAt, from, to));
  }

  async getReturns(shopId: string, from: Date, to: Date): Promise<UzumReturn[]> {
    const rows = await this.tryPages(
      [
        { path: uzumPath('shopReturns', { shopId }), query: {} },
        { path: uzumPath('returns'), query: { shopIds: shopId } },
      ],
      ['returns', 'returnList'],
      UZUM_PAGE_LIMITS.returns,
      `qaytarishlar (shop ${shopId})`,
    );

    const out: UzumReturn[] = [];
    const fallbackIso = new Date().toISOString();

    for (const raw of rows) {
      const r = asRecord(raw);
      const docId = asString(firstOf(r, KEYS.returnId));
      const returnedAt = asIso(firstOf(r, KEYS.returnedAt), fallbackIso);
      if (!inRange(returnedAt, from, to)) continue;

      const reason = asString(firstOf(r, KEYS.reason)) || undefined;
      const orderCode = asString(firstOf(r, KEYS.orderCode)) || undefined;
      const items = asArray(firstOf(r, KEYS.orderItems));

      if (items.length === 0) {
        const skuId = asString(firstOf(r, KEYS.skuId));
        if (!skuId && !docId) continue;
        out.push({
          id: docId || `${skuId}-${returnedAt}`,
          skuId,
          orderCode,
          qty: Math.max(1, Math.round(asNumber(firstOf(r, KEYS.qty), 1))),
          amount: asMoney(firstOf(r, KEYS.total)),
          reason,
          returnedAt,
        });
        continue;
      }

      let index = 0;
      for (const itemRaw of items) {
        const it = asRecord(itemRaw);
        const skuId = asString(firstOf(it, KEYS.skuId));
        if (!skuId) continue;
        const qty = Math.max(1, Math.round(asNumber(firstOf(it, KEYS.qty), 1)));
        out.push({
          id: `${docId || 'return'}-${index}`,
          skuId,
          orderCode,
          qty,
          amount: asMoney(firstOf(it, KEYS.total)) || asMoney(firstOf(it, KEYS.price)) * qty,
          reason: asString(firstOf(it, KEYS.reason)) || reason,
          returnedAt,
        });
        index += 1;
      }
    }

    return out;
  }

  // ─────────────── Yo'qotishlar ───────────────

  /**
   * Marketpleys aybi bilan yo'qolgan/shikastlangan tovarlar uchun seller OpenAPI'da
   * alohida endpoint YO'Q (`docs/UZUM-API.md` 2.9). Ma'lumot topilmagani uchun bo'sh massiv.
   * TODO(uzum): kabinet ichidagi kengaytirilgan spec'da tekshirish.
   */
  async getLosses(_shopId: string, _from: Date, _to: Date): Promise<UzumLoss[]> {
    return [];
  }

  // ─────────────── Pullik saqlash ───────────────

  /**
   * Alohida endpoint yo'q — `/v1/finance/expenses` dagi "saqlash" manbali satrlardan yig'iladi.
   */
  async getStorageFees(shopId: string, from: Date, to: Date): Promise<UzumStorageFee[]> {
    const rows = await this.rawExpenses(shopId, from, to);
    const out: UzumStorageFee[] = [];
    const fallbackIso = new Date().toISOString();

    for (const raw of rows) {
      const r = asRecord(raw);
      const source = asString(firstOf(r, KEYS.expenseSource)) + ' ' + asString(firstOf(r, KEYS.expenseNote));
      if (mapExpenseCategory(source) !== 'storage') continue;

      const date = asIso(firstOf(r, KEYS.expenseDate), fallbackIso);
      if (!inRange(date, from, to)) continue;

      out.push({
        skuId: asString(firstOf(r, KEYS.skuId)),
        date: date.slice(0, 10),
        qty: Math.round(asNumber(firstOf(r, KEYS.qty))),
        volumeL: asNumber(firstOf(r, KEYS.volume)),
        amount: Math.abs(asMoney(firstOf(r, KEYS.expenseAmount))),
      });
    }

    return out;
  }

  // ─────────────── Sharhlar ───────────────

  /**
   * Seller OpenAPI'da sharh endpointi topilmagan (`confidence: guess`).
   * Yo'l sinab ko'riladi; xato bo'lsa — bo'sh massiv (sinxronizatsiya to'xtamaydi).
   */
  async getReviews(shopId: string, from: Date, to: Date): Promise<UzumReview[]> {
    let rows: unknown[] = [];
    try {
      rows = await this.http.fetchAllPages(
        uzumPath('reviews'),
        { shopIds: shopId },
        (payload) => pickList(payload, ['reviews', 'feedbacks', 'comments']),
        { size: UZUM_PAGE_LIMITS.default, retries: 0 },
      );
    } catch {
      // Endpoint mavjud emas — bu kutilgan holat, ogohlantirish ham chiqarmaymiz
      return [];
    }

    const out: UzumReview[] = [];
    const fallbackIso = new Date().toISOString();

    for (const raw of rows) {
      const r = asRecord(raw);
      const id = asString(firstOf(r, KEYS.reviewId));
      if (!id) continue;

      const publishedAt = asIso(firstOf(r, KEYS.reviewDate), fallbackIso);
      if (!inRange(publishedAt, from, to)) continue;

      const answerText = asString(firstOf(r, KEYS.reviewAnswer));
      out.push({
        id,
        productId: asString(firstOf(r, KEYS.productId)) || undefined,
        skuId: asString(firstOf(r, KEYS.skuId)) || undefined,
        rating: Math.min(5, Math.max(1, Math.round(asNumber(firstOf(r, KEYS.reviewRating), 5)))),
        text: asString(firstOf(r, KEYS.reviewText)) || undefined,
        author: asString(firstOf(r, KEYS.reviewAuthor)) || undefined,
        publishedAt,
        answered: asBool(firstOf(r, KEYS.answered), answerText.length > 0),
        answerText: answerText || undefined,
      });
    }

    return out;
  }

  async replyReview(_shopId: string, reviewId: string, text: string): Promise<boolean> {
    if (!reviewId || !text.trim()) return false;
    try {
      await this.http.post(uzumPath('reviewReply', { reviewId }), { text }, undefined, {
        retries: 0,
      });
      return true;
    } catch {
      // Endpoint mavjud emas yoki ruxsat yo'q — javob yozilmadi
      return false;
    }
  }

  // ─────────────── Xarajatlar ───────────────

  /**
   * Uzum "Xizmatlarga to'lov" bo'limi (`/v1/finance/expenses`).
   *
   * Haqiqiy javob maydonlari:
   *   name, source ("Logistika" | "Marketing" | ...), code, paymentPrice,
   *   dateService / dateCreated (ms), type ("OUTCOME" — xarajat, "INCOME" — qaytarish)
   *
   * `code` xarajat turini aniq ko'rsatadi:
   *   logistics-volume         — buyurtmani mijozga yetkazish (har bir buyurtma uchun)
   *   return-logistics-volume  — qaytarilganda o'sha to'lovning qaytarilishi (INCOME)
   *   У000101                  — omborga yetkazib berish (sotuvchining yuk jo'natmasi)
   *   У000120                  — reklama / "Buyurtmalarni ko'paytirish"
   *
   * INCOME satrlari MANFIY summa bilan yoziladi — shunda yig'indi Uzumning
   * "Oylik xizmatlar to'lovi" raqami bilan aynan mos tushadi.
   */
  async getExpenses(shopId: string, from: Date, to: Date): Promise<UzumExpense[]> {
    const rows = await this.rawExpenses(shopId, from, to);
    const out: UzumExpense[] = [];
    const fallbackIso = new Date().toISOString();

    for (const raw of rows) {
      const r = asRecord(raw);

      const name = asString(r.name) || asString(firstOf(r, KEYS.expenseNote));
      const source = asString(r.source) || asString(firstOf(r, KEYS.expenseSource));
      const code = asString(r.code);
      const kind = asString(r.type).toUpperCase();

      const category = mapExpenseCategory(`${source} ${code} ${name}`);

      /**
       * Har bir buyurtma uchun mijozga yetkazish to'lovi (va uning qaytarilishi)
       * Uzumning `sellerProfit` ("yechib olish uchun") summasida ALLAQACHON ayrilgan.
       * Uni yana xarajat sifatida yozsak, ikki marta hisoblangan bo'lardi —
       * saytdagi logistika Uzumdagidan katta chiqardi.
       *
       * Buyurtmaga bog'langan satrni uch belgidan biri bilan aniqlaymiz:
       *  • kod `logistics-volume` / `return-logistics-volume`,
       *  • satrda buyurtma raqami bor ("Buyurtma № 128132890 uchun logistika ..."),
       *  • javobda buyurtma identifikatori maydoni bor.
       *
       * Omborga yetkazish ("Logistika xizmatlari uchun to'lov") buyurtmaga
       * bog'lanmagani uchun saqlanadi — u haqiqiy davr xarajati.
       */
      const orderRef =
        asString(r.orderId) || asString(r.orderNumber) || asString(r.orderCode) || asString(r.orderIds);
      const mentionsOrder = /(buyurtma|заказ|order)\s*(?:№|#|no\.?)?\s*\d{3,}/i.test(`${name} ${source}`);
      const perOrderLogistics =
        /^(return-)?logistics-volume$/i.test(code) ||
        (category === 'logistics' && (Boolean(orderRef) || mentionsOrder));
      if (perOrderLogistics) continue;
      // Saqlash to'lovlari alohida (`getStorageFees`) yig'iladi — ikki marta hisoblamaymiz
      if (category === 'storage') continue;

      const date = asIso(r.dateService ?? r.dateCreated ?? firstOf(r, KEYS.expenseDate), fallbackIso);
      if (!inRange(date, from, to)) continue;

      const raw$ = asMoney(r.paymentPrice ?? firstOf(r, KEYS.expenseAmount));
      if (raw$ === 0) continue;

      // Qaytarilgan to'lov — xarajatni kamaytiradi
      const amount = kind === 'INCOME' ? -Math.abs(raw$) : Math.abs(raw$);

      out.push({
        date: date.slice(0, 10),
        category,
        amount,
        note: name || source || undefined,
      });
    }

    return out;
  }


  // ─────────────── Ichki yordamchilar ───────────────

  /**
   * `/v1/finance/expenses` xom satrlari (bir necha metod uchun umumiy).
   * Sana — `/v1/finance/orders` dagi kabi Unix vaqti SEKUNDDA.
   */
  private async rawExpenses(shopId: string, from: Date, to: Date): Promise<unknown[]> {
    try {
      return await this.http.fetchAllPages(
        uzumPath('financeExpenses'),
        {
          shopIds: shopId,
          dateFrom: Math.floor(from.getTime() / 1000),
          dateTo: Math.ceil(to.getTime() / 1000),
        },
        (payload) => pickList(payload, ['expenses', 'payments', 'paymentInfoList']),
        { size: UZUM_PAGE_LIMITS.financeExpenses },
      );
    } catch (err) {
      this.warn(`xarajatlar (shop ${shopId})`, err);
      return [];
    }
  }

  /** Bir necha yo'lni navbat bilan sinaydi — birinchi ishlagani natija beradi */
  private async tryPages(
    variants: ReadonlyArray<{ path: string; query: UzumQuery }>,
    listKeys: readonly string[],
    size: number,
    label: string,
  ): Promise<unknown[]> {
    for (const variant of variants) {
      try {
        const rows = await this.http.fetchAllPages(
          variant.path,
          variant.query,
          (payload) => pickList(payload, listKeys),
          { size },
        );
        if (rows.length > 0) return rows;
      } catch (err) {
        this.warn(`${label} — ${variant.path}`, err);
      }
    }
    return [];
  }

  /** Xatolarni jurnalga yozamiz, lekin oqimni to'xtatmaymiz */
  private warn(what: string, err: unknown): void {
    const e = toUzumApiError(err);
    // eslint-disable-next-line no-console
    console.warn(`[uzum] ${what}: ${e.code} — ${e.message}`);
  }
}
