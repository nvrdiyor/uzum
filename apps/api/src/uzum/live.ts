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
  skuCode: ['skuTitle', 'sku', 'skuCode', 'article', 'vendorCode', 'barcode'],
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
  if (s === 'DELIVERED' || s === 'COMPLETED' || s.includes('COMPLETE')) return 'delivered';
  if (s === 'CREATED' || s === 'NEW') return 'new';
  if (s === '') return 'delivered';
  // PACKING, PENDING_DELIVERY, DELIVERING, ACCEPTED_AT_DP va boshqalar
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

  async getOrders(shopId: string, from: Date, to: Date): Promise<UzumOrder[]> {
    const orders = new Map<string, UzumOrder>();
    const dateFrom = from.getTime();
    const dateTo = to.getTime();

    for (const status of UZUM_ORDER_STATUSES) {
      try {
        const rows = await this.http.fetchAllPages(
          uzumPath('orders'),
          { shopIds: shopId, status, dateFrom, dateTo },
          (payload) => pickList(payload, ['orders', 'orderList']),
          { size: UZUM_PAGE_LIMITS.orders },
        );
        for (const raw of rows) {
          const order = this.toOrder(asRecord(raw), shopId);
          if (order) orders.set(order.id, order);
        }
      } catch (err) {
        this.warn(`buyurtmalar (${status}, shop ${shopId})`, err);
      }
    }

    try {
      await this.mergeFinanceOrders(orders, shopId, dateFrom, dateTo);
    } catch (err) {
      this.warn(`moliyaviy buyurtmalar (shop ${shopId})`, err);
    }

    return [...orders.values()].filter((o) => inRange(o.orderedAt, from, to));
  }

  private toOrder(r: Record<string, unknown>, shopId: string): UzumOrder | null {
    const id = asString(firstOf(r, KEYS.orderId)) || asString(firstOf(r, KEYS.orderCode));
    if (!id) return null;

    const fallbackIso = new Date().toISOString();
    const items: UzumOrderItem[] = [];
    for (const raw of asArray(firstOf(r, KEYS.orderItems))) {
      const item = this.toOrderItem(asRecord(raw));
      if (item) items.push(item);
    }

    const itemsTotal = items.reduce((sum, it) => sum + it.sellPrice * it.qty, 0);
    const total = asMoney(firstOf(r, KEYS.total)) || itemsTotal;

    return {
      id,
      shopId: asString(firstOf(r, ['shopId', 'shopID']), shopId) || shopId,
      status: mapOrderStatus(asString(firstOf(r, KEYS.status))),
      deliveryType: mapDeliveryType(asString(firstOf(r, KEYS.scheme))),
      orderedAt: asIso(firstOf(r, KEYS.orderedAt), fallbackIso),
      paidAt: optionalIso(firstOf(r, KEYS.paidAt)),
      deliveredAt: optionalIso(firstOf(r, KEYS.deliveredAt)),
      buyerCity: asString(firstOf(r, KEYS.city)) || undefined,
      totalAmount: total,
      commission: asMoney(firstOf(r, KEYS.commission)),
      logistics: asMoney(firstOf(r, KEYS.logistics)),
      discount: asMoney(firstOf(r, KEYS.discount)),
      items,
    };
  }

  private toOrderItem(r: Record<string, unknown>): UzumOrderItem | null {
    const skuId = asString(firstOf(r, KEYS.skuId));
    if (!skuId) return null;
    const qty = Math.max(1, Math.round(asNumber(firstOf(r, KEYS.qty), 1)));

    return {
      skuId,
      skuCode: asString(firstOf(r, KEYS.skuCode)) || undefined,
      title: asString(firstOf(r, KEYS.skuTitle)) || undefined,
      qty,
      sellPrice: asMoney(firstOf(r, KEYS.price)),
      commission: asMoney(firstOf(r, KEYS.commission)) || undefined,
      logistics: asMoney(firstOf(r, KEYS.logistics)) || undefined,
      status: asString(firstOf(r, KEYS.status)) || undefined,
    };
  }

  /**
   * `/v1/finance/orders` satrlari bilan buyurtmalarni boyitadi.
   * Mos buyurtma topilmasa — bu FBO sotuvi, alohida buyurtma sifatida qo'shiladi.
   */
  private async mergeFinanceOrders(
    orders: Map<string, UzumOrder>,
    shopId: string,
    dateFrom: number,
    dateTo: number,
  ): Promise<void> {
    const rows = await this.http.fetchAllPages(
      uzumPath('financeOrders'),
      { shopIds: shopId, dateFrom, dateTo, group: false },
      (payload) => pickList(payload, ['orders', 'financeOrders', 'orderItems']),
      { size: UZUM_PAGE_LIMITS.financeOrders },
    );

    const fallbackIso = new Date().toISOString();

    for (const raw of rows) {
      const r = asRecord(raw);
      const orderId = asString(firstOf(r, KEYS.orderId));
      if (!orderId) continue;

      const skuId = asString(firstOf(r, KEYS.skuId));
      const qty = Math.max(1, Math.round(asNumber(firstOf(r, KEYS.qty), 1)));
      const sellPrice = asMoney(firstOf(r, KEYS.price));
      const commission = asMoney(firstOf(r, KEYS.commission));
      const logistics = asMoney(firstOf(r, KEYS.logistics));

      const existing = orders.get(orderId);

      if (!existing) {
        // Moliyada bor, buyurtmalar ro'yxatida yo'q → FBO sotuvi
        orders.set(orderId, {
          id: orderId,
          shopId,
          status: mapOrderStatus(asString(firstOf(r, KEYS.status))),
          deliveryType: mapDeliveryType(asString(firstOf(r, KEYS.scheme))),
          orderedAt: asIso(firstOf(r, KEYS.orderedAt), fallbackIso),
          buyerCity: asString(firstOf(r, KEYS.city)) || undefined,
          totalAmount: sellPrice * qty,
          commission,
          logistics,
          discount: asMoney(firstOf(r, KEYS.discount)),
          items: skuId
            ? [
                {
                  skuId,
                  skuCode: asString(firstOf(r, KEYS.skuCode)) || undefined,
                  title: asString(firstOf(r, KEYS.skuTitle)) || undefined,
                  qty,
                  sellPrice,
                  commission,
                  logistics,
                },
              ]
            : [],
        });
        continue;
      }

      // Mavjud buyurtmani moliyaviy raqamlar bilan to'ldiramiz
      existing.commission = (existing.commission ?? 0) + commission;
      existing.logistics = (existing.logistics ?? 0) + logistics;
      if (existing.totalAmount === 0) existing.totalAmount = sellPrice * qty;

      if (!skuId) continue;
      const item = existing.items.find((it) => it.skuId === skuId);
      if (item) {
        if (item.sellPrice === 0) item.sellPrice = sellPrice;
        item.commission = (item.commission ?? 0) + commission;
        item.logistics = (item.logistics ?? 0) + logistics;
      } else {
        existing.items.push({
          skuId,
          skuCode: asString(firstOf(r, KEYS.skuCode)) || undefined,
          title: asString(firstOf(r, KEYS.skuTitle)) || undefined,
          qty,
          sellPrice,
          commission,
          logistics,
        });
      }
    }
  }

  // ─────────────── Qaytarishlar ───────────────

  /**
   * Avval do'kon bo'yicha (`/v1/shop/{shopId}/return`), u ishlamasa umumiy
   * (`/v1/return`) endpoint sinaladi. Hujjat ichida tovarlar ro'yxati bo'lsa — yoyiladi.
   */
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

  async getExpenses(shopId: string, from: Date, to: Date): Promise<UzumExpense[]> {
    const rows = await this.rawExpenses(shopId, from, to);
    const out: UzumExpense[] = [];
    const fallbackIso = new Date().toISOString();

    for (const raw of rows) {
      const r = asRecord(raw);
      const note = asString(firstOf(r, KEYS.expenseNote));
      const source = asString(firstOf(r, KEYS.expenseSource));
      const category = mapExpenseCategory(`${source} ${note}`);
      // Saqlash to'lovlari alohida (`getStorageFees`) yig'iladi — ikki marta hisoblamaymiz
      if (category === 'storage') continue;

      const date = asIso(firstOf(r, KEYS.expenseDate), fallbackIso);
      if (!inRange(date, from, to)) continue;

      const amount = Math.abs(asMoney(firstOf(r, KEYS.expenseAmount)));
      if (amount === 0) continue;

      out.push({
        date: date.slice(0, 10),
        category,
        amount,
        note: note || source || undefined,
      });
    }

    return out;
  }

  // ─────────────── Ichki yordamchilar ───────────────

  /** `/v1/finance/expenses` xom satrlari (bir necha metod uchun umumiy) */
  private async rawExpenses(shopId: string, from: Date, to: Date): Promise<unknown[]> {
    try {
      return await this.http.fetchAllPages(
        uzumPath('financeExpenses'),
        { shopIds: shopId, dateFrom: from.getTime(), dateTo: to.getTime() },
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
