import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  BarChart3,
  Coins,
  FileBarChart,
  Printer,
  Receipt,
  ShoppingBag,
  TrendingUp,
} from 'lucide-react';
import type { MonthlyReportResponse, TopProductRow } from '@savdoiq/shared';
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  DataTable,
  EmptyState,
  ErrorState,
  PageHeader,
  PlanGate,
  PreviewBadge,
  ProductCell,
  Skeleton,
  SkeletonRows,
  StatCard,
  StatGrid,
  toast,
  type Column,
} from '@/components/ui';
import { BarsChart, ChartCard, DonutChart, TrendChart } from '@/components/charts';
import { FilterBar } from '@/components/filters';
import {
  CategoriesCard,
  DeliveryTypesCard,
  ExpensesCard,
  InsightsBlock,
  OrdersFlowCard,
  PrintHead,
  PrintStyles,
  RiskCard,
  WarehouseCard,
} from '@/components/reports/ReportBlocks';
import { api } from '@/lib/api';
import { usePeriodQuery } from '@/store/ui';
import { CHART_COLORS } from '@/lib/theme';
import { downloadBlob } from '@/lib/utils';
import { registerNamespace, useFormat, useT } from '@/i18n';

registerNamespace('reports', {
  uz: {
    title: 'Oylik hisobot',
    subtitle: 'Davr bo‘yicha to‘liq yakun: tushum, foyda, xarajat va ombor',
    print: 'PDF uchun chop etish',
    printHint: 'Brauzer chop etish oynasi ochiladi',
    exporting: 'Tayyorlanmoqda...',
    exportOk: 'Excel fayl yuklab olindi',
    exportErr: 'Excel faylni yuklab bo‘lmadi',
    'print.head': 'SavdoIQ — davr hisoboti',

    'kpi.revenue': 'Tushum',
    'kpi.revenueHint': 'Davrdagi jami sotuv summasi',
    'kpi.gross': 'Yalpi foyda',
    'kpi.grossHint': 'Marja {v}',
    'kpi.net': 'Sof foyda',
    'kpi.netHint': 'Soliq {v} hisobga olingan',
    'kpi.avgCheck': 'O‘rtacha chek',
    'kpi.avgCheckHint': '{v} buyurtma asosida',

    'orders.title': 'Buyurtmalar oqimi',
    'orders.subtitle': 'Qabul qilingandan yetkazilgangacha',
    'orders.total': 'Jami',
    'orders.success': 'Muvaffaqiyatli',
    'orders.units': 'Mahsulotlar (dona)',
    'orders.rate': 'muvaffaqiyat',

    'risk.title': 'Xavf va qaytarishlar',
    'risk.subtitle': 'Yo‘qotilgan buyurtmalar ulushi',
    'risk.returnRate': 'Qaytarish ulushi',
    'risk.rateHint': '5% gacha — normal, 10% dan yuqori — xavfli',
    'risk.canceled': 'Bekor qilingan',
    'risk.canceledHint': 'Yetkazilmagan buyurtmalar',
    'risk.returns': 'Qaytarishlar',
    'risk.returnsHint': 'Mijoz qaytargan mahsulotlar',
    'risk.zoneLow': 'Xavfsiz zona',
    'risk.zoneMid': 'Diqqat talab',
    'risk.zoneHigh': 'Xavfli zona',

    'top.title': 'Top sotuvlar',
    'top.subtitle': 'Davrdagi eng ko‘p tushum keltirgan mahsulotlar',
    'top.units': 'Dona',
    'top.revenue': 'Tushum',
    'top.profit': 'Foyda',
    'top.margin': 'Marja',
    'top.share': 'Ulush',
    'top.empty': 'Bu davrda sotuv qayd etilmagan',

    'share.title': 'Sotuv ulushi',
    'share.subtitle': 'Top mahsulotlar va qolganlari',
    'share.others': 'Boshqalar',
    'share.center': 'Jami tushum',

    'cats.title': 'Kategoriyalar bo‘yicha',
    'cats.subtitle': 'Tushumning kategoriyalar kesimi',
    'cats.empty': 'Kategoriya ma’lumoti yo‘q',

    'delivery.title': 'Yetkazib berish turlari',
    'delivery.subtitle': 'FBO / FBS / DBS taqsimoti',
    'delivery.orders': 'Buyurtma',
    'delivery.success': 'Muvaffaqiyatli',
    'delivery.empty': 'Ma’lumot yo‘q',

    'expenses.title': 'Davr xarajatlari',
    'expenses.subtitle': 'Komissiya, logistika, ombor va boshqalar',
    'expenses.total': 'Jami xarajat',
    'expenses.empty': 'Xarajat qayd etilmagan',

    'warehouse.title': 'Ombor',
    'warehouse.subtitle': 'Davr oxiridagi qoldiq holati',
    'warehouse.units': 'dona',
    'warehouse.capital': 'Jami ombor kapitali',
    'warehouse.capitalHint': 'Qoldiqlarning tannarx bo‘yicha qiymati',

    'daily.title': 'Kunlik dinamika',
    'daily.subtitle': 'Tushum va sof foyda kunlar kesimida',
    'daily.revenue': 'Tushum',
    'daily.profit': 'Sof foyda',
    'daily.empty': 'Kunlik ma’lumot yo‘q',

    'insights.title': 'Xulosalar',
    'insights.subtitle': 'Davr bo‘yicha e’tibor talab qiladigan nuqtalar',
    'insights.empty': 'Alohida xulosa yo‘q — ko‘rsatkichlar barqaror',

    'compare.title': 'Oylar taqqoslash',
    'compare.subtitle': 'Oxirgi 6 oy: tushum va foyda',
    'compare.revenue': 'Tushum',
    'compare.profit': 'Foyda',
    'compare.empty': 'Taqqoslash uchun ma’lumot yetarli emas',

    'empty.title': 'Bu davrda hisobot yo‘q',
    'empty.hint': 'Boshqa davrni tanlang yoki sinxronizatsiya tugashini kuting',
  },
  ru: {
    title: 'Месячный отчёт',
    subtitle: 'Полный итог периода: выручка, прибыль, расходы и склад',
    print: 'Печать в PDF',
    printHint: 'Откроется окно печати браузера',
    exporting: 'Готовим...',
    exportOk: 'Excel-файл скачан',
    exportErr: 'Не удалось скачать Excel',
    'print.head': 'SavdoIQ — отчёт за период',

    'kpi.revenue': 'Выручка',
    'kpi.revenueHint': 'Общая сумма продаж за период',
    'kpi.gross': 'Валовая прибыль',
    'kpi.grossHint': 'Маржа {v}',
    'kpi.net': 'Чистая прибыль',
    'kpi.netHint': 'С учётом налога {v}',
    'kpi.avgCheck': 'Средний чек',
    'kpi.avgCheckHint': 'На основе {v} заказов',

    'orders.title': 'Поток заказов',
    'orders.subtitle': 'От оформления до доставки',
    'orders.total': 'Всего',
    'orders.success': 'Успешных',
    'orders.units': 'Товаров (шт)',
    'orders.rate': 'успешность',

    'risk.title': 'Риски и возвраты',
    'risk.subtitle': 'Доля потерянных заказов',
    'risk.returnRate': 'Доля возвратов',
    'risk.rateHint': 'До 5% — норма, выше 10% — рискованно',
    'risk.canceled': 'Отменено',
    'risk.canceledHint': 'Недоставленные заказы',
    'risk.returns': 'Возвраты',
    'risk.returnsHint': 'Товары, возвращённые покупателем',
    'risk.zoneLow': 'Безопасная зона',
    'risk.zoneMid': 'Требует внимания',
    'risk.zoneHigh': 'Зона риска',

    'top.title': 'Топ продаж',
    'top.subtitle': 'Товары с наибольшей выручкой за период',
    'top.units': 'Шт',
    'top.revenue': 'Выручка',
    'top.profit': 'Прибыль',
    'top.margin': 'Маржа',
    'top.share': 'Доля',
    'top.empty': 'За этот период продаж не было',

    'share.title': 'Доля продаж',
    'share.subtitle': 'Топ-товары и остальные',
    'share.others': 'Остальные',
    'share.center': 'Всего выручки',

    'cats.title': 'По категориям',
    'cats.subtitle': 'Разрез выручки по категориям',
    'cats.empty': 'Нет данных по категориям',

    'delivery.title': 'Типы доставки',
    'delivery.subtitle': 'Распределение FBO / FBS / DBS',
    'delivery.orders': 'Заказов',
    'delivery.success': 'Успешных',
    'delivery.empty': 'Нет данных',

    'expenses.title': 'Расходы периода',
    'expenses.subtitle': 'Комиссия, логистика, хранение и прочее',
    'expenses.total': 'Итого расходов',
    'expenses.empty': 'Расходы не зафиксированы',

    'warehouse.title': 'Склад',
    'warehouse.subtitle': 'Остатки на конец периода',
    'warehouse.units': 'шт',
    'warehouse.capital': 'Всего складского капитала',
    'warehouse.capitalHint': 'Стоимость остатков по себестоимости',

    'daily.title': 'Динамика по дням',
    'daily.subtitle': 'Выручка и чистая прибыль по дням',
    'daily.revenue': 'Выручка',
    'daily.profit': 'Чистая прибыль',
    'daily.empty': 'Нет данных по дням',

    'insights.title': 'Выводы',
    'insights.subtitle': 'Точки, требующие внимания за период',
    'insights.empty': 'Особых выводов нет — показатели стабильны',

    'compare.title': 'Сравнение месяцев',
    'compare.subtitle': 'Последние 6 месяцев: выручка и прибыль',
    'compare.revenue': 'Выручка',
    'compare.profit': 'Прибыль',
    'compare.empty': 'Недостаточно данных для сравнения',

    'empty.title': 'За этот период отчёта нет',
    'empty.hint': 'Выберите другой период или дождитесь синхронизации',
  },
  en: {
    title: 'Monthly report',
    subtitle: 'Full period summary: revenue, profit, costs and stock',
    print: 'Print to PDF',
    printHint: 'Opens the browser print dialog',
    exporting: 'Preparing...',
    exportOk: 'Excel file downloaded',
    exportErr: 'Could not download the Excel file',
    'print.head': 'SavdoIQ — period report',

    'kpi.revenue': 'Revenue',
    'kpi.revenueHint': 'Total sales for the period',
    'kpi.gross': 'Gross profit',
    'kpi.grossHint': 'Margin {v}',
    'kpi.net': 'Net profit',
    'kpi.netHint': 'Tax {v} included',
    'kpi.avgCheck': 'Average check',
    'kpi.avgCheckHint': 'Based on {v} orders',

    'orders.title': 'Order flow',
    'orders.subtitle': 'From placement to delivery',
    'orders.total': 'Total',
    'orders.success': 'Successful',
    'orders.units': 'Items (units)',
    'orders.rate': 'success rate',

    'risk.title': 'Risk and returns',
    'risk.subtitle': 'Share of lost orders',
    'risk.returnRate': 'Return rate',
    'risk.rateHint': 'Up to 5% is normal, above 10% is risky',
    'risk.canceled': 'Canceled',
    'risk.canceledHint': 'Orders that were not delivered',
    'risk.returns': 'Returns',
    'risk.returnsHint': 'Items returned by customers',
    'risk.zoneLow': 'Safe zone',
    'risk.zoneMid': 'Needs attention',
    'risk.zoneHigh': 'Risk zone',

    'top.title': 'Top sales',
    'top.subtitle': 'Highest revenue products for the period',
    'top.units': 'Units',
    'top.revenue': 'Revenue',
    'top.profit': 'Profit',
    'top.margin': 'Margin',
    'top.share': 'Share',
    'top.empty': 'No sales recorded for this period',

    'share.title': 'Sales share',
    'share.subtitle': 'Top products versus the rest',
    'share.others': 'Others',
    'share.center': 'Total revenue',

    'cats.title': 'By category',
    'cats.subtitle': 'Revenue split across categories',
    'cats.empty': 'No category data',

    'delivery.title': 'Delivery types',
    'delivery.subtitle': 'FBO / FBS / DBS distribution',
    'delivery.orders': 'Orders',
    'delivery.success': 'Successful',
    'delivery.empty': 'No data',

    'expenses.title': 'Period costs',
    'expenses.subtitle': 'Commission, logistics, storage and more',
    'expenses.total': 'Total costs',
    'expenses.empty': 'No costs recorded',

    'warehouse.title': 'Warehouse',
    'warehouse.subtitle': 'Stock at the end of the period',
    'warehouse.units': 'units',
    'warehouse.capital': 'Total stock capital',
    'warehouse.capitalHint': 'Value of stock at cost price',

    'daily.title': 'Daily dynamics',
    'daily.subtitle': 'Revenue and net profit day by day',
    'daily.revenue': 'Revenue',
    'daily.profit': 'Net profit',
    'daily.empty': 'No daily data',

    'insights.title': 'Takeaways',
    'insights.subtitle': 'What deserves attention this period',
    'insights.empty': 'Nothing stands out — metrics look stable',

    'compare.title': 'Month comparison',
    'compare.subtitle': 'Last 6 months: revenue and profit',
    'compare.revenue': 'Revenue',
    'compare.profit': 'Profit',
    'compare.empty': 'Not enough data to compare',

    'empty.title': 'No report for this period',
    'empty.hint': 'Pick another period or wait for the sync to finish',
  },
});

type CompareRow = { month: string; revenue: number; profit: number; margin: number };

export default function Reports() {
  const t = useT('reports');
  const f = useFormat();
  const q = usePeriodQuery();
  const [exporting, setExporting] = useState(false);

  const report = useQuery({
    queryKey: ['reports-monthly', q],
    queryFn: () => api.get<MonthlyReportResponse>('/reports/monthly', q),
  });

  const compare = useQuery({
    queryKey: ['reports-compare', q.storeId],
    queryFn: () => api.get<CompareRow[]>('/reports/compare', { storeId: q.storeId }),
  });

  const data = report.data;

  const donutData = useMemo(() => {
    if (!data) return [];
    const top = [...data.topProducts].sort((a, b) => b.revenue - a.revenue).slice(0, 6);
    const palette: string[] = [
      CHART_COLORS.brand,
      CHART_COLORS.violet,
      CHART_COLORS.info,
      CHART_COLORS.warn,
      CHART_COLORS.teal,
      CHART_COLORS.pink,
    ];
    const rows = top.map((p, i) => ({ name: p.title, value: p.revenue, color: palette[i % palette.length] }));
    const others = Math.max(0, data.revenue - top.reduce((s, p) => s + p.revenue, 0));
    if (others > 0) rows.push({ name: t('share.others'), value: others, color: CHART_COLORS.slate });
    return rows.filter((r) => r.value > 0);
  }, [data, t]);

  const dailyData = useMemo(
    () =>
      (data?.daily ?? []).map((d) => ({
        date: d.date,
        revenue: d.revenue,
        profit: d.profit,
      })),
    [data],
  );

  const compareData = useMemo(
    () =>
      (compare.data ?? []).slice(-6).map((m) => ({
        month: m.month,
        revenue: m.revenue,
        profit: m.profit,
      })),
    [compare.data],
  );

  const topColumns: Column<TopProductRow>[] = [
    {
      key: 'title',
      header: t('top.title'),
      render: (r) => <ProductCell title={r.title} subtitle={r.sku} imageUrl={r.imageUrl} size={36} />,
    },
    {
      key: 'units',
      header: t('top.units'),
      align: 'right',
      sortable: true,
      sortValue: (r) => r.units,
      render: (r) => f.num(r.units),
    },
    {
      key: 'revenue',
      header: t('top.revenue'),
      align: 'right',
      sortable: true,
      sortValue: (r) => r.revenue,
      render: (r) => <span className="font-semibold text-ink">{f.money(r.revenue)}</span>,
    },
    {
      key: 'profit',
      header: t('top.profit'),
      align: 'right',
      sortable: true,
      sortValue: (r) => r.profit,
      hideOnMobile: true,
      render: (r) => <span className={r.profit >= 0 ? 'text-brand' : 'text-danger'}>{f.money(r.profit)}</span>,
    },
    {
      key: 'margin',
      header: t('top.margin'),
      align: 'right',
      hideOnMobile: true,
      sortable: true,
      sortValue: (r) => r.margin,
      render: (r) => f.pct(r.margin, 1),
    },
    {
      key: 'share',
      header: t('top.share'),
      align: 'right',
      hideOnMobile: true,
      sortable: true,
      sortValue: (r) => r.share,
      render: (r) => <span className="text-muted">{f.pct(r.share, 1)}</span>,
    },
  ];

  const onExport = async () => {
    setExporting(true);
    try {
      const blob = await api.blob('/export/monthly', q);
      downloadBlob(blob, `savdoiq-report-${q.from}_${q.to}.xlsx`);
      toast.success(t('exportOk'));
    } catch {
      toast.error(t('exportErr'));
    } finally {
      setExporting(false);
    }
  };

  return (
    <>
      <PrintStyles />

      <PageHeader
        icon={<FileBarChart className="h-5 w-5" />}
        title={t('title')}
        description={t('subtitle')}
        badge={<PreviewBadge feature="monthly_reports" />}
        actions={
          <div className="no-print flex flex-wrap items-center gap-2">
            <Button variant="outline" icon={<Receipt className="h-4 w-4" />} loading={exporting} onClick={onExport}>
              {exporting ? t('exporting') : 'Excel'}
            </Button>
            <Button icon={<Printer className="h-4 w-4" />} title={t('printHint')} onClick={() => window.print()}>
              {t('print')}
            </Button>
          </div>
        }
      />

      <div className="no-print">
        <FilterBar />
      </div>

      <PlanGate feature="monthly_reports">
        {report.isError ? (
          <Card>
            <ErrorState
              message={report.error instanceof Error ? report.error.message : undefined}
              onRetry={() => void report.refetch()}
            />
          </Card>
        ) : report.isLoading ? (
          <div className="space-y-5">
            <StatGrid>
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-[126px] w-full" />
              ))}
            </StatGrid>
            <div className="grid gap-4 lg:grid-cols-2">
              <Skeleton className="h-64 w-full" />
              <Skeleton className="h-64 w-full" />
            </div>
            <Card>
              <CardBody>
                <SkeletonRows rows={6} />
              </CardBody>
            </Card>
          </div>
        ) : !data ? (
          <Card>
            <EmptyState
              icon={<FileBarChart className="h-6 w-6" />}
              title={t('empty.title')}
              hint={t('empty.hint')}
            />
          </Card>
        ) : (
          <div className="report-sheet space-y-5">
            <PrintHead from={data.period.from} to={data.period.to} />

            {/* ── KPI ── */}
            <StatGrid>
              <StatCard
                label={t('kpi.revenue')}
                value={f.money(data.revenue)}
                hint={t('kpi.revenueHint')}
                icon={<TrendingUp className="h-5 w-5" />}
                tone="brand"
              />
              <StatCard
                label={t('kpi.gross')}
                value={f.money(data.grossProfit)}
                hint={t('kpi.grossHint', { v: f.pct(data.grossMargin, 1) })}
                icon={<BarChart3 className="h-5 w-5" />}
                tone="info"
              />
              <StatCard
                label={t('kpi.net')}
                value={f.money(data.netProfit)}
                hint={t('kpi.netHint', { v: f.pct(data.taxRate, 1) })}
                icon={<Coins className="h-5 w-5" />}
                tone={data.netProfit >= 0 ? 'brand' : 'danger'}
              />
              <StatCard
                label={t('kpi.avgCheck')}
                value={f.money(data.avgCheck)}
                hint={t('kpi.avgCheckHint', { v: f.num(data.ordersTotal) })}
                icon={<ShoppingBag className="h-5 w-5" />}
                tone="violet"
              />
            </StatGrid>

            {/* ── Oqim va xavf ── */}
            <div className="grid gap-4 lg:grid-cols-2">
              <OrdersFlowCard report={data} />
              <RiskCard report={data} />
            </div>

            {/* ── Top sotuvlar va ulush ── */}
            <div className="grid gap-4 xl:grid-cols-5">
              <Card className="print-avoid-break xl:col-span-3">
                <CardHeader title={t('top.title')} subtitle={t('top.subtitle')} />
                <div className="overflow-x-auto">
                  <DataTable
                    columns={topColumns}
                    rows={data.topProducts}
                    rowKey={(r) => r.skuId}
                    density="compact"
                    empty={<EmptyState title={t('top.empty')} />}
                  />
                </div>
              </Card>

              <ChartCard
                title={t('share.title')}
                subtitle={t('share.subtitle')}
                className="print-avoid-break xl:col-span-2"
              >
                {donutData.length ? (
                  <DonutChart
                    data={donutData}
                    height={280}
                    center={
                      <>
                        <span className="text-2xs uppercase tracking-wider text-muted">{t('share.center')}</span>
                        <span className="tnum mt-0.5 font-display text-lg font-extrabold text-ink">
                          {f.compact(data.revenue)}
                        </span>
                      </>
                    }
                  />
                ) : (
                  <EmptyState title={t('top.empty')} />
                )}
              </ChartCard>
            </div>

            {/* ── Kategoriya va yetkazib berish ── */}
            <div className="grid gap-4 lg:grid-cols-2">
              <CategoriesCard rows={data.categories} />
              <DeliveryTypesCard rows={data.deliveryTypes} />
            </div>

            {/* ── Xarajat va ombor ── */}
            <div className="grid gap-4 lg:grid-cols-2">
              <ExpensesCard rows={data.expenses} total={data.expensesTotal} />
              <WarehouseCard warehouse={data.warehouse} />
            </div>

            {/* ── Kunlik dinamika ── */}
            <ChartCard title={t('daily.title')} subtitle={t('daily.subtitle')} className="print-avoid-break">
              {dailyData.length ? (
                <TrendChart
                  data={dailyData}
                  series={[
                    { key: 'revenue', name: t('daily.revenue'), money: true, color: CHART_COLORS.brand },
                    { key: 'profit', name: t('daily.profit'), money: true, color: CHART_COLORS.violet },
                  ]}
                  height={300}
                />
              ) : (
                <EmptyState title={t('daily.empty')} />
              )}
            </ChartCard>

            {/* ── Xulosalar ── */}
            <InsightsBlock insights={data.insights} />

            {/* ── Oylar taqqoslash ── */}
            <ChartCard
              title={t('compare.title')}
              subtitle={t('compare.subtitle')}
              className="print-avoid-break print-break-before"
            >
              {compare.isLoading ? (
                <Skeleton className="h-64 w-full" />
              ) : compare.isError ? (
                <ErrorState
                  message={compare.error instanceof Error ? compare.error.message : undefined}
                  onRetry={() => void compare.refetch()}
                />
              ) : compareData.length ? (
                <BarsChart
                  data={compareData}
                  xKey="month"
                  showLegend
                  series={[
                    { key: 'revenue', name: t('compare.revenue'), money: true, color: CHART_COLORS.brand },
                    { key: 'profit', name: t('compare.profit'), money: true, color: CHART_COLORS.violet },
                  ]}
                  height={300}
                />
              ) : (
                <EmptyState title={t('compare.empty')} />
              )}
            </ChartCard>
          </div>
        )}
      </PlanGate>
    </>
  );
}
