/**
 * `DemoUzumClient` — real Uzum API'siz ishlaydigan namunaviy ma'lumot manbai.
 *
 * Nima uchun kerak: `UZUM_MODE=demo` bo'lganda platformaning butun oqimi (sinxronizatsiya,
 * dashboard, ABC, nolikvid, unit-iqtisod, sharhlar) haqiqiy kabinetsiz ham to'liq ishlaydi.
 *
 * Kafolatlar:
 *  • **Determinizm** — barcha tasodifiylik `mulberry32` PRNG orqali, urug' `apiKey` dan
 *    (yoki `opts.seed` dan) hosil qilinadi. `Math.random` ISHLATILMAYDI, shuning uchun
 *    bitta kalit har doim AYNAN bir xil ma'lumot beradi.
 *  • **Realistiklik** — haftalik mavsumiylik (dam olish kunlari +25%), o'sish trendi,
 *    "hit" va nolikvid SKU'lar, qaytarishlar, yo'qotishlar, komissiya/logistika,
 *    kunlik qoldiq snapshotlari va hajmga bog'liq saqlash to'lovi.
 *  • **Sof** — ma'lumot bir marta yig'iladi (lazy) va xotirada saqlanadi; metodlar faqat
 *    kerakli kesimni qaytaradi, shu jumladan `getOrders` — faqat so'ralgan sana oralig'ini
 *    (inkremental sinxronizatsiya uchun).
 */
import { DEFAULTS } from '@savdoiq/shared';
import type {
  UzumClient,
  UzumClientOptions,
  UzumDeliveryType,
  UzumExpense,
  UzumLoss,
  UzumLossStatus,
  UzumLossType,
  UzumOrder,
  UzumProduct,
  UzumReview,
  UzumReturn,
  UzumShop,
  UzumStock,
  UzumStorageFee,
} from './types.js';

// ─────────────────────────── PRNG (mulberry32) ───────────────────────────

/** Determinlashtirilgan psevdo-tasodifiy generator */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Matndan 32-bitli urug' (FNV-1a) */
function hashSeed(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

interface Rng {
  next(): number;
  /** [min, max] oralig'idagi butun son */
  int(min: number, max: number): number;
  /** [min, max) oralig'idagi kasr son */
  float(min: number, max: number): number;
  /** Ro'yxatdan element */
  pick<T>(list: readonly T[]): T;
  /** `p` ehtimollik bilan true */
  chance(p: number): boolean;
  /** Ro'yxatni aralashtirish (yangi massiv) */
  shuffle<T>(list: readonly T[]): T[];
}

function createRng(seed: number): Rng {
  const next = mulberry32(seed);
  const rng: Rng = {
    next,
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    float: (min, max) => min + next() * (max - min),
    pick: (list) => list[Math.floor(next() * list.length)],
    chance: (p) => next() < p,
    shuffle: (list) => {
      const out = [...list];
      for (let i = out.length - 1; i > 0; i -= 1) {
        const j = Math.floor(next() * (i + 1));
        const tmp = out[i];
        out[i] = out[j];
        out[j] = tmp;
      }
      return out;
    },
  };
  return rng;
}

// ─────────────────────────── Sana yordamchilari ───────────────────────────

const DAY_MS = 86_400_000;
/** Buyurtmalar tarixi chuqurligi */
const HISTORY_DAYS = 180;
/** Kunlik qoldiq snapshotlari soni */
const STOCK_DAYS = 60;
/** Davr oxiriga qadar o'sish (trend) */
const GROWTH = 0.45;

/** Hafta kunlari koeffitsiyenti (0 — yakshanba). Dam olish kunlari +25%. */
const WEEKDAY_FACTOR = [1.25, 0.92, 0.95, 0.98, 1.02, 1.08, 1.25];

/** Buyurtma soatlari (kunduzi va kechqurun tig'iz) */
const HOUR_WEIGHTS = [
  9, 9, 10, 10, 10, 11, 11, 12, 12, 13, 13, 14, 15, 16, 17, 18, 18, 19, 19, 20, 20, 21, 21, 22,
];

const startOfUtcDay = (d: Date): Date =>
  new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));

const toISODay = (d: Date): string => d.toISOString().slice(0, 10);

/** Pulni `step` ga karrali qilib yaxlitlash */
const roundTo = (value: number, step: number): number => Math.round(value / step) * step;

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

// ─────────────────────────── Katalog ───────────────────────────

interface CatalogItem {
  title: string;
  category: string;
  brand: string;
  minPrice: number;
  maxPrice: number;
  /** Uzum komissiyasi, % (10–16) */
  commissionPct: number;
  weightGr: number;
  volumeL: number;
  variants: string[];
}

/** Realistik Uzum assortimenti (o'zbek/rus tilidagi nomlar) */
const CATALOG: CatalogItem[] = [
  { title: 'Gaming sichqoncha ko‘rpachasi XXL RGB', category: 'Kompyuter', brand: 'Redragon', minPrice: 68_000, maxPrice: 138_000, commissionPct: 15, weightGr: 900, volumeL: 2.4, variants: ['80x30', '90x40', '100x40'] },
  { title: 'Sichqoncha ko‘rpachasi bilak tayanchli', category: 'Kompyuter', brand: 'Fantech', minPrice: 32_000, maxPrice: 62_000, commissionPct: 16, weightGr: 180, volumeL: 0.6, variants: ['Qora', 'Kulrang', 'Pushti'] },
  { title: 'Simsiz sichqoncha Silent Click 2.4G', category: 'Kompyuter', brand: 'Logitech', minPrice: 95_000, maxPrice: 178_000, commissionPct: 11, weightGr: 140, volumeL: 0.5, variants: ['Qora', 'Oq'] },
  { title: 'Simsiz quloqchin TWS Air Pro', category: 'Elektronika', brand: 'Hoco', minPrice: 165_000, maxPrice: 285_000, commissionPct: 12, weightGr: 120, volumeL: 0.4, variants: ['Qora', 'Oq', 'Ko‘k'] },
  { title: 'Quloqchin simli Hi-Res mikrofonli', category: 'Elektronika', brand: 'Awei', minPrice: 45_000, maxPrice: 96_000, commissionPct: 15, weightGr: 90, volumeL: 0.3, variants: ['Qora', 'Oq'] },
  { title: 'Gaming naushnik 7.1 RGB', category: 'Kompyuter', brand: 'Bloody', minPrice: 215_000, maxPrice: 345_000, commissionPct: 11, weightGr: 380, volumeL: 2.2, variants: ['Qora', 'Qizil'] },
  { title: 'Telefon uchun himoya oynasi 9D', category: 'Aksessuarlar', brand: 'Baseus', minPrice: 25_000, maxPrice: 48_000, commissionPct: 16, weightGr: 60, volumeL: 0.15, variants: ['iPhone 13', 'iPhone 15', 'Samsung A55', 'Redmi Note 13'] },
  { title: 'Silikon g‘ilof shaffof antishok', category: 'Aksessuarlar', brand: 'Borofone', minPrice: 26_000, maxPrice: 55_000, commissionPct: 16, weightGr: 45, volumeL: 0.12, variants: ['iPhone 14', 'Samsung S23', 'Redmi 13C'] },
  { title: 'Tezkor zaryadlovchi Type-C 30W', category: 'Aksessuarlar', brand: 'Ldnio', minPrice: 88_000, maxPrice: 168_000, commissionPct: 13, weightGr: 170, volumeL: 0.35, variants: ['Oq', 'Qora'] },
  { title: 'USB-C kabel 100W nayloncha', category: 'Aksessuarlar', brand: 'Ugreen', minPrice: 35_000, maxPrice: 88_000, commissionPct: 15, weightGr: 90, volumeL: 0.2, variants: ['1 m', '2 m', '3 m'] },
  { title: 'Powerbank 20000 mAh QC 22.5W', category: 'Elektronika', brand: 'Hoco', minPrice: 145_000, maxPrice: 238_000, commissionPct: 11, weightGr: 420, volumeL: 0.8, variants: ['Qora', 'Ko‘k'] },
  { title: 'Bluetooth kolonka Mini Bass', category: 'Elektronika', brand: 'JBL', minPrice: 245_000, maxPrice: 425_000, commissionPct: 10, weightGr: 560, volumeL: 1.5, variants: ['Qora', 'Ko‘k', 'Qizil'] },
  { title: 'Smart bilaguzuk Fit Band 8', category: 'Elektronika', brand: 'Xiaomi', minPrice: 265_000, maxPrice: 415_000, commissionPct: 10, weightGr: 90, volumeL: 0.3, variants: ['Qora', 'Bej'] },
  { title: 'Avtomobil telefon ushlagichi magnitli', category: 'Avto tovarlar', brand: 'Borofone', minPrice: 38_000, maxPrice: 74_000, commissionPct: 16, weightGr: 130, volumeL: 0.4, variants: ['Magnitli', 'Klipsali'] },
  { title: 'Mexanik klaviatura 87 klavish RGB', category: 'Kompyuter', brand: 'Redragon', minPrice: 340_000, maxPrice: 545_000, commissionPct: 10, weightGr: 780, volumeL: 2.4, variants: ['Qora', 'Oq'] },
  { title: 'Noutbuk uchun sovutgich stend', category: 'Kompyuter', brand: 'Deepcool', minPrice: 145_000, maxPrice: 245_000, commissionPct: 12, weightGr: 900, volumeL: 4.2, variants: ['15.6"', '17"'] },
  { title: 'Web-kamera Full HD 1080p', category: 'Kompyuter', brand: 'A4Tech', minPrice: 235_000, maxPrice: 368_000, commissionPct: 11, weightGr: 240, volumeL: 0.7, variants: ['1080p'] },
  { title: 'Termos vakuumli 1.2 L', category: 'Uy-ro‘zg‘or', brand: 'Peterhof', minPrice: 135_000, maxPrice: 228_000, commissionPct: 13, weightGr: 700, volumeL: 2.5, variants: ['Kumush', 'Qora'] },
  { title: 'Elektr choynak 1.8 L', category: 'Maishiy texnika', brand: 'Vitek', minPrice: 175_000, maxPrice: 298_000, commissionPct: 12, weightGr: 1100, volumeL: 5.5, variants: ['Oq', 'Qora'] },
  { title: 'Oshxona tarozisi elektron 10 kg', category: 'Uy-ro‘zg‘or', brand: 'Scarlett', minPrice: 62_000, maxPrice: 118_000, commissionPct: 14, weightGr: 400, volumeL: 1.4, variants: ['Oq', 'Qora'] },
  { title: 'Idish yuvish cho‘tkasi to‘plami', category: 'Uy-ro‘zg‘or', brand: 'Home Star', minPrice: 25_000, maxPrice: 46_000, commissionPct: 16, weightGr: 200, volumeL: 1.2, variants: ['3 dona', '5 dona'] },
  { title: 'Paxta choyshab to‘plami 2 kishilik', category: 'Uy tekstili', brand: 'Ipak Yo‘li', minPrice: 215_000, maxPrice: 348_000, commissionPct: 12, weightGr: 1600, volumeL: 8, variants: ['Bej', 'Ko‘k', 'Kulrang'] },
  { title: 'Anatomik yostiq memory foam', category: 'Uy tekstili', brand: 'Uyqu', minPrice: 95_000, maxPrice: 168_000, commissionPct: 14, weightGr: 900, volumeL: 6, variants: ['50x70', '60x40'] },
  { title: 'Gilam 160x230 zamonaviy naqsh', category: 'Uy tekstili', brand: 'Samarqand Gilam', minPrice: 480_000, maxPrice: 890_000, commissionPct: 10, weightGr: 7800, volumeL: 28, variants: ['Bej', 'Yashil'] },
  { title: 'Robot changyutgich Mini Home', category: 'Maishiy texnika', brand: 'Artel', minPrice: 690_000, maxPrice: 948_000, commissionPct: 10, weightGr: 3200, volumeL: 12, variants: ['Oq', 'Qora'] },
  { title: 'Dazmol bug‘li 2400W', category: 'Maishiy texnika', brand: 'Philips', minPrice: 385_000, maxPrice: 568_000, commissionPct: 10, weightGr: 1500, volumeL: 4.8, variants: ['Standart'] },
  { title: 'Yuz uchun krem SPF50 50 ml', category: 'Go‘zallik', brand: 'Nivea', minPrice: 72_000, maxPrice: 128_000, commissionPct: 14, weightGr: 90, volumeL: 0.25, variants: ['50 ml'] },
  { title: 'Sport butilka termo 1 L', category: 'Sport', brand: 'Sportmax', minPrice: 55_000, maxPrice: 112_000, commissionPct: 15, weightGr: 320, volumeL: 1.3, variants: ['Qora', 'Ko‘k', 'Kumush'] },
  { title: 'Bolalar konstruktori 120 detal', category: 'Bolalar tovarlari', brand: 'BebeKids', minPrice: 85_000, maxPrice: 178_000, commissionPct: 14, weightGr: 850, volumeL: 3.5, variants: ['Klassik', 'Katta to‘plam'] },
  { title: 'Chang yutgich uchun filtr to‘plami', category: 'Maishiy texnika', brand: 'Artel', minPrice: 45_000, maxPrice: 95_000, commissionPct: 15, weightGr: 250, volumeL: 1, variants: ['2 dona', '4 dona'] },
];

const SHOP_NAMES = ['LOOTBOX TECH', 'SAMARQAND SAVDO', 'TOSHKENT MARKET', 'UZ HOME STORE'];

/** Shaharlar — Toshkent ustunligi bilan (og'irlik takrorlash orqali) */
const CITIES = [
  'Toshkent', 'Toshkent', 'Toshkent', 'Toshkent',
  'Samarqand', 'Samarqand', 'Buxoro', 'Farg‘ona', 'Farg‘ona',
  'Namangan', 'Andijon', 'Qarshi', 'Nukus', 'Urganch', 'Jizzax', 'Termiz', 'Navoiy',
];

const RETURN_REASONS = [
  'O‘lchami to‘g‘ri kelmadi',
  'Mijoz fikridan qaytdi',
  'Tovar shikastlangan',
  'Tavsifga mos emas',
  'Sifat qoniqarsiz',
  'Не подошёл размер',
  'Товар с дефектом',
];

const REVIEW_AUTHORS = [
  'Aziz R.', 'Dilnoza Y.', 'Sardor K.', 'Kamola T.', 'Jasur M.', 'Nilufar A.',
  'Bekzod S.', 'Malika I.', 'Rustam O.', 'Zilola N.', 'Олег П.', 'Марина К.',
  'Шахло Ю.', 'Фаррух Т.', 'Умида А.',
];

const REVIEW_POSITIVE = [
  'Mahsulot sifatli, juda tez yetkazib berishdi. Rahmat!',
  'Hammasi zo‘r, tavsiya qilaman — narxiga arziydi.',
  'Sifati kutganimdan ham yaxshi chiqdi.',
  'Qadoq mustahkam, tovar butun holda yetib keldi.',
  'Всё отлично, доставка быстрая, товар как на фото.',
  'Качество супер, рекомендую продавца!',
];

const REVIEW_NEUTRAL = [
  'Yaxshi, lekin qadoq biroz ezilgan edi.',
  'Normal mahsulot, narxiga mos.',
  'Rangi suratdagidan bir oz farq qiladi, qolgani yaxshi.',
  'Нормально, но упаковка помятая.',
];

const REVIEW_NEGATIVE = [
  'Yetkazib berish kechikdi, mahsulot esa o‘rtacha.',
  'Ishlamadi, qaytarib yubordim.',
  'Sifati past, tavsiya qilmayman.',
  'Пришло с браком, буду возвращать.',
];

const REVIEW_ANSWERS = [
  'Sharhingiz uchun rahmat! Fikringiz biz uchun juda muhim.',
  'Rahmat! Yangi mahsulotlarimizni ham ko‘rib chiqing.',
  'Uzr so‘raymiz, muammoni hal qilamiz — biz bilan bog‘laning.',
  'Спасибо за отзыв! Рады, что вам понравилось.',
];

const LOSS_TYPES: readonly UzumLossType[] = ['lost', 'damaged', 'not_delivered'];
const LOSS_STATUSES: readonly UzumLossStatus[] = ['open', 'claimed', 'compensated', 'rejected'];

const MARKETING_NOTES = ['Uzum reklama kampaniyasi', 'Banner reklama', 'Aksiya (chegirma) qo‘llab-quvvatlash'];
const OTHER_NOTES = ['Qadoqlash materiallari', 'Kuryer xizmati', 'Ombor jihozlari'];

// ─────────────────────────── Ichki modellar ───────────────────────────

/** Talab sinfi: hit — ko'p sotiladigan, dead — nolikvid */
type DemandKind = 'hit' | 'normal' | 'slow' | 'dead';

interface DemoSku {
  id: string;
  sku: string;
  barcode: string;
  title: string;
  price: number;
  oldPrice: number;
  purchasePrice: number;
  weightGr: number;
  volumeL: number;
  productId: string;
  shopId: string;
  commissionPct: number;
  /** Bir dona uchun logistika, UZS */
  logisticsPerUnit: number;
  /** Kunlik bazaviy talab (dona) */
  demand: number;
  kind: DemandKind;
  /** Shu kun indeksidan keyin sotuv bo'lmaydi (nolikvid uchun) */
  lastActiveDay: number;
}

interface DemoDataset {
  shops: UzumShop[];
  skus: DemoSku[];
  productsByShop: Map<string, UzumProduct[]>;
  ordersByShop: Map<string, UzumOrder[]>;
  stocksByShop: Map<string, UzumStock[]>;
  returnsByShop: Map<string, UzumReturn[]>;
  lossesByShop: Map<string, UzumLoss[]>;
  storageByShop: Map<string, UzumStorageFee[]>;
  reviewsByShop: Map<string, UzumReview[]>;
  expensesByShop: Map<string, UzumExpense[]>;
}

/** Map ichidagi ro'yxatga qo'shish (bo'lmasa yaratadi) */
function push<T>(map: Map<string, T[]>, key: string, value: T): void {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}

// ─────────────────────────── Klient ───────────────────────────

export class DemoUzumClient implements UzumClient {
  private readonly apiKey: string;
  private readonly seed: string;
  private readonly today: Date;
  private data: DemoDataset | null = null;

  constructor(opts: UzumClientOptions) {
    this.apiKey = opts.apiKey ?? '';
    this.seed = opts.seed ?? opts.apiKey ?? 'savdoiq-demo';
    this.today = startOfUtcDay(opts.now ?? new Date());
  }

  // ─────────────── Shartnoma metodlari ───────────────

  async verify(): Promise<{ ok: boolean; message?: string }> {
    const key = this.apiKey.trim();
    if (!key) return { ok: false, message: 'API kalit kiritilmagan' };
    if (key.length < 8) {
      return { ok: false, message: 'API kalit juda qisqa — kabinetdagi kalitni to‘liq nusxalang' };
    }
    const data = this.dataset();
    return {
      ok: true,
      message: `Demo rejim: ${data.shops.length} ta do‘kon, ${data.skus.length} ta SKU tayyor`,
    };
  }

  async getShops(): Promise<UzumShop[]> {
    return this.dataset().shops.map((s) => ({ ...s }));
  }

  async getProducts(shopId: string): Promise<UzumProduct[]> {
    return this.dataset().productsByShop.get(shopId) ?? [];
  }

  async getStocks(shopId: string): Promise<UzumStock[]> {
    return this.dataset().stocksByShop.get(shopId) ?? [];
  }

  /** Faqat so'ralgan oraliq — inkremental sinxronizatsiya shunga tayanadi */
  async getOrders(shopId: string, from: Date, to: Date): Promise<UzumOrder[]> {
    const all = this.dataset().ordersByShop.get(shopId) ?? [];
    return all.filter((o) => inRange(o.orderedAt, from, to));
  }

  async getReturns(shopId: string, from: Date, to: Date): Promise<UzumReturn[]> {
    const all = this.dataset().returnsByShop.get(shopId) ?? [];
    return all.filter((r) => inRange(r.returnedAt, from, to));
  }

  async getLosses(shopId: string, from: Date, to: Date): Promise<UzumLoss[]> {
    const all = this.dataset().lossesByShop.get(shopId) ?? [];
    return all.filter((l) => inRange(l.happenedAt, from, to));
  }

  async getStorageFees(shopId: string, from: Date, to: Date): Promise<UzumStorageFee[]> {
    const all = this.dataset().storageByShop.get(shopId) ?? [];
    return all.filter((f) => inRange(f.date, from, to));
  }

  async getReviews(shopId: string, from: Date, to: Date): Promise<UzumReview[]> {
    const all = this.dataset().reviewsByShop.get(shopId) ?? [];
    return all.filter((r) => inRange(r.publishedAt, from, to));
  }

  async getExpenses(shopId: string, from: Date, to: Date): Promise<UzumExpense[]> {
    const all = this.dataset().expensesByShop.get(shopId) ?? [];
    return all.filter((e) => inRange(e.date, from, to));
  }

  /** Demo rejimda javob xotirada saqlanadi (qayta so'ralganda sharh javoblangan ko'rinadi) */
  async replyReview(shopId: string, reviewId: string, text: string): Promise<boolean> {
    if (!text.trim()) return false;
    const list = this.dataset().reviewsByShop.get(shopId) ?? [];
    const review = list.find((r) => r.id === reviewId);
    if (!review) return false;
    review.answered = true;
    review.answerText = text.trim();
    return true;
  }

  // ─────────────── Ma'lumot generatsiyasi ───────────────

  /** Ma'lumot bir marta yig'iladi va keshlanadi */
  private dataset(): DemoDataset {
    if (!this.data) this.data = this.build();
    return this.data;
  }

  /** Bugundan `offset` kun (manfiy — o'tmish), UTC yarim tuni */
  private dayAt(offset: number): Date {
    return new Date(this.today.getTime() + offset * DAY_MS);
  }

  /** Tarix indeksidan sana (0 — eng eski kun, HISTORY_DAYS-1 — bugun) */
  private dateOfIndex(index: number): Date {
    return this.dayAt(index - (HISTORY_DAYS - 1));
  }

  private build(): DemoDataset {
    const rng = createRng(hashSeed(this.seed));

    // ─── 1. Do'konlar (1–2 ta) ───
    const shopCount = rng.int(1, 2);
    const shops: UzumShop[] = rng
      .shuffle(SHOP_NAMES)
      .slice(0, shopCount)
      .map((title, i) => ({ id: `demo-shop-${i + 1}`, title, status: 'active' }));

    // ─── 2. Mahsulotlar (14–20) va SKU'lar (28–40) ───
    const productCount = rng.int(14, 20);
    const templates = rng.shuffle(CATALOG).slice(0, productCount);
    const targetSkus = rng.int(28, 40);

    const perProduct = templates.map(() => 1);
    const capacity = templates.reduce((sum, t) => sum + t.variants.length, 0);
    let remaining = clamp(targetSkus - productCount, 0, capacity - productCount);
    let cursor = 0;
    while (remaining > 0) {
      if (perProduct[cursor] < templates[cursor].variants.length) {
        perProduct[cursor] += 1;
        remaining -= 1;
      }
      cursor = (cursor + 1) % productCount;
    }

    const skus: DemoSku[] = [];
    const productsByShop = new Map<string, UzumProduct[]>();
    let skuSeq = 0;

    templates.forEach((tpl, index) => {
      const shop = shops[index % shops.length];
      const productId = `demo-p-${index + 1}`;
      const basePrice = clamp(roundTo(rng.float(tpl.minPrice, tpl.maxPrice), 1_000), 25_000, 950_000);

      const product: UzumProduct = {
        id: productId,
        title: tpl.title,
        category: tpl.category,
        brand: tpl.brand,
        status: 'active',
        rating: Number(rng.float(4.1, 4.9).toFixed(1)),
        reviewsCount: 0, // sharhlar yig'ilgach to'ldiriladi
        skus: [],
      };

      for (let v = 0; v < perProduct[index]; v += 1) {
        skuSeq += 1;
        const variant = tpl.variants[v] ?? `Variant ${v + 1}`;
        const price = clamp(roundTo(basePrice * rng.float(0.92, 1.12), 1_000), 25_000, 950_000);
        // Tannarx — narxning 35–60% i
        const purchasePrice = roundTo(price * rng.float(0.35, 0.6), 500);

        // Talab sinfi: ~15% hit, ~55% oddiy, ~18% sekin, ~12% nolikvid
        const roll = rng.next();
        const kind: DemandKind =
          roll < 0.15 ? 'hit' : roll < 0.7 ? 'normal' : roll < 0.88 ? 'slow' : 'dead';
        const demand =
          kind === 'hit'
            ? rng.float(2.5, 6)
            : kind === 'normal'
              ? rng.float(0.6, 2.2)
              : kind === 'slow'
                ? rng.float(0.12, 0.5)
                : rng.float(0.05, 0.25);
        // Nolikvid SKU'lar tarixning boshida bir oz sotilgan, keyin to'xtagan
        const lastActiveDay = kind === 'dead' ? rng.int(20, 70) : HISTORY_DAYS;

        const demoSku: DemoSku = {
          id: `demo-sku-${skuSeq}`,
          sku: `${tpl.brand.slice(0, 3).toUpperCase()}-${String(skuSeq).padStart(4, '0')}`,
          barcode: `48${String(1_000_000 + skuSeq * 7919).slice(0, 9)}`,
          title: `${tpl.title} — ${variant}`,
          price,
          oldPrice: roundTo(price * rng.float(1.1, 1.35), 1_000),
          purchasePrice,
          weightGr: tpl.weightGr,
          volumeL: tpl.volumeL,
          productId,
          shopId: shop.id,
          commissionPct: tpl.commissionPct,
          logisticsPerUnit: roundTo(rng.int(8_000, 25_000), 500),
          demand,
          kind,
          lastActiveDay,
        };

        skus.push(demoSku);
        product.skus.push({
          id: demoSku.id,
          sku: demoSku.sku,
          barcode: demoSku.barcode,
          title: demoSku.title,
          price: demoSku.price,
          oldPrice: demoSku.oldPrice,
          weightGr: demoSku.weightGr,
          volumeL: demoSku.volumeL,
        });
      }

      push(productsByShop, shop.id, product);
    });

    // ─── 3. Buyurtmalar (oxirgi 180 kun) ───
    const returnRate = rng.float(0.06, 0.09);
    const cancelRate = rng.float(0.03, 0.05);

    const ordersByShop = new Map<string, UzumOrder[]>();
    const returnsByShop = new Map<string, UzumReturn[]>();
    /** skuId → (kun indeksi → sotilgan dona) — qoldiqni orqaga qarab tiklash uchun */
    const salesBySku = new Map<string, Map<number, number>>();
    /** skuId → yetkazilgan dona (sharh va yo'qotishlar uchun og'irlik) */
    const deliveredBySku = new Map<string, number>();

    let orderSeq = 0;

    for (let day = 0; day < HISTORY_DAYS; day += 1) {
      const date = this.dateOfIndex(day);
      const seasonal = WEEKDAY_FACTOR[date.getUTCDay()];
      const trend = 1 + GROWTH * (day / (HISTORY_DAYS - 1));

      for (const sku of skus) {
        if (day > sku.lastActiveDay) continue;

        const expected = sku.demand * seasonal * trend * rng.float(0.6, 1.4);
        let units = Math.floor(expected);
        if (rng.chance(expected - units)) units += 1;
        if (units <= 0) continue;

        while (units > 0) {
          const qty = Math.min(units, rng.chance(0.82) ? 1 : 2);
          units -= qty;
          orderSeq += 1;

          const daysAgo = HISTORY_DAYS - 1 - day;
          const status =
            daysAgo === 0
              ? rng.chance(0.6)
                ? 'new'
                : 'processing'
              : daysAgo === 1
                ? rng.chance(0.45)
                  ? 'processing'
                  : 'delivered'
                : rng.chance(cancelRate)
                  ? 'canceled'
                  : rng.chance(returnRate)
                    ? 'returned'
                    : 'delivered';

          // FBO / FBS / DBS ≈ 70 / 25 / 5
          const schemeRoll = rng.next();
          const deliveryType: UzumDeliveryType =
            schemeRoll < 0.7 ? 'FBO' : schemeRoll < 0.95 ? 'FBS' : 'DBS';

          // Ba'zan chegirma bilan sotiladi
          const discountPct = rng.chance(0.2) ? rng.int(5, 15) : 0;
          const sellPrice = roundTo(sku.price * (1 - discountPct / 100), 500);
          const revenue = sellPrice * qty;
          const commission = Math.round((revenue * sku.commissionPct) / 100);
          const logistics = sku.logisticsPerUnit * qty;

          const orderedAt = new Date(
            date.getTime() +
              (rng.pick(HOUR_WEIGHTS) * 3600 + rng.int(0, 59) * 60 + rng.int(0, 59)) * 1000,
          ).toISOString();

          const order: UzumOrder = {
            id: `demo-ord-${String(orderSeq).padStart(6, '0')}`,
            shopId: sku.shopId,
            status,
            deliveryType,
            orderedAt,
            paidAt: status === 'delivered' ? orderedAt : undefined,
            deliveredAt:
              status === 'delivered'
                ? new Date(Date.parse(orderedAt) + rng.int(1, 4) * DAY_MS).toISOString()
                : undefined,
            buyerCity: rng.pick(CITIES),
            totalAmount: revenue,
            commission,
            logistics,
            discount: (sku.price - sellPrice) * qty,
            items: [
              {
                skuId: sku.id,
                skuCode: sku.sku,
                title: sku.title,
                qty,
                sellPrice,
                commission,
                logistics,
                status,
              },
            ],
          };

          push(ordersByShop, sku.shopId, order);

          if (status !== 'canceled') {
            const byDay = salesBySku.get(sku.id) ?? new Map<number, number>();
            byDay.set(day, (byDay.get(day) ?? 0) + qty);
            salesBySku.set(sku.id, byDay);
          }
          if (status === 'delivered') {
            deliveredBySku.set(sku.id, (deliveredBySku.get(sku.id) ?? 0) + qty);
          }

          // Qaytarish yozuvi
          if (status === 'returned') {
            const returnedAt = Math.min(
              Date.parse(orderedAt) + rng.int(3, 14) * DAY_MS,
              this.today.getTime() + 12 * 3_600_000,
            );
            push(returnsByShop, sku.shopId, {
              id: `demo-ret-${String(orderSeq).padStart(6, '0')}`,
              skuId: sku.id,
              orderCode: order.id,
              qty,
              amount: revenue,
              reason: rng.pick(RETURN_REASONS),
              returnedAt: new Date(returnedAt).toISOString(),
            });
          }
        }
      }
    }

    // ─── 4. Yo'qotishlar (sotilgan hajmning 1–2% i) ───
    const lossesByShop = new Map<string, UzumLoss[]>();
    const totalDelivered = [...deliveredBySku.values()].reduce((s, n) => s + n, 0);
    let lossUnits = Math.round(totalDelivered * rng.float(0.01, 0.02));
    let lossSeq = 0;

    while (lossUnits > 0 && skus.length > 0) {
      const sku = rng.pick(skus);
      const qty = Math.min(lossUnits, rng.int(1, 3));
      lossUnits -= qty;
      lossSeq += 1;

      const amount = sku.price * qty;
      const status = rng.pick(LOSS_STATUSES);
      const compensated =
        status === 'compensated'
          ? amount
          : status === 'claimed' && rng.chance(0.3)
            ? Math.round(amount * rng.float(0.4, 0.8))
            : 0;

      push(lossesByShop, sku.shopId, {
        id: `demo-loss-${String(lossSeq).padStart(4, '0')}`,
        skuId: sku.id,
        type: rng.pick(LOSS_TYPES),
        scheme: rng.chance(0.75) ? 'FBO' : 'FBS',
        qty,
        amount,
        compensated,
        status,
        happenedAt: this.dateOfIndex(rng.int(0, HISTORY_DAYS - 1)).toISOString(),
      });
    }

    // ─── 5. Kunlik qoldiqlar (60 kun) va saqlash to'lovi ───
    const stocksByShop = new Map<string, UzumStock[]>();
    const storageByShop = new Map<string, UzumStorageFee[]>();

    for (const sku of skus) {
      const byDay = salesBySku.get(sku.id) ?? new Map<number, number>();
      // Nolikvid SKU'da ombor to'lib yotadi, hit SKU'da 10–35 kunlik zaxira
      let stock =
        sku.kind === 'dead'
          ? rng.int(40, 220)
          : Math.max(3, Math.round(sku.demand * rng.int(10, 35)));

      const restockEvery = rng.int(18, 30);
      const restockOffset = rng.int(0, restockEvery - 1);
      const restockQty = Math.max(10, Math.round(sku.demand * restockEvery));

      for (let back = 0; back < STOCK_DAYS; back += 1) {
        const date = this.dayAt(-back);
        const fbo = Math.round(stock * 0.75);
        const fbs = stock - fbo;

        push(stocksByShop, sku.shopId, {
          skuId: sku.id,
          fbo,
          fbs,
          reserved: fbo > 0 ? Math.round(fbo * rng.float(0.02, 0.06)) : 0,
          inTransit: rng.chance(0.12) ? rng.int(5, 40) : 0,
          date: toISODay(date),
        });

        // Saqlash to'lovi hajmga bog'liq: dona × hajm(L) × kunlik tarif
        if (fbo > 0) {
          const volumeL = Number((fbo * sku.volumeL).toFixed(2));
          const amount = Math.round(
            volumeL * DEFAULTS.storagePerLiterPerDay * rng.float(0.9, 1.1),
          );
          if (amount > 0) {
            push(storageByShop, sku.shopId, {
              skuId: sku.id,
              date: toISODay(date),
              qty: fbo,
              volumeL,
              amount,
            });
          }
        }

        // Orqaga qadam: kechagi qoldiq = bugungisi + bugun sotilgani − bugun kelgani
        const dayIndex = HISTORY_DAYS - 1 - back;
        const sold = byDay.get(dayIndex) ?? 0;
        const restock = back % restockEvery === restockOffset ? restockQty : 0;
        stock = Math.max(0, stock + sold - restock);
      }
    }

    // ─── 6. Sharhlar (30% javobsiz) ───
    const reviewsByShop = new Map<string, UzumReview[]>();
    const reviewCounts = new Map<string, number>();
    let reviewSeq = 0;

    for (const sku of skus) {
      const delivered = deliveredBySku.get(sku.id) ?? 0;
      const count = Math.round(delivered * rng.float(0.04, 0.08));

      for (let i = 0; i < count; i += 1) {
        reviewSeq += 1;
        const roll = rng.next();
        const rating = roll < 0.55 ? 5 : roll < 0.77 ? 4 : roll < 0.88 ? 3 : roll < 0.95 ? 2 : 1;
        const text =
          rating >= 4
            ? rng.pick(REVIEW_POSITIVE)
            : rating === 3
              ? rng.pick(REVIEW_NEUTRAL)
              : rng.pick(REVIEW_NEGATIVE);
        // 30% sharh javobsiz qoladi
        const answered = rng.chance(0.7);
        const published = this.dateOfIndex(rng.int(0, HISTORY_DAYS - 1));

        push(reviewsByShop, sku.shopId, {
          id: `demo-rev-${String(reviewSeq).padStart(5, '0')}`,
          productId: sku.productId,
          skuId: sku.id,
          rating,
          text,
          author: rng.pick(REVIEW_AUTHORS),
          publishedAt: new Date(
            published.getTime() + (rng.int(8, 22) * 3600 + rng.int(0, 59) * 60) * 1000,
          ).toISOString(),
          answered,
          answerText: answered ? rng.pick(REVIEW_ANSWERS) : undefined,
        });

        reviewCounts.set(sku.productId, (reviewCounts.get(sku.productId) ?? 0) + 1);
      }
    }

    // Mahsulot kartochkasidagi sharhlar sonini to'ldiramiz
    for (const list of productsByShop.values()) {
      for (const product of list) product.reviewsCount = reviewCounts.get(product.id) ?? 0;
    }

    // ─── 7. Xarajatlar (komissiya/logistika buyurtmalarda, saqlash — StorageFee'da) ───
    const expensesByShop = new Map<string, UzumExpense[]>();

    for (let day = 0; day < HISTORY_DAYS; day += 1) {
      const date = toISODay(this.dateOfIndex(day));
      for (const shop of shops) {
        if (rng.chance(0.6)) {
          push(expensesByShop, shop.id, {
            date,
            category: 'marketing',
            amount: roundTo(rng.int(50_000, 450_000), 1_000),
            note: rng.pick(MARKETING_NOTES),
          });
        }
        if (day % 7 === 0) {
          push(expensesByShop, shop.id, {
            date,
            category: 'other',
            amount: roundTo(rng.int(80_000, 320_000), 1_000),
            note: rng.pick(OTHER_NOTES),
          });
        }
      }
    }

    return {
      shops,
      skus,
      productsByShop,
      ordersByShop,
      stocksByShop,
      returnsByShop,
      lossesByShop,
      storageByShop,
      reviewsByShop,
      expensesByShop,
    };
  }
}

/**
 * ISO sana oraliqqa tushadimi.
 * `YYYY-MM-DD` ko'rinishidagi qiymatlar kun aniqligida taqqoslanadi (soat farqi xalaqit bermasin).
 */
function inRange(iso: string, from: Date, to: Date): boolean {
  const dayOnly = iso.length === 10;
  const t = Date.parse(dayOnly ? `${iso}T00:00:00.000Z` : iso);
  if (Number.isNaN(t)) return false;
  const lo = dayOnly ? startOfUtcDay(from).getTime() : from.getTime();
  const hi = dayOnly ? startOfUtcDay(to).getTime() : to.getTime();
  return t >= lo && t <= hi;
}
