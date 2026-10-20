/**
 * Qoldiq qiymati: do'kondagi tovarlar hammasi JORIY narxda sotilsa, sotuvchiga
 * qancha tushadi va undan qancha foyda qoladi.
 *
 *   sotuv summasi  = qoldiq × narx
 *   tushum (payout) = qoldiq × (narx − Uzum komissiyasi − logistika)
 *   foyda          = tushum − qoldiq × (tannarx + qo'shimcha xarajat) − soliq
 *
 * Komissiya va logistika — shu SKU'ning oxirgi 90 kunlik HAQIQIY sotuvidan
 * (importer ularni kabinetdagi "Yechib olish uchun" summasi bilan tekshiradi),
 * Unit kalkulyatordagi tartibda: SKU sotuvi → Uzum katalogidagi foiz / hajm
 * bo'yicha tarif → kompaniya o'rtachasi → o'lchangan standart.
 * Saqlash, reklama va qaytarishlar kirmaydi — ular sotilish tezligiga bog'liq.
 */
import { DEFAULTS, addDays, businessDayStart, logisticsForVolume, toBusinessDate } from '@savdoiq/shared';
import { aggregateSales } from './common.js';

const WINDOW_DAYS = 90;

export interface StockValueSku {
  id: string;
  price: number;
  purchasePrice: number;
  extraCost: number;
  volumeL: number;
  commissionPct: number;
}

export interface StockValueLine {
  /** Bir donadan sotuvchiga tushadigan summa (komissiya va logistikadan keyin) */
  payoutPerUnit: number;
  commissionPct: number;
  logisticsPerUnit: number;
  /** Komissiya va logistika haqiqiy sotuvdan olinganmi yoki taxminmi */
  source: 'sales' | 'estimate';
}

export interface StockValueTotals {
  units: number;
  /** qoldiq × (tannarx + qo'shimcha) — tannarxi kiritilgan SKU'lar bo'yicha */
  cost: number;
  /** qoldiq × joriy narx */
  retail: number;
  /** Hammasi sotilsa Uzum to'laydigan summa */
  payout: number;
  /** tushum − tannarx − soliq; faqat tannarxi kiritilgan SKU'lar bo'yicha */
  profit: number;
  /** Qoldig'i bor, lekin tannarxi kiritilmagan SKU'lar — foyda ularsiz hisoblangan */
  unitsNoCost: number;
  skusNoCost: number;
  /** Qoldig'i bor, narxi noma'lum (0) SKU'lar — tushumga kirmagan */
  skusNoPrice: number;
}

/**
 * Bitta SKU qoldig'ining qiymati. `profit` — tannarx kiritilmagan bo'lsa null
 * (foydani tannarxsiz hisoblab bo'lmaydi).
 */
export function stockLineValue(
  s: StockValueSku,
  units: number,
  line: StockValueLine | undefined,
  taxRatePct: number,
): { cost: number; retail: number; payout: number; profit: number | null } {
  const payout = units * (line?.payoutPerUnit ?? 0);
  const unitCost = s.purchasePrice + s.extraCost;
  return {
    cost: s.purchasePrice > 0 ? units * unitCost : 0,
    retail: units * s.price,
    payout,
    profit: s.purchasePrice > 0 ? payout - units * unitCost - (units * s.price * taxRatePct) / 100 : null,
  };
}

/**
 * Har SKU uchun bir donadan tushum. `stockOf` — SKU qoldig'i (dona).
 * Sotuvi bo'lmagan SKU'larda kompaniya o'rtachasi ishlatiladi.
 */
export async function estimateStockValue(
  storeIds: string[],
  skus: StockValueSku[],
  stockOf: (skuId: string) => number,
  taxRatePct: number,
): Promise<{ lines: Map<string, StockValueLine>; totals: StockValueTotals }> {
  const toExclusive = addDays(businessDayStart(toBusinessDate(new Date())), 1);
  const sales = await aggregateSales(storeIds, addDays(toExclusive, -WINDOW_DAYS), toExclusive);

  let allRevenue = 0;
  let allCommission = 0;
  let allLogistics = 0;
  let allUnits = 0;
  for (const agg of sales.values()) {
    allRevenue += agg.revenue;
    allCommission += agg.commission;
    allLogistics += agg.logistics;
    allUnits += agg.units;
  }
  const companyCommissionPct = allRevenue > 0 ? (allCommission / allRevenue) * 100 : 0;
  const companyLogistics = allUnits > 0 ? allLogistics / allUnits : 0;

  const lines = new Map<string, StockValueLine>();
  const totals: StockValueTotals = {
    units: 0,
    cost: 0,
    retail: 0,
    payout: 0,
    profit: 0,
    unitsNoCost: 0,
    skusNoCost: 0,
    skusNoPrice: 0,
  };

  for (const s of skus) {
    const agg = sales.get(s.id);
    const fromSales = Boolean(agg && agg.units > 0 && agg.revenue > 0);
    const commissionPct =
      (fromSales && agg ? (agg.commission / agg.revenue) * 100 : 0) ||
      s.commissionPct ||
      companyCommissionPct ||
      DEFAULTS.commissionPct;
    const logisticsPerUnit =
      (fromSales && agg ? agg.logistics / agg.units : 0) ||
      (s.volumeL > 0 ? logisticsForVolume(s.volumeL) : 0) ||
      companyLogistics ||
      DEFAULTS.logisticsPerUnit;
    const payoutPerUnit = s.price > 0 ? Math.max(0, s.price * (1 - commissionPct / 100) - logisticsPerUnit) : 0;
    const line: StockValueLine = { payoutPerUnit, commissionPct, logisticsPerUnit, source: fromSales ? 'sales' : 'estimate' };
    lines.set(s.id, line);

    const units = stockOf(s.id);
    if (units <= 0) continue;
    const v = stockLineValue(s, units, line, taxRatePct);
    totals.units += units;
    totals.retail += v.retail;
    totals.payout += v.payout;
    totals.cost += v.cost;
    if (s.price <= 0) totals.skusNoPrice += 1;
    if (v.profit !== null) totals.profit += v.profit;
    else {
      totals.unitsNoCost += units;
      totals.skusNoCost += 1;
    }
  }

  return { lines, totals };
}
