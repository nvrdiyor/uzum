import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Boxes, Download, Layers, PackageSearch, Tag, Wallet } from 'lucide-react';
import type { StockRow, StocksResponse } from '@savdoiq/shared';
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
  SearchInput,
  Segmented,
  SkeletonRows,
  StatCard,
  StatGrid,
  toast,
  type Column,
} from '@/components/ui';
import { ZeroAware } from '@/components/ui/ZeroAware';
import { BarsChart, CHART_COLORS, DonutChart } from '@/components/charts';
import { FilterBar } from '@/components/filters';
import { api } from '@/lib/api';
import { downloadBlob } from '@/lib/utils';
import { usePeriodQuery } from '@/store/ui';
import { registerNamespace, useFormat, useT } from '@/i18n';
import { DaysLeftCell, STOCK_STATES, StockStatusBadge, type StockState } from '@/components/stock/common';
import { StockHistoryDrawer } from '@/components/stock/StockHistoryDrawer';

registerNamespace('stocks', {
  uz: {
    title: 'Qoldiqlar',
    subtitle: 'FBO, FBS va o‘z omboringizdagi qoldiqlar hamda ular necha kunga yetishi',
    'kpi.units': 'Jami dona',
    'kpi.unitsHint': 'Barcha omborlardagi qoldiq',
    'kpi.cost': 'Tannarx bo‘yicha qiymat',
    'kpi.costHint': 'Omborda muzlagan kapital',
    'kpi.retail': 'Chakana qiymat',
    'kpi.retailHint': 'Joriy narxlarda potentsial tushum',
    'kpi.skus': 'SKU soni',
    'kpi.skusHint': 'Qoldiqli pozitsiyalar',
    'filter.all': 'Barchasi',
    'search.placeholder': 'Nomi yoki SKU bo‘yicha qidirish',
    'chart.byStatus': 'Holat bo‘yicha taqsimot',
    'chart.byStatusHint': 'Qoldiq donalari holatlar kesimida',
    'chart.topCost': 'Qiymat bo‘yicha eng katta 10 SKU',
    'chart.topCostHint': 'Omborda eng ko‘p pul turgan pozitsiyalar',
    'table.title': 'Qoldiqlar jadvali',
    'table.hint': 'Batafsil ko‘rish uchun qatorga bosing',
    'col.product': 'Mahsulot',
    'col.store': 'Do‘kon',
    'col.fbo': 'FBO',
    'col.fbs': 'FBS',
    'col.own': 'O‘z ombori',
    'col.reserved': 'Band',
    'col.inTransit': 'Yo‘lda',
    'col.total': 'Jami',
    'col.costValue': 'Tannarx qiymati',
    'col.avgDaily': 'Kunlik sotuv',
    'col.daysLeft': 'Yetadi',
    'col.status': 'Holat',
    'empty.title': 'Qoldiqlar topilmadi',
    'empty.hint': 'Tanlangan filtr bo‘yicha pozitsiya yo‘q — filtrni o‘zgartirib ko‘ring',
    'export.done': 'Excel fayl tayyor',
    'export.error': 'Eksport qilishda xatolik',
  },
  ru: {
    title: 'Остатки',
    subtitle: 'Остатки на FBO, FBS и своём складе и на сколько дней их хватит',
    'kpi.units': 'Всего штук',
    'kpi.unitsHint': 'Остаток по всем складам',
    'kpi.cost': 'Стоимость по себестоимости',
    'kpi.costHint': 'Замороженный на складе капитал',
    'kpi.retail': 'Розничная стоимость',
    'kpi.retailHint': 'Потенциальная выручка по текущим ценам',
    'kpi.skus': 'Количество SKU',
    'kpi.skusHint': 'Позиции с остатком',
    'filter.all': 'Все',
    'search.placeholder': 'Поиск по названию или SKU',
    'chart.byStatus': 'Распределение по статусам',
    'chart.byStatusHint': 'Штуки остатка в разрезе статусов',
    'chart.topCost': 'Топ-10 SKU по стоимости',
    'chart.topCostHint': 'Позиции, в которых заморожено больше всего денег',
    'table.title': 'Таблица остатков',
    'table.hint': 'Нажмите на строку, чтобы увидеть детали',
    'col.product': 'Товар',
    'col.store': 'Магазин',
    'col.fbo': 'FBO',
    'col.fbs': 'FBS',
    'col.own': 'Свой склад',
    'col.reserved': 'Резерв',
    'col.inTransit': 'В пути',
    'col.total': 'Всего',
    'col.costValue': 'Себестоимость',
    'col.avgDaily': 'Продаж в день',
    'col.daysLeft': 'Хватит на',
    'col.status': 'Статус',
    'empty.title': 'Остатки не найдены',
    'empty.hint': 'По выбранному фильтру позиций нет — попробуйте изменить фильтр',
    'export.done': 'Файл Excel готов',
    'export.error': 'Ошибка при экспорте',
  },
  en: {
    title: 'Stock levels',
    subtitle: 'Stock across FBO, FBS and your own warehouse, and how long it lasts',
    'kpi.units': 'Total units',
    'kpi.unitsHint': 'Stock across all warehouses',
    'kpi.cost': 'Cost value',
    'kpi.costHint': 'Capital frozen in the warehouse',
    'kpi.retail': 'Retail value',
    'kpi.retailHint': 'Potential revenue at current prices',
    'kpi.skus': 'SKU count',
    'kpi.skusHint': 'Positions with stock',
    'filter.all': 'All',
    'search.placeholder': 'Search by name or SKU',
    'chart.byStatus': 'Distribution by status',
    'chart.byStatusHint': 'Stock units grouped by status',
    'chart.topCost': 'Top 10 SKUs by value',
    'chart.topCostHint': 'Positions holding the most money',
    'table.title': 'Stock table',
    'table.hint': 'Click a row to see the details',
    'col.product': 'Product',
    'col.store': 'Store',
    'col.fbo': 'FBO',
    'col.fbs': 'FBS',
    'col.own': 'Own',
    'col.reserved': 'Reserved',
    'col.inTransit': 'In transit',
    'col.total': 'Total',
    'col.costValue': 'Cost value',
    'col.avgDaily': 'Daily sales',
    'col.daysLeft': 'Cover',
    'col.status': 'Status',
    'empty.title': 'No stock found',
    'empty.hint': 'Nothing matches the current filter — try changing it',
    'export.done': 'Excel file is ready',
    'export.error': 'Export failed',
  },
});

type StatusFilter = 'all' | StockState;

const PAGE_SIZE = 25;

const STATE_COLOR: Record<StockState, string> = {
  critical: CHART_COLORS.danger,
  low: CHART_COLORS.warn,
  ok: CHART_COLORS.brand,
  excess: CHART_COLORS.info,
  dead: CHART_COLORS.slate,
};

export default function Stocks() {
  const t = useT('stocks');
  const tc = useT('common');
  const f = useFormat();
  const q = usePeriodQuery();

  const [status, setStatus] = useState<StatusFilter>('all');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [active, setActive] = useState<StockRow | null>(null);
  const [exporting, setExporting] = useState(false);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['stocks', q],
    queryFn: () => api.get<StocksResponse>('/stocks', { ...q, page: 1, pageSize: 500 }),
  });

  const allRows = useMemo<StockRow[]>(() => data?.rows?.items ?? [], [data]);

  const searched = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return allRows;
    return allRows.filter((r) => r.title.toLowerCase().includes(s) || r.sku.toLowerCase().includes(s));
  }, [allRows, search]);

  const counts = useMemo(() => {
    const map: Record<StatusFilter, number> = { all: searched.length, critical: 0, low: 0, ok: 0, excess: 0, dead: 0 };
    searched.forEach((r) => {
      map[r.status] += 1;
    });
    return map;
  }, [searched]);

  const filtered = useMemo(
    () => (status === 'all' ? searched : searched.filter((r) => r.status === status)),
    [searched, status],
  );

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pages);
  const pageRows = useMemo(
    () => filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE),
    [filtered, safePage],
  );

  const donut = useMemo(
    () =>
      STOCK_STATES.map((s) => ({
        name: tc(`status.${s}`),
        value: searched.filter((r) => r.status === s).reduce((sum, r) => sum + r.total, 0),
        color: STATE_COLOR[s],
      })).filter((d) => d.value > 0),
    [searched, tc],
  );

  const topCost = useMemo(
    () =>
      [...searched]
        .sort((a, b) => b.costValue - a.costValue)
        .slice(0, 10)
        .map((r) => ({ name: r.title.length > 22 ? `${r.title.slice(0, 21)}…` : r.title, value: r.costValue })),
    [searched],
  );

  const visibleTotals = useMemo(
    () =>
      filtered.reduce(
        (acc, r) => {
          acc.total += r.total;
          acc.costValue += r.costValue;
          return acc;
        },
        { total: 0, costValue: 0 },
      ),
    [filtered],
  );

  const totals = data?.totals;

  async function handleExport() {
    setExporting(true);
    try {
      const blob = await api.blob('/export/stocks', { ...q, status: status === 'all' ? undefined : status });
      downloadBlob(blob, `stocks-${q.from}-${q.to}.xlsx`);
      toast.success(t('export.done'));
    } catch {
      toast.error(t('export.error'));
    } finally {
      setExporting(false);
    }
  }

  const columns: Column<StockRow>[] = [
    {
      key: 'product',
      header: t('col.product'),
      width: 280,
      render: (r) => <ProductCell title={r.title} subtitle={r.sku} imageUrl={r.imageUrl} />,
      sortable: true,
      sortValue: (r) => r.title,
    },
    {
      key: 'store',
      header: t('col.store'),
      hideOnMobile: true,
      render: (r) => <span className="truncate text-sm text-muted">{r.storeTitle}</span>,
      sortValue: (r) => r.storeTitle,
    },
    {
      key: 'fbo',
      header: t('col.fbo'),
      align: 'right',
      hideOnMobile: true,
      sortable: true,
      sortValue: (r) => r.fbo,
      render: (r) => f.num(r.fbo),
    },
    {
      key: 'fbs',
      header: t('col.fbs'),
      align: 'right',
      hideOnMobile: true,
      sortable: true,
      sortValue: (r) => r.fbs,
      render: (r) => f.num(r.fbs),
    },
    {
      key: 'own',
      header: t('col.own'),
      align: 'right',
      hideOnMobile: true,
      sortable: true,
      sortValue: (r) => r.own,
      render: (r) => f.num(r.own),
    },
    {
      key: 'reserved',
      header: t('col.reserved'),
      align: 'right',
      hideOnMobile: true,
      sortValue: (r) => r.reserved,
      render: (r) => <span className="text-muted">{f.num(r.reserved)}</span>,
    },
    {
      key: 'inTransit',
      header: t('col.inTransit'),
      align: 'right',
      hideOnMobile: true,
      sortValue: (r) => r.inTransit,
      render: (r) => <ZeroAware value={r.inTransit} tone="text-info" text={f.num(r.inTransit)} />,
    },
    {
      key: 'total',
      header: t('col.total'),
      align: 'right',
      sortable: true,
      sortValue: (r) => r.total,
      render: (r) => <span className="font-semibold text-ink">{f.num(r.total)}</span>,
    },
    {
      key: 'costValue',
      header: t('col.costValue'),
      align: 'right',
      hideOnMobile: true,
      sortable: true,
      sortValue: (r) => r.costValue,
      render: (r) => f.money(r.costValue),
    },
    {
      key: 'avgDaily',
      header: t('col.avgDaily'),
      align: 'right',
      hideOnMobile: true,
      sortable: true,
      sortValue: (r) => r.avgDaily,
      render: (r) => f.num(r.avgDaily, 1),
    },
    {
      key: 'daysLeft',
      header: t('col.daysLeft'),
      align: 'right',
      width: 150,
      sortable: true,
      sortValue: (r) => (r.daysLeft === null ? Number.MAX_SAFE_INTEGER : r.daysLeft),
      render: (r) => <DaysLeftCell days={r.daysLeft} />,
    },
    {
      key: 'status',
      header: t('col.status'),
      align: 'center',
      sortValue: (r) => r.status,
      render: (r) => <StockStatusBadge status={r.status} />,
    },
  ];

  return (
    <>
      <PageHeader
        icon={<Layers className="h-5 w-5" />}
        title={t('title')}
        description={t('subtitle')}
        badge={<PreviewBadge feature="stocks_fbo_fbs" />}
        actions={
          <Button variant="outline" icon={<Download className="h-4 w-4" />} loading={exporting} onClick={handleExport}>
            {tc('btn.export')}
          </Button>
        }
      />

      <FilterBar />

      <PlanGate feature="stocks_fbo_fbs">
        <div className="space-y-5">
          <StatGrid>
            <StatCard
              label={t('kpi.units')}
              value={isLoading ? '—' : f.num(totals?.units ?? 0)}
              hint={t('kpi.unitsHint')}
              icon={<Boxes className="h-5 w-5" />}
              tone="brand"
              loading={isLoading}
            />
            <StatCard
              label={t('kpi.cost')}
              value={isLoading ? '—' : f.money(totals?.costValue ?? 0)}
              hint={t('kpi.costHint')}
              icon={<Wallet className="h-5 w-5" />}
              tone="violet"
              loading={isLoading}
            />
            <StatCard
              label={t('kpi.retail')}
              value={isLoading ? '—' : f.money(totals?.retailValue ?? 0)}
              hint={t('kpi.retailHint')}
              icon={<Tag className="h-5 w-5" />}
              tone="info"
              loading={isLoading}
            />
            <StatCard
              label={t('kpi.skus')}
              value={isLoading ? '—' : f.num(totals?.skuCount ?? 0)}
              hint={t('kpi.skusHint')}
              icon={<PackageSearch className="h-5 w-5" />}
              tone="warn"
              loading={isLoading}
            />
          </StatGrid>

          {isError ? (
            <Card>
              <ErrorState
                message={error instanceof Error ? error.message : undefined}
                onRetry={() => void refetch()}
                retryLabel={tc('btn.retry')}
              />
            </Card>
          ) : (
            <>
              <div className="grid gap-4 xl:grid-cols-2">
                <Card>
                  <CardHeader title={t('chart.byStatus')} subtitle={t('chart.byStatusHint')} />
                  <CardBody>
                    {isLoading ? (
                      <SkeletonRows rows={5} />
                    ) : donut.length === 0 ? (
                      <EmptyState icon={<Boxes className="h-6 w-6" />} title={tc('common.noData')} />
                    ) : (
                      <DonutChart
                        data={donut}
                        money={false}
                        height={260}
                        center={
                          <div>
                            <p className="text-xs text-muted">{tc('common.units')}</p>
                            <p className="tnum font-display text-xl font-extrabold text-ink">
                              {f.compact(donut.reduce((s, d) => s + d.value, 0))}
                            </p>
                          </div>
                        }
                      />
                    )}
                  </CardBody>
                </Card>

                <Card>
                  <CardHeader title={t('chart.topCost')} subtitle={t('chart.topCostHint')} />
                  <CardBody>
                    {isLoading ? (
                      <SkeletonRows rows={5} />
                    ) : topCost.length === 0 ? (
                      <EmptyState icon={<Wallet className="h-6 w-6" />} title={tc('common.noData')} />
                    ) : (
                      <BarsChart
                        data={topCost}
                        xKey="name"
                        horizontal
                        height={280}
                        series={[{ key: 'value', name: t('col.costValue'), money: true, color: CHART_COLORS.violet }]}
                      />
                    )}
                  </CardBody>
                </Card>
              </div>

              <Card>
                <CardHeader
                  title={t('table.title')}
                  subtitle={t('table.hint')}
                  actions={
                    <SearchInput
                      value={search}
                      onChange={(v) => {
                        setSearch(v);
                        setPage(1);
                      }}
                      placeholder={t('search.placeholder')}
                      className="w-full sm:w-72"
                    />
                  }
                />

                <div className="px-5 pt-4">
                  <div className="overflow-x-auto pb-1">
                    <Segmented<StatusFilter>
                      value={status}
                      onChange={(v) => {
                        setStatus(v);
                        setPage(1);
                      }}
                      size="sm"
                      options={[
                        { value: 'all', label: t('filter.all'), count: counts.all },
                        ...STOCK_STATES.map((s) => ({
                          value: s as StatusFilter,
                          label: tc(`status.${s}`),
                          count: counts[s],
                        })),
                      ]}
                    />
                  </div>
                </div>

                <div className="mt-3">
                  <DataTable<StockRow>
                    columns={columns}
                    rows={pageRows}
                    rowKey={(r) => r.skuId}
                    loading={isLoading}
                    onRowClick={(r) => setActive(r)}
                    stickyFirstColumn
                    empty={
                      <EmptyState
                        icon={<PackageSearch className="h-6 w-6" />}
                        title={t('empty.title')}
                        hint={t('empty.hint')}
                      />
                    }
                    pagination={{
                      page: safePage,
                      pages,
                      total: filtered.length,
                      pageSize: PAGE_SIZE,
                      onPage: setPage,
                    }}
                    footer={
                      <>
                        <td className="px-4 py-3 text-sm">{tc('common.total')}</td>
                        <td className="hidden px-4 py-3 md:table-cell" />
                        <td className="hidden px-4 py-3 md:table-cell" />
                        <td className="hidden px-4 py-3 md:table-cell" />
                        <td className="hidden px-4 py-3 md:table-cell" />
                        <td className="hidden px-4 py-3 md:table-cell" />
                        <td className="hidden px-4 py-3 md:table-cell" />
                        <td className="tnum px-4 py-3 text-right">{f.num(visibleTotals.total)}</td>
                        <td className="tnum hidden px-4 py-3 text-right md:table-cell">
                          {f.money(visibleTotals.costValue)}
                        </td>
                        <td className="hidden px-4 py-3 md:table-cell" />
                        <td className="px-4 py-3" />
                        <td className="px-4 py-3" />
                      </>
                    }
                  />
                </div>
              </Card>
            </>
          )}
        </div>
      </PlanGate>

      <StockHistoryDrawer row={active} onClose={() => setActive(null)} />
    </>
  );
}
