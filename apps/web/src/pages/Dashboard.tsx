import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Coins,
  LayoutDashboard,
  PiggyBank,
  RefreshCw,
  Rocket,
  ShoppingCart,
  TrendingUp,
} from 'lucide-react';
import type { DashboardResponse } from '@savdoiq/shared';
import { registerNamespace, useFormat, useT } from '@/i18n';
import { api, ApiError } from '@/lib/api';
import { usePeriodQuery } from '@/store/ui';
import { CHART_COLORS } from '@/lib/theme';
import { ChartCard, TrendChart, type SeriesDef } from '@/components/charts';
import { FilterBar } from '@/components/filters';
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  IconButton,
  PageHeader,
  PlanGate,
  Segmented,
  Skeleton,
  StatCard,
  StatGrid,
} from '@/components/ui';
import { InsightsBlock } from '@/components/dashboard/InsightsBlock';
import { MarginRoiCard, PayoutsCard, StockValueCard } from '@/components/dashboard/SummaryRow';
import { ExpensesCard } from '@/components/dashboard/ExpensesCard';
import { StoresCard } from '@/components/dashboard/StoresCard';
import { TopProductsCard } from '@/components/dashboard/TopProductsCard';
import { cn } from '@/lib/utils';

registerNamespace('dashboard', {
  uz: {
    title: 'Boshqaruv paneli',
    subtitle: 'Do‘koningizning bugungi holati — bir ekranda',
    refresh: 'Ma’lumotni yangilash',

    'kpi.revenue': 'Tushum',
    'kpi.revenueHint': 'To‘lovga: {v}',
    'kpi.profit': 'Sof foyda',
    'kpi.profitHint': 'Marja {v}',
    'kpi.orders': 'Buyurtmalar',
    'kpi.ordersHint': '{v} dona sotildi',
    'kpi.avgCheck': 'O‘rtacha chek',
    'kpi.avgCheckHint': 'Bitta buyurtmaga o‘rtacha summa',

    'payouts.title': 'To‘lovlar',
    'payouts.subtitle': 'Uzum tomonidan o‘tkazmalar',
    'payouts.yesterday': 'Kecha to‘landi',
    'payouts.today': 'Bugun kutilmoqda',
    'payouts.orders': '{n} ta buyurtma',
    'payouts.hint': 'Summalar yetkazib berilgan buyurtmalar bo‘yicha hisoblanadi.',

    'margin.title': 'Marja va ROI',
    'margin.subtitle': 'Davr bo‘yicha samaradorlik',
    'margin.margin': 'Marja',
    'margin.roi': 'ROI',
    'margin.buyout': 'Sotib olish darajasi',
    'margin.returns': 'Qaytarishlar',

    'stock.title': 'Qoldiq qiymati',
    'stock.subtitle': 'Omborlardagi tovar bahosi',
    'stock.units': '{n} dona zaxirada',
    'stock.fbo': 'FBO (Uzum ombori)',
    'stock.fbs': 'FBS (o‘z omboringiz)',
    'stock.hint': 'Qiymat tannarx bo‘yicha hisoblangan — bu muzlatilgan kapital.',

    'insights.title': 'Tavsiyalar',
    'insights.subtitle': 'Ma’lumotlaringiz asosida topilgan muhim nuqtalar',
    'insights.count': '{n} ta',
    'insights.view': 'Ko‘rish',
    'insights.empty': 'Hammasi joyida',
    'insights.emptyHint': 'Bu davrda e’tibor talab qiladigan holat topilmadi.',

    'chart.title': 'Dinamika',
    'chart.subtitle': 'Kunlik ko‘rsatkichlar',
    'chart.empty': 'Grafik uchun ma’lumot yetarli emas',
    'metric.revenue': 'Tushum',
    'metric.profit': 'Sof foyda',
    'metric.orders': 'Buyurtmalar',
    'metric.units': 'Dona',

    'expenses.title': 'Davr xarajatlari',
    'expenses.subtitle': 'Qayerga qancha ketdi',
    'expenses.total': 'Jami',
    'expenses.empty': 'Xarajat yozuvlari yo‘q',
    'expenses.emptyHint': 'Tanlangan davrda xarajat qayd etilmagan.',

    'stores.title': 'Do‘konlar',
    'stores.subtitle': '{n} ta do‘kon bo‘yicha taqsimot',
    'stores.empty': 'Do‘kon topilmadi',
    'stores.emptyHint': 'Uzum kabinetini ulang — do‘konlar avtomatik chiqadi.',
    'stores.col.store': 'Do‘kon',
    'stores.col.orders': 'Buyurtma',
    'stores.col.revenue': 'Tushum',
    'stores.col.share': 'Ulush',

    'top.title': 'Top mahsulotlar',
    'top.subtitle': 'Tushum bo‘yicha yetakchilar',
    'top.all': 'Barchasi',
    'top.empty': 'Mahsulot topilmadi',
    'top.emptyHint': 'Bu davrda sotuv qayd etilmagan.',
    'top.col.product': 'Mahsulot',
    'top.col.sold': 'Sotildi',
    'top.col.revenue': 'Tushum',
    'top.col.profit': 'Foyda',
    'top.col.margin': 'Marja',
    'top.col.share': 'Ulush',

    'empty.title': 'Hozircha ko‘rsatiladigan ma’lumot yo‘q',
    'empty.hint':
      'Ma’lumot hali yig‘ilmoqda yoki tanlangan davrda sotuv bo‘lmagan. Boshqa davrni tanlab ko‘ring yoki ulanishni tekshiring.',
    'empty.setup': 'Ulanishni tekshirish',
    'empty.periodHint': 'Yuqoridagi davr tanlagichidan kengroq oraliqni belgilang.',
  },
  ru: {
    title: 'Дашборд',
    subtitle: 'Состояние вашего магазина — на одном экране',
    refresh: 'Обновить данные',

    'kpi.revenue': 'Выручка',
    'kpi.revenueHint': 'К выплате: {v}',
    'kpi.profit': 'Чистая прибыль',
    'kpi.profitHint': 'Маржа {v}',
    'kpi.orders': 'Заказы',
    'kpi.ordersHint': 'Продано {v} шт.',
    'kpi.avgCheck': 'Средний чек',
    'kpi.avgCheckHint': 'Средняя сумма одного заказа',

    'payouts.title': 'Выплаты',
    'payouts.subtitle': 'Переводы от Uzum',
    'payouts.yesterday': 'Выплачено вчера',
    'payouts.today': 'Ожидается сегодня',
    'payouts.orders': '{n} заказов',
    'payouts.hint': 'Суммы считаются по доставленным заказам.',

    'margin.title': 'Маржа и ROI',
    'margin.subtitle': 'Эффективность за период',
    'margin.margin': 'Маржа',
    'margin.roi': 'ROI',
    'margin.buyout': 'Процент выкупа',
    'margin.returns': 'Возвраты',

    'stock.title': 'Стоимость остатков',
    'stock.subtitle': 'Товар на складах',
    'stock.units': '{n} шт. в наличии',
    'stock.fbo': 'FBO (склад Uzum)',
    'stock.fbs': 'FBS (ваш склад)',
    'stock.hint': 'Стоимость по себестоимости — это замороженный капитал.',

    'insights.title': 'Рекомендации',
    'insights.subtitle': 'Важное, найденное по вашим данным',
    'insights.count': '{n} шт.',
    'insights.view': 'Смотреть',
    'insights.empty': 'Всё в порядке',
    'insights.emptyHint': 'За этот период проблем не обнаружено.',

    'chart.title': 'Динамика',
    'chart.subtitle': 'Показатели по дням',
    'chart.empty': 'Недостаточно данных для графика',
    'metric.revenue': 'Выручка',
    'metric.profit': 'Чистая прибыль',
    'metric.orders': 'Заказы',
    'metric.units': 'Штуки',

    'expenses.title': 'Расходы за период',
    'expenses.subtitle': 'Куда ушли деньги',
    'expenses.total': 'Итого',
    'expenses.empty': 'Расходов нет',
    'expenses.emptyHint': 'За выбранный период расходы не зафиксированы.',

    'stores.title': 'Магазины',
    'stores.subtitle': 'Распределение по {n} магазинам',
    'stores.empty': 'Магазины не найдены',
    'stores.emptyHint': 'Подключите кабинет Uzum — магазины появятся автоматически.',
    'stores.col.store': 'Магазин',
    'stores.col.orders': 'Заказы',
    'stores.col.revenue': 'Выручка',
    'stores.col.share': 'Доля',

    'top.title': 'Топ товаров',
    'top.subtitle': 'Лидеры по выручке',
    'top.all': 'Все',
    'top.empty': 'Товары не найдены',
    'top.emptyHint': 'За этот период продаж не было.',
    'top.col.product': 'Товар',
    'top.col.sold': 'Продано',
    'top.col.revenue': 'Выручка',
    'top.col.profit': 'Прибыль',
    'top.col.margin': 'Маржа',
    'top.col.share': 'Доля',

    'empty.title': 'Пока нечего показать',
    'empty.hint':
      'Данные ещё собираются или за выбранный период продаж не было. Попробуйте другой период или проверьте подключение.',
    'empty.setup': 'Проверить подключение',
    'empty.periodHint': 'Выберите более широкий диапазон в переключателе периода выше.',
  },
  en: {
    title: 'Dashboard',
    subtitle: 'Your store at a glance',
    refresh: 'Refresh data',

    'kpi.revenue': 'Revenue',
    'kpi.revenueHint': 'Payout: {v}',
    'kpi.profit': 'Net profit',
    'kpi.profitHint': 'Margin {v}',
    'kpi.orders': 'Orders',
    'kpi.ordersHint': '{v} units sold',
    'kpi.avgCheck': 'Average check',
    'kpi.avgCheckHint': 'Average amount per order',

    'payouts.title': 'Payouts',
    'payouts.subtitle': 'Transfers from Uzum',
    'payouts.yesterday': 'Paid yesterday',
    'payouts.today': 'Expected today',
    'payouts.orders': '{n} orders',
    'payouts.hint': 'Amounts are calculated from delivered orders.',

    'margin.title': 'Margin & ROI',
    'margin.subtitle': 'Efficiency for the period',
    'margin.margin': 'Margin',
    'margin.roi': 'ROI',
    'margin.buyout': 'Buyout rate',
    'margin.returns': 'Returns',

    'stock.title': 'Stock value',
    'stock.subtitle': 'Goods sitting in warehouses',
    'stock.units': '{n} units in stock',
    'stock.fbo': 'FBO (Uzum warehouse)',
    'stock.fbs': 'FBS (your warehouse)',
    'stock.hint': 'Valued at cost price — this is your frozen capital.',

    'insights.title': 'Insights',
    'insights.subtitle': 'What your data is telling you right now',
    'insights.count': '{n}',
    'insights.view': 'View',
    'insights.empty': 'All good',
    'insights.emptyHint': 'Nothing needs your attention in this period.',

    'chart.title': 'Trend',
    'chart.subtitle': 'Daily performance',
    'chart.empty': 'Not enough data to draw a chart',
    'metric.revenue': 'Revenue',
    'metric.profit': 'Net profit',
    'metric.orders': 'Orders',
    'metric.units': 'Units',

    'expenses.title': 'Period expenses',
    'expenses.subtitle': 'Where the money went',
    'expenses.total': 'Total',
    'expenses.empty': 'No expenses',
    'expenses.emptyHint': 'No expenses were recorded for the selected period.',

    'stores.title': 'Stores',
    'stores.subtitle': 'Split across {n} stores',
    'stores.empty': 'No stores found',
    'stores.emptyHint': 'Connect an Uzum cabinet — stores appear automatically.',
    'stores.col.store': 'Store',
    'stores.col.orders': 'Orders',
    'stores.col.revenue': 'Revenue',
    'stores.col.share': 'Share',

    'top.title': 'Top products',
    'top.subtitle': 'Revenue leaders',
    'top.all': 'View all',
    'top.empty': 'No products found',
    'top.emptyHint': 'No sales were recorded in this period.',
    'top.col.product': 'Product',
    'top.col.sold': 'Sold',
    'top.col.revenue': 'Revenue',
    'top.col.profit': 'Profit',
    'top.col.margin': 'Margin',
    'top.col.share': 'Share',

    'empty.title': 'Nothing to show yet',
    'empty.hint':
      'Data is still syncing, or there were no sales in the selected period. Try another period or check the connection.',
    'empty.setup': 'Check connection',
    'empty.periodHint': 'Pick a wider range in the period switcher above.',
  },
});

type MetricKey = 'revenue' | 'profit' | 'orders' | 'units';

export default function Dashboard() {
  const t = useT('dashboard');
  const f = useFormat();
  const q = usePeriodQuery();
  const [metric, setMetric] = useState<MetricKey>('revenue');

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ['dashboard', q],
    queryFn: () => api.get<DashboardResponse>('/analytics/dashboard', q),
  });

  const points = data?.series ?? [];

  const chartData = useMemo(
    () =>
      points.map((p) => ({
        date: p.date,
        revenue: p.revenue,
        profit: p.profit,
        orders: p.orders,
        units: p.units,
      })),
    [points],
  );

  const sparks = useMemo(
    () => ({
      revenue: points.map((p) => p.revenue),
      profit: points.map((p) => p.profit),
      orders: points.map((p) => p.orders),
      avgCheck: points.map((p) => (p.orders > 0 ? p.revenue / p.orders : 0)),
    }),
    [points],
  );

  const chartSeries: SeriesDef[] = useMemo(() => {
    const revenue: SeriesDef = { key: 'revenue', name: t('metric.revenue'), money: true, color: CHART_COLORS.brand };
    const profit: SeriesDef = { key: 'profit', name: t('metric.profit'), money: true, color: CHART_COLORS.violet };
    if (metric === 'revenue') return [revenue, profit];
    if (metric === 'profit') return [profit];
    if (metric === 'orders') return [{ key: 'orders', name: t('metric.orders'), color: CHART_COLORS.info }];
    return [{ key: 'units', name: t('metric.units'), color: CHART_COLORS.warn }];
  }, [metric, t]);

  const header = (
    <PageHeader
      icon={<LayoutDashboard className="h-5 w-5" />}
      title={t('title')}
      description={
        data ? `${f.date(data.period.from)} — ${f.date(data.period.to)}` : t('subtitle')
      }
      actions={
        <IconButton label={t('refresh')} onClick={() => void refetch()} disabled={isFetching}>
          <RefreshCw className={cn('h-4 w-4', isFetching && 'animate-spin')} />
        </IconButton>
      }
    />
  );

  if (isLoading) {
    return (
      <>
        {header}
        <FilterBar />
        <div className="space-y-5">
          <StatGrid>
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-[136px] w-full" />
            ))}
          </StatGrid>
          <div className="grid gap-4 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-[260px] w-full" />
            ))}
          </div>
          <InsightsBlock items={[]} loading />
          <Skeleton className="h-[340px] w-full" />
          <Skeleton className="h-[320px] w-full" />
        </div>
      </>
    );
  }

  if (isError || !data) {
    return (
      <>
        {header}
        <FilterBar />
        <Card>
          <ErrorState
            message={error instanceof ApiError ? error.message : (error as Error | null)?.message}
            onRetry={() => void refetch()}
          />
        </Card>
      </>
    );
  }

  const isEmpty = data.revenue.value === 0 && data.ordersCount.value === 0;

  if (isEmpty) {
    return (
      <>
        {header}
        <FilterBar />
        <Card>
          <EmptyState
            icon={<Rocket className="h-6 w-6" />}
            title={t('empty.title')}
            hint={t('empty.hint')}
            action={
              <div className="flex flex-col items-center gap-3">
                <Link to="/onboarding">
                  <Button icon={<Rocket className="h-4 w-4" />}>{t('empty.setup')}</Button>
                </Link>
                <p className="max-w-xs text-xs text-muted">{t('empty.periodHint')}</p>
              </div>
            }
          />
        </Card>
      </>
    );
  }

  return (
    <>
      {header}
      <FilterBar />

      <div className="space-y-5">
        {/* 1. KPI qatori */}
        <StatGrid>
          <StatCard
            label={t('kpi.revenue')}
            value={f.money(data.revenue.value, data.currency)}
            delta={data.revenue.deltaPct}
            hint={t('kpi.revenueHint', { v: f.compact(data.payout.value) })}
            icon={<Coins className="h-5 w-5" />}
            spark={sparks.revenue}
            tone="brand"
          />
          <StatCard
            label={t('kpi.profit')}
            value={f.money(data.netProfit.value, data.currency)}
            delta={data.netProfit.deltaPct}
            hint={t('kpi.profitHint', { v: f.pct(data.margin.value) })}
            icon={<PiggyBank className="h-5 w-5" />}
            spark={sparks.profit}
            tone="violet"
          />
          <StatCard
            label={t('kpi.orders')}
            value={f.num(data.ordersCount.value)}
            delta={data.ordersCount.deltaPct}
            hint={t('kpi.ordersHint', { v: f.num(data.unitsSold.value) })}
            icon={<ShoppingCart className="h-5 w-5" />}
            spark={sparks.orders}
            tone="info"
          />
          <StatCard
            label={t('kpi.avgCheck')}
            value={f.money(data.avgCheck.value, data.currency)}
            delta={data.avgCheck.deltaPct}
            hint={t('kpi.avgCheckHint')}
            icon={<TrendingUp className="h-5 w-5" />}
            spark={sparks.avgCheck}
            tone="warn"
          />
        </StatGrid>

        {/* 2. To'lovlar / marja va ROI / qoldiq qiymati */}
        <div className="grid gap-4 lg:grid-cols-3">
          <PayoutsCard data={data} />
          <MarginRoiCard data={data} />
          <StockValueCard data={data} />
        </div>

        {/* 3. Tavsiyalar */}
        <PlanGate feature="dashboard_realtime">
          <InsightsBlock items={data.insights} />
        </PlanGate>

        {/* 4. Asosiy grafik */}
        <ChartCard
          title={t('chart.title')}
          subtitle={t('chart.subtitle')}
          actions={
            <Segmented<MetricKey>
              size="sm"
              value={metric}
              onChange={setMetric}
              options={[
                { value: 'revenue', label: t('metric.revenue') },
                { value: 'profit', label: t('metric.profit') },
                { value: 'orders', label: t('metric.orders') },
                { value: 'units', label: t('metric.units') },
              ]}
            />
          }
        >
          {chartData.length > 1 ? (
            <TrendChart data={chartData} series={chartSeries} height={320} />
          ) : (
            <EmptyState
              className="py-16"
              icon={<TrendingUp className="h-6 w-6" />}
              title={t('chart.empty')}
              hint={t('empty.periodHint')}
            />
          )}
        </ChartCard>

        {/* 5. Xarajatlar va do'konlar */}
        <div className="grid gap-4 xl:grid-cols-2">
          <ExpensesCard data={data} />
          <StoresCard data={data} />
        </div>

        {/* 6. Top mahsulotlar */}
        <TopProductsCard rows={data.topProducts} />
      </div>
    </>
  );
}
