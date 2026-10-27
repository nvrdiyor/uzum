import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Layers,
  MessageSquare,
  Package,
  Scale,
  Star,
  Store,
  TrendingUp,
  Undo2,
  Wand2,
} from '@/components/icons';
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
  Segmented,
  Skeleton,
  SkeletonRows,
  toast,
  type Column,
  type Tone,
} from '@/components/ui';
import { ChartCard, DonutChart } from '@/components/charts';
import { FilterBar } from '@/components/filters';
import { DataFreshness } from '@/components/trust/DataFreshness';
import {
  CoverCard,
  DetailHero,
  NeedCard,
  QualityCard,
  SalesComboCard,
  StockHistoryCard,
  variantOf,
} from '@/components/products/DetailBento';
import { CompetitorPricesCard } from '@/components/competitors/CompetitorPricesCard';
import { InlineCostInput } from '@/components/products/InlineCostInput';
import { MissingCostBanner } from '@/components/products/MissingCostBanner';
import { ProductVisibilityButton } from '@/components/products/VisibilityButton';
import {
  STATE_STYLE,
  normalizeProductDetail,
  productState,
  skusWithoutCost,
  type ProductDetailResponse,
  type ProductDetailSku,
} from '@/components/products/types';
import { StockStatusBadge, TONE_TEXT } from '@/components/stock/common';
import { api } from '@/lib/api';
import { COST_COLORS } from '@/lib/theme';
import { usePeriodQuery } from '@/store/ui';
import { registerNamespace, useFormat, useT } from '@/i18n';
import { cn } from '@/lib/utils';
import { invalidateCostDependent } from '@/lib/costQueries';
import { useSeesMoney } from '@/lib/view';

registerNamespace('productDetail', {
  uz: {
    back: 'Mahsulotlarga qaytish',
    cardSeo: 'Kartochka SEO',
    notFound: 'Mahsulot topilmadi',
    notFoundHint: 'Bu mahsulot o‘chirilgan yoki sizga tegishli emas',
    'state.active': 'Sotuvda',
    'state.need_order': 'Buyurtma kerak',
    'state.out': 'Qoldiqsiz',
    'state.archived': 'Arxiv',
    'state.hidden': 'O‘chirilgan',
    'meta.uzumId': 'Uzum ID {id}',
    'meta.skus': '{n} SKU',
    'meta.noCategory': 'Kategoriyasiz',
    'info.reviews': '{n} sharh',
    'info.margin': 'Marja',
    'info.roi': 'ROI',
    'tab.unit': 'Unit-iqtisod',
    'tab.reviews': 'Sharhlar',
    'skus.title': 'Variantlar',
    'skus.subtitle': 'Qoldiq, necha kunga yetishi va marja — tannarxni to‘g‘ridan-to‘g‘ri jadvalda tahrirlash mumkin',
    'skus.variant': 'Variant',
    'skus.status': 'Holat · yetadi',
    'skus.price': 'Narx',
    'skus.cost': 'Tannarx',
    'skus.stock': 'Qoldiq',
    'skus.sold': 'Sotildi',
    'skus.margin': 'Marja',
    'skus.own': 'O‘z ombori {n}',
    'skus.transit': 'yo‘lda {n}',
    'skus.days': '{n} kun',
    'skus.perDay': '{n}/kun',
    'skus.noSales': 'Sotuv yo‘q',
    'skus.buy': 'buyurtma {n}',
    'skus.ship': 'FBO’ga {n}',
    'skus.planHint': 'Tugash: {stockout} · buyurtma kuni: {orderBy}',
    'skus.profit': 'foyda {v}',
    'skus.uzumSku': 'Uzum SKU ID {id}',
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
    'unit.emptyHint': 'Variantlar jadvalida tannarxni kiriting',
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
    'empty.skus': 'SKU topilmadi',
  },
  ru: {
    back: 'К товарам',
    cardSeo: 'SEO карточки',
    notFound: 'Товар не найден',
    notFoundHint: 'Товар удалён или не принадлежит вам',
    'state.active': 'В продаже',
    'state.need_order': 'Нужен заказ',
    'state.out': 'Без остатка',
    'state.archived': 'Архив',
    'state.hidden': 'Удалён',
    'meta.uzumId': 'Uzum ID {id}',
    'meta.skus': '{n} SKU',
    'meta.noCategory': 'Без категории',
    'info.reviews': 'отзывов: {n}',
    'info.margin': 'Маржа',
    'info.roi': 'ROI',
    'tab.unit': 'Юнит-экономика',
    'tab.reviews': 'Отзывы',
    'skus.title': 'Варианты',
    'skus.subtitle': 'Остаток, на сколько хватит и маржа — себестоимость можно менять прямо в таблице',
    'skus.variant': 'Вариант',
    'skus.status': 'Статус · хватит',
    'skus.price': 'Цена',
    'skus.cost': 'Себестоимость',
    'skus.stock': 'Остаток',
    'skus.sold': 'Продано',
    'skus.margin': 'Маржа',
    'skus.own': 'Свой склад {n}',
    'skus.transit': 'в пути {n}',
    'skus.days': '{n} дн.',
    'skus.perDay': '{n}/дн.',
    'skus.noSales': 'Нет продаж',
    'skus.buy': 'заказ {n}',
    'skus.ship': 'на FBO {n}',
    'skus.planHint': 'Закончится: {stockout} · заказать до: {orderBy}',
    'skus.profit': 'прибыль {v}',
    'skus.uzumSku': 'Uzum SKU ID {id}',
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
    'unit.emptyHint': 'Укажите себестоимость в таблице вариантов',
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
    'empty.skus': 'SKU не найдены',
  },
  en: {
    back: 'Back to products',
    cardSeo: 'Card SEO',
    notFound: 'Product not found',
    notFoundHint: 'It was removed or does not belong to you',
    'state.active': 'On sale',
    'state.need_order': 'Reorder',
    'state.out': 'Out of stock',
    'state.archived': 'Archived',
    'state.hidden': 'Deleted',
    'meta.uzumId': 'Uzum ID {id}',
    'meta.skus': 'SKUs: {n}',
    'meta.noCategory': 'No category',
    'info.reviews': '{n} reviews',
    'info.margin': 'Margin',
    'info.roi': 'ROI',
    'tab.unit': 'Unit economics',
    'tab.reviews': 'Reviews',
    'skus.title': 'Variants',
    'skus.subtitle': 'Stock, days of cover and margin — the cost price can be edited straight in the table',
    'skus.variant': 'Variant',
    'skus.status': 'Status · lasts',
    'skus.price': 'Price',
    'skus.cost': 'Cost',
    'skus.stock': 'Stock',
    'skus.sold': 'Sold',
    'skus.margin': 'Margin',
    'skus.own': 'Own warehouse {n}',
    'skus.transit': '{n} in transit',
    'skus.days': '{n} days',
    'skus.perDay': '{n}/day',
    'skus.noSales': 'No sales',
    'skus.buy': 'reorder {n}',
    'skus.ship': 'to FBO {n}',
    'skus.planHint': 'Runs out: {stockout} · order by: {orderBy}',
    'skus.profit': 'profit {v}',
    'skus.uzumSku': 'Uzum SKU ID {id}',
    'skus.costPlaceholder': 'Cost',
    'cost.saved': 'Cost price updated',
    'cost.savedBody': 'New cost saved for {sku}',
    'cost.error': 'Could not save the cost price',
    'cost.bulkSaved': 'Cost applied to every SKU',
    'cost.missingTitle': 'Cost price is missing — profit is calculated incorrectly',
    'cost.missingHint': 'SKUs without a cost price: {n}. Fill it in to get accurate ROI and margin.',
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
    'unit.emptyHint': 'Set the cost price in the variants table',
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
    'empty.skus': 'No SKUs found',
  },
});

/*
 * "Bento" tartibi (2026-10-24): rasm va pul raqamlari (HeroCard) → ombor
 * qamrovi, buyurtma kerak, sifat → ikki o'qli sotuv grafigi va qoldiq tarixi
 * → variantlar jadvali → batafsil (unit-iqtisod, sharhlar). Ilgari sotuv va
 * qoldiq grafiklari tab ortida edi, "yetadi" va "buyurtma kerak" esa
 * qotirilgan 30 kunlik zaxira bilan izohlanardi — sozlamada boshqa muddat
 * turgan kompaniyada ham.
 */
type Tab = 'unit' | 'reviews';
const TABS: Tab[] = ['unit', 'reviews'];

/** Holat nishoni ohangi (StockStatusBadge bilan bir xil) — "yetadi" yozuvi shu rangda */
const STATUS_TONE: Record<NonNullable<ProductDetailSku['status']>, Tone> = {
  critical: 'danger',
  low: 'warn',
  ok: 'brand',
  excess: 'info',
  dead: 'muted',
};

/*
 * Kataklar orasi px-5 o'rniga 20 px — yetti ustunli jadval 1366 px'da
 * gorizontal aylantirishsiz sig'adi (Sotuv va qoldiq jadvalidagi kabi).
 */
const PAD = 'pl-2.5 pr-2.5';
const PAD_FIRST = 'pr-2.5';
const PAD_LAST = 'pl-2.5';

export default function ProductDetail() {
  const t = useT('productDetail');
  const f = useFormat();
  const { id = '' } = useParams<{ id: string }>();
  const periodQuery = usePeriodQuery();
  const qc = useQueryClient();

  /*
   * Pulsiz ko'rinish shablonida (omborchi, marketolog) Unit-iqtisod — tannarx va
   * foydaning o'zi: server qiymatlarni null qiladi, tab bo'sh ko'rinmasin (2026-10-27)
   */
  const seesMoney = useSeesMoney();
  const tabs = seesMoney ? TABS : TABS.filter((x) => x !== 'unit');
  const [tab, setTab] = useState<Tab>(seesMoney ? 'unit' : 'reviews');
  const [savingSku, setSavingSku] = useState<string | null>(null);
  const [savedSku, setSavedSku] = useState<string | null>(null);

  const queryKey = useMemo(() => ['product', id, periodQuery] as const, [id, periodQuery]);

  /*
   * Zaxira davri YUBORILMAYDI — server kompaniya sozlamasini oladi va har
   * xulosada (`plan`) qaysi muddatlar ishlatilganini aytadi.
   */
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey,
    queryFn: () => api.get<unknown>(`/products/${id}`, periodQuery).then(normalizeProductDetail),
    enabled: Boolean(id),
  });

  const product = data?.product;
  const skus = data?.skus ?? [];
  const missing = skusWithoutCost(skus);

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
      // Server o'tgan buyurtmalarni ham qayta hisobladi — boshqa sahifalardagi foyda ham yangilansin
      invalidateCostDependent(qc);
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
    onSettled: () => {
      void qc.invalidateQueries({ queryKey });
      invalidateCostDependent(qc);
    },
  });

  const productTitle = product?.title ?? '';

  /*
   * Variantlar jadvali: variant (nom, SKU kodi, shtrix-kod) → holat va
   * "yetadi" (Rejalashtiruvchidan, yetkazish muddati bilan) → qoldiq →
   * sotildi → narx → tannarx (shu yerda tahrirlanadi) → marja. "Yetadi"
   * rangi nishon bilan bir xil (holatdan) — ilgari qat'iy 7/14 kunlik
   * chegaradan olinardi va yetkazish 14 kun bo'lsa nishon qizil, kun yozuvi
   * sariq chiqardi.
   */
  const skuColumns: Column<ProductDetailSku>[] = useMemo(
    () => [
      {
        key: 'sku',
        header: t('skus.variant'),
        render: (r) => {
          const variant = variantOf(r.title, productTitle);
          return (
            <div
              className="min-w-0 max-w-[15rem] 2xl:max-w-[22rem]"
              title={[r.title, r.uzumSkuId ? t('skus.uzumSku', { id: r.uzumSkuId }) : ''].filter(Boolean).join('\n')}
            >
              <p className="truncate text-sm font-semibold text-ink">{variant}</p>
              <p className="tnum truncate text-xs text-muted">
                {r.sku}
                {r.barcode ? <span className="opacity-80"> · {r.barcode}</span> : null}
              </p>
            </div>
          );
        },
        sortable: true,
        sortValue: (r) => r.sku,
        className: PAD_FIRST,
        headerClassName: PAD_FIRST,
      },
      {
        // Holat aynan "necha kunga yetadi"dan kelib chiqadi — bitta ustunda
        key: 'status',
        header: t('skus.status'),
        render: (r) => {
          const plan = r.plan;
          const hint =
            plan && plan.stockoutDate
              ? t('skus.planHint', {
                  stockout: f.dateShort(plan.stockoutDate),
                  orderBy: plan.orderBy ? f.dateShort(plan.orderBy) : '—',
                })
              : undefined;
          return (
            <div className={cn('leading-tight', hint && 'cursor-help')} title={hint}>
              {r.status ? <StockStatusBadge status={r.status} /> : null}
              <p className="tnum mt-1 text-2xs">
                <span className={cn('font-semibold', TONE_TEXT[r.status ? STATUS_TONE[r.status] : 'muted'])}>
                  {r.daysLeft === null || r.daysLeft === undefined
                    ? t('skus.noSales')
                    : t('skus.days', { n: f.num(r.daysLeft) })}
                </span>
                {(r.avgDaily ?? 0) > 0 ? (
                  <span className="text-muted"> · {t('skus.perDay', { n: f.num(r.avgDaily ?? 0, 1) })}</span>
                ) : null}
              </p>
              {/* Rejalashtiruvchi tavsiyasi — shu variant bo'yicha */}
              {plan && !r.archived && (plan.reorderQty > 0 || plan.shipQty > 0) ? (
                <p className="tnum mt-0.5 text-2xs font-medium">
                  {plan.reorderQty > 0 ? (
                    <span className="text-warn-ink">{t('skus.buy', { n: f.num(plan.reorderQty) })}</span>
                  ) : null}
                  {plan.reorderQty > 0 && plan.shipQty > 0 ? <span className="text-muted"> · </span> : null}
                  {plan.shipQty > 0 ? (
                    <span className="text-info-ink">{t('skus.ship', { n: f.num(plan.shipQty) })}</span>
                  ) : null}
                </p>
              ) : null}
            </div>
          );
        },
        // Shoshilinchlik bo'yicha: birinchi bosishda (kamayish) eng kam kunlisi tepada
        sortValue: (r) => -(r.daysLeft ?? Number.MAX_SAFE_INTEGER),
        sortable: true,
        className: PAD,
        headerClassName: PAD,
      },
      {
        key: 'stock',
        header: t('skus.stock'),
        align: 'right',
        render: (r) => {
          const total = (r.stockFbo ?? 0) + (r.stockFbs ?? 0) + (r.stockOwn ?? 0);
          return (
            <div className="leading-tight">
              <span className={cn('tnum font-semibold', total > 0 ? 'text-ink' : 'text-danger')}>{f.num(total)}</span>
              <p className="tnum text-2xs text-muted">
                FBO {f.num(r.stockFbo ?? 0)} · FBS {f.num(r.stockFbs ?? 0)}
              </p>
              {(r.stockOwn ?? 0) > 0 ? (
                <p className="tnum text-2xs text-muted">{t('skus.own', { n: f.num(r.stockOwn ?? 0) })}</p>
              ) : null}
              {(r.inTransit ?? 0) > 0 ? (
                <p className="tnum text-2xs font-medium text-info-ink">{t('skus.transit', { n: f.num(r.inTransit ?? 0) })}</p>
              ) : null}
            </div>
          );
        },
        sortable: true,
        sortValue: (r) => (r.stockFbo ?? 0) + (r.stockFbs ?? 0) + (r.stockOwn ?? 0),
        className: PAD,
        headerClassName: PAD,
      },
      {
        key: 'sold',
        header: t('skus.sold'),
        align: 'right',
        render: (r) => <span className="tnum font-medium text-ink">{f.num(r.sold)}</span>,
        sortable: true,
        sortValue: (r) => r.sold,
        className: PAD,
        headerClassName: PAD,
      },
      {
        key: 'price',
        header: t('skus.price'),
        align: 'right',
        hideOnMobile: true,
        render: (r) => <span className="tnum text-ink-soft">{f.money(r.price)}</span>,
        sortable: true,
        sortValue: (r) => r.price,
        className: PAD,
        headerClassName: PAD,
      },
      {
        key: 'cost',
        header: t('skus.cost'),
        align: 'right',
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
        className: PAD,
        headerClassName: PAD,
      },
      {
        key: 'margin',
        header: t('skus.margin'),
        align: 'right',
        render: (r) => (
          <div className="leading-tight">
            {r.revenue > 0 && typeof r.margin === 'number' ? (
              <span className={cn('tnum font-semibold', r.margin < 0 ? 'text-danger' : 'text-brand-ink')}>
                {f.pct(r.margin)}
              </span>
            ) : (
              <span className="text-muted">—</span>
            )}
            <p className={cn('tnum text-2xs', r.profit < 0 ? 'text-danger' : 'text-muted')}>
              {t('skus.profit', { v: f.money(r.profit) })}
            </p>
          </div>
        ),
        sortable: true,
        sortValue: (r) => (r.revenue > 0 ? (r.margin ?? 0) : Number.NEGATIVE_INFINITY),
        className: PAD_LAST,
        headerClassName: PAD_LAST,
      },
    ],
    [t, f, savingSku, savedSku, patchCost, productTitle],
  );

  // ─────────── Yuklanish / xato / bo'sh ───────────

  if (isLoading) {
    return (
      <>
        <BackLink label={t('back')} />
        <PageHeader icon={<Package className="h-5 w-5" />} title={<Skeleton className="h-6 w-64" />} />
        <div className="space-y-5">
          <Skeleton className="h-48 w-full rounded-2xl" />
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-64 w-full rounded-2xl" />
            ))}
          </div>
          <Skeleton className="h-80 w-full rounded-2xl" />
          <Card className="p-5">
            <SkeletonRows rows={4} />
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

  if (!product || !data) {
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

  return (
    <>
      <BackLink label={t('back')} />

      <PageHeader
        // Rasm hero kartochkada katta — sarlavha plitkasida mahsulot belgisi (ikki marta bir rasm turmasin)
        icon={<Package className="h-5 w-5" />}
        // Uzum'dagi haqiqiy nomlar 70–150 belgi — ikki qatordan oshmasin, to'liq nomi izohda
        title={
          <span className="line-clamp-2 text-[20px] sm:text-[24px]" title={product.title}>
            {product.title}
          </span>
        }
        badge={
          <span className="flex flex-wrap items-center gap-2">
            <span className={cn('chip', STATE_STYLE[state].chip)}>
              <span className={cn('h-1.5 w-1.5 rounded-full', STATE_STYLE[state].dot)} />
              {t(`state.${state}`)}
            </span>
            <PreviewBadge feature="products_assortment" />
          </span>
        }
        meta={
          <>
            <DataFreshness />
            {product.uzumProductId ? (
              <span className="meta-chip tnum">{t('meta.uzumId', { id: product.uzumProductId })}</span>
            ) : null}
            {data.store ? (
              <span className="meta-chip">
                <Store className="h-3.5 w-3.5" />
                {data.store.title}
              </span>
            ) : null}
            <span className="meta-chip">{product.category ?? t('meta.noCategory')}</span>
            <span className="meta-chip tnum">{t('meta.skus', { n: f.num(product.skuCount) })}</span>
          </>
        }
        actions={
          <span className="flex flex-wrap items-center gap-2">
            {product.rating > 0 ? (
              <Badge tone="warn">
                <Star className="h-3.5 w-3.5" />
                <span className="tnum">{f.num(product.rating, 1)}</span>
                <span className="opacity-80">· {t('info.reviews', { n: f.num(product.reviewsCount) })}</span>
              </Badge>
            ) : null}
            <Link to={`/cards/${product.id}`} className="btn-outline gap-1.5 rounded-lg px-3 py-1.5 text-xs">
              <Wand2 className="h-3.5 w-3.5" />
              {t('cardSeo')}
            </Link>
            <ProductVisibilityButton product={product} variant="button" />
          </span>
        }
      />

      <FilterBar />

      <PlanGate feature="products_assortment">
        <div className="space-y-5">
          <DetailHero product={product} skus={skus} period={periodQuery} />

          {/* Tannarx ogohlantirishi — foyda raqamlari aynan unga bog'liq, shuning uchun darhol ostida */}
          <MissingCostBanner skus={missing} saving={bulkCost.isPending} onApply={(v) => bulkCost.mutate(v)} />

          {/* Bento: har karta bitta savolga javob — qancha bor, nima qilish kerak, xaridor qanday qabul qilyapti */}
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <CoverCard product={product} skus={skus} />
            <NeedCard product={product} skus={skus} />
            <QualityCard data={data} onShowReviews={() => setTab('reviews')} className="md:col-span-2 xl:col-span-1" />
          </div>

          <div className="grid gap-4 xl:grid-cols-3">
            <SalesComboCard data={data} className="xl:col-span-2" />
            <StockHistoryCard data={data} />
          </div>

          {/*
            Narx savoli sotuv grafigidan keyin (u yerda narx chizig'i bor) va
            variantlar jadvalidan oldin: raqobatchi narxi zararsizlik narxi va
            marja bilan bir joyda. Narxni sotuvchi o'zi kiritadi (2026-10-24).
          */}
          <CompetitorPricesCard
            productId={product.id}
            productTitle={product.title}
            skus={skus}
            period={{ from: periodQuery.from, to: periodQuery.to }}
          />

          <Card className="overflow-hidden">
            <CardHeader
              icon={<Layers />}
              tone="info"
              title={t('skus.title')}
              subtitle={t('skus.subtitle')}
              actions={<Badge tone="muted">{f.num(skus.length)}</Badge>}
            />
            <div className="mt-4">
              <DataTable<ProductDetailSku>
                columns={skuColumns}
                rows={skus}
                rowKey={(r) => r.id}
                density="compact"
                empty={<EmptyState icon={<Layers className="h-6 w-6" />} title={t('empty.skus')} />}
              />
            </div>
          </Card>

          <Segmented<Tab> value={tab} onChange={setTab} options={tabs.map((x) => ({ value: x, label: t(`tab.${x}`) }))} />

          {tab === 'unit' && seesMoney ? <UnitTab data={data} /> : null}
          {tab === 'reviews' ? <ReviewsTab data={data} /> : null}
        </div>
      </PlanGate>
    </>
  );
}

// ─────────────────────────── Yordamchi bloklar ───────────────────────────

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

  /*
   * Xarajat ranglari butun ilova bo'yicha bir xil (COST_COLORS): komissiya —
   * binafsha (Uzum oladigan qism), logistika — ko'k, saqlash — pushti, soliq —
   * sariq, tannarx — kulrang. Ilgari komissiya qizil edi va "zarar" deb o'qilardi.
   */
  const parts = [
    { name: t('unit.cogs'), value: Math.max(0, u.purchasePrice), color: COST_COLORS.cogs },
    { name: t('unit.commission'), value: Math.max(0, u.commission), color: COST_COLORS.commission },
    { name: t('unit.logistics'), value: Math.max(0, u.logistics), color: COST_COLORS.logistics },
    { name: t('unit.storage'), value: Math.max(0, u.storage), color: COST_COLORS.storage },
    { name: t('unit.other'), value: Math.max(0, u.otherCost), color: COST_COLORS.other },
    { name: t('unit.tax'), value: Math.max(0, u.tax), color: COST_COLORS.tax },
  ].filter((p) => p.value > 0);

  const costTotal = parts.reduce((s, p) => s + p.value, 0);

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <ChartCard icon={<Scale />} tone="violet" title={t('unit.title')} subtitle={t('unit.subtitle')}>
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

      <Card tone={u.netProfit < 0 ? 'danger' : 'brand'}>
        <CardHeader icon={<TrendingUp />} title={t('unit.net')} subtitle={t('unit.price')} />
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
            <div className="mt-3 grid grid-cols-3 gap-2">
              <MiniStat label={t('info.margin')} value={f.pct(u.margin)} />
              <MiniStat label={t('info.roi')} value={f.pct(u.roi)} />
              <MiniStat label={t('unit.breakEven')} value={f.money(u.breakEvenPrice)} />
            </div>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}

/** Ichki statistik plitka (.well) — yorliq va qiymat */
function MiniStat({ label, value, tone }: { label: string; value: string; tone?: 'brand' | 'warn' }) {
  return (
    <div className="well min-w-0 px-3 py-2">
      <p className="truncate eyebrow" title={label}>
        {label}
      </p>
      <p
        className={cn(
          'tnum mt-0.5 truncate text-sm font-bold',
          tone === 'brand' ? 'text-brand-ink' : tone === 'warn' ? 'text-warn-ink' : 'text-ink',
        )}
        title={value}
      >
        {value}
      </p>
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
        <CardHeader icon={<Star />} tone="warn" title={t('reviews.title')} subtitle={t('reviews.subtitle')} />
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
            <MiniStat label={t('reviews.answered')} value={f.num(totals.answered)} tone="brand" />
            <MiniStat
              label={t('reviews.unanswered')}
              value={f.num(totals.unanswered)}
              tone={totals.unanswered > 0 ? 'warn' : undefined}
            />
          </div>
        </CardBody>
      </Card>

      <Card className="xl:col-span-2">
        <CardHeader icon={<MessageSquare />} tone="muted" title={t('reviews.latest')} />
        <CardBody>
          {rows.length === 0 ? (
            <EmptyState icon={<MessageSquare className="h-6 w-6" />} title={t('reviews.empty')} />
          ) : (
            <ul className="space-y-3">
              {rows.slice(0, 8).map((review) => (
                <li key={review.id} className="well p-3.5">
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
                      <p className="text-xs font-semibold text-brand-ink">
                        {t('reviews.answerLabel')}
                      </p>
                      <p className="mt-0.5 text-xs text-ink-soft">{review.answerText}</p>
                    </div>
                  ) : (
                    <p className="mt-2 inline-flex items-center gap-1.5 text-2xs text-warn-ink">
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
