/**
 * SavdoIQ — namunaviy (demo) ma'lumot generatori.
 *
 * Ishga tushirish:  npm run db:seed
 *
 * Xususiyatlari:
 *  • Barcha tasodifiy qiymatlar mulberry32 PRNG orqali hosil qilinadi (Math.random ISHLATILMAYDI),
 *    shuning uchun skript har safar AYNAN bir xil ma'lumot yaratadi (determinizm).
 *  • Qayta ishga tushirilganda avval eski demo yozuvlar (kompaniya nomi bo'yicha) tozalanadi.
 *  • Moliyaviy hisob har bir buyurtma pozitsiyasida:
 *        revenue   = sellPrice * qty
 *        payout    = revenue - commission - logistics
 *        netProfit = payout - cogs - soliq        (cogs = purchasePrice * qty)
 */

import { createCipheriv, createHash } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { prisma } from './index.js';

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

/** Urug' (seed) — o'zgartirilsa boshqa, lekin baribir barqaror ma'lumot chiqadi */
const SEED = 20_260_903;
const rand = mulberry32(SEED);

/** [min, max] oralig'idagi butun son */
const rInt = (min: number, max: number): number => min + Math.floor(rand() * (max - min + 1));
/** [min, max) oralig'idagi kasr son */
const rFloat = (min: number, max: number): number => min + rand() * (max - min);
/** Ro'yxatdan tasodifiy element */
const pick = <T>(list: readonly T[]): T => list[Math.floor(rand() * list.length)];
/** p ehtimollik bilan true */
const chance = (p: number): boolean => rand() < p;
/** Pul qiymatini yaxlitlash (UZS — butun son) */
const money = (n: number): number => Math.round(n);
/** Narxni `step` ga karrali qilib yaxlitlash */
const roundTo = (n: number, step: number): number => Math.round(n / step) * step;

// ─────────────────────────── Sana yordamchilari ───────────────────────────

const DAY_MS = 86_400_000;
/** Tarix chuqurligi (buyurtmalar uchun) */
const HISTORY_DAYS = 120;
/** Qoldiq snapshot'lari uchun kunlar soni */
const STOCK_DAYS = 60;

const startOfUtcDay = (d: Date): Date =>
  new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));

/** Bugun (UTC yarim tuni) */
const TODAY = startOfUtcDay(new Date());

/** Bugundan `offset` kun (manfiy — o'tmish) */
const dayAt = (offset: number): Date => new Date(TODAY.getTime() + offset * DAY_MS);

/** Tarix indeksidan (0 — eng eski, HISTORY_DAYS-1 — bugun) sana */
const dateOfIndex = (i: number): Date => dayAt(i - (HISTORY_DAYS - 1));

/** Kun ichidagi vaqt (soat 6:00–21:59 oralig'ida) */
const timeInDay = (day: Date): Date =>
  new Date(day.getTime() + (rInt(6, 21) * 3600 + rInt(0, 59) * 60 + rInt(0, 59)) * 1000);

const addHours = (d: Date, h: number): Date => new Date(d.getTime() + h * 3_600_000);

const ymKey = (d: Date): string => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;

// ─────────────────────────── Shifrlash (apps/api/src/lib/crypto.ts bilan mos) ───────────────────────────

/**
 * API kalitni AES-256-GCM bilan shifrlaydi. Format: v1.iv.tag.ciphertext (base64url).
 * IV determinizm uchun `ivSeed` dan hosil qilinadi (demo ma'lumot uchun xavfsiz).
 */
function encryptSecret(plain: string, ivSeed: string): string {
  const hex = process.env.ENCRYPTION_KEY ?? '';
  const key = /^[0-9a-fA-F]{64}$/.test(hex)
    ? Buffer.from(hex, 'hex')
    : createHash('sha256')
        .update(`savdoiq:${process.env.SESSION_SECRET ?? 'dev-session-secret-change-me-please-32ch'}`)
        .digest();
  const iv = createHash('sha256').update(ivSeed).digest().subarray(0, 12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ['v1', iv.toString('base64url'), tag.toString('base64url'), enc.toString('base64url')].join('.');
}

const maskKey = (key: string): string => (key.length <= 6 ? '••••' : `••••${key.slice(-4)}`);

// ─────────────────────────── Katalog ta'riflari ───────────────────────────

interface ProductDef {
  title: string;
  category: string;
  brand: string;
  minPrice: number;
  maxPrice: number;
  /** Uzum komissiyasi, % */
  commissionPct: number;
  weightGr: number;
  volumeL: number;
  variants: string[];
}

/** LOOTBOX TECH — elektronika va gadjetlar */
const TECH_CATALOG: ProductDef[] = [
  { title: 'Simsiz quloqchin AirDots Pro 3', category: 'Elektronika', brand: 'Xiaomi', minPrice: 185_000, maxPrice: 265_000, commissionPct: 11, weightGr: 120, volumeL: 0.4, variants: ['Qora', 'Oq', 'Ko‘k'] },
  { title: 'Powerbank 20000 mAh QC 22.5W', category: 'Elektronika', brand: 'Hoco', minPrice: 148_000, maxPrice: 215_000, commissionPct: 10, weightGr: 420, volumeL: 0.8, variants: ['Qora', 'Ko‘k'] },
  { title: 'Smart soat Watch Fit 3', category: 'Elektronika', brand: 'Huawei', minPrice: 620_000, maxPrice: 830_000, commissionPct: 9, weightGr: 210, volumeL: 0.9, variants: ['Qora', 'Kumush', 'Pushti'] },
  { title: 'Himoya oynasi 9D Full Glue', category: 'Aksessuarlar', brand: 'Baseus', minPrice: 25_000, maxPrice: 46_000, commissionPct: 17, weightGr: 60, volumeL: 0.15, variants: ['iPhone 13', 'iPhone 15', 'Samsung A55', 'Redmi Note 13'] },
  { title: 'Tezkor zaryadlovchi Type-C 33W', category: 'Aksessuarlar', brand: 'Ldnio', minPrice: 96_000, maxPrice: 152_000, commissionPct: 12, weightGr: 180, volumeL: 0.35, variants: ['Oq', 'Qora'] },
  { title: 'Bluetooth kolonka SoundGo 3', category: 'Elektronika', brand: 'JBL', minPrice: 345_000, maxPrice: 520_000, commissionPct: 10, weightGr: 640, volumeL: 1.6, variants: ['Qora', 'Ko‘k'] },
  { title: 'Simsiz sichqoncha M220 Silent', category: 'Kompyuter', brand: 'Logitech', minPrice: 122_000, maxPrice: 188_000, commissionPct: 11, weightGr: 150, volumeL: 0.5, variants: ['Qora', 'Kulrang'] },
  { title: 'Mexanik klaviatura K617 RGB', category: 'Kompyuter', brand: 'Redragon', minPrice: 385_000, maxPrice: 565_000, commissionPct: 9, weightGr: 780, volumeL: 2.4, variants: ['RGB Qora', 'RGB Oq'] },
  { title: 'Avto videoregistrator Dash Cam 2K', category: 'Avto tovarlar', brand: '70mai', minPrice: 690_000, maxPrice: 945_000, commissionPct: 8, weightGr: 320, volumeL: 1.1, variants: ['Standart'] },
  { title: 'USB-C kabel 100W nayloncha', category: 'Aksessuarlar', brand: 'Ugreen', minPrice: 45_000, maxPrice: 88_000, commissionPct: 15, weightGr: 90, volumeL: 0.2, variants: ['1 m', '2 m', '3 m'] },
  { title: 'Noutbuk sumkasi suv o‘tkazmaydigan', category: 'Kompyuter', brand: 'Tigernu', minPrice: 168_000, maxPrice: 245_000, commissionPct: 13, weightGr: 720, volumeL: 6.5, variants: ['15.6"', '17"'] },
  { title: 'Web-kamera Full HD 1080p mikrofonli', category: 'Kompyuter', brand: 'A4Tech', minPrice: 255_000, maxPrice: 385_000, commissionPct: 10, weightGr: 240, volumeL: 0.7, variants: ['1080p'] },
  { title: 'Avtomobil telefon ushlagichi', category: 'Avto tovarlar', brand: 'Borofone', minPrice: 38_000, maxPrice: 68_000, commissionPct: 16, weightGr: 130, volumeL: 0.4, variants: ['Magnitli', 'Klipsali'] },
  { title: 'Portativ SSD NV Pro USB 3.2', category: 'Kompyuter', brand: 'Netac', minPrice: 480_000, maxPrice: 720_000, commissionPct: 8, weightGr: 110, volumeL: 0.3, variants: ['512 GB', '1 TB'] },
  { title: 'Smart lampa RGB Wi-Fi', category: 'Aqlli uy', brand: 'Yeelight', minPrice: 86_000, maxPrice: 135_000, commissionPct: 13, weightGr: 140, volumeL: 0.45, variants: ['E27', 'E14'] },
  { title: 'Gaming naushnik H120 7.1', category: 'Kompyuter', brand: 'Bloody', minPrice: 215_000, maxPrice: 335_000, commissionPct: 11, weightGr: 380, volumeL: 2.2, variants: ['Qora', 'Qizil'] },
];

/** SAMARQAND SAVDO — uy-ro'zg'or, kiyim, go'zallik */
const HOME_CATALOG: ProductDef[] = [
  { title: 'Paxta choyshab to‘plami 2 kishilik', category: 'Uy tekstili', brand: 'Ipak Yo‘li', minPrice: 215_000, maxPrice: 345_000, commissionPct: 12, weightGr: 1600, volumeL: 8, variants: ['Bej', 'Ko‘k', 'Kulrang'] },
  { title: 'Termos vakuumli 1.2 L', category: 'Uy-ro‘zg‘or', brand: 'Peterhof', minPrice: 145_000, maxPrice: 232_000, commissionPct: 13, weightGr: 700, volumeL: 2.5, variants: ['Kumush', 'Qora'] },
  { title: 'Cho‘yan qozon qopqog‘i bilan', category: 'Uy-ro‘zg‘or', brand: 'Xorazm Metall', minPrice: 320_000, maxPrice: 485_000, commissionPct: 10, weightGr: 5200, volumeL: 14, variants: ['6 L', '8 L'] },
  { title: 'Elektr choynak 1.8 L', category: 'Maishiy texnika', brand: 'Vitek', minPrice: 182_000, maxPrice: 290_000, commissionPct: 11, weightGr: 1100, volumeL: 5.5, variants: ['Oq', 'Qora'] },
  { title: 'Erkaklar futbolkasi Premium paxta', category: 'Kiyim', brand: 'Uz Cotton', minPrice: 66_000, maxPrice: 118_000, commissionPct: 16, weightGr: 220, volumeL: 1.2, variants: ['M', 'L', 'XL'] },
  { title: 'Ayollar yozgi ko‘ylagi', category: 'Kiyim', brand: 'Dilnoza Style', minPrice: 185_000, maxPrice: 325_000, commissionPct: 17, weightGr: 320, volumeL: 1.8, variants: ['S', 'M', 'L'] },
  { title: 'Bolalar kombinezoni issiq', category: 'Bolalar tovarlari', brand: 'BebeKids', minPrice: 148_000, maxPrice: 245_000, commissionPct: 15, weightGr: 540, volumeL: 3.2, variants: ['86', '92', '98'] },
  { title: 'Yuz uchun krem SPF50 50 ml', category: 'Go‘zallik', brand: 'Nivea', minPrice: 78_000, maxPrice: 128_000, commissionPct: 14, weightGr: 90, volumeL: 0.25, variants: ['50 ml'] },
  { title: 'Shampun 400 ml', category: 'Go‘zallik', brand: 'Head & Shoulders', minPrice: 55_000, maxPrice: 98_000, commissionPct: 15, weightGr: 460, volumeL: 0.6, variants: ['Klassik', 'Mentol'] },
  { title: 'Sport krossovka Runner Air', category: 'Poyabzal', brand: 'Sportmax', minPrice: 345_000, maxPrice: 525_000, commissionPct: 14, weightGr: 850, volumeL: 5.5, variants: ['40', '41', '42', '43'] },
  { title: 'Ayollar sumkasi eko-charm', category: 'Aksessuarlar', brand: 'Miss Bag', minPrice: 225_000, maxPrice: 385_000, commissionPct: 16, weightGr: 640, volumeL: 4.5, variants: ['Qora', 'Jigarrang'] },
  { title: 'Dazmol bug‘li 2400W', category: 'Maishiy texnika', brand: 'Philips', minPrice: 385_000, maxPrice: 565_000, commissionPct: 10, weightGr: 1500, volumeL: 4.8, variants: ['Standart'] },
  { title: 'Chang yutgich konteynerli 1800W', category: 'Maishiy texnika', brand: 'Artel', minPrice: 720_000, maxPrice: 948_000, commissionPct: 8, weightGr: 5600, volumeL: 22, variants: ['Standart'] },
  { title: 'Idish-tovoq to‘plami 24 predmet', category: 'Uy-ro‘zg‘or', brand: 'Zepter Home', minPrice: 420_000, maxPrice: 680_000, commissionPct: 12, weightGr: 4200, volumeL: 16, variants: ['24 pr'] },
  { title: 'Anatomik yostiq memory foam', category: 'Uy tekstili', brand: 'Uyqu', minPrice: 96_000, maxPrice: 165_000, commissionPct: 14, weightGr: 900, volumeL: 6, variants: ['50x70', '60x40'] },
  { title: 'Gilam 160x230 zamonaviy naqsh', category: 'Uy tekstili', brand: 'Samarqand Gilam', minPrice: 480_000, maxPrice: 880_000, commissionPct: 9, weightGr: 7800, volumeL: 28, variants: ['Bej', 'Yashil'] },
];

// ─────────────────────────── Yordamchi ro'yxatlar ───────────────────────────

const CITIES = [
  'Toshkent', 'Samarqand', 'Buxoro', 'Farg‘ona', 'Namangan',
  'Andijon', 'Qarshi', 'Nukus', 'Urganch', 'Jizzax', 'Termiz', 'Navoiy',
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
  'Заказываю второй раз — всё стабильно хорошо.',
];

const REVIEW_NEUTRAL = [
  'Yaxshi, lekin qadoq biroz ezilgan edi.',
  'Normal mahsulot, narxiga mos.',
  'Rangi suratdagidan bir oz farq qiladi, qolgani yaxshi.',
  'Нормально, но упаковка помятая.',
  'В целом неплохо, ожидал чуть лучше.',
];

const REVIEW_NEGATIVE = [
  'Yetkazib berish kechikdi, mahsulot esa o‘rtacha.',
  'Ishlamadi, qaytarib yubordim.',
  'Sifati past, tavsiya qilmayman.',
  'Пришло с браком, буду возвращать.',
  'Не соответствует описанию, размер меньше.',
];

const REVIEW_ANSWERS = [
  'Sharhingiz uchun rahmat! Fikringiz biz uchun juda muhim.',
  'Rahmat! Yana kutamiz — yangi mahsulotlarni ham ko‘rib chiqing.',
  'Uzr so‘raymiz, muammoni hal qilamiz. Iltimos, biz bilan bog‘laning.',
  'Спасибо за отзыв! Рады, что вам понравилось.',
  'Приносим извинения за неудобства, свяжитесь с нами — решим вопрос.',
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

const LOSS_TYPES = ['lost', 'damaged', 'shortage'] as const;
const LOSS_NOTES: Record<(typeof LOSS_TYPES)[number], string> = {
  lost: 'Ombor inventarizatsiyasida topilmadi',
  damaged: 'Yetkazib berishda shikastlangan',
  shortage: 'Qabulda kam chiqdi',
};

// ─────────────────────────── Generatsiya modellari ───────────────────────────

type StockKind = 'normal' | 'out' | 'excess';

interface GenSku {
  id: string;
  storeId: string;
  productId: string;
  sku: string;
  title: string;
  price: number;
  purchasePrice: number;
  commissionPct: number;
  weightGr: number;
  volumeL: number;
  /** Sotuv ehtimoli og'irligi (ABC tahlili ma'noli chiqishi uchun) */
  popularity: number;
  stockKind: StockKind;
  /** Har bir tarix kuni bo'yicha sotilgan dona */
  soldByDay: number[];
  totalUnits: number;
}

interface CompanySpec {
  key: string;
  name: string;
  taxRate: number;
  plan: 'trial' | 'business';
  planDays: number;
  planStartedDaysAgo: number;
  storeTitles: string[];
  catalog: ProductDef[];
  baseOrdersPerDay: number;
  ownerUserId: string;
  ownerName: string;
}

// ─────────────────────────── Yig'iladigan massivlar ───────────────────────────

const companyRows: Prisma.CompanyCreateManyInput[] = [];
const membershipRows: Prisma.MembershipCreateManyInput[] = [];
const subscriptionRows: Prisma.SubscriptionCreateManyInput[] = [];
const uzumAccountRows: Prisma.UzumAccountCreateManyInput[] = [];
const storeRows: Prisma.StoreCreateManyInput[] = [];
const productRows: Prisma.ProductCreateManyInput[] = [];
const skuRows: Prisma.SkuCreateManyInput[] = [];
const costPriceRows: Prisma.CostPriceCreateManyInput[] = [];
const orderRows: Prisma.OrderCreateManyInput[] = [];
const orderItemRows: Prisma.OrderItemCreateManyInput[] = [];
const stockRows: Prisma.StockSnapshotCreateManyInput[] = [];
const returnRows: Prisma.ReturnRecordCreateManyInput[] = [];
const lossRows: Prisma.LossRecordCreateManyInput[] = [];
const storageFeeRows: Prisma.StorageFeeCreateManyInput[] = [];
const reviewRows: Prisma.ReviewCreateManyInput[] = [];
const expenseRows: Prisma.ExpenseCreateManyInput[] = [];
const syncJobRows: Prisma.SyncJobCreateManyInput[] = [];
const notificationRows: Prisma.NotificationCreateManyInput[] = [];
const invoiceRows: Prisma.InvoiceCreateManyInput[] = [];
const referralBonusRows: Prisma.ReferralBonusCreateManyInput[] = [];
const shipmentRows: Prisma.ShipmentCreateManyInput[] = [];
const shipmentItemRows: Prisma.ShipmentItemCreateManyInput[] = [];
const scenarioRows: Prisma.UnitScenarioCreateManyInput[] = [];
const auditRows: Prisma.AuditLogCreateManyInput[] = [];

/** Mahsulot reytingini sharhlardan hisoblash uchun */
const productReviewStats = new Map<string, { sum: number; count: number }>();

// ─────────────────────────── Foydalanuvchilar ───────────────────────────

const DEMO_COMPANY_NAMES = ['LOOTBOX TECH', 'SAMARQAND SAVDO'];

const ADMIN_ID = 'demo_user_admin';
const OWNER1_ID = 'demo_user_owner1';
const OWNER2_ID = 'demo_user_owner2';

const DEMO_USERS: Prisma.UserCreateManyInput[] = [
  {
    id: ADMIN_ID,
    telegramId: '100000001',
    username: 'savdoiq_admin',
    firstName: 'Sardor',
    lastName: 'Adminov',
    phone: '+998901112233',
    languageCode: 'uz',
    role: 'admin',
    status: 'active',
    referralCode: 'DEMOADMN',
    botChatId: '100000001',
    lastLoginAt: addHours(TODAY, 9),
    createdAt: dayAt(-180),
  },
  {
    id: OWNER1_ID,
    telegramId: '100000002',
    username: 'aziz_seller',
    firstName: 'Aziz',
    lastName: 'Rahimov',
    phone: '+998901234567',
    languageCode: 'uz',
    role: 'user',
    status: 'active',
    referralCode: 'DEMOAZIZ',
    botChatId: '100000002',
    lastLoginAt: addHours(TODAY, 8),
    createdAt: dayAt(-HISTORY_DAYS - 5),
  },
  {
    id: OWNER2_ID,
    telegramId: '100000003',
    username: 'dilnoza_shop',
    firstName: 'Dilnoza',
    lastName: 'Yusupova',
    phone: '+998977778899',
    languageCode: 'ru',
    role: 'user',
    status: 'active',
    referralCode: 'DEMODILN',
    referredById: ADMIN_ID,
    botChatId: '100000003',
    lastLoginAt: addHours(TODAY, 7),
    createdAt: dayAt(-HISTORY_DAYS - 3),
  },
];

// ─────────────────────────── Kompaniya spetsifikatsiyalari ───────────────────────────

const COMPANY_SPECS: CompanySpec[] = [
  {
    key: 'lootbox',
    name: 'LOOTBOX TECH',
    taxRate: 1,
    plan: 'trial',
    planDays: 7,
    planStartedDaysAgo: 2,
    // Sinov tarifida faqat 1 do'kon ulash mumkin
    storeTitles: ['LOOTBOX TECH'],
    catalog: TECH_CATALOG,
    baseOrdersPerDay: 17,
    ownerUserId: OWNER1_ID,
    ownerName: 'Aziz Rahimov',
  },
  {
    key: 'samarqand',
    name: 'SAMARQAND SAVDO',
    taxRate: 4,
    plan: 'business',
    planDays: 30,
    planStartedDaysAgo: 8,
    storeTitles: ['Samarqand Savdo', 'Samarqand Home'],
    catalog: HOME_CATALOG,
    baseOrdersPerDay: 23,
    ownerUserId: OWNER2_ID,
    ownerName: 'Dilnoza Yusupova',
  },
];

// ─────────────────────────── Kompaniya generatori ───────────────────────────

interface CompanyResult {
  companyId: string;
  storeIds: string[];
  skus: GenSku[];
  products: number;
  orders: number;
  items: number;
  revenue: number;
  netProfit: number;
}

function buildCompany(spec: CompanySpec, index: number): CompanyResult {
  const companyId = `demo_co_${spec.key}`;
  const accountId = `demo_acc_${spec.key}`;
  const now = new Date();

  companyRows.push({
    id: companyId,
    name: spec.name,
    taxRate: spec.taxRate,
    currency: 'UZS',
    onboarded: true,
    onboardStep: 'done',
    createdAt: dayAt(-HISTORY_DAYS - 2),
  });

  membershipRows.push({
    id: `demo_mb_${spec.key}_owner`,
    userId: spec.ownerUserId,
    companyId,
    role: 'owner',
    createdAt: dayAt(-HISTORY_DAYS - 2),
  });

  const planStart = dayAt(-spec.planStartedDaysAgo);
  subscriptionRows.push({
    id: `demo_sub_${spec.key}`,
    companyId,
    plan: spec.plan,
    status: 'active',
    startedAt: planStart,
    expiresAt: new Date(planStart.getTime() + spec.planDays * DAY_MS),
    autoRenew: spec.plan !== 'trial',
    trialUsed: true,
  });

  const apiKey = `demo-uzum-key-${spec.key}-${1000 + index}`;
  uzumAccountRows.push({
    id: accountId,
    companyId,
    label: 'Uzum kabinet',
    apiKeyEnc: encryptSecret(apiKey, `${spec.key}:key`),
    apiSecretEnc: encryptSecret(`${apiKey}-secret`, `${spec.key}:secret`),
    keyHint: maskKey(apiKey),
    status: 'active',
    lastSyncAt: addHours(now, -1),
    nextSyncAt: addHours(now, 1),
    syncIntervalM: spec.plan === 'trial' ? 60 : 15,
    createdAt: dayAt(-HISTORY_DAYS - 1),
  });

  // ── Do'konlar ──
  const storeIds: string[] = spec.storeTitles.map((title, i) => {
    const id = `demo_st_${spec.key}_${i + 1}`;
    storeRows.push({
      id,
      companyId,
      uzumAccountId: accountId,
      uzumShopId: `${90_000 + index * 10 + i}`,
      title,
      status: 'active',
      createdAt: dayAt(-HISTORY_DAYS - 1),
    });
    return id;
  });

  // ── Mahsulotlar va SKU'lar ──
  const skus: GenSku[] = [];
  spec.catalog.forEach((def, pi) => {
    const storeId = storeIds[pi % storeIds.length];
    const productId = `demo_pr_${spec.key}_${String(pi + 1).padStart(2, '0')}`;

    productRows.push({
      id: productId,
      storeId,
      uzumProductId: `${700_000 + index * 1000 + pi}`,
      title: def.title,
      category: def.category,
      brand: def.brand,
      imageUrl: null,
      status: 'active',
      rating: 0,
      reviewsCount: 0,
      createdAt: dayAt(-HISTORY_DAYS - 1),
    });

    def.variants.forEach((variant, vi) => {
      const skuId = `demo_sk_${spec.key}_${String(pi + 1).padStart(2, '0')}_${vi + 1}`;
      const price = roundTo(rFloat(def.minPrice, def.maxPrice), 1000);
      const purchasePrice = roundTo(price * rFloat(0.35, 0.6), 100);
      const oldPrice = roundTo(price * rFloat(1.06, 1.32), 1000);
      const code = `${spec.key.slice(0, 3).toUpperCase()}-${String(pi + 1).padStart(2, '0')}${String(vi + 1).padStart(2, '0')}`;

      // Ommaboplik: Zipf-ga o'xshash taqsimot — bir nechta "hit" tovar, qolganlari sekin sotiladi
      const popularity = Math.pow(rFloat(0.12, 1), 2.1) * (chance(0.12) ? 3.4 : 1);
      const stockKind: StockKind = chance(0.14) ? 'out' : chance(0.18) ? 'excess' : 'normal';

      skuRows.push({
        id: skuId,
        productId,
        storeId,
        uzumSkuId: `${8_000_000 + index * 10_000 + pi * 100 + vi}`,
        sku: code,
        barcode: `478${String(100_000_000 + index * 100_000 + pi * 100 + vi)}`,
        title: def.variants.length > 1 ? `${def.title} — ${variant}` : def.title,
        imageUrl: null,
        price,
        oldPrice,
        purchasePrice,
        // extraCost = 0: netProfit = payout - cogs - soliq formulasi buzilmasligi uchun
        extraCost: 0,
        weightGr: def.weightGr,
        volumeL: def.volumeL,
        archived: false,
        createdAt: dayAt(-HISTORY_DAYS - 1),
      });

      // Tannarx tarixi: boshlang'ich qiymat + ba'zilarida o'zgarish
      if (chance(0.3)) {
        costPriceRows.push({
          id: `demo_cp_${skuId}_0`,
          skuId,
          value: roundTo(purchasePrice * rFloat(0.86, 0.96), 100),
          extraCost: 0,
          fromDate: dayAt(-HISTORY_DAYS),
          note: 'Boshlang‘ich partiya',
        });
        costPriceRows.push({
          id: `demo_cp_${skuId}_1`,
          skuId,
          value: purchasePrice,
          extraCost: 0,
          fromDate: dayAt(-rInt(30, 70)),
          note: 'Yangi partiya narxi',
        });
      } else {
        costPriceRows.push({
          id: `demo_cp_${skuId}_0`,
          skuId,
          value: purchasePrice,
          extraCost: 0,
          fromDate: dayAt(-HISTORY_DAYS),
          note: 'Boshlang‘ich partiya',
        });
      }

      skus.push({
        id: skuId,
        storeId,
        productId,
        sku: code,
        title: def.title,
        price,
        purchasePrice,
        commissionPct: def.commissionPct,
        weightGr: def.weightGr,
        volumeL: def.volumeL,
        popularity,
        stockKind,
        soldByDay: new Array<number>(HISTORY_DAYS).fill(0),
        totalUnits: 0,
      });
    });
  });

  // ── Buyurtmalar ──
  const byStore = new Map<string, GenSku[]>();
  for (const s of skus) {
    const list = byStore.get(s.storeId) ?? [];
    list.push(s);
    byStore.set(s.storeId, list);
  }
  const cumByStore = new Map<string, number[]>();
  for (const [storeId, list] of byStore) {
    const cum: number[] = [];
    let acc = 0;
    for (const s of list) {
      acc += s.popularity;
      cum.push(acc);
    }
    cumByStore.set(storeId, cum);
  }

  const weightedSku = (storeId: string): GenSku => {
    const list = byStore.get(storeId) as GenSku[];
    const cum = cumByStore.get(storeId) as number[];
    const target = rand() * cum[cum.length - 1];
    let lo = 0;
    let hi = cum.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (cum[mid] < target) lo = mid + 1;
      else hi = mid;
    }
    return list[lo];
  };

  // Hafta kunlari bo'yicha mavsumiylik (0 — yakshanba)
  const weekFactor = [1.12, 0.92, 0.95, 1.0, 1.06, 1.18, 1.28];

  let orderSeq = 0;
  let itemSeq = 0;
  let totalRevenue = 0;
  let totalNet = 0;
  const taxByMonth = new Map<string, number>();

  for (let d = 0; d < HISTORY_DAYS; d += 1) {
    const day = dateOfIndex(d);
    // O'sish trendi: 0.72 → 1.32
    const trend = 0.72 + (d / (HISTORY_DAYS - 1)) * 0.6;
    const season = weekFactor[day.getUTCDay()];
    const noise = rFloat(0.82, 1.2);
    const ordersToday = Math.max(2, Math.round(spec.baseOrdersPerDay * trend * season * noise));
    const daysAgo = HISTORY_DAYS - 1 - d;

    for (let o = 0; o < ordersToday; o += 1) {
      orderSeq += 1;
      const orderId = `demo_or_${spec.key}_${String(orderSeq).padStart(5, '0')}`;
      const storeId = storeIds.length === 1 ? storeIds[0] : chance(0.62) ? storeIds[0] : storeIds[1];

      const dr = rand();
      const deliveryType: 'FBO' | 'FBS' | 'DBS' = dr < 0.7 ? 'FBO' : dr < 0.95 ? 'FBS' : 'DBS';
      const logisticsBase = deliveryType === 'FBO' ? 12_000 : deliveryType === 'FBS' ? 15_000 : 21_000;

      let status: string;
      if (daysAgo === 0) status = chance(0.5) ? 'new' : 'processing';
      else if (daysAgo === 1) status = chance(0.35) ? 'processing' : 'delivered';
      else {
        const r = rand();
        status = r < 0.03 ? 'canceled' : r < 0.1 ? 'returned' : 'delivered';
      }

      const orderedAt = timeInDay(day);
      const paidAt = status === 'canceled' ? null : addHours(orderedAt, rInt(1, 6));
      const deliveredAt =
        status === 'delivered' || status === 'returned' ? addHours(orderedAt, rInt(24, 96)) : null;
      const returnedAt =
        status === 'returned' && deliveredAt ? addHours(deliveredAt, rInt(48, 240)) : null;

      const linesCount = chance(0.72) ? 1 : chance(0.75) ? 2 : 3;
      const usedSkus = new Set<string>();

      let orderRevenue = 0;
      let orderCommission = 0;
      let orderLogistics = 0;
      let orderDiscount = 0;
      let orderQty = 0;

      for (let li = 0; li < linesCount; li += 1) {
        const sku = weightedSku(storeId);
        if (usedSkus.has(sku.id)) continue;
        usedSkus.add(sku.id);

        const qty = chance(0.76) ? 1 : chance(0.72) ? 2 : 3;
        const discountPct = chance(0.26) ? rFloat(4, 16) : 0;
        const sellPrice = roundTo(sku.price * (1 - discountPct / 100), 500);
        const revenue = money(sellPrice * qty);
        const commission = money((revenue * sku.commissionPct) / 100);
        const logisticsUnit = logisticsBase + Math.min(12_000, Math.round((sku.weightGr / 1000) * 2500));
        const logistics = money(logisticsUnit * qty);
        const payout = revenue - commission - logistics;
        const cogs = money(sku.purchasePrice * qty);
        const tax = money((revenue * spec.taxRate) / 100);
        const netProfit = payout - cogs - tax;

        itemSeq += 1;
        orderItemRows.push({
          id: `demo_oi_${spec.key}_${String(itemSeq).padStart(6, '0')}`,
          orderId,
          skuId: sku.id,
          skuCode: sku.sku,
          title: sku.title,
          qty,
          sellPrice,
          purchasePrice: sku.purchasePrice,
          commission,
          logistics,
          // otherCost = 0 — netProfit = payout - cogs - soliq formulasiga qat'iy amal qilamiz
          otherCost: 0,
          revenue,
          payout,
          netProfit,
          status: status === 'returned' ? 'returned' : status === 'canceled' ? 'canceled' : 'delivered',
          returnedAt,
          orderedAt,
        });

        orderRevenue += revenue;
        orderCommission += commission;
        orderLogistics += logistics;
        orderDiscount += money((sku.price - sellPrice) * qty);
        orderQty += qty;

        if (status !== 'canceled' && status !== 'returned') {
          sku.soldByDay[d] += qty;
          sku.totalUnits += qty;
          totalRevenue += revenue;
          totalNet += netProfit;
          const mk = ymKey(day);
          taxByMonth.set(mk, (taxByMonth.get(mk) ?? 0) + tax);
        }

        // Qaytarish yozuvi
        if (status === 'returned' && returnedAt) {
          returnRows.push({
            id: `demo_rt_${spec.key}_${String(itemSeq).padStart(6, '0')}`,
            storeId,
            skuId: sku.id,
            orderCode: `UZ-${index + 1}-${String(orderSeq).padStart(5, '0')}`,
            qty,
            amount: revenue,
            reason: pick(RETURN_REASONS),
            status: chance(0.75) ? 'returned' : 'refunded',
            returnedAt,
            createdAt: returnedAt,
          });
        }
      }

      orderRows.push({
        id: orderId,
        storeId,
        uzumOrderId: `UZ-${index + 1}-${String(orderSeq).padStart(5, '0')}`,
        status,
        deliveryType,
        orderedAt,
        paidAt,
        deliveredAt,
        buyerCity: pick(CITIES),
        totalAmount: orderRevenue,
        commission: orderCommission,
        logistics: orderLogistics,
        discount: orderDiscount,
        itemsCount: orderQty,
        createdAt: orderedAt,
      });
    }
  }

  // ── Qoldiq snapshot'lari (oxirgi 60 kun) ──
  for (const sku of skus) {
    const avgDaily = Math.max(0.15, sku.totalUnits / HISTORY_DAYS);
    let stock: number;
    if (sku.stockKind === 'excess') stock = Math.round(avgDaily * rFloat(150, 260)) + rInt(40, 120);
    else if (sku.stockKind === 'out') stock = Math.round(avgDaily * rFloat(12, 26)) + rInt(2, 10);
    else stock = Math.round(avgDaily * rFloat(35, 60)) + rInt(10, 30);

    let inTransit = 0;
    let arrivesIn = -1;

    for (let d = HISTORY_DAYS - STOCK_DAYS; d < HISTORY_DAYS; d += 1) {
      const day = dateOfIndex(d);
      const sold = sku.soldByDay[d];
      stock = Math.max(0, stock - sold);

      // Yetib kelgan partiya
      if (arrivesIn === 0) {
        stock += inTransit;
        inTransit = 0;
        arrivesIn = -1;
      } else if (arrivesIn > 0) {
        arrivesIn -= 1;
      }

      // To'ldirish: "tugab qolgan" SKU'lar to'ldirilmaydi
      const reorderPoint = Math.ceil(avgDaily * 12);
      if (sku.stockKind !== 'out' && sku.stockKind !== 'excess' && stock <= reorderPoint && arrivesIn < 0) {
        inTransit = Math.max(15, Math.round(avgDaily * rFloat(35, 55)));
        arrivesIn = rInt(3, 8);
      }

      const fbo = Math.round(stock * 0.72);
      const fbs = Math.round(stock * 0.2);
      const own = Math.max(0, stock - fbo - fbs);
      const reserved = Math.min(fbo, Math.round(sold * rFloat(0.8, 2.2)));

      stockRows.push({
        id: `demo_ss_${sku.id}_${d}`,
        skuId: sku.id,
        storeId: sku.storeId,
        date: day,
        fbo,
        fbs,
        own,
        reserved,
        inTransit,
        createdAt: addHours(day, 3),
      });
    }
  }

  // ── Pullik saqlash (oxirgi 45 kun, ortiqcha qoldiqli SKU'lar bo'yicha) ──
  const storageSkus = skus.filter((s) => s.stockKind === 'excess' || chance(0.22));
  const storageByMonth = new Map<string, number>();
  for (const sku of storageSkus) {
    for (let d = HISTORY_DAYS - 45; d < HISTORY_DAYS; d += 1) {
      const day = dateOfIndex(d);
      const snap = stockRows[stockRows.length - 1];
      void snap;
      const qty = Math.max(0, Math.round((sku.totalUnits / HISTORY_DAYS) * rFloat(90, 190)));
      if (qty === 0) continue;
      const volume = Math.round(qty * sku.volumeL * 100) / 100;
      const amount = money(volume * 120);
      storageFeeRows.push({
        id: `demo_sf_${sku.id}_${d}`,
        storeId: sku.storeId,
        skuId: sku.id,
        date: day,
        qty,
        volumeL: volume,
        amount,
        createdAt: addHours(day, 4),
      });
      const mk = ymKey(day);
      storageByMonth.set(mk, (storageByMonth.get(mk) ?? 0) + amount);
    }
  }

  // ── Yo'qotishlar ──
  for (const storeId of storeIds) {
    const lossCount = rInt(6, 12);
    for (let i = 0; i < lossCount; i += 1) {
      const sku = pick(skus.filter((s) => s.storeId === storeId));
      const qty = rInt(1, 4);
      const amount = money(sku.price * qty);
      const type = pick(LOSS_TYPES);
      const status = chance(0.35) ? 'compensated' : chance(0.5) ? 'claimed' : 'open';
      const happenedAt = dateOfIndex(rInt(HISTORY_DAYS - 100, HISTORY_DAYS - 2));
      lossRows.push({
        id: `demo_ls_${storeId}_${i}`,
        storeId,
        skuId: sku.id,
        type,
        scheme: chance(0.75) ? 'FBO' : 'FBS',
        qty,
        amount,
        compensated: status === 'compensated' ? money(amount * rFloat(0.6, 1)) : 0,
        status,
        happenedAt,
        claimSentAt: status === 'open' ? null : addHours(happenedAt, rInt(24, 120)),
        note: LOSS_NOTES[type],
        createdAt: happenedAt,
      });
    }
  }

  // ── Sharhlar (30% javobsiz) ──
  let reviewSeq = 0;
  const reviewCount = rInt(60, 85);
  for (let i = 0; i < reviewCount; i += 1) {
    const sku = weightedSku(pick(storeIds));
    const r = rand();
    const rating = r < 0.55 ? 5 : r < 0.77 ? 4 : r < 0.87 ? 3 : r < 0.94 ? 2 : 1;
    const text = rating >= 4 ? pick(REVIEW_POSITIVE) : rating === 3 ? pick(REVIEW_NEUTRAL) : pick(REVIEW_NEGATIVE);
    const publishedAt = timeInDay(dateOfIndex(rInt(HISTORY_DAYS - 90, HISTORY_DAYS - 1)));
    const answered = !chance(0.3); // 30% javobsiz qoladi
    reviewSeq += 1;

    reviewRows.push({
      id: `demo_rv_${spec.key}_${String(reviewSeq).padStart(4, '0')}`,
      storeId: sku.storeId,
      productId: sku.productId,
      skuId: sku.id,
      uzumReviewId: `RV-${index + 1}-${String(reviewSeq).padStart(4, '0')}`,
      rating,
      text,
      author: pick(REVIEW_AUTHORS),
      publishedAt,
      answered,
      answerText: answered ? pick(REVIEW_ANSWERS) : null,
      answeredAt: answered ? addHours(publishedAt, rInt(2, 40)) : null,
      autoAnswered: answered ? chance(0.4) : false,
      createdAt: publishedAt,
    });

    const st = productReviewStats.get(sku.productId) ?? { sum: 0, count: 0 };
    st.sum += rating;
    st.count += 1;
    productReviewStats.set(sku.productId, st);
  }

  // ── Xarajatlar: marketing / ombor / soliq ──
  let expenseSeq = 0;
  for (let d = HISTORY_DAYS - 90; d < HISTORY_DAYS; d += 1) {
    if (!chance(0.34)) continue;
    const day = dateOfIndex(d);
    expenseSeq += 1;
    expenseRows.push({
      id: `demo_ex_${spec.key}_mk_${expenseSeq}`,
      companyId,
      storeId: pick(storeIds),
      date: day,
      category: 'marketing',
      amount: money(roundTo(rFloat(280_000, 1_650_000), 10_000)),
      note: pick(['Uzum reklama kampaniyasi', 'Telegram kanal reklamasi', 'Instagram targeting', 'Blogger bilan hamkorlik']),
      source: 'manual',
      createdAt: addHours(day, 10),
    });
  }

  for (const [mk, amount] of storageByMonth) {
    const first = new Date(`${mk}-01T00:00:00.000Z`);
    expenseSeq += 1;
    expenseRows.push({
      id: `demo_ex_${spec.key}_st_${mk}`,
      companyId,
      storeId: storeIds[0],
      date: first,
      category: 'storage',
      amount: money(amount),
      note: `Pullik saqlash (${mk})`,
      source: 'auto',
      createdAt: addHours(first, 5),
    });
  }

  for (const [mk, amount] of taxByMonth) {
    const first = new Date(`${mk}-01T00:00:00.000Z`);
    expenseRows.push({
      id: `demo_ex_${spec.key}_tx_${mk}`,
      companyId,
      date: first,
      category: 'tax',
      amount: money(amount),
      note: `Aylanma soliq ${spec.taxRate}% (${mk})`,
      source: 'auto',
      createdAt: addHours(first, 6),
    });
  }

  // ── Tugallangan sinxronizatsiya ──
  const syncStarted = addHours(now, -3);
  syncJobRows.push({
    id: `demo_sj_${spec.key}`,
    companyId,
    uzumAccountId: accountId,
    type: 'full',
    status: 'done',
    progress: 100,
    step: 'done',
    stepIndex: 9,
    totalSteps: 9,
    message: 'Ma’lumotlar muvaffaqiyatli yig‘ildi',
    error: null,
    attempts: 1,
    scheduledAt: syncStarted,
    startedAt: syncStarted,
    finishedAt: new Date(syncStarted.getTime() + 1800 * 1000),
    etaSeconds: 0,
    createdAt: syncStarted,
  });

  // ── Yetkazmalar (ombor bo'limi uchun) ──
  for (let i = 0; i < 3; i += 1) {
    const shipmentId = `demo_sh_${spec.key}_${i + 1}`;
    const plannedAt = dateOfIndex(HISTORY_DAYS - 1 - rInt(0, 40));
    const status = i === 0 ? 'draft' : i === 1 ? 'sent' : 'accepted';
    shipmentRows.push({
      id: shipmentId,
      companyId,
      storeId: storeIds[i % storeIds.length],
      code: `SP-${TODAY.getUTCFullYear()}-${String(index * 10 + i + 1).padStart(3, '0')}`,
      destination: pick(['Toshkent FC', 'Samarqand FC', 'Farg‘ona FC']),
      status,
      plannedAt,
      acceptedAt: status === 'accepted' ? addHours(plannedAt, 48) : null,
      note: status === 'draft' ? 'Qoralama — to‘ldirilmoqda' : null,
      createdAt: addHours(plannedAt, -72),
    });

    const picked = skus.filter((s) => s.storeId === storeIds[i % storeIds.length]).slice(0, rInt(4, 8));
    picked.forEach((s, j) => {
      const qty = rInt(10, 90);
      shipmentItemRows.push({
        id: `demo_shi_${spec.key}_${i + 1}_${j + 1}`,
        shipmentId,
        skuId: s.id,
        qty,
        accepted: status === 'accepted' ? Math.max(0, qty - rInt(0, 3)) : 0,
        boxes: Math.max(1, Math.ceil(qty / 20)),
      });
    });
  }

  // ── Unit-iqtisod stsenariysi ──
  const sample = skus[0];
  scenarioRows.push({
    id: `demo_us_${spec.key}`,
    companyId,
    name: `${sample.title} — bazaviy hisob`,
    data: JSON.stringify({
      price: sample.price,
      purchasePrice: sample.purchasePrice,
      qty: 100,
      commissionPct: sample.commissionPct,
      logistics: 12_000,
      returnLogistics: 9_000,
      storagePerDay: 120,
      storageDays: 20,
      packaging: 0,
      otherCost: 0,
      taxPct: spec.taxRate,
      buyoutPct: 93,
    }),
    createdAt: dayAt(-12),
  });

  return {
    companyId,
    storeIds,
    skus,
    products: spec.catalog.length,
    orders: orderSeq,
    items: itemSeq,
    revenue: totalRevenue,
    netProfit: totalNet,
  };
}

// ─────────────────────────── Bildirishnomalar / to'lovlar ───────────────────────────

function buildExtras(results: CompanyResult[]): void {
  const now = new Date();

  const notify = (
    id: string,
    userId: string,
    type: string,
    title: string,
    body: string,
    link: string,
    hoursAgo: number,
    read: boolean,
  ): void => {
    const sentAt = addHours(now, -hoursAgo);
    notificationRows.push({
      id,
      userId,
      type,
      channel: chance(0.5) ? 'app' : 'telegram',
      title,
      body,
      link,
      readAt: read ? addHours(sentAt, 1) : null,
      sentAt,
      createdAt: sentAt,
    });
  };

  notify('demo_nt_o1_1', OWNER1_ID, 'stock', 'Qoldiq tugayapti', '4 ta SKU bo‘yicha qoldiq 7 kundan kam qoldi', '/stocks', 3, false);
  notify('demo_nt_o1_2', OWNER1_ID, 'report', 'Kunlik hisobot tayyor', 'Kechagi sotuv va foyda hisoboti', '/dashboard', 14, true);
  notify('demo_nt_o1_3', OWNER1_ID, 'billing', 'Sinov muddati tugayapti', 'Sinov tarifi 5 kundan keyin tugaydi — tarifni tanlang', '/billing', 20, false);
  notify('demo_nt_o1_4', OWNER1_ID, 'review', 'Javobsiz sharhlar', '9 ta sharh javobsiz qoldi', '/reviews', 30, false);
  notify('demo_nt_o1_5', OWNER1_ID, 'sync', 'Sinxronizatsiya yakunlandi', 'Barcha ma’lumotlar yangilandi', '/sync', 3, true);

  notify('demo_nt_o2_1', OWNER2_ID, 'stock', 'Ortiqcha qoldiq', '6 ta SKU bo‘yicha qoldiq 90 kundan ortiq', '/stocks', 5, false);
  notify('demo_nt_o2_2', OWNER2_ID, 'order', 'Bugungi sotuvlar', 'Bugun 24 ta buyurtma qabul qilindi', '/sales', 2, false);
  notify('demo_nt_o2_3', OWNER2_ID, 'report', 'Oylik hisobot', 'O‘tgan oy bo‘yicha P&L tayyor', '/reports', 26, true);
  notify('demo_nt_o2_4', OWNER2_ID, 'loss', 'Yangi yo‘qotish', 'Omborda 3 dona tovar topilmadi', '/losses', 40, true);

  notify('demo_nt_ad_1', ADMIN_ID, 'info', 'Yangi kompaniya', 'SAMARQAND SAVDO Biznes tarifini faollashtirdi', '/admin', 8, false);
  notify('demo_nt_ad_2', ADMIN_ID, 'billing', 'To‘lov qabul qilindi', 'Biznes tarif — 400 000 so‘m', '/admin/billing', 8, true);

  // Admin — ikkinchi kompaniyada menejer (Biznes tarifi bir nechta a'zoga ruxsat beradi)
  membershipRows.push({
    id: 'demo_mb_admin_samarqand',
    userId: ADMIN_ID,
    companyId: 'demo_co_samarqand',
    role: 'manager',
    createdAt: dayAt(-30),
  });

  // Biznes tarif uchun to'langan hisob-faktura + referal bonus
  const paidAt = dayAt(-8);
  invoiceRows.push({
    id: 'demo_inv_samarqand_1',
    companyId: 'demo_co_samarqand',
    plan: 'business',
    months: 1,
    amount: 400_000,
    currency: 'UZS',
    provider: 'click',
    status: 'paid',
    externalId: 'CLK-DEMO-100241',
    paidAt,
    bonusUsed: 0,
    comment: 'Biznes tarif — 1 oy',
    createdAt: addHours(paidAt, -2),
  });
  invoiceRows.push({
    id: 'demo_inv_samarqand_2',
    companyId: 'demo_co_samarqand',
    plan: 'business',
    months: 3,
    amount: 1_200_000,
    currency: 'UZS',
    provider: 'payme',
    status: 'pending',
    payUrl: 'https://checkout.paycom.uz/demo',
    bonusUsed: 0,
    comment: 'Biznes tarif — 3 oy (kutilmoqda)',
    createdAt: dayAt(-1),
  });

  referralBonusRows.push({
    id: 'demo_rb_1',
    referrerId: ADMIN_ID,
    companyId: 'demo_co_samarqand',
    invoiceId: 'demo_inv_samarqand_1',
    amount: 80_000,
    percent: 20,
    status: 'approved',
    createdAt: paidAt,
  });

  auditRows.push(
    { id: 'demo_al_1', userId: OWNER1_ID, action: 'login', entity: 'session', ip: '213.230.100.14', createdAt: addHours(now, -8) },
    { id: 'demo_al_2', userId: OWNER2_ID, action: 'subscription.activate', entity: 'subscription', entityId: 'demo_sub_samarqand', meta: '{"plan":"business"}', createdAt: dayAt(-8) },
    { id: 'demo_al_3', userId: ADMIN_ID, action: 'company.view', entity: 'company', entityId: 'demo_co_samarqand', createdAt: addHours(now, -6) },
  );

  // Umumiy tekshiruv: natijalar bo'sh bo'lsa ham skript xato bermaydi
  void results;
}

// ─────────────────────────── Yozish yordamchisi ───────────────────────────

/** Katta massivlarni bo'laklab yozish (SQLite parametr chegarasi uchun) */
async function insertChunked<T>(rows: T[], write: (batch: T[]) => Promise<unknown>, size = 300): Promise<void> {
  for (let i = 0; i < rows.length; i += size) {
    await write(rows.slice(i, i + size));
  }
}

// ─────────────────────────── Tozalash ───────────────────────────

async function cleanup(): Promise<void> {
  const old = await prisma.company.findMany({
    where: { name: { in: DEMO_COMPANY_NAMES } },
    select: { id: true },
  });
  if (old.length > 0) {
    // Kaskad o'chirish: do'kon → mahsulot → SKU → buyurtma → qoldiq → sharh ...
    await prisma.company.deleteMany({ where: { id: { in: old.map((c) => c.id) } } });
  }

  const telegramIds = DEMO_USERS.map((u) => u.telegramId);
  await prisma.user.deleteMany({ where: { telegramId: { in: telegramIds } } });

  // Nomdosh referal kodlari boshqa foydalanuvchida qolib ketmasin
  await prisma.user.deleteMany({
    where: { referralCode: { in: DEMO_USERS.map((u) => u.referralCode) }, telegramId: { startsWith: '1000000' } },
  });

  // AuditLog.userId — SetNull, shuning uchun foydalanuvchi o'chsa ham yozuv qoladi.
  // Qat'iy id'lar (demo_al_*) takrorlanmasligi uchun ularni alohida tozalaymiz.
  await prisma.auditLog.deleteMany({ where: { id: { startsWith: 'demo_al_' } } });
}

// ─────────────────────────── Asosiy oqim ───────────────────────────

async function main(): Promise<void> {
  const startedAt = Date.now();
  console.log('SavdoIQ — namunaviy ma’lumot yaratilmoqda...\n');

  console.log('  • Eski demo yozuvlar tozalanmoqda');
  await cleanup();

  console.log('  • Foydalanuvchilar va kompaniyalar');
  await prisma.user.createMany({ data: DEMO_USERS });

  const results = COMPANY_SPECS.map((spec, i) => buildCompany(spec, i));
  buildExtras(results);

  // Mahsulot reytinglarini sharhlardan hisoblaymiz
  for (const p of productRows) {
    const st = productReviewStats.get(String(p.id));
    if (!st || st.count === 0) {
      p.rating = Math.round(rFloat(4.1, 4.9) * 10) / 10;
      p.reviewsCount = rInt(0, 12);
      continue;
    }
    p.rating = Math.round((st.sum / st.count) * 10) / 10;
    p.reviewsCount = st.count;
  }

  await prisma.company.createMany({ data: companyRows });
  await prisma.membership.createMany({ data: membershipRows });
  await prisma.subscription.createMany({ data: subscriptionRows });
  await prisma.uzumAccount.createMany({ data: uzumAccountRows });
  await prisma.store.createMany({ data: storeRows });

  console.log('  • Katalog (mahsulot va SKU)');
  await insertChunked(productRows, (b) => prisma.product.createMany({ data: b }));
  await insertChunked(skuRows, (b) => prisma.sku.createMany({ data: b }));
  await insertChunked(costPriceRows, (b) => prisma.costPrice.createMany({ data: b }));

  console.log(`  • Buyurtmalar (${orderRows.length} ta) va pozitsiyalar (${orderItemRows.length} ta)`);
  await insertChunked(orderRows, (b) => prisma.order.createMany({ data: b }), 250);
  await insertChunked(orderItemRows, (b) => prisma.orderItem.createMany({ data: b }), 250);

  console.log(`  • Qoldiq snapshot'lari (${stockRows.length} ta)`);
  await insertChunked(stockRows, (b) => prisma.stockSnapshot.createMany({ data: b }), 400);

  console.log('  • Qaytarish, yo‘qotish, saqlash, sharh va xarajatlar');
  await insertChunked(returnRows, (b) => prisma.returnRecord.createMany({ data: b }));
  await insertChunked(lossRows, (b) => prisma.lossRecord.createMany({ data: b }));
  await insertChunked(storageFeeRows, (b) => prisma.storageFee.createMany({ data: b }), 400);
  await insertChunked(reviewRows, (b) => prisma.review.createMany({ data: b }));
  await insertChunked(expenseRows, (b) => prisma.expense.createMany({ data: b }));

  console.log('  • Yetkazmalar, hisob-fakturalar va bildirishnomalar');
  await insertChunked(shipmentRows, (b) => prisma.shipment.createMany({ data: b }));
  await insertChunked(shipmentItemRows, (b) => prisma.shipmentItem.createMany({ data: b }));
  await prisma.invoice.createMany({ data: invoiceRows });
  await prisma.referralBonus.createMany({ data: referralBonusRows });
  await prisma.syncJob.createMany({ data: syncJobRows });
  await prisma.unitScenario.createMany({ data: scenarioRows });
  await prisma.notification.createMany({ data: notificationRows });
  await prisma.auditLog.createMany({ data: auditRows });

  // ── Hisobot ──
  const totalRevenue = results.reduce((s, r) => s + r.revenue, 0);
  const totalProfit = results.reduce((s, r) => s + r.netProfit, 0);
  const fmt = (n: number): string => new Intl.NumberFormat('ru-RU').format(Math.round(n));
  const seconds = ((Date.now() - startedAt) / 1000).toFixed(1);

  console.log('\n─────────────────────────────────────────────');
  console.log('  Namunaviy ma’lumot tayyor ✔');
  console.log('─────────────────────────────────────────────');
  console.log(`  Kompaniyalar     : ${companyRows.length}  (${DEMO_COMPANY_NAMES.join(', ')})`);
  console.log(`  Do‘konlar        : ${storeRows.length}`);
  console.log(`  Mahsulotlar      : ${productRows.length}`);
  console.log(`  SKU              : ${skuRows.length}`);
  console.log(`  Buyurtmalar      : ${orderRows.length}  (pozitsiyalar: ${orderItemRows.length})`);
  console.log(`  Qoldiq yozuvlari : ${stockRows.length}  (oxirgi ${STOCK_DAYS} kun)`);
  console.log(`  Qaytarishlar     : ${returnRows.length}`);
  console.log(`  Yo‘qotishlar     : ${lossRows.length}`);
  console.log(`  Saqlash yozuvi   : ${storageFeeRows.length}`);
  console.log(`  Sharhlar         : ${reviewRows.length}  (javobsiz: ${reviewRows.filter((r) => !r.answered).length})`);
  console.log(`  Xarajatlar       : ${expenseRows.length}`);
  console.log(`  Bildirishnomalar : ${notificationRows.length}`);
  console.log(`  Tushum (120 kun) : ${fmt(totalRevenue)} so‘m`);
  console.log(`  Sof foyda        : ${fmt(totalProfit)} so‘m`);
  console.log(`  Vaqt             : ${seconds} s`);
  console.log('─────────────────────────────────────────────');
  console.log('  Demo foydalanuvchilar (Telegram ID):');
  console.log('    100000001 — Sardor Adminov (admin)');
  console.log('    100000002 — Aziz Rahimov  → LOOTBOX TECH (Sinov tarifi)');
  console.log('    100000003 — Dilnoza Yusupova → SAMARQAND SAVDO (Biznes tarifi)');
  console.log('─────────────────────────────────────────────');
  console.log('  Saytga kirish uchun: npm run dev, keyin /login sahifasida “Demo rejimda kirish”');
  console.log('─────────────────────────────────────────────\n');
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (err: unknown) => {
    console.error('\n[seed] Xatolik:', err instanceof Error ? err.message : err);
    await prisma.$disconnect();
    process.exit(1);
  });
