/**
 * Moliya moduli — /api/v1/finance
 *
 *  GET    /                  → FinanceResponse (tushum, xarajatlar, kunlik seriya, balans)
 *  GET    /pnl               → foyda va zarar (P&L) jadvali, oldingi davr bilan taqqoslov
 *  GET    /expenses          → qo'lda kiritilgan xarajatlar ro'yxati
 *  POST   /expenses          → yangi xarajat
 *  PATCH  /expenses/:id      → xarajatni tahrirlash
 *  DELETE /expenses/:id      → xarajatni o'chirish
 *  GET    /expenses/summary  → kategoriya va oy kesimida jamlanma
 *
 * Ma'lumot bo'lmasa ham barcha marshrutlar 200 va nol qiymatlar qaytaradi.
 */
import { Router } from 'express';
import { prisma } from '@savdoiq/db';
import {
  deltaPct,
  expenseSchema,
  formatMoney,
  parseISODate,
  pct,
  round,
  toISODate,
  type ExpenseCategory,
  type FinanceResponse,
  type Paginated,
  type Period,
} from '@savdoiq/shared';
import { AppError, ah } from '../lib/errors.js';
import { companyCtx, requireAuth, requireCompany, requireFeature, requireRole } from '../lib/auth.js';
import { paginate, resolveRange } from '../lib/period.js';
import { aggregateSales, getDailySeries, getExpenses, getStoreIds, getStoreTitles } from '../services/common.js';

const router = Router();
router.use(requireAuth, requireCompany);

// ─────────────────────────── Yordamchilar ───────────────────────────

/** Xarajat kategoriyalari — javoblarda doimo shu tartibda */
const CATEGORY_ORDER: ExpenseCategory[] = [
  'commission',
  'logistics',
  'marketing',
  'storage',
  'tax',
  'salary',
  'other',
];

const CATEGORY_LABEL: Record<ExpenseCategory, string> = {
  commission: 'Komissiya',
  logistics: 'Logistika',
  marketing: 'Marketing',
  storage: 'Ombor (saqlash)',
  tax: 'Soliq',
  salary: 'Ish haqi',
  other: 'Boshqa',
};

const MONTHS_UZ = [
  'Yanvar',
  'Fevral',
  'Mart',
  'Aprel',
  'May',
  'Iyun',
  'Iyul',
  'Avgust',
  'Sentabr',
  'Oktabr',
  'Noyabr',
  'Dekabr',
];

const emptyCategories = (): Record<ExpenseCategory, number> => ({
  commission: 0,
  logistics: 0,
  marketing: 0,
  storage: 0,
  tax: 0,
  salary: 0,
  other: 0,
});

/** Oy kaliti (2026-09) → o'zbekcha yorliq */
function monthLabel(key: string): string {
  const year = Number(key.slice(0, 4));
  const idx = Number(key.slice(5, 7)) - 1;
  const name = MONTHS_UZ[idx] ?? key;
  return Number.isFinite(year) ? `${name} ${year}` : key;
}

/** Sanani (YYYY-MM-DD) tekshirib Date'ga aylantiradi */
function parseDay(value: string): Date {
  const d = parseISODate(value);
  if (Number.isNaN(d.getTime())) throw AppError.badRequest('Sana noto‘g‘ri formatda (YYYY-MM-DD)');
  return d;
}

/** Do'kon shu kompaniyaga tegishliligini tekshiradi */
async function resolveStoreId(companyId: string, storeId?: string): Promise<string | null> {
  if (!storeId) return null;
  const store = await prisma.store.findFirst({ where: { id: storeId, companyId }, select: { id: true } });
  if (!store) throw AppError.badRequest('Do‘kon topilmadi');
  return store.id;
}

/** Davr uchun pullik saqlash (ombor) xarajati */
async function storageAmount(storeIds: string[], from: Date, toExclusive: Date): Promise<number> {
  const agg = await prisma.storageFee.aggregate({
    _sum: { amount: true },
    where: { storeId: { in: storeIds }, date: { gte: from, lt: toExclusive } },
  });
  return agg._sum.amount ?? 0;
}

interface FinanceSnapshot {
  revenue: number;
  payout: number;
  cogs: number;
  units: number;
  grossProfit: number;
  netProfit: number;
  operatingProfit: number;
  periodExpenses: number;
  taxAmount: number;
  expensesTotal: number;
  /** Kategoriya kesimidagi xarajatlar (platforma + qo'lda kiritilgan) */
  categories: Record<ExpenseCategory, number>;
  /** Sotilgan tovarga tegishli xarajatlar — sof foydadan ayrilgan */
  item: { commission: number; delivery: number; other: number; tax: number };
  /** Davrga tegishli xarajatlar — davr foydasidan ayriladi */
  periodCosts: { logistics: number; marketing: number; storage: number; salary: number; other: number };
}

/**
 * Davr bo'yicha moliyaviy kesim.
 * Komissiya/logistika/boshqa xarajatlar buyurtma satrlaridan, ombor — StorageFee'dan,
 * soliq — company.taxRate'dan, qolgani esa qo'lda kiritilgan Expense yozuvlaridan olinadi.
 */
async function collectFinance(
  companyId: string,
  storeIds: string[],
  period: Period,
  taxRate: number,
  storeId?: string,
): Promise<FinanceSnapshot> {
  const from = parseISODate(period.from);
  const toExclusive = parseISODate(period.to);
  toExclusive.setUTCDate(toExclusive.getUTCDate() + 1);

  const [sales, manual, storage] = await Promise.all([
    aggregateSales(storeIds, from, toExclusive),
    getExpenses(companyId, from, toExclusive, storeId),
    storageAmount(storeIds, from, toExclusive),
  ]);

  let revenue = 0;
  let payout = 0;
  let cogs = 0;
  let units = 0;
  let commission = 0;
  let logistics = 0;
  let otherCost = 0;

  for (const agg of sales.values()) {
    revenue += agg.revenue;
    payout += agg.payout;
    cogs += agg.cogs;
    units += agg.units;
    commission += agg.commission;
    logistics += agg.logistics;
    otherCost += agg.otherCost;
  }

  const taxAmount = (revenue * taxRate) / 100;

  const categories: Record<ExpenseCategory, number> = {
    commission: commission + manual.commission,
    logistics: logistics + manual.logistics,
    marketing: manual.marketing,
    storage: storage + manual.storage,
    tax: taxAmount + manual.tax,
    salary: manual.salary,
    other: otherCost + manual.other,
  };

  const expensesTotal = CATEGORY_ORDER.reduce((s, c) => s + categories[c], 0);
  const grossProfit = revenue - cogs;

  /**
   * Ikki xil foyda — atamalar butun saytda bir xil ma'noda ishlatiladi:
   *
   *  netProfit       — SOTILGAN TOVARLAR bo'yicha sof foyda. Komissiya, mijozga
   *                    yetkazish va soliq ayirilgan (Uzum "yechib olish uchun"
   *                    summasi shu mantiqda). Boshqaruv panelidagi raqam bilan bir xil.
   *  operatingProfit — davr foydasi: sof foydadan davrga tegishli xarajatlar
   *                    (omborga logistika, reklama, saqlash, ish haqi) ayriladi.
   */
  const itemExpenses = commission + logistics + otherCost + taxAmount;
  const netProfit = revenue - cogs - itemExpenses;
  const periodExpenses = expensesTotal - itemExpenses;
  const operatingProfit = netProfit - periodExpenses;

  return {
    revenue,
    payout,
    cogs,
    units,
    grossProfit,
    netProfit,
    operatingProfit,
    periodExpenses,
    taxAmount,
    expensesTotal,
    categories,
    item: { commission, delivery: logistics, other: otherCost, tax: taxAmount },
    periodCosts: {
      logistics: manual.logistics,
      marketing: manual.marketing,
      storage: storage + manual.storage,
      salary: manual.salary,
      other: manual.other + manual.commission + manual.tax,
    },
  };
}

/** Keyingi payshanba (Uzum to'lovlari haftada bir marta o'tkaziladi) */
function nextThursday(now = new Date()): string {
  const today = parseISODate(toISODate(now));
  const dow = today.getUTCDay(); // 0 — yakshanba, 4 — payshanba
  const ahead = (4 - dow + 7) % 7;
  const next = new Date(today.getTime());
  next.setUTCDate(next.getUTCDate() + (ahead === 0 ? 7 : ahead));
  return toISODate(next);
}

// ─────────────────────────── GET / — umumiy moliya ───────────────────────────

router.get(
  '/',
  requireFeature('unit_economics'),
  ah(async (req, res) => {
    const { company, plan } = companyCtx(req);
    const range = resolveRange(req, plan);
    const storeIds = await getStoreIds(company.id, range.storeId);
    const taxRate = company.taxRate;

    const snap = await collectFinance(company.id, storeIds, range.period, taxRate, range.storeId);

    // Kunlik seriya: buyurtmalardan kelgan foydadan qo'lda kiritilgan xarajat,
    // ombor to'lovi va soliq ayriladi — shunda profit = revenue - expenses bo'ladi.
    const [series, manualRows, feeRows, paidAgg, pendingAgg, allSalesAgg, uzumFeeAgg, storageAllAgg] =
      await Promise.all([
      getDailySeries(storeIds, range.period),
      prisma.expense.findMany({
        where: {
          companyId: company.id,
          date: { gte: range.from, lt: range.toExclusive },
          // Buyurtma satrlarida allaqachon ayrilgan to'lovlar kunlik grafikda
          // qayta ayrilmasin — aks holda bitta yetkazish puli ikki marta ushlanardi
          source: { not: 'uzum-payout' },
          ...(range.storeId ? { storeId: range.storeId } : {}),
        },
        select: { date: true, amount: true },
      }),
      prisma.storageFee.findMany({
        where: { storeId: { in: storeIds }, date: { gte: range.from, lt: range.toExclusive } },
        select: { date: true, amount: true },
      }),
      prisma.orderItem.aggregate({
        _sum: { payout: true },
        where: {
          orderedAt: { gte: range.from, lt: range.toExclusive },
          status: { notIn: ['canceled', 'returned'] },
          order: { storeId: { in: storeIds }, status: 'delivered' },
        },
      }),
      prisma.orderItem.aggregate({
        _sum: { payout: true },
        where: {
          orderedAt: { gte: range.from, lt: range.toExclusive },
          status: { notIn: ['canceled', 'returned'] },
          order: { storeId: { in: storeIds }, status: { in: ['new', 'processing'] } },
        },
      }),
      /**
       * Uzum kabinetidagi "Umumiy balans" — davr emas, hisob boshidan beri
       * yig'ilgan va hali yechib olinmagan pul. Uzumning o'zi shunday hisoblaydi:
       *
       *     sotuv summasi − komissiya − barcha xizmat to'lovlari
       *
       * Diqqat: `payout` ("yechib olish uchun") har bir dona uchun mijozga
       * yetkazishni OLDINDAN ayiradi, Uzum esa uni faqat haqiqatda ushlaganda
       * hisobdan yechadi. Shu sababli balans `payout` dan emas, tushum va
       * komissiyadan quriladi — aks holda hali ushlanmagan yetkazish puliga
       * kamayib ko'rinardi.
       */
      prisma.orderItem.aggregate({
        _sum: { revenue: true, commission: true },
        where: { status: { notIn: ['canceled', 'returned'] }, order: { storeId: { in: storeIds } } },
      }),
      prisma.expense.aggregate({
        _sum: { amount: true },
        where: {
          companyId: company.id,
          // Uzum ushlagan barcha to'lovlar: omborga logistika, reklama va
          // buyurtma yetkazish to'lovlari (`uzum-payout`) — qaytarilganlari manfiy
          source: { in: ['uzum', 'uzum-payout'] },
          ...(range.storeId ? { storeId: range.storeId } : {}),
        },
      }),
      prisma.storageFee.aggregate({
        _sum: { amount: true },
        where: { storeId: { in: storeIds } },
      }),
    ]);

    const extraByDay = new Map<string, number>();
    for (const r of manualRows) {
      const key = toISODate(r.date);
      extraByDay.set(key, (extraByDay.get(key) ?? 0) + r.amount);
    }
    for (const r of feeRows) {
      const key = toISODate(r.date);
      extraByDay.set(key, (extraByDay.get(key) ?? 0) + r.amount);
    }

    const daily = series.map((row) => {
      /**
       * Soliq `orderItem.netProfit` ichida ALLAQACHON ayrilgan (importer.ts),
       * shuning uchun bu yerda qayta qo'shilmaydi — ilgari kunlik grafik
       * yuqoridagi "Sof foyda" kartasidan soliq summasi qadar past chiqardi.
       */
      const extra = extraByDay.get(row.date) ?? 0;
      const profit = round(row.profit - extra);
      return {
        date: row.date,
        revenue: round(row.revenue),
        expenses: round(row.revenue - profit),
        profit,
      };
    });

    const payload: FinanceResponse = {
      period: range.period,
      revenue: round(snap.revenue),
      payout: round(snap.payout),
      cogs: round(snap.cogs),
      grossProfit: round(snap.grossProfit),
      netProfit: round(snap.netProfit),
      operatingProfit: round(snap.operatingProfit),
      periodExpenses: round(snap.periodExpenses),
      expenses: CATEGORY_ORDER.map((category) => ({
        category,
        amount: round(snap.categories[category]),
        share: pct(snap.categories[category], snap.expensesTotal),
      })),
      expensesTotal: round(snap.expensesTotal),
      taxAmount: round(snap.taxAmount),
      daily,
      balance: {
        paidOut: round(paidAgg._sum.payout ?? 0),
        pending: round(pendingAgg._sum.payout ?? 0),
        total: round(
          (allSalesAgg._sum.revenue ?? 0) -
            (allSalesAgg._sum.commission ?? 0) -
            (uzumFeeAgg._sum.amount ?? 0) -
            (storageAllAgg._sum.amount ?? 0),
        ),
        nextPayoutAt: nextThursday(),
      },
    };

    res.json(payload);
  }),
);

// ─────────────────────────── GET /pnl — foyda va zarar ───────────────────────────

interface PnlLine {
  id: string;
  label: string;
  /** 'income' — tushum, 'cost' — xarajat, 'total' — yakuniy natija */
  kind: 'income' | 'cost' | 'subtotal' | 'total';
  amount: number;
  previous: number;
  deltaPct: number | null;
  /** tushumga nisbatan ulush, % */
  share: number;
}

interface PnlResponse {
  period: Period;
  previous: Period;
  currency: string;
  lines: PnlLine[];
  totals: {
    revenue: number;
    cogs: number;
    grossProfit: number;
    grossMargin: number;
    expensesTotal: number;
    netProfit: number;
    margin: number;
    previousNetProfit: number;
    netProfitDeltaPct: number | null;
  };
}

router.get(
  '/pnl',
  requireFeature('unit_economics'),
  ah(async (req, res) => {
    const { company, plan } = companyCtx(req);
    const range = resolveRange(req, plan);
    const storeIds = await getStoreIds(company.id, range.storeId);
    const taxRate = company.taxRate;

    const [cur, prev] = await Promise.all([
      collectFinance(company.id, storeIds, range.period, taxRate, range.storeId),
      collectFinance(company.id, storeIds, range.previous, taxRate, range.storeId),
    ]);

    const line = (
      id: string,
      label: string,
      kind: PnlLine['kind'],
      amount: number,
      previous: number,
    ): PnlLine => ({
      id,
      label,
      kind,
      amount: round(amount),
      previous: round(previous),
      deltaPct: deltaPct(round(amount), round(previous)),
      share: pct(amount, cur.revenue),
    });

    /**
     * Hisobot qatorma-qator qo'shilib boradi — foydalanuvchi har bir raqam
     * qayerdan chiqqanini ko'radi:
     *
     *   Tushum − Tannarx = Yalpi foyda
     *   Yalpi foyda − (komissiya + yetkazish + soliq + boshqa) = Sof foyda
     *   Sof foyda − davr xarajatlari = Davr foydasi
     */
    const lines: PnlLine[] = [
      line('revenue', 'Tushum', 'income', cur.revenue, prev.revenue),
      line('cogs', 'Tannarx', 'cost', cur.cogs, prev.cogs),
      line('grossProfit', 'Yalpi foyda', 'subtotal', cur.grossProfit, prev.grossProfit),

      line('commission', CATEGORY_LABEL.commission, 'cost', cur.item.commission, prev.item.commission),
      line('delivery', 'Mijozga yetkazish', 'cost', cur.item.delivery, prev.item.delivery),
      line('tax', CATEGORY_LABEL.tax, 'cost', cur.item.tax, prev.item.tax),
      line('itemOther', 'Sotuvdagi boshqa ushlanmalar', 'cost', cur.item.other, prev.item.other),
      line('netProfit', 'Sof foyda (tovarlar bo‘yicha)', 'subtotal', cur.netProfit, prev.netProfit),

      line('logistics', 'Omborga logistika', 'cost', cur.periodCosts.logistics, prev.periodCosts.logistics),
      line('marketing', CATEGORY_LABEL.marketing, 'cost', cur.periodCosts.marketing, prev.periodCosts.marketing),
      line('storage', CATEGORY_LABEL.storage, 'cost', cur.periodCosts.storage, prev.periodCosts.storage),
      line('salary', CATEGORY_LABEL.salary, 'cost', cur.periodCosts.salary, prev.periodCosts.salary),
      line('other', 'Boshqa xarajatlar', 'cost', cur.periodCosts.other, prev.periodCosts.other),
      line('operatingProfit', 'Davr foydasi', 'total', cur.operatingProfit, prev.operatingProfit),
    ];

    const payload: PnlResponse = {
      period: range.period,
      previous: range.previous,
      currency: company.currency,
      lines,
      totals: {
        revenue: round(cur.revenue),
        cogs: round(cur.cogs),
        grossProfit: round(cur.grossProfit),
        grossMargin: pct(cur.grossProfit, cur.revenue),
        expensesTotal: round(cur.expensesTotal),
        netProfit: round(cur.netProfit),
        margin: pct(cur.netProfit, cur.revenue),
        previousNetProfit: round(prev.netProfit),
        netProfitDeltaPct: deltaPct(round(cur.netProfit), round(prev.netProfit)),
      },
    };

    res.json(payload);
  }),
);

// ─────────────────────────── Xarajatlar (qo'lda kiritiladigan) ───────────────────────────

interface ExpenseRow {
  id: string;
  date: string;
  category: ExpenseCategory;
  label: string;
  amount: number;
  storeId: string | null;
  storeTitle: string | null;
  note: string | null;
  source: string;
  createdAt: string;
}

interface ExpenseListResponse {
  period: Period;
  total: number;
  byCategory: { category: ExpenseCategory; label: string; amount: number; share: number }[];
  rows: Paginated<ExpenseRow>;
}

interface ExpenseSummaryResponse {
  period: Period;
  total: number;
  byCategory: { category: ExpenseCategory; label: string; amount: number; share: number; count: number }[];
  byMonth: {
    month: string;
    label: string;
    total: number;
    categories: { category: ExpenseCategory; amount: number }[];
  }[];
}

interface DbExpense {
  id: string;
  date: Date;
  category: string;
  amount: number;
  storeId: string | null;
  note: string | null;
  source: string;
  createdAt: Date;
}

/** Kategoriya nomini xavfsiz aniqlash (bazada notanish qiymat bo'lsa 'other') */
function toCategory(value: string): ExpenseCategory {
  return (CATEGORY_ORDER as string[]).includes(value) ? (value as ExpenseCategory) : 'other';
}

function toExpenseRow(e: DbExpense, storeTitles: Map<string, string>): ExpenseRow {
  const category = toCategory(e.category);
  return {
    id: e.id,
    date: toISODate(e.date),
    category,
    label: CATEGORY_LABEL[category],
    amount: round(e.amount),
    storeId: e.storeId,
    storeTitle: e.storeId ? (storeTitles.get(e.storeId) ?? null) : null,
    note: e.note,
    source: e.source,
    createdAt: e.createdAt.toISOString(),
  };
}

/** GET /expenses/summary — kategoriya va oy bo'yicha jamlanma */
router.get(
  '/expenses/summary',
  requireFeature('expenses'),
  ah(async (req, res) => {
    const { company, plan } = companyCtx(req);
    const range = resolveRange(req, plan);

    const rows = await prisma.expense.findMany({
      where: {
        companyId: company.id,
        date: { gte: range.from, lt: range.toExclusive },
        ...(range.storeId ? { storeId: range.storeId } : {}),
      },
      select: { date: true, category: true, amount: true },
    });

    const byCat = emptyCategories();
    const countByCat = emptyCategories();
    const byMonth = new Map<string, Record<ExpenseCategory, number>>();
    let total = 0;

    for (const r of rows) {
      const category = toCategory(r.category);
      byCat[category] += r.amount;
      countByCat[category] += 1;
      total += r.amount;

      const key = toISODate(r.date).slice(0, 7);
      const m = byMonth.get(key) ?? emptyCategories();
      m[category] += r.amount;
      byMonth.set(key, m);
    }

    const payload: ExpenseSummaryResponse = {
      period: range.period,
      total: round(total),
      byCategory: CATEGORY_ORDER.map((category) => ({
        category,
        label: CATEGORY_LABEL[category],
        amount: round(byCat[category]),
        share: pct(byCat[category], total),
        count: countByCat[category],
      })),
      byMonth: [...byMonth.entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([month, cats]) => ({
          month,
          label: monthLabel(month),
          total: round(CATEGORY_ORDER.reduce((s, c) => s + cats[c], 0)),
          categories: CATEGORY_ORDER.map((category) => ({ category, amount: round(cats[category]) })),
        })),
    };

    res.json(payload);
  }),
);

/** GET /expenses — ro'yxat (sahifalangan) */
router.get(
  '/expenses',
  requireFeature('expenses'),
  ah(async (req, res) => {
    const { company, plan } = companyCtx(req);
    const range = resolveRange(req, plan);
    const q = req.query as Record<string, string | undefined>;
    const category = q.category && (CATEGORY_ORDER as string[]).includes(q.category) ? q.category : undefined;

    const [rows, storeTitles] = await Promise.all([
      prisma.expense.findMany({
        where: {
          companyId: company.id,
          date: { gte: range.from, lt: range.toExclusive },
          ...(range.storeId ? { storeId: range.storeId } : {}),
          ...(category ? { category } : {}),
          ...(range.search ? { note: { contains: range.search } } : {}),
        },
        orderBy: { date: range.order === 'asc' ? 'asc' : 'desc' },
      }),
      getStoreTitles(company.id),
    ]);

    const byCat = emptyCategories();
    let total = 0;
    for (const r of rows) {
      byCat[toCategory(r.category)] += r.amount;
      total += r.amount;
    }

    const items = rows.map((r) => toExpenseRow(r, storeTitles));

    const payload: ExpenseListResponse = {
      period: range.period,
      total: round(total),
      byCategory: CATEGORY_ORDER.map((cat) => ({
        category: cat,
        label: CATEGORY_LABEL[cat],
        amount: round(byCat[cat]),
        share: pct(byCat[cat], total),
      })),
      rows: paginate(items, range.page, range.pageSize),
    };

    res.json(payload);
  }),
);

/** POST /expenses — yangi xarajat */
router.post(
  '/expenses',
  requireFeature('expenses'),
  requireRole('owner', 'manager'),
  ah(async (req, res) => {
    const { company } = companyCtx(req);
    const input = expenseSchema.parse(req.body);
    const storeId = await resolveStoreId(company.id, input.storeId);

    const created = await prisma.expense.create({
      data: {
        companyId: company.id,
        storeId,
        date: parseDay(input.date),
        category: input.category,
        amount: input.amount,
        note: input.note ?? null,
        source: 'manual',
      },
    });

    const storeTitles = await getStoreTitles(company.id);
    res.status(201).json(toExpenseRow(created, storeTitles));
  }),
);

/** PATCH /expenses/:id — tahrirlash */
router.patch(
  '/expenses/:id',
  requireFeature('expenses'),
  requireRole('owner', 'manager'),
  ah(async (req, res) => {
    const { company } = companyCtx(req);
    const id = req.params.id;
    const existing = await prisma.expense.findFirst({ where: { id, companyId: company.id }, select: { id: true } });
    if (!existing) throw AppError.notFound('Xarajat topilmadi');

    const input = expenseSchema.partial().parse(req.body);
    const storeId = input.storeId === undefined ? undefined : await resolveStoreId(company.id, input.storeId);

    const updated = await prisma.expense.update({
      where: { id: existing.id },
      data: {
        ...(input.date !== undefined ? { date: parseDay(input.date) } : {}),
        ...(input.category !== undefined ? { category: input.category } : {}),
        ...(input.amount !== undefined ? { amount: input.amount } : {}),
        ...(input.note !== undefined ? { note: input.note } : {}),
        ...(storeId !== undefined ? { storeId } : {}),
      },
    });

    const storeTitles = await getStoreTitles(company.id);
    res.json(toExpenseRow(updated, storeTitles));
  }),
);

/** DELETE /expenses/:id — o'chirish */
router.delete(
  '/expenses/:id',
  requireFeature('expenses'),
  requireRole('owner', 'manager'),
  ah(async (req, res) => {
    const { company } = companyCtx(req);
    const id = req.params.id;
    const existing = await prisma.expense.findFirst({
      where: { id, companyId: company.id },
      select: { id: true, amount: true },
    });
    if (!existing) throw AppError.notFound('Xarajat topilmadi');

    await prisma.expense.delete({ where: { id: existing.id } });
    res.json({ ok: true, id: existing.id, message: `${formatMoney(existing.amount, 'uz')} xarajat o‘chirildi` });
  }),
);

export default router;
