/**
 * Moliya (Finance) va Xarajatlar (Expenses) sahifalari uchun ma'lumot yordamchilari.
 *
 * Server javoblari bir necha qobiqda kelishi mumkin (`{ lines }`, `{ rows }`, massiv),
 * shuning uchun barcha javoblar shu yerda bitta ko'rinishga keltiriladi.
 * `any` ishlatilmaydi — `unknown` + tekshiruv.
 */

import { EXPENSE_CATEGORIES, type ExpenseCategory, type Lang } from '@savdoiq/shared';
import type { Tone } from '@/components/ui';
import { isRecord, normalizeExpenses, normalizeSummary } from './normalize';
import type { ExpenseList, ExpenseRow, SummaryCell } from './types';

// ─────────────────────────── Kichik yordamchilar ───────────────────────────

const CATEGORY_IDS = EXPENSE_CATEGORIES.map((c) => c.id);

function num(v: unknown, fallback = 0): number {
  const n = typeof v === 'string' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) ? n : fallback;
}

function str(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback;
}

function toCategory(v: unknown): ExpenseCategory {
  return typeof v === 'string' && (CATEGORY_IDS as string[]).includes(v)
    ? (v as ExpenseCategory)
    : 'other';
}

export function emptyByCategory(): Record<ExpenseCategory, number> {
  return CATEGORY_IDS.reduce(
    (acc, id) => {
      acc[id] = 0;
      return acc;
    },
    {} as Record<ExpenseCategory, number>,
  );
}

/** Kategoriya rangi (grafiklar uchun) */
export function categoryColor(id: ExpenseCategory): string {
  return EXPENSE_CATEGORIES.find((c) => c.id === id)?.color ?? '#94a3b8';
}

/** Kategoriya nishoni uchun dizayn tokeni */
export const CATEGORY_TONE: Record<ExpenseCategory, Tone> = {
  commission: 'danger',
  logistics: 'warn',
  marketing: 'info',
  storage: 'violet',
  tax: 'brand',
  salary: 'info',
  other: 'muted',
};

/** '2026-09' → 'sen 26' */
export function monthLabel(month: string, lang: Lang): string {
  const d = new Date(`${month}-01T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return month;
  const locale = lang === 'ru' ? 'ru-RU' : lang === 'en' ? 'en-US' : 'uz-UZ';
  return new Intl.DateTimeFormat(locale, { month: 'short', year: '2-digit', timeZone: 'UTC' }).format(d);
}

/** Davrdagi kunlar soni (ikkala chekka ham kiradi) */
export function periodDays(from: string, to: string): number {
  const a = new Date(`${from}T00:00:00Z`).getTime();
  const b = new Date(`${to}T00:00:00Z`).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 1;
  return Math.max(1, Math.round((b - a) / 86_400_000) + 1);
}

// ─────────────────────────── P&L (foyda va zarar) ───────────────────────────

export type PnlKind = 'income' | 'cost' | 'subtotal' | 'total';

export interface PnlLine {
  id: string;
  label: string;
  kind: PnlKind;
  current: number;
  previous: number;
  deltaPct: number | null;
  /** tushumga nisbatan ulush, % */
  share: number;
}

export interface PnlData {
  lines: PnlLine[];
  currency: string | null;
}

/** Server yorlig'i o'rniga tarjima ishlatiladigan moddalar */
const KNOWN_PNL_IDS = new Set([
  'revenue',
  'payout',
  'cogs',
  'commission',
  'logistics',
  'storage',
  'marketing',
  'tax',
  'salary',
  'other',
  'grossProfit',
  'netProfit',
  'operatingProfit',
  'delivery',
  'itemOther',
  'manualCommission',
  'manualTax',
]);

export function isKnownPnlId(id: string): boolean {
  return KNOWN_PNL_IDS.has(id);
}

function guessKind(id: string): PnlKind {
  const key = id.toLowerCase();
  if (key === 'operatingprofit' || key === 'total' || key === 'profit') return 'total';
  if (key.includes('net') || key.includes('gross')) return 'subtotal';
  if (key === 'revenue' || key === 'income' || key === 'payout' || key === 'sales') return 'income';
  return 'cost';
}

function deltaOf(current: number, previous: number, raw: unknown): number | null {
  const given = typeof raw === 'number' && Number.isFinite(raw) ? raw : null;
  if (given !== null) return given;
  if (previous === 0) return current === 0 ? 0 : null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

function toPnlLine(v: unknown, index: number): PnlLine | null {
  if (!isRecord(v)) return null;
  const id = str(v.id ?? v.key, `line-${index}`);
  const label = str(v.label ?? v.name, id);
  const current = num(v.current ?? v.amount ?? v.value);
  const previous = num(v.previous ?? v.prev);
  const kindRaw = str(v.kind);
  const kind: PnlKind =
    kindRaw === 'income' || kindRaw === 'cost' || kindRaw === 'subtotal' || kindRaw === 'total'
      ? kindRaw
      : guessKind(id);
  return {
    id,
    label,
    kind,
    current,
    previous,
    deltaPct: deltaOf(current, previous, v.deltaPct),
    share: num(v.share),
  };
}

/** GET /finance/pnl — `{ lines }`, `{ rows }` yoki massiv bo'lishi mumkin */
export function normalizePnl(raw: unknown): PnlData {
  const source = Array.isArray(raw)
    ? raw
    : isRecord(raw)
      ? Array.isArray(raw.lines)
        ? raw.lines
        : Array.isArray(raw.rows)
          ? raw.rows
          : Array.isArray(raw.items)
            ? raw.items
            : []
      : [];

  const lines = source
    .map(toPnlLine)
    .filter((l): l is PnlLine => l !== null)
    .filter((l) => l.current !== 0 || l.previous !== 0 || l.kind === 'total' || l.kind === 'subtotal');

  const currency = isRecord(raw) && typeof raw.currency === 'string' ? raw.currency : null;
  return { lines, currency };
}

// ─────────────────────────── Xarajatlar ro'yxati ───────────────────────────

export interface CategoryTotal {
  category: ExpenseCategory;
  amount: number;
  share: number;
  count: number;
}

export interface ExpenseListData extends ExpenseList {
  /** Davr bo'yicha umumiy summa (yozuvlar soni emas) */
  amountTotal: number;
  byCategory: CategoryTotal[];
}

function sumRows(rows: ExpenseRow[]): number {
  return rows.reduce((s, r) => s + r.amount, 0);
}

function categoriesFromRows(rows: ExpenseRow[]): CategoryTotal[] {
  const amounts = emptyByCategory();
  const counts = emptyByCategory();
  rows.forEach((r) => {
    amounts[r.category] += r.amount;
    counts[r.category] += 1;
  });
  const total = CATEGORY_IDS.reduce((s, id) => s + amounts[id], 0);
  return CATEGORY_IDS.map((category) => ({
    category,
    amount: amounts[category],
    share: total > 0 ? (amounts[category] / total) * 100 : 0,
    count: counts[category],
  }));
}

function readCategoryTotals(raw: unknown, total: number): CategoryTotal[] | null {
  if (!isRecord(raw) || !Array.isArray(raw.byCategory)) return null;
  const out: CategoryTotal[] = raw.byCategory.filter(isRecord).map((c) => {
    const amount = num(c.amount ?? c.total);
    return {
      category: toCategory(c.category ?? c.id),
      amount,
      share: typeof c.share === 'number' ? c.share : total > 0 ? (amount / total) * 100 : 0,
      count: num(c.count),
    };
  });
  return out.length ? out : null;
}

/** GET /finance/expenses */
export function normalizeExpenseList(raw: unknown): ExpenseListData {
  const base = normalizeExpenses(raw);

  // `{ total, byCategory, rows: Paginated }` ko'rinishida `total` — bu summa
  const nestedList = isRecord(raw) && isRecord(raw.rows) && !Array.isArray(raw.rows);
  const topTotal = isRecord(raw) && typeof raw.total === 'number' ? raw.total : null;
  const amountTotal =
    base.totalAmount ?? (nestedList && topTotal !== null ? topTotal : sumRows(base.rows));

  return {
    ...base,
    amountTotal,
    byCategory: readCategoryTotals(raw, amountTotal) ?? categoriesFromRows(base.rows),
  };
}

// ─────────────────────────── Oylik jamlanma ───────────────────────────

export interface MonthTotals {
  month: string;
  total: number;
  byCategory: Record<ExpenseCategory, number>;
}

export interface ExpenseSummaryData {
  total: number;
  byCategory: CategoryTotal[];
  months: MonthTotals[];
}

/** `{ byMonth: [{ month, categories: [{ category, amount }] }] }` ko'rinishi */
function cellsFromByMonth(raw: unknown): SummaryCell[] {
  if (!isRecord(raw) || !Array.isArray(raw.byMonth)) return [];
  const cells: SummaryCell[] = [];
  raw.byMonth.filter(isRecord).forEach((m) => {
    const month = str(m.month ?? m.label).slice(0, 7);
    if (!month) return;
    if (Array.isArray(m.categories)) {
      m.categories.filter(isRecord).forEach((c) => {
        cells.push({ month, category: toCategory(c.category ?? c.id), amount: num(c.amount) });
      });
    } else if (isRecord(m.categories)) {
      Object.entries(m.categories).forEach(([category, amount]) => {
        cells.push({ month, category: toCategory(category), amount: num(amount) });
      });
    }
  });
  return cells;
}

/** GET /finance/expenses/summary — javob tushunarsiz bo'lsa ro'yxatdan hisoblanadi */
export function normalizeExpenseSummary(raw: unknown, fallbackRows: ExpenseRow[]): ExpenseSummaryData {
  let cells = cellsFromByMonth(raw);
  if (!cells.length) cells = normalizeSummary(raw, fallbackRows).cells;

  const monthKeys = Array.from(new Set(cells.map((c) => c.month).filter(Boolean))).sort();
  const months: MonthTotals[] = monthKeys.map((month) => {
    const byCategory = emptyByCategory();
    cells.filter((c) => c.month === month).forEach((c) => {
      byCategory[c.category] += c.amount;
    });
    return {
      month,
      total: CATEGORY_IDS.reduce((s, id) => s + byCategory[id], 0),
      byCategory,
    };
  });

  const cellsTotal = months.reduce((s, m) => s + m.total, 0);
  const total = isRecord(raw) && typeof raw.total === 'number' ? raw.total : cellsTotal;

  const fromServer = readCategoryTotals(raw, total);
  const byCategory =
    fromServer ??
    (() => {
      const amounts = emptyByCategory();
      cells.forEach((c) => {
        amounts[c.category] += c.amount;
      });
      const counts = emptyByCategory();
      fallbackRows.forEach((r) => {
        counts[r.category] += 1;
      });
      return CATEGORY_IDS.map((category) => ({
        category,
        amount: amounts[category],
        share: cellsTotal > 0 ? (amounts[category] / cellsTotal) * 100 : 0,
        count: counts[category],
      }));
    })();

  return { total, byCategory, months };
}
