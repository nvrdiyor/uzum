/**
 * "Kategoriyalarim" namunasi — tarifda bo'lim faqat ko'rish uchun ochiq
 * bo'lganda (sinov) qulf oynasi ostida xira ko'rinadi. So'rov yuborilmaydi:
 * 402 javobi qulf ostida xato kartochkasini chizardi (Vgh.tsx bilan bir xil).
 * Raqamlar o'ylab topilgan, lekin o'zaro mos (qatorlar yig'indisi = jami).
 */
import type { CategoriesResponse, CategoryRow } from '@savdoiq/shared';

const NO_DELTAS: CategoryRow['deltas'] = {
  revenue: null,
  units: null,
  netProfit: null,
  margin: null,
  returnRate: null,
  revenueShare: null,
};

function row(
  category: string,
  revenue: number,
  netProfit: number,
  units: number,
  extra: Partial<CategoryRow>,
): CategoryRow {
  return {
    category,
    revenue,
    units,
    commission: Math.round(revenue * 0.13),
    logistics: Math.round(revenue * 0.03),
    netProfit,
    margin: Math.round((netProfit / revenue) * 10_000) / 100,
    commissionShare: 13,
    orderedUnits: Math.round(units * 1.08),
    returnedUnits: Math.round(units * 0.05),
    canceledUnits: Math.round(units * 0.02),
    returnRate: 5.1,
    cancelRate: 2,
    revenueShare: 0,
    products: 3,
    skuCount: 6,
    sellingSkus: 5,
    stockUnits: 240,
    stockValue: Math.round(revenue * 0.4),
    frozenValue: 0,
    frozenSkus: 0,
    noCostProducts: 0,
    previous: null,
    deltas: NO_DELTAS,
    topProducts: [],
    moreProducts: 0,
    ...extra,
  };
}

const ROWS: CategoryRow[] = [
  row('Elektronika', 148_500_000, 46_200_000, 520, { products: 5, skuCount: 12, sellingSkus: 11 }),
  row('Kompyuter', 96_300_000, 27_900_000, 410, { products: 6, skuCount: 13, sellingSkus: 10, frozenValue: 8_400_000, frozenSkus: 2 }),
  row('Aksessuarlar', 41_800_000, 13_100_000, 690, { products: 4, skuCount: 11, sellingSkus: 9, returnRate: 9.4 }),
  row('Avto tovarlar', 28_600_000, 7_300_000, 140, { products: 2, skuCount: 3, sellingSkus: 3 }),
  row('Aqlli uy', 9_800_000, 1_100_000, 90, { products: 1, skuCount: 2, sellingSkus: 2, frozenValue: 3_900_000, frozenSkus: 1 }),
];

const REVENUE = ROWS.reduce((s, r) => s + r.revenue, 0);
for (const r of ROWS) r.revenueShare = Math.round((r.revenue / REVENUE) * 10_000) / 100;

const sum = (f: (r: CategoryRow) => number) => ROWS.reduce((s, r) => s + f(r), 0);
const PROFIT = sum((r) => r.netProfit);

export const CATEGORIES_SAMPLE: CategoriesResponse = {
  period: { from: '2026-10-01', to: '2026-10-24' },
  comparePeriod: null,
  currency: 'UZS',
  totals: {
    revenue: REVENUE,
    units: sum((r) => r.units),
    commission: sum((r) => r.commission),
    logistics: sum((r) => r.logistics),
    netProfit: PROFIT,
    margin: Math.round((PROFIT / REVENUE) * 10_000) / 100,
    commissionShare: 13,
    orderedUnits: sum((r) => r.orderedUnits),
    returnedUnits: sum((r) => r.returnedUnits),
    canceledUnits: sum((r) => r.canceledUnits),
    returnRate: 5.6,
    cancelRate: 2,
    categories: ROWS.length,
    products: sum((r) => r.products),
    skuCount: sum((r) => r.skuCount),
    sellingSkus: sum((r) => r.sellingSkus),
    stockUnits: sum((r) => r.stockUnits),
    stockValue: sum((r) => r.stockValue),
    frozenValue: sum((r) => r.frozenValue),
    frozenSkus: sum((r) => r.frozenSkus),
    noCostProducts: 0,
    previous: null,
    deltas: { revenue: null, units: null, netProfit: null, margin: null, returnRate: null },
  },
  rows: ROWS,
  unallocated: 0,
  thresholds: { illiquidDays: 30, excessDays: 90, topProducts: 5 },
};
