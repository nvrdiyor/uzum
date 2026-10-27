/**
 * Uzum FBO tariflari — pullik saqlash va logistika yig'imi. YAGONA joy:
 * tarif o'zgarsa faqat shu fayl o'zgaradi.
 *
 * Manba — Uzum sotuvchi qo'llanmasi, 01.06.2026 dan amalda:
 *  - saqlash:   https://seller.uzum.uz/manual/uz/6.product-preparation/#pullik-saqlash-tariflari
 *  - logistika: https://seller.uzum.uz/manual/uz/3.tariffs/
 *
 * Ilgari saqlash bitta stavka edi — 120 so'm/l/kun, hech qachon o'lchanmagan
 * (constants.ts DEFAULTS) va haqiqiydan 10 baravar katta: unit-iqtisod,
 * nolikvid va ombor sahifasidagi saqlash taxminlari shuncha oshib chiqardi.
 * Bepul davr ham yo'q edi. Qo'llanmada esa saqlash qabul qilingan kundan
 * emas, AYLANMADAN hisoblanadi (2026-10-24).
 */

/** Qo'llanmadagi tariflar shu sanadan amalda */
export const TARIFF_EFFECTIVE_FROM = '2026-06-01';

/** Litrga aylantirishda suzuvchi nuqta xatosi (2,0000001 → 3) yuqoriga yaxlitlanmasin */
const EPS = 1e-6;

/** Tovar hajmi, litr: (uzunlik × eni × balandlik, mm) ÷ 1 000 000 */
export function volumeFromDims(lengthMm: number, widthMm: number, heightMm: number): number {
  if (![lengthMm, widthMm, heightMm].every((v) => Number.isFinite(v) && v > 0)) return 0;
  return (lengthMm * widthMm * heightMm) / 1_000_000;
}

/**
 * Hisobga olinadigan litr — butun songa YUQORIGA (1,6 → 2; 5,2 → 6; 104,3 → 105).
 * 1 litrdan kichik tovar ham 1 litr. Hajm noma'lum bo'lsa 0.
 */
export function billableLiters(volumeL: number | null | undefined): number {
  if (!volumeL || !Number.isFinite(volumeL) || volumeL <= 0) return 0;
  return Math.max(1, Math.ceil(volumeL - EPS));
}

// ─────────────────────────── Logistika yig'imi ───────────────────────────

/** Logistika yig'imi: sotilgan har bir dona uchun BIR MARTA, qaytarilsa qaytariladi */
export const LOGISTICS_FEE = {
  /** 1 litrgacha (shu jumladan) */
  base: 5_250,
  /** Har bir qo'shimcha litr uchun */
  perExtraLiter: 250,
  /** Bitta dona uchun eng ko'pi */
  max: 50_000,
  /** Uzumda o'lchami (VGT) yo'q tovar — hajmidan qat'i nazar */
  noDimensions: 50_000,
  /** Sim-kartalar — qat'iy */
  simCard: 20_000,
} as const;

/**
 * Bitta dona uchun logistika yig'imi. `hasDimensions: false` — Uzum
 * kartochkasida uzunlik/eni/balandlik yo'q: qo'llanma bo'yicha 50 000 so'm.
 * Hajm 0 yoki noma'lum bo'lsa (bizda o'lcham saqlanmagan) — null: taxminni
 * chaqiruvchi o'zi tanlaydi (constants.ts `logisticsForVolume` zaxirasi).
 */
export function logisticsFee(volumeL: number | null | undefined, opts: { hasDimensions?: boolean } = {}): number | null {
  if (opts.hasDimensions === false) return LOGISTICS_FEE.noDimensions;
  const liters = billableLiters(volumeL);
  if (liters === 0) return null;
  return Math.min(LOGISTICS_FEE.max, LOGISTICS_FEE.base + (liters - 1) * LOGISTICS_FEE.perExtraLiter);
}

/**
 * Uzum ushlagan logistikadan uning hisoblagan litrini tiklash (VGH tekshiruvi):
 * 5 250 → 1 l, 5 500 → 2 l ... Chegara (50 000) va o'lchamsiz tarif aniq litr
 * bermaydi — null.
 */
export function litersFromLogistics(fee: number): number | null {
  if (!Number.isFinite(fee) || fee < LOGISTICS_FEE.base || fee >= LOGISTICS_FEE.max) return null;
  return Math.round((fee - LOGISTICS_FEE.base) / LOGISTICS_FEE.perExtraLiter) + 1;
}

// ─────────────────────────── Pullik saqlash ───────────────────────────

export type StorageTariffKind = 'standard' | 'reduced';

interface StorageTier {
  /** Aylanma shu kungacha (shu jumladan) */
  upTo: number;
  /** So'm / litr / kun */
  rate: number;
}

/**
 * Aylanma (kun) bo'yicha tarif. 0–60 kun — bepul (barcha toifalar uchun).
 * "Imtiyozli" — qo'llanmaning 1-ilovasidagi toifalar (kiyim, poyabzal,
 * aksessuarlar, tekstil, oshxona buyumlari...).
 */
export const STORAGE_TARIFF: Record<StorageTariffKind, { tiers: StorageTier[]; capPerItemDay: number }> = {
  standard: {
    tiers: [
      { upTo: 60, rate: 0 },
      { upTo: 180, rate: 12 },
      { upTo: 360, rate: 18 },
      { upTo: Number.POSITIVE_INFINITY, rate: 24 },
    ],
    capPerItemDay: 5_000,
  },
  reduced: {
    tiers: [
      { upTo: 60, rate: 0 },
      { upTo: 180, rate: 12 },
      { upTo: 360, rate: 14 },
      { upTo: Number.POSITIVE_INFINITY, rate: 18 },
    ],
    capPerItemDay: 3_000,
  },
};

/** Aylanma shu kungacha bo'lsa saqlash bepul */
export const FREE_TURNOVER_DAYS = 60;
/** Aylanma oxirgi shuncha kun bo'yicha hisoblanadi; bu oynada sotuv bo'lmasa — eng qimmat (361+) guruh */
export const TURNOVER_WINDOW_DAYS = 15;
/** Yangi SKU sotuvga chiqqanidan keyin bepul turadigan kunlar (2-ilova toifalari — 60) */
export const NEW_SKU_FREE_DAYS = { default: 30, extended: 60 } as const;

/**
 * Aylanma, kun = o'rtacha kunlik qoldiq ÷ o'rtacha kunlik sotuv (oxirgi 15
 * kun, dona), yuqoriga yaxlitlanadi. Sotuv bo'lmasa — cheksiz (qo'llanma:
 * "361 kun va undan ko'p" guruhi). Qoldiq yo'q bo'lsa 0.
 */
export function turnoverDays(avgDailyStock: number, avgDailySales: number): number {
  if (!(avgDailyStock > 0)) return 0;
  if (!(avgDailySales > 0)) return Number.POSITIVE_INFINITY;
  return Math.ceil(avgDailyStock / avgDailySales - EPS);
}

/** Litr va kun uchun stavka (so'm); aylanma ≤ 60 bo'lsa 0 */
export function storageRatePerLiterDay(turnover: number, kind: StorageTariffKind = 'standard'): number {
  const tier = STORAGE_TARIFF[kind].tiers.find((t) => turnover <= t.upTo);
  return tier?.rate ?? 0;
}

export interface StorageFeeInput {
  /** Bugungi qoldiq, dona (to'lov har kuni joriy qoldiq bo'yicha) */
  units: number;
  volumeL: number | null | undefined;
  turnover: number;
  kind?: StorageTariffKind;
  /** Sotuvga chiqqanidan beri kunlar — yangi SKU bepul davri uchun; noma'lum bo'lsa tekshirilmaydi */
  daysOnSale?: number | null;
  /** 2-ilova toifasi: yangi SKU uchun 60 kun bepul (aks holda 30) */
  extendedNewSkuFree?: boolean;
}

/**
 * Bir kunlik saqlash to'lovi (so'm): dona × min(litr × stavka, bir tovar uchun chegara).
 * Yangi SKU bepul davrida va aylanma ≤ 60 kunda — 0. Hajm noma'lum bo'lsa 0
 * (o'ylab topilmaydi — chaqiruvchi "hajm yo'q" deb ko'rsatadi).
 */
export function storageFeePerDay(inp: StorageFeeInput): number {
  const kind = inp.kind ?? 'standard';
  if (!(inp.units > 0)) return 0;
  const freeDays = inp.extendedNewSkuFree ? NEW_SKU_FREE_DAYS.extended : NEW_SKU_FREE_DAYS.default;
  if (inp.daysOnSale !== null && inp.daysOnSale !== undefined && inp.daysOnSale < freeDays) return 0;
  const rate = storageRatePerLiterDay(inp.turnover, kind);
  if (rate === 0) return 0;
  const liters = billableLiters(inp.volumeL);
  const perItem = Math.min(liters * rate, STORAGE_TARIFF[kind].capPerItemDay);
  return inp.units * perItem;
}

/*
 * Toifa bo'yicha tarif turi. Uzum toifa nomini sotuvchi tilida (o'zbek yoki
 * rus) beradi va ID'si bizda saqlanmaydi, shuning uchun moslik KALIT SO'Z
 * bo'yicha — taxminiy. Sahifalar qaysi tarif qo'llanganini ko'rsatadi,
 * sotuvchi xatoni darhol ko'radi.
 */
const REDUCED_CATEGORY = [
  /aksessuar|аксессуар/i,
  /kiyim|одежд/i,
  /poyabzal|обув/i,
  /tekstil|текстил/i,
  /oshxona|кухн/i,
  /qoplama|отделочн/i,
];

/*
 * 2-ilova (yangi SKU uchun 60 kun bepul). 1-ilova bilan bir xil emas:
 * "Qurilish va ta'mirlash → Qoplama materiallari" bu ro'yxatda YO'Q, shuning
 * uchun `...REDUCED_CATEGORY` olinmaydi. Ruschasi ikki ma'noli nomlar
 * ("отделочные материалы" — qoplama ham, Klimat → pardozlash ham) qo'shilmaydi:
 * xato "bepul" deyishdan ko'ra 30 kun deb olgan xavfsizroq.
 */
const EXTENDED_FREE_CATEGORY = [
  /aksessuar|аксессуар/i,
  /kiyim|одежд/i,
  /poyabzal|обув/i,
  /tekstil|текстил/i,
  /oshxona|кухн/i,
  /bolalar|детск|игрушк|o‘yinchoq|o'yinchoq|aravacha|коляск|taglik|подгузн/i,
  /maishiy kimyo|бытов.*хими|tozalash|yuvish|стирк|уборк/i,
  /go‘zallik|go'zallik|kosmetika|косметик|красот|parvarish|уход|atir|парфюм|pardoz|manikyur|маникюр|aroma/i,
  /gigiyena|гигиен/i,
  /salomatlik|здоров|optika|оптик|tibbiy|медицин|massaj|массаж/i,
  /hayvon|животн|зоотовар/i,
  /kanselyariya|канцеляр/i,
  /kitob|книг|adabiyot|литератур/i,
  /sport|спорт|turizm|туризм|baliq|рыбалк/i,
  /xobbi|хобби|творчеств|ijod|musiqa|музык/i,
  /avtotovar|avto tovar|автотовар/i,
];

export function storageTariffKind(category: string | null | undefined): StorageTariffKind {
  return category && REDUCED_CATEGORY.some((re) => re.test(category)) ? 'reduced' : 'standard';
}

export function hasExtendedNewSkuFree(category: string | null | undefined): boolean {
  return Boolean(category && EXTENDED_FREE_CATEGORY.some((re) => re.test(category)));
}
