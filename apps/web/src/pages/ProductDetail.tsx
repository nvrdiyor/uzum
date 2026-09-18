import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  ImageOff,
  Layers,
  MessageSquare,
  Package,
  Scale,
  Star,
  TrendingUp,
  Undo2,
} from 'lucide-react';
import {
  Badge,
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
  ProgressBar,
  Skeleton,
  SkeletonRows,
  StatCard,
  StatGrid,
  toast,
  type Column,
} from '@/components/ui';
import { ChartCard, DonutChart, LinesChart, TrendChart, CHART_COLORS } from '@/components/charts';
import { FilterBar } from '@/components/filters';
import { InlineCostInput } from '@/components/products/InlineCostInput';
import { MissingCostBanner } from '@/components/products/MissingCostBanner';
import {
  STATE_STYLE,
  normalizeProductDetail,
  productState,
  skuTotalCost,
  skusWithoutCost,
  totalStock,
  type ProductDetailResponse,
  type ProductDetailSku,
} from '@/components/products/types';
import { api } from '@/lib/api';
import { usePeriodQuery } from '@/store/ui';
import { registerNamespace, useFormat, useT } from '@/i18n';
import { cn } from '@/lib/utils';

registerNamespace('productDetail', {
  uz: {
    back: 'Mahsulotlarga qaytish',
    subtitle: '{sku} SKU · {cat}',
    notFound: 'Mahsulot topilmadi',
    notFoundHint: 'Bu mahsulot o‘chirilgan yoki sizga tegishli emas',
    'state.active': 'Sotuvda',
    'state.need_order': 'Buyurtma kerak',
    'state.out': 'Qoldiqsiz',
    'state.archived': 'Arxiv',
    'kpi.revenue': 'Tushum',
    'kpi.profit': 'Sof foyda',
    'kpi.roi': 'ROI',
    'kpi.roiNoCost': 'Tannarx kiritilmagan',
    'kpi.margin': 'Marja',
    'info.price': 'Narx',
    'info.cost': 'Tannarx',
    'info.sold': 'Sotildi',
    'info.revenue': 'Tushum',
    'info.profit': 'Foyda',
    'info.roi': 'ROI',
    'info.margin': 'Marja',
    'info.rating': 'Reyting',
    'info.returns': 'Qaytarishlar',
    'info.stock': 'Qoldiq',
    'info.conversion': 'Konversiya',
    'info.daysLeft': 'Qoldiq yetadi',
    'info.days': '{n} kun',
    'info.noForecast': 'Prognoz yo‘q',
    'info.units': '{n} dona',
    'info.reviews': '{n} sharh',
    'tab.sales': 'Sotuv dinamikasi',
    'tab.stocks': 'Qoldiqlar',
    'tab.skus': 'SKU’lar',
    'tab.unit': 'Unit-iqtisod',
    'tab.reviews': 'Sharhlar',
    'sales.title': 'Sotuv dinamikasi',
    'sales.subtitle': 'Oxirgi 60 kun: tushum, foyda va dona',
    'sales.revenue': 'Tushum',
    'sales.profit': 'Foyda',
    'sales.units': 'Dona',
    'stocks.title': 'Qoldiqlar tarixi',
    'stocks.subtitle': 'FBO, FBS va o‘z ombori bo‘yicha',
    'stocks.fbo': 'FBO',
    'stocks.fbs': 'FBS',
    'stocks.own': 'Ombor',
    'skus.title': 'SKU’lar',
    'skus.subtitle': 'Tannarxni to‘g‘ridan-to‘g‘ri jadvalda tahrirlash mumkin',
    'skus.sku': 'SKU',
    'skus.name': 'Nomi',
    'skus.price': 'Narx',
    'skus.cost': 'Tannarx',
    'skus.stock': 'Qoldiq',
    'skus.sold': 'Sotildi',
    'skus.profit': 'Foyda',
    'skus.costPlaceholder': 'Tannarx',
    'cost.saved': 'Tannarx yangilandi',
    'cost.savedBody': '{sku} uchun yangi tannarx saqlandi',
    'cost.error': 'Tannarxni saqlab bo‘lmadi',
    'cost.bulkSaved': 'Tannarx barcha SKU’larga qo‘llandi',
    'cost.missingTitle': 'Tannarx kiritilmagan — foyda noto‘g‘ri hisoblanadi',
    'cost.missingHint': '{n} ta SKU uchun tannarx yo‘q. Uni kiriting — ROI va marja aniq bo‘ladi.',
    'cost.quickPlaceholder': 'Tannarx, so‘m',
    'cost.applyAll': 'Hammasiga qo‘llash',
    'unit.title': 'Bir dona bo‘yicha iqtisod',
    'unit.subtitle': 'Xarajatlar taqsimoti va sof foyda',
    'unit.cogs': 'Tannarx',
    'unit.commission': 'Komissiya',
    'unit.logistics': 'Logistika',
    'unit.storage': 'Saqlash',
    'unit.other': 'Qo‘shimcha',
    'unit.tax': 'Soliq',
    'unit.net': 'Sof foyda (1 dona)',
    'unit.price': 'Sotuv narxi',
    'unit.costTotal': 'Jami xarajat',
    'unit.breakEven': 'Zararsizlik narxi',
    'unit.empty': 'Unit-iqtisod uchun tannarx kerak',
    'unit.emptyHint': 'SKU’lar bo‘limida tannarxni kiriting',
    'reviews.title': 'Sharhlar',
    'reviews.subtitle': 'Reyting taqsimoti va oxirgi izohlar',
    'reviews.avg': 'O‘rtacha reyting',
    'reviews.count': 'Jami sharhlar',
    'reviews.answered': 'Javob berilgan',
    'reviews.unanswered': 'Javobsiz',
    'reviews.latest': 'Oxirgi sharhlar',
    'reviews.empty': 'Sharhlar yo‘q',
    'reviews.emptyHint': 'Bu mahsulotga hali sharh yozilmagan',
    'reviews.answerLabel': 'Javob',
    'reviews.noAnswer': 'Javob berilmagan',
    'empty.series': 'Tanlangan davrda sotuv bo‘lmagan',
    'empty.stocks': 'Qoldiqlar tarixi yo‘q',
    'empty.skus': 'SKU topilmadi',
  },
  ru: {
    back: 'К товарам',
    subtitle: '{sku} SKU · {cat}',
    notFound: 'Товар не найден',
    notFoundHint: 'Товар удалён или не принадлежит вам',
    'state.active': 'В продаже',
    'state.need_order': 'Нужен заказ',
    'state.out': 'Без остатка',
    'state.archived': 'Архив',
    'kpi.revenue': 'Выручка',
    'kpi.profit': 'Чистая прибыль',
    'kpi.roi': 'ROI',
    'kpi.roiNoCost': 'Себестоимость не заполнена',
    'kpi.margin': 'Маржа',
    'info.price': 'Цена',
    'info.cost': 'Себестоимость',
    'info.sold': 'Продано',
    'info.revenue': 'Выручка',
    'info.profit': 'Прибыль',
    'info.roi': 'ROI',
    'info.margin': 'Маржа',
    'info.rating': 'Рейтинг',
    'info.returns': 'Возвраты',
    'info.stock': 'Остаток',
    'info.conversion': 'Конверсия',
    'info.daysLeft': 'Хватит на',
    'info.days': '{n} дн.',
    'info.noForecast': 'Нет прогноза',
    'info.units': '{n} шт.',
    'info.reviews': '{n} отзывов',
    'tab.sales': 'Динамика продаж',
    'tab.stocks': 'Остатки',
    'tab.skus': 'SKU',
    'tab.unit': 'Юнит-экономика',
    'tab.reviews': 'Отзывы',
    'sales.title': 'Динамика продаж',
    'sales.subtitle': 'Последние 60 дней: выручка, прибыль и штуки',
    'sales.revenue': 'Выручка',
    'sales.profit': 'Прибыль',
    'sales.units': 'Штук',
    'stocks.title': 'История остатков',
    'stocks.subtitle': 'По FBO, FBS и своему складу',
    'stocks.fbo': 'FBO',
    'stocks.fbs': 'FBS',
    'stocks.own': 'Склад',
    'skus.title': 'SKU',
    'skus.subtitle': 'Себестоимость можно менять прямо в таблице',
    'skus.sku': 'SKU',
    'skus.name': 'Название',
    'skus.price': 'Цена',
    'skus.cost': 'Себестоимость',
    'skus.stock': 'Остаток',
    'skus.sold': 'Продано',
    'skus.profit': 'Прибыль',
    'skus.costPlaceholder': 'Себест.',
    'cost.saved': 'Себестоимость обновлена',
    'cost.savedBody': 'Новое значение сохранено для {sku}',
    'cost.error': 'Не удалось сохранить себестоимость',
    'cost.bulkSaved': 'Себестоимость применена ко всем SKU',
    'cost.missingTitle': 'Себестоимость не указана — прибыль считается неверно',
    'cost.missingHint': 'У {n} SKU нет себестоимости. Укажите её — ROI и маржа станут точными.',
    'cost.quickPlaceholder': 'Себестоимость, сум',
    'cost.applyAll': 'Применить ко всем',
    'unit.title': 'Экономика одной единицы',
    'unit.subtitle': 'Структура расходов и чистая прибыль',
    'unit.cogs': 'Себестоимость',
    'unit.commission': 'Комиссия',
    'unit.logistics': 'Логистика',
    'unit.storage': 'Хранение',
    'unit.other': 'Прочее',
    'unit.tax': 'Налог',
    'unit.net': 'Чистая прибыль (1 шт.)',
    'unit.price': 'Цена продажи',
    'unit.costTotal': 'Всего расходов',
    'unit.breakEven': 'Цена безубыточности',
    'unit.empty': 'Для юнит-экономики нужна себестоимость',
    'unit.emptyHint': 'Укажите себестоимость в разделе SKU',
    'reviews.title': 'Отзывы',
    'reviews.subtitle': 'Распределение рейтинга и последние отзывы',
    'reviews.avg': 'Средний рейтинг',
    'reviews.count': 'Всего отзывов',
    'reviews.answered': 'С ответом',
    'reviews.unanswered': 'Без ответа',
    'reviews.latest': 'Последние отзывы',
    'reviews.empty': 'Отзывов нет',
    'reviews.emptyHint': 'На этот товар ещё не оставили отзывов',
    'reviews.answerLabel': 'Ответ',
    'reviews.noAnswer': 'Без ответа',
    'empty.series': 'За выбранный период продаж не было',
    'empty.stocks': 'Нет истории остатков',
    'empty.skus': 'SKU не найдены',
  },
  en: {
    back: 'Back to products',
    subtitle: '{sku} SKUs · {cat}',
    notFound: 'Product not found',
    notFoundHint: 'It was removed or does not belong to you',
    'state.active': 'On sale',
    'state.need_order': 'Reorder',
    'state.out': 'Out of stock',
    'state.archived': 'Archived',
    'kpi.revenue': 'Revenue',
    'kpi.profit': 'Net profit',
    'kpi.roi': 'ROI',
    'kpi.roiNoCost': 'Cost price not set',
    'kpi.margin': 'Margin',
    'info.price': 'Price',
    'info.cost': 'Cost price',
    'info.sold': 'Sold',
    'info.revenue': 'Revenue',
    'info.profit': 'Profit',
    'info.roi': 'ROI',
    'info.margin': 'Margin',
    'info.rating': 'Rating',
    'info.returns': 'Returns',
    'info.stock': 'Stock',
    'info.conversion': 'Conversion',
    'info.daysLeft': 'Days of cover',
    'info.days': '{n} days',
    'info.noForecast': 'No forecast',
    'info.units': '{n} units',
    'info.reviews': '{n} reviews',
    'tab.sales': 'Sales trend',
    'tab.stocks': 'Stock levels',
    'tab.skus': 'SKUs',
    'tab.unit': 'Unit economics',
    'tab.reviews': 'Reviews',
    'sales.title': 'Sales trend',
    'sales.subtitle': 'Last 60 days: revenue, profit and units',
    'sales.revenue': 'Revenue',
    'sales.profit': 'Profit',
    'sales.units': 'Units',
    'stocks.title': 'Stock history',
    'stocks.subtitle': 'FBO, FBS and own warehouse',
    'stocks.fbo': 'FBO',
    'stocks.fbs': 'FBS',
    'stocks.own': 'Own',
    'skus.title': 'SKUs',
    'skus.subtitle': 'Cost price can be edited straight in the table',
    'skus.sku': 'SKU',
    'skus.name': 'Name',
    'skus.price': 'Price',
    'skus.cost': 'Cost',
    'skus.stock': 'Stock',
    'skus.sold': 'Sold',
    'skus.profit': 'Profit',
    'skus.costPlaceholder': 'Cost',
    'cost.saved': 'Cost price updated',
    'cost.savedBody': 'New cost saved for {sku}',
    'cost.error': 'Could not save the cost price',
    'cost.bulkSaved': 'Cost applied to every SKU',
    'cost.missingTitle': 'Cost price is missing — profit is calculated incorrectly',
    'cost.missingHint': '{n} SKUs have no cost price. Fill it in to get accurate ROI and margin.',
    'cost.quickPlaceholder': 'Cost price, UZS',
    'cost.applyAll': 'Apply to all',
    'unit.title': 'Per-unit economics',
    'unit.subtitle': 'Cost structure and net profit',
    'unit.cogs': 'Cost price',
    'unit.commission': 'Commission',
    'unit.logistics': 'Logistics',
    'unit.storage': 'Storage',
    'unit.other': 'Other',
    'unit.tax': 'Tax',
    'unit.net': 'Net profit (1 unit)',
    'unit.price': 'Selling price',
    'unit.costTotal': 'Total cost',
    'unit.breakEven': 'Break-even price',
    'unit.empty': 'Unit economics needs a cost price',
    'unit.emptyHint': 'Set the cost price in the SKUs tab',
    'reviews.title': 'Reviews',
    'reviews.subtitle': 'Rating distribution and latest feedback',
    'reviews.avg': 'Average rating',
    'reviews.count': 'Total reviews',
    'reviews.answered': 'Answered',
    'reviews.unanswered': 'Unanswered',
    'reviews.latest': 'Latest reviews',
    'reviews.empty': 'No reviews',
    'reviews.emptyHint': 'Nobody has reviewed this product yet',
    'reviews.answerLabel': 'Reply',
    'reviews.noAnswer': 'Not answered',
    'empty.series': 'No sales in the selected period',
    'empty.stocks': 'No stock history',
    'empty.skus': 'No SKUs found',
  },
});

type Tab = 'sales' | 'stocks' | 'skus' | 'unit' | 'reviews';
const TABS: Tab[] = ['sales', 'stocks', 'skus', 'unit', 'reviews'];

export default function ProductDetail() {
  const t = useT('productDetail');
  const f = useFormat();
  const { id = '' } = useParams<{ id: string }>();
  const periodQuery = usePeriodQuery();
  const qc = useQueryClient();

  const [tab, setTab] = useState<Tab>('sales');
  const [savingSku, setSavingSku] = useState<string | null>(null);
  const [savedSku, setSavedSku] = useState<string | null>(null);

  const queryKey = useMemo(() => ['product', id, periodQuery] as const, [id, periodQuery]);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey,
    queryFn: () => api.get<unknown>(`/products/${id}`, periodQuery).then(normalizeProductDetail),
    enabled: Boolean(id),
  });

  const product = data?.product;
  const skus = data?.skus ?? [];
  const missing = skusWithoutCost(skus);
  /** Kamida bitta SKU da tannarx kiritilganmi */
  const hasCost = skus.some((sku) => (sku.purchasePrice ?? 0) > 0);

  /** Bitta SKU tannarxi — optimistik yangilanish bilan */
  const patchCost = useMutation({
    mutationFn: (v: { skuId: string; purchasePrice: number }) =>
      api.patch<unknown>(`/products/sku/${v.skuId}`, { purchasePrice: v.purchasePrice }),
    onMutate: async (v) => {
      setSavingSku(v.skuId);
      await qc.cancelQueries({ queryKey });
      const prev = qc.getQueryData<ProductDetailResponse>(queryKey);
      qc.setQueryData<ProductDetailResponse>(queryKey, (old) =>
        old
          ? {
              ...old,
              skus: (old.skus ?? []).map((s) =>
                s.id === v.skuId ? { ...s, purchasePrice: v.purchasePrice } : s,
              ),
            }
          : old,
      );
      return { prev };
    },
    onError: (err, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(queryKey, ctx.prev);
      toast.error(t('cost.error'), err instanceof Error ? err.message : undefined);
    },
    onSuccess: (_res, v) => {
      const sku = skus.find((s) => s.id === v.skuId);
      toast.success(t('cost.saved'), t('cost.savedBody', { sku: sku?.sku ?? v.skuId }));
      setSavedSku(v.skuId);
      setTimeout(() => setSavedSku((cur) => (cur === v.skuId ? null : cur)), 2000);
    },
    onSettled: () => {
      setSavingSku(null);
      void qc.invalidateQueries({ queryKey });
    },
  });

  /** Bo'sh tannarxlarni bir vaqtda to'ldirish */
  const bulkCost = useMutation({
    mutationFn: (purchasePrice: number) =>
      api.post<unknown>('/products/sku/bulk-cost', {
        items: missing.map((s) => ({ skuId: s.id, purchasePrice, extraCost: s.extraCost ?? 0 })),
      }),
    onMutate: async (purchasePrice) => {
      await qc.cancelQueries({ queryKey });
      const prev = qc.getQueryData<ProductDetailResponse>(queryKey);
      const ids = new Set(missing.map((s) => s.id));
      qc.setQueryData<ProductDetailResponse>(queryKey, (old) =>
        old
          ? { ...old, skus: (old.skus ?? []).map((s) => (ids.has(s.id) ? { ...s, purchasePrice } : s)) }
          : old,
      );
      return { prev };
    },
    onError: (err, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(queryKey, ctx.prev);
      toast.error(t('cost.error'), err instanceof Error ? err.message : undefined);
    },
    onSuccess: () => toast.success(t('cost.bulkSaved')),
    onSettled: () => void qc.invalidateQueries({ queryKey }),
  });

  const skuColumns: Column<ProductDetailSku>[] = useMemo(
    () => [
      {
        key: 'sku',
        header: t('skus.sku'),
        width: 160,
        render: (r) => <span className="tnum text-sm font-semibold text-ink">{r.sku}</span>,
        sortable: true,
        sortValue: (r) => r.sku,
      },
      {
        key: 'title',
        header: t('skus.name'),
        hideOnMobile: true,
        render: (r) => <span className="text-sm text-ink-soft">{r.title}</span>,
        sortable: true,
        sortValue: (r) => r.title,
      },
      {
        key: 'price',
        header: t('skus.price'),
        align: 'right',
        render: (r) => <span className="tnum text-ink">{f.money(r.price)}</span>,
        sortable: true,
        sortValue: (r) => r.price,
      },
      {
        key: 'cost',
        header: t('skus.cost'),
        align: 'right',
        width: 150,
        render: (r) => (
          <InlineCostInput
            value={r.purchasePrice ?? 0}
            placeholder={t('skus.costPlaceholder')}
            saving={savingSku === r.id}
            saved={savedSku === r.id}
            onSave={(next) => patchCost.mutate({ skuId: r.id, purchasePrice: next })}
          />
        ),
        sortValue: (r) => r.purchasePrice ?? 0,
      },
      {
        key: 'stock',
        header: t('skus.stock'),
        align: 'right',
        render: (r) => (
          <span className="tnum">{f.num((r.stockFbo ?? 0) + (r.stockFbs ?? 0) + (r.stockOwn ?? 0))}</span>
        ),
        sortable: true,
        sortValue: (r) => (r.stockFbo ?? 0) + (r.stockFbs ?? 0) + (r.stockOwn ?? 0),
      },
      {
        key: 'sold',
        header: t('skus.sold'),
        align: 'right',
        render: (r) => <span className="tnum">{f.num(r.sold)}</span>,
        sortable: true,
        sortValue: (r) => r.sold,
      },
      {
        key: 'profit',
        header: t('skus.profit'),
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
    [t, f, savingSku, savedSku, patchCost],
  );

  // ─────────── Yuklanish / xato / bo'sh ───────────

  if (isLoading) {
    return (
      <>
        <BackLink label={t('back')} />
        <PageHeader icon={<Package className="h-5 w-5" />} title={<Skeleton className="h-6 w-64" />} />
        <div className="space-y-5">
          <StatGrid>
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-32 w-full" />
            ))}
          </StatGrid>
          <Card className="p-5">
            <SkeletonRows rows={6} />
          </Card>
        </div>
      </>
    );
  }

  if (isError) {
    return (
      <>
        <BackLink label={t('back')} />
        <Card>
          <ErrorState
            message={error instanceof Error ? error.message : undefined}
            onRetry={() => void refetch()}
            retryLabel={t('btn.retry')}
          />
        </Card>
      </>
    );
  }

  if (!product) {
    return (
      <>
        <BackLink label={t('back')} />
        <Card>
          <EmptyState
            icon={<Package className="h-6 w-6" />}
            title={t('notFound')}
            hint={t('notFoundHint')}
            action={
              <Link to="/products">
                <Button variant="outline">{t('back')}</Button>
              </Link>
            }
          />
        </Card>
      </>
    );
  }

  const state = productState(product);
  const stock = totalStock(product);

  return (
    <>
      <BackLink label={t('back')} />

      <PageHeader
        icon={<Package className="h-5 w-5" />}
        title={product.title}
        description={t('subtitle', { sku: product.skuCount, cat: product.category ?? '—' })}
        badge={
          <span className="flex flex-wrap items-center gap-2">
            <span className={cn('chip', STATE_STYLE[state].chip)}>
              <span className={cn('h-1.5 w-1.5 rounded-full', STATE_STYLE[state].dot)} />
              {t(`state.${state}`)}
            </span>
            <PreviewBadge feature="products_assortment" />
          </span>
        }
        actions={
          product.rating > 0 ? (
            <Badge tone="warn">
              <Star className="h-3.5 w-3.5" />
              <span className="tnum">{f.num(product.rating, 1)}</span>
              <span className="opacity-80">· {t('info.reviews', { n: f.num(product.reviewsCount) })}</span>
            </Badge>
          ) : undefined
        }
      />

      <FilterBar />

      <PlanGate feature="products_assortment">
        <div className="space-y-5">
          {/* KPI */}
          <StatGrid>
            <StatCard
              label={t('kpi.revenue')}
              value={f.money(product.revenue)}
              icon={<TrendingUp className="h-5 w-5" />}
            />
            <StatCard
              label={t('kpi.profit')}
              value={f.money(product.profit)}
              icon={<Scale className="h-5 w-5" />}
              tone={product.profit >= 0 ? 'brand' : 'danger'}
            />
            <StatCard
              label={t('kpi.roi')}
              /* Tannarx kiritilmagan bo'lsa ROI hisoblanmaydi — "0,0%" chalg'itadi */
              /* Manfiy ROI ham haqiqiy natija — uni "tannarx yo'q" deb ko'rsatmaymiz */
              value={hasCost ? f.pct(product.roi) : '—'}
              hint={hasCost ? undefined : t('kpi.roiNoCost')}
              icon={<Layers className="h-5 w-5" />}
              tone={product.roi >= 0 ? 'info' : 'danger'}
            />
            <StatCard
              label={t('kpi.margin')}
              value={f.pct(product.margin)}
              icon={<Scale className="h-5 w-5" />}
              tone="violet"
            />
          </StatGrid>

          {/* Rasm + asosiy ko'rsatkichlar */}
          <Card className="p-5">
            <div className="flex flex-col gap-5 lg:flex-row">
              {/* Rasm mobil ekranda ham o'lchovli bo'lsin — aks holda bo'sh kvadrat
                  butun ekranni egallardi */}
              <div className="w-full max-w-[200px] shrink-0 sm:max-w-[224px] lg:w-56">
                <div className="relative aspect-square overflow-hidden rounded-2xl border border-line bg-surface-2">
                  {product.imageUrl ? (
                    <img src={product.imageUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-muted">
                      <ImageOff className="h-8 w-8" />
                    </div>
                  )}
                </div>
              </div>

              <div className="min-w-0 flex-1">
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
                  <Metric label={t('info.price')} value={f.money(product.minPrice)} />
                  <Metric
                    label={t('info.cost')}
                    value={
                      avgCost(skus) > 0 ? f.money(avgCost(skus)) : '—'
                    }
                    tone={avgCost(skus) > 0 ? undefined : 'warn'}
                  />
                  <Metric label={t('info.sold')} value={t('info.units', { n: f.num(product.sold) })} />
                  {/* Tushum, foyda, ROI va marja yuqoridagi KPI qatorida bor —
                      bu yerda takrorlanmaydi (ustiga-ustak ROI u yerda "—",
                      bu yerda "0,0%" bo'lib, bir-biriga zid ko'rinardi) */}
                  <Metric label={t('info.conversion')} value={f.pct(product.conversion)} />
                  <Metric
                    label={t('info.rating')}
                    value={product.rating > 0 ? f.num(product.rating, 1) : '—'}
                    tone={product.rating > 0 && product.rating < 4 ? 'warn' : undefined}
                  />
                  <Metric
                    label={t('info.returns')}
                    value={t('info.units', { n: f.num(product.returns) })}
                    tone={product.returns > 0 ? 'danger' : undefined}
                  />
                  <Metric label={t('info.stock')} value={t('info.units', { n: f.num(stock) })} />
                  <Metric
                    label={t('info.daysLeft')}
                    value={
                      product.daysLeft === null || product.daysLeft === undefined
                        ? t('info.noForecast')
                        : t('info.days', { n: f.num(product.daysLeft) })
                    }
                    tone={
                      product.daysLeft !== null && product.daysLeft !== undefined && product.daysLeft <= 7
                        ? 'danger'
                        : undefined
                    }
                  />
                </div>

                <div className="mt-4 grid grid-cols-3 gap-2">
                  {(
                    [
                      ['stocks.fbo', product.stockFbo],
                      ['stocks.fbs', product.stockFbs],
                      ['stocks.own', product.stockOwn],
                    ] as const
                  ).map(([key, value]) => (
                    <div key={key} className="rounded-xl border border-line bg-surface-2 px-3 py-2">
                      <p className="eyebrow">{t(key)}</p>
                      <p className="tnum text-sm font-bold text-ink">{f.num(value ?? 0)}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </Card>

          {/* Tannarx ogohlantirishi */}
          <MissingCostBanner
            skus={missing}
            saving={bulkCost.isPending}
            onApply={(v) => bulkCost.mutate(v)}
          />

          {/* Tab'lar */}
          <div className="-mx-1 overflow-x-auto px-1 no-scrollbar">
            <SegmentedTabs value={tab} onChange={setTab} labels={TABS.map((x) => t(`tab.${x}`))} />
          </div>

          {tab === 'sales' ? <SalesTab data={data} /> : null}
          {tab === 'stocks' ? <StocksTab data={data} /> : null}
          {tab === 'skus' ? (
            <Card className="overflow-hidden">
              <CardHeader title={t('skus.title')} subtitle={t('skus.subtitle')} />
              <div className="mt-4">
                <DataTable<ProductDetailSku>
                  columns={skuColumns}
                  rows={skus}
                  rowKey={(r) => r.id}
                  empty={
                    <EmptyState icon={<Layers className="h-6 w-6" />} title={t('empty.skus')} />
                  }
                />
              </div>
            </Card>
          ) : null}
          {tab === 'unit' ? <UnitTab data={data} /> : null}
          {tab === 'reviews' ? <ReviewsTab data={data} /> : null}
        </div>
      </PlanGate>
    </>
  );
}

// ─────────────────────────── Yordamchi bloklar ───────────────────────────

function avgCost(skus: ProductDetailSku[]): number {
  const list = skus.filter((s) => skuTotalCost(s) > 0);
  if (!list.length) return 0;
  return Math.round(list.reduce((sum, s) => sum + skuTotalCost(s), 0) / list.length);
}

function BackLink({ label }: { label: string }) {
  return (
    <Link
      to="/products"
      className="mb-3 inline-flex items-center gap-1.5 text-sm font-medium text-muted transition-colors hover:text-brand-ink"
    >
      <ArrowLeft className="h-4 w-4" />
      {label}
    </Link>
  );
}

function Metric({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: 'brand' | 'danger' | 'warn';
}) {
  return (
    <div className="rounded-xl border border-line bg-surface-2 px-3 py-2.5">
      <p className="truncate eyebrow">{label}</p>
      <p
        className={cn(
          'tnum mt-0.5 truncate text-sm font-bold',
          tone === 'brand' && 'text-brand-ink',
          tone === 'danger' && 'text-danger',
          tone === 'warn' && 'text-warn-ink',
          !tone && 'text-ink',
        )}
        title={value}
      >
        {value}
      </p>
    </div>
  );
}

function SegmentedTabs({
  value,
  onChange,
  labels,
}: {
  value: Tab;
  onChange: (v: Tab) => void;
  labels: string[];
}) {
  return (
    <div className="inline-flex items-center gap-1 rounded-xl border border-line bg-surface-2 p-1">
      {TABS.map((tabId, i) => {
        const active = tabId === value;
        return (
          <button
            key={tabId}
            type="button"
            onClick={() => onChange(tabId)}
            className={cn(
              'whitespace-nowrap rounded-lg px-3.5 py-1.5 text-sm font-semibold transition-all duration-200',
              active ? 'bg-surface text-ink shadow-card' : 'text-muted hover:text-ink',
            )}
          >
            {labels[i]}
          </button>
        );
      })}
    </div>
  );
}

function SalesTab({ data }: { data: ProductDetailResponse | undefined }) {
  const t = useT('productDetail');
  const series = data?.series ?? [];
  return (
    <ChartCard title={t('sales.title')} subtitle={t('sales.subtitle')}>
      {series.length === 0 ? (
        <EmptyState icon={<TrendingUp className="h-6 w-6" />} title={t('empty.series')} />
      ) : (
        <TrendChart
          data={series as unknown as Record<string, unknown>[]}
          height={320}
          series={[
            { key: 'revenue', name: t('sales.revenue'), money: true, color: CHART_COLORS.brand },
            { key: 'profit', name: t('sales.profit'), money: true, color: CHART_COLORS.violet },
            { key: 'units', name: t('sales.units'), color: CHART_COLORS.info },
          ]}
        />
      )}
    </ChartCard>
  );
}

function StocksTab({ data }: { data: ProductDetailResponse | undefined }) {
  const t = useT('productDetail');
  const stocks = data?.stocks ?? [];
  return (
    <ChartCard title={t('stocks.title')} subtitle={t('stocks.subtitle')}>
      {stocks.length === 0 ? (
        <EmptyState icon={<Layers className="h-6 w-6" />} title={t('empty.stocks')} />
      ) : (
        <LinesChart
          data={stocks as unknown as Record<string, unknown>[]}
          height={320}
          series={[
            { key: 'fbo', name: t('stocks.fbo'), color: CHART_COLORS.brand },
            { key: 'fbs', name: t('stocks.fbs'), color: CHART_COLORS.info },
            { key: 'own', name: t('stocks.own'), color: CHART_COLORS.violet },
          ]}
        />
      )}
    </ChartCard>
  );
}

function UnitTab({ data }: { data: ProductDetailResponse | undefined }) {
  const t = useT('productDetail');
  const f = useFormat();
  const u = data?.unit;

  if (!u || u.price <= 0) {
    return (
      <Card>
        <EmptyState icon={<Scale className="h-6 w-6" />} title={t('unit.empty')} hint={t('unit.emptyHint')} />
      </Card>
    );
  }

  const parts = [
    { name: t('unit.cogs'), value: Math.max(0, u.purchasePrice), color: CHART_COLORS.slate },
    { name: t('unit.commission'), value: Math.max(0, u.commission), color: CHART_COLORS.danger },
    { name: t('unit.logistics'), value: Math.max(0, u.logistics), color: CHART_COLORS.warn },
    { name: t('unit.storage'), value: Math.max(0, u.storage), color: CHART_COLORS.violet },
    { name: t('unit.other'), value: Math.max(0, u.otherCost), color: CHART_COLORS.info },
    { name: t('unit.tax'), value: Math.max(0, u.tax), color: CHART_COLORS.teal },
  ].filter((p) => p.value > 0);

  const costTotal = parts.reduce((s, p) => s + p.value, 0);

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <ChartCard title={t('unit.title')} subtitle={t('unit.subtitle')}>
        <DonutChart
          data={parts}
          height={280}
          center={
            <div>
              <p className="eyebrow">{t('unit.costTotal')}</p>
              <p className="tnum font-display text-lg font-extrabold text-ink">{f.money(costTotal)}</p>
            </div>
          }
        />
      </ChartCard>

      <Card>
        <CardHeader title={t('unit.net')} subtitle={t('unit.price')} />
        <CardBody className="space-y-3">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-sm text-muted">{t('unit.price')}</span>
            <span className="tnum font-display text-xl font-extrabold text-ink">{f.money(u.price)}</span>
          </div>

          <div className="space-y-2.5">
            {parts.map((p) => (
              <div key={p.name}>
                <div className="mb-1 flex items-center justify-between text-xs">
                  <span className="flex items-center gap-2 text-muted">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: p.color }} />
                    {p.name}
                  </span>
                  <span className="tnum text-ink-soft">{f.money(p.value)}</span>
                </div>
                <ProgressBar value={u.price > 0 ? (p.value / u.price) * 100 : 0} tone="muted" />
              </div>
            ))}
          </div>

          <div className="hairline pt-3">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-sm font-semibold text-ink">{t('unit.net')}</span>
              <span
                className={cn(
                  'tnum font-display text-xl font-extrabold',
                  u.netProfit >= 0 ? 'text-brand-ink' : 'text-danger',
                )}
              >
                {f.money(u.netProfit)}
              </span>
            </div>
            <div className="mt-2 grid grid-cols-3 gap-2">
              <Metric label={t('info.margin')} value={f.pct(u.margin)} />
              <Metric label={t('info.roi')} value={f.pct(u.roi)} />
              <Metric label={t('unit.breakEven')} value={f.money(u.breakEvenPrice)} />
            </div>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}

function ReviewsTab({ data }: { data: ProductDetailResponse | undefined }) {
  const t = useT('productDetail');
  const f = useFormat();
  const r = data?.reviews;
  const rows = r?.rows ?? [];
  const totals = r?.totals;
  const dist = r?.distribution ?? [];
  const maxCount = Math.max(1, ...dist.map((d) => d.count));

  if (!totals || totals.count === 0) {
    return (
      <Card>
        <EmptyState icon={<MessageSquare className="h-6 w-6" />} title={t('reviews.empty')} hint={t('reviews.emptyHint')} />
      </Card>
    );
  }

  return (
    <div className="grid gap-4 xl:grid-cols-3">
      <Card className="xl:col-span-1">
        <CardHeader title={t('reviews.title')} subtitle={t('reviews.subtitle')} />
        <CardBody className="space-y-4">
          <div className="flex items-center gap-4">
            <div>
              <p className="tnum font-display text-3xl font-extrabold tracking-tight text-ink">{f.num(totals.avgRating, 1)}</p>
              <p className="text-xs text-muted">{t('reviews.avg')}</p>
            </div>
            <div className="ml-auto text-right">
              <p className="tnum text-sm font-semibold text-ink">{f.num(totals.count)}</p>
              <p className="text-xs text-muted">{t('reviews.count')}</p>
            </div>
          </div>

          <div className="space-y-2">
            {[5, 4, 3, 2, 1].map((star) => {
              const count = dist.find((d) => d.rating === star)?.count ?? 0;
              return (
                <div key={star} className="flex items-center gap-2.5">
                  <span className="tnum flex w-8 items-center gap-1 text-xs text-muted">
                    {star}
                    <Star className="h-3 w-3 text-warn" />
                  </span>
                  <ProgressBar
                    className="flex-1"
                    value={(count / maxCount) * 100}
                    tone={star >= 4 ? 'brand' : star === 3 ? 'warn' : 'danger'}
                  />
                  <span className="tnum w-10 text-right text-xs text-ink-soft">{f.num(count)}</span>
                </div>
              );
            })}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Metric label={t('reviews.answered')} value={f.num(totals.answered)} tone="brand" />
            <Metric
              label={t('reviews.unanswered')}
              value={f.num(totals.unanswered)}
              tone={totals.unanswered > 0 ? 'warn' : undefined}
            />
          </div>
        </CardBody>
      </Card>

      <Card className="xl:col-span-2">
        <CardHeader title={t('reviews.latest')} />
        <CardBody>
          {rows.length === 0 ? (
            <EmptyState icon={<MessageSquare className="h-6 w-6" />} title={t('reviews.empty')} />
          ) : (
            <ul className="space-y-3">
              {rows.slice(0, 8).map((review) => (
                <li key={review.id} className="rounded-xl border border-line bg-surface-2 p-3.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="flex items-center gap-1">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <Star
                          key={i}
                          className={cn('h-3.5 w-3.5', i < review.rating ? 'text-warn-ink' : 'text-muted opacity-40')}
                        />
                      ))}
                      <span className="ml-1.5 text-xs font-medium text-ink-soft">{review.author ?? '—'}</span>
                    </span>
                    <span className="text-2xs text-muted">{f.date(review.publishedAt)}</span>
                  </div>
                  {review.text ? <p className="mt-2 text-sm text-ink-soft">{review.text}</p> : null}
                  {review.answered && review.answerText ? (
                    <div className="mt-2.5 rounded-lg border border-line bg-surface p-2.5">
                      <p className="text-2xs font-semibold uppercase tracking-wide text-brand-ink">
                        {t('reviews.answerLabel')}
                      </p>
                      <p className="mt-0.5 text-xs text-ink-soft">{review.answerText}</p>
                    </div>
                  ) : (
                    <p className="mt-2 inline-flex items-center gap-1.5 text-2xs text-warn">
                      <Undo2 className="h-3 w-3" />
                      {t('reviews.noAnswer')}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
