/**
 * Mahsulotning bir dona unit-iqtisodi kirish qiymatlari — mahsulot sahifasi
 * (GET /products/:id `unitInput` → `unit`) va raqobatchilar narxi
 * (routes/competitors.ts: mahsulot kartasi va "Narxlar xaritasi") BITTA
 * hisobdan (2026-10-24).
 *
 * Ilgari bu hisob products.ts ichida edi. Raqobatchi narxini nol foyda narxi
 * bilan solishtirish uchun u ikkinchi joyda kerak bo'ldi: nusxa olinsa, ertaga
 * sahifadagi "Zararsizlik narxi" va xaritadagi "raqobatchi nol foyda narxidan
 * past" ogohlantirishi bir-biridan ajralib ketardi. Chaqiruvchi davr sotuvini
 * (`aggregateSales`, mahsulot do'koni bo'yicha) va saqlash taxminini o'zi beradi.
 */
import { DEFAULTS, pct, round, safeDiv, type UnitCalcInput } from '@savdoiq/shared';
import type { SalesAgg } from './common.js';
import { getStorageTurnover } from './storage-turnover.js';

/** Unit-iqtisodga kerakli SKU maydonlari (products.ts loadProducts bilan bir xil manba va tartib) */
export interface UnitSku {
  id: string;
  purchasePrice: number;
  extraCost: number;
  /** Uzum hisoblagan oylik saqlash to'lovi, bir dona uchun (0 — Uzum bermagan) */
  storagePerItem: number;
}

/** SKU → { 30 kunlik prognoz, bugungi to'lov, FBO qoldig'i } (aylanma tarifi bo'yicha) */
export type StorageEstimates = Map<string, { fee30d: number | null; feeToday: number | null; stock: number }>;

/** Davr sotuvidan unit-iqtisodga kerakli qism (`aggregateSales` / `aggregateSalesNet` qiymati) */
export type UnitSales = ReadonlyMap<
  string,
  Pick<SalesAgg, 'units' | 'revenue' | 'commission' | 'logistics' | 'cogs' | 'returns'>
>;

/**
 * Haqiqiy to'lov yo'q SKU'lar uchun aylanma tarifi bo'yicha taxmin:
 * SKU → { 30 kunlik prognoz, bugungi to'lov, FBO qoldig'i }. Faqat Uzum
 * omborida qoldig'i bor SKU'lar (qolganiga saqlash olinmaydi); hajmi
 * noma'lum SKU summasi o'ylab topilmaydi (null).
 */
export async function storageEstimateBySku(storeIds: string[]): Promise<StorageEstimates> {
  const out: StorageEstimates = new Map();
  if (storeIds.length === 0) return out;
  const turnover = await getStorageTurnover(storeIds);
  for (const r of turnover.rows) out.set(r.skuId, { fee30d: r.fee30d, feeToday: r.feeToday, stock: r.stock });
  return out;
}

/**
 * Kartochkadagi joriy narx — katalogdagi eng arzon (musbat) SKU narxi, arxivdagilar
 * ham (products.ts buildCard `minPrice` bilan bir xil qoida). Davrda sotuv
 * bo'lmaganda unit-iqtisod shu narxda hisoblanadi.
 */
export function catalogMinPrice(skus: ReadonlyArray<{ price: number }>): number {
  let min = Number.POSITIVE_INFINITY;
  for (const s of skus) if (s.price > 0 && s.price < min) min = s.price;
  return Number.isFinite(min) ? round(min) : 0;
}

/**
 * Unit-iqtisod (1 dona uchun, davr ma'lumotlari asosida): narx, tannarx,
 * komissiya va logistika — davrdagi sotuvdan, sotuv bo'lmasa katalog va
 * standart qiymatlardan. `calcUnitEconomics` ga beriladi.
 *
 *  - `fallbackPrice` — davrda sotuv bo'lmaganda narx (kartochkadagi `minPrice`);
 *  - `taxRate` — kompaniya soliq stavkasi (yo'q bo'lsa standart);
 *  - `storageEstimates` — FAQAT Uzum saqlash to'lovini bermaganda chaqiriladi
 *    (mahsulot do'koni bo'yicha aylanma taxmini).
 */
export async function productUnitInput(
  skus: ReadonlyArray<UnitSku>,
  sales: UnitSales,
  ctx: {
    fallbackPrice: number;
    taxRate: number | null | undefined;
    storageEstimates: () => Promise<StorageEstimates>;
  },
): Promise<UnitCalcInput> {
  let units = 0;
  let revenue = 0;
  let commission = 0;
  let logistics = 0;
  let cogs = 0;
  let returns = 0;
  for (const s of skus) {
    const agg = sales.get(s.id);
    units += agg?.units ?? 0;
    revenue += agg?.revenue ?? 0;
    commission += agg?.commission ?? 0;
    logistics += agg?.logistics ?? 0;
    cogs += agg?.cogs ?? 0;
    returns += agg?.returns ?? 0;
  }
  const avgExtra = skus.length ? skus.reduce((s, x) => s + x.extraCost, 0) / skus.length : 0;
  /** Uzumning o'zi bergan oylik saqlash to'lovi (bo'lmasa 0) */
  const avgStoragePerItem = skus.length ? skus.reduce((s, x) => s + x.storagePerItem, 0) / skus.length : 0;
  /*
   * Uzum bermagan bo'lsa — aylanma tarifi (Saqlash sahifasi bilan bir xil
   * hisob): mahsulotning Uzum omboridagi bir donasi uchun bugungi kunlik
   * to'lov = SKU'lar bugungi to'lovi ÷ FBO qoldig'i. Aylanma 60 kungacha
   * bo'lsa — 0 (bepul). Qoldiq yo'q yoki hajm noma'lum — 0, o'ylab topilmaydi.
   */
  let storageEstimate = 0;
  if (avgStoragePerItem <= 0) {
    const estimates = await ctx.storageEstimates();
    let fee = 0;
    let fboUnits = 0;
    for (const s of skus) {
      const e = estimates.get(s.id);
      if (!e || e.feeToday === null) continue;
      fee += e.feeToday;
      fboUnits += e.stock;
    }
    storageEstimate = fboUnits > 0 ? fee / fboUnits : 0;
  }
  const price = units > 0 ? safeDiv(revenue, units) : ctx.fallbackPrice;
  const purchasePrice =
    units > 0
      ? safeDiv(cogs, units)
      : safeDiv(
          skus.reduce((s, x) => s + x.purchasePrice, 0),
          skus.length,
        );

  return {
    price: round(price),
    purchasePrice: round(purchasePrice),
    commissionPct: revenue > 0 ? pct(commission, revenue) : DEFAULTS.commissionPct,
    logistics: units > 0 ? round(safeDiv(logistics, units)) : DEFAULTS.logisticsPerUnit,
    /*
     * Saqlash: avval Uzumning O'ZI hisoblagan qiymat (oylik → kunlik),
     * faqat u bo'lmaganda aylanma tarifi bo'yicha taxmin (yuqorida).
     *
     * Ilgari bu yerda to'g'ridan-to'g'ri hajm × DEFAULTS.storagePerLiterPerDay
     * turardi. O'sha konstanta TEKSHIRILMAGAN va haqiqiydan ~10 barobar katta
     * edi (120 so'm/l/kun, bepul davrsiz), ya'ni mahsulot kartasidagi marja va
     * ROI unga bevosita bog'liq edi — oshirilgan saqlash xarajati foydali
     * tovarni zararli ko'rsatib, sotuvchi uni assortimentdan chiqarib
     * tashlashi mumkin edi (2026-10-24).
     */
    storagePerDay: round(avgStoragePerItem > 0 ? avgStoragePerItem / 30 : storageEstimate),
    storageDays: 30,
    packaging: 0,
    otherCost: round(avgExtra),
    taxPct: ctx.taxRate ?? DEFAULTS.taxPct,
    buyoutPct: units + returns > 0 ? round(pct(units, units + returns)) : DEFAULTS.buyoutPct,
    returnLogistics: 0,
    qty: 1,
  };
}
