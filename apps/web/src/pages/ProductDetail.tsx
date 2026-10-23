import { useMemo, useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  ArrowRight,
  Boxes,
  Info,
  Layers,
  MessageSquare,
  Package,
  PackagePlus,
  Scale,
  ShieldCheck,
  Star,
  Store,
  TrendingUp,
  Undo2,
  Wand2,
} from '@/components/icons';
import {
  Amount,
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  DataTable,
  EmptyState,
  ErrorState,
  HeroCard,
  PageHeader,
  PlanGate,
  PreviewBadge,
  ProductThumb,
  ProgressBar,
  ProgressRing,
  Segmented,
  Skeleton,
  SkeletonRows,
  toast,
  type Column,
  type Tone,
} from '@/components/ui';
import { ChartCard, DonutChart, LinesChart, TrendChart, CHART_COLORS } from '@/components/charts';
import { FilterBar } from '@/components/filters';
import { DataFreshness } from '@/components/trust/DataFreshness';
import { buyoutRateOf, buyoutTextClass, buyoutTone, useBuyout } from '@/components/products/Buyout';
import { InlineCostInput } from '@/components/products/InlineCostInput';
import { MissingCostBanner } from '@/components/products/MissingCostBanner';
import { ProductVisibilityButton } from '@/components/products/VisibilityButton';
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
import { StockStatusBadge, TONE_TEXT, daysTone } from '@/components/stock/common';
import { api } from '@/lib/api';
import { COST_COLORS } from '@/lib/theme';
import { usePeriodQuery } from '@/store/ui';
import { registerNamespace, useFormat, useT } from '@/i18n';
import { cn } from '@/lib/utils';
import { invalidateCostDependent } from '@/lib/costQueries';

registerNamespace('productDetail', {
  uz: {
    back: 'Mahsulotlarga qaytish',
    cardSeo: 'Kartochka SEO',
    subtitle: '{sku} SKU · {cat}',
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
    'hero.title': 'Davr natijasi',
    'hero.sold': '{n} dona sotildi',
    'hero.avgPrice': 'O‘rtacha sotilgan',
    'hero.avgPriceWhy':
      'Tanlangan davrda xaridorlar haqiqatda to‘lagan narxning o‘rtachasi (tushum ÷ sotilgan dona). Davr ichida narx o‘zgargan yoki aksiya bo‘lgan bo‘lsa, joriy narxdan farq qiladi.',
    'kpi.revenue': 'Tushum',
    'kpi.profit': 'Sof foyda',
    'kpi.roi': 'ROI',
    'kpi.roiNoCost': 'Tannarx kiritilmagan',
    'kpi.margin': 'Marja',
    'info.price': 'Narx',
    'info.cost': 'Tannarx',
    'info.noCost': 'kiritilmagan',
    'info.sold': 'Sotildi',
    'info.revenue': 'Tushum',
    'info.profit': 'Foyda',
    'info.roi': 'ROI',
    'info.margin': 'Marja',
    'info.rating': 'Reyting',
    'info.returns': 'Qaytarishlar',
    'info.stock': 'Qoldiq',
    'info.daysLeft': 'Qoldiq yetadi',
    'info.days': '{n} kun',
    'info.noForecast': 'Prognoz yo‘q',
    'info.units': '{n} dona',
    'info.reviews': '{n} sharh',
    'cover.title': 'Ombor qamrovi',
    'cover.subtitle': 'Qoldiq necha kunga yetadi',
    'cover.share': '{cover} kunlik zaxiraning {pct} qismi',
    'cover.full': '{cover} kunlik zaxiradan ham ko‘p',
    'cover.noSales': 'So‘nggi 30 kunda sotuv yo‘q — prognoz qilinmaydi',
    'cover.inTransit': 'yo‘lda {n}',
    'cover.reserved': 'band {n}',
    'need.title': 'Buyurtma kerak',
    'need.subtitle': '{n} kunlik zaxira uchun yetishmaydi',
    'need.none': 'Hozircha buyurtma shart emas',
    'need.noneHint': 'Barcha SKU’lar zaxira davriga yetadi',
    'need.urgent': 'Eng shoshilinch SKU’lar',
    'need.planner': 'Rejalashtiruvchida ochish',
    'quality.title': 'Sifat va qaytarishlar',
    'quality.subtitle': 'Tanlangan davr bo‘yicha',
    'quality.unanswered': 'Javobsiz sharhlar',
    'quality.noRating': 'Hali baholanmagan',
    'tab.sales': 'Sotuv dinamikasi',
    'tab.stocks': 'Qoldiqlar',
    'tab.unit': 'Unit-iqtisod',
    'tab.reviews': 'Sharhlar',
    'sales.title': 'Sotuv dinamikasi',
    'sales.subtitle': 'Oxirgi 60 kun: tushum va foyda',
    'sales.revenue': 'Tushum',
    'sales.profit': 'Foyda',
    'sales.units': 'Dona: {n}',
    'stocks.title': 'Qoldiqlar tarixi',
    'stocks.subtitle': 'FBO, FBS va o‘z ombori bo‘yicha',
    'stocks.fbo': 'FBO',
    'stocks.fbs': 'FBS',
    'stocks.own': 'Ombor',
    'skus.title': 'SKU’lar',
    'skus.subtitle': 'Holat, qoldiq va tannarx — tannarxni to‘g‘ridan-to‘g‘ri jadvalda tahrirlash mumkin',
    'skus.sku': 'SKU',
    'skus.status': 'Holat · yetadi',
    'skus.price': 'Narx',
    'skus.cost': 'Tannarx',
    'skus.stock': 'Qoldiq',
    'skus.sold': 'Sotildi',
    'skus.profit': 'Foyda',
    'skus.own': 'O‘z ombori {n}',
    'skus.transit': 'yo‘lda {n}',
    'skus.days': '{n} kun',
    'skus.perDay': '{n}/kun',
    'skus.noSales': 'Sotuv yo‘q',
    'skus.margin': 'marja {pct}',
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
    'unit.emptyHint': 'SKU jadvalida tannarxni kiriting',
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
    cardSeo: 'SEO карточки',
    subtitle: '{sku} SKU · {cat}',
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
    'hero.title': 'Итог за период',
    'hero.sold': 'Продано {n} шт.',
    'hero.avgPrice': 'Средняя цена продажи',
    'hero.avgPriceWhy':
      'Средняя цена, которую покупатели реально заплатили за выбранный период (выручка ÷ проданные штуки). Если за период менялась цена или шла акция, она отличается от текущей.',
    'kpi.revenue': 'Выручка',
    'kpi.profit': 'Чистая прибыль',
    'kpi.roi': 'ROI',
    'kpi.roiNoCost': 'Себестоимость не заполнена',
    'kpi.margin': 'Маржа',
    'info.price': 'Цена',
    'info.cost': 'Себестоимость',
    'info.noCost': 'не указана',
    'info.sold': 'Продано',
    'info.revenue': 'Выручка',
    'info.profit': 'Прибыль',
    'info.roi': 'ROI',
    'info.margin': 'Маржа',
    'info.rating': 'Рейтинг',
    'info.returns': 'Возвраты',
    'info.stock': 'Остаток',
    'info.daysLeft': 'Хватит на',
    'info.days': '{n} дн.',
    'info.noForecast': 'Нет прогноза',
    'info.units': '{n} шт.',
    'info.reviews': '{n} отзывов',
    'cover.title': 'Покрытие запасом',
    'cover.subtitle': 'На сколько хватит остатка',
    'cover.share': '{pct} от запаса на {cover} дн.',
    'cover.full': 'Больше запаса на {cover} дн.',
    'cover.noSales': 'За 30 дней продаж нет — прогноза нет',
    'cover.inTransit': 'в пути {n}',
    'cover.reserved': 'резерв {n}',
    'need.title': 'Нужен заказ',
    'need.subtitle': 'Не хватает на {n} дн. запаса',
    'need.none': 'Пока заказывать не нужно',
    'need.noneHint': 'Всех SKU хватает на период запаса',
    'need.urgent': 'Самые срочные SKU',
    'need.planner': 'Открыть в планировщике',
    'quality.title': 'Качество и возвраты',
    'quality.subtitle': 'За выбранный период',
    'quality.unanswered': 'Отзывы без ответа',
    'quality.noRating': 'Оценок пока нет',
    'tab.sales': 'Динамика продаж',
    'tab.stocks': 'Остатки',
    'tab.unit': 'Юнит-экономика',
    'tab.reviews': 'Отзывы',
    'sales.title': 'Динамика продаж',
    'sales.subtitle': 'Последние 60 дней: выручка и прибыль',
    'sales.revenue': 'Выручка',
    'sales.profit': 'Прибыль',
    'sales.units': 'Штук: {n}',
    'stocks.title': 'История остатков',
    'stocks.subtitle': 'По FBO, FBS и своему складу',
    'stocks.fbo': 'FBO',
    'stocks.fbs': 'FBS',
    'stocks.own': 'Склад',
    'skus.title': 'SKU',
    'skus.subtitle': 'Статус, остаток и себестоимость — себестоимость можно менять прямо в таблице',
    'skus.sku': 'SKU',
    'skus.status': 'Статус · хватит',
    'skus.price': 'Цена',
    'skus.cost': 'Себестоимость',
    'skus.stock': 'Остаток',
    'skus.sold': 'Продано',
    'skus.profit': 'Прибыль',
    'skus.own': 'Свой склад {n}',
    'skus.transit': 'в пути {n}',
    'skus.days': '{n} дн.',
    'skus.perDay': '{n}/дн.',
    'skus.noSales': 'Нет продаж',
    'skus.margin': 'маржа {pct}',
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
    'unit.emptyHint': 'Укажите себестоимость в таблице SKU',
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
    cardSeo: 'Card SEO',
    subtitle: '{sku} SKUs · {cat}',
    notFound: 'Product not found',
    notFoundHint: 'It was removed or does not belong to you',
    'state.active': 'On sale',
    'state.need_order': 'Reorder',
    'state.out': 'Out of stock',
    'state.archived': 'Archived',
    'state.hidden': 'Deleted',
    'meta.uzumId': 'Uzum ID {id}',
    'meta.skus': '{n} SKUs',
    'meta.noCategory': 'No category',
    'hero.title': 'Period result',
    'hero.sold': '{n} units sold',
    'hero.avgPrice': 'Average selling price',
    'hero.avgPriceWhy':
      'The average price buyers actually paid in the selected period (revenue ÷ units sold). It differs from the current price when the price changed or a promo ran during the period.',
    'kpi.revenue': 'Revenue',
    'kpi.profit': 'Net profit',
    'kpi.roi': 'ROI',
    'kpi.roiNoCost': 'Cost price not set',
    'kpi.margin': 'Margin',
    'info.price': 'Price',
    'info.cost': 'Cost price',
    'info.noCost': 'not set',
    'info.sold': 'Sold',
    'info.revenue': 'Revenue',
    'info.profit': 'Profit',
    'info.roi': 'ROI',
    'info.margin': 'Margin',
    'info.rating': 'Rating',
    'info.returns': 'Returns',
    'info.stock': 'Stock',
    'info.daysLeft': 'Days of cover',
    'info.days': '{n} days',
    'info.noForecast': 'No forecast',
    'info.units': '{n} units',
    'info.reviews': '{n} reviews',
    'cover.title': 'Stock cover',
    'cover.subtitle': 'How long the stock lasts',
    'cover.share': '{pct} of a {cover}-day cover',
    'cover.full': 'More than a {cover}-day cover',
    'cover.noSales': 'No sales in the last 30 days — no forecast',
    'cover.inTransit': '{n} in transit',
    'cover.reserved': '{n} reserved',
    'need.title': 'Reorder',
    'need.subtitle': 'Short for {n} days of cover',
    'need.none': 'No reorder needed yet',
    'need.noneHint': 'Every SKU covers the period',
    'need.urgent': 'Most urgent SKUs',
    'need.planner': 'Open in Planner',
    'quality.title': 'Quality and returns',
    'quality.subtitle': 'For the selected period',
    'quality.unanswered': 'Unanswered reviews',
    'quality.noRating': 'Not rated yet',
    'tab.sales': 'Sales trend',
    'tab.stocks': 'Stock levels',
    'tab.unit': 'Unit economics',
    'tab.reviews': 'Reviews',
    'sales.title': 'Sales trend',
    'sales.subtitle': 'Last 60 days: revenue and profit',
    'sales.revenue': 'Revenue',
    'sales.profit': 'Profit',
    'sales.units': 'Units: {n}',
    'stocks.title': 'Stock history',
    'stocks.subtitle': 'FBO, FBS and own warehouse',
    'stocks.fbo': 'FBO',
    'stocks.fbs': 'FBS',
    'stocks.own': 'Own',
    'skus.title': 'SKUs',
    'skus.subtitle': 'Status, stock and cost — the cost price can be edited straight in the table',
    'skus.sku': 'SKU',
    'skus.status': 'Status · lasts',
    'skus.price': 'Price',
    'skus.cost': 'Cost',
    'skus.stock': 'Stock',
    'skus.sold': 'Sold',
    'skus.profit': 'Profit',
    'skus.own': 'Own warehouse {n}',
    'skus.transit': '{n} in transit',
    'skus.days': '{n} days',
    'skus.perDay': '{n}/day',
    'skus.noSales': 'No sales',
    'skus.margin': 'margin {pct}',
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
    'unit.emptyHint': 'Set the cost price in the SKU table',
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

/*
 * SKU jadvali endi tabda emas — sahifaning o'zida (Unit-iqtisod va sharhlardan
 * oldin): sotuvchi aynan qaysi variant tugayotganini birinchi ekranda ko'rsin.
 * Ilgari u "SKU'lar" tabi ortida yashirin edi va server qaytargan holat,
 * sur'at, "yetadi" ustunlari umuman chizilmasdi.
 */
type Tab = 'sales' | 'stocks' | 'unit' | 'reviews';
const TABS: Tab[] = ['sales', 'stocks', 'unit', 'reviews'];

/**
 * GET /products/:id `cover` yubormaydi — server standarti 30 kun (coverParam).
 * "Buyurtma kerak" miqdori ham aynan shu davr uchun hisoblangan, shuning uchun
 * qamrov halqasi va izohlar ham 30 kunga nisbatan.
 */
const DETAIL_COVER = 30;

/*
 * Kataklar orasi px-5 o'rniga 20 px — yetti ustunli SKU jadvali 1366 px'da
 * gorizontal aylantirishsiz sig'adi (Sotuv va qoldiq jadvalidagi kabi).
 */
const PAD = 'pl-2.5 pr-2.5';
const PAD_FIRST = 'pr-2.5';
const PAD_LAST = 'pl-2.5';

/** SKU nomidan mahsulot nomini olib tashlaydi: "Paxta choyshab … — Kulrang" → "Kulrang" */
function variantOf(skuTitle: string, productTitle: string): string {
  if (!productTitle || !skuTitle.startsWith(productTitle)) return skuTitle;
  const rest = skuTitle.slice(productTitle.length).replace(/^[\s—–,:·-]+/u, '').trim();
  return rest || skuTitle;
}

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

  const skuColumns: Column<ProductDetailSku>[] = useMemo(
    () => [
      {
        key: 'sku',
        header: t('skus.sku'),
        render: (r) => {
          const variant = variantOf(r.title, productTitle);
          return (
            <div className="min-w-0 max-w-[15rem] 2xl:max-w-[22rem]">
              <p className="tnum truncate text-sm font-semibold text-ink">{r.sku}</p>
              <p className="truncate text-xs text-muted" title={r.title}>
                {variant}
                {r.barcode ? <span className="tnum opacity-80"> · {r.barcode}</span> : null}
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
        render: (r) => (
          <div className="leading-tight">
            {r.status ? <StockStatusBadge status={r.status} /> : null}
            <p className="tnum mt-1 text-2xs">
              <span className={cn('font-semibold', TONE_TEXT[daysTone(r.daysLeft)])}>
                {r.daysLeft === null || r.daysLeft === undefined
                  ? t('skus.noSales')
                  : t('skus.days', { n: f.num(r.daysLeft) })}
              </span>
              {(r.avgDaily ?? 0) > 0 ? (
                <span className="text-muted"> · {t('skus.perDay', { n: f.num(r.avgDaily ?? 0, 1) })}</span>
              ) : null}
            </p>
          </div>
        ),
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
        key: 'profit',
        header: t('skus.profit'),
        align: 'right',
        render: (r) => (
          <div className="leading-tight">
            <span className={cn('tnum font-semibold', r.profit < 0 ? 'text-danger' : 'text-brand-ink')}>
              {f.money(r.profit)}
            </span>
            {r.revenue > 0 && typeof r.margin === 'number' ? (
              <p className={cn('tnum text-2xs', r.profit < 0 ? 'text-danger' : 'text-muted')}>
                {t('skus.margin', { pct: f.pct(r.margin) })}
              </p>
            ) : null}
          </div>
        ),
        sortable: true,
        sortValue: (r) => r.profit,
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
          <Skeleton className="h-44 w-full rounded-2xl" />
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-56 w-full rounded-2xl" />
            ))}
          </div>
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
  const cost = avgCost(skus);
  const showAvg =
    product.avgSoldPrice > 0 && Math.abs(product.avgSoldPrice - product.minPrice) >= product.minPrice * 0.01;
  const loss = product.profit < 0;

  return (
    <>
      <BackLink label={t('back')} />

      <PageHeader
        // Sarlavha plitkasida mahsulotning o'zi: rasm yoki rangli bosh harflar
        icon={<ProductThumb name={product.title} imageUrl={product.imageUrl} className="rounded-xl text-base" />}
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
            {data?.store ? (
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
          {/*
            Sahifadagi yagona HeroCard — mahsulot davr ichida qancha pul
            keltirgani. Ilgari to'rtta bir xil KPI kartochkasi, ostida esa
            224 px bo'sh rasm va 11 ta teng kulrang plitka turardi: asosiy
            savolga javob ko'zga tashlanmasdi.
          */}
          <HeroCard tone={loss ? 'danger' : 'brand'} className="p-5 sm:p-6">
            {/* Davr chegarasi raqamlar yonida — qaysi davr natijasi ekani so'ralmasin */}
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <p className="eyebrow">
                {t('hero.title')}
                <span className="tnum ml-2 font-medium normal-case tracking-normal text-ink-soft">
                  {periodQuery.from === periodQuery.to
                    ? f.dateShort(periodQuery.from)
                    : `${f.dateShort(periodQuery.from)} – ${f.dateShort(periodQuery.to)}`}
                </span>
              </p>
              <p className="tnum text-xs text-muted">{t('hero.sold', { n: f.num(product.sold) })}</p>
            </div>
            {/* Telefonda pul katakchalari to'liq kenglikda — "43 816 0…" bo'lib kesilmasin */}
            <div className="mt-3 grid grid-cols-2 gap-3 xl:grid-cols-4">
              <HeroStat
                className="col-span-2 sm:col-span-1"
                label={t('kpi.revenue')}
                icon={<TrendingUp className="h-3.5 w-3.5" />}
              >
                <Amount value={f.money(product.revenue)} />
              </HeroStat>
              <HeroStat
                className="col-span-2 sm:col-span-1"
                label={t('kpi.profit')}
                icon={<Scale className="h-3.5 w-3.5" />}
                valueClass={loss ? 'text-danger' : 'text-brand-ink'}
              >
                <Amount value={f.money(product.profit)} />
              </HeroStat>
              <HeroStat label={t('kpi.margin')} valueClass={product.margin < 0 ? 'text-danger' : undefined}>
                {f.pct(product.margin)}
              </HeroStat>
              {/* Tannarx kiritilmagan bo'lsa ROI hisoblanmaydi — "0,0%" chalg'itadi; manfiy ROI esa haqiqiy natija */}
              <HeroStat
                label={t('kpi.roi')}
                hint={hasCost ? undefined : t('kpi.roiNoCost')}
                valueClass={!hasCost ? 'text-muted' : product.roi < 0 ? 'text-danger' : undefined}
              >
                {hasCost ? f.pct(product.roi) : '—'}
              </HeroStat>
            </div>
            <dl className="mt-4 flex flex-wrap gap-x-6 gap-y-2 border-t border-line/60 pt-3 text-xs">
              <div className="flex items-baseline gap-1.5">
                <dt className="text-muted">{t('info.price')}</dt>
                <dd className="tnum font-semibold text-ink">{f.money(product.minPrice)}</dd>
              </div>
              <div className="flex items-baseline gap-1.5">
                <dt className="text-muted">{t('info.cost')}</dt>
                <dd className={cn('tnum font-semibold', cost > 0 ? 'text-ink' : 'text-warn-ink')}>
                  {cost > 0 ? f.money(cost) : t('info.noCost')}
                </dd>
              </div>
              {showAvg ? (
                <div className="flex cursor-help items-baseline gap-1.5" title={t('hero.avgPriceWhy')}>
                  <dt className="text-muted">{t('hero.avgPrice')}</dt>
                  <dd className="tnum font-semibold text-ink">{f.money(product.avgSoldPrice)}</dd>
                </div>
              ) : null}
            </dl>
          </HeroCard>

          {/* Tannarx ogohlantirishi — foyda raqamlari aynan unga bog'liq, shuning uchun darhol ostida */}
          <MissingCostBanner skus={missing} saving={bulkCost.isPending} onApply={(v) => bulkCost.mutate(v)} />

          {/* Bento: qoldiq qamrovi, buyurtma va sifat — har biri bitta savolga javob */}
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <CoverCard product={product} skus={skus} />
            <NeedCard product={product} skus={skus} />
            <QualityCard data={data} />
          </div>

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

          <Segmented<Tab> value={tab} onChange={setTab} options={TABS.map((x) => ({ value: x, label: t(`tab.${x}`) }))} />

          {tab === 'sales' ? <SalesTab data={data} /> : null}
          {tab === 'stocks' ? <StocksTab data={data} /> : null}
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

/** HeroCard ichidagi bitta katta ko'rsatkich */
function HeroStat({
  label,
  icon,
  hint,
  valueClass,
  className,
  children,
}: {
  label: string;
  icon?: ReactNode;
  hint?: string;
  valueClass?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn('well min-w-0 px-4 py-3', hint && 'cursor-help', className)} title={hint}>
      <p className="flex items-center gap-1.5 eyebrow">
        {icon ? <span className="text-muted">{icon}</span> : null}
        <span className="truncate">{label}</span>
        {hint ? <Info className="h-3 w-3 shrink-0" /> : null}
      </p>
      <p
        className={cn(
          'tnum mt-1.5 truncate font-display text-[20px] font-bold leading-tight tracking-[-0.02em] sm:text-[22px]',
          valueClass ?? 'text-ink',
        )}
      >
        {children}
      </p>
    </div>
  );
}

/** Kartochka ichidagi "yorliq — qiymat" qatori */
function InfoRow({ label, value, tone }: { label: ReactNode; value: ReactNode; tone?: Tone }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2.5">
      <dt className="text-sm text-muted">{label}</dt>
      <dd className={cn('tnum text-sm font-semibold', tone ? TONE_TEXT[tone] : 'text-ink')}>{value}</dd>
    </div>
  );
}

/**
 * Ombor qamrovi: halqa — 30 kunlik zaxiraning qancha qismi bor, yonida jami
 * dona va yo'ldagi/band; ostida FBO, FBS va o'z ombori. Rang "yetadi"
 * chizig'idagi bilan bir xil: kritik — qizil, tugayapti — sariq, ortiqcha — ko'k.
 */
function CoverCard({ product, skus }: { product: ProductDetailResponse['product']; skus: ProductDetailSku[] }) {
  const t = useT('productDetail');
  const tc = useT('common');
  const f = useFormat();
  const stock = totalStock(product);
  const days = product.daysLeft ?? null;
  const ringPct = days !== null ? Math.min(100, (days / DETAIL_COVER) * 100) : 0;
  const tone = daysTone(days);
  const inTransit = skus.reduce((s, x) => s + (x.inTransit ?? 0), 0);
  const reserved = skus.reduce((s, x) => s + (x.reserved ?? 0), 0);

  return (
    <Card tone="info">
      <CardHeader icon={<Boxes />} title={t('cover.title')} subtitle={t('cover.subtitle')} />
      <CardBody>
        <div className="flex items-center gap-4">
          <ProgressRing value={ringPct} size={92} stroke={9} tone={tone}>
            <span className={cn('tnum font-display text-xl font-bold leading-none', TONE_TEXT[tone])}>
              {days !== null ? f.num(days) : '—'}
            </span>
            <span className="mt-0.5 text-2xs text-muted">{tc('common.days')}</span>
          </ProgressRing>
          <div className="min-w-0">
            <p className="tnum font-display text-2xl font-bold leading-tight text-ink">
              {f.num(stock)} <span className="text-sm font-semibold text-muted">{tc('common.units').toLowerCase()}</span>
            </p>
            <p className="mt-1 text-xs leading-snug text-muted">
              {days === null
                ? t('cover.noSales')
                : days >= DETAIL_COVER
                  ? t('cover.full', { cover: DETAIL_COVER })
                  : t('cover.share', { cover: DETAIL_COVER, pct: f.pct(ringPct, 0) })}
            </p>
            {inTransit > 0 || reserved > 0 ? (
              <p className="tnum mt-1.5 text-2xs">
                {inTransit > 0 ? (
                  <span className="font-medium text-info-ink">{t('cover.inTransit', { n: f.num(inTransit) })}</span>
                ) : null}
                {inTransit > 0 && reserved > 0 ? <span className="text-muted"> · </span> : null}
                {reserved > 0 ? <span className="text-muted">{t('cover.reserved', { n: f.num(reserved) })}</span> : null}
              </p>
            ) : null}
          </div>
        </div>
        <div className="mt-4 grid grid-cols-3 gap-2">
          {(
            [
              ['stocks.fbo', product.stockFbo],
              ['stocks.fbs', product.stockFbs],
              ['stocks.own', product.stockOwn],
            ] as const
          ).map(([key, value]) => (
            <div key={key} className="well px-3 py-2">
              <p className="eyebrow">{t(key)}</p>
              <p className={cn('tnum text-sm font-bold', (value ?? 0) > 0 ? 'text-ink' : 'text-muted')}>
                {f.num(value ?? 0)}
              </p>
            </div>
          ))}
        </div>
      </CardBody>
    </Card>
  );
}

/**
 * Buyurtma kerak: jami miqdor va eng shoshilinch variantlar. Ilgari bu
 * sahifada buyurtma miqdori umuman ko'rinmasdi, garchi u javobda bo'lsa ham.
 */
function NeedCard({ product, skus }: { product: ProductDetailResponse['product']; skus: ProductDetailSku[] }) {
  const t = useT('productDetail');
  const tc = useT('common');
  const f = useFormat();
  const need = product.needOrder ?? 0;
  // Kritik va tugayotgan, arxivda bo'lmagan variantlar — eng kam kunlisi birinchi
  const urgent = skus
    .filter((s) => !s.archived && (s.status === 'critical' || s.status === 'low'))
    .sort((a, b) => (a.daysLeft ?? 0) - (b.daysLeft ?? 0))
    .slice(0, 3);

  return (
    <Card tone={need > 0 ? 'warn' : 'brand'}>
      <CardHeader icon={<PackagePlus />} title={t('need.title')} subtitle={t('need.subtitle', { n: DETAIL_COVER })} />
      <CardBody>
        {need > 0 ? (
          <p className="tnum font-display text-[28px] font-bold leading-none tracking-[-0.02em] text-ink">
            {f.num(need)} <span className="text-sm font-semibold text-muted">{tc('common.units').toLowerCase()}</span>
          </p>
        ) : (
          <div>
            <p className="font-display text-base font-semibold text-brand-ink">{t('need.none')}</p>
            <p className="mt-0.5 text-xs text-muted">{t('need.noneHint')}</p>
          </div>
        )}

        {urgent.length > 0 ? (
          <div className="mt-4">
            <p className="eyebrow mb-2">{t('need.urgent')}</p>
            <ul className="space-y-1.5">
              {urgent.map((s) => (
                <li key={s.id} className="well flex items-center justify-between gap-3 px-3 py-2">
                  <span className="min-w-0">
                    <span className="tnum block truncate text-xs font-semibold text-ink">{s.sku}</span>
                    <span className="block truncate text-2xs text-muted" title={s.title}>
                      {variantOf(s.title, product.title)}
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    <span className={cn('tnum text-xs font-semibold', TONE_TEXT[daysTone(s.daysLeft)])}>
                      {t('skus.days', { n: f.num(s.daysLeft ?? 0) })}
                    </span>
                    {s.status ? <StockStatusBadge status={s.status} /> : null}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <Link
          to="/planner"
          className="focusable mt-4 inline-flex items-center gap-1 rounded-md text-xs font-semibold text-brand-ink hover:underline"
        >
          {t('need.planner')}
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </CardBody>
    </Card>
  );
}

/**
 * Sifat: xarid foizi (asosiy raqam, rangi 70%/40% chegaralari bo'yicha),
 * qaytarishlar, reyting va javobsiz sharhlar.
 */
function QualityCard({ data }: { data: ProductDetailResponse | undefined }) {
  const t = useT('productDetail');
  const f = useFormat();
  const buyout = useBuyout();
  const product = data?.product;
  if (!product) return null;
  const rate = buyoutRateOf(product);
  const tone = buyoutTone(rate);
  const unanswered = data?.reviews?.totals.unanswered ?? 0;

  return (
    <Card>
      <CardHeader
        icon={<ShieldCheck />}
        tone={tone ?? 'muted'}
        title={t('quality.title')}
        subtitle={t('quality.subtitle')}
      />
      <CardBody>
        <div className="flex cursor-help items-baseline justify-between gap-3" title={buyout.hint(product)}>
          <span className="inline-flex items-center gap-1 text-sm text-muted">
            {buyout.label}
            <Info className="h-3 w-3" />
          </span>
          <span className={cn('tnum font-display text-2xl font-bold leading-none', buyoutTextClass(rate))}>
            {buyout.value(product)}
          </span>
        </div>
        <ProgressBar value={rate ?? 0} tone={tone ?? 'muted'} className="mt-2.5" />
        <dl className="mt-3 divide-y divide-line/60">
          <InfoRow
            label={t('info.returns')}
            value={t('info.units', { n: f.num(product.returns) })}
            tone={product.returns > 0 ? 'warn' : undefined}
          />
          <InfoRow
            label={t('info.rating')}
            value={
              product.rating > 0 ? (
                <span className="inline-flex items-center gap-1">
                  <Star className="h-3.5 w-3.5 text-warn" />
                  {f.num(product.rating, 1)}
                  <span className="font-normal text-muted">· {t('info.reviews', { n: f.num(product.reviewsCount) })}</span>
                </span>
              ) : (
                <span className="font-normal text-muted">{t('quality.noRating')}</span>
              )
            }
          />
          <InfoRow
            label={t('quality.unanswered')}
            value={f.num(unanswered)}
            tone={unanswered > 0 ? 'warn' : undefined}
          />
        </dl>
      </CardBody>
    </Card>
  );
}

function SalesTab({ data }: { data: ProductDetailResponse | undefined }) {
  const t = useT('productDetail');
  const f = useFormat();
  const series = data?.series ?? [];
  const units = series.reduce((s, p) => s + (Number(p.units) || 0), 0);
  return (
    <ChartCard
      icon={<TrendingUp />}
      tone="brand"
      title={t('sales.title')}
      subtitle={t('sales.subtitle')}
      // Dona pul o'qida chizilsa nolga yopishib qolardi (o'ng o'q hali yo'q) — jami chip sifatida
      actions={series.length ? <span className="meta-chip tnum">{t('sales.units', { n: f.num(units) })}</span> : undefined}
    >
      {series.length === 0 ? (
        <EmptyState icon={<TrendingUp className="h-6 w-6" />} title={t('empty.series')} />
      ) : (
        <TrendChart
          data={series as unknown as Record<string, unknown>[]}
          height={320}
          series={[
            { key: 'revenue', name: t('sales.revenue'), money: true, color: CHART_COLORS.info },
            { key: 'profit', name: t('sales.profit'), money: true, color: CHART_COLORS.brand },
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
    <ChartCard icon={<Layers />} tone="info" title={t('stocks.title')} subtitle={t('stocks.subtitle')}>
      {stocks.length === 0 ? (
        <EmptyState icon={<Layers className="h-6 w-6" />} title={t('empty.stocks')} />
      ) : (
        <LinesChart
          data={stocks as unknown as Record<string, unknown>[]}
          height={320}
          series={[
            { key: 'fbo', name: t('stocks.fbo'), color: CHART_COLORS.info },
            { key: 'fbs', name: t('stocks.fbs'), color: CHART_COLORS.teal },
            { key: 'own', name: t('stocks.own'), color: CHART_COLORS.slate },
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
