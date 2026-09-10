/**
 * Moliya bo'limi (Finance / Expenses / UnitEconomics / Calculator) uchun
 * mahalliy API tiplari — packages/shared/src/types.ts da yo'q bo'lgan javoblar.
 */

import type { ExpenseCategory, UnitCalcInput } from '@savdoiq/shared';

/** GET /finance/pnl → { rows: [...] } */
export interface PnlRow {
  /** ixtiyoriy kalit: revenue | payout | gross | net | commission ... */
  key?: string;
  label: string;
  current: number;
  previous: number;
  deltaPct?: number | null;
}

export interface PnlResponse {
  rows: PnlRow[];
}

/** GET /finance/expenses qatori */
export interface ExpenseRow {
  id: string;
  date: string;
  category: ExpenseCategory;
  amount: number;
  storeId?: string | null;
  storeTitle?: string | null;
  note?: string | null;
  source?: string | null;
  createdAt?: string;
}

/** POST / PATCH /finance/expenses tanasi */
export interface ExpenseInput {
  date: string;
  category: ExpenseCategory;
  amount: number;
  storeId?: string;
  note?: string;
}

/** Ro'yxat javobining normallashtirilgan ko'rinishi */
export interface ExpenseList {
  rows: ExpenseRow[];
  total: number;
  page: number;
  pages: number;
  /** Server bergan jami summa (bo'lmasa null) */
  totalAmount: number | null;
}

/** Oylik jamlanma katakchasi */
export interface SummaryCell {
  month: string; // YYYY-MM
  category: ExpenseCategory;
  amount: number;
}

export interface ExpenseSummary {
  months: string[];
  cells: SummaryCell[];
}

/** GET|POST|DELETE /unit/scenarios */
export interface UnitScenario {
  id: string;
  name: string;
  input: UnitCalcInput;
  createdAt?: string;
}
