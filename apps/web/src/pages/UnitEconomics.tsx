import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  Calculator as CalculatorIcon,
  Coins,
  Download,
  Percent,
  Scale,
  Target,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import type { UnitEconomicsResponse, UnitEconomicsRow } from '@savdoiq/shared';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  DataTable,
  Divider,
  Drawer,
  EmptyState,
  ErrorState,
  PageHeader,
  PlanGate,
  PreviewBadge,
  ProductCell,
  SearchInput,
  Segmented,
  StatCard,
  StatGrid,
  toast,
  type Column,
} from '@/components/ui';
import { FilterBar } from '@/components/filters';
import { CostSplitBar } from '@/components/unit/CostSplitBar';
import { PART_COLOR, PART_ORDER, rowParts, type PartKey } from '@/components/unit/types';
import { api } from '@/lib/api';
import { usePeriodQuery } from '@/store/ui';
import { registerNamespace, useFormat, useT } from '@/i18n';
import { cn, downloadBlob } from '@/lib/utils';

registerNamespace('unitEconomics', {
  uz: {
    title: 'Unit-iqtisod',
    subtitle: 'Har bir mahsulotning bitta donasidan qancha foyda qolishini ko‘ring',
    'kpi.revenue': 'Tushum',
    'kpi.revenueHint': 'Tanlangan davrdagi sotuv summasi',
    'kpi.profit': 'Sof foyda',
    'kpi.profitHint': 'Barcha xarajatlar ayirilgandan keyin',
    'kpi.margin': 'O‘rtacha marja',
    'kpi.marginHint': 'Sof foyda / tushum',
    'kpi.roi': 'O‘rtacha ROI',
    'kpi.roiHint': 'Sof foyda / tannarxga sarflangan mablag‘',
    'alert.title': '{n} ta mahsulot zarar keltirmoqda',
    'alert.body': 'Ularning sotuv narxi barcha xarajatlarni qoplamayapti — narx yoki tannarxni qayta ko‘rib chiqing.',
    'alert.action': 'Faqat zararlilarni ko‘rsatish',
    'filter.all': 'Barchasi',
    'filter.loss': 'Zararli',
    'filter.profit': 'Foydali',
    'search.placeholder': 'Nomi yoki SKU bo‘yicha qidirish',
    'col.product': 'Mahsulot',
    'col.price': 'Narx',
    'col.cost': 'Tannarx',
    'col.commission': 'Komissiya',
    'col.logistics': 'Logistika',
    'col.storage': 'Ombor',
    'col.tax': 'Soliq',
    'col.profit': 'Foyda (1 dona)',
    'col.margin': 'Marja',
    'col.roi': 'ROI',
    'col.breakEven': 'Nol foyda narxi',
    'col.sold': 'Sotildi',
    'col.total': 'Umumiy foyda',
    'badge.loss': 'zarar',
    'empty.title': 'Ma’lumot topilmadi',
    'empty.hint': 'Davrni o‘zgartiring yoki qidiruvni tozalang',
    'empty.loss': 'Zararli mahsulot yo‘q',
    'empty.lossHint': 'Barcha mahsulotlar ijobiy foyda bilan sotilmoqda',
    'export.done': 'Excel fayl tayyor',
    'export.error': 'Eksport qilib bo‘lmadi',
    'rows.count': '{n} ta SKU',
    'drawer.title': '1 dona qayerga ketadi',
    'drawer.hint': 'Sotuv narxining har bir qismi qanday taqsimlanadi',
    'drawer.open': 'Kalkulyatorda ochish',
    'drawer.price': 'Sotuv narxi',
    'drawer.breakEven': 'Nol foyda narxi',
    'drawer.breakEvenHint': 'Shu narxdan pastda sotish zarar keltiradi',
    'drawer.margin': 'Marja',
    'drawer.roi': 'ROI',
    'drawer.sold': 'Sotilgan dona',
    'drawer.total': 'Umumiy foyda',
    'drawer.loss': 'Bu mahsulot zarar keltirmoqda',
    'part.cogs': 'Tannarx',
    'part.commission': 'Komissiya',
    'part.logistics': 'Logistika',
    'part.storage': 'Ombor',
    'part.other': 'Boshqa xarajat',
    'part.tax': 'Soliq',
    'part.profit': 'Sof foyda',
  },
  ru: {
    title: 'Юнит-экономика',
    subtitle: 'Смотрите, сколько прибыли остаётся с одной единицы товара',
    'kpi.revenue': 'Выручка',
    'kpi.revenueHint': 'Сумма продаж за выбранный период',
    'kpi.profit': 'Чистая прибыль',
    'kpi.profitHint': 'После вычета всех расходов',
    'kpi.margin': 'Средняя маржа',
    'kpi.marginHint': 'Чистая прибыль / выручка',
    'kpi.roi': 'Средний ROI',
    'kpi.roiHint': 'Чистая прибыль / вложения в себестоимость',
    'alert.title': '{n} товаров приносят убыток',
    'alert.body': 'Цена продажи не покрывает все расходы — пересмотрите цену или себестоимость.',
    'alert.action': 'Показать только убыточные',
    'filter.all': 'Все',
    'filter.loss': 'Убыточные',
    'filter.profit': 'Прибыльные',
    'search.placeholder': 'Поиск по названию или SKU',
    'col.product': 'Товар',
    'col.price': 'Цена',
    'col.cost': 'Себестоимость',
    'col.commission': 'Комиссия',
    'col.logistics': 'Логистика',
    'col.storage': 'Хранение',
    'col.tax': 'Налог',
    'col.profit': 'Прибыль (1 шт.)',
    'col.margin': 'Маржа',
    'col.roi': 'ROI',
    'col.breakEven': 'Точка безубыточности',
    'col.sold': 'Продано',
    'col.total': 'Общая прибыль',
    'badge.loss': 'убыток',
    'empty.title': 'Данные не найдены',
    'empty.hint': 'Измените период или очистите поиск',
    'empty.loss': 'Убыточных товаров нет',
    'empty.lossHint': 'Все товары продаются с положительной прибылью',
    'export.done': 'Excel-файл готов',
    'export.error': 'Не удалось выгрузить',
    'rows.count': '{n} SKU',
    'drawer.title': 'Куда уходит одна единица',
    'drawer.hint': 'Как распределяется каждая часть цены продажи',
    'drawer.open': 'Открыть в калькуляторе',
    'drawer.price': 'Цена продажи',
    'drawer.breakEven': 'Точка безубыточности',
    'drawer.breakEvenHint': 'Ниже этой цены продажа приносит убыток',
    'drawer.margin': 'Маржа',
    'drawer.roi': 'ROI',
    'drawer.sold': 'Продано штук',
    'drawer.total': 'Общая прибыль',
    'drawer.loss': 'Этот товар приносит убыток',
    'part.cogs': 'Себестоимость',
    'part.commission': 'Комиссия',
    'part.logistics': 'Логистика',
    'part.storage': 'Хранение',
    'part.other': 'Прочие расходы',
    'part.tax': 'Налог',
    'part.profit': 'Чистая прибыль',
  },
  en: {
    title: 'Unit economics',
    subtitle: 'See how much profit is left from a single unit of every product',
    'kpi.revenue': 'Revenue',
    'kpi.revenueHint': 'Sales amount for the selected period',
    'kpi.profit': 'Net profit',
    'kpi.profitHint': 'After all costs are deducted',
    'kpi.margin': 'Average margin',
    'kpi.marginHint': 'Net profit / revenue',
    'kpi.roi': 'Average ROI',
    'kpi.roiHint': 'Net profit / money invested in cost price',
    'alert.title': '{n} products are losing money',
    'alert.body': 'Their selling price does not cover all costs — review the price or the cost price.',
    'alert.action': 'Show loss-making only',
    'filter.all': 'All',
    'filter.loss': 'Loss-making',
    'filter.profit': 'Profitable',
    'search.placeholder': 'Search by name or SKU',
    'col.product': 'Product',
    'col.price': 'Price',
    'col.cost': 'Cost',
    'col.commission': 'Commission',
    'col.logistics': 'Logistics',
    'col.storage': 'Storage',
    'col.tax': 'Tax',
    'col.profit': 'Profit (1 unit)',
    'col.margin': 'Margin',
    'col.roi': 'ROI',
    'col.breakEven': 'Break-even price',
    'col.sold': 'Sold',
    'col.total': 'Total profit',
    'badge.loss': 'loss',
    'empty.title': 'Nothing found',
    'empty.hint': 'Change the period or clear the search',
    'empty.loss': 'No loss-making products',
    'empty.lossHint': 'Every product is sold with a positive profit',
    'export.done': 'Excel file is ready',
    'export.error': 'Export failed',
    'rows.count': '{n} SKUs',
    'drawer.title': 'Where one unit goes',
    'drawer.hint': 'How each part of the selling price is split',
    'drawer.open': 'Open in calculator',
    'drawer.price': 'Selling price',
    'drawer.breakEven': 'Break-even price',
    'drawer.breakEvenHint': 'Selling below this price makes a loss',
    'drawer.margin': 'Margin',
    'drawer.roi': 'ROI',
    'drawer.sold': 'Units sold',
    'drawer.total': 'Total profit',
    'drawer.loss': 'This product is losing money',
    'part.cogs': 'Cost price',
    'part.commission': 'Commission',
    'part.logistics': 'Logistics',
    'part.storage': 'Storage',
    'part.other': 'Other costs',
    'part.tax': 'Tax',
    'part.profit': 'Net profit',
  },
});

const PAGE_SIZE = 25;

type RowFilter = 'all' | 'loss' | 'profit';

export default function UnitEconomics() {
  const t = useT('unitEconomics');
  const f = useFormat();
  const navigate = useNavigate();
  const periodQuery = usePeriodQuery();

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [filter, setFilter] = useState<RowFilter>('all');
  const [active, setActive] = useState<UnitEconomicsRow | null>(null);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    const id = setTimeout(() => {
      setDebounced(search.trim());
      setPage(1);
    }, 350);
    return () => clearTimeout(id);
  }, [search]);

  const query = useMemo(
    () => ({ ...periodQuery, page, pageSize: PAGE_SIZE, search: debounced || undefined }),
    [periodQuery, page, debounced],
  );

  const unit = useQuery({
    queryKey: ['unit', query],
    queryFn: () => api.get<UnitEconomicsResponse>('/unit', query),
    placeholderData: (prev) => prev,
  });

  const totals = unit.data?.totals;
  const rows = useMemo(() => unit.data?.rows.items ?? [], [unit.data]);
  const lossRows = useMemo(() => rows.filter((r) => r.netProfit < 0), [rows]);

  const visibleRows = useMemo(() => {
    if (filter === 'loss') return lossRows;
    if (filter === 'profit') return rows.filter((r) => r.netProfit >= 0);
    return rows;
  }, [rows, lossRows, filter]);

  const onExport = async () => {
    setExporting(true);
    try {
      const blob = await api.blob('/export/unit-economics', {
        ...periodQuery,
        search: debounced || undefined,
      });
      downloadBlob(blob, `unit-economics-${periodQuery.from}_${periodQuery.to}.xlsx`);
      toast.success(t('export.done'));
    } catch (err) {
      toast.error(t('export.error'), err instanceof Error ? err.message : undefined);
    } finally {
      setExporting(false);
    }
  };

  const columns: Column<UnitEconomicsRow>[] = useMemo(
    () => [
      {
        key: 'title',
        header: t('col.product'),
        width: 260,
        sortable: true,
        sortValue: (r) => r.title,
        render: (r) => (
          <>
            {r.netProfit < 0 ? <span className="sp-loss sr-only" aria-hidden /> : null}
            <ProductCell
              title={r.title}
              imageUrl={r.imageUrl}
              size={36}
              subtitle={
                <span className="flex items-center gap-1.5">
                  <span className="truncate">{r.sku}</span>
                  {r.netProfit < 0 ? <span className="font-semibold text-danger">· {t('badge.loss')}</span> : null}
                </span>
              }
            />
          </>
        ),
      },
      {
        key: 'price',
        header: t('col.price'),
        align: 'right',
        sortable: true,
        sortValue: (r) => r.price,
        render: (r) => <span className="tnum font-semibold text-ink">{f.money(r.price)}</span>,
      },
      {
        key: 'purchasePrice',
        header: t('col.cost'),
        align: 'right',
        sortable: true,
        hideOnMobile: true,
        sortValue: (r) => r.purchasePrice,
        render: (r) =>
          r.purchasePrice > 0 ? (
            <span className="tnum">{f.money(r.purchasePrice)}</span>
          ) : (
            <span className="text-warn">—</span>
          ),
      },
      {
        key: 'commission',
        header: t('col.commission'),
        align: 'right',
        sortable: true,
        hideOnMobile: true,
        sortValue: (r) => r.commission,
        render: (r) => (
          <div className="leading-tight">
            <p className="tnum text-sm">{f.money(r.commission)}</p>
            <p className="tnum text-2xs text-muted">{f.pct(r.commissionPct)}</p>
          </div>
        ),
      },
      {
        key: 'logistics',
        header: t('col.logistics'),
        align: 'right',
        sortable: true,
        hideOnMobile: true,
        sortValue: (r) => r.logistics,
        render: (r) => <span className="tnum">{f.money(r.logistics)}</span>,
      },
      {
        key: 'storage',
        header: t('col.storage'),
        align: 'right',
        sortable: true,
        hideOnMobile: true,
        sortValue: (r) => r.storage,
        render: (r) => <span className="tnum">{f.money(r.storage)}</span>,
      },
      {
        key: 'tax',
        header: t('col.tax'),
        align: 'right',
        sortable: true,
        hideOnMobile: true,
        sortValue: (r) => r.tax,
        render: (r) => <span className="tnum">{f.money(r.tax)}</span>,
      },
      {
        key: 'netProfit',
        header: t('col.profit'),
        align: 'right',
        sortable: true,
        sortValue: (r) => r.netProfit,
        render: (r) => (
          <span className={cn('tnum font-display font-extrabold', r.netProfit < 0 ? 'text-danger' : 'text-brand')}>
            {f.money(r.netProfit)}
          </span>
        ),
      },
      {
        key: 'margin',
        header: t('col.margin'),
        align: 'right',
        sortable: true,
        sortValue: (r) => r.margin,
        render: (r) => (
          <span className={cn('tnum', r.margin < 0 ? 'text-danger' : 'text-ink-soft')}>{f.pct(r.margin)}</span>
        ),
      },
      {
        key: 'roi',
        header: t('col.roi'),
        align: 'right',
        sortable: true,
        hideOnMobile: true,
        sortValue: (r) => r.roi,
        render: (r) => (
          <span className={cn('tnum', r.roi < 0 ? 'text-danger' : 'text-ink-soft')}>{f.pct(r.roi)}</span>
        ),
      },
      {
        key: 'breakEvenPrice',
        header: t('col.breakEven'),
        align: 'right',
        sortable: true,
        hideOnMobile: true,
        sortValue: (r) => r.breakEvenPrice,
        render: (r) => <span className="tnum text-muted">{f.money(r.breakEvenPrice)}</span>,
      },
      {
        key: 'unitsSold',
        header: t('col.sold'),
        align: 'right',
        sortable: true,
        hideOnMobile: true,
        sortValue: (r) => r.unitsSold,
        render: (r) => <span className="tnum">{f.num(r.unitsSold)}</span>,
      },
      {
        key: 'totalProfit',
        header: t('col.total'),
        align: 'right',
        sortable: true,
        sortValue: (r) => r.totalProfit,
        render: (r) => (
          <span className={cn('tnum font-semibold', r.totalProfit < 0 ? 'text-danger' : 'text-ink')}>
            {f.money(r.totalProfit)}
          </span>
        ),
      },
    ],
    [t, f],
  );

  const drawerSegments = useMemo(() => {
    if (!active) return [];
    return rowParts(active)
      .filter((p) => p.value !== 0 || p.key === 'profit')
      .sort((a, b) => PART_ORDER.indexOf(a.key) - PART_ORDER.indexOf(b.key))
      .map((p) => ({
        key: p.key,
        label: t(`part.${p.key}`),
        value: p.value,
        color: PART_COLOR[p.key as PartKey],
      }));
  }, [active, t]);

  return (
    <>
      <PageHeader
        icon={<Scale className="h-5 w-5" />}
        title={t('title')}
        description={t('subtitle')}
        badge={<PreviewBadge feature="unit_economics" />}
        actions={
          <>
            <Button
              variant="outline"
              icon={<CalculatorIcon className="h-4 w-4" />}
              onClick={() => navigate('/calculator')}
            >
              {t('nav.calculator')}
            </Button>
            <Button
              variant="outline"
              icon={<Download className="h-4 w-4" />}
              loading={exporting}
              onClick={() => void onExport()}
            >
              {t('btn.export')}
            </Button>
          </>
        }
      />

      <FilterBar />

      <PlanGate feature="unit_economics">
        {unit.isError ? (
          <Card>
            <ErrorState
              message={unit.error instanceof Error ? unit.error.message : undefined}
              onRetry={() => void unit.refetch()}
              retryLabel={t('btn.retry')}
            />
          </Card>
        ) : (
          <div className="space-y-5">
            <StatGrid>
              <StatCard
                label={t('kpi.revenue')}
                value={f.money(totals?.revenue ?? 0)}
                hint={t('kpi.revenueHint')}
                icon={<Wallet className="h-5 w-5" />}
                loading={unit.isLoading}
              />
              <StatCard
                label={t('kpi.profit')}
                value={f.money(totals?.profit ?? 0)}
                hint={t('kpi.profitHint')}
                icon={<Coins className="h-5 w-5" />}
                tone={(totals?.profit ?? 0) < 0 ? 'danger' : 'brand'}
                loading={unit.isLoading}
              />
              <StatCard
                label={t('kpi.margin')}
                value={f.pct(totals?.margin ?? 0)}
                hint={t('kpi.marginHint')}
                icon={<Percent className="h-5 w-5" />}
                tone="info"
                loading={unit.isLoading}
              />
              <StatCard
                label={t('kpi.roi')}
                value={f.pct(totals?.roi ?? 0)}
                hint={t('kpi.roiHint')}
                icon={<TrendingUp className="h-5 w-5" />}
                tone="violet"
                loading={unit.isLoading}
              />
            </StatGrid>

            {lossRows.length > 0 && filter !== 'loss' ? (
              <div className="flex flex-wrap items-start gap-3 rounded-2xl border border-danger/25 bg-danger/10 p-4 sm:p-5">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-danger" />
                <div className="min-w-0 flex-1">
                  <p className="font-display text-sm font-bold text-ink">{t('alert.title', { n: lossRows.length })}</p>
                  <p className="mt-1 text-sm text-ink-soft">{t('alert.body')}</p>
                </div>
                <Button size="sm" variant="outline" onClick={() => setFilter('loss')}>
                  {t('alert.action')}
                </Button>
              </div>
            ) : null}

            <Card>
              <CardHeader
                title={t('col.product')}
                subtitle={t('rows.count', { n: f.num(unit.data?.rows.total ?? 0) })}
                actions={
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="max-w-full overflow-x-auto no-scrollbar">
                      <Segmented<RowFilter>
                        size="sm"
                        value={filter}
                        onChange={setFilter}
                        options={[
                          { value: 'all', label: t('filter.all'), count: rows.length },
                          { value: 'loss', label: t('filter.loss'), count: lossRows.length },
                          { value: 'profit', label: t('filter.profit'), count: rows.length - lossRows.length },
                        ]}
                      />
                    </div>
                    <SearchInput
                      className="w-52 sm:w-64"
                      value={search}
                      onChange={setSearch}
                      placeholder={t('search.placeholder')}
                    />
                  </div>
                }
              />

              <div className={cn('mt-4', unit.isFetching && !unit.isLoading && 'opacity-70 transition-opacity')}>
                <DataTable<UnitEconomicsRow>
                  className="[&_tbody_tr:has(.sp-loss)]:bg-danger/5"
                  columns={columns}
                  rows={visibleRows}
                  rowKey={(r) => r.skuId}
                  loading={unit.isLoading}
                  density="compact"
                  onRowClick={(r) => setActive(r)}
                  empty={
                    <EmptyState
                      icon={<Scale className="h-6 w-6" />}
                      title={filter === 'loss' ? t('empty.loss') : t('empty.title')}
                      hint={filter === 'loss' ? t('empty.lossHint') : t('empty.hint')}
                      action={
                        filter === 'all' ? undefined : (
                          <Button variant="outline" onClick={() => setFilter('all')}>
                            {t('filter.all')}
                          </Button>
                        )
                      }
                    />
                  }
                  pagination={{
                    page: unit.data?.rows.page ?? 1,
                    pages: unit.data?.rows.pages ?? 1,
                    total: unit.data?.rows.total ?? 0,
                    pageSize: PAGE_SIZE,
                    onPage: setPage,
                  }}
                />
              </div>
            </Card>
          </div>
        )}
      </PlanGate>

      <Drawer
        open={Boolean(active)}
        onClose={() => setActive(null)}
        title={t('drawer.title')}
        footer={
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Button variant="ghost" onClick={() => setActive(null)}>
              {t('btn.close')}
            </Button>
            <Button
              icon={<CalculatorIcon className="h-4 w-4" />}
              onClick={() => {
                if (active) navigate(`/calculator?skuId=${encodeURIComponent(active.skuId)}`);
                setActive(null);
              }}
            >
              {t('drawer.open')}
            </Button>
          </div>
        }
      >
        {active ? (
          <div className="space-y-5">
            <ProductCell title={active.title} subtitle={active.sku} imageUrl={active.imageUrl} size={52} />

            {active.netProfit < 0 ? (
              <div className="flex items-center gap-2.5 rounded-xl border border-danger/25 bg-danger/10 px-3.5 py-2.5">
                <AlertTriangle className="h-4 w-4 shrink-0 text-danger" />
                <p className="text-sm font-medium text-ink">{t('drawer.loss')}</p>
              </div>
            ) : null}

            <div className="rounded-2xl border border-line bg-surface-2 p-4">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-xs font-semibold uppercase tracking-wide text-muted">{t('drawer.price')}</span>
                <span className="tnum font-display text-xl font-extrabold text-ink">{f.money(active.price)}</span>
              </div>
              <p className="mt-1 text-xs text-muted">{t('drawer.hint')}</p>
            </div>

            <CostSplitBar segments={drawerSegments} total={active.price} />

            <Divider />

            <div className="grid grid-cols-2 gap-3">
              <MiniStat label={t('drawer.margin')} value={f.pct(active.margin)} danger={active.margin < 0} />
              <MiniStat label={t('drawer.roi')} value={f.pct(active.roi)} danger={active.roi < 0} />
              <MiniStat label={t('drawer.sold')} value={f.num(active.unitsSold)} />
              <MiniStat
                label={t('drawer.total')}
                value={f.money(active.totalProfit)}
                danger={active.totalProfit < 0}
              />
            </div>

            <div className="flex items-start gap-3 rounded-2xl border border-line bg-surface-2 p-4">
              <Target className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="text-sm font-medium text-ink-soft">{t('drawer.breakEven')}</p>
                  <Badge tone={active.price >= active.breakEvenPrice ? 'brand' : 'danger'}>
                    <span className="tnum">{f.money(active.breakEvenPrice)}</span>
                  </Badge>
                </div>
                <p className="mt-1 text-xs text-muted">{t('drawer.breakEvenHint')}</p>
              </div>
            </div>
          </div>
        ) : null}
      </Drawer>
    </>
  );
}

function MiniStat({ label, value, danger }: { label: string; value: string; danger?: boolean }) {
  return (
    <div className="rounded-xl border border-line bg-surface p-3.5">
      <p className="truncate text-2xs font-semibold uppercase tracking-wide text-muted">{label}</p>
      <p className={cn('tnum mt-1 font-display text-base font-extrabold', danger ? 'text-danger' : 'text-ink')}>
        {value}
      </p>
    </div>
  );
}
