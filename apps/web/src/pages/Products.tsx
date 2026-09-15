import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Boxes,
  ChevronLeft,
  ChevronRight,
  Coins,
  Download,
  LayoutGrid,
  Package,
  PackageSearch,
  Rows3,
  ShoppingBag,
} from 'lucide-react';
import type { ProductCard, ProductsResponse } from '@savdoiq/shared';
import {
  Badge,
  Button,
  Card,
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
  StatCard,
  StatGrid,
  toast,
  type Column,
} from '@/components/ui';
import { FilterBar } from '@/components/filters';
import { ProductTile, ProductTileSkeleton } from '@/components/products/ProductTile';
import {
  COVER_OPTIONS,
  PRODUCT_FILTERS,
  PRODUCT_SORTS,
  STATE_STYLE,
  avgPurchasePrice,
  productState,
  totalStock,
  type CoverDays,
  type ProductFilter,
  type ProductSort,
  type ProductView,
} from '@/components/products/types';
import { api } from '@/lib/api';
import { usePeriodQuery } from '@/store/ui';
import { registerNamespace, useFormat, useT } from '@/i18n';
import { cn, downloadBlob } from '@/lib/utils';

registerNamespace('products', {
  uz: {
    title: 'Mahsulotlar',
    subtitle: 'Assortiment, qoldiqlar va rentabellik bir joyda',
    'kpi.products': 'Mahsulotlar',
    'kpi.productsHint': 'Katalogdagi kartochkalar',
    'kpi.skus': 'SKU',
    'kpi.skusHint': 'Barcha variantlar',
    'kpi.inStock': 'Omborda',
    'kpi.inStockHint': 'FBO + FBS + o‘z ombori (dona)',
    'kpi.needOrder': 'Buyurtma kerak',
    'kpi.needOrderHint': 'Zaxira davri uchun yetishmaydi (dona)',
    'kpi.storage': 'Saqlash xarajati',
    'kpi.storageHint': 'Kunlik pullik saqlash',
    'cover.label': 'Zaxira davri',
    'cover.option': '{n} kun',
    'filter.all': 'Barchasi',
    'filter.active': 'Sotuvda',
    'filter.need_order': 'Buyurtma kerak',
    'filter.out': 'Qoldiqsiz',
    'filter.archived': 'Arxiv',
    'state.active': 'Sotuvda',
    'state.need_order': 'Buyurtma kerak',
    'state.out': 'Qoldiqsiz',
    'state.archived': 'Arxiv',
    'view.cards': 'Kartochka',
    'view.table': 'Jadval',
    'sort.revenue': 'Tushum bo‘yicha',
    'sort.profit': 'Foyda bo‘yicha',
    'sort.sold': 'Sotuv bo‘yicha',
    'sort.daysLeft': 'Qoldiq kunlari bo‘yicha',
    'sort.margin': 'Marja bo‘yicha',
    'sort.title': 'Nomi bo‘yicha',
    'search.placeholder': 'Nomi, SKU yoki ID bo‘yicha qidirish',
    'card.skus': '{n} SKU',
    'card.noCategory': 'Kategoriyasiz',
    'card.cost': 'Tannarx',
    'card.noCost': 'Tannarx kiritilmagan',
    'card.conversion': 'Konversiya',
    'card.roi': 'ROI',
    'card.margin': 'Marja',
    'card.fbo': 'FBO',
    'card.fbs': 'FBS',
    'card.own': 'Ombor',
    'card.daysLeft': 'Necha kunga yetadi',
    'card.daysValue': '{n} kun',
    'card.noForecast': 'Prognoz yo‘q',
    'card.stockTotal': 'Jami qoldiq: {n} dona',
    'card.needOrder': 'Buyurtma kerak: {n} dona',
    'card.noStock': 'Qoldiq tugagan',
    'card.details': 'Batafsil',
    'col.product': 'Mahsulot',
    'col.skus': 'SKU',
    'col.price': 'Narx',
    'col.cost': 'Tannarx',
    'col.sold': 'Sotildi',
    'col.stock': 'Qoldiq',
    'col.daysLeft': 'Kun',
    'col.roi': 'ROI',
    'col.margin': 'Marja',
    'col.profit': 'Foyda',
    'empty.title': 'Mahsulot topilmadi',
    'empty.hint': 'Filtrlarni o‘zgartiring yoki qidiruvni tozalang',
    'export.done': 'Excel fayl tayyor',
    'export.error': 'Eksport qilib bo‘lmadi',
    'found.count': '{n} ta mahsulot',
  },
  ru: {
    title: 'Товары',
    subtitle: 'Ассортимент, остатки и рентабельность в одном месте',
    'kpi.products': 'Товары',
    'kpi.productsHint': 'Карточек в каталоге',
    'kpi.skus': 'SKU',
    'kpi.skusHint': 'Все варианты',
    'kpi.inStock': 'На складе',
    'kpi.inStockHint': 'FBO + FBS + свой склад (шт.)',
    'kpi.needOrder': 'Нужен заказ',
    'kpi.needOrderHint': 'Не хватает на выбранный период (шт.)',
    'kpi.storage': 'Хранение',
    'kpi.storageHint': 'Платное хранение в день',
    'cover.label': 'Период запаса',
    'cover.option': '{n} дн.',
    'filter.all': 'Все',
    'filter.active': 'В продаже',
    'filter.need_order': 'Нужен заказ',
    'filter.out': 'Без остатка',
    'filter.archived': 'Архив',
    'state.active': 'В продаже',
    'state.need_order': 'Нужен заказ',
    'state.out': 'Без остатка',
    'state.archived': 'Архив',
    'view.cards': 'Карточки',
    'view.table': 'Таблица',
    'sort.revenue': 'По выручке',
    'sort.profit': 'По прибыли',
    'sort.sold': 'По продажам',
    'sort.daysLeft': 'По дням остатка',
    'sort.margin': 'По марже',
    'sort.title': 'По названию',
    'search.placeholder': 'Поиск по названию, SKU или ID',
    'card.skus': '{n} SKU',
    'card.noCategory': 'Без категории',
    'card.cost': 'Себестоимость',
    'card.noCost': 'Себестоимость не указана',
    'card.conversion': 'Конверсия',
    'card.roi': 'ROI',
    'card.margin': 'Маржа',
    'card.fbo': 'FBO',
    'card.fbs': 'FBS',
    'card.own': 'Склад',
    'card.daysLeft': 'На сколько хватит',
    'card.daysValue': '{n} дн.',
    'card.noForecast': 'Нет прогноза',
    'card.stockTotal': 'Всего остаток: {n} шт.',
    'card.needOrder': 'Нужен заказ: {n} шт.',
    'card.noStock': 'Остаток закончился',
    'card.details': 'Подробнее',
    'col.product': 'Товар',
    'col.skus': 'SKU',
    'col.price': 'Цена',
    'col.cost': 'Себестоимость',
    'col.sold': 'Продано',
    'col.stock': 'Остаток',
    'col.daysLeft': 'Дней',
    'col.roi': 'ROI',
    'col.margin': 'Маржа',
    'col.profit': 'Прибыль',
    'empty.title': 'Товары не найдены',
    'empty.hint': 'Измените фильтры или очистите поиск',
    'export.done': 'Excel-файл готов',
    'export.error': 'Не удалось выгрузить',
    'found.count': '{n} товаров',
  },
  en: {
    title: 'Products',
    subtitle: 'Assortment, stock and profitability in one place',
    'kpi.products': 'Products',
    'kpi.productsHint': 'Cards in the catalogue',
    'kpi.skus': 'SKUs',
    'kpi.skusHint': 'All variants',
    'kpi.inStock': 'In stock',
    'kpi.inStockHint': 'FBO + FBS + own warehouse (units)',
    'kpi.needOrder': 'Reorder needed',
    'kpi.needOrderHint': 'Short for the selected cover period (units)',
    'kpi.storage': 'Storage cost',
    'kpi.storageHint': 'Paid storage per day',
    'cover.label': 'Cover period',
    'cover.option': '{n} days',
    'filter.all': 'All',
    'filter.active': 'On sale',
    'filter.need_order': 'Reorder',
    'filter.out': 'Out of stock',
    'filter.archived': 'Archived',
    'state.active': 'On sale',
    'state.need_order': 'Reorder',
    'state.out': 'Out of stock',
    'state.archived': 'Archived',
    'view.cards': 'Cards',
    'view.table': 'Table',
    'sort.revenue': 'By revenue',
    'sort.profit': 'By profit',
    'sort.sold': 'By units sold',
    'sort.daysLeft': 'By days of cover',
    'sort.margin': 'By margin',
    'sort.title': 'By name',
    'search.placeholder': 'Search by name, SKU or ID',
    'card.skus': '{n} SKUs',
    'card.noCategory': 'No category',
    'card.cost': 'Cost',
    'card.noCost': 'Cost price not set',
    'card.conversion': 'Conversion',
    'card.roi': 'ROI',
    'card.margin': 'Margin',
    'card.fbo': 'FBO',
    'card.fbs': 'FBS',
    'card.own': 'Own',
    'card.daysLeft': 'Days of cover',
    'card.daysValue': '{n} days',
    'card.noForecast': 'No forecast',
    'card.stockTotal': 'Total stock: {n} units',
    'card.needOrder': 'Reorder: {n} units',
    'card.noStock': 'Out of stock',
    'card.details': 'Details',
    'col.product': 'Product',
    'col.skus': 'SKUs',
    'col.price': 'Price',
    'col.cost': 'Cost',
    'col.sold': 'Sold',
    'col.stock': 'Stock',
    'col.daysLeft': 'Days',
    'col.roi': 'ROI',
    'col.margin': 'Margin',
    'col.profit': 'Profit',
    'empty.title': 'No products found',
    'empty.hint': 'Change the filters or clear the search',
    'export.done': 'Excel file is ready',
    'export.error': 'Export failed',
    'found.count': '{n} products',
  },
});

const PAGE_SIZE = 24;
const VIEW_KEY = 'sp-products-view';

function readView(): ProductView {
  try {
    return (localStorage.getItem(VIEW_KEY) as ProductView) === 'table' ? 'table' : 'cards';
  } catch {
    return 'cards';
  }
}

export default function Products() {
  const t = useT('products');
  const f = useFormat();
  const navigate = useNavigate();
  const periodQuery = usePeriodQuery();

  const [cover, setCover] = useState<CoverDays>('30');
  const [filter, setFilter] = useState<ProductFilter>('all');
  const [sort, setSort] = useState<ProductSort>('revenue');
  const [view, setView] = useState<ProductView>(readView);
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [page, setPage] = useState(1);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    const id = setTimeout(() => {
      setDebounced(search.trim());
      setPage(1);
    }, 350);
    return () => clearTimeout(id);
  }, [search]);

  useEffect(() => {
    try {
      localStorage.setItem(VIEW_KEY, view);
    } catch {
      /* noop */
    }
  }, [view]);

  const query = useMemo(
    () => ({
      ...periodQuery,
      cover: Number(cover),
      filter,
      sort,
      search: debounced || undefined,
      page,
      pageSize: PAGE_SIZE,
    }),
    [periodQuery, cover, filter, sort, debounced, page],
  );

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ['products', query],
    queryFn: () => api.get<ProductsResponse>('/products', query),
  });

  const rows = data?.items.items ?? [];
  const totals = data?.totals;

  const onExport = async () => {
    setExporting(true);
    try {
      const blob = await api.blob('/export/products', { ...query, page: undefined, pageSize: undefined });
      downloadBlob(blob, `products-${periodQuery.from}_${periodQuery.to}.xlsx`);
      toast.success(t('export.done'));
    } catch (err) {
      toast.error(t('export.error'), err instanceof Error ? err.message : undefined);
    } finally {
      setExporting(false);
    }
  };

  const columns: Column<ProductCard>[] = useMemo(
    () => [
      {
        key: 'title',
        header: t('col.product'),
        width: 320,
        render: (r) => (
          <ProductCell
            title={r.title}
            subtitle={r.category ?? t('card.noCategory')}
            imageUrl={r.imageUrl}
          />
        ),
        sortable: true,
        sortValue: (r) => r.title,
      },
      {
        key: 'skuCount',
        header: t('col.skus'),
        align: 'right',
        hideOnMobile: true,
        render: (r) => <span className="tnum">{f.num(r.skuCount)}</span>,
        sortable: true,
        sortValue: (r) => r.skuCount,
      },
      {
        key: 'price',
        header: t('col.price'),
        align: 'right',
        render: (r) => <span className="tnum text-ink">{f.money(r.minPrice)}</span>,
        sortable: true,
        sortValue: (r) => r.minPrice,
      },
      {
        key: 'cost',
        header: t('col.cost'),
        align: 'right',
        hideOnMobile: true,
        render: (r) => {
          const cost = avgPurchasePrice(r.skus);
          return cost > 0 ? (
            <span className="tnum">{f.money(cost)}</span>
          ) : (
            <span className="text-warn">—</span>
          );
        },
        sortable: true,
        sortValue: (r) => avgPurchasePrice(r.skus),
      },
      {
        key: 'sold',
        header: t('col.sold'),
        align: 'right',
        render: (r) => <span className="tnum">{f.num(r.sold)}</span>,
        sortable: true,
        sortValue: (r) => r.sold,
      },
      {
        key: 'stock',
        header: t('col.stock'),
        align: 'right',
        render: (r) => <span className="tnum">{f.num(totalStock(r))}</span>,
        sortable: true,
        sortValue: (r) => totalStock(r),
      },
      {
        key: 'daysLeft',
        header: t('col.daysLeft'),
        align: 'right',
        hideOnMobile: true,
        render: (r) => {
          const state = productState(r);
          return r.daysLeft === null || r.daysLeft === undefined ? (
            <span className="text-muted">—</span>
          ) : (
            <span className={cn('tnum font-semibold', STATE_STYLE[state].text)}>{f.num(r.daysLeft)}</span>
          );
        },
        sortable: true,
        sortValue: (r) => r.daysLeft ?? -1,
      },
      {
        key: 'roi',
        header: t('col.roi'),
        align: 'right',
        hideOnMobile: true,
        render: (r) => (
          <span className={cn('tnum', r.roi >= 0 ? 'text-brand' : 'text-danger')}>{f.pct(r.roi)}</span>
        ),
        sortable: true,
        sortValue: (r) => r.roi,
      },
      {
        key: 'margin',
        header: t('col.margin'),
        align: 'right',
        hideOnMobile: true,
        render: (r) => <span className="tnum">{f.pct(r.margin)}</span>,
        sortable: true,
        sortValue: (r) => r.margin,
      },
      {
        key: 'profit',
        header: t('col.profit'),
        align: 'right',
        render: (r) => (
          <span className={cn('tnum font-semibold', r.profit >= 0 ? 'text-ink' : 'text-danger')}>
            {f.money(r.profit)}
          </span>
        ),
        sortable: true,
        sortValue: (r) => r.profit,
      },
    ],
    [t, f],
  );

  return (
    <>
      <PageHeader
        icon={<Package className="h-5 w-5" />}
        title={t('title')}
        description={t('subtitle')}
        badge={<PreviewBadge feature="products_assortment" />}
        actions={
          <Button
            variant="outline"
            icon={<Download className="h-4 w-4" />}
            loading={exporting}
            onClick={onExport}
          >
            {t('btn.export')}
          </Button>
        }
      />

      <FilterBar />

      <PlanGate feature="products_assortment">
        {/*
          Xato bo'lganda KPI kartochkalari "0" va "0 so'm" ko'rsatib turmasin —
          foydalanuvchi buni haqiqiy raqam deb o'ylashi mumkin.
        */}
        {isError ? (
          <Card>
            <ErrorState
              message={error instanceof Error ? error.message : undefined}
              onRetry={() => void refetch()}
              retryLabel={t('btn.retry')}
            />
          </Card>
        ) : (
        <div className="space-y-5">
          {/* KPI */}
          <StatGrid className="xl:grid-cols-5">
            <StatCard
              label={t('kpi.products')}
              value={f.num(totals?.products ?? 0)}
              hint={t('kpi.productsHint')}
              icon={<Package className="h-5 w-5" />}
              loading={isLoading}
            />
            <StatCard
              label={t('kpi.skus')}
              value={f.num(totals?.skus ?? 0)}
              hint={t('kpi.skusHint')}
              icon={<Boxes className="h-5 w-5" />}
              tone="info"
              loading={isLoading}
            />
            <StatCard
              label={t('kpi.inStock')}
              value={f.num(totals?.inStock ?? 0)}
              hint={t('kpi.inStockHint')}
              icon={<ShoppingBag className="h-5 w-5" />}
              tone="violet"
              loading={isLoading}
            />
            <StatCard
              label={t('kpi.needOrder')}
              value={f.num(totals?.needOrder ?? 0)}
              hint={t('kpi.needOrderHint')}
              icon={<PackageSearch className="h-5 w-5" />}
              tone={(totals?.needOrder ?? 0) > 0 ? 'warn' : 'brand'}
              loading={isLoading}
            />
            <StatCard
              label={t('kpi.storage')}
              value={f.money(totals?.storageCostPerDay ?? 0)}
              hint={t('kpi.storageHint')}
              icon={<Coins className="h-5 w-5" />}
              tone="danger"
              loading={isLoading}
            />
          </StatGrid>

          {/* Boshqaruv paneli */}
          <Card className="p-4">
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2">
                  <span className="hidden text-xs font-semibold uppercase tracking-wide text-muted sm:inline">
                    {t('cover.label')}
                  </span>
                  <Segmented<CoverDays>
                    size="sm"
                    value={cover}
                    onChange={(v) => {
                      setCover(v);
                      setPage(1);
                    }}
                    options={COVER_OPTIONS.map((c) => ({ value: c, label: t('cover.option', { n: c }) }))}
                  />
                </div>

                <div className="ml-auto flex items-center gap-2">
                  <div className="w-44 sm:w-52">
                    <Select
                      className="h-10"
                      value={sort}
                      onChange={(e) => {
                        setSort(e.target.value as ProductSort);
                        setPage(1);
                      }}
                    >
                      {PRODUCT_SORTS.map((s) => (
                        <option key={s} value={s}>
                          {t(`sort.${s}`)}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <Segmented<ProductView>
                    size="sm"
                    value={view}
                    onChange={setView}
                    options={[
                      { value: 'cards', label: <LayoutGrid className="h-4 w-4" /> },
                      { value: 'table', label: <Rows3 className="h-4 w-4" /> },
                    ]}
                  />
                </div>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <div className="-mx-1 overflow-x-auto px-1 no-scrollbar">
                  <Segmented<ProductFilter>
                    size="sm"
                    value={filter}
                    onChange={(v) => {
                      setFilter(v);
                      setPage(1);
                    }}
                    options={PRODUCT_FILTERS.map((s) => ({ value: s, label: t(`filter.${s}`) }))}
                  />
                </div>
                <SearchInput
                  className="sm:ml-auto sm:max-w-xs"
                  value={search}
                  onChange={setSearch}
                  placeholder={t('search.placeholder')}
                />
              </div>
            </div>
          </Card>

          {/* Ro'yxat — xato holati yuqorida hal qilingan */}
          {view === 'cards' ? (
            isLoading ? (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {Array.from({ length: 8 }).map((_, i) => (
                  <ProductTileSkeleton key={i} />
                ))}
              </div>
            ) : rows.length === 0 ? (
              <Card>
                <EmptyState
                  icon={<PackageSearch className="h-6 w-6" />}
                  title={t('empty.title')}
                  hint={t('empty.hint')}
                  action={
                    <Button
                      variant="outline"
                      onClick={() => {
                        setSearch('');
                        setFilter('all');
                        setPage(1);
                      }}
                    >
                      {t('btn.all')}
                    </Button>
                  }
                />
              </Card>
            ) : (
              <div className={cn('space-y-4', isFetching && 'opacity-70 transition-opacity')}>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                  {rows.map((p) => (
                    <ProductTile key={p.id} product={p} coverDays={Number(cover)} />
                  ))}
                </div>
                <Pager
                  page={data?.items.page ?? 1}
                  pages={data?.items.pages ?? 1}
                  total={data?.items.total ?? 0}
                  label={t('found.count', { n: f.num(data?.items.total ?? 0) })}
                  onPage={setPage}
                />
              </div>
            )
          ) : (
            <Card className="overflow-hidden">
              <DataTable<ProductCard>
                columns={columns}
                rows={rows}
                rowKey={(r) => r.id}
                loading={isLoading}
                onRowClick={(r) => navigate(`/products/${r.id}`)}
                empty={
                  <EmptyState
                    icon={<PackageSearch className="h-6 w-6" />}
                    title={t('empty.title')}
                    hint={t('empty.hint')}
                  />
                }
                pagination={{
                  page: data?.items.page ?? 1,
                  pages: data?.items.pages ?? 1,
                  total: data?.items.total ?? 0,
                  pageSize: PAGE_SIZE,
                  onPage: setPage,
                }}
              />
            </Card>
          )}
        </div>
        )}
      </PlanGate>
    </>
  );
}

/** Kartochka ko'rinishi uchun oddiy sahifalash */
function Pager({
  page,
  pages,
  total,
  label,
  onPage,
}: {
  page: number;
  pages: number;
  total: number;
  label: string;
  onPage: (p: number) => void;
}) {
  if (pages <= 1) {
    return <p className="text-center text-xs text-muted">{label}</p>;
  }
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-surface px-4 py-3">
      <p className="text-xs text-muted">
        {label} <span className="opacity-60">·</span> <span className="tnum">{page}</span> / {pages}
      </p>
      <div className="flex items-center gap-2">
        <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => onPage(page - 1)}>
          <ChevronLeft className="h-3.5 w-3.5" />
        </Button>

        <Button size="sm" variant="outline" disabled={page >= pages} onClick={() => onPage(page + 1)}>
          <ChevronRight className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
