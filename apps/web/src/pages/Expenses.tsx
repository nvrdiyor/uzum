import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CalendarDays,
  Download,
  Layers,
  PieChart,
  Pencil,
  Plus,
  Receipt,
  Trash2,
  TrendingDown,
  Wallet,
} from 'lucide-react';
import { EXPENSE_CATEGORIES, type ExpenseCategory, type FinanceResponse } from '@savdoiq/shared';
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  DataTable,
  EmptyState,
  ErrorState,
  IconButton,
  Modal,
  PageHeader,
  PlanGate,
  PreviewBadge,
  SearchInput,
  Select,
  Skeleton,
  StatCard,
  StatGrid,
  toast,
  type Column,
} from '@/components/ui';
import { DonutChart, type DonutDatum } from '@/components/charts';
import { FilterBar } from '@/components/filters';
import { ExpenseFormModal } from '@/components/finance/ExpenseFormModal';
import {
  CATEGORY_TONE,
  categoryColor,
  monthLabel,
  normalizeExpenseList,
  normalizeExpenseSummary,
  periodDays,
} from '@/components/finance/financeData';
import type { ExpenseInput, ExpenseRow } from '@/components/finance/types';
import { api } from '@/lib/api';
import { usePeriodQuery } from '@/store/ui';
import { useFeature } from '@/store/session';
import { downloadBlob } from '@/lib/utils';
import { pickLocalized, registerNamespace, useFormat, useLang, useT } from '@/i18n';

registerNamespace('expenses', {
  uz: {
    title: 'Qo‘shimcha xarajatlar',
    subtitle: 'Marketing, ish haqi va boshqa xarajatlar — sof foyda aniqroq hisoblanadi',
    add: 'Xarajat qo‘shish',
    'export.done': 'Excel fayl tayyor',
    'export.error': 'Eksport qilib bo‘lmadi',

    'kpi.total': 'Davr xarajatlari',
    'kpi.totalHint': '{n} ta yozuv bo‘yicha jami',
    'kpi.top': 'Eng katta modda',
    'kpi.topHint': '{v} — jamining {p}',
    'kpi.topNone': 'Hali yo‘q',
    'kpi.daily': 'Kunlik o‘rtacha',
    'kpi.dailyHint': '{n} kunlik davr bo‘yicha',
    'kpi.share': 'Yalpi foydadagi ulushi',
    'kpi.shareHint': 'Qo‘shimcha xarajatlar yalpi foydaning shuncha qismini yeydi',
    'kpi.shareNone': 'Moliya ma’lumoti mavjud emas',

    'filter.allCategories': 'Barcha kategoriyalar',
    'filter.search': 'Izoh bo‘yicha qidirish',

    'sum.title': 'Oylik jamlanma',
    'sum.subtitle': 'Kategoriya × oy kesimida',
    'sum.category': 'Kategoriya',
    'sum.total': 'Jami',
    'sum.empty': 'Jamlanma uchun ma’lumot yo‘q',
    'sum.emptyHint': 'Birinchi xarajatni kiritganingizdan so‘ng jadval to‘ladi',

    'donut.title': 'Kategoriyalar bo‘yicha',
    'donut.subtitle': 'Tanlangan davr uchun taqsimot',
    'donut.total': 'Jami',

    'table.title': 'Xarajatlar ro‘yxati',
    'table.subtitle': '{n} ta yozuv',
    'col.date': 'Sana',
    'col.category': 'Kategoriya',
    'col.amount': 'Summa',
    'col.store': 'Do‘kon',
    'col.note': 'Izoh',
    'col.actions': 'Amallar',
    'row.allStores': 'Barcha do‘konlar',
    'row.noNote': '—',

    'empty.title': 'Hali xarajat kiritilmagan',
    'empty.hint':
      'Marketing, ish haqi va boshqa xarajatlarni kiriting — sof foyda aniqroq hisoblanadi.',
    'filterEmpty.title': 'Bu filtr bo‘yicha yozuv topilmadi',
    'filterEmpty.hint': 'Kategoriyani o‘zgartiring yoki qidiruvni tozalang',

    'form.addTitle': 'Yangi xarajat',
    'form.editTitle': 'Xarajatni tahrirlash',
    'form.description': 'Sana, kategoriya va summani kiriting — qolgani ixtiyoriy',
    'form.note': 'Izoh',
    'form.notePlaceholder': 'Masalan: Telegram reklama, sentabr',
    'form.allStores': 'Barcha do‘konlar',
    'form.invalid': 'Sanani tanlang va noldan katta summa kiriting',
    'form.hintAmount': 'Summani kiriting',

    'save.ok': 'Xarajat saqlandi',
    'save.okBody': 'Hisob-kitoblar yangilandi',
    'save.err': 'Saqlab bo‘lmadi',

    'del.title': 'Xarajatni o‘chirish',
    'del.body': '{v} ({c}) yozuvi butunlay o‘chiriladi. Davom etamizmi?',
    'del.confirm': 'O‘chirish',
    'del.ok': 'Xarajat o‘chirildi',
    'del.err': 'O‘chirib bo‘lmadi',
  },
  ru: {
    title: 'Дополнительные расходы',
    subtitle: 'Маркетинг, зарплата и прочие траты — чистая прибыль считается точнее',
    add: 'Добавить расход',
    'export.done': 'Excel-файл готов',
    'export.error': 'Не удалось выгрузить',

    'kpi.total': 'Расходы за период',
    'kpi.totalHint': 'Итого по {n} записям',
    'kpi.top': 'Крупнейшая статья',
    'kpi.topHint': '{v} — {p} от всех',
    'kpi.topNone': 'Пока нет',
    'kpi.daily': 'В среднем в день',
    'kpi.dailyHint': 'За период в {n} дн.',
    'kpi.share': 'Доля в валовой прибыли',
    'kpi.shareHint': 'Столько валовой прибыли съедают дополнительные расходы',
    'kpi.shareNone': 'Финансовые данные недоступны',

    'filter.allCategories': 'Все категории',
    'filter.search': 'Поиск по комментарию',

    'sum.title': 'Сводка по месяцам',
    'sum.subtitle': 'В разрезе категория × месяц',
    'sum.category': 'Категория',
    'sum.total': 'Итого',
    'sum.empty': 'Нет данных для сводки',
    'sum.emptyHint': 'Таблица заполнится после первой записи',

    'donut.title': 'По категориям',
    'donut.subtitle': 'Распределение за выбранный период',
    'donut.total': 'Всего',

    'table.title': 'Список расходов',
    'table.subtitle': 'Записей: {n}',
    'col.date': 'Дата',
    'col.category': 'Категория',
    'col.amount': 'Сумма',
    'col.store': 'Магазин',
    'col.note': 'Комментарий',
    'col.actions': 'Действия',
    'row.allStores': 'Все магазины',
    'row.noNote': '—',

    'empty.title': 'Расходы ещё не вносились',
    'empty.hint':
      'Внесите маркетинг, зарплату и прочие траты — чистая прибыль будет считаться точнее.',
    'filterEmpty.title': 'По этому фильтру записей нет',
    'filterEmpty.hint': 'Измените категорию или очистите поиск',

    'form.addTitle': 'Новый расход',
    'form.editTitle': 'Изменить расход',
    'form.description': 'Укажите дату, категорию и сумму — остальное по желанию',
    'form.note': 'Комментарий',
    'form.notePlaceholder': 'Например: реклама в Telegram, сентябрь',
    'form.allStores': 'Все магазины',
    'form.invalid': 'Выберите дату и введите сумму больше нуля',
    'form.hintAmount': 'Введите сумму',

    'save.ok': 'Расход сохранён',
    'save.okBody': 'Расчёты обновлены',
    'save.err': 'Не удалось сохранить',

    'del.title': 'Удалить расход',
    'del.body': 'Запись {v} ({c}) будет удалена безвозвратно. Продолжить?',
    'del.confirm': 'Удалить',
    'del.ok': 'Расход удалён',
    'del.err': 'Не удалось удалить',
  },
  en: {
    title: 'Extra expenses',
    subtitle: 'Marketing, salaries and other costs — so net profit is calculated properly',
    add: 'Add expense',
    'export.done': 'Excel file is ready',
    'export.error': 'Export failed',

    'kpi.total': 'Expenses this period',
    'kpi.totalHint': 'Total across {n} records',
    'kpi.top': 'Largest category',
    'kpi.topHint': '{v} — {p} of everything',
    'kpi.topNone': 'None yet',
    'kpi.daily': 'Daily average',
    'kpi.dailyHint': 'Over a {n}-day period',
    'kpi.share': 'Share of gross profit',
    'kpi.shareHint': 'How much of your gross profit these extra costs eat',
    'kpi.shareNone': 'Financial data unavailable',

    'filter.allCategories': 'All categories',
    'filter.search': 'Search in notes',

    'sum.title': 'Monthly summary',
    'sum.subtitle': 'Category by month',
    'sum.category': 'Category',
    'sum.total': 'Total',
    'sum.empty': 'Nothing to summarise yet',
    'sum.emptyHint': 'The table fills in after your first record',

    'donut.title': 'By category',
    'donut.subtitle': 'Split for the selected period',
    'donut.total': 'Total',

    'table.title': 'Expense list',
    'table.subtitle': '{n} records',
    'col.date': 'Date',
    'col.category': 'Category',
    'col.amount': 'Amount',
    'col.store': 'Store',
    'col.note': 'Note',
    'col.actions': 'Actions',
    'row.allStores': 'All stores',
    'row.noNote': '—',

    'empty.title': 'No expenses recorded yet',
    'empty.hint':
      'Add marketing, salaries and other costs — your net profit will be far more accurate.',
    'filterEmpty.title': 'No records match this filter',
    'filterEmpty.hint': 'Change the category or clear the search',

    'form.addTitle': 'New expense',
    'form.editTitle': 'Edit expense',
    'form.description': 'Date, category and amount are required — the rest is optional',
    'form.note': 'Note',
    'form.notePlaceholder': 'e.g. Telegram ads, September',
    'form.allStores': 'All stores',
    'form.invalid': 'Pick a date and enter an amount greater than zero',
    'form.hintAmount': 'Enter the amount',

    'save.ok': 'Expense saved',
    'save.okBody': 'The numbers have been recalculated',
    'save.err': 'Could not save',

    'del.title': 'Delete expense',
    'del.body': 'The record {v} ({c}) will be deleted permanently. Continue?',
    'del.confirm': 'Delete',
    'del.ok': 'Expense deleted',
    'del.err': 'Could not delete',
  },
});

const PAGE_SIZE = 25;

export default function Expenses() {
  const t = useT('expenses');
  const tc = useT('common');
  const f = useFormat();
  const lang = useLang();
  const q = usePeriodQuery();
  const qc = useQueryClient();

  const [category, setCategory] = useState<ExpenseCategory | ''>('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ExpenseRow | null>(null);
  const [pendingDelete, setPendingDelete] = useState<ExpenseRow | null>(null);
  const [exporting, setExporting] = useState(false);

  const listQuery = useMemo(
    () => ({
      ...q,
      category: category || undefined,
      search: search.trim() || undefined,
      page,
      pageSize: PAGE_SIZE,
    }),
    [q, category, search, page],
  );

  const list = useQuery({
    queryKey: ['expenses', listQuery],
    queryFn: () => api.get<unknown>('/finance/expenses', listQuery).then(normalizeExpenseList),
    placeholderData: (prev) => prev,
  });

  const summaryQuery = useQuery({
    queryKey: ['expenses-summary', q],
    queryFn: () => api.get<unknown>('/finance/expenses/summary', q),
  });

  // Foydadagi ulushni hisoblash uchun — moliya bo'limi (tarif ruxsat bersa)
  const financeAccess = useFeature('unit_economics');
  const finance = useQuery({
    queryKey: ['finance', q],
    queryFn: () => api.get<FinanceResponse>('/finance', q),
    enabled: financeAccess === 'full',
    retry: false,
  });

  const rows = useMemo(() => list.data?.rows ?? [], [list.data]);
  const summary = useMemo(
    () => normalizeExpenseSummary(summaryQuery.data, rows),
    [summaryQuery.data, rows],
  );

  const total = summary.total || list.data?.amountTotal || 0;
  /** Ro'yxatdagi (filtrlangan) yozuvlar soni */
  const recordCount = list.data?.total ?? rows.length;
  /** Davr bo'yicha (filtrsiz) yozuvlar soni — jamlanmadan */
  const periodCount = useMemo(() => {
    const fromSummary = summary.byCategory.reduce((s, c) => s + c.count, 0);
    return fromSummary > 0 ? fromSummary : recordCount;
  }, [summary, recordCount]);
  const days = periodDays(q.from, q.to);

  const labelOf = (id: ExpenseCategory) => {
    const meta = EXPENSE_CATEGORIES.find((c) => c.id === id);
    return meta ? pickLocalized(meta.label, lang) : id;
  };

  const topCategory = useMemo(
    () =>
      summary.byCategory
        .filter((c) => c.amount > 0)
        .slice()
        .sort((a, b) => b.amount - a.amount)[0] ?? null,
    [summary],
  );

  const grossProfit = finance.data?.grossProfit ?? null;
  const profitShare =
    grossProfit !== null && grossProfit > 0 ? (total / grossProfit) * 100 : null;

  const donutData: DonutDatum[] = useMemo(
    () =>
      summary.byCategory
        .filter((c) => c.amount > 0)
        .sort((a, b) => b.amount - a.amount)
        .map((c) => ({ name: labelOf(c.category), value: c.amount, color: categoryColor(c.category) })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [summary, lang],
  );

  /** Jamlanma jadvalida faqat qiymati bor kategoriyalar ko'rsatiladi */
  const summaryCategories = useMemo(
    () =>
      EXPENSE_CATEGORIES.map((c) => c.id).filter((id) =>
        summary.months.some((m) => m.byCategory[id] > 0),
      ),
    [summary],
  );

  // ─────────────────────────── Mutatsiyalar ───────────────────────────

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['expenses'] });
    void qc.invalidateQueries({ queryKey: ['expenses-summary'] });
    void qc.invalidateQueries({ queryKey: ['finance'] });
    void qc.invalidateQueries({ queryKey: ['finance-pnl'] });
    void qc.invalidateQueries({ queryKey: ['dashboard'] });
  };

  const save = useMutation({
    mutationFn: (input: ExpenseInput) =>
      editing
        ? api.patch<unknown>(`/finance/expenses/${editing.id}`, input)
        : api.post<unknown>('/finance/expenses', input),
    onSuccess: () => {
      toast.success(t('save.ok'), t('save.okBody'));
      setFormOpen(false);
      setEditing(null);
      invalidate();
    },
    onError: (err: unknown) => {
      toast.error(t('save.err'), err instanceof Error ? err.message : undefined);
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.del<unknown>(`/finance/expenses/${id}`),
    onSuccess: () => {
      toast.success(t('del.ok'));
      setPendingDelete(null);
      invalidate();
    },
    onError: (err: unknown) => {
      toast.error(t('del.err'), err instanceof Error ? err.message : undefined);
    },
  });

  const onExport = async () => {
    setExporting(true);
    try {
      const blob = await api.blob('/export/expenses', {
        ...q,
        category: category || undefined,
      });
      downloadBlob(blob, `expenses-${q.from}_${q.to}.xlsx`);
      toast.success(t('export.done'));
    } catch (err) {
      toast.error(t('export.error'), err instanceof Error ? err.message : undefined);
    } finally {
      setExporting(false);
    }
  };

  const openAdd = () => {
    setEditing(null);
    setFormOpen(true);
  };

  const openEdit = (row: ExpenseRow) => {
    setEditing(row);
    setFormOpen(true);
  };

  // ─────────────────────────── Jadval ───────────────────────────

  const columns: Column<ExpenseRow>[] = useMemo(
    () => [
      {
        key: 'date',
        header: t('col.date'),
        width: 130,
        sortable: true,
        sortValue: (r) => r.date,
        render: (r) => <span className="tnum text-ink">{r.date ? f.date(r.date) : '—'}</span>,
      },
      {
        key: 'category',
        header: t('col.category'),
        width: 150,
        sortable: true,
        sortValue: (r) => r.category,
        render: (r) => (
          <Badge tone={CATEGORY_TONE[r.category]} dot>
            {labelOf(r.category)}
          </Badge>
        ),
      },
      {
        key: 'amount',
        header: t('col.amount'),
        align: 'right',
        width: 160,
        sortable: true,
        sortValue: (r) => r.amount,
        render: (r) => <span className="font-semibold text-ink">{f.money(r.amount)}</span>,
      },
      {
        key: 'store',
        header: t('col.store'),
        hideOnMobile: true,
        render: (r) =>
          r.storeTitle ? (
            <span className="truncate text-ink-soft">{r.storeTitle}</span>
          ) : (
            <span className="text-muted">{t('row.allStores')}</span>
          ),
      },
      {
        key: 'note',
        header: t('col.note'),
        hideOnMobile: true,
        render: (r) =>
          r.note ? (
            <span className="line-clamp-2 text-ink-soft">{r.note}</span>
          ) : (
            <span className="text-muted">{t('row.noNote')}</span>
          ),
      },
      {
        key: 'actions',
        header: t('col.actions'),
        align: 'right',
        width: 108,
        render: (r) => (
          <div className="flex items-center justify-end gap-1.5">
            <IconButton label={tc('btn.edit')} className="h-8 w-8" onClick={() => openEdit(r)}>
              <Pencil className="h-3.5 w-3.5" />
            </IconButton>
            <IconButton
              label={tc('btn.delete')}
              className="h-8 w-8 hover:text-danger"
              onClick={() => setPendingDelete(r)}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </IconButton>
          </div>
        ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t, tc, f, lang],
  );

  const hasAnyExpense = periodCount > 0 || total > 0;
  const isFiltered = Boolean(category) || Boolean(search.trim());

  return (
    <>
      <PageHeader
        icon={<Receipt className="h-5 w-5" />}
        title={t('title')}
        description={t('subtitle')}
        badge={<PreviewBadge feature="expenses" />}
        actions={
          <>
            <Button
              variant="outline"
              icon={<Download className="h-4 w-4" />}
              loading={exporting}
              onClick={onExport}
            >
              {tc('btn.export')}
            </Button>
            <Button icon={<Plus className="h-4 w-4" />} onClick={openAdd}>
              {t('add')}
            </Button>
          </>
        }
      />

      <FilterBar>
        <Select
          className="h-10 w-full py-0 sm:w-52"
          value={category}
          onChange={(e) => {
            setCategory(e.target.value as ExpenseCategory | '');
            setPage(1);
          }}
        >
          <option value="">{t('filter.allCategories')}</option>
          {EXPENSE_CATEGORIES.map((c) => (
            <option key={c.id} value={c.id}>
              {pickLocalized(c.label, lang)}
            </option>
          ))}
        </Select>
        <SearchInput
          value={search}
          onChange={(v) => {
            setSearch(v);
            setPage(1);
          }}
          placeholder={t('filter.search')}
          className="w-full sm:w-64"
        />
      </FilterBar>

      <PlanGate feature="expenses">
        {list.isError ? (
          <Card>
            <ErrorState
              message={list.error instanceof Error ? list.error.message : tc('common.error')}
              onRetry={() => void list.refetch()}
              retryLabel={tc('btn.retry')}
            />
          </Card>
        ) : (
          <div className="space-y-5">
            {/* ── 1. KPI ── */}
            <StatGrid>
              <StatCard
                label={t('kpi.total')}
                value={f.money(total)}
                hint={t('kpi.totalHint', { n: periodCount })}
                icon={<Wallet className="h-5 w-5" />}
                tone="danger"
                loading={list.isLoading}
              />
              <StatCard
                label={t('kpi.top')}
                value={topCategory ? labelOf(topCategory.category) : t('kpi.topNone')}
                hint={
                  topCategory
                    ? t('kpi.topHint', {
                        v: f.money(topCategory.amount),
                        p: f.pct(topCategory.share),
                      })
                    : t('kpi.shareNone')
                }
                icon={<Layers className="h-5 w-5" />}
                tone="warn"
                loading={list.isLoading}
              />
              <StatCard
                label={t('kpi.daily')}
                value={f.money(days > 0 ? total / days : 0)}
                hint={t('kpi.dailyHint', { n: days })}
                icon={<CalendarDays className="h-5 w-5" />}
                tone="info"
                loading={list.isLoading}
              />
              <StatCard
                label={t('kpi.share')}
                value={profitShare === null ? '—' : f.pct(profitShare)}
                hint={profitShare === null ? t('kpi.shareNone') : t('kpi.shareHint')}
                icon={<TrendingDown className="h-5 w-5" />}
                tone="violet"
                loading={list.isLoading || finance.isLoading}
              />
            </StatGrid>

            {/* ── 2. Oylik jamlanma + donut ── */}
            <div className="grid gap-4 xl:grid-cols-3">
              <Card className="flex flex-col xl:col-span-2">
                <CardHeader
                  icon={<Layers className="h-4 w-4" />}
                  title={t('sum.title')}
                  subtitle={t('sum.subtitle')}
                />
                {summaryQuery.isLoading ? (
                  <div className="p-5">
                    <Skeleton className="h-[220px] w-full" />
                  </div>
                ) : summary.months.length === 0 || summaryCategories.length === 0 ? (
                  <EmptyState
                    className="py-12"
                    icon={<Layers className="h-6 w-6" />}
                    title={t('sum.empty')}
                    hint={t('sum.emptyHint')}
                  />
                ) : (
                  <div className="mt-4 overflow-x-auto">
                    <table className="w-full min-w-[560px] border-collapse text-sm">
                      <thead>
                        <tr>
                          <th className="table-head border-b border-line px-4 py-3 text-left">
                            {t('sum.category')}
                          </th>
                          {summary.months.map((m) => (
                            <th
                              key={m.month}
                              className="table-head border-b border-line px-4 py-3 text-right"
                            >
                              {monthLabel(m.month, lang)}
                            </th>
                          ))}
                          <th className="table-head border-b border-line px-4 py-3 text-right">
                            {t('sum.total')}
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {summaryCategories.map((id) => {
                          const rowTotal = summary.months.reduce((s, m) => s + m.byCategory[id], 0);
                          return (
                            <tr key={id} className="border-b border-line/60 last:border-0 text-ink-soft">
                              <td className="px-4 py-3">
                                <span className="flex items-center gap-2">
                                  <span
                                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                                    style={{ background: categoryColor(id) }}
                                  />
                                  {labelOf(id)}
                                </span>
                              </td>
                              {summary.months.map((m) => (
                                <td key={m.month} className="tnum px-4 py-3 text-right">
                                  {m.byCategory[id] > 0 ? (
                                    f.compact(m.byCategory[id])
                                  ) : (
                                    <span className="text-muted">—</span>
                                  )}
                                </td>
                              ))}
                              <td className="tnum px-4 py-3 text-right font-semibold text-ink">
                                {f.money(rowTotal)}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot>
                        <tr className="border-t border-line-strong bg-surface-2/70 font-bold text-ink">
                          <td className="px-4 py-3">{t('sum.total')}</td>
                          {summary.months.map((m) => (
                            <td key={m.month} className="tnum px-4 py-3 text-right">
                              {f.compact(m.total)}
                            </td>
                          ))}
                          <td className="tnum px-4 py-3 text-right font-display text-base font-extrabold">
                            {f.money(summary.months.reduce((s, m) => s + m.total, 0))}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}
              </Card>

              <Card className="flex flex-col">
                <CardHeader
                  icon={<PieChart className="h-4 w-4" />}
                  title={t('donut.title')}
                  subtitle={t('donut.subtitle')}
                />
                <CardBody className="flex-1">
                  {summaryQuery.isLoading ? (
                    <Skeleton className="h-[230px] w-full" />
                  ) : donutData.length === 0 ? (
                    <EmptyState
                      className="py-10"
                      icon={<PieChart className="h-6 w-6" />}
                      title={t('sum.empty')}
                      hint={t('sum.emptyHint')}
                    />
                  ) : (
                    <>
                      <DonutChart
                        data={donutData}
                        height={220}
                        innerRadius={58}
                        outerRadius={88}
                        center={
                          <div>
                            <p className="eyebrow">
                              {t('donut.total')}
                            </p>
                            <p className="tnum font-display text-base font-extrabold text-ink">
                              {f.compact(total)}
                            </p>
                          </div>
                        }
                      />
                      <ul className="mt-3 space-y-2">
                        {donutData.map((d) => (
                          <li key={d.name} className="flex items-center gap-2.5 text-sm">
                            <span
                              className="h-2.5 w-2.5 shrink-0 rounded-full"
                              style={{ background: d.color }}
                            />
                            <span className="min-w-0 flex-1 truncate text-ink-soft">{d.name}</span>
                            <span className="tnum shrink-0 font-semibold text-ink">
                              {f.compact(d.value)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
                </CardBody>
              </Card>
            </div>

            {/* ── 3. Ro'yxat ── */}
            <Card>
              <CardHeader
                icon={<Receipt className="h-4 w-4" />}
                title={t('table.title')}
                subtitle={t('table.subtitle', { n: recordCount })}
                actions={
                  <Button size="sm" icon={<Plus className="h-3.5 w-3.5" />} onClick={openAdd}>
                    {t('add')}
                  </Button>
                }
              />
              <div className={list.isFetching && !list.isLoading ? 'mt-4 opacity-70' : 'mt-4'}>
                <DataTable
                  columns={columns}
                  rows={rows}
                  rowKey={(r) => r.id}
                  loading={list.isLoading}
                  density="compact"
                  pagination={{
                    page: list.data?.page ?? page,
                    pages: list.data?.pages ?? 1,
                    total: recordCount,
                    pageSize: PAGE_SIZE,
                    onPage: setPage,
                  }}
                  empty={
                    <EmptyState
                      icon={<Receipt className="h-6 w-6" />}
                      title={isFiltered && hasAnyExpense ? t('filterEmpty.title') : t('empty.title')}
                      hint={isFiltered && hasAnyExpense ? t('filterEmpty.hint') : t('empty.hint')}
                      action={
                        isFiltered && hasAnyExpense ? (
                          <Button
                            variant="outline"
                            onClick={() => {
                              setCategory('');
                              setSearch('');
                              setPage(1);
                            }}
                          >
                            {tc('btn.all')}
                          </Button>
                        ) : (
                          <Button icon={<Plus className="h-4 w-4" />} onClick={openAdd}>
                            {t('add')}
                          </Button>
                        )
                      }
                    />
                  }
                />
              </div>
            </Card>
          </div>
        )}
      </PlanGate>

      {/* ── Qo'shish / tahrirlash ── */}
      <ExpenseFormModal
        open={formOpen}
        initial={editing}
        saving={save.isPending}
        onClose={() => {
          setFormOpen(false);
          setEditing(null);
        }}
        onSubmit={(input) => save.mutate(input)}
      />

      {/* ── O'chirishni tasdiqlash ── */}
      <Modal
        open={pendingDelete !== null}
        onClose={() => setPendingDelete(null)}
        title={t('del.title')}
        size="sm"
        footer={
          <div className="flex items-center justify-end gap-2">
            <Button variant="ghost" onClick={() => setPendingDelete(null)} disabled={remove.isPending}>
              {tc('btn.cancel')}
            </Button>
            <Button
              variant="danger"
              loading={remove.isPending}
              onClick={() => pendingDelete && remove.mutate(pendingDelete.id)}
            >
              {t('del.confirm')}
            </Button>
          </div>
        }
      >
        <p className="text-sm text-ink-soft">
          {pendingDelete
            ? t('del.body', {
                v: f.money(pendingDelete.amount),
                c: labelOf(pendingDelete.category),
              })
            : ''}
        </p>
      </Modal>
    </>
  );
}
