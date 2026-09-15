import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Boxes,
  Building2,
  Container,
  Download,
  Lock,
  Truck,
  Warehouse as WarehouseIcon,
  Wallet,
} from 'lucide-react';
import { DEFAULTS, type StocksResponse } from '@savdoiq/shared';
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
  ProgressBar,
  SearchInput,
  SkeletonRows,
  StatCard,
  StatGrid,
  toast,
  type Column,
} from '@/components/ui';
import { ZeroAware } from '@/components/ui/ZeroAware';
import { CHART_COLORS, DonutChart, SERIES_PALETTE } from '@/components/charts';
import { FilterBar } from '@/components/filters';
import { api } from '@/lib/api';
import { downloadBlob } from '@/lib/utils';
import { usePeriodQuery } from '@/store/ui';
import { registerNamespace, useFormat, useT } from '@/i18n';
import { SchemeShareCard } from '@/components/stock/common';
import { rowsOf, type SchemeTotal, type WarehouseResponse, type WarehouseRow } from '@/components/stock/types';

registerNamespace('warehouse', {
  uz: {
    title: 'Ombor',
    subtitle: 'O‘z omboringiz kesimi, FBO/FBS bilan taqqoslash va saqlash xarajati bahosi',
    'kpi.units': 'O‘z omborida dona',
    'kpi.unitsHint': 'Sizning omboringizdagi jami qoldiq',
    'kpi.value': 'Ombor qiymati',
    'kpi.valueHint': 'Tannarx bo‘yicha muzlagan kapital',
    'kpi.reserved': 'Band',
    'kpi.reservedHint': 'Buyurtmalarga ajratilgan dona',
    'kpi.inTransit': 'Yo‘lda',
    'kpi.inTransitHint': 'Yetkazmalarda ketayotgan dona',
    'stores.title': 'Do‘konlar bo‘yicha taqsimot',
    'stores.hint': 'Ombor qiymatining do‘konlar kesimi',
    'schemes.title': 'FBO / FBS / o‘z ombori',
    'schemes.hint': 'Qoldiqning saqlash sxemalari bo‘yicha taqsimoti',
    'scheme.fbo': 'FBO — Uzum ombori',
    'scheme.fbs': 'FBS — o‘z yetkazish',
    'scheme.own': 'O‘z ombori',
    'scheme.share': 'Umumiy qoldiqdagi ulush',
    'capacity.title': 'Ombor sig‘imi va saqlash xarajati',
    'capacity.hint': 'Mahsulot hajmi (volumeL) asosidagi baho',
    'capacity.volume': 'Jami hajm',
    'capacity.volumeUnit': 'litr',
    'capacity.perDay': 'Kunlik saqlash xarajati',
    'capacity.perMonth': 'Oylik saqlash xarajati',
    'capacity.rate': '1 litr / kun narxi',
    'capacity.noVolume': 'Hajm ma’lumoti yo‘q',
    'capacity.noVolumeHint': 'Mahsulot kartochkasida hajm (litr) to‘ldirilsa, saqlash xarajati hisoblanadi',
    'capacity.avgPerUnit': 'O‘rtacha hajm (1 dona)',
    'table.title': 'O‘z omboridagi qoldiqlar',
    'table.hint': 'SKU kesimida qoldiq, band, yo‘lda va qiymat',
    'col.product': 'Mahsulot',
    'col.store': 'Do‘kon',
    'col.own': 'Qoldiq',
    'col.reserved': 'Band',
    'col.inTransit': 'Yo‘lda',
    'col.available': 'Mavjud',
    'col.value': 'Qiymat',
    'col.volume': 'Hajm, l',
    'search.placeholder': 'Nomi yoki SKU bo‘yicha qidirish',
    'empty.title': 'O‘z omboringizda qoldiq yo‘q',
    'empty.hint': 'Yetkazma qabul qilinganidan so‘ng qoldiqlar shu yerda ko‘rinadi',
    'export.done': 'Excel fayl tayyor',
    'export.error': 'Eksport qilishda xatolik',
  },
  ru: {
    title: 'Склад',
    subtitle: 'Разрез своего склада, сравнение с FBO/FBS и оценка стоимости хранения',
    'kpi.units': 'Штук на своём складе',
    'kpi.unitsHint': 'Общий остаток на вашем складе',
    'kpi.value': 'Стоимость склада',
    'kpi.valueHint': 'Замороженный капитал по себестоимости',
    'kpi.reserved': 'Зарезервировано',
    'kpi.reservedHint': 'Штук, отложенных под заказы',
    'kpi.inTransit': 'В пути',
    'kpi.inTransitHint': 'Штук в текущих поставках',
    'stores.title': 'Распределение по магазинам',
    'stores.hint': 'Стоимость склада в разрезе магазинов',
    'schemes.title': 'FBO / FBS / свой склад',
    'schemes.hint': 'Распределение остатка по схемам хранения',
    'scheme.fbo': 'FBO — склад Uzum',
    'scheme.fbs': 'FBS — своя доставка',
    'scheme.own': 'Свой склад',
    'scheme.share': 'Доля в общем остатке',
    'capacity.title': 'Вместимость склада и стоимость хранения',
    'capacity.hint': 'Оценка по объёму товара (volumeL)',
    'capacity.volume': 'Общий объём',
    'capacity.volumeUnit': 'литров',
    'capacity.perDay': 'Стоимость хранения в день',
    'capacity.perMonth': 'Стоимость хранения в месяц',
    'capacity.rate': 'Цена за 1 литр / день',
    'capacity.noVolume': 'Нет данных об объёме',
    'capacity.noVolumeHint': 'Заполните объём (литры) в карточке товара — и мы посчитаем хранение',
    'capacity.avgPerUnit': 'Средний объём (1 шт)',
    'table.title': 'Остатки на своём складе',
    'table.hint': 'Остаток, резерв, товар в пути и стоимость по каждому SKU',
    'col.product': 'Товар',
    'col.store': 'Магазин',
    'col.own': 'Остаток',
    'col.reserved': 'Резерв',
    'col.inTransit': 'В пути',
    'col.available': 'Доступно',
    'col.value': 'Стоимость',
    'col.volume': 'Объём, л',
    'search.placeholder': 'Поиск по названию или SKU',
    'empty.title': 'На своём складе пусто',
    'empty.hint': 'Остатки появятся здесь после приёмки поставки',
    'export.done': 'Файл Excel готов',
    'export.error': 'Ошибка при экспорте',
  },
  en: {
    title: 'Warehouse',
    subtitle: 'Your own warehouse, compared with FBO/FBS, plus a storage cost estimate',
    'kpi.units': 'Units in own warehouse',
    'kpi.unitsHint': 'Total stock stored by you',
    'kpi.value': 'Warehouse value',
    'kpi.valueHint': 'Capital frozen at cost price',
    'kpi.reserved': 'Reserved',
    'kpi.reservedHint': 'Units allocated to orders',
    'kpi.inTransit': 'In transit',
    'kpi.inTransitHint': 'Units moving in shipments',
    'stores.title': 'Split by store',
    'stores.hint': 'Warehouse value per store',
    'schemes.title': 'FBO / FBS / own warehouse',
    'schemes.hint': 'How stock is distributed across storage schemes',
    'scheme.fbo': 'FBO — Uzum warehouse',
    'scheme.fbs': 'FBS — your delivery',
    'scheme.own': 'Own warehouse',
    'scheme.share': 'Share of total stock',
    'capacity.title': 'Capacity and storage cost',
    'capacity.hint': 'Estimated from product volume (volumeL)',
    'capacity.volume': 'Total volume',
    'capacity.volumeUnit': 'litres',
    'capacity.perDay': 'Storage cost per day',
    'capacity.perMonth': 'Storage cost per month',
    'capacity.rate': 'Rate per litre / day',
    'capacity.noVolume': 'No volume data',
    'capacity.noVolumeHint': 'Fill in the volume (litres) on the product card to estimate storage',
    'capacity.avgPerUnit': 'Average volume (1 unit)',
    'table.title': 'Own warehouse stock',
    'table.hint': 'Stock, reserved, in transit and value per SKU',
    'col.product': 'Product',
    'col.store': 'Store',
    'col.own': 'Stock',
    'col.reserved': 'Reserved',
    'col.inTransit': 'In transit',
    'col.available': 'Available',
    'col.value': 'Value',
    'col.volume': 'Volume, l',
    'search.placeholder': 'Search by name or SKU',
    'empty.title': 'Your warehouse is empty',
    'empty.hint': 'Stock shows up here once a shipment is accepted',
    'export.done': 'Excel file is ready',
    'export.error': 'Export failed',
  },
});

const PAGE_SIZE = 20;
const EMPTY_SCHEME: SchemeTotal = { units: 0, amount: 0 };

export default function Warehouse() {
  const t = useT('warehouse');
  const tc = useT('common');
  const f = useFormat();
  const q = usePeriodQuery();

  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [exporting, setExporting] = useState(false);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['warehouse', q],
    queryFn: () => api.get<WarehouseResponse>('/stocks/warehouse', q),
  });

  const totals = data?.totals;
  const rows = useMemo(() => rowsOf<WarehouseRow>(data?.rows), [data]);

  /** Sxemalar bo'yicha taqsimot javobda bo'lmasa — /stocks dan hisoblaymiz */
  const needSchemeFallback = Boolean(data) && !totals?.fbo && !totals?.fbs;

  const schemesQuery = useQuery({
    queryKey: ['warehouse-schemes', q],
    queryFn: () => api.get<StocksResponse>('/stocks', { ...q, page: 1, pageSize: 500 }),
    enabled: needSchemeFallback,
  });

  const schemes = useMemo(() => {
    if (totals?.fbo || totals?.fbs || totals?.own) {
      return {
        fbo: totals.fbo ?? EMPTY_SCHEME,
        fbs: totals.fbs ?? EMPTY_SCHEME,
        own: totals.own ?? EMPTY_SCHEME,
      };
    }
    const stockRows = schemesQuery.data?.rows.items ?? [];
    const acc = { fbo: { ...EMPTY_SCHEME }, fbs: { ...EMPTY_SCHEME }, own: { ...EMPTY_SCHEME } };
    stockRows.forEach((r) => {
      const unitCost = r.total > 0 ? r.costValue / r.total : 0;
      acc.fbo.units += r.fbo;
      acc.fbo.amount += r.fbo * unitCost;
      acc.fbs.units += r.fbs;
      acc.fbs.amount += r.fbs * unitCost;
      acc.own.units += r.own;
      acc.own.amount += r.own * unitCost;
    });
    if (acc.own.units === 0 && rows.length > 0) {
      acc.own.units = rows.reduce((s, r) => s + (r.own ?? 0), 0);
      acc.own.amount = rows.reduce((s, r) => s + (r.costValue ?? 0), 0);
    }
    return acc;
  }, [totals, schemesQuery.data, rows]);

  const schemeUnits = schemes.fbo.units + schemes.fbs.units + schemes.own.units;
  const share = (v: number) => (schemeUnits > 0 ? (v / schemeUnits) * 100 : 0);

  const kpi = useMemo(() => {
    const units = totals?.units ?? rows.reduce((s, r) => s + (r.own ?? 0), 0);
    const costValue = totals?.costValue ?? rows.reduce((s, r) => s + (r.costValue ?? 0), 0);
    const reserved = totals?.reserved ?? rows.reduce((s, r) => s + (r.reserved ?? 0), 0);
    const inTransit = totals?.inTransit ?? rows.reduce((s, r) => s + (r.inTransit ?? 0), 0);
    const volumeL = totals?.volumeL ?? rows.reduce((s, r) => s + (r.volumeL ?? 0), 0);
    return { units, costValue, reserved, inTransit, volumeL };
  }, [totals, rows]);

  const storagePerDay = kpi.volumeL * DEFAULTS.storagePerLiterPerDay;
  const storagePerMonth = totals?.storagePerMonth ?? Math.round(storagePerDay * 30);

  const byStore = useMemo(() => {
    if (totals?.byStore?.length) {
      return totals.byStore.map((s, i) => ({
        name: s.title,
        value: s.amount,
        color: SERIES_PALETTE[i % SERIES_PALETTE.length],
      }));
    }
    const map = new Map<string, number>();
    rows.forEach((r) => {
      const key = r.storeTitle ?? tc('common.store');
      map.set(key, (map.get(key) ?? 0) + (r.costValue ?? 0));
    });
    return [...map.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([name, value], i) => ({ name, value, color: SERIES_PALETTE[i % SERIES_PALETTE.length] }));
  }, [totals, rows, tc]);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return rows;
    return rows.filter((r) => r.title.toLowerCase().includes(s) || r.sku.toLowerCase().includes(s));
  }, [rows, search]);

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pages);
  const pageRows = useMemo(
    () => filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE),
    [filtered, safePage],
  );

  async function handleExport() {
    setExporting(true);
    try {
      const blob = await api.blob('/export/warehouse', q);
      downloadBlob(blob, `warehouse-${q.from}-${q.to}.xlsx`);
      toast.success(t('export.done'));
    } catch {
      toast.error(t('export.error'));
    } finally {
      setExporting(false);
    }
  }

  const columns: Column<WarehouseRow>[] = [
    {
      key: 'product',
      header: t('col.product'),
      width: 300,
      sortable: true,
      sortValue: (r) => r.title,
      render: (r) => <ProductCell title={r.title} subtitle={r.sku} imageUrl={r.imageUrl} />,
    },
    {
      key: 'store',
      header: t('col.store'),
      hideOnMobile: true,
      sortValue: (r) => r.storeTitle ?? '',
      render: (r) => <span className="truncate text-sm text-muted">{r.storeTitle ?? '—'}</span>,
    },
    {
      key: 'own',
      header: t('col.own'),
      align: 'right',
      sortable: true,
      sortValue: (r) => r.own ?? 0,
      render: (r) => <span className="font-semibold text-ink">{f.num(r.own ?? 0)}</span>,
    },
    {
      key: 'reserved',
      header: t('col.reserved'),
      align: 'right',
      sortable: true,
      sortValue: (r) => r.reserved ?? 0,
      render: (r) => <ZeroAware value={r.reserved ?? 0} tone="text-warn" text={f.num(r.reserved ?? 0)} />,
    },
    {
      key: 'inTransit',
      header: t('col.inTransit'),
      align: 'right',
      hideOnMobile: true,
      sortable: true,
      sortValue: (r) => r.inTransit ?? 0,
      render: (r) => <ZeroAware value={r.inTransit ?? 0} tone="text-info" text={f.num(r.inTransit ?? 0)} />,
    },
    {
      key: 'available',
      header: t('col.available'),
      align: 'right',
      hideOnMobile: true,
      sortable: true,
      sortValue: (r) => (r.own ?? 0) - (r.reserved ?? 0),
      render: (r) => f.num(Math.max(0, (r.own ?? 0) - (r.reserved ?? 0))),
    },
    {
      key: 'volume',
      header: t('col.volume'),
      align: 'right',
      hideOnMobile: true,
      sortable: true,
      sortValue: (r) => r.volumeL ?? 0,
      render: (r) => (r.volumeL ? f.num(r.volumeL, 1) : <span className="text-muted">—</span>),
    },
    {
      key: 'value',
      header: t('col.value'),
      align: 'right',
      sortable: true,
      sortValue: (r) => r.costValue ?? 0,
      render: (r) => f.money(r.costValue ?? 0),
    },
  ];

  return (
    <>
      <PageHeader
        icon={<WarehouseIcon className="h-5 w-5" />}
        title={t('title')}
        description={t('subtitle')}
        badge={<PreviewBadge feature="warehouse" />}
        actions={
          <Button variant="outline" icon={<Download className="h-4 w-4" />} loading={exporting} onClick={handleExport}>
            {tc('btn.export')}
          </Button>
        }
      />

      <FilterBar />

      <PlanGate feature="warehouse">
        <div className="space-y-5">
          <StatGrid>
            <StatCard
              label={t('kpi.units')}
              value={isLoading ? '—' : f.num(kpi.units)}
              hint={t('kpi.unitsHint')}
              icon={<Boxes className="h-5 w-5" />}
              tone="brand"
              loading={isLoading}
            />
            <StatCard
              label={t('kpi.value')}
              value={isLoading ? '—' : f.money(kpi.costValue)}
              hint={t('kpi.valueHint')}
              icon={<Wallet className="h-5 w-5" />}
              tone="violet"
              loading={isLoading}
            />
            <StatCard
              label={t('kpi.reserved')}
              value={isLoading ? '—' : f.num(kpi.reserved)}
              hint={t('kpi.reservedHint')}
              icon={<Lock className="h-5 w-5" />}
              tone="warn"
              loading={isLoading}
            />
            <StatCard
              label={t('kpi.inTransit')}
              value={isLoading ? '—' : f.num(kpi.inTransit)}
              hint={t('kpi.inTransitHint')}
              icon={<Truck className="h-5 w-5" />}
              tone="info"
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
              <div>
                <div className="mb-3">
                  <h2 className="section-title">{t('schemes.title')}</h2>
                  <p className="mt-0.5 text-sm text-muted">{t('schemes.hint')}</p>
                </div>
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  <SchemeShareCard
                    icon={<Building2 className="h-5 w-5" />}
                    title={t('scheme.fbo')}
                    hint={t('scheme.share')}
                    units={Math.round(schemes.fbo.units)}
                    amount={Math.round(schemes.fbo.amount)}
                    share={share(schemes.fbo.units)}
                    tone="brand"
                  />
                  <SchemeShareCard
                    icon={<Truck className="h-5 w-5" />}
                    title={t('scheme.fbs')}
                    hint={t('scheme.share')}
                    units={Math.round(schemes.fbs.units)}
                    amount={Math.round(schemes.fbs.amount)}
                    share={share(schemes.fbs.units)}
                    tone="info"
                  />
                  <SchemeShareCard
                    icon={<WarehouseIcon className="h-5 w-5" />}
                    title={t('scheme.own')}
                    hint={t('scheme.share')}
                    units={Math.round(schemes.own.units)}
                    amount={Math.round(schemes.own.amount)}
                    share={share(schemes.own.units)}
                    tone="violet"
                  />
                </div>
              </div>

              <div className="grid gap-4 xl:grid-cols-2">
                <Card>
                  <CardHeader title={t('stores.title')} subtitle={t('stores.hint')} />
                  <CardBody>
                    {isLoading ? (
                      <SkeletonRows rows={5} />
                    ) : byStore.length === 0 ? (
                      <EmptyState icon={<Building2 className="h-6 w-6" />} title={tc('common.noData')} />
                    ) : (
                      <DonutChart
                        data={byStore}
                        height={260}
                        center={
                          <div>
                            <p className="text-xs text-muted">{tc('common.total')}</p>
                            <p className="tnum font-display text-xl font-extrabold text-ink">
                              {f.compact(byStore.reduce((s, d) => s + d.value, 0))}
                            </p>
                          </div>
                        }
                      />
                    )}
                  </CardBody>
                </Card>

                <Card>
                  <CardHeader
                    title={t('capacity.title')}
                    subtitle={t('capacity.hint')}
                    icon={<Container className="h-4 w-4" />}
                  />
                  <CardBody>
                    {isLoading ? (
                      <SkeletonRows rows={5} />
                    ) : kpi.volumeL <= 0 ? (
                      <EmptyState
                        icon={<Container className="h-6 w-6" />}
                        title={t('capacity.noVolume')}
                        hint={t('capacity.noVolumeHint')}
                      />
                    ) : (
                      <div className="space-y-4">
                        <div className="rounded-2xl border border-line bg-surface-2 p-4">
                          <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                            {t('capacity.volume')}
                          </p>
                          <p className="tnum mt-1 font-display text-3xl font-extrabold text-ink">
                            {f.num(kpi.volumeL, 1)}{' '}
                            <span className="text-base font-bold text-muted">{t('capacity.volumeUnit')}</span>
                          </p>
                          <div className="mt-3">
                            <ProgressBar value={Math.min(100, (kpi.volumeL / 1000) * 100)} tone="violet" showLabel />
                          </div>
                        </div>

                        <div className="grid gap-3 sm:grid-cols-2">
                          <div className="rounded-xl border border-line p-3.5">
                            <p className="text-xs text-muted">{t('capacity.perDay')}</p>
                            <p className="tnum mt-1 text-lg font-bold text-ink">{f.money(Math.round(storagePerDay))}</p>
                          </div>
                          <div className="rounded-xl border border-line p-3.5">
                            <p className="text-xs text-muted">{t('capacity.perMonth')}</p>
                            <p className="tnum mt-1 text-lg font-bold text-warn">{f.money(storagePerMonth)}</p>
                          </div>
                          <div className="rounded-xl border border-line p-3.5">
                            <p className="text-xs text-muted">{t('capacity.rate')}</p>
                            <p className="tnum mt-1 text-lg font-bold text-ink">
                              {f.money(DEFAULTS.storagePerLiterPerDay)}
                            </p>
                          </div>
                          <div className="rounded-xl border border-line p-3.5">
                            <p className="text-xs text-muted">{t('capacity.avgPerUnit')}</p>
                            <p className="tnum mt-1 text-lg font-bold text-ink">
                              {f.num(kpi.units > 0 ? kpi.volumeL / kpi.units : 0, 2)} {t('capacity.volumeUnit')}
                            </p>
                          </div>
                        </div>
                      </div>
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
                <div className="mt-3">
                  <DataTable<WarehouseRow>
                    columns={columns}
                    rows={pageRows}
                    rowKey={(r) => r.skuId}
                    loading={isLoading}
                    stickyFirstColumn
                    empty={
                      <EmptyState
                        icon={<WarehouseIcon className="h-6 w-6" />}
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
                        <td className="tnum px-4 py-3 text-right">
                          {f.num(filtered.reduce((s, r) => s + (r.own ?? 0), 0))}
                        </td>
                        <td className="tnum px-4 py-3 text-right">
                          {f.num(filtered.reduce((s, r) => s + (r.reserved ?? 0), 0))}
                        </td>
                        <td className="tnum hidden px-4 py-3 text-right md:table-cell">
                          {f.num(filtered.reduce((s, r) => s + (r.inTransit ?? 0), 0))}
                        </td>
                        <td className="hidden px-4 py-3 md:table-cell" />
                        <td className="tnum hidden px-4 py-3 text-right md:table-cell">
                          {f.num(filtered.reduce((s, r) => s + (r.volumeL ?? 0), 0), 1)}
                        </td>
                        <td className="tnum px-4 py-3 text-right">
                          {f.money(filtered.reduce((s, r) => s + (r.costValue ?? 0), 0))}
                        </td>
                      </>
                    }
                  />
                </div>
              </Card>
            </>
          )}
        </div>
      </PlanGate>
    </>
  );
}
