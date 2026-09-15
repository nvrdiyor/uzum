import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { CalendarRange, Clock, Download, Inbox, MapPin, TrendingUp, Truck } from 'lucide-react';
import type { DeliveryType, OrderRow, OrderStatus, SalesAnalyticsResponse } from '@savdoiq/shared';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  DataTable,
  EmptyState,
  ErrorState,
  PageHeader,
  PlanGate,
  PreviewBadge,
  ProductCell,
  SearchInput,
  Segmented,
  Select,
  Skeleton,
  StatCard,
  StatGrid,
  toast,
  type Column,
} from '@/components/ui';
import { BarsChart, ChartCard, DonutChart } from '@/components/charts';
import { FilterBar } from '@/components/filters';
import { DELIVERY_TYPES, DeliveryBadge, ORDER_STATUSES, OrderStatusBadge } from '@/components/sales/OrderBadges';
import { OrderDrawer } from '@/components/sales/OrderDrawer';
import { useDebounced } from '@/components/sales/useDebounced';
import { registerNamespace, useFormat, useT } from '@/i18n';
import { ApiError, api } from '@/lib/api';
import { CHART_COLORS } from '@/lib/theme';
import { cn, downloadBlob } from '@/lib/utils';
import { usePeriodQuery } from '@/store/ui';

registerNamespace('sales', {
  uz: {
    title: 'Sotuv tahlili',
    subtitle: 'Buyurtmalar, soatlik faollik va har bir sotuvning foydasi',
    'kpi.orders': 'Jami buyurtmalar',
    'kpi.revenue': 'Tushum',
    'kpi.profit': 'Sof foyda',
    'kpi.avgCheck': 'O‘rtacha chek',
    'kpi.ordersHint': 'Tanlangan davr uchun',
    'kpi.revenueHint': 'Bekor va qaytarilganlarsiz, butun davr',
    'kpi.profitHint': 'Komissiya, yetkazish va tannarx ayirilgan',
    'kpi.avgCheckHint': 'Tushum / faol buyurtmalar',
    'hourly.title': 'Buyurtmalarning soatlik tahlili',
    'hourly.subtitle': 'Kun davomida faollik — reklama va narx o‘zgarishlarini rejalashtirish uchun',
    'hourly.orders': 'Buyurtmalar',
    'hourly.revenue': 'Tushum',
    'hourly.peakOrders': 'Eng ko‘p buyurtma: {hour} da — {value} ta',
    'hourly.peakRevenue': 'Eng ko‘p tushum: {hour} da — {value}',
    'hourly.empty': 'Bu davrda buyurtma bo‘lmagan',
    'delivery.title': 'Yetkazish turlari',
    'delivery.subtitle': 'Buyurtmalar soni bo‘yicha',
    'delivery.total': 'Buyurtma',
    'city.title': 'Shaharlar bo‘yicha top 10',
    'city.subtitle': 'Tushum miqdori bo‘yicha eng yirik shaharlar',
    'city.revenue': 'Tushum',
    'weekday.title': 'Hafta kunlari',
    'weekday.subtitle': 'Buyurtmalar taqsimoti',
    'weekday.orders': 'Buyurtmalar',
    'table.title': 'Buyurtmalar',
    'table.hint': 'Barcha summalar so‘mda. Tafsilot uchun qatorga bosing',
    'table.empty': 'Buyurtma topilmadi',
    'table.emptyHint': 'Filtrlarni o‘zgartiring yoki boshqa davrni tanlang',
    'col.product': 'Mahsulot',
    'col.id': 'ID',
    'col.status': 'Holat',
    'col.type': 'Turi',
    'col.date': 'Sana',
    'col.purchasePrice': 'Xarid narxi',
    'col.sellPrice': 'Sotish narxi',
    'col.revenue': 'Tushum',
    'col.commission': 'Komissiya',
    'col.logistics': 'Logistika',
    'col.payout': 'To‘lovga',
    'col.netProfit': 'Sof foyda',
    'col.margin': 'Marja',
    'filter.search': 'Buyurtma ID yoki SKU',
    'filter.allStatuses': 'Barcha holatlar',
    'filter.allTypes': 'Barcha turlar',
    'export.ok': 'Excel fayl yuklab olindi',
    'export.fail': 'Eksport qilishda xatolik',
    'wd.0': 'Yakshanba',
    'wd.1': 'Dushanba',
    'wd.2': 'Seshanba',
    'wd.3': 'Chorshanba',
    'wd.4': 'Payshanba',
    'wd.5': 'Juma',
    'wd.6': 'Shanba',
  },
  ru: {
    title: 'Аналитика продаж',
    subtitle: 'Заказы, почасовая активность и прибыль каждой продажи',
    'kpi.orders': 'Всего заказов',
    'kpi.revenue': 'Выручка',
    'kpi.profit': 'Чистая прибыль',
    'kpi.avgCheck': 'Средний чек',
    'kpi.ordersHint': 'За выбранный период',
    'kpi.revenueHint': 'Без отменённых и возвратов, весь период',
    'kpi.profitHint': 'За вычетом комиссии, доставки и себестоимости',
    'kpi.avgCheckHint': 'Выручка / активные заказы',
    'hourly.title': 'Почасовой анализ заказов',
    'hourly.subtitle': 'Активность в течение дня — для планирования рекламы и цен',
    'hourly.orders': 'Заказы',
    'hourly.revenue': 'Выручка',
    'hourly.peakOrders': 'Больше всего заказов: в {hour} — {value} шт',
    'hourly.peakRevenue': 'Больше всего выручки: в {hour} — {value}',
    'hourly.empty': 'За этот период заказов не было',
    'delivery.title': 'Типы доставки',
    'delivery.subtitle': 'По количеству заказов',
    'delivery.total': 'Заказов',
    'city.title': 'Топ-10 городов',
    'city.subtitle': 'Крупнейшие города по выручке',
    'city.revenue': 'Выручка',
    'weekday.title': 'Дни недели',
    'weekday.subtitle': 'Распределение заказов',
    'weekday.orders': 'Заказы',
    'table.title': 'Заказы',
    'table.hint': 'Все суммы в сумах. Нажмите на строку для деталей',
    'table.empty': 'Заказы не найдены',
    'table.emptyHint': 'Измените фильтры или выберите другой период',
    'col.product': 'Товар',
    'col.id': 'ID',
    'col.status': 'Статус',
    'col.type': 'Тип',
    'col.date': 'Дата',
    'col.purchasePrice': 'Закупка',
    'col.sellPrice': 'Цена продажи',
    'col.revenue': 'Выручка',
    'col.commission': 'Комиссия',
    'col.logistics': 'Логистика',
    'col.payout': 'К выплате',
    'col.netProfit': 'Чистая прибыль',
    'col.margin': 'Маржа',
    'filter.search': 'ID заказа или SKU',
    'filter.allStatuses': 'Все статусы',
    'filter.allTypes': 'Все типы',
    'export.ok': 'Excel-файл скачан',
    'export.fail': 'Ошибка при экспорте',
    'wd.0': 'Воскресенье',
    'wd.1': 'Понедельник',
    'wd.2': 'Вторник',
    'wd.3': 'Среда',
    'wd.4': 'Четверг',
    'wd.5': 'Пятница',
    'wd.6': 'Суббота',
  },
  en: {
    title: 'Sales analytics',
    subtitle: 'Orders, hourly activity and the profit behind every sale',
    'kpi.orders': 'Total orders',
    'kpi.revenue': 'Revenue',
    'kpi.profit': 'Net profit',
    'kpi.avgCheck': 'Average check',
    'kpi.ordersHint': 'For the selected period',
    'kpi.revenueHint': 'Excludes cancelled and returned, whole period',
    'kpi.profitHint': 'Net of commission, delivery and cost price',
    'kpi.avgCheckHint': 'Revenue / active orders',
    'hourly.title': 'Hourly order analysis',
    'hourly.subtitle': 'Activity through the day — plan ads and pricing around it',
    'hourly.orders': 'Orders',
    'hourly.revenue': 'Revenue',
    'hourly.peakOrders': 'Most orders: at {hour} — {value} pcs',
    'hourly.peakRevenue': 'Highest revenue: at {hour} — {value}',
    'hourly.empty': 'No orders in this period',
    'delivery.title': 'Delivery types',
    'delivery.subtitle': 'By order count',
    'delivery.total': 'Orders',
    'city.title': 'Top 10 cities',
    'city.subtitle': 'Largest cities by revenue',
    'city.revenue': 'Revenue',
    'weekday.title': 'Weekdays',
    'weekday.subtitle': 'Order distribution',
    'weekday.orders': 'Orders',
    'table.title': 'Orders',
    'table.hint': 'All amounts in UZS. Click a row for details',
    'table.empty': 'No orders found',
    'table.emptyHint': 'Change the filters or pick another period',
    'col.product': 'Product',
    'col.id': 'ID',
    'col.status': 'Status',
    'col.type': 'Type',
    'col.date': 'Date',
    'col.purchasePrice': 'Cost',
    'col.sellPrice': 'Sell price',
    'col.revenue': 'Revenue',
    'col.commission': 'Commission',
    'col.logistics': 'Logistics',
    'col.payout': 'Payout',
    'col.netProfit': 'Net profit',
    'col.margin': 'Margin',
    'filter.search': 'Order ID or SKU',
    'filter.allStatuses': 'All statuses',
    'filter.allTypes': 'All types',
    'export.ok': 'Excel file downloaded',
    'export.fail': 'Export failed',
    'wd.0': 'Sunday',
    'wd.1': 'Monday',
    'wd.2': 'Tuesday',
    'wd.3': 'Wednesday',
    'wd.4': 'Thursday',
    'wd.5': 'Friday',
    'wd.6': 'Saturday',
  },
});

/**
 * `/sales/orders/:id` to'liq tafsilot qaytaradi, lekin chekmaga faqat
 * buyurtmaning o'zi kerak — qolgan maydonlarni tiplashtirmaymiz.
 */
type OrderDetailPayload = { order: OrderRow };

const PAGE_SIZE = 25;
/** Dushanbadan boshlab ko'rsatamiz (JS getDay: 0 = yakshanba) */
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];

const DELIVERY_COLOR: Record<DeliveryType, string> = {
  FBO: CHART_COLORS.brand,
  FBS: CHART_COLORS.info,
  DBS: CHART_COLORS.violet,
};

export default function Sales() {
  const t = useT('sales');
  const tc = useT('common');
  const tm = useT('salesMeta');
  const f = useFormat();
  const q = usePeriodQuery();

  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<OrderStatus | ''>('');
  const [type, setType] = useState<DeliveryType | ''>('');
  const [searchInput, setSearchInput] = useState('');
  const search = useDebounced(searchInput);
  const [metric, setMetric] = useState<'orders' | 'revenue'>('orders');
  const [selected, setSelected] = useState<OrderRow | null>(null);
  const [exporting, setExporting] = useState(false);

  /**
   * Telegramdagi "Buyurtmani ko'rish" tugmasi `/sales?order=<raqam>` ga olib
   * keladi. Buyurtma joriy davrga yoki joriy sahifaga tushmasligi mumkin,
   * shuning uchun uni alohida so'rov bilan olamiz — davrdan mustaqil.
   */
  const [params, setParams] = useSearchParams();
  const deepOrderId = params.get('order');

  const clearDeepLink = useCallback(() => {
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete('order');
        return next;
      },
      { replace: true },
    );
  }, [setParams]);

  const deepOrder = useQuery({
    queryKey: ['sales-order', deepOrderId],
    queryFn: () => api.get<OrderDetailPayload>(`/sales/orders/${encodeURIComponent(deepOrderId ?? '')}`),
    enabled: Boolean(deepOrderId),
  });

  useEffect(() => {
    if (!deepOrderId || !deepOrder.data) return;
    setSelected(deepOrder.data.order);
    clearDeepLink();
  }, [deepOrderId, deepOrder.data, clearDeepLink]);

  useEffect(() => {
    const err = deepOrder.error;
    if (!err) return;
    /*
     * Faqat serverning aniq javobida havolani tozalaymiz. Tarmoq uzilishida
     * (mobil internetda odatiy hol) `?order=` saqlanib qoladi — sahifani
     * yangilash yetarli bo'ladi.
     */
    if (err instanceof ApiError && (err.status === 404 || err.status === 403)) {
      toast.error(err.message);
      clearDeepLink();
    } else {
      toast.error(tc('common.error'));
    }
  }, [deepOrder.error, clearDeepLink, tc]);

  const query = {
    ...q,
    page,
    pageSize: PAGE_SIZE,
    status: status || undefined,
    type: type || undefined,
    search: search || undefined,
  };

  useEffect(() => {
    setPage(1);
  }, [status, type, search, q.from, q.to, q.storeId]);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['sales', query],
    queryFn: () => api.get<SalesAnalyticsResponse>('/sales', query),
    placeholderData: keepPreviousData,
  });

  const items = data?.orders.items ?? [];

  // ── KPI ────────────────────────────────────────────────────────────────
  /**
   * Barcha raqamlar serverdan — davr bo'yicha va bir xil to'plamdan.
   * O'rtacha chek amaldagi (bekor qilinmagan) buyurtmalarga bo'linadi,
   * shunda u Uzum kabinetidagi chek bilan mos keladi.
   */
  const kpi = useMemo(() => {
    const revenue = data?.revenue ?? 0;
    const profit = data?.netProfit ?? 0;
    const ordersActive = data?.ordersActive ?? 0;
    return {
      orders: data?.orders.total ?? 0,
      revenue,
      profit,
      marginPct: revenue > 0 ? (profit / revenue) * 100 : 0,
      avgCheck: ordersActive > 0 ? revenue / ordersActive : 0,
    };
  }, [data]);

  // ── Soatlik ────────────────────────────────────────────────────────────
  const hourData = useMemo(() => {
    const map = new Map((data?.hourly ?? []).map((h) => [h.hour, h]));
    return Array.from({ length: 24 }, (_, hour) => ({
      hour: `${String(hour).padStart(2, '0')}`,
      orders: map.get(hour)?.orders ?? 0,
      revenue: map.get(hour)?.revenue ?? 0,
    }));
  }, [data]);

  const peak = useMemo(() => {
    let best = hourData[0];
    for (const row of hourData) if (row[metric] > (best?.[metric] ?? 0)) best = row;
    return best && best[metric] > 0 ? best : null;
  }, [hourData, metric]);

  // ── Yon panel ma'lumotlari ─────────────────────────────────────────────
  const deliveryData = useMemo(
    () =>
      (data?.byDeliveryType ?? []).map((d) => ({
        name: d.type,
        value: d.orders,
        color: DELIVERY_COLOR[d.type] ?? CHART_COLORS.slate,
      })),
    [data],
  );

  const cityData = useMemo(
    () =>
      [...(data?.byCity ?? [])]
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 10)
        .map((c) => ({ city: c.city, revenue: c.revenue, orders: c.orders })),
    [data],
  );

  const weekdayData = useMemo(() => {
    const map = new Map((data?.byWeekday ?? []).map((w) => [w.weekday, w]));
    return WEEK_ORDER.map((wd) => ({
      day: t(`wd.${wd}`).slice(0, 3),
      orders: map.get(wd)?.orders ?? 0,
      revenue: map.get(wd)?.revenue ?? 0,
    }));
  }, [data, t]);

  const deliveryTotal = deliveryData.reduce((s, d) => s + d.value, 0);

  // ── Excel ──────────────────────────────────────────────────────────────
  async function onExport() {
    setExporting(true);
    try {
      const blob = await api.blob('/export/sales', query);
      downloadBlob(blob, `sales-${q.from}_${q.to}.xlsx`);
      toast.success(t('export.ok'));
    } catch {
      toast.error(t('export.fail'));
    } finally {
      setExporting(false);
    }
  }

  // ── Jadval ustunlari ───────────────────────────────────────────────────
  const columns = useMemo<Column<OrderRow>[]>(
    () => [
      {
        key: 'product',
        header: t('col.product'),
        width: 260,
        render: (row) => <ProductCell title={row.title} subtitle={row.sku ?? '—'} imageUrl={row.imageUrl} />,
        sortValue: (row) => row.title,
        sortable: true,
      },
      {
        key: 'id',
        header: t('col.id'),
        hideOnMobile: true,
        render: (row) => <span className="tnum text-xs text-muted">{row.uzumOrderId ?? row.id.slice(0, 8)}</span>,
      },
      {
        key: 'status',
        header: t('col.status'),
        render: (row) => <OrderStatusBadge status={row.status} />,
        sortValue: (row) => row.status,
        sortable: true,
      },
      {
        key: 'type',
        header: t('col.type'),
        hideOnMobile: true,
        render: (row) => <DeliveryBadge type={row.deliveryType} />,
        sortValue: (row) => row.deliveryType,
        sortable: true,
      },
      {
        key: 'date',
        header: t('col.date'),
        hideOnMobile: true,
        render: (row) => <span className="tnum whitespace-nowrap text-xs">{f.dateTime(row.orderedAt)}</span>,
        sortValue: (row) => row.orderedAt,
        sortable: true,
      },
      {
        key: 'purchasePrice',
        header: t('col.purchasePrice'),
        align: 'right',
        hideOnMobile: true,
        render: (row) => f.num(row.purchasePrice),
        sortValue: (row) => row.purchasePrice,
        sortable: true,
      },
      {
        key: 'sellPrice',
        header: t('col.sellPrice'),
        align: 'right',
        hideOnMobile: true,
        render: (row) => f.num(row.sellPrice),
        sortValue: (row) => row.sellPrice,
        sortable: true,
      },
      {
        key: 'revenue',
        header: t('col.revenue'),
        align: 'right',
        render: (row) => <span className="font-medium text-ink">{f.num(row.revenue)}</span>,
        sortValue: (row) => row.revenue,
        sortable: true,
      },
      {
        key: 'commission',
        header: t('col.commission'),
        align: 'right',
        hideOnMobile: true,
        render: (row) => f.num(row.commission),
        sortValue: (row) => row.commission,
        sortable: true,
      },
      {
        key: 'logistics',
        header: t('col.logistics'),
        align: 'right',
        hideOnMobile: true,
        render: (row) => f.num(row.logistics),
        sortValue: (row) => row.logistics,
        sortable: true,
      },
      {
        key: 'payout',
        header: t('col.payout'),
        align: 'right',
        hideOnMobile: true,
        render: (row) => f.num(row.payout),
        sortValue: (row) => row.payout,
        sortable: true,
      },
      {
        key: 'netProfit',
        header: t('col.netProfit'),
        align: 'right',
        render: (row) => (
          <span className={cn('font-semibold', row.netProfit < 0 ? 'text-danger' : 'text-ink')}>
            {f.num(row.netProfit)}
          </span>
        ),
        sortValue: (row) => row.netProfit,
        sortable: true,
      },
      {
        key: 'margin',
        header: t('col.margin'),
        align: 'right',
        render: (row) => (
          <span className={row.margin < 0 ? 'text-danger' : 'text-ink-soft'}>{f.pct(row.margin)}</span>
        ),
        sortValue: (row) => row.margin,
        sortable: true,
      },
    ],
    [t, f],
  );

  return (
    <>
      <PageHeader
        icon={<TrendingUp className="h-5 w-5" />}
        title={t('title')}
        description={t('subtitle')}
        badge={<PreviewBadge feature="sales_analytics" />}
        actions={
          <Button
            variant="outline"
            icon={<Download className="h-4 w-4" />}
            loading={exporting}
            onClick={onExport}
          >
            {tc('btn.export')}
          </Button>
        }
      />

      <FilterBar>
        <SearchInput
          value={searchInput}
          onChange={setSearchInput}
          placeholder={t('filter.search')}
          className="w-full sm:w-64"
        />
        <Select
          className="h-10 w-full py-0 sm:w-44"
          value={status}
          onChange={(e) => setStatus(e.target.value as OrderStatus | '')}
        >
          <option value="">{t('filter.allStatuses')}</option>
          {ORDER_STATUSES.map((s) => (
            <option key={s} value={s}>
              {tm(`status.${s}`)}
            </option>
          ))}
        </Select>
        <Select
          className="h-10 w-full py-0 sm:w-36"
          value={type}
          onChange={(e) => setType(e.target.value as DeliveryType | '')}
        >
          <option value="">{t('filter.allTypes')}</option>
          {DELIVERY_TYPES.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </Select>
      </FilterBar>

      <PlanGate feature="sales_analytics">
        {isError ? (
          <Card>
            <ErrorState
              message={error instanceof Error ? error.message : tc('common.error')}
              onRetry={() => void refetch()}
              retryLabel={tc('btn.retry')}
            />
          </Card>
        ) : (
          <div className="space-y-5">
            <StatGrid>
              <StatCard
                label={t('kpi.orders')}
                value={f.num(kpi.orders)}
                hint={t('kpi.ordersHint')}
                icon={<Inbox className="h-5 w-5" />}
                loading={isLoading}
              />
              <StatCard
                label={t('kpi.revenue')}
                value={f.money(kpi.revenue)}
                hint={t('kpi.revenueHint')}
                icon={<TrendingUp className="h-5 w-5" />}
                tone="info"
                loading={isLoading}
              />
              <StatCard
                label={t('kpi.profit')}
                value={f.money(kpi.profit)}
                hint={t('kpi.profitHint')}
                icon={<Truck className="h-5 w-5" />}
                tone={kpi.profit < 0 ? 'danger' : 'brand'}
                loading={isLoading}
                footer={`${tc('common.margin')}: ${f.pct(kpi.marginPct)}`}
              />
              <StatCard
                label={t('kpi.avgCheck')}
                value={f.money(kpi.avgCheck)}
                hint={t('kpi.avgCheckHint')}
                icon={<CalendarRange className="h-5 w-5" />}
                tone="violet"
                loading={isLoading}
              />
            </StatGrid>

            <div className="grid gap-4 xl:grid-cols-3">
              <ChartCard
                className="xl:col-span-2"
                title={t('hourly.title')}
                subtitle={t('hourly.subtitle')}
                actions={
                  <Segmented
                    size="sm"
                    value={metric}
                    onChange={setMetric}
                    options={[
                      { value: 'orders', label: t('hourly.orders') },
                      { value: 'revenue', label: t('hourly.revenue') },
                    ]}
                  />
                }
              >
                {isLoading ? (
                  <Skeleton className="h-[280px] w-full" />
                ) : (
                  <>
                    <BarsChart
                      data={hourData}
                      xKey="hour"
                      height={280}
                      series={[
                        {
                          key: metric,
                          name: metric === 'orders' ? t('hourly.orders') : t('hourly.revenue'),
                          color: metric === 'orders' ? CHART_COLORS.brand : CHART_COLORS.info,
                          money: metric === 'revenue',
                        },
                      ]}
                    />
                    <div className="mt-3 flex items-center gap-2 rounded-xl border border-line bg-surface-2 px-3.5 py-2.5">
                      <Clock className="h-4 w-4 shrink-0 text-brand" />
                      <p className="text-sm text-ink-soft">
                        {peak
                          ? metric === 'orders'
                            ? t('hourly.peakOrders', { hour: `${peak.hour}:00`, value: f.num(peak.orders) })
                            : t('hourly.peakRevenue', { hour: `${peak.hour}:00`, value: f.money(peak.revenue) })
                          : t('hourly.empty')}
                      </p>
                    </div>
                  </>
                )}
              </ChartCard>

              <ChartCard
                title={t('delivery.title')}
                subtitle={t('delivery.subtitle')}
                legend={deliveryData.map((d) => ({
                  name: d.name,
                  color: d.color,
                  value: f.num(d.value),
                }))}
              >
                {isLoading ? (
                  <Skeleton className="h-[260px] w-full" />
                ) : deliveryData.length ? (
                  <DonutChart
                    data={deliveryData}
                    money={false}
                    center={
                      <div>
                        <p className="tnum font-display text-2xl font-extrabold text-ink">{f.num(deliveryTotal)}</p>
                        <p className="text-xs text-muted">{t('delivery.total')}</p>
                      </div>
                    }
                  />
                ) : (
                  <EmptyState icon={<Truck className="h-6 w-6" />} title={tc('common.noData')} />
                )}
              </ChartCard>
            </div>

            <div className="grid gap-4 xl:grid-cols-3">
              <ChartCard className="xl:col-span-2" title={t('city.title')} subtitle={t('city.subtitle')}>
                {isLoading ? (
                  <Skeleton className="h-[320px] w-full" />
                ) : cityData.length ? (
                  <BarsChart
                    data={cityData}
                    xKey="city"
                    horizontal
                    height={320}
                    series={[{ key: 'revenue', name: t('city.revenue'), color: CHART_COLORS.brand, money: true }]}
                  />
                ) : (
                  <EmptyState icon={<MapPin className="h-6 w-6" />} title={tc('common.noData')} />
                )}
              </ChartCard>

              <ChartCard title={t('weekday.title')} subtitle={t('weekday.subtitle')}>
                {isLoading ? (
                  <Skeleton className="h-[320px] w-full" />
                ) : (
                  <BarsChart
                    data={weekdayData}
                    xKey="day"
                    height={320}
                    series={[{ key: 'orders', name: t('weekday.orders'), color: CHART_COLORS.violet }]}
                  />
                )}
              </ChartCard>
            </div>

            <Card>
              <CardHeader
                title={t('table.title')}
                subtitle={t('table.hint')}
                actions={<Badge tone="muted">{f.num(data?.orders.total ?? 0)}</Badge>}
              />
              <div className="mt-4">
                <DataTable
                  columns={columns}
                  rows={items}
                  rowKey={(row) => row.id}
                  loading={isLoading}
                  onRowClick={setSelected}
                  density="compact"
                  empty={
                    <EmptyState
                      icon={<Inbox className="h-6 w-6" />}
                      title={t('table.empty')}
                      hint={t('table.emptyHint')}
                    />
                  }
                  pagination={{
                    page: data?.orders.page ?? 1,
                    pages: data?.orders.pages ?? 1,
                    total: data?.orders.total ?? 0,
                    pageSize: PAGE_SIZE,
                    onPage: setPage,
                  }}
                />
              </div>
            </Card>
          </div>
        )}
      </PlanGate>

      <OrderDrawer order={selected} onClose={() => setSelected(null)} />
    </>
  );
}
