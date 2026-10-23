import { useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowRight,
  BarChart3,
  CalendarClock,
  Coins,
  Download,
  Hourglass,
  Landmark,
  PiggyBank,
  RefreshCw,
  TrendingUp,
  Wallet,
  Wallet2,
} from '@/components/icons';
import { deltaPct, type FinanceResponse } from '@savdoiq/shared';
import {
  Amount,
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
  Skeleton,
  StatCard,
  toast,
  type Tone,
} from '@/components/ui';
import { ChartCard, TrendChart, type SeriesDef } from '@/components/charts';
import { FilterBar } from '@/components/filters';
import { NetProfitHero } from '@/components/finance/NetProfitHero';
import { PeriodChip } from '@/components/finance/PeriodChip';
import { PnlTable } from '@/components/finance/PnlTable';
import { RevenueSplitCard } from '@/components/finance/RevenueSplitCard';
import { normalizePnl } from '@/components/finance/financeData';
import { CostCoverage } from '@/components/trust/CostCoverage';
import { DataFreshness } from '@/components/trust/DataFreshness';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { api } from '@/lib/api';
import { CHART_COLORS, COST_COLORS } from '@/lib/theme';
import { usePeriodQuery } from '@/store/ui';
import { cn, downloadBlob } from '@/lib/utils';
import { registerNamespace, useFormat, useT } from '@/i18n';

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
    'kpi.grossHint': 'Tushum minus tannarx, marja {v}',
    'kpi.net': 'Tovarlar bo‘yicha foyda',
    'kpi.netHint': 'Davr xarajatlarigacha, marja {v}',
    'kpi.oper': 'Sof foyda',
    'kpi.operHint': 'Davr xarajatlari ({v}) ayirilgan, marja {m}',
    'kpi.uzum': 'Komissiya va yetkazish',
    'kpi.uzumHint': 'Uzum har sotuvdan ushlaydi — tushumning {v}',
    'kpi.uzumHintNone': 'Uzum har sotuvdan ushlaydigan qism',

    'hero.sub': 'Barcha xarajatlar ayirilgandan keyin',
    'hero.daily': 'Kunlik sof foyda',
    'hero.loss': 'Zarar',
    'hero.margin': 'Marja',
    'hero.periodCosts': 'Davr xarajatlari',
    'hero.periodHint': 'Omborga logistika, reklama, saqlash va boshqa',

    'chart.title': 'Kunlik dinamika',
    'chart.subtitle': 'Tushum, xarajat va sof foyda',
    'chart.empty': 'Grafik uchun ma’lumot yetarli emas',
    'chart.emptyHint': 'Yuqoridagi davr tanlagichidan kengroq oraliqni belgilang',
    'series.revenue': 'Tushum',
    'series.expenses': 'Xarajatlar',
    'series.profit': 'Sof foyda',

    'exp.title': 'Tushum qayerga ketdi',
    'exp.subtitle': 'Har bir modda tushumga nisbatan',
    'exp.total': 'Jami xarajat',
    'exp.cogs': 'Tannarx',
    'exp.profit': 'Sizga qoldi',
    'exp.loss': 'Zarar',
    'exp.ofRevenue': 'tushumdan',
    'exp.prev': 'Oldingi davr: {v}',
    'exp.totalLine': 'Jami xarajat {v} — tushumning {p}',
    'exp.empty': 'Xarajat qayd etilmagan',
    'exp.emptyHint': 'Tanlangan davrda hech qanday xarajat topilmadi',

    'pnl.title': 'Foyda va zarar (P&L)',
    'pnl.subtitle': 'Tushumdan sof foydagacha — oldingi davr bilan taqqoslab',
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
    'pnl.netProfit': 'Tovarlar bo‘yicha foyda',
    'pnl.operatingProfit': 'Sof foyda',
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
    'bal.nextUnset': 'Jadval hali belgilanmagan — Pul kalendarida Uzum kabinetingizdagi sanalarni tanlang',
    'bal.none': 'Sana ma’lum emas',
    'bal.more': 'Pul kalendari',

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
    'kpi.grossHint': 'Выручка минус себестоимость, маржа {v}',
    'kpi.net': 'Прибыль по товарам',
    'kpi.netHint': 'До расходов периода, маржа {v}',
    'kpi.oper': 'Чистая прибыль',
    'kpi.operHint': 'За вычетом расходов периода ({v}), маржа {m}',
    'kpi.uzum': 'Комиссия и доставка',
    'kpi.uzumHint': 'Uzum удерживает с каждой продажи — {v} выручки',
    'kpi.uzumHintNone': 'Что Uzum удерживает с каждой продажи',

    'hero.sub': 'После вычета всех расходов',
    'hero.daily': 'Чистая прибыль по дням',
    'hero.loss': 'Убыток',
    'hero.margin': 'Маржа',
    'hero.periodCosts': 'Расходы периода',
    'hero.periodHint': 'Логистика на склад, реклама, хранение и прочее',

    'chart.title': 'Динамика по дням',
    'chart.subtitle': 'Выручка, расходы и чистая прибыль',
    'chart.empty': 'Недостаточно данных для графика',
    'chart.emptyHint': 'Выберите более широкий диапазон в переключателе периода',
    'series.revenue': 'Выручка',
    'series.expenses': 'Расходы',
    'series.profit': 'Чистая прибыль',

    'exp.title': 'Куда ушла выручка',
    'exp.subtitle': 'Каждая статья — в доле от выручки',
    'exp.total': 'Всего расходов',
    'exp.cogs': 'Себестоимость',
    'exp.profit': 'Осталось вам',
    'exp.loss': 'Убыток',
    'exp.ofRevenue': 'от выручки',
    'exp.prev': 'Прошлый период: {v}',
    'exp.totalLine': 'Всего расходов {v} — {p} выручки',
    'exp.empty': 'Расходы не зафиксированы',
    'exp.emptyHint': 'За выбранный период расходов не найдено',

    'pnl.title': 'Прибыль и убытки (P&L)',
    'pnl.subtitle': 'От выручки до чистой прибыли — в сравнении с прошлым периодом',
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
    'pnl.netProfit': 'Прибыль по товарам',
    'pnl.operatingProfit': 'Чистая прибыль',
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
    'bal.nextUnset': 'График ещё не указан — выберите в Календаре выплат те же даты, что в кабинете Uzum',
    'bal.none': 'Дата неизвестна',
    'bal.more': 'Календарь выплат',

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
    'kpi.grossHint': 'Revenue minus cost of goods, margin {v}',
    'kpi.net': 'Profit on goods',
    'kpi.netHint': 'Before period expenses, margin {v}',
    'kpi.oper': 'Net profit',
    'kpi.operHint': 'After period expenses ({v}), margin {m}',
    'kpi.uzum': 'Commission and delivery',
    'kpi.uzumHint': 'Uzum keeps it from every sale — {v} of revenue',
    'kpi.uzumHintNone': 'What Uzum keeps from every sale',

    'hero.sub': 'After every cost is deducted',
    'hero.daily': 'Daily net profit',
    'hero.loss': 'Loss',
    'hero.margin': 'Margin',
    'hero.periodCosts': 'Period expenses',
    'hero.periodHint': 'Inbound logistics, ads, storage and other',

    'chart.title': 'Daily trend',
    'chart.subtitle': 'Revenue, expenses and net profit',
    'chart.empty': 'Not enough data to draw a chart',
    'chart.emptyHint': 'Pick a wider range in the period switcher above',
    'series.revenue': 'Revenue',
    'series.expenses': 'Expenses',
    'series.profit': 'Net profit',

    'exp.title': 'Where revenue went',
    'exp.subtitle': 'Every line as a share of revenue',
    'exp.total': 'Total expenses',
    'exp.cogs': 'Cost of goods',
    'exp.profit': 'You kept',
    'exp.loss': 'Loss',
    'exp.ofRevenue': 'of revenue',
    'exp.prev': 'Previous period: {v}',
    'exp.totalLine': 'Total costs {v} — {p} of revenue',
    'exp.empty': 'No expenses recorded',
    'exp.emptyHint': 'Nothing was spent in the selected period',

    'pnl.title': 'Profit & loss (P&L)',
    'pnl.subtitle': 'From revenue to net profit — compared with the previous period',
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
    'pnl.netProfit': 'Profit on goods',
    'pnl.operatingProfit': 'Net profit',
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
    'bal.nextUnset': 'Schedule not set yet — pick the same dates as your Uzum cabinet in the payout calendar',
    'bal.none': 'Date unknown',
    'bal.more': 'Payout calendar',

    'empty.title': 'No financial data for this period',
    'empty.hint':
      'There were no sales and no expenses in the selected period. Pick another period or wait for the sync to finish.',
  },
});

export default function Finance() {
  const t = useT('finance');
  const tc = useT('common');
  const f = useFormat();
  const q = usePeriodQuery();
  const wide = useMediaQuery('(min-width: 1280px)');
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
  // Barqaror massiv — P&L kelmaguncha har chizishda yangi [] hosil bo'lib, undan keyingi hisoblar qayta ishlamasin
  const pnlLines = useMemo(() => pnl.data?.lines ?? [], [pnl.data]);

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
  const grossMargin = data && data.revenue > 0 ? (data.grossProfit / data.revenue) * 100 : 0;
  // Sof foyda marjasi — Boshqaruv paneli va Oylik hisobotdagi "Marja" bilan bir xil son
  const netMargin = data && data.revenue > 0 ? (data.operatingProfit / data.revenue) * 100 : 0;

  /*
   * Oldingi davr qiymatlari — P&L javobidan (u alohida so'rov, kechroq
   * kelishi mumkin). Kelmaguncha null: "oldin: 0 so'm" deb yozish yolg'on bo'lardi.
   */
  const pnlReady = pnlLines.length > 0;
  const prevOf = (id: string) => lineMap.get(id)?.previous ?? 0;
  const operPrevious = pnlReady ? prevOf('operatingProfit') : null;
  const revenuePrevious = pnlReady ? prevOf('revenue') : null;
  const marginPrevious =
    revenuePrevious !== null && revenuePrevious > 0 && operPrevious !== null
      ? (operPrevious / revenuePrevious) * 100
      : null;

  /*
   * "Komissiya va yetkazish" — Uzum har bir sotuvdan ushlaydigan qism
   * (binafsha: Uzum ulushi). P&L'dagi ikki qatorning yig'indisi, oldingi
   * davr ham o'sha qatorlardan — yangi hisob yo'q.
   */
  const uzumNow = pnlReady
    ? (lineMap.get('commission')?.current ?? 0) + (lineMap.get('delivery')?.current ?? 0)
    : null;
  const uzumPrev = pnlReady ? prevOf('commission') + prevOf('delivery') : null;
  const uzumDelta = uzumNow !== null && uzumPrev !== null ? deltaPct(uzumNow, uzumPrev) : null;

  /*
   * "Tushum qayerga ketdi" qatorlarining oldingi davri. Server kategoriyasi
   * P&L'da ikki qatorga bo'lingan (sotuvdagi + qo'lda kiritilgan) — ular
   * qo'shib olinadi (routes/finance.ts collectFinance bilan aynan bir xil).
   */
  const splitPrevious = useMemo<Partial<Record<string, number>>>(() => {
    if (!pnlLines.length) return {};
    const p = (id: string) => lineMap.get(id)?.previous ?? 0;
    return {
      cogs: p('cogs'),
      commission: p('commission') + p('manualCommission'),
      logistics: p('delivery') + p('logistics'),
      storage: p('storage'),
      marketing: p('marketing'),
      tax: p('tax') + p('manualTax'),
      salary: p('salary'),
      other: p('itemOther') + p('other'),
    };
  }, [pnlLines, lineMap]);

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

  /*
   * Xarajatlar ustuni kulrang (tannarx rangi), qizil EMAS: xarajat zarar
   * emas. Qizil faqat sof foyda manfiy bo'lgan kunda chiqadi (negColor).
   */
  const chartSeries: SeriesDef[] = useMemo(
    () => [
      { key: 'revenue', name: t('series.revenue'), money: true, color: CHART_COLORS.info },
      { key: 'expenses', name: t('series.expenses'), money: true, color: COST_COLORS.cogs },
      {
        key: 'profit',
        name: t('series.profit'),
        money: true,
        color: COST_COLORS.profit,
        negColor: CHART_COLORS.danger,
      },
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
  /*
   * Keng ekranda grafik yonida balans ustuni turadi va u to'rtta plitka bilan
   * balandroq — grafik shu balandlikka cho'ziladi, aks holda kartochka ostida
   * 100 px bo'sh joy qolardi. Tor ekranda ikkalasi ustma-ust, grafik pastroq.
   */
  const chartHeight = wide ? 410 : 300;

  const header = (
    <PageHeader
      icon={<Wallet className="h-5 w-5" />}
      title={t('title')}
      description={t('subtitle')}
      // Davr sanalari, ma'lumot yangiligi va tannarx qamrovi — raqamlar qanchalik ishonchli ekani darhol ko'rinsin
      meta={
        <>
          <PeriodChip />
          <DataFreshness />
          <CostCoverage />
        </>
      }
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
            {/*
              ── 1. Sof foyda (bosh kartochka) + to'rt KPI ──
              Javob chapda, u qanday hosil bo'lgani o'ngda: tushum → yalpi
              foyda → Uzum ushlagani → tovarlar bo'yicha foyda.
            */}
            <div className="grid gap-4 xl:grid-cols-12">
              <NetProfitHero
                className="xl:col-span-5"
                value={data?.operatingProfit ?? 0}
                previous={operPrevious}
                delta={operDelta}
                margin={netMargin}
                marginPrevious={marginPrevious}
                periodExpenses={data?.periodExpenses ?? 0}
                spark={sparks.profit}
                loading={isLoading}
              />
              <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:col-span-7">
                <StatCard
                  label={t('kpi.revenue')}
                  value={f.money(data?.revenue ?? 0)}
                  delta={revenueDelta}
                  previous={revenuePrevious !== null ? f.compact(revenuePrevious) : undefined}
                  hint={t('kpi.revenueHint')}
                  icon={<Coins className="h-5 w-5" />}
                  spark={sparks.revenue}
                  // Grafikdagi "Tushum" seriyasi bilan bir rang
                  tone="info"
                  loading={isLoading}
                />
                <StatCard
                  label={t('kpi.gross')}
                  value={f.money(data?.grossProfit ?? 0)}
                  delta={grossDelta}
                  previous={pnlReady ? f.compact(prevOf('grossProfit')) : undefined}
                  hint={t('kpi.grossHint', { v: f.pct(grossMargin) })}
                  icon={<TrendingUp className="h-5 w-5" />}
                  tone={(data?.grossProfit ?? 0) < 0 ? 'danger' : 'brand'}
                  loading={isLoading}
                />
                <StatCard
                  label={t('kpi.uzum')}
                  value={uzumNow === null ? '—' : f.money(uzumNow)}
                  delta={uzumDelta}
                  invertDelta
                  previous={uzumPrev !== null ? f.compact(uzumPrev) : undefined}
                  hint={
                    uzumNow !== null && data && data.revenue > 0
                      ? t('kpi.uzumHint', { v: f.pct((uzumNow / data.revenue) * 100) })
                      : t('kpi.uzumHintNone')
                  }
                  icon={<Landmark className="h-5 w-5" />}
                  // Binafsha — Uzum ulushi (boshqaruv panelidagi "Uzum oldi" bilan bir xil)
                  tone="violet"
                  loading={isLoading || pnl.isLoading}
                />
                <StatCard
                  label={t('kpi.net')}
                  value={f.money(data?.netProfit ?? 0)}
                  delta={netDelta}
                  previous={pnlReady ? f.compact(prevOf('netProfit')) : undefined}
                  hint={t('kpi.netHint', { v: f.pct(margin) })}
                  icon={<PiggyBank className="h-5 w-5" />}
                  tone={(data?.netProfit ?? 0) < 0 ? 'danger' : 'brand'}
                  loading={isLoading}
                />
              </div>
            </div>

            {/*
              ── 2. Kunlik grafik + balans ──
              Balans grafik yonida (SellerMan'dagi to'lovlar ustuni kabi):
              "qancha ishladim" va "puli qayerda turibdi" bir qarashda.
            */}
            <div className="grid gap-4 xl:grid-cols-3">
              <ChartCard
                className="xl:col-span-2"
                icon={<BarChart3 className="h-4 w-4" />}
                title={t('chart.title')}
                subtitle={t('chart.subtitle')}
              >
                {isLoading ? (
                  <Skeleton className={cn('w-full', wide ? 'h-[410px]' : 'h-[300px]')} />
                ) : chartData.length > 1 ? (
                  <TrendChart data={chartData} series={chartSeries} height={chartHeight} variant="bars" />
                ) : (
                  <EmptyState
                    className="py-14"
                    icon={<TrendingUp className="h-6 w-6" />}
                    title={t('chart.empty')}
                    hint={t('chart.emptyHint')}
                  />
                )}
              </ChartCard>

              <Card className="flex flex-col">
                <CardHeader icon={<Wallet2 className="h-4 w-4" />} title={t('bal.title')} subtitle={t('bal.subtitle')} />
                <CardBody className="grid flex-1 content-start gap-2.5 pb-3 sm:grid-cols-2 xl:grid-cols-1">
                  {isLoading ? (
                    <Skeleton className="h-[320px] w-full sm:col-span-2 xl:col-span-1" />
                  ) : (
                    <>
                      <BalanceTile
                        icon={<Wallet2 />}
                        tone="brand"
                        label={t('bal.total')}
                        hint={t('bal.totalHint')}
                        value={f.money(data?.balance.total ?? 0)}
                        strong
                      />
                      <BalanceTile
                        icon={<PiggyBank />}
                        tone="muted"
                        label={t('bal.paid')}
                        hint={t('bal.paidHint')}
                        value={f.money(data?.balance.paidOut ?? 0)}
                      />
                      <BalanceTile
                        icon={<Hourglass />}
                        // Za'faron — hali kelmagan pul
                        tone="warn"
                        label={t('bal.pending')}
                        hint={t('bal.pendingHint')}
                        value={f.money(data?.balance.pending ?? 0)}
                      />
                      <BalanceTile
                        icon={<CalendarClock />}
                        /*
                         * Jadval tasdiqlanmagan bo'lsa sana TAXMIN — buni
                         * aytmasdan aniq sanadek ko'rsatish sotuvchini
                         * chalg‘itadi. Tanlash Pul kalendarida, shuning uchun
                         * plitka ham ogohlantiruvchi rangda.
                         */
                        tone={data?.balance.payoutConfirmed === false ? 'warn' : 'info'}
                        label={t('bal.next')}
                        hint={data?.balance.payoutConfirmed === false ? t('bal.nextUnset') : t('bal.nextHint')}
                        value={data?.balance.nextPayoutAt ? f.date(data.balance.nextPayoutAt) : t('bal.none')}
                      />
                    </>
                  )}
                </CardBody>
                {/* Ikkinchi daraja: har to'lov sanasi va buyurtmasi bilan — Pul kalendarida */}
                <Link
                  to="/payout"
                  className="focusable mx-5 mb-4 mt-auto inline-flex items-center justify-end gap-1 self-end rounded-md text-xs font-semibold text-brand-ink hover:underline"
                >
                  {t('bal.more')}
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </Card>
            </div>

            {/*
              ── 3. Tushumdan sof foydagacha ──
              P&L sharshara chizig'i bilan va yonida "Tushum qayerga ketdi"
              donuti — ikkalasi bir xil ranglarda, balandligi teng.
            */}
            <div className="grid gap-4 xl:grid-cols-3">
              <PnlTable
                className="xl:col-span-2"
                lines={pnlLines}
                loading={pnl.isLoading}
                periodLabel={t('pnl.col.current')}
                previousLabel={t('pnl.col.previous')}
              />
              <RevenueSplitCard
                revenue={data?.revenue ?? 0}
                cogs={data?.cogs ?? 0}
                expenses={data?.expenses ?? []}
                profit={data?.operatingProfit ?? 0}
                previous={splitPrevious}
                loading={isLoading}
              />
            </div>
          </div>
        )}
      </PlanGate>
    </>
  );
}

/**
 * Balans kartasidagi bitta plitka (`.well`). Ikonka plitkasi ma'no rangida:
 * balans — sotuvchining puli (brend), kutilayotgan — za'faron, to'langani —
 * tinch kulrang. Ilgari to'rttala qutining foni bir xil edi va rang faqat
 * kichik belgida qolardi.
 */
function BalanceTile({
  icon,
  tone,
  label,
  hint,
  value,
  strong,
}: {
  icon: ReactNode;
  tone: Tone;
  label: string;
  hint: string;
  value: string;
  /** Asosiy qiymat (umumiy balans) — kattaroq raqam */
  strong?: boolean;
}) {
  return (
    <div className="well flex min-w-0 items-start gap-3 p-3.5">
      <span
        className={cn('icon-tile h-9 w-9 rounded-[10px] [&_svg]:h-[18px] [&_svg]:w-[18px]', `tone-${tone}`)}
        aria-hidden
      >
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="eyebrow-lg">{label}</p>
        <p
          className={cn(
            'tnum mt-0.5 font-display font-bold leading-snug tracking-[-0.01em] text-ink',
            strong ? 'text-xl' : 'text-[17px]',
          )}
        >
          <Amount value={value} />
        </p>
        <p className="mt-0.5 text-xs leading-snug text-muted">{hint}</p>
      </div>
    </div>
  );
}
