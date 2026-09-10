/**
 * API javoblari turli qobiqda kelishi mumkin (massiv, { items }, { rows }) —
 * shu yerda bitta ko'rinishga keltiriladi. `any` ishlatilmaydi: unknown + tekshiruv.
 */

import { EXPENSE_CATEGORIES, type ExpenseCategory, type UnitCalcInput } from '@savdoiq/shared';
import type { ExpenseList, ExpenseRow, ExpenseSummary, SummaryCell, UnitScenario } from './types';

const CATEGORY_IDS = EXPENSE_CATEGORIES.map((c) => c.id);

export function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

function num(v: unknown, fallback = 0): number {
  const n = typeof v === 'string' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) ? n : fallback;
}

function str(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback;
}

function category(v: unknown): ExpenseCategory {
  return typeof v === 'string' && (CATEGORY_IDS as string[]).includes(v) ? (v as ExpenseCategory) : 'other';
}

function toExpenseRow(v: unknown, index: number): ExpenseRow {
  if (!isRecord(v)) {
    return { id: `row-${index}`, date: '', category: 'other', amount: 0, note: null };
  }
  return {
    id: str(v.id, `row-${index}`),
    date: str(v.date ?? v.happenedAt ?? v.createdAt),
    category: category(v.category),
    amount: num(v.amount),
    storeId: typeof v.storeId === 'string' ? v.storeId : null,
    storeTitle:
      typeof v.storeTitle === 'string'
        ? v.storeTitle
        : isRecord(v.store) && typeof v.store.title === 'string'
          ? v.store.title
          : null,
    note: typeof v.note === 'string' ? v.note : null,
    source: typeof v.source === 'string' ? v.source : null,
    createdAt: typeof v.createdAt === 'string' ? v.createdAt : undefined,
  };
}

function arrayFrom(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

/** GET /finance/expenses — massiv, Paginated yoki { rows: Paginated } bo'lishi mumkin */
export function normalizeExpenses(raw: unknown): ExpenseList {
  const empty: ExpenseList = { rows: [], total: 0, page: 1, pages: 1, totalAmount: null };
  if (!raw) return empty;

  if (Array.isArray(raw)) {
    const rows = raw.map(toExpenseRow);
    return { rows, total: rows.length, page: 1, pages: 1, totalAmount: null };
  }

  if (!isRecord(raw)) return empty;

  // { rows: Paginated<ExpenseRow> } yoki { rows: ExpenseRow[] }
  const nested = isRecord(raw.rows) && !Array.isArray(raw.rows) ? raw.rows : null;
  const container = nested ?? raw;

  const listSource = Array.isArray(container.items)
    ? container.items
    : Array.isArray(container.rows)
      ? container.rows
      : Array.isArray(container.expenses)
        ? container.expenses
        : Array.isArray(raw.items)
          ? raw.items
          : [];

  const rows = arrayFrom(listSource).map(toExpenseRow);

  const totalsAmount = isRecord(raw.totals) ? num(raw.totals.amount, Number.NaN) : Number.NaN;

  return {
    rows,
    total: num(container.total, rows.length),
    page: Math.max(1, num(container.page, 1)),
    pages: Math.max(1, num(container.pages, 1)),
    totalAmount: Number.isFinite(totalsAmount) ? totalsAmount : null,
  };
}

/** Kategoriya × oy jamlanmasi. Turli qobiqlarni qabul qiladi, bo'lmasa ro'yxatdan hisoblaydi. */
export function normalizeSummary(raw: unknown, fallbackRows: ExpenseRow[]): ExpenseSummary {
  const cells: SummaryCell[] = [];

  const pushCell = (v: unknown) => {
    if (!isRecord(v)) return;
    const month = str(v.month ?? v.date).slice(0, 7);
    if (!month) return;
    cells.push({ month, category: category(v.category), amount: num(v.amount ?? v.total) });
  };

  const pushMatrixRow = (v: unknown) => {
    if (!isRecord(v)) return;
    const cat = category(v.category ?? v.id);
    const map = isRecord(v.months) ? v.months : isRecord(v.byMonth) ? v.byMonth : null;
    if (!map) return;
    Object.entries(map).forEach(([month, amount]) => {
      cells.push({ month: month.slice(0, 7), category: cat, amount: num(amount) });
    });
  };

  if (Array.isArray(raw)) {
    raw.forEach(pushCell);
  } else if (isRecord(raw)) {
    if (Array.isArray(raw.cells)) raw.cells.forEach(pushCell);
    if (Array.isArray(raw.items)) raw.items.forEach(pushCell);
    if (Array.isArray(raw.rows)) {
      raw.rows.forEach((r) => {
        if (isRecord(r) && (isRecord(r.months) || isRecord(r.byMonth))) pushMatrixRow(r);
        else pushCell(r);
      });
    }
  }

  // Server javobi tushunarsiz bo'lsa — mavjud ro'yxatdan yig'amiz
  if (!cells.length) {
    fallbackRows.forEach((r) => {
      const month = (r.date ?? '').slice(0, 7);
      if (!month) return;
      cells.push({ month, category: r.category, amount: r.amount });
    });
  }

  const months = Array.from(new Set(cells.map((c) => c.month).filter(Boolean))).sort();
  return { months, cells };
}

/** Jamlanma bo'yicha qiymat olish */
export function summaryValue(summary: ExpenseSummary, cat: ExpenseCategory, month: string): number {
  return summary.cells
    .filter((c) => c.category === cat && c.month === month)
    .reduce((sum, c) => sum + c.amount, 0);
}

function toUnitInput(v: unknown, base: UnitCalcInput): UnitCalcInput {
  if (!isRecord(v)) return base;
  return {
    price: num(v.price, base.price),
    purchasePrice: num(v.purchasePrice, base.purchasePrice),
    commissionPct: num(v.commissionPct, base.commissionPct),
    logistics: num(v.logistics, base.logistics),
    storagePerDay: num(v.storagePerDay, base.storagePerDay),
    storageDays: num(v.storageDays, base.storageDays),
    packaging: num(v.packaging, base.packaging),
    otherCost: num(v.otherCost, base.otherCost),
    taxPct: num(v.taxPct, base.taxPct),
    buyoutPct: num(v.buyoutPct, base.buyoutPct),
    returnLogistics: num(v.returnLogistics, base.returnLogistics),
    qty: Math.max(1, Math.round(num(v.qty, base.qty))),
  };
}

/** GET /unit/defaults?skuId= — qisman qiymatlarni bazaga qo'shadi */
export function mergeDefaults(raw: unknown, base: UnitCalcInput): UnitCalcInput {
  if (!isRecord(raw)) return base;
  const src = isRecord(raw.input) ? raw.input : isRecord(raw.defaults) ? raw.defaults : raw;
  return toUnitInput(src, base);
}

function parseScenarioData(v: unknown, base: UnitCalcInput): UnitCalcInput {
  if (typeof v === 'string') {
    try {
      return toUnitInput(JSON.parse(v) as unknown, base);
    } catch {
      return base;
    }
  }
  return toUnitInput(v, base);
}

/** GET /unit/scenarios */
export function normalizeScenarios(raw: unknown, base: UnitCalcInput): UnitScenario[] {
  const list = Array.isArray(raw)
    ? raw
    : isRecord(raw)
      ? arrayFrom(raw.items ?? raw.rows ?? raw.scenarios)
      : [];

  return list.map((item, i) => {
    const v = isRecord(item) ? item : {};
    const source = v.input ?? v.data ?? v;
    return {
      id: str(v.id, `scenario-${i}`),
      name: str(v.name, `#${i + 1}`),
      input: parseScenarioData(source, base),
      createdAt: typeof v.createdAt === 'string' ? v.createdAt : undefined,
    };
  });
}
