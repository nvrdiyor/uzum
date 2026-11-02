import { billableLiters, logisticsFee } from './tariffs.js';

/**
 * Tovarlar jadvali (Unit kalkulyator, `?tab=plan`) — sotuvchilar ishlatadigan
 * Unit.xlsx dagi "Unit Ekonomika" varag'ining hisobi: har qatorda bitta tovar,
 * tepada uchta umumiy stavka. Formulalar va yaxlitlash o'sha varaqdagidek, raqamlar
 * Excel bilan so'mma-so'm bir xil chiqishi uchun (2026-11-02):
 *
 *   Komissiya   = narx × komissiya %
 *   Logistika   = Uzum tarifi: litr yuqoriga yaxlitlanadi, 5 250 + 250 × (litr − 1), ko'pi 50 000
 *   Soliq       = narx × soliq %
 *   Reklama     = narx × DRR %
 *   Pul yechish = (narx − komissiya − logistika) × yechish %
 *   Chiqarishga = narx − komissiya − logistika − pul yechish
 *   Tan narxi   = sotib olish + qadoq + logistika
 *   Sof foyda   = chiqarishga − soliq − reklama − sotib olish − qadoq
 *   ROI         = sof foyda ÷ tan narxi
 *   Nechta kerak = maqsad ÷ sof foyda (yuqoriga); sarmoya = nechta kerak × tan narxi
 *
 * Excel dan farqi: sotib olish narxi bo'sh qatorda Excel foydani baribir hisoblaydi
 * (narxni 0 deb oladi) va keraksiz katta foyda ko'rsatadi; bu yerda narx kiritilmaguncha
 * foyda chiqmaydi. Litr 0 bo'lsa Excel 5 000 so'm logistika bilan, sotuv narxi 0 bo'lsa
 * manfiy foyda bilan, maqsad 0 bo'lsa 0 bilan hisoblaydi — bu yerda ko'rsatkich "—".
 * Butun songa o'ta yaqin litr (1,000001 gacha) yuqoriga yaxlitlanmaydi (tariffs.ts).
 *
 * Bu hisob qaytarish va saqlashni qo'shmaydi (Excel kabi) — bitta tovarni chuqur
 * ko'rish uchun "Unit" bo'limi (`calcUnitEconomics`) bor.
 */

/** Jadvaldagi qatorlar chegarasi */
export const UNIT_PLAN_MAX_ROWS = 200;

/** Reklama (DRR) stavkasining boshlang'ich qiymati — Unit.xlsx dagidek */
export const UNIT_PLAN_DEFAULT_ADS_PCT = 4;

/** Barcha qatorlarga tegishli stavkalar, foizda */
export interface UnitPlanRates {
  /** Soliq — sotuv narxidan */
  taxPct: number;
  /** Pul yechish (ekvayring) — komissiya va logistikadan keyingi summadan */
  withdrawPct: number;
  /** Reklama (DRR) — sotuv narxidan */
  adsPct: number;
}

/** Hisob uchun kiritiladigan qiymatlar; `null` — kiritilmagan */
export interface UnitPlanRowInput {
  /** Gabarit, litr (xom) */
  liters: number | null;
  /** Komissiya, % — kategoriya tanlanganda o'zi qo'yiladi */
  commissionPct: number | null;
  /** Sotib olish narxi (1 dona) */
  purchasePrice: number | null;
  /** Qadoqlash (1 dona); bo'sh — 0 */
  packaging: number | null;
  /** Uzumdagi sotuv narxi */
  price: number | null;
  /** Oyiga sotuv, dona */
  monthlyUnits: number | null;
  /** Maqsad: shuncha sof foyda */
  goalProfit: number | null;
}

/** Saqlanadigan bitta qator */
export interface UnitPlanRow extends UnitPlanRowInput {
  /** Brauzerda yaratiladi — qatorni tahrirlashda barqaror kalit */
  id: string;
  name: string;
  /** Tanlangan kategoriya: komissiya jadvalidagi kalit va tanlangan paytdagi nomi */
  categoryId: string | null;
  categoryName: string | null;
}

export interface UnitPlan {
  rates: UnitPlanRates;
  rows: UnitPlanRow[];
  /** Oxirgi saqlangan vaqt (ISO); hali saqlanmagan bo'lsa null */
  updatedAt: string | null;
}

/** Natija: hisoblab bo'lmaydigan ko'rsatkich — null (katakda "—") */
export interface UnitPlanRowResult {
  /** Hisobga olinadigan litr (yuqoriga yaxlitlangan) */
  billableLiters: number | null;
  commission: number | null;
  logistics: number | null;
  tax: number | null;
  withdraw: number | null;
  ads: number | null;
  /** Tovar tan narxi: sotib olish + qadoq + logistika */
  landedCost: number | null;
  /** Chiqarishga mablag' */
  payout: number | null;
  /** Sof foyda (1 dona) */
  profit: number | null;
  /** Marjinallik: foyda ÷ narx, % */
  marginPct: number | null;
  /** ROI: foyda ÷ tan narxi, % */
  roiPct: number | null;
  monthlyProfit: number | null;
  /** Maqsadga yetish uchun nechta tovar sotish kerak */
  unitsNeeded: number | null;
  /** O'sha tovarlar uchun kerak sarmoya */
  capitalNeeded: number | null;
}

export interface UnitPlanTotals {
  /** Sof foydasi hisoblangan qatorlar */
  computed: number;
  monthlyProfit: number;
  capitalNeeded: number;
}

/**
 * Excel ROUND: yarmi noldan uzoqqa (manfiy summada ham). Excel raqamni 15 xonagacha
 * ko'radi: 125 500 × 4,1% ikkilik hisobda 5145,4999… chiqadi, Excel uchun esa bu
 * 5145,5 va u 5146 ga yaxlitlaydi. -0 qaytmaydi: katakda "-0" ko'rinardi.
 */
const roundExcel = (n: number): number => {
  const r = Math.round(Number(Math.abs(n).toPrecision(15)));
  return n < 0 && r !== 0 ? -r : r;
};

const given = (v: number | null | undefined): v is number => typeof v === 'number' && Number.isFinite(v);

export function calcUnitPlanRow(row: UnitPlanRowInput, rates: UnitPlanRates): UnitPlanRowResult {
  const price = given(row.price) && row.price > 0 ? row.price : null;
  const liters = given(row.liters) && row.liters > 0 ? row.liters : null;
  const purchase = given(row.purchasePrice) && row.purchasePrice >= 0 ? row.purchasePrice : null;
  const packaging = given(row.packaging) && row.packaging > 0 ? row.packaging : 0;
  const pct = given(row.commissionPct) && row.commissionPct >= 0 ? row.commissionPct : null;

  const billable = liters === null ? null : billableLiters(liters);
  const logistics = liters === null ? null : logisticsFee(liters);
  const commission = price === null || pct === null ? null : roundExcel((price * pct) / 100);
  const tax = price === null ? null : roundExcel((price * rates.taxPct) / 100);
  const ads = price === null ? null : roundExcel((price * rates.adsPct) / 100);

  const withdraw =
    price === null || commission === null || logistics === null
      ? null
      : roundExcel(((price - commission - logistics) * rates.withdrawPct) / 100);
  const payout =
    price === null || commission === null || logistics === null || withdraw === null
      ? null
      : price - commission - logistics - withdraw;
  const landedCost = purchase === null || logistics === null ? null : purchase + packaging + logistics;
  const profit =
    payout === null || purchase === null || tax === null || ads === null
      ? null
      : payout - tax - ads - purchase - packaging;

  // Avval ko'paytirish: (foyda ÷ narx) × 100 aniq 51,85 o'rniga 51,8499… berib, matnda 51,8% ko'rinardi (Excel — 51,9%)
  const marginPct = profit === null || price === null ? null : (profit * 100) / price;
  const roiPct = profit === null || landedCost === null || landedCost <= 0 ? null : (profit * 100) / landedCost;
  // + 0: zarar × 0 dona -0 bo'lib, katakda "-0" ko'rinardi
  const monthlyProfit = profit === null || !given(row.monthlyUnits) ? null : profit * row.monthlyUnits + 0;

  const goal = given(row.goalProfit) && row.goalProfit > 0 ? row.goalProfit : null;
  const unitsNeeded = goal === null || profit === null || profit <= 0 ? null : Math.ceil(goal / profit);
  const capitalNeeded = unitsNeeded === null || landedCost === null ? null : unitsNeeded * landedCost;

  return {
    billableLiters: billable,
    commission,
    logistics,
    tax,
    withdraw,
    ads,
    landedCost,
    payout,
    profit,
    marginPct,
    roiPct,
    monthlyProfit,
    unitsNeeded,
    capitalNeeded,
  };
}

export function calcUnitPlan(
  rows: readonly UnitPlanRowInput[],
  rates: UnitPlanRates,
): { rows: UnitPlanRowResult[]; totals: UnitPlanTotals } {
  const results = rows.map((row) => calcUnitPlanRow(row, rates));
  const totals = results.reduce<UnitPlanTotals>(
    (acc, r) => ({
      computed: acc.computed + (r.profit === null ? 0 : 1),
      monthlyProfit: acc.monthlyProfit + (r.monthlyProfit ?? 0),
      capitalNeeded: acc.capitalNeeded + (r.capitalNeeded ?? 0),
    }),
    { computed: 0, monthlyProfit: 0, capitalNeeded: 0 },
  );
  return { rows: results, totals };
}
