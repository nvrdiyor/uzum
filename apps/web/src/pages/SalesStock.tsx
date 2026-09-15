import { useEffect, useMemo, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Boxes, CalendarClock, Coins, Download, Inbox, PackageCheck, ShoppingCart, Wallet } from 'lucide-react';
import type { SalesStockResponse, SalesStockRow } from '@savdoiq/shared';
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
  Skeleton,
  StatCard,
  toast,
  type Column,
} from '@/components/ui';
import { ChartCard, DonutChart } from '@/components/charts';
import { FilterBar } from '@/components/filters';
import { StockStatusBadge } from '@/components/sales/StockStatusBadge';
import { useDebounced } from '@/components/sales/useDebounced';
import { registerNamespace, useFormat, useT } from '@/i18n';
import { api } from '@/lib/api';
import { CHART_COLORS, STATUS_TONE, type StatusTone } from '@/lib/theme';
import { cn, downloadBlob } from '@/lib/utils';
import { usePeriodQuery } from '@/store/ui';

registerNamespace('salesStock', {
  uz: {
    title: 'Sotuv va qoldiq',
    subtitle: 'Har bir SKU bo‘yicha sotuv sur’ati va qoldiq nechaga yetishi',
    'kpi.sold': 'Sotildi',
    'kpi.soldHint': '{count} ta SKU bo‘yicha',
    'kpi.stock': 'Omborda',
    'kpi.stockHint': 'FBO + FBS + o‘z ombori',
    'kpi.revenue': 'Tushum',
    'kpi.payout': 'To‘lovga',
    'kpi.profit': 'Sof foyda',
    'unit': 'dona',
    'seg.all': 'Barchasi',
    'seg.critical': 'Kritik',
    'seg.low': 'Tugayapti',
    'seg.excess': 'Ortiqcha',
    'seg.dead': 'Harakatsiz',
    'chart.title': 'Qoldiq holati',
    'chart.subtitle': 'Joriy sahifadagi SKU’lar taqsimoti',
    'chart.total': 'SKU',
    'table.title': 'SKU bo‘yicha kesim',
    'table.hint': 'Summalar so‘mda. “Yetadi” ustuni joriy sotuv sur’atiga asoslangan',
    'table.empty': 'Mos SKU topilmadi',
    'table.emptyHint': 'Filtrni o‘zgartiring yoki boshqa davrni tanlang',
    'col.product': 'Mahsulot',
    'col.store': 'Do‘kon',
    'col.sold': 'Sotildi',
    'col.stock': 'Omborda',
    'col.revenue': 'Tushum',
    'col.payout': 'To‘lovga',
    'col.netProfit': 'Sof foyda',
    'col.avgDaily': 'Kunlik o‘rtacha',
    'col.daysLeft': 'Yetadi',
    'col.monthPotential': 'Oylik potentsial',
    'col.status': 'Holat',
    'days': 'kun',
    'noSales': 'Sotuv yo‘q',
    'filter.search': 'Nomi yoki SKU bo‘yicha qidirish',
    'export.ok': 'Excel fayl yuklab olindi',
    'export.fail': 'Eksport qilishda xatolik',
  },
  ru: {
    title: 'Продажи и остатки',
    subtitle: 'Скорость продаж по каждому SKU и на сколько хватит остатка',
    'kpi.sold': 'Продано',
    'kpi.soldHint': 'По {count} SKU',
    'kpi.stock': 'На складе',
    'kpi.stockHint': 'FBO + FBS + свой склад',
    'kpi.revenue': 'Выручка',
    'kpi.payout': 'К выплате',
    'kpi.profit': 'Чистая прибыль',
    'unit': 'шт',
    'seg.all': 'Все',
    'seg.critical': 'Критично',
    'seg.low': 'Заканчивается',
    'seg.excess': 'Избыток',
    'seg.dead': 'Неликвид',
    'chart.title': 'Состояние остатков',
    'chart.subtitle': 'Распределение SKU текущей страницы',
    'chart.total': 'SKU',
    'table.title': 'Разрез по SKU',
    'table.hint': 'Суммы в сумах. Колонка «Хватит» рассчитана по текущей скорости продаж',
    'table.empty': 'Подходящих SKU нет',
    'table.emptyHint': 'Измените фильтр или выберите другой период',
    'col.product': 'Товар',
    'col.store': 'Магазин',
    'col.sold': 'Продано',
    'col.stock': 'На складе',
    'col.revenue': 'Выручка',
    'col.payout': 'К выплате',
    'col.netProfit': 'Чистая прибыль',
    'col.avgDaily': 'В день',
    'col.daysLeft': 'Хватит',
    'col.monthPotential': 'Потенциал/мес',
    'col.status': 'Статус',
    'days': 'дн.',
    'noSales': 'Нет продаж',
    'filter.search': 'Поиск по названию или SKU',
    'export.ok': 'Excel-файл скачан',
    'export.fail': 'Ошибка при экспорте',
  },
  en: {
    title: 'Sales & stock',
    subtitle: 'Sales velocity per SKU and how long the stock will last',
    'kpi.sold': 'Sold',
    'kpi.soldHint': 'Across {count} SKUs',
    'kpi.stock': 'In stock',
    'kpi.stockHint': 'FBO + FBS + own warehouse',
    'kpi.revenue': 'Revenue',
    'kpi.payout': 'Payout',
    'kpi.profit': 'Net profit',
    'unit': 'pcs',
    'seg.all': 'All',
    'seg.critical': 'Critical',
    'seg.low': 'Low',
    'seg.excess': 'Excess',
    'seg.dead': 'Dead stock',
    'chart.title': 'Stock health',
    'chart.subtitle': 'SKU split on the current page',
    'chart.total': 'SKUs',
    'table.title': 'SKU breakdown',
    'table.hint': 'Amounts in UZS. “Lasts” is based on the current sales velocity',
    'table.empty': 'No matching SKUs',
    'table.emptyHint': 'Change the filter or pick another period',
    'col.product': 'Product',
    'col.store': 'Store',
    'col.sold': 'Sold',
    'col.stock': 'In stock',
    'col.revenue': 'Revenue',
    'col.payout': 'Payout',
    'col.netProfit': 'Net profit',
    'col.avgDaily': 'Per day',
    'col.daysLeft': 'Lasts',
    'col.monthPotential': 'Monthly potential',
    'col.status': 'Status',
    'days': 'days',
    'noSales': 'No sales',
    'filter.search': 'Search by name or SKU',
    'export.ok': 'Excel file downloaded',
    'export.fail': 'Export failed',
  },
});

const PAGE_SIZE = 50;
type Segment = 'all' | 'critical' | 'low' | 'excess' | 'dead';
const SEGMENTS: Segment[] = ['all', 'critical', 'low', 'excess', 'dead'];

const STATUS_COLOR: Record<StatusTone, string> = {
  critical: CHART_COLORS.danger,
  low: CHART_COLORS.warn,
  ok: CHART_COLORS.brand,
  excess: CHART_COLORS.info,
  dead: CHART_COLORS.slate,
};

/** Qoldiq necha kunga yetishiga qarab rang */
function daysTone(days: number | null): string {
  if (days === null) return 'text-muted';
  if (days <= 7) return 'text-danger';
  if (days <= 14) return 'text-warn-ink';
  return 'text-brand-ink';
}

export default function SalesStock() {
  const t = useT('salesStock');
  const tc = useT('common');
  const f = useFormat();
  const q = usePeriodQuery();

  const [page, setPage] = useState(1);
  const [segment, setSegment] = useState<Segment>('all');
  const [searchInput, setSearchInput] = useState('');
  const search = useDebounced(searchInput);
  const [exporting, setExporting] = useState(false);

  /**
   * Holat filtri SERVERGA yuboriladi. Ilgari u faqat joriy 50 qatorga
   * qo'llanardi: "Kritik" tanlangan sahifada kritik SKU bo'lmasa jadval
   * bo'shab qolardi VA sahifalash tugmalari ham yo'qolardi — foydalanuvchi
   * keyingi sahifadagi kritik tovarlarga umuman o'ta olmasdi.
   */
  const query = {
    ...q,
    page,
    pageSize: PAGE_SIZE,
    search: search || undefined,
    status: segment === 'all' ? undefined : segment,
  };

  useEffect(() => {
    setPage(1);
  }, [search, segment, q.from, q.to, q.storeId]);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['sales-stock', query],
    queryFn: () => api.get<SalesStockResponse>('/stocks/sales-stock', query),
    placeholderData: keepPreviousData,
  });

  const rows = useMemo(() => data?.rows.items ?? [], [data]);
  const totals = data?.totals;

  const counts = useMemo(() => {
    const base: Record<Segment, number> = { all: rows.length, critical: 0, low: 0, excess: 0, dead: 0 };
    for (const row of rows) {
      if (row.status === 'critical' || row.status === 'low' || row.status === 'excess' || row.status === 'dead') {
        base[row.status] += 1;
      }
    }
    return base;
  }, [rows]);

  const filtered = useMemo(
    // Filtr server tomonida qo'llangan — bu yerda qayta filtrlash shart emas
    () => rows,
    [rows, segment],
  );

  const statusChart = useMemo(() => {
    const order: StatusTone[] = ['critical', 'low', 'ok', 'excess', 'dead'];
    const map = new Map<StatusTone, number>();
    for (const row of rows) map.set(row.status, (map.get(row.status) ?? 0) + 1);
    return order
      .filter((s) => (map.get(s) ?? 0) > 0)
      .map((s) => ({
        name: STATUS_TONE[s].label[f.lang] ?? STATUS_TONE[s].label.uz,
        value: map.get(s) ?? 0,
        color: STATUS_COLOR[s],
      }));
  }, [rows, f.lang]);

  async function onExport() {
    setExporting(true);
    try {
      const blob = await api.blob('/export/sales-stock', query);
      downloadBlob(blob, `sales-stock-${q.from}_${q.to}.xlsx`);
      toast.success(t('export.ok'));
    } catch {
      toast.error(t('export.fail'));
    } finally {
      setExporting(false);
    }
  }

  const columns = useMemo<Column<SalesStockRow>[]>(
    () => [
      {
        key: 'product',
        header: t('col.product'),
        width: 280,
        render: (row) => <ProductCell title={row.title} subtitle={row.sku} imageUrl={row.imageUrl} />,
        sortValue: (row) => row.title,
        sortable: true,
      },
      {
        key: 'store',
        header: t('col.store'),
        hideOnMobile: true,
        render: (row) => <span className="truncate text-xs text-muted">{row.storeTitle}</span>,
        sortValue: (row) => row.storeTitle,
        sortable: true,
      },
      {
        key: 'sold',
        header: t('col.sold'),
        align: 'right',
        render: (row) => <span className="font-medium text-ink">{f.num(row.sold)}</span>,
        sortValue: (row) => row.sold,
        sortable: true,
      },
      {
        key: 'stock',
        header: t('col.stock'),
        align: 'right',
        render: (row) => (
          <div className="leading-tight">
            <span className="tnum font-medium text-ink">{f.num(row.stockFbo + row.stockFbs + row.stockOwn)}</span>
            <p className="tnum text-2xs text-muted">
              FBO {f.num(row.stockFbo)} · FBS {f.num(row.stockFbs)}
            </p>
          </div>
        ),
        sortValue: (row) => row.stockFbo + row.stockFbs + row.stockOwn,
        sortable: true,
      },
      {
        key: 'revenue',
        header: t('col.revenue'),
        align: 'right',
        render: (row) => f.num(row.revenue),
        sortValue: (row) => row.revenue,
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
        key: 'avgDaily',
        header: t('col.avgDaily'),
        align: 'right',
        hideOnMobile: true,
        render: (row) => f.num(row.avgDaily, 1),
        sortValue: (row) => row.avgDaily,
        sortable: true,
      },
      {
        key: 'daysLeft',
        header: t('col.daysLeft'),
        align: 'right',
        render: (row) => (
          <span className={cn('font-semibold', daysTone(row.daysLeft))}>
            {row.daysLeft === null ? t('noSales') : `${f.num(row.daysLeft)} ${t('days')}`}
          </span>
        ),
        sortValue: (row) => row.daysLeft ?? Number.MAX_SAFE_INTEGER,
        sortable: true,
      },
      {
        key: 'monthPotential',
        header: t('col.monthPotential'),
        align: 'right',
        hideOnMobile: true,
        render: (row) => (
          <span>
            {f.num(row.monthPotential)} <span className="text-2xs text-muted">{t('unit')}</span>
          </span>
        ),
        sortValue: (row) => row.monthPotential,
        sortable: true,
      },
      {
        key: 'status',
        header: t('col.status'),
        align: 'center',
        render: (row) => <StockStatusBadge status={row.status} />,
        sortValue: (row) => row.status,
        sortable: true,
      },
    ],
    [t, f],
  );

  return (
    <>
      <PageHeader
        icon={<ShoppingCart className="h-5 w-5" />}
        title={t('title')}
        description={t('subtitle')}
        badge={<PreviewBadge feature="stocks_fbo_fbs" />}
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
          className="w-full sm:w-72"
        />
      </FilterBar>

      <PlanGate feature="stocks_fbo_fbs">
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
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
              <StatCard
                label={t('kpi.sold')}
                value={`${f.num(totals?.sold ?? 0)} ${t('unit')}`}
                hint={t('kpi.soldHint', { count: f.num(totals?.skuCount ?? 0) })}
                icon={<PackageCheck className="h-5 w-5" />}
                loading={isLoading}
              />
              <StatCard
                label={t('kpi.stock')}
                value={`${f.num(totals?.inStock ?? 0)} ${t('unit')}`}
                hint={t('kpi.stockHint')}
                icon={<Boxes className="h-5 w-5" />}
                tone="info"
                loading={isLoading}
              />
              <StatCard
                label={t('kpi.revenue')}
                value={f.money(totals?.revenue ?? 0)}
                icon={<Coins className="h-5 w-5" />}
                tone="violet"
                loading={isLoading}
              />
              <StatCard
                label={t('kpi.payout')}
                value={f.money(totals?.payout ?? 0)}
                icon={<Wallet className="h-5 w-5" />}
                tone="warn"
                loading={isLoading}
              />
              <StatCard
                label={t('kpi.profit')}
                value={f.money(totals?.netProfit ?? 0)}
                icon={<CalendarClock className="h-5 w-5" />}
                tone={(totals?.netProfit ?? 0) < 0 ? 'danger' : 'brand'}
                loading={isLoading}
              />
            </div>

            <div className="grid gap-4 xl:grid-cols-3">
              {/* Halqa ranglari nimani bildirishini ko'rsatib turadigan izoh —
                  ilgari faqat sichqoncha olib borilganda bilinardi */}
              <ChartCard
                title={t('chart.title')}
                subtitle={t('chart.subtitle')}
                legend={statusChart.map((d) => ({
                  name: d.name,
                  color: d.color ?? CHART_COLORS.brand,
                  value: f.num(d.value),
                }))}
              >
                {isLoading ? (
                  <Skeleton className="h-[260px] w-full" />
                ) : statusChart.length ? (
                  <DonutChart
                    data={statusChart}
                    money={false}
                    center={
                      <div>
                        <p className="tnum font-display text-2xl font-extrabold text-ink">{f.num(rows.length)}</p>
                        <p className="text-xs text-muted">{t('chart.total')}</p>
                      </div>
                    }
                  />
                ) : (
                  <EmptyState icon={<Inbox className="h-6 w-6" />} title={tc('common.noData')} />
                )}
              </ChartCard>

              <Card className="xl:col-span-2">
                <CardHeader
                  title={t('table.title')}
                  subtitle={t('table.hint')}
                  actions={<Badge tone="muted">{f.num(data?.rows.total ?? 0)}</Badge>}
                />
                <div className="px-5 pt-4">
                  <div className="overflow-x-auto pb-1">
                    <Segmented
                      value={segment}
                      onChange={setSegment}
                      size="sm"
                      options={SEGMENTS.map((s) => ({
                        value: s,
                        label: t(`seg.${s}`),
                        count: counts[s],
                      }))}
                    />
                  </div>
                </div>
                <div className="mt-3">
                  <DataTable
                    columns={columns}
                    rows={filtered}
                    rowKey={(row) => row.skuId}
                    loading={isLoading}
                    density="compact"
                    stickyFirstColumn
                    empty={
                      <EmptyState
                        icon={<Inbox className="h-6 w-6" />}
                        title={t('table.empty')}
                        hint={t('table.emptyHint')}
                      />
                    }
                    pagination={{
                      page: data?.rows.page ?? 1,
                      pages: data?.rows.pages ?? 1,
                      total: data?.rows.total ?? 0,
                      pageSize: PAGE_SIZE,
                      onPage: setPage,
                    }}
                  />
                </div>
              </Card>
            </div>
          </div>
        )}
      </PlanGate>
    </>
  );
}
