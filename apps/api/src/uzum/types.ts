/**
 * Uzum Seller API adapteri — umumiy tiplar (shartnoma).
 *
 * Bu fayl butun loyiha uchun yagona haqiqat manbai: sinxronizatsiya ishchisi,
 * route'lar va bot faqat shu tiplarga tayanadi. `LiveUzumClient` (real API) va
 * `DemoUzumClient` (namunaviy ma'lumot) ikkalasi ham `UzumClient` ni to'liq bajaradi.
 *
 * Kelishuvlar:
 *  - barcha `id` maydonlari **string** (Uzum raqamli id qaytarsa ham string'ga o'giriladi);
 *  - pul qiymatlari **UZS**, butun songa yaqinlashtirilgan;
 *  - sanalar **ISO-8601 string** (`2026-09-03T10:15:00.000Z`);
 *  - ma'lumot topilmasa — bo'sh massiv yoki 0/'' qaytariladi, exception tashlanmaydi.
 */

/** Adapter rejimi: demo — namunaviy ma'lumot, live — haqiqiy Uzum API */
export type UzumMode = 'demo' | 'live';

/** Yetkazib berish sxemasi */
export type UzumDeliveryType = 'FBO' | 'FBS' | 'DBS';

/** Yo'qotish turi */
export type UzumLossType = 'lost' | 'damaged' | 'not_delivered';

/** Yo'qotish bo'yicha da'vo holati */
export type UzumLossStatus = 'open' | 'claimed' | 'compensated' | 'rejected';

/** Xarajat kategoriyasi (Expense modeliga mos) */
export type UzumExpenseCategory =
  | 'commission'
  | 'logistics'
  | 'marketing'
  | 'storage'
  | 'tax'
  | 'other';

// ─────────────────────────── Katalog ───────────────────────────

/** Kabinetdagi do'kon (magazin) */
export interface UzumShop {
  id: string;
  title: string;
  status?: string;
}

/** Mahsulot varianti (o'lcham/rang) */
export interface UzumSku {
  id: string;
  sku: string;
  barcode?: string;
  title: string;
  imageUrl?: string;
  price: number;
  oldPrice?: number;
  weightGr?: number;
  volumeL?: number;
  /** Uzum omborida faol qoldiq (FBO) — katalog javobidagi quantityActive */
  quantityFbo?: number;
  /** O'z omborida (FBS) — quantityFbs */
  quantityFbs?: number;
  /** Band qilingan (kutilayotgan) miqdor */
  reserved?: number;
  /** Uzum kabinetida kiritilgan tannarx (bo'lsa) */
  purchasePrice?: number;
  /** Kategoriya bo'yicha komissiya, % */
  commissionPct?: number;
}

/** Mahsulot kartochkasi (bir nechta SKU bilan) */
export interface UzumProduct {
  id: string;
  title: string;
  category?: string;
  brand?: string;
  imageUrl?: string;
  status?: string;
  rating?: number;
  reviewsCount?: number;
  skus: UzumSku[];
}

// ─────────────────────────── Qoldiq ───────────────────────────

/** Bir kunlik qoldiq snapshot'i */
export interface UzumStock {
  skuId: string;
  fbo: number;
  fbs: number;
  reserved?: number;
  inTransit?: number;
  /** ISO sana (`YYYY-MM-DD` yoki to'liq ISO) */
  date: string;
}

// ─────────────────────────── Buyurtma ───────────────────────────

/** Buyurtma tarkibidagi pozitsiya */
export interface UzumOrderItem {
  /** Bog'lash kaliti — Uzum sku id yoki sotuvchi SKU kodi */
  skuId: string;
  skuCode?: string;
  title?: string;
  qty: number;
  sellPrice: number;
  commission?: number;
  logistics?: number;
  status?: string;
  /** Qaytarilgan dona (amountReturns) */
  returnedQty?: number;
  /** Uzum to'laydigan summa (sellerProfit — "yechib olish uchun") */
  payout?: number;
  /** Uzum kabinetida ko'rsatilgan tannarx (purchasePrice) */
  purchasePrice?: number;
  /** Uzum tomonidagi mahsulot id */
  productId?: string;
}

/** Buyurtma */
export interface UzumOrder {
  id: string;
  shopId: string;
  status: string;
  deliveryType: UzumDeliveryType;
  orderedAt: string;
  paidAt?: string;
  deliveredAt?: string;
  buyerCity?: string;
  totalAmount: number;
  commission?: number;
  logistics?: number;
  discount?: number;
  items: UzumOrderItem[];
}

// ─────────────────────────── Qaytarish / yo'qotish ───────────────────────────

/** Mijoz qaytarishi */
export interface UzumReturn {
  id: string;
  skuId: string;
  orderCode?: string;
  qty: number;
  amount: number;
  reason?: string;
  returnedAt: string;
}

/** Marketpleys aybi bilan yo'qolgan/shikastlangan tovar */
export interface UzumLoss {
  id: string;
  skuId: string;
  type: UzumLossType;
  scheme: 'FBO' | 'FBS';
  qty: number;
  amount: number;
  compensated: number;
  status: UzumLossStatus;
  happenedAt: string;
}

// ─────────────────────────── Saqlash / sharh / xarajat ───────────────────────────

/** Pullik saqlash (kunlik, SKU kesimida) */
export interface UzumStorageFee {
  skuId: string;
  date: string;
  qty: number;
  volumeL: number;
  amount: number;
}

/** Mijoz sharhi */
export interface UzumReview {
  id: string;
  productId?: string;
  skuId?: string;
  rating: number;
  text?: string;
  author?: string;
  publishedAt: string;
  answered?: boolean;
  answerText?: string;
}

/** Kunlik xarajat yozuvi */
export interface UzumExpense {
  date: string;
  category: UzumExpenseCategory;
  amount: number;
  note?: string;
  /**
   * Bu to'lov Uzumning "yechib olish uchun" (`sellerProfit`) summasida
   * ALLAQACHON ayrilgan — masalan, har bir buyurtma uchun mijozga yetkazish.
   * Foyda hisobida ikkinchi marta ayrilmaydi, ammo hisobdagi haqiqiy
   * balansni topish uchun kerak (Uzum uni balansdan ushlab qoladi).
   */
  inPayout?: boolean;
}

// ─────────────────────────── Klient shartnomasi ───────────────────────────

/**
 * Uzum kabineti bilan ishlash uchun yagona interfeys.
 * Barcha `get*` metodlari xatolikda **bo'sh massiv** qaytaradi (throw qilmaydi) —
 * sinxronizatsiya bosqichi qulab tushmasligi uchun.
 */
export interface UzumClient {
  /** API kalitni tekshirish (sinxronizatsiyaning `auth` bosqichi) */
  verify(): Promise<{ ok: boolean; message?: string }>;
  getShops(): Promise<UzumShop[]>;
  getProducts(shopId: string): Promise<UzumProduct[]>;
  getStocks(shopId: string): Promise<UzumStock[]>;
  getOrders(shopId: string, from: Date, to: Date): Promise<UzumOrder[]>;
  getReturns(shopId: string, from: Date, to: Date): Promise<UzumReturn[]>;
  getLosses(shopId: string, from: Date, to: Date): Promise<UzumLoss[]>;
  getStorageFees(shopId: string, from: Date, to: Date): Promise<UzumStorageFee[]>;
  getReviews(shopId: string, from: Date, to: Date): Promise<UzumReview[]>;
  getExpenses(shopId: string, from: Date, to: Date): Promise<UzumExpense[]>;
  replyReview(shopId: string, reviewId: string, text: string): Promise<boolean>;
}

/**
 * `createUzumClient` uchun parametrlar.
 * Majburiy qismi shartnoma bo'yicha: `{ apiKey, apiSecret?, seed?, mode? }`.
 * Qolganlari — ixtiyoriy (standart qiymatlar `env.uzum` dan olinadi).
 */
export interface UzumClientOptions {
  /** Uzum seller kabinetidagi API token (Bearer) */
  apiKey: string;
  /** Ba'zi integratsiyalarda ikkinchi kalit bo'lishi mumkin */
  apiSecret?: string | null;
  /** Demo ma'lumot uchun urug' (berilmasa `apiKey` ishlatiladi) */
  seed?: string;
  /** Rejim (berilmasa `env.uzum.mode`) */
  mode?: UzumMode;
  /** Boshqa base URL (test uchun) */
  baseUrl?: string;
  /** So'rov taymauti, ms */
  timeoutMs?: number;
  /** Qayta urinishlar soni */
  maxRetries?: number;
  /** Sekundiga so'rovlar chegarasi */
  rpsLimit?: number;
  /** Demo ma'lumotda "bugun" nuqtasi (testlarni barqaror qilish uchun) */
  now?: Date;
}
