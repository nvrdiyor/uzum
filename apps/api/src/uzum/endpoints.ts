/**
 * Uzum Seller OpenAPI yo'llari — bitta joyda.
 *
 * Manba: `https://api-seller.uzum.uz/api/seller-openapi/swagger/api-docs`
 * (`docs/UZUM-API.md` da batafsil). Base URL — `env.uzum.baseUrl`.
 *
 * Har bir yozuvda `confidence` (ishonch darajasi) ko'rsatilgan:
 *  - `confirmed` — rasmiy OpenAPI hujjatida aynan shunday yozilgan;
 *  - `likely`    — bir necha manbada mos keladi, lekin sxemadan tasdiqlanmagan;
 *  - `guess`     — taxmin, real kalit bilan tekshirish shart.
 *
 * Real hujjat o'zgarsa — **faqat shu faylni** tahrirlash kifoya.
 */

export type UzumHttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

/** Endpoint yo'lining ishonchlilik darajasi */
export type UzumEndpointConfidence = 'confirmed' | 'likely' | 'guess';

export interface UzumEndpointDef {
  method: UzumHttpMethod;
  /** Base URL'ga nisbatan yo'l; `{shopId}` kabi o'rin egallovchilar bo'lishi mumkin */
  path: string;
  confidence: UzumEndpointConfidence;
  /** Qisqacha izoh (o'zbekcha) */
  note?: string;
}

export const UZUM_ENDPOINTS = {
  // ─────────── Do'konlar ───────────
  /** Kalitga ruxsat berilgan do'konlar ro'yxati */
  shops: { method: 'GET', path: '/v1/shops', confidence: 'confirmed', note: "Do'konlar ro'yxati" },

  // ─────────── Mahsulotlar / SKU ───────────
  /** `page` va `size` MAJBURIY (page 0 dan boshlanadi) */
  products: {
    method: 'GET',
    path: '/v1/product/shop/{shopId}',
    confidence: 'confirmed',
    note: "Mahsulot/SKU ro'yxati; page va size majburiy",
  },
  priceUpdate: {
    method: 'POST',
    path: '/v1/product/{shopId}/sendPriceData',
    confidence: 'confirmed',
    note: "Narxlarni yangilash (biz o'qish rejimida ishlatmaymiz)",
  },

  // ─────────── Qoldiqlar ───────────
  /** Joriy versiya; `size` maksimal 100, `skuIdFrom` kursor sifatida ishlaydi */
  stocks: {
    method: 'GET',
    path: '/v3/fbs/sku/stocks',
    confidence: 'confirmed',
    note: 'SKU qoldiqlari (sahifalangan, size<=100)',
  },
  stocksLegacy: {
    method: 'GET',
    path: '/v2/fbs/sku/stocks',
    confidence: 'confirmed',
    note: 'Eskirgan (deprecated) — zaxira variant',
  },
  stockUpdate: {
    method: 'POST',
    path: '/v2/fbs/sku/stocks',
    confidence: 'confirmed',
    note: 'Qoldiqni yangilash (bizga kerak emas)',
  },

  // ─────────── Buyurtmalar (FBS/DBS) ───────────
  /** `shopIds` MAJBURIY; `status` standart `CREATED` — barcha statuslarni alohida so'rash kerak */
  orders: {
    method: 'GET',
    path: '/v2/fbs/orders',
    confidence: 'confirmed',
    note: "Buyurtmalar ro'yxati; shopIds majburiy",
  },
  ordersCount: { method: 'GET', path: '/v2/fbs/orders/count', confidence: 'confirmed' },
  order: { method: 'GET', path: '/v1/fbs/order/{orderId}', confidence: 'confirmed' },
  orderConfirm: { method: 'POST', path: '/v1/fbs/order/{orderId}/confirm', confidence: 'confirmed' },
  orderCancel: { method: 'POST', path: '/v1/fbs/order/{orderId}/cancel', confidence: 'confirmed' },
  orderIdentifier: {
    method: 'POST',
    path: '/v1/fbs/order/{orderId}/identifier',
    confidence: 'confirmed',
  },
  /** `size` MAJBURIY (standart `LARGE`) */
  orderLabels: {
    method: 'GET',
    path: '/v1/fbs/order/{orderId}/labels/print',
    confidence: 'confirmed',
    note: 'size majburiy (LARGE/SMALL)',
  },
  returnReasons: { method: 'GET', path: '/v1/fbs/order/return-reasons', confidence: 'confirmed' },

  // ─────────── DBS ───────────
  dbsDelivering: {
    method: 'POST',
    path: '/v1/dbs/order/{orderId}/delivering',
    confidence: 'confirmed',
  },
  dbsCompleted: {
    method: 'POST',
    path: '/v1/dbs/order/{orderId}/completed',
    confidence: 'confirmed',
  },
  dbsRefund: { method: 'POST', path: '/v1/dbs/order/{orderId}/refund', confidence: 'confirmed' },

  // ─────────── Moliya ───────────
  /** Eng muhim manba: tushum, komissiya, to'lov summasi. `shopIds` MAJBURIY */
  financeOrders: {
    method: 'GET',
    path: '/v1/finance/orders',
    confidence: 'confirmed',
    note: 'Moliyaviy buyurtmalar; shopIds majburiy',
  },
  financeExpenses: {
    method: 'GET',
    path: '/v1/finance/expenses',
    confidence: 'confirmed',
    note: 'Xarajatlar (logistika, saqlash, reklama)',
  },

  // ─────────── Invoice (yetkazib berish hujjatlari) ───────────
  invoices: { method: 'GET', path: '/v1/invoice', confidence: 'confirmed', note: 'size<=50' },
  shopInvoices: { method: 'GET', path: '/v1/shop/{shopId}/invoice', confidence: 'confirmed' },
  shopInvoiceItems: {
    method: 'GET',
    path: '/v1/shop/{shopId}/invoice/products',
    confidence: 'confirmed',
    note: 'invoiceId query majburiy',
  },
  fbsInvoices: {
    method: 'GET',
    path: '/v1/fbs/invoice',
    confidence: 'confirmed',
    note: 'statuses majburiy, size<=20',
  },
  fbsInvoiceCreate: { method: 'POST', path: '/v1/fbs/invoice', confidence: 'confirmed' },
  fbsInvoice: { method: 'GET', path: '/v1/fbs/invoice/{invoiceId}', confidence: 'confirmed' },

  // ─────────── Qaytarishlar ───────────
  returns: { method: 'GET', path: '/v1/return', confidence: 'confirmed', note: 'size<=50' },
  shopReturns: { method: 'GET', path: '/v1/shop/{shopId}/return', confidence: 'confirmed' },
  shopReturn: {
    method: 'GET',
    path: '/v1/shop/{shopId}/return/{returnId}',
    confidence: 'confirmed',
  },

  // ─────────── Sharhlar ───────────
  /**
   * DIQQAT: seller OpenAPI'da sharh endpointi topilmadi.
   * Yo'l taxminiy — `LiveUzumClient` uni chaqirib ko'radi va xato bo'lsa bo'sh massiv qaytaradi.
   */
  reviews: {
    method: 'GET',
    path: '/v1/reviews',
    confidence: 'guess',
    note: "Spec'da yo'q — ishlamasligi mumkin",
  },
  reviewReply: {
    method: 'POST',
    path: '/v1/reviews/{reviewId}/reply',
    confidence: 'guess',
    note: "Spec'da yo'q — ishlamasligi mumkin",
  },
} satisfies Record<string, UzumEndpointDef>;

export type UzumEndpointKey = keyof typeof UZUM_ENDPOINTS;

/**
 * Endpoint yo'lini o'rin egallovchilar bilan to'ldiradi.
 * `uzumPath('products', { shopId: 42 })` → `/v1/product/shop/42`
 */
export function uzumPath(
  key: UzumEndpointKey,
  params: Record<string, string | number> = {},
): string {
  const def: UzumEndpointDef = UZUM_ENDPOINTS[key];
  return def.path.replace(/\{(\w+)\}/g, (whole, name: string) => {
    const value = params[name];
    return value === undefined ? whole : encodeURIComponent(String(value));
  });
}

/** Endpoint ta'rifini olish (metod + ishonch darajasi bilan) */
export function uzumEndpoint(key: UzumEndpointKey): UzumEndpointDef {
  return UZUM_ENDPOINTS[key];
}

/** Sahifa hajmi chegaralari (OpenAPI'dagi maxlar) */
export const UZUM_PAGE_LIMITS = {
  stocks: 100,
  products: 100,
  orders: 50,
  financeOrders: 50,
  financeExpenses: 50,
  invoices: 50,
  returns: 50,
  fbsInvoices: 20,
  default: 50,
} as const;

/** Bir marshrut uchun maksimal sahifalar soni (cheksiz aylanishdan himoya) */
export const UZUM_MAX_PAGES = 200;

/** Rate limit haqidagi javob sarlavhalari (`likely`) */
export const UZUM_RATE_HEADERS = [
  'x-ratelimit-remaining',
  'x-ratelimit-replenish-rate',
  'x-ratelimit-burst-capacity',
  'x-ratelimit-requested-tokens',
  'x-ratelimit-limit-per-day',
  'x-ratelimit-remaining-per-day',
] as const;

/** Buyurtma statuslari (`likely`) — barcha buyurtmalarni yig'ish uchun aylanamiz */
export const UZUM_ORDER_STATUSES = [
  'CREATED',
  'PACKING',
  'PENDING_DELIVERY',
  'DELIVERING',
  'DELIVERED',
  'ACCEPTED_AT_DP',
  'COMPLETED',
  'CANCELED',
  'RETURNED',
] as const;

/** Yetkazish sxemalari (`likely`) */
export const UZUM_SCHEMES = ['FBS', 'DBS'] as const;

/** Moliya statuslari (`guess`) */
export const UZUM_FINANCE_STATUSES = [
  'TO_WITHDRAW',
  'PROCESSING',
  'CANCELED',
  'PARTIALLY_CANCELLED',
] as const;
