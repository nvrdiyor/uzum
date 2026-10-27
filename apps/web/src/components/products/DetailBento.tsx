/**
 * Mahsulot sahifasining "bento" kartalari (2026-10-24):
 *   DetailHero     — rasm va davrning asosiy pul raqamlari (sahifadagi yagona HeroCard);
 *   CoverCard      — ombor qamrovi: FBO / FBS / o'z ombori, necha kunga yetadi, tugash sanasi;
 *   NeedCard       — buyurtma kerak: sotib olish va FBO'ga jo'natish (Rejalashtiruvchi rejasi);
 *   QualityCard    — sifat: reyting, salbiy sharhlar, qaytarish ulushi, asosiy sabab;
 *   SalesComboCard — ikki o'qli grafik: sotilgan dona ustunlari + narx yoki tushum chizig'i;
 *   StockHistoryCard — 60 kunlik qoldiq tarixi.
 *
 * Hammasi serverdagi BITTA hisobdan: "yetadi", "buyurtma kerak" va holat —
 * Rejalashtiruvchining o'zi (`plan`, kompaniyaning yetkazish muddati va zaxira
 * davri bilan), qaytarish — "Qaytarishlar" sahifasidagi ta'rif (`quality`).
 * Ilgari kartalar "30 kunlik zaxira" ni qotirib yozardi va halqa ham 30 kunga
 * nisbatan to'lardi — sozlamada 45 kun turgan kompaniyada ham.
 */
import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowRight,
  Boxes,
  CalendarClock,
  Info,
  Layers,
  MessageSquare,
  PackagePlus,
  RotateCcw,
  Scale,
  ShieldCheck,
  Star,
  TrendingUp,
  Truck,
} from '@/components/icons';
import type { ProductCard } from '@savdoiq/shared';
import {
  Amount,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  HeroCard,
  ProductThumb,
  ProgressBar,
  ProgressRing,
  Segmented,
  type Tone,
} from '@/components/ui';
import { CHART_COLORS, ChartCard, ComboChart, LinesChart, SERIES_PALETTE } from '@/components/charts';
import { StockStatusBadge, TONE_TEXT } from '@/components/stock/common';
import { useReturnReasonLabel } from '@/lib/returnReasons';
import { registerNamespace, useFormat, useT } from '@/i18n';
import { cn } from '@/lib/utils';
import { buyoutRateOf, buyoutTextClass, buyoutTone, useBuyout } from './Buyout';
import { ProductTags } from './ProductTags';
import {
  coverHorizon,
  planTone,
  skuTotalCost,
  totalStock,
  type ProductDetailResponse,
  type ProductDetailSku,
} from './types';

registerNamespace('productBento', {
  uz: {
    'hero.title': 'Davr natijasi',
    'hero.sold': '{n} dona sotildi',
    'hero.revenue': 'Tushum',
    'hero.profit': 'Sof foyda',
    'hero.margin': 'Marja',
    'hero.roi': 'ROI',
    'hero.roiNoCost': 'Tannarx kiritilmagan — ROI hisoblanmaydi',
    'hero.price': 'Narx',
    'hero.cost': 'Tannarx',
    'hero.noCost': 'kiritilmagan',
    'hero.avgPrice': 'O‘rtacha sotilgan',
    'hero.avgPriceWhy':
      'Tanlangan davrda xaridorlar haqiqatda to‘lagan narxning o‘rtachasi (tushum ÷ sotilgan dona). Davr ichida narx o‘zgargan yoki aksiya bo‘lgan bo‘lsa, joriy narxdan farq qiladi.',
    'hero.perUnit': '1 donaga foyda',
    'cover.title': 'Ombor qamrovi',
    'cover.subtitle': 'Qoldiq necha kunga yetadi',
    'cover.subtitleMany': 'Eng tez tugaydigan variant bo‘yicha',
    'cover.days': 'kun',
    'cover.units': 'dona',
    'cover.stockout': 'Taxminan {date} da tugaydi',
    'cover.out': 'Qoldiq tugagan — tovar kelguncha sotuv yo‘q',
    'cover.variantOut': '{n} ta variant tugagan — ular tovar kelguncha sotilmaydi',
    'cover.today': 'Eng tez sotilayotgan variant bugun tugaydi',
    'cover.noSales': 'So‘nggi 30 kunda sotuv yo‘q — prognoz qilinmaydi',
    'cover.horizon': 'Chiziq {h} kunga nisbatan: yetkazish {lead} kun + zaxira {cover} kun',
    'cover.inTransit': 'yo‘lda {n}',
    'cover.reserved': 'band {n}',
    'cover.fbo': 'FBO',
    'cover.fbs': 'FBS',
    'cover.own': 'O‘z ombori',
    'cover.ownShort': 'O‘z ombori',
    'need.title': 'Buyurtma kerak',
    'need.subtitle': '{cover} kunlik zaxira · yetkazish {lead} kun',
    'need.subtitleNone': 'Rejalashtiruvchi hisobi',
    'need.buy': 'Sotib olish',
    'need.shipTitle': 'FBO’ga jo‘natish',
    'need.noBuy': 'Sotib olish shart emas — o‘z omboringiz va FBS’dagi tovar yetadi',
    'need.units': 'dona',
    'need.cost': '≈ {v} tannarx bo‘yicha',
    'need.ship': 'Ombordan FBO’ga jo‘nating: {n} dona',
    'need.orderToday': 'Buyurtmani bugun bering',
    'need.orderLate': 'Buyurtma kuni {n} kun oldin o‘tgan',
    'need.orderBy': 'Buyurtma kuni: {date} ({n} kun qoldi)',
    'need.lost': 'Bugun buyurtma berilsa ham tovar kelguncha ~{v} tushum yo‘qotiladi',
    'need.none': 'Hozircha buyurtma shart emas',
    'need.noneHint': 'Barcha variantlar zaxira davriga yetadi',
    'need.noPlan': 'Arxivdagi mahsulot — rejaga kirmaydi',
    'need.urgent': 'Eng shoshilinch variantlar',
    'need.skuBuy': 'buyurtma {n}',
    'need.days': '{n} kun',
    'need.planner': 'Rejalashtiruvchida ochish',
    'quality.title': 'Sifat',
    'quality.subtitle': 'Reyting, sharhlar va qaytarishlar',
    'quality.reviews': '{n} sharh',
    'quality.noRating': 'Hali baholanmagan',
    'quality.negative': 'Salbiy sharhlar (1–2 ★)',
    'quality.unanswered': 'Javobsiz sharhlar',
    'quality.returnRate': 'Qaytarish ulushi',
    'quality.returnRateHint':
      'Qaytgan dona ÷ (xaridor qabul qilgan + qaytgan) — tanlangan davr, “Qaytarishlar” sahifasidagi bilan bir xil ta’rif. Bekor qilinganlar kirmaydi.',
    'quality.returnUnits': '{n} dona',
    'quality.topReason': 'Asosiy sabab',
    'quality.noReason': 'Sabab ko‘rsatilmagan',
    'quality.canceled': 'Bekor qilingan: {n} dona',
    'quality.showReviews': 'Sharhlar',
    'quality.returns': 'Qaytarishlar',
    'sales.title': 'Sotuv dinamikasi',
    'sales.subtitle': 'Oxirgi 60 kun: sotilgan dona va {what}',
    'sales.units': 'Sotildi, dona',
    'sales.price': 'O‘rtacha narx',
    'sales.revenue': 'Tushum',
    'sales.whatPrice': 'o‘rtacha narx',
    'sales.whatRevenue': 'tushum',
    'sales.empty': 'Oxirgi 60 kunda sotuv bo‘lmagan',
    'stocks.title': 'Qoldiqlar tarixi',
    'stocks.subtitle': 'Oxirgi 60 kun, FBO / FBS / o‘z ombori',
    'stocks.empty': 'Qoldiqlar tarixi yo‘q',
  },
  ru: {
    'hero.title': 'Итог за период',
    'hero.sold': 'Продано {n} шт.',
    'hero.revenue': 'Выручка',
    'hero.profit': 'Чистая прибыль',
    'hero.margin': 'Маржа',
    'hero.roi': 'ROI',
    'hero.roiNoCost': 'Себестоимость не указана — ROI не считается',
    'hero.price': 'Цена',
    'hero.cost': 'Себестоимость',
    'hero.noCost': 'не указана',
    'hero.avgPrice': 'Средняя цена продажи',
    'hero.avgPriceWhy':
      'Средняя цена, которую покупатели реально заплатили за выбранный период (выручка ÷ проданные штуки). Если за период менялась цена или шла акция, она отличается от текущей.',
    'hero.perUnit': 'Прибыль на 1 шт.',
    'cover.title': 'Покрытие запасом',
    'cover.subtitle': 'На сколько дней хватит остатка',
    'cover.subtitleMany': 'По самому быстро заканчивающемуся варианту',
    'cover.days': 'дн.',
    'cover.units': 'шт.',
    'cover.stockout': 'Закончится примерно {date}',
    'cover.out': 'Остаток закончился — до поставки продаж не будет',
    'cover.variantOut': 'Закончилось вариантов: {n} — до поставки они не продаются',
    'cover.today': 'Самый быстрый вариант закончится сегодня',
    'cover.noSales': 'За 30 дней продаж нет — прогноза нет',
    'cover.horizon': 'Шкала на {h} дн.: поставка {lead} дн. + запас {cover} дн.',
    'cover.inTransit': 'в пути {n}',
    'cover.reserved': 'резерв {n}',
    'cover.fbo': 'FBO',
    'cover.fbs': 'FBS',
    'cover.own': 'Свой склад',
    'cover.ownShort': 'Склад',
    'need.title': 'Нужен заказ',
    'need.subtitle': 'Запас {cover} дн. · поставка {lead} дн.',
    'need.subtitleNone': 'Расчёт Планировщика',
    'need.buy': 'Закупить',
    'need.shipTitle': 'Отгрузить на FBO',
    'need.noBuy': 'Закупать не нужно — хватит товара на вашем складе и FBS',
    'need.units': 'шт.',
    'need.cost': '≈ {v} по себестоимости',
    'need.ship': 'Отгрузить со склада на FBO: {n} шт.',
    'need.orderToday': 'Закажите сегодня',
    'need.orderLate': 'День заказа прошёл {n} дн. назад',
    'need.orderBy': 'Заказать до {date} (осталось {n} дн.)',
    'need.lost': 'Даже при заказе сегодня до поставки будет потеряно ~{v} выручки',
    'need.none': 'Пока заказывать не нужно',
    'need.noneHint': 'Всех вариантов хватает на период запаса',
    'need.noPlan': 'Товар в архиве — в план не входит',
    'need.urgent': 'Самые срочные варианты',
    'need.skuBuy': 'заказ {n}',
    'need.days': '{n} дн.',
    'need.planner': 'Открыть в Планировщике',
    'quality.title': 'Качество',
    'quality.subtitle': 'Рейтинг, отзывы и возвраты',
    'quality.reviews': 'отзывов: {n}',
    'quality.noRating': 'Оценок пока нет',
    'quality.negative': 'Негативные отзывы (1–2 ★)',
    'quality.unanswered': 'Отзывы без ответа',
    'quality.returnRate': 'Доля возвратов',
    'quality.returnRateHint':
      'Возвращённые штуки ÷ (принятые покупателем + возвращённые) — за выбранный период, как на странице «Возвраты». Отмены не учитываются.',
    'quality.returnUnits': '{n} шт.',
    'quality.topReason': 'Главная причина',
    'quality.noReason': 'Причина не указана',
    'quality.canceled': 'Отменено: {n} шт.',
    'quality.showReviews': 'Отзывы',
    'quality.returns': 'Возвраты',
    'sales.title': 'Динамика продаж',
    'sales.subtitle': 'Последние 60 дней: продано штук и {what}',
    'sales.units': 'Продано, шт.',
    'sales.price': 'Средняя цена',
    'sales.revenue': 'Выручка',
    'sales.whatPrice': 'средняя цена',
    'sales.whatRevenue': 'выручка',
    'sales.empty': 'За последние 60 дней продаж не было',
    'stocks.title': 'История остатков',
    'stocks.subtitle': 'Последние 60 дней, FBO / FBS / свой склад',
    'stocks.empty': 'Нет истории остатков',
  },
  en: {
    'hero.title': 'Period result',
    'hero.sold': '{n} units sold',
    'hero.revenue': 'Revenue',
    'hero.profit': 'Net profit',
    'hero.margin': 'Margin',
    'hero.roi': 'ROI',
    'hero.roiNoCost': 'Cost price not set — ROI is not calculated',
    'hero.price': 'Price',
    'hero.cost': 'Cost price',
    'hero.noCost': 'not set',
    'hero.avgPrice': 'Average selling price',
    'hero.avgPriceWhy':
      'The average price buyers actually paid in the selected period (revenue ÷ units sold). It differs from the current price when the price changed or a promo ran during the period.',
    'hero.perUnit': 'Profit per unit',
    'cover.title': 'Stock cover',
    'cover.subtitle': 'How long the stock lasts',
    'cover.subtitleMany': 'Based on the fastest-selling variant',
    'cover.days': 'days',
    'cover.units': 'pcs',
    'cover.stockout': 'Runs out around {date}',
    'cover.out': 'Out of stock — no sales until the delivery arrives',
    'cover.variantOut': 'Variants out of stock: {n} — they will not sell until the delivery arrives',
    'cover.today': 'The fastest-selling variant runs out today',
    'cover.noSales': 'No sales in the last 30 days — no forecast',
    'cover.horizon': 'Scale of {h} days: {lead}-day lead time + {cover}-day cover',
    'cover.inTransit': '{n} in transit',
    'cover.reserved': '{n} reserved',
    'cover.fbo': 'FBO',
    'cover.fbs': 'FBS',
    'cover.own': 'Own warehouse',
    'cover.ownShort': 'Own',
    'need.title': 'Reorder',
    'need.subtitle': '{cover}-day cover · {lead}-day lead time',
    'need.subtitleNone': 'Planner calculation',
    'need.buy': 'To buy',
    'need.shipTitle': 'Ship to FBO',
    'need.noBuy': 'No purchase needed — your own warehouse and FBS stock cover it',
    'need.units': 'pcs',
    'need.cost': '≈ {v} at cost',
    'need.ship': 'Ship from your warehouse to FBO: {n} pcs',
    'need.orderToday': 'Place the order today',
    'need.orderLate': 'The order date passed {n} days ago',
    'need.orderBy': 'Order by {date} ({n} days left)',
    'need.lost': 'Even if ordered today, ~{v} of revenue is lost before the delivery arrives',
    'need.none': 'No reorder needed yet',
    'need.noneHint': 'Every variant covers the period',
    'need.noPlan': 'Archived product — not in the plan',
    'need.urgent': 'Most urgent variants',
    'need.skuBuy': 'reorder {n}',
    'need.days': '{n} days',
    'need.planner': 'Open in the Planner',
    'quality.title': 'Quality',
    'quality.subtitle': 'Rating, reviews and returns',
    'quality.reviews': '{n} reviews',
    'quality.noRating': 'Not rated yet',
    'quality.negative': 'Negative reviews (1–2 ★)',
    'quality.unanswered': 'Unanswered reviews',
    'quality.returnRate': 'Return rate',
    'quality.returnRateHint':
      'Returned units ÷ (units accepted by buyers + returned) — selected period, same definition as the Returns page. Cancellations are not included.',
    'quality.returnUnits': '{n} pcs',
    'quality.topReason': 'Top reason',
    'quality.noReason': 'No reason given',
    'quality.canceled': 'Cancelled: {n} pcs',
    'quality.showReviews': 'Reviews',
    'quality.returns': 'Returns',
    'sales.title': 'Sales trend',
    'sales.subtitle': 'Last 60 days: units sold and {what}',
    'sales.units': 'Units sold',
    'sales.price': 'Average price',
    'sales.revenue': 'Revenue',
    'sales.whatPrice': 'average price',
    'sales.whatRevenue': 'revenue',
    'sales.empty': 'No sales in the last 60 days',
    'stocks.title': 'Stock history',
    'stocks.subtitle': 'Last 60 days, FBO / FBS / own warehouse',
    'stocks.empty': 'No stock history',
  },
});

/** Holat nishoni ohangi (StockStatusBadge bilan bir xil) — "yetadi" yozuvi shu rangda */
const STATUS_TONE: Record<NonNullable<ProductDetailSku['status']>, Tone> = {
  critical: 'danger',
  low: 'warn',
  ok: 'brand',
  excess: 'info',
  dead: 'muted',
};

/** Variant nomi: "Paxta choyshab … — Kulrang" → "Kulrang" (nom takrorlanmasin) */
export function variantOf(skuTitle: string, productTitle: string): string {
  if (!productTitle || !skuTitle.startsWith(productTitle)) return skuTitle;
  const rest = skuTitle.slice(productTitle.length).replace(/^[\s—–,:·-]+/u, '').trim();
  return rest || skuTitle;
}

/** SKU'lar bo'yicha o'rtacha to'liq tannarx (0 bo'lganlari hisobga olinmaydi) */
export function avgCost(skus: ProductDetailSku[]): number {
  const list = skus.filter((s) => skuTotalCost(s) > 0);
  if (!list.length) return 0;
  return Math.round(list.reduce((sum, s) => sum + skuTotalCost(s), 0) / list.length);
}

// ─────────────────────────── Hero ───────────────────────────

/**
 * Sahifadagi yagona HeroCard — mahsulot (rasmi bilan) davr ichida qancha pul
 * keltirgani. Rasm sarlavha plitkasida emas, shu yerda katta: sotuvchi qaysi
 * tovar ustida turganini ko'radi, raqamlar esa yonida.
 */
export function DetailHero({
  product,
  skus,
  period,
}: {
  product: ProductCard;
  skus: ProductDetailSku[];
  period: { from: string; to: string };
}) {
  const t = useT('productBento');
  const f = useFormat();
  const buyout = useBuyout();
  const loss = product.profit < 0;
  const hasCost = skus.some((s) => (s.purchasePrice ?? 0) > 0);
  const cost = avgCost(skus);
  const showAvg =
    product.avgSoldPrice > 0 && Math.abs(product.avgSoldPrice - product.minPrice) >= product.minPrice * 0.01;
  const perUnit = product.sold > 0 ? product.profit / product.sold : null;

  return (
    <HeroCard tone={loss ? 'danger' : 'brand'} className="p-4 sm:p-6">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
        <div className="flex items-center gap-4 sm:block">
          <div className="h-20 w-20 shrink-0 overflow-hidden rounded-2xl border border-line bg-surface-2 shadow-card sm:h-28 sm:w-28">
            <ProductThumb name={product.title} imageUrl={product.imageUrl} style={{ fontSize: 30 }} />
          </div>
          {/* Telefonda davr va sotilgan dona rasm yonida — tepada bo'sh joy qolmasin */}
          <div className="min-w-0 sm:hidden">
            <p className="eyebrow">{t('hero.title')}</p>
            <p className="tnum mt-0.5 text-xs text-ink-soft">{periodLabel(period, f.dateShort)}</p>
            <p className="tnum text-xs text-muted">{t('hero.sold', { n: f.num(product.sold) })}</p>
          </div>
        </div>

        <div className="min-w-0 flex-1">
          {/* Davr chegarasi raqamlar yonida — qaysi davr natijasi ekani so'ralmasin */}
          <div className="hidden flex-wrap items-baseline justify-between gap-x-4 gap-y-1 sm:flex">
            <p className="eyebrow">
              {t('hero.title')}
              <span className="tnum ml-2 font-medium normal-case tracking-normal text-ink-soft">
                {periodLabel(period, f.dateShort)}
              </span>
            </p>
            <p className="tnum text-xs text-muted">{t('hero.sold', { n: f.num(product.sold) })}</p>
          </div>

          {/* Telefonda pul katakchalari to'liq kenglikda — "43 816 0…" bo'lib kesilmasin */}
          <div className="grid grid-cols-2 gap-2.5 sm:mt-3 xl:grid-cols-4">
            <HeroStat className="col-span-2 sm:col-span-1" label={t('hero.revenue')} icon={<TrendingUp className="h-3.5 w-3.5" />}>
              <Amount value={f.money(product.revenue)} />
            </HeroStat>
            <HeroStat
              className="col-span-2 sm:col-span-1"
              label={t('hero.profit')}
              icon={<Scale className="h-3.5 w-3.5" />}
              valueClass={loss ? 'text-danger' : 'text-brand-ink'}
              hint={perUnit !== null ? `${t('hero.perUnit')}: ${f.money(perUnit)}` : undefined}
            >
              <Amount value={f.money(product.profit)} />
            </HeroStat>
            <HeroStat label={t('hero.margin')} valueClass={product.margin < 0 ? 'text-danger' : undefined}>
              {f.pct(product.margin)}
            </HeroStat>
            {/* Tannarx kiritilmagan bo'lsa ROI hisoblanmaydi — "0,0%" chalg'itadi; manfiy ROI esa haqiqiy natija */}
            <HeroStat
              label={t('hero.roi')}
              hint={hasCost ? undefined : t('hero.roiNoCost')}
              valueClass={!hasCost ? 'text-muted' : product.roi < 0 ? 'text-danger' : undefined}
            >
              {hasCost ? f.pct(product.roi) : '—'}
            </HeroStat>
          </div>

          <div className="mt-3.5 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-line/60 pt-3 text-xs">
            <InlineFact label={t('hero.price')} value={f.money(product.minPrice)} />
            <InlineFact
              label={t('hero.cost')}
              value={cost > 0 ? f.money(cost) : t('hero.noCost')}
              valueClass={cost > 0 ? undefined : 'text-warn-ink'}
            />
            {showAvg ? (
              <InlineFact label={t('hero.avgPrice')} value={f.money(product.avgSoldPrice)} title={t('hero.avgPriceWhy')} />
            ) : null}
            <InlineFact
              label={buyout.short}
              value={buyout.value(product)}
              valueClass={buyoutTextClass(buyoutRateOf(product))}
              title={`${buyout.label}\n${buyout.hint(product)}`}
            />
            <ProductTags product={product} className="ml-auto" />
          </div>
        </div>
      </div>
    </HeroCard>
  );
}

function periodLabel(period: { from: string; to: string }, short: (v: string) => string): string {
  return period.from === period.to ? short(period.from) : `${short(period.from)} – ${short(period.to)}`;
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
    <div className={cn('well min-w-0 px-3.5 py-3', hint && 'cursor-help', className)} title={hint}>
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

function InlineFact({
  label,
  value,
  valueClass,
  title,
}: {
  label: string;
  value: string;
  valueClass?: string;
  title?: string;
}) {
  return (
    <div className={cn('flex items-baseline gap-1.5', title && 'cursor-help')} title={title}>
      <span className="text-muted">{label}</span>
      <span className={cn('tnum font-semibold', valueClass ?? 'text-ink')}>{value}</span>
    </div>
  );
}

// ─────────────────────────── Ombor qamrovi ───────────────────────────

/**
 * Halqa — "yetadi" kunlari yetkazish + zaxira ufqiga nisbatan (Rejalashtiruvchi
 * chizig'i bilan bir xil); rang — Rejalashtiruvchi holati. Yonida jami dona,
 * tugash sanasi va yo'ldagi/band; ostida FBO, FBS va o'z ombori.
 */
export function CoverCard({ product, skus }: { product: ProductCard; skus: ProductDetailSku[] }) {
  const t = useT('productBento');
  const f = useFormat();
  const plan = product.plan;
  const stock = totalStock(product);
  const days = product.daysLeft ?? null;
  const horizon = coverHorizon(plan);
  const ringPct = days !== null ? Math.min(100, (days / horizon) * 100) : 0;
  const tone = planTone(plan, days);
  const inTransit = plan?.inbound ?? skus.reduce((s, x) => s + (x.inTransit ?? 0), 0);
  const reserved = skus.reduce((s, x) => s + (x.reserved ?? 0), 0);
  const selling = skus.filter((s) => !s.archived).length;
  /*
   * "Yetadi" — eng tez tugaydigan variantniki: mahsulotda 296 dona turgan
   * bo'lsa ham u 0 kun bo'lishi mumkin. Shunda "qoldiq tugagan" emas, aynan
   * nechta variant tugagani aytiladi.
   */
  const outVariants = skus.filter(
    (s) => !s.archived && (s.sold > 0 || (s.avgDaily ?? 0) > 0) && (s.stockFbo ?? 0) + (s.stockFbs ?? 0) + (s.stockOwn ?? 0) <= 0,
  ).length;
  const coverText =
    days === null
      ? t('cover.noSales')
      : days === 0
        ? stock <= 0
          ? t('cover.out')
          : outVariants > 0
            ? t('cover.variantOut', { n: f.num(outVariants) })
            : t('cover.today')
        : plan?.stockoutDate
          ? t('cover.stockout', { date: f.date(plan.stockoutDate) })
          : null;

  // Tor katakda qisqa nom ("Own", "Склад") — to'liq nomi izohda
  const parts = [
    { key: 'fbo', label: t('cover.fbo'), title: t('cover.fbo'), value: product.stockFbo, color: CHART_COLORS.info },
    { key: 'fbs', label: t('cover.fbs'), title: t('cover.fbs'), value: product.stockFbs, color: CHART_COLORS.teal },
    { key: 'own', label: t('cover.ownShort'), title: t('cover.own'), value: product.stockOwn, color: CHART_COLORS.slate },
  ];

  return (
    <Card tone="info">
      <CardHeader
        icon={<Boxes />}
        title={t('cover.title')}
        subtitle={selling > 1 ? t('cover.subtitleMany') : t('cover.subtitle')}
      />
      <CardBody>
        <div className="flex items-center gap-4">
          <div title={plan ? t('cover.horizon', { h: horizon, lead: plan.leadDays, cover: plan.coverDays }) : undefined}>
            <ProgressRing value={ringPct} size={92} stroke={9} tone={tone}>
              <span className={cn('tnum font-display text-xl font-bold leading-none', TONE_TEXT[tone])}>
                {days !== null ? f.num(days) : '—'}
              </span>
              <span className="mt-0.5 text-2xs text-muted">{t('cover.days')}</span>
            </ProgressRing>
          </div>
          <div className="min-w-0">
            <p className="tnum font-display text-2xl font-bold leading-tight text-ink">
              {f.num(stock)} <span className="text-sm font-semibold text-muted">{t('cover.units')}</span>
            </p>
            <p className={cn('mt-1 text-xs leading-snug', days === 0 ? 'font-medium text-danger-ink' : 'text-muted')}>
              {coverText}
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

        {/* Sxemalar ulushi bitta tasmada — qaysi ombordagi tovar yetadi, bir qarashda */}
        <div className="mt-4 flex h-2 w-full gap-0.5 overflow-hidden rounded-full bg-surface-3" aria-hidden>
          {stock > 0
            ? parts
                .filter((p) => p.value > 0)
                .map((p) => <span key={p.key} className="h-full" style={{ flex: `${p.value} 1 0%`, backgroundColor: p.color }} />)
            : null}
        </div>
        <div className="mt-2.5 grid grid-cols-3 gap-2">
          {parts.map((p) => (
            <div key={p.key} className="well min-w-0 px-2.5 py-2" title={p.title}>
              {/* Bosh harfli emas: "O‘z ombori" tor katakka kesilmasdan sig'sin */}
              <p className="flex items-center gap-1.5 text-2xs font-medium text-muted">
                <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: p.color }} />
                <span className="truncate">{p.label}</span>
              </p>
              <p className={cn('tnum text-sm font-bold', p.value > 0 ? 'text-ink' : 'text-muted')}>{f.num(p.value)}</p>
            </div>
          ))}
        </div>
      </CardBody>
    </Card>
  );
}

// ─────────────────────────── Buyurtma kerak ───────────────────────────

/**
 * Rejalashtiruvchining o'zi: SOTIB OLISH (yetkazib beruvchidan) va o'z
 * ombori/FBS dan FBO'ga JO'NATISH alohida, buyurtma kuni va — kritik
 * bo'lsa — tovar kelguncha yo'qotiladigan tushum. Zaxira davri va yetkazish
 * muddati qotirilgan "30 kun" emas — kompaniya sozlamasi (`plan`).
 */
export function NeedCard({ product, skus }: { product: ProductCard; skus: ProductDetailSku[] }) {
  const t = useT('productBento');
  const f = useFormat();
  const plan = product.plan;
  const buy = plan?.reorderQty ?? product.needOrder ?? 0;
  const ship = plan?.shipQty ?? 0;
  const order = plan?.orderInDays ?? null;
  const needed = buy > 0 || ship > 0;
  // Sotib olish — sariq (kritikda qizil), faqat o'z omboridan jo'natish — ko'k (qoldiq), hech narsa — brend
  const tone: Tone = !plan
    ? 'muted'
    : plan.status === 'critical'
      ? 'danger'
      : buy > 0
        ? 'warn'
        : ship > 0
          ? 'info'
          : 'brand';

  // Kritik va tugayotgan, arxivda bo'lmagan variantlar — eng kam kunlisi birinchi
  const urgent = skus
    .filter((s) => !s.archived && (s.status === 'critical' || s.status === 'low'))
    .sort((a, b) => (a.daysLeft ?? 0) - (b.daysLeft ?? 0))
    .slice(0, 3);

  // Rejalashtiruvchi shu mahsulot bilan ochiladi: Uzum ID bo'yicha qidiruv (shared search.ts)
  const plannerHref = `/planner?search=${encodeURIComponent(product.uzumProductId ?? product.id)}`;

  return (
    <Card tone={tone}>
      <CardHeader
        icon={<PackagePlus />}
        title={t('need.title')}
        subtitle={
          plan
            ? t('need.subtitle', { cover: f.num(plan.coverDays), lead: f.num(plan.leadDays) })
            : t('need.subtitleNone')
        }
      />
      <CardBody>
        {!plan ? (
          <p className="text-sm text-muted">{t('need.noPlan')}</p>
        ) : buy > 0 ? (
          <div>
            <p className="eyebrow">{t('need.buy')}</p>
            <p className="tnum mt-1 font-display text-[28px] font-bold leading-none tracking-[-0.02em] text-ink">
              {f.num(buy)} <span className="text-sm font-semibold text-muted">{t('need.units')}</span>
            </p>
            {plan.purchaseCost > 0 ? (
              <p className="tnum mt-1 text-xs text-muted">{t('need.cost', { v: f.money(plan.purchaseCost) })}</p>
            ) : null}
          </div>
        ) : ship > 0 ? (
          // Sotib olish shart emas — omborda tovar bor, uni Uzum omboriga yetkazish kerak
          <div>
            <p className="eyebrow">{t('need.shipTitle')}</p>
            <p className="tnum mt-1 font-display text-[28px] font-bold leading-none tracking-[-0.02em] text-ink">
              {f.num(ship)} <span className="text-sm font-semibold text-muted">{t('need.units')}</span>
            </p>
            <p className="mt-1 text-xs text-muted">{t('need.noBuy')}</p>
          </div>
        ) : (
          <div>
            <p className="font-display text-base font-semibold text-brand-ink">{t('need.none')}</p>
            <p className="mt-0.5 text-xs text-muted">{t('need.noneHint')}</p>
          </div>
        )}

        {plan && needed ? (
          <ul className="mt-3 space-y-1.5 text-xs">
            {ship > 0 && buy > 0 ? (
              <NeedLine icon={<Truck className="h-3.5 w-3.5" />} className="text-info-ink">
                {t('need.ship', { n: f.num(ship) })}
              </NeedLine>
            ) : null}
            {order !== null ? (
              <NeedLine
                icon={<CalendarClock className="h-3.5 w-3.5" />}
                className={order <= 0 ? 'font-semibold text-warn-ink' : 'text-ink-soft'}
              >
                {order < 0
                  ? t('need.orderLate', { n: f.num(-order) })
                  : order === 0
                    ? t('need.orderToday')
                    : t('need.orderBy', { date: f.dateShort(plan.orderBy ?? ''), n: f.num(order) })}
              </NeedLine>
            ) : null}
            {plan.lostRevenue > 0 ? (
              <NeedLine icon={<AlertTriangle className="h-3.5 w-3.5" />} className="font-medium text-danger-ink">
                {t('need.lost', { v: f.money(plan.lostRevenue) })}
              </NeedLine>
            ) : null}
          </ul>
        ) : null}

        {urgent.length > 0 ? (
          <div className="mt-4">
            <p className="eyebrow mb-2">{t('need.urgent')}</p>
            <ul className="space-y-1.5">
              {urgent.map((s) => (
                <li key={s.id} className="well flex items-center justify-between gap-3 px-3 py-2">
                  <span className="min-w-0">
                    <span className="block truncate text-xs font-semibold text-ink" title={s.title}>
                      {variantOf(s.title, product.title)}
                    </span>
                    <span className="tnum block truncate text-2xs text-muted">
                      {s.sku}
                      {(s.plan?.reorderQty ?? 0) > 0 ? ` · ${t('need.skuBuy', { n: f.num(s.plan?.reorderQty ?? 0) })}` : ''}
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    <span className={cn('tnum text-xs font-semibold', TONE_TEXT[STATUS_TONE[s.status ?? 'ok']])}>
                      {t('need.days', { n: f.num(s.daysLeft ?? 0) })}
                    </span>
                    {s.status ? <StockStatusBadge status={s.status} /> : null}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <Link
          to={plannerHref}
          className="focusable mt-4 inline-flex items-center gap-1 rounded-md text-xs font-semibold text-brand-ink hover:underline"
        >
          {t('need.planner')}
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </CardBody>
    </Card>
  );
}

function NeedLine({ icon, className, children }: { icon: ReactNode; className?: string; children: ReactNode }) {
  return (
    <li className={cn('tnum flex items-start gap-1.5', className)}>
      <span className="mt-px shrink-0">{icon}</span>
      <span className="min-w-0">{children}</span>
    </li>
  );
}

// ─────────────────────────── Sifat ───────────────────────────

/**
 * Sifat: reyting va salbiy sharhlar (Uzum sharhlari — butun tarix), qaytarish
 * ulushi va eng ko'p sabab (tanlangan davr, "Qaytarishlar" sahifasidagi
 * ta'rif), xarid foizi. Sabab Uzum'dan ruscha keladi — umumiy tarjima
 * (lib/returnReasons.ts) bilan ko'rsatiladi.
 */
export function QualityCard({
  data,
  onShowReviews,
  className,
}: {
  data: ProductDetailResponse;
  onShowReviews?: () => void;
  className?: string;
}) {
  const t = useT('productBento');
  const f = useFormat();
  const buyout = useBuyout();
  const reasonLabel = useReturnReasonLabel();
  const product = data.product;
  const q = data.quality;
  const reviews = data.reviews?.totals;
  const negative = q?.negativeReviews ?? (data.reviews?.distribution ?? []).filter((d) => d.rating <= 2).reduce((s, d) => s + d.count, 0);
  const unanswered = reviews?.unanswered ?? 0;
  const rate = buyoutRateOf(product);
  const bTone = buyoutTone(rate);
  // Qaytarish ulushi 8% dan yuqori — Boshqaruv panelidagi "qaytarishlar o'sdi" xulosasidagi xavf chegarasi
  const returnTone: Tone | undefined = q && q.returnRate >= 8 ? 'danger' : undefined;

  return (
    <Card tone={bTone ?? 'muted'} className={className}>
      <CardHeader icon={<ShieldCheck />} title={t('quality.title')} subtitle={t('quality.subtitle')} />
      <CardBody>
        <div className="flex items-center justify-between gap-3">
          {product.rating > 0 ? (
            <div className="flex items-baseline gap-2">
              <span className="tnum inline-flex items-center gap-1 font-display text-2xl font-bold leading-none text-ink">
                <Star className="h-5 w-5 text-warn" />
                {f.num(product.rating, 1)}
              </span>
              <span className="tnum text-xs text-muted">{t('quality.reviews', { n: f.num(product.reviewsCount) })}</span>
            </div>
          ) : (
            <span className="text-sm text-muted">{t('quality.noRating')}</span>
          )}
          <div className="w-24 cursor-help text-right" title={`${buyout.label}\n${buyout.hint(product)}`}>
            <p className="truncate text-2xs font-medium text-muted">{buyout.short}</p>
            <p className={cn('tnum font-display text-base font-bold leading-tight', buyoutTextClass(rate))}>{buyout.value(product)}</p>
          </div>
        </div>
        <ProgressBar value={product.rating > 0 ? (product.rating / 5) * 100 : 0} tone="warn" className="mt-2.5" />

        <dl className="mt-3 divide-y divide-line/60">
          <QualityRow
            label={t('quality.negative')}
            value={f.num(negative)}
            tone={negative > 0 ? 'warn' : undefined}
          />
          <QualityRow label={t('quality.unanswered')} value={f.num(unanswered)} tone={unanswered > 0 ? 'warn' : undefined} />
          {q ? (
            <QualityRow
              label={t('quality.returnRate')}
              hint={`${t('quality.returnRateHint')}${q.canceledUnits > 0 ? `\n${t('quality.canceled', { n: f.num(q.canceledUnits) })}` : ''}`}
              value={
                <span className="inline-flex items-baseline gap-1.5">
                  {f.pct(q.returnRate)}
                  <span className="font-normal text-muted">· {t('quality.returnUnits', { n: f.num(q.returnedUnits) })}</span>
                </span>
              }
              tone={returnTone}
            />
          ) : null}
          {q && q.returnedUnits > 0 ? (
            <div className="py-2.5">
              <dt className="text-sm text-muted">{t('quality.topReason')}</dt>
              <dd className="mt-0.5 flex items-baseline justify-between gap-3 text-sm">
                <span className="min-w-0 font-medium text-ink" title={q.topReason?.raw}>
                  {q.topReason ? reasonLabel(q.topReason.raw) : <span className="font-normal text-muted">{t('quality.noReason')}</span>}
                </span>
                {q.topReason ? <span className="tnum shrink-0 text-xs text-muted">{f.pct(q.topReason.share, 0)}</span> : null}
              </dd>
            </div>
          ) : null}
        </dl>

        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
          {onShowReviews ? (
            <button
              type="button"
              onClick={onShowReviews}
              className="focusable inline-flex items-center gap-1 rounded-md text-xs font-semibold text-brand-ink hover:underline"
            >
              <MessageSquare className="h-3.5 w-3.5" />
              {t('quality.showReviews')}
            </button>
          ) : null}
          <Link
            to="/returns"
            className="focusable inline-flex items-center gap-1 rounded-md text-xs font-semibold text-brand-ink hover:underline"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            {t('quality.returns')}
          </Link>
        </div>
      </CardBody>
    </Card>
  );
}

function QualityRow({ label, value, tone, hint }: { label: ReactNode; value: ReactNode; tone?: Tone; hint?: string }) {
  return (
    <div className={cn('flex items-center justify-between gap-3 py-2.5', hint && 'cursor-help')} title={hint}>
      <dt className="inline-flex items-center gap-1 text-sm text-muted">
        {label}
        {hint ? <Info className="h-3 w-3" /> : null}
      </dt>
      <dd className={cn('tnum text-sm font-semibold', tone ? TONE_TEXT[tone] : 'text-ink')}>{value}</dd>
    </div>
  );
}

// ─────────────────────────── Sotuv dinamikasi (ikki o'q) ───────────────────────────

type LineMode = 'price' | 'revenue';

/**
 * Ustunlar — kunlik sotilgan dona (chap o'q), chiziq — o'rtacha sotilgan
 * narx yoki tushum (o'ng o'q). Narx chizig'i narx o'zgarganda (aksiya,
 * chegirma) sotuv qanday javob berganini ko'rsatadi; haftalik ko'rinishda
 * narx — o'sha haftaning tushumi ÷ donasi.
 */
export function SalesComboCard({ data, className }: { data: ProductDetailResponse; className?: string }) {
  const t = useT('productBento');
  const [mode, setMode] = useState<LineMode>('price');
  const series = (data.series ?? []) as unknown as Record<string, unknown>[];
  const units = series.reduce((s, p) => s + (Number(p.units) || 0), 0);

  return (
    <ChartCard
      className={className}
      icon={<TrendingUp />}
      tone="brand"
      title={t('sales.title')}
      subtitle={t('sales.subtitle', { what: mode === 'price' ? t('sales.whatPrice') : t('sales.whatRevenue') })}
      actions={
        <Segmented<LineMode>
          size="sm"
          value={mode}
          onChange={setMode}
          options={[
            { value: 'price', label: t('sales.price') },
            { value: 'revenue', label: t('sales.revenue') },
          ]}
        />
      }
    >
      {units <= 0 ? (
        <EmptyState icon={<TrendingUp className="h-6 w-6" />} title={t('sales.empty')} />
      ) : (
        <ComboChart
          data={series}
          height={300}
          bar={{ key: 'units', name: t('sales.units'), color: CHART_COLORS.info }}
          line={
            mode === 'price'
              ? { key: 'price', name: t('sales.price'), money: true, ratioOf: ['revenue', 'units'], color: SERIES_PALETTE[1] }
              : { key: 'revenue', name: t('sales.revenue'), money: true, color: SERIES_PALETTE[1] }
          }
        />
      )}
    </ChartCard>
  );
}

// ─────────────────────────── Qoldiq tarixi ───────────────────────────

export function StockHistoryCard({ data, className }: { data: ProductDetailResponse; className?: string }) {
  const t = useT('productBento');
  const stocks = data.stocks ?? [];
  const any = stocks.some((p) => (p.fbo ?? 0) + (p.fbs ?? 0) + (p.own ?? 0) > 0);
  return (
    <ChartCard className={className} icon={<Layers />} tone="info" title={t('stocks.title')} subtitle={t('stocks.subtitle')}>
      {!any ? (
        <EmptyState icon={<Layers className="h-6 w-6" />} title={t('stocks.empty')} />
      ) : (
        <LinesChart
          data={stocks as unknown as Record<string, unknown>[]}
          height={260}
          series={[
            { key: 'fbo', name: t('cover.fbo'), color: CHART_COLORS.info },
            { key: 'fbs', name: t('cover.fbs'), color: CHART_COLORS.teal },
            { key: 'own', name: t('cover.own'), color: CHART_COLORS.slate },
          ]}
        />
      )}
    </ChartCard>
  );
}
