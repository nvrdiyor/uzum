import type { ImportCalcInput, ImportCalcResult, UnitCalcInput, UnitCalcResult } from './types.js';

export const round = (n: number, d = 0): number => {
  const p = Math.pow(10, d);
  return Math.round((n + Number.EPSILON) * p) / p;
};

export const safeDiv = (a: number, b: number): number => (b === 0 ? 0 : a / b);

export const pct = (part: number, total: number): number => round(safeDiv(part, total) * 100, 2);

export function deltaPct(current: number, previous: number | null | undefined): number | null {
  if (previous === null || previous === undefined) return null;
  if (previous === 0) return current === 0 ? 0 : null;
  return round(((current - previous) / Math.abs(previous)) * 100, 1);
}

/**
 * Unit-iqtisod kalkulyatori — sayt va API bir xil formuladan foydalanadi.
 * Barcha kirish qiymatlari UZS.
 */
export function calcUnitEconomics(input: UnitCalcInput): UnitCalcResult {
  const qty = Math.max(1, input.qty || 1);
  const buyout = Math.min(100, Math.max(1, input.buyoutPct || 100)) / 100;

  const soldUnits = qty * buyout;
  const revenue = input.price * soldUnits;

  const commission = (revenue * (input.commissionPct || 0)) / 100;
  // Logistika sotilgan tovarlar uchun + qaytganlar uchun qaytish logistikasi
  const returnedUnits = qty - soldUnits;
  const logisticsTotal = input.logistics * qty + input.returnLogistics * returnedUnits;
  const storageTotal = input.storagePerDay * Math.max(0, input.storageDays) * qty;
  const cogs = input.purchasePrice * qty;
  const packaging = (input.packaging || 0) * qty;
  const other = (input.otherCost || 0) * qty;
  const tax = (revenue * (input.taxPct || 0)) / 100;

  const costTotal = commission + logisticsTotal + storageTotal + cogs + packaging + other + tax;
  const netProfit = revenue - costTotal;

  const margin = pct(netProfit, revenue);
  const investment = cogs + packaging;
  const roi = pct(netProfit, investment);
  const markup = pct(netProfit, cogs);

  // Nol foyda nuqtasi: bitta dona uchun minimal sotuv narxi
  const variablePerUnitPct = ((input.commissionPct || 0) + (input.taxPct || 0)) / 100;
  /**
   * Bir dona uchun o'zgarmas xarajatlar. Sotib olish darajasiga bo'lish FAQAT
   * yakuniy bosqichda bir marta bajariladi — ilgari logistika ham shu yerda,
   * ham oxirida bo'linib, nol foyda narxi oshirib ko'rsatilardi.
   */
  const fixedPerUnit =
    input.purchasePrice +
    (input.packaging || 0) +
    (input.otherCost || 0) +
    input.logistics +
    input.returnLogistics * (1 - buyout) +
    input.storagePerDay * Math.max(0, input.storageDays);
  const breakEvenPrice = variablePerUnitPct >= 1 ? 0 : round(fixedPerUnit / (1 - variablePerUnitPct) / buyout);

  const perUnitProfit = safeDiv(netProfit, qty);
  const breakEvenQty = perUnitProfit > 0 ? Math.ceil(safeDiv(storageTotal, perUnitProfit)) : 0;

  return {
    revenue: round(revenue),
    commission: round(commission),
    logisticsTotal: round(logisticsTotal),
    storageTotal: round(storageTotal),
    cogs: round(cogs),
    tax: round(tax),
    costTotal: round(costTotal),
    netProfit: round(netProfit),
    netProfitPerUnit: round(perUnitProfit),
    margin,
    markup,
    roi,
    breakEvenPrice,
    breakEvenQty,
  };
}

/** Qoldiq holatini kunlar bo'yicha aniqlash */
export function stockStatus(
  daysLeft: number | null,
  stock: number,
  daysWithoutSale: number,
): 'critical' | 'low' | 'ok' | 'excess' | 'dead' {
  if (stock <= 0) return 'critical';
  if (daysWithoutSale >= 45) return 'dead';
  if (daysLeft === null) return 'dead';
  if (daysLeft <= 7) return 'critical';
  if (daysLeft <= 14) return 'low';
  if (daysLeft >= 90) return 'excess';
  return 'ok';
}

/** ABC guruhlash: 80/95 chegaralari bo'yicha */
export function abcGroup(cumulativeShare: number): 'A' | 'B' | 'C' {
  if (cumulativeShare <= 80) return 'A';
  if (cumulativeShare <= 95) return 'B';
  return 'C';
}

/** Oddiy chiziqli prognoz — o'rtacha kunlik sotuv asosida */
export function forecastUnits(avgDaily: number, days: number): number {
  return Math.max(0, Math.round(avgDaily * days));
}

/** Zaxira davri uchun kerakli buyurtma miqdori */
export function recommendedQty(avgDaily: number, coverDays: number, stock: number, leadDays = 7): number {
  const need = avgDaily * (coverDays + leadDays) - stock;
  return Math.max(0, Math.ceil(need));
}

// ─────────────────────── Xitoydan import (PDD) kalkulyatori ───────────────────────

/** Narxni yaxlitlash: 0 bo'lsa yaxlitlanmaydi, aks holda yuqoriga (ceil) */
export function roundPrice(value: number, step: number): number {
  if (!step || step <= 0) return Math.round(value);
  return Math.ceil(value / step) * step;
}

/**
 * PDD (Xitoy) narxidan Uzum'da qo'yish kerak bo'lgan narxni hisoblaydi.
 *
 * Tannarx  = PDD narxi × kurs + (og'irlik/1000) × kargo
 * Narx     = (tannarx + foyda + yetkazish) / (1 − komissiya% − reklama%)
 *
 * Komissiya va reklama SOTUV NARXIDAN olinadi, shuning uchun narx tenglama orqali topiladi.
 * Yakuniy taqsimot yaxlitlangan narx bo'yicha hisoblanadi — yaxlitlash farqi foydaga qo'shiladi.
 */
/**
 * Ma'lumot yetarli bo'lmaganda ishlatiladigan bozor bo'yicha odatiy qiymatlar.
 * Server ham, sayt ham shu qiymatlardan foydalanadi — internet yo'q yoki
 * so'rov xato bo'lsa ham kalkulyator ishlayveradi.
 */
export const IMPORT_CALC_FALLBACK: ImportCalcInput = {
  weightGr: 300,
  pddPrice: 10,
  rate: 1_600,
  cargoPerKg: 80_000,
  commissionPct: 30,
  adsPct: 10,
  deliveryFee: 6_000,
  profitMultiplier: 2,
  roundStep: 1_000,
};

export function calcImportPrice(input: ImportCalcInput): ImportCalcResult {
  const rate = Math.max(0, input.rate || 0);
  const weightKg = Math.max(0, input.weightGr || 0) / 1000;
  const cargoPerKg = Math.max(0, input.cargoPerKg || 0);
  const commissionPct = Math.max(0, Math.min(95, input.commissionPct || 0));
  const adsPct = Math.max(0, Math.min(95, input.adsPct || 0));
  const deliveryFee = Math.max(0, input.deliveryFee || 0);
  const profitMultiplier = Math.max(0, input.profitMultiplier ?? 0);
  const step = input.roundStep ?? 1000;

  const goodsCost = (input.pddPrice || 0) * rate;
  const cargoCost = weightKg * cargoPerKg;
  const cost = goodsCost + cargoCost;

  const variableRate = (commissionPct + adsPct) / 100;
  // Komissiya + reklama 100% dan oshsa tenglamaning yechimi yo'q
  const valid = variableRate < 1;

  const targetProfit = cost * profitMultiplier;
  const rawPrice = valid ? (cost + targetProfit + deliveryFee) / (1 - variableRate) : 0;
  const price = valid ? roundPrice(rawPrice, step) : 0;

  const commission = (price * commissionPct) / 100;
  const ads = (price * adsPct) / 100;
  const netProfit = price - commission - ads - deliveryFee - cost;

  // "Maksimal tannarx" qoidasi: tannarx ≤ narx × a − b
  const a = valid ? (1 - variableRate) / (1 + profitMultiplier) : 0;
  const b = valid ? deliveryFee / (1 + profitMultiplier) : 0;

  return {
    goodsCost: round(goodsCost),
    cargoCost: round(cargoCost),
    cost: round(cost),
    rawPrice: round(rawPrice),
    price: round(price),
    commission: round(commission),
    ads: round(ads),
    delivery: round(deliveryFee),
    netProfit: round(netProfit),
    margin: pct(netProfit, price),
    roi: pct(netProfit, cost),
    /** Tannarxning sotuv narxidagi ulushi */
    costShare: pct(cost, price),
    maxCostFactor: round(a, 4),
    maxCostOffset: round(b),
    valid,
  };
}

/** Berilgan Uzum narxi uchun ruxsat etilgan maksimal tannarx (tovar + kargo) */
export function maxCostForPrice(price: number, factor: number, offset: number): number {
  return Math.max(0, round(price * factor - offset));
}

/** Maksimal tannarxdan PDD'dagi maksimal yuan narxini topish */
export function maxPddPrice(maxCost: number, cargoCost: number, rate: number): number {
  if (rate <= 0) return 0;
  return Math.max(0, round((maxCost - cargoCost) / rate, 2));
}
