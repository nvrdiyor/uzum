import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Download, Layers3, PieChart as PieIcon, X } from 'lucide-react';
import type { AbcResponse, AbcRow } from '@savdoiq/shared';
import { api } from '@/lib/api';
import { usePeriodQuery } from '@/store/ui';
import { registerNamespace, useFormat, useT } from '@/i18n';
import { cn, downloadBlob } from '@/lib/utils';
import { FilterBar } from '@/components/filters';
import { ChartCard } from '@/components/charts';
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
  ProgressBar,
  SearchInput,
  Skeleton,
  StatCard,
  StatGrid,
  toast,
  type Column,
} from '@/components/ui';
import { AbcGroupCard } from '@/components/analysis/AbcGroupCard';
import { AbcMatrix, type MatrixCellData } from '@/components/analysis/AbcMatrix';
import { ParetoChart, type ParetoPoint } from '@/components/analysis/ParetoChart';
import { ABC_KEYS, ABC_TONE, type AbcGroupKey, type XyzGroupKey } from '@/components/analysis/shared';

registerNamespace('abc', {
  uz: {
    title: 'ABC tahlil',
    subtitle: 'Qaysi mahsulotlar pul keltiradi, qaysilari faqat joy egallaydi',
    'kpi.revenue': 'Tahlildagi tushum',
    'kpi.skus': 'Tahlildagi SKU',
    'kpi.aShare': 'A guruh ulushi',
    'kpi.cCount': 'C guruh SKU',
    'kpi.aShareHint': 'Tushumning asosiy qismi shu guruhdan',
    'kpi.cCountHint': 'Optimallashtirishga nomzod',
    'group.A': 'A — asosiy tushum',
    'group.B': 'B — o‘sish imkoniyati',
    'group.C': 'C — optimallashtirish',
    'group.A.desc': 'Tushumning ~80% shu mahsulotlardan. Qoldiq va narxni doimiy nazorat qiling — bu yerdagi tanaffus butun oyni buzadi.',
    'group.B.desc': 'O‘rta qatlam. Reklama, kontent va narx bilan ishlab, A guruhga ko‘tarish mumkin.',
    'group.C.desc': 'Tushumga qo‘shgan hissasi kichik. Assortimentni qisqartiring yoki tannarx va saqlash xarajatini kamaytiring.',
    'group.sku': 'SKU',
    'group.revenue': 'Tushum',
    'group.units': 'Dona',
    'pareto.title': 'Pareto: tushum va kumulyativ ulush',
    'pareto.subtitle': 'Eng yirik {n} SKU · 80% va 95% chegaralari A/B/C ni ajratadi',
    'pareto.revenue': 'Tushum',
    'pareto.cumulative': 'Kumulyativ ulush',
    'matrix.title': 'ABC × XYZ matritsasi',
    'matrix.subtitle': 'Katakka bosing — jadval shu guruh bo‘yicha filtrlanadi',
    'matrix.sku': 'SKU',
    'matrix.empty': 'XYZ ma’lumoti yo‘q',
    'matrix.emptyHint': 'Talab barqarorligini hisoblash uchun kamida 8 haftalik sotuv tarixi kerak',
    'matrix.abc.A': 'tushumning 80%',
    'matrix.abc.B': 'keyingi 15%',
    'matrix.abc.C': 'oxirgi 5%',
    'matrix.xyz.X': 'Barqaror talab — prognoz aniq',
    'matrix.xyz.Y': 'O‘zgaruvchan talab — mavsumiylik bor',
    'matrix.xyz.Z': 'Tartibsiz talab — prognoz qilish qiyin',
    'table.title': 'SKU bo‘yicha taqsimot',
    'table.filteredTotal': 'Jami (filtr bo‘yicha)',
    'col.product': 'Mahsulot',
    'col.revenue': 'Tushum',
    'col.profit': 'Foyda',
    'col.units': 'Dona',
    'col.share': 'Ulush',
    'col.cumulative': 'Kumulyativ',
    'col.group': 'Guruh',
    'filter.all': 'Barchasi',
    'filter.active': 'Filtr: {value}',
    'filter.clear': 'Filtrni tozalash',
    'filter.found': '{n} ta SKU',
    export: 'Excel',
    'export.error': 'Faylni yuklab bo‘lmadi',
    'empty.title': 'Tahlil uchun ma’lumot yo‘q',
    'empty.hint': 'Tanlangan davrda sotuv bo‘lmagan — boshqa davrni tanlab ko‘ring',
    'empty.filtered': 'Bu guruhda SKU topilmadi',
  },
  ru: {
    title: 'ABC-анализ',
    subtitle: 'Какие товары приносят деньги, а какие просто занимают склад',
    'kpi.revenue': 'Выручка в анализе',
    'kpi.skus': 'SKU в анализе',
    'kpi.aShare': 'Доля группы A',
    'kpi.cCount': 'SKU группы C',
    'kpi.aShareHint': 'Основная часть выручки — отсюда',
    'kpi.cCountHint': 'Кандидаты на оптимизацию',
    'group.A': 'A — основная выручка',
    'group.B': 'B — потенциал роста',
    'group.C': 'C — оптимизация',
    'group.A.desc': 'Около 80% выручки. Держите остатки и цену под контролем — провал здесь ломает весь месяц.',
    'group.B.desc': 'Средний слой. С рекламой, контентом и ценой их можно поднять в группу A.',
    'group.C.desc': 'Вклад в выручку минимален. Сокращайте ассортимент либо снижайте себестоимость и хранение.',
    'group.sku': 'SKU',
    'group.revenue': 'Выручка',
    'group.units': 'Штук',
    'pareto.title': 'Парето: выручка и накопленная доля',
    'pareto.subtitle': 'Топ-{n} SKU · границы 80% и 95% разделяют A/B/C',
    'pareto.revenue': 'Выручка',
    'pareto.cumulative': 'Накопленная доля',
    'matrix.title': 'Матрица ABC × XYZ',
    'matrix.subtitle': 'Нажмите на ячейку — таблица отфильтруется по этой группе',
    'matrix.sku': 'SKU',
    'matrix.empty': 'Нет данных XYZ',
    'matrix.emptyHint': 'Для оценки стабильности спроса нужна история продаж минимум за 8 недель',
    'matrix.abc.A': '80% выручки',
    'matrix.abc.B': 'следующие 15%',
    'matrix.abc.C': 'последние 5%',
    'matrix.xyz.X': 'Стабильный спрос — прогноз точный',
    'matrix.xyz.Y': 'Переменный спрос — есть сезонность',
    'matrix.xyz.Z': 'Хаотичный спрос — прогноз затруднён',
    'table.title': 'Распределение по SKU',
    'table.filteredTotal': 'Итого (по фильтру)',
    'col.product': 'Товар',
    'col.revenue': 'Выручка',
    'col.profit': 'Прибыль',
    'col.units': 'Штук',
    'col.share': 'Доля',
    'col.cumulative': 'Накопл.',
    'col.group': 'Группа',
    'filter.all': 'Все',
    'filter.active': 'Фильтр: {value}',
    'filter.clear': 'Сбросить фильтр',
    'filter.found': '{n} SKU',
    export: 'Excel',
    'export.error': 'Не удалось скачать файл',
    'empty.title': 'Нет данных для анализа',
    'empty.hint': 'За выбранный период продаж не было — попробуйте другой период',
    'empty.filtered': 'В этой группе SKU не найдено',
  },
  en: {
    title: 'ABC analysis',
    subtitle: 'Which products make the money and which just occupy the warehouse',
    'kpi.revenue': 'Revenue analysed',
    'kpi.skus': 'SKUs analysed',
    'kpi.aShare': 'Group A share',
    'kpi.cCount': 'Group C SKUs',
    'kpi.aShareHint': 'Most of the revenue comes from here',
    'kpi.cCountHint': 'Candidates for optimisation',
    'group.A': 'A — core revenue',
    'group.B': 'B — growth potential',
    'group.C': 'C — optimisation',
    'group.A.desc': 'Around 80% of revenue. Keep stock and pricing under control — a stockout here ruins the whole month.',
    'group.B.desc': 'The middle layer. With ads, content and pricing these can be pushed into group A.',
    'group.C.desc': 'Contribute very little revenue. Trim the assortment or cut cost price and storage spend.',
    'group.sku': 'SKUs',
    'group.revenue': 'Revenue',
    'group.units': 'Units',
    'pareto.title': 'Pareto: revenue and cumulative share',
    'pareto.subtitle': 'Top {n} SKUs · the 80% and 95% lines split A/B/C',
    'pareto.revenue': 'Revenue',
    'pareto.cumulative': 'Cumulative share',
    'matrix.title': 'ABC × XYZ matrix',
    'matrix.subtitle': 'Click a cell — the table below filters to that group',
    'matrix.sku': 'SKUs',
    'matrix.empty': 'No XYZ data',
    'matrix.emptyHint': 'At least 8 weeks of sales history is needed to score demand stability',
    'matrix.abc.A': '80% of revenue',
    'matrix.abc.B': 'next 15%',
    'matrix.abc.C': 'last 5%',
    'matrix.xyz.X': 'Stable demand — forecast is reliable',
    'matrix.xyz.Y': 'Variable demand — seasonality present',
    'matrix.xyz.Z': 'Erratic demand — hard to forecast',
    'table.title': 'Breakdown by SKU',
    'table.filteredTotal': 'Total (filtered)',
    'col.product': 'Product',
    'col.revenue': 'Revenue',
    'col.profit': 'Profit',
    'col.units': 'Units',
    'col.share': 'Share',
    'col.cumulative': 'Cumulative',
    'col.group': 'Group',
    'filter.all': 'All',
    'filter.active': 'Filter: {value}',
    'filter.clear': 'Clear filter',
    'filter.found': '{n} SKUs',
    export: 'Excel',
    'export.error': 'Could not download the file',
    'empty.title': 'Nothing to analyse yet',
    'empty.hint': 'There were no sales in the selected period — try another range',
    'empty.filtered': 'No SKUs in this group',
  },
});

const PAGE_SIZE = 25;
const PARETO_LIMIT = 30;

export default function Abc() {
  const t = useT('abc');
  const f = useFormat();
  const q = usePeriodQuery();

  const [abcFilter, setAbcFilter] = useState<AbcGroupKey | 'all'>('all');
  const [xyzFilter, setXyzFilter] = useState<XyzGroupKey | null>(null);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [exporting, setExporting] = useState(false);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['abc', q],
    queryFn: () => api.get<AbcResponse>('/products/abc', q),
  });

  const rows = useMemo<AbcRow[]>(() => data?.rows ?? [], [data]);

  useEffect(() => {
    setPage(1);
  }, [abcFilter, xyzFilter, search]);

  // ── Guruh xulosalari (API bermasa — qatorlardan hisoblanadi) ──────────────
  const groups = useMemo(() => {
    const totalRevenue = rows.reduce((s, r) => s + r.revenue, 0);
    return ABC_KEYS.map((g) => {
      const fromApi = data?.groups?.find((x) => x.group === g);
      if (fromApi) return fromApi;
      const list = rows.filter((r) => r.group === g);
      const revenue = list.reduce((s, r) => s + r.revenue, 0);
      return {
        group: g,
        skuCount: list.length,
        revenue,
        units: list.reduce((s, r) => s + r.units, 0),
        revenueShare: totalRevenue > 0 ? (revenue / totalRevenue) * 100 : 0,
      };
    });
  }, [data, rows]);

  const totals = useMemo(
    () => ({
      revenue: rows.reduce((s, r) => s + r.revenue, 0),
      profit: rows.reduce((s, r) => s + r.profit, 0),
      units: rows.reduce((s, r) => s + r.units, 0),
      skus: rows.length,
    }),
    [rows],
  );

  // ── ABC × XYZ matritsasi ─────────────────────────────────────────────────
  const hasXyz = useMemo(() => rows.some((r) => !!r.xyzGroup), [rows]);
  const matrixCells = useMemo<MatrixCellData[]>(() => {
    const map = new Map<string, MatrixCellData>();
    rows.forEach((r) => {
      if (!r.xyzGroup) return;
      const key = `${r.group}${r.xyzGroup}`;
      const cur = map.get(key) ?? { abc: r.group, xyz: r.xyzGroup, count: 0, revenue: 0 };
      cur.count += 1;
      cur.revenue += r.revenue;
      map.set(key, cur);
    });
    return [...map.values()];
  }, [rows]);

  // ── Pareto ───────────────────────────────────────────────────────────────
  const paretoData = useMemo<ParetoPoint[]>(
    () =>
      [...rows]
        .sort((a, b) => a.cumulativeShare - b.cumulativeShare || b.revenue - a.revenue)
        .slice(0, PARETO_LIMIT)
        .map((r) => ({
          name: r.title,
          revenue: r.revenue,
          cumulative: r.cumulativeShare,
          group: r.group,
        })),
    [rows],
  );

  // ── Jadval ───────────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (abcFilter !== 'all' && r.group !== abcFilter) return false;
      if (xyzFilter && r.xyzGroup !== xyzFilter) return false;
      if (needle && !`${r.title} ${r.sku}`.toLowerCase().includes(needle)) return false;
      return true;
    });
  }, [rows, abcFilter, xyzFilter, search]);

  /**
   * Jadval oyog'idagi jami — FILTRLANGAN ro'yxat bo'yicha. Ilgari tushum,
   * foyda va dona butun ro'yxatdan, ulush esa filtrdan olinardi: A guruhini
   * tanlaganda pastdagi raqamlar jadvaldagi qatorlarga mos kelmasdi.
   */
  const filteredTotals = useMemo(
    () => ({
      revenue: filtered.reduce((s, r) => s + r.revenue, 0),
      profit: filtered.reduce((s, r) => s + r.profit, 0),
      units: filtered.reduce((s, r) => s + r.units, 0),
      share: filtered.reduce((s, r) => s + r.share, 0),
    }),
    [filtered],
  );

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pages);
  const pageRows = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const filterLabel = xyzFilter
    ? `${abcFilter === 'all' ? '' : abcFilter}${xyzFilter}`
    : abcFilter === 'all'
      ? ''
      : abcFilter;

  const clearFilter = () => {
    setAbcFilter('all');
    setXyzFilter(null);
  };

  async function onExport() {
    setExporting(true);
    try {
      const blob = await api.blob('/export/abc', q);
      downloadBlob(blob, `abc-${q.from}_${q.to}.xlsx`);
    } catch {
      toast.error(t('export.error'));
    } finally {
      setExporting(false);
    }
  }

  const columns: Column<AbcRow>[] = [
    {
      key: 'product',
      header: t('col.product'),
      width: '32%',
      render: (r) => <ProductCell title={r.title} subtitle={r.sku} imageUrl={r.imageUrl} />,
      sortable: true,
      sortValue: (r) => r.title,
    },
    {
      key: 'revenue',
      header: t('col.revenue'),
      align: 'right',
      sortable: true,
      sortValue: (r) => r.revenue,
      render: (r) => <span className="font-semibold text-ink">{f.money(r.revenue)}</span>,
    },
    {
      key: 'profit',
      header: t('col.profit'),
      align: 'right',
      sortable: true,
      hideOnMobile: true,
      sortValue: (r) => r.profit,
      render: (r) => (
        <span className={cn('font-medium', r.profit >= 0 ? 'text-ink-soft' : 'text-danger')}>{f.money(r.profit)}</span>
      ),
    },
    {
      key: 'units',
      header: t('col.units'),
      align: 'right',
      sortable: true,
      hideOnMobile: true,
      sortValue: (r) => r.units,
      render: (r) => f.num(r.units),
    },
    {
      key: 'share',
      header: t('col.share'),
      align: 'right',
      sortable: true,
      sortValue: (r) => r.share,
      render: (r) => f.pct(r.share),
    },
    {
      key: 'cumulative',
      header: t('col.cumulative'),
      align: 'right',
      sortable: true,
      hideOnMobile: true,
      width: 150,
      sortValue: (r) => r.cumulativeShare,
      render: (r) => (
        <div className="flex items-center justify-end gap-2">
          <ProgressBar
            value={r.cumulativeShare}
            tone={ABC_TONE[r.group]}
            className="hidden w-20 lg:flex"
          />
          <span className="tnum w-12 text-right text-xs text-muted">{f.pct(r.cumulativeShare, 0)}</span>
        </div>
      ),
    },
    {
      key: 'group',
      header: t('col.group'),
      align: 'center',
      sortable: true,
      sortValue: (r) => r.group,
      render: (r) => (
        <Badge tone={ABC_TONE[r.group]}>
          {r.group}
          {r.xyzGroup ?? ''}
        </Badge>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        icon={<PieIcon className="h-5 w-5" />}
        title={t('title')}
        description={t('subtitle')}
        badge={<PreviewBadge feature="abc_analysis" />}
        actions={
          <Button
            variant="outline"
            icon={<Download className="h-4 w-4" />}
            loading={exporting}
            onClick={onExport}
          >
            {t('export')}
          </Button>
        }
      />

      <FilterBar />

      <PlanGate feature="abc_analysis">
        {isError ? (
          <Card>
            <ErrorState message={error instanceof Error ? error.message : undefined} onRetry={() => void refetch()} />
          </Card>
        ) : (
          <div className="space-y-5">
            <StatGrid>
              <StatCard
                label={t('kpi.revenue')}
                value={isLoading ? '' : f.money(totals.revenue)}
                loading={isLoading}
                icon={<PieIcon className="h-5 w-5" />}
                tone="brand"
              />
              <StatCard
                label={t('kpi.skus')}
                value={isLoading ? '' : f.num(totals.skus)}
                loading={isLoading}
                icon={<Layers3 className="h-5 w-5" />}
                tone="info"
              />
              <StatCard
                label={t('kpi.aShare')}
                value={isLoading ? '' : f.pct(groups[0]?.revenueShare ?? 0)}
                hint={t('kpi.aShareHint')}
                loading={isLoading}
                tone="brand"
              />
              <StatCard
                label={t('kpi.cCount')}
                value={isLoading ? '' : f.num(groups[2]?.skuCount ?? 0)}
                hint={t('kpi.cCountHint')}
                loading={isLoading}
                tone="danger"
              />
            </StatGrid>

            {/* Guruh kartalari */}
            {isLoading ? (
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {[0, 1, 2].map((i) => (
                  <Skeleton key={i} className="h-52 w-full" />
                ))}
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {groups.map((g) => (
                  <AbcGroupCard
                    key={g.group}
                    group={g.group}
                    title={t(`group.${g.group}`)}
                    description={t(`group.${g.group}.desc`)}
                    revenueShare={g.revenueShare}
                    skuCount={g.skuCount}
                    revenue={g.revenue}
                    units={g.units}
                    labels={{ sku: t('group.sku'), revenue: t('group.revenue'), units: t('group.units') }}
                    active={abcFilter === g.group && !xyzFilter}
                    onClick={() => {
                      setXyzFilter(null);
                      setAbcFilter((cur) => (cur === g.group ? 'all' : g.group));
                    }}
                  />
                ))}
              </div>
            )}

            {/* Pareto + matritsa */}
            <div className="grid gap-4 xl:grid-cols-3">
              <ChartCard
                className="xl:col-span-2"
                title={t('pareto.title')}
                subtitle={t('pareto.subtitle', { n: Math.min(PARETO_LIMIT, rows.length) })}
                legend={
                  isLoading || !rows.length
                    ? undefined
                    : ABC_KEYS.map((g) => ({
                        name: g,
                        color: `rgb(var(${g === 'A' ? '--c-brand' : g === 'B' ? '--c-warn' : '--c-danger'}))`,
                        value: f.compact(groups.find((x) => x.group === g)?.revenue ?? 0),
                      }))
                }
              >
                {isLoading ? (
                  <Skeleton className="h-[320px] w-full" />
                ) : paretoData.length ? (
                  <ParetoChart
                    data={paretoData}
                    revenueLabel={t('pareto.revenue')}
                    cumulativeLabel={t('pareto.cumulative')}
                  />
                ) : (
                  <EmptyState title={t('empty.title')} hint={t('empty.hint')} />
                )}
              </ChartCard>

              <ChartCard title={t('matrix.title')} subtitle={t('matrix.subtitle')}>
                {isLoading ? (
                  <Skeleton className="h-[320px] w-full" />
                ) : hasXyz ? (
                  <AbcMatrix
                    cells={matrixCells}
                    active={abcFilter !== 'all' && xyzFilter ? { abc: abcFilter, xyz: xyzFilter } : null}
                    onSelect={(cell) => {
                      const same = abcFilter === cell.abc && xyzFilter === cell.xyz;
                      setAbcFilter(same ? 'all' : cell.abc);
                      setXyzFilter(same ? null : cell.xyz);
                    }}
                    labels={{
                      skuWord: t('matrix.sku'),
                      abcHint: {
                        A: t('matrix.abc.A'),
                        B: t('matrix.abc.B'),
                        C: t('matrix.abc.C'),
                      },
                      xyzHint: {
                        X: t('matrix.xyz.X'),
                        Y: t('matrix.xyz.Y'),
                        Z: t('matrix.xyz.Z'),
                      },
                    }}
                  />
                ) : (
                  <EmptyState
                    icon={<Layers3 className="h-6 w-6" />}
                    title={t('matrix.empty')}
                    hint={t('matrix.emptyHint')}
                  />
                )}
              </ChartCard>
            </div>

            {/* Jadval */}
            <Card>
              <CardHeader
                title={t('table.title')}
                subtitle={t('filter.found', { n: filtered.length })}
                actions={
                  <div className="flex flex-wrap items-center gap-2">
                    {filterLabel ? (
                      <button
                        type="button"
                        onClick={clearFilter}
                        className="chip bg-brand/[0.12] text-brand-ink transition-colors hover:bg-brand/20"
                        title={t('filter.clear')}
                      >
                        {t('filter.active', { value: filterLabel })}
                        <X className="h-3 w-3" />
                      </button>
                    ) : null}
                    <SearchInput
                      value={search}
                      onChange={setSearch}
                      placeholder={t('common.search')}
                      className="w-full sm:w-64"
                    />
                  </div>
                }
              />
              <div className="mt-4">
                <DataTable<AbcRow>
                  columns={columns}
                  rows={pageRows}
                  rowKey={(r) => r.skuId}
                  loading={isLoading}
                  pagination={{ page: safePage, pages, total: filtered.length, onPage: setPage }}
                  empty={
                    <EmptyState
                      icon={<PieIcon className="h-6 w-6" />}
                      title={rows.length ? t('empty.filtered') : t('empty.title')}
                      hint={rows.length ? undefined : t('empty.hint')}
                      action={
                        rows.length && filterLabel ? (
                          <Button variant="outline" onClick={clearFilter}>
                            {t('filter.clear')}
                          </Button>
                        ) : undefined
                      }
                    />
                  }
                  footer={
                    <>
                      <td className="px-4 py-3 text-sm">
                        {filtered.length === rows.length ? t('common.total') : t('table.filteredTotal')}
                      </td>
                      <td className="tnum px-4 py-3 text-right text-sm">{f.money(filteredTotals.revenue)}</td>
                      <td className="tnum hidden px-4 py-3 text-right text-sm md:table-cell">
                        {f.money(filteredTotals.profit)}
                      </td>
                      <td className="tnum hidden px-4 py-3 text-right text-sm md:table-cell">
                        {f.num(filteredTotals.units)}
                      </td>
                      <td className="tnum px-4 py-3 text-right text-sm">{f.pct(filteredTotals.share)}</td>
                      <td className="hidden px-4 py-3 md:table-cell" />
                      <td className="px-4 py-3" />
                    </>
                  }
                />
              </div>
            </Card>
          </div>
        )}
      </PlanGate>
    </>
  );
}
