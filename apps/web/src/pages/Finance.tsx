import { useMemo, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  CalendarClock,
  Coins,
  Download,
  Hourglass,
  PiggyBank,
  Receipt,
  RefreshCw,
  Scale,
  TrendingUp,
  Wallet,
  Wallet2,
} from 'lucide-react';
import { EXPENSE_CATEGORIES, deltaPct, type FinanceResponse } from '@savdoiq/shared';
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  ErrorState,
  IconButton,
  PageHeader,
  PlanGate,
  PreviewBadge,
  ProgressBar,
  Skeleton,
  StatCard,
  StatGrid,
  toast,
} from '@/components/ui';
import { ChartCard, DonutChart, TrendChart, type DonutDatum, type SeriesDef } from '@/components/charts';
import { FilterBar } from '@/components/filters';
import { PnlTable } from '@/components/finance/PnlTable';
import { CATEGORY_TONE, categoryColor, normalizePnl } from '@/components/finance/financeData';
import { api } from '@/lib/api';
import { CHART_COLORS } from '@/lib/theme';
import { usePeriodQuery } from '@/store/ui';
import { downloadBlob } from '@/lib/utils';
import { pickLocalized, registerNamespace, useFormat, useLang, useT } from '@/i18n';

registerNamespace('finance', {
  uz: {
    title: 'Moliya',
    subtitle: 'Pul qayerdan keladi va qayerga ketadi — bir ekranda',
    refresh: 'Ma’lumotni yangilash',
    'export.done': 'Excel fayl tayyor',
    'export.error': 'Eksport qilib bo‘lmadi',

    'kpi.revenue': 'Tushum',
    'kpi.revenueHint': 'Sotuvdan tushgan umumiy summa',
    'kpi.payout': 'To‘lovga',
    'kpi.payoutHint': 'Uzum o‘tkazadigan sof summa',
    'kpi.gross': 'Yalpi foyda',
    'kpi.grossHint': 'Tushum minus tannarx',
    'kpi.net': 'Sof foyda',
    'kpi.netHint': 'Tovarlar bo‘yicha, marja {v}',
    'kpi.oper': 'Davr foydasi',
    'kpi.operHint': 'Sof foyda minus davr xarajatlari ({v})',

    'chart.title': 'Kunlik dinamika',
    'chart.subtitle': 'Tushum, xarajat va sof foyda',
    'chart.empty': 'Grafik uchun ma’lumot yetarli emas',
    'chart.emptyHint': 'Yuqoridagi davr tanlagichidan kengroq oraliqni belgilang',
    'series.revenue': 'Tushum',
    'series.expenses': 'Xarajatlar',
    'series.profit': 'Sof foyda',

    'exp.title': 'Xarajatlar tuzilmasi',
    'exp.subtitle': 'Qaysi moddaga qancha ketdi',
    'exp.total': 'Jami xarajat',
    'exp.empty': 'Xarajat qayd etilmagan',
    'exp.emptyHint': 'Tanlangan davrda hech qanday xarajat topilmadi',

    'pnl.title': 'Foyda va zarar (P&L)',
    'pnl.subtitle': 'Joriy davr oldingi davr bilan taqqoslanadi',
    'pnl.empty': 'P&L uchun ma’lumot yo‘q',
    'pnl.emptyHint': 'Sotuv va xarajatlar paydo bo‘lgach jadval to‘ladi',
    'pnl.col.item': 'Modda',
    'pnl.col.current': 'Joriy davr',
    'pnl.col.previous': 'Oldingi davr',
    'pnl.col.delta': 'O‘zgarish',
    'pnl.col.share': 'Tushumdan',
    'pnl.revenue': 'Tushum',
    'pnl.payout': 'To‘lovga',
    'pnl.cogs': 'Tannarx',
    'pnl.commission': 'Komissiya',
    'pnl.storage': 'Ombor (saqlash)',
    'pnl.marketing': 'Marketing',
    'pnl.tax': 'Soliq',
    'pnl.salary': 'Ish haqi',
    'pnl.manualCommission': 'Komissiya (qo‘lda kiritilgan)',
    'pnl.manualTax': 'Soliq (qo‘lda kiritilgan)',
    'pnl.other': 'Boshqa xarajatlar',
    'pnl.grossProfit': 'Yalpi foyda',
    'pnl.netProfit': 'Sof foyda (tovarlar bo‘yicha)',
    'pnl.operatingProfit': 'Davr foydasi',
    'pnl.delivery': 'Mijozga yetkazish',
    'pnl.itemOther': 'Sotuvdagi boshqa ushlanmalar',
    'pnl.logistics': 'Omborga logistika',

    'bal.title': 'Balans',
    'bal.subtitle': 'Uzum bilan hisob-kitob holati',
    'bal.total': 'Umumiy balans',
    'bal.totalHint': 'Uzum ushlab turgan PUL — foyda emas: tannarx va soliq hali ayirilmagan',
    'bal.paid': 'To‘langan',
    'bal.paidHint': 'Yetkazilgan buyurtmalar bo‘yicha o‘tkazilgan',
    'bal.pending': 'Kutilmoqda',
    'bal.pendingHint': 'Hali yetkazilmagan buyurtmalar summasi',
    'bal.next': 'Keyingi to‘lov',
    'bal.nextHint': 'To‘lov jadvalingiz bo‘yicha — batafsili Pul kalendarida',
    'bal.none': 'Sana ma’lum emas',

    'empty.title': 'Bu davr uchun moliyaviy ma’lumot yo‘q',
    'empty.hint':
      'Tanlangan davrda sotuv ham, xarajat ham qayd etilmagan. Boshqa davrni tanlang yoki sinxronizatsiya tugashini kuting.',
  },
  ru: {
    title: 'Финансы',
    subtitle: 'Откуда приходят и куда уходят деньги — на одном экране',
    refresh: 'Обновить данные',
    'export.done': 'Excel-файл готов',
    'export.error': 'Не удалось выгрузить',

    'kpi.revenue': 'Выручка',
    'kpi.revenueHint': 'Общая сумма от продаж',
    'kpi.payout': 'К выплате',
    'kpi.payoutHint': 'Чистая сумма перевода от Uzum',
    'kpi.gross': 'Валовая прибыль',
    'kpi.grossHint': 'Выручка минус себестоимость',
    'kpi.net': 'Чистая прибыль',
    'kpi.netHint': 'По товарам, маржа {v}',
    'kpi.oper': 'Прибыль периода',
    'kpi.operHint': 'Чистая прибыль минус расходы периода ({v})',

    'chart.title': 'Динамика по дням',
    'chart.subtitle': 'Выручка, расходы и чистая прибыль',
    'chart.empty': 'Недостаточно данных для графика',
    'chart.emptyHint': 'Выберите более широкий диапазон в переключателе периода',
    'series.revenue': 'Выручка',
    'series.expenses': 'Расходы',
    'series.profit': 'Чистая прибыль',

    'exp.title': 'Структура расходов',
    'exp.subtitle': 'Сколько ушло по каждой статье',
    'exp.total': 'Всего расходов',
    'exp.empty': 'Расходы не зафиксированы',
    'exp.emptyHint': 'За выбранный период расходов не найдено',

    'pnl.title': 'Прибыль и убытки (P&L)',
    'pnl.subtitle': 'Текущий период в сравнении с прошлым',
    'pnl.empty': 'Нет данных для P&L',
    'pnl.emptyHint': 'Таблица заполнится, когда появятся продажи и расходы',
    'pnl.col.item': 'Статья',
    'pnl.col.current': 'Текущий период',
    'pnl.col.previous': 'Прошлый период',
    'pnl.col.delta': 'Изменение',
    'pnl.col.share': 'От выручки',
    'pnl.revenue': 'Выручка',
    'pnl.payout': 'К выплате',
    'pnl.cogs': 'Себестоимость',
    'pnl.commission': 'Комиссия',
    'pnl.storage': 'Хранение',
    'pnl.marketing': 'Маркетинг',
    'pnl.tax': 'Налог',
    'pnl.salary': 'Зарплата',
    'pnl.manualCommission': 'Комиссия (вручную)',
    'pnl.manualTax': 'Налог (вручную)',
    'pnl.other': 'Прочие расходы',
    'pnl.grossProfit': 'Валовая прибыль',
    'pnl.netProfit': 'Чистая прибыль (по товарам)',
    'pnl.operatingProfit': 'Прибыль периода',
    'pnl.delivery': 'Доставка покупателю',
    'pnl.itemOther': 'Прочие удержания в продаже',
    'pnl.logistics': 'Логистика на склад',

    'bal.title': 'Баланс',
    'bal.subtitle': 'Состояние расчётов с Uzum',
    'bal.total': 'Общий баланс',
    'bal.totalHint': 'ДЕНЬГИ на счёте Uzum — не прибыль: себестоимость и налог ещё не вычтены',
    'bal.paid': 'Выплачено',
    'bal.paidHint': 'Переведено по доставленным заказам',
    'bal.pending': 'Ожидается',
    'bal.pendingHint': 'Сумма по ещё не доставленным заказам',
    'bal.next': 'Следующая выплата',
    'bal.nextHint': 'По вашему графику выплат — подробнее в Календаре выплат',
    'bal.none': 'Дата неизвестна',

    'empty.title': 'За этот период финансовых данных нет',
    'empty.hint':
      'За выбранный период не было ни продаж, ни расходов. Выберите другой период или дождитесь окончания синхронизации.',
  },
  en: {
    title: 'Finance',
    subtitle: 'Where the money comes from and where it goes — on one screen',
    refresh: 'Refresh data',
    'export.done': 'Excel file is ready',
    'export.error': 'Export failed',

    'kpi.revenue': 'Revenue',
    'kpi.revenueHint': 'Total amount from sales',
    'kpi.payout': 'Payout',
    'kpi.payoutHint': 'Net amount Uzum transfers to you',
    'kpi.gross': 'Gross profit',
    'kpi.grossHint': 'Revenue minus cost of goods',
    'kpi.net': 'Net profit',
    'kpi.netHint': 'On goods sold, margin {v}',
    'kpi.oper': 'Period profit',
    'kpi.operHint': 'Net profit minus period expenses ({v})',

    'chart.title': 'Daily trend',
    'chart.subtitle': 'Revenue, expenses and net profit',
    'chart.empty': 'Not enough data to draw a chart',
    'chart.emptyHint': 'Pick a wider range in the period switcher above',
    'series.revenue': 'Revenue',
    'series.expenses': 'Expenses',
    'series.profit': 'Net profit',

    'exp.title': 'Expense breakdown',
    'exp.subtitle': 'How much went to each line',
    'exp.total': 'Total expenses',
    'exp.empty': 'No expenses recorded',
    'exp.emptyHint': 'Nothing was spent in the selected period',

    'pnl.title': 'Profit & loss (P&L)',
    'pnl.subtitle': 'Current period compared with the previous one',
    'pnl.empty': 'No P&L data yet',
    'pnl.emptyHint': 'The table fills in once sales and expenses appear',
    'pnl.col.item': 'Line item',
    'pnl.col.current': 'Current period',
    'pnl.col.previous': 'Previous period',
    'pnl.col.delta': 'Change',
    'pnl.col.share': 'Of revenue',
    'pnl.revenue': 'Revenue',
    'pnl.payout': 'Payout',
    'pnl.cogs': 'Cost of goods',
    'pnl.commission': 'Commission',
    'pnl.storage': 'Storage',
    'pnl.marketing': 'Marketing',
    'pnl.tax': 'Tax',
    'pnl.salary': 'Salary',
    'pnl.manualCommission': 'Commission (manual)',
    'pnl.manualTax': 'Tax (manual)',
    'pnl.other': 'Other expenses',
    'pnl.grossProfit': 'Gross profit',
    'pnl.netProfit': 'Net profit (on goods)',
    'pnl.operatingProfit': 'Period profit',
    'pnl.delivery': 'Delivery to customer',
    'pnl.itemOther': 'Other sale deductions',
    'pnl.logistics': 'Inbound logistics',

    'bal.title': 'Balance',
    'bal.subtitle': 'Settlement status with Uzum',
    'bal.total': 'Total balance',
    'bal.totalHint': 'CASH Uzum holds — not profit: cost price and tax are not deducted yet',
    'bal.paid': 'Paid out',
    'bal.paidHint': 'Transferred for delivered orders',
    'bal.pending': 'Pending',
    'bal.pendingHint': 'Amount for orders not delivered yet',
    'bal.next': 'Next payout',
    'bal.nextHint': 'Per your payout schedule — details in the payout calendar',
    'bal.none': 'Date unknown',

    'empty.title': 'No financial data for this period',
    'empty.hint':
      'There were no sales and no expenses in the selected period. Pick another period or wait for the sync to finish.',
  },
});

export default function Finance() {
  const t = useT('finance');
  const tc = useT('common');
  const f = useFormat();
  const lang = useLang();
  const q = usePeriodQuery();
  const [exporting, setExporting] = useState(false);

  const finance = useQuery({
    queryKey: ['finance', q],
    queryFn: () => api.get<FinanceResponse>('/finance', q),
  });

  const pnl = useQuery({
    queryKey: ['finance-pnl', q],
    queryFn: () => api.get<unknown>('/finance/pnl', q).then(normalizePnl),
  });

  const data = finance.data;
  const pnlLines = pnl.data?.lines ?? [];

  const lineMap = useMemo(() => new Map(pnlLines.map((l) => [l.id, l])), [pnlLines]);

  // Oldingi davr bilan taqqoslash — P&L javobidan
  const revenueDelta = lineMap.get('revenue')?.deltaPct ?? null;
  const netDelta = lineMap.get('netProfit')?.deltaPct ?? null;
  const operDelta = lineMap.get('operatingProfit')?.deltaPct ?? null;
  const grossDelta = useMemo(() => {
    const rev = lineMap.get('revenue');
    const cogs = lineMap.get('cogs');
    if (!rev || !data) return null;
    const previousGross = rev.previous - (cogs?.previous ?? 0);
    return deltaPct(data.grossProfit, previousGross);
  }, [lineMap, data]);

  const margin = data && data.revenue > 0 ? (data.netProfit / data.revenue) * 100 : 0;

  const chartData = useMemo(
    () =>
      (data?.daily ?? []).map((d) => ({
        date: d.date,
        revenue: d.revenue,
        expenses: d.expenses,
        profit: d.profit,
      })),
    [data],
  );

  const chartSeries: SeriesDef[] = useMemo(
    () => [
      { key: 'revenue', name: t('series.revenue'), money: true, color: CHART_COLORS.brand },
      { key: 'expenses', name: t('series.expenses'), money: true, color: CHART_COLORS.danger },
      { key: 'profit', name: t('series.profit'), money: true, color: CHART_COLORS.violet },
    ],
    [t],
  );

  const sparks = useMemo(
    () => ({
      revenue: (data?.daily ?? []).map((d) => d.revenue),
      profit: (data?.daily ?? []).map((d) => d.profit),
    }),
    [data],
  );

  /** Xarajat moddalari — nolga teng bo'lmaganlari, kamayish tartibida */
  const expenseRows = useMemo(() => {
    if (!data) return [];
    const total = data.expensesTotal;
    return data.expenses
      .filter((e) => e.amount > 0)
      .map((e) => {
        const meta = EXPENSE_CATEGORIES.find((c) => c.id === e.category);
        return {
          category: e.category,
          label: meta ? pickLocalized(meta.label, lang) : e.category,
          color: categoryColor(e.category),
          amount: e.amount,
          share: e.share > 0 ? e.share : total > 0 ? (e.amount / total) * 100 : 0,
        };
      })
      .sort((a, b) => b.amount - a.amount);
  }, [data, lang]);

  const donutData: DonutDatum[] = expenseRows.map((r) => ({
    name: r.label,
    value: r.amount,
    color: r.color,
  }));

  const onExport = async () => {
    setExporting(true);
    try {
      const blob = await api.blob('/export/expenses', q);
      downloadBlob(blob, `finance-${q.from}_${q.to}.xlsx`);
      toast.success(t('export.done'));
    } catch (err) {
      toast.error(t('export.error'), err instanceof Error ? err.message : undefined);
    } finally {
      setExporting(false);
    }
  };

  const isLoading = finance.isLoading;
  const isEmpty = data !== undefined && data.revenue === 0 && data.expensesTotal === 0;

  const header = (
    <PageHeader
      icon={<Wallet className="h-5 w-5" />}
      title={t('title')}
      description={data ? `${f.date(data.period.from)} — ${f.date(data.period.to)}` : t('subtitle')}
      badge={<PreviewBadge feature="unit_economics" />}
      actions={
        <>
          <IconButton
            label={t('refresh')}
            onClick={() => {
              void finance.refetch();
              void pnl.refetch();
            }}
            disabled={finance.isFetching}
          >
            <RefreshCw className={finance.isFetching ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />
          </IconButton>
          <Button
            variant="outline"
            icon={<Download className="h-4 w-4" />}
            loading={exporting}
            onClick={onExport}
          >
            {tc('btn.export')}
          </Button>
        </>
      }
    />
  );

  return (
    <>
      {header}
      <FilterBar />

      <PlanGate feature="unit_economics">
        {finance.isError ? (
          <Card>
            <ErrorState
              message={finance.error instanceof Error ? finance.error.message : tc('common.error')}
              onRetry={() => void finance.refetch()}
              retryLabel={tc('btn.retry')}
            />
          </Card>
        ) : isEmpty ? (
          <Card>
            <EmptyState
              icon={<Wallet2 className="h-6 w-6" />}
              title={t('empty.title')}
              hint={t('empty.hint')}
            />
          </Card>
        ) : (
          <div className="space-y-5">
            {/* ── 1. KPI ── */}
            <StatGrid>
              <StatCard
                label={t('kpi.revenue')}
                value={f.money(data?.revenue ?? 0)}
                delta={revenueDelta}
                hint={t('kpi.revenueHint')}
                icon={<Coins className="h-5 w-5" />}
                spark={sparks.revenue}
                tone="brand"
                loading={isLoading}
              />
              <StatCard
                label={t('kpi.gross')}
                value={f.money(data?.grossProfit ?? 0)}
                delta={grossDelta}
                hint={t('kpi.grossHint')}
                icon={<TrendingUp className="h-5 w-5" />}
                tone={(data?.grossProfit ?? 0) < 0 ? 'danger' : 'info'}
                loading={isLoading}
              />
              <StatCard
                label={t('kpi.net')}
                value={f.money(data?.netProfit ?? 0)}
                delta={netDelta}
                hint={t('kpi.netHint', { v: f.pct(margin) })}
                icon={<PiggyBank className="h-5 w-5" />}
                spark={sparks.profit}
                tone={(data?.netProfit ?? 0) < 0 ? 'danger' : 'brand'}
                loading={isLoading}
              />
              <StatCard
                label={t('kpi.oper')}
                value={f.money(data?.operatingProfit ?? 0)}
                delta={operDelta}
                hint={t('kpi.operHint', { v: f.money(data?.periodExpenses ?? 0) })}
                icon={<Scale className="h-5 w-5" />}
                tone={(data?.operatingProfit ?? 0) < 0 ? 'danger' : 'violet'}
                loading={isLoading}
              />
            </StatGrid>

            {/* ── 2. Kunlik grafik ── */}
            <ChartCard title={t('chart.title')} subtitle={t('chart.subtitle')}>
              {isLoading ? (
                <Skeleton className="h-[300px] w-full" />
              ) : chartData.length > 1 ? (
                <TrendChart data={chartData} series={chartSeries} height={310} />
              ) : (
                <EmptyState
                  className="py-14"
                  icon={<TrendingUp className="h-6 w-6" />}
                  title={t('chart.empty')}
                  hint={t('chart.emptyHint')}
                />
              )}
            </ChartCard>

            {/* ── 3. Xarajatlar tuzilmasi + balans ── */}
            <div className="grid gap-4 xl:grid-cols-3">
              <Card className="flex flex-col xl:col-span-2">
                <CardHeader
                  icon={<Receipt className="h-4 w-4" />}
                  title={t('exp.title')}
                  subtitle={t('exp.subtitle')}
                  actions={
                    <div className="text-right">
                      <p className="eyebrow">{t('exp.total')}</p>
                      <p className="tnum font-display text-base font-extrabold text-ink">
                        {f.money(data?.expensesTotal ?? 0)}
                      </p>
                    </div>
                  }
                />
                <CardBody className="flex-1">
                  {isLoading ? (
                    <Skeleton className="h-[220px] w-full" />
                  ) : expenseRows.length === 0 ? (
                    <EmptyState
                      className="py-10"
                      icon={<Receipt className="h-6 w-6" />}
                      title={t('exp.empty')}
                      hint={t('exp.emptyHint')}
                    />
                  ) : (
                    <div className="grid items-center gap-5 lg:grid-cols-[minmax(0,240px)_minmax(0,1fr)]">
                      <DonutChart
                        data={donutData}
                        height={230}
                        innerRadius={62}
                        outerRadius={94}
                        center={
                          <div>
                            <p className="eyebrow">{t('exp.total')}</p>
                            <p className="tnum font-display text-base font-extrabold text-ink">
                              {f.compact(data?.expensesTotal ?? 0)}
                            </p>
                          </div>
                        }
                      />
                      <ul className="space-y-3">
                        {expenseRows.map((r) => (
                          <li key={r.category}>
                            <div className="flex items-center gap-2.5">
                              <span
                                className="h-2.5 w-2.5 shrink-0 rounded-full"
                                style={{ background: r.color }}
                              />
                              <span className="min-w-0 flex-1 truncate text-sm text-ink-soft">{r.label}</span>
                              <span className="tnum shrink-0 text-sm font-semibold text-ink">
                                {f.money(r.amount)}
                              </span>
                              <span className="tnum w-14 shrink-0 text-right text-xs text-muted">
                                {f.pct(r.share)}
                              </span>
                            </div>
                            <ProgressBar
                              value={r.share}
                              tone={CATEGORY_TONE[r.category]}
                              className="mt-1.5"
                            />
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </CardBody>
              </Card>

              {/* Balans */}
              <Card className="flex flex-col">
                <CardHeader
                  icon={<Wallet2 className="h-4 w-4" />}
                  title={t('bal.title')}
                  subtitle={t('bal.subtitle')}
                />
                <CardBody className="flex-1 space-y-3">
                  {isLoading ? (
                    <Skeleton className="h-[220px] w-full" />
                  ) : (
                    <>
                      <BalanceRow
                        icon={<Wallet2 className="h-4 w-4" />}
                        tone="brand"
                        label={t('bal.total')}
                        hint={t('bal.totalHint')}
                        value={f.money(data?.balance.total ?? 0)}
                      />
                      <BalanceRow
                        icon={<PiggyBank className="h-4 w-4" />}
                        tone="info"
                        label={t('bal.paid')}
                        hint={t('bal.paidHint')}
                        value={f.money(data?.balance.paidOut ?? 0)}
                      />
                      <BalanceRow
                        icon={<Hourglass className="h-4 w-4" />}
                        tone="warn"
                        label={t('bal.pending')}
                        hint={t('bal.pendingHint')}
                        value={f.money(data?.balance.pending ?? 0)}
                      />
                      <BalanceRow
                        icon={<CalendarClock className="h-4 w-4" />}
                        tone="info"
                        label={t('bal.next')}
                        hint={t('bal.nextHint')}
                        value={
                          data?.balance.nextPayoutAt ? f.date(data.balance.nextPayoutAt) : t('bal.none')
                        }
                      />
                    </>
                  )}
                </CardBody>
              </Card>
            </div>

            {/* ── 4. P&L ── */}
            <PnlTable
              lines={pnlLines}
              loading={pnl.isLoading}
              periodLabel={t('pnl.col.current')}
              previousLabel={t('pnl.col.previous')}
            />
          </div>
        )}
      </PlanGate>
    </>
  );
}

/** Balans kartasidagi bitta qator */
function BalanceRow({
  icon,
  tone,
  label,
  hint,
  value,
}: {
  icon: ReactNode;
  tone: 'brand' | 'warn' | 'info';
  label: string;
  hint: string;
  value: string;
}) {
  const box =
    tone === 'brand'
      ? 'bg-brand/10 text-brand-ink'
      : tone === 'warn'
        ? 'bg-warn/10 text-warn-ink'
        : 'bg-info/10 text-info-ink';

  return (
    <div className="flex items-start gap-3 rounded-xl border border-line bg-surface-2/60 p-3.5">
      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${box}`}>{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="eyebrow-lg">{label}</p>
        <p className="tnum mt-0.5 font-display text-lg font-extrabold text-ink">{value}</p>
        <p className="mt-0.5 text-xs text-muted">{hint}</p>
      </div>
    </div>
  );
}
