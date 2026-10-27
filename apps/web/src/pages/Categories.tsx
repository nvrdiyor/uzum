import { useMemo, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ArrowUpRight, LayoutGrid, Snowflake, Table2, Tag, TrendingUp, Trophy } from '@/components/icons';
import { pct, type CategoriesResponse, type CategoryRow } from '@savdoiq/shared';
import {
  Amount,
  Badge,
  Card,
  CardHeader,
  DataTable,
  Delta,
  EmptyState,
  ErrorState,
  HeroCard,
  PageHeader,
  PlanGate,
  PreviewBadge,
  Skeleton,
  type Column,
} from '@/components/ui';
import { FilterBar } from '@/components/filters';
import { PeriodChip } from '@/components/finance/PeriodChip';
import { CategoryProducts, categoryLink, categoryMarginTone } from '@/components/growth/CategoryProducts';
import { CategoryShare, categoryColors } from '@/components/growth/CategoryShare';
import { OwnDataChip, OwnDataNote } from '@/components/growth/OwnData';
import { CATEGORIES_SAMPLE } from '@/components/growth/sample';
import { ComparePeriodChip } from '@/components/trust/ComparePeriod';
import { CostCoverage } from '@/components/trust/CostCoverage';
import { DataFreshness } from '@/components/trust/DataFreshness';
import { useCountUp } from '@/hooks/useCountUp';
import { api } from '@/lib/api';
import { SERIES_OTHER } from '@/lib/theme';
import { useFeature } from '@/store/session';
import { usePeriodQuery } from '@/store/ui';
import { registerNamespace, useFormat, useT } from '@/i18n';
import { cn } from '@/lib/utils';

registerNamespace('categories', {
  uz: {
    title: 'Kategoriyalarim',
    subtitle: 'Qaysi kategoriya pul qoldiradi, qaysi biri o‘sdi va qayerda pul qoldiqda muzlab turibdi',
    'hero.title': 'Kategoriyalar sof foydasi',
    'hero.loss': 'Kategoriyalar zarari',
    'hero.sub': 'Tannarx, soliq va reklamadan keyin · {n} ta kategoriya',
    'hero.margin': 'Marja {v}',
    'hero.prev': 'oldin: {v}',
    'hero.share': 'Tushum ulushi',
    'hero.other': 'Boshqalar ({n})',
    'hero.noSales': 'Bu davrda sotuv bo‘lmagan — qoldiq va muzlagan pul jadvalda',
    'hi.profit': 'Eng ko‘p foyda — {name}: foydaning {v}',
    'hi.growth': 'Eng tez o‘sgan — {name}: tushum {v}',
    'hi.frozen': 'Eng ko‘p muzlagan — {name}: {v} so‘m',
    'kpi.revenue': 'Tushum',
    'kpi.revenueHint': '{units} dona sotildi',
    'kpi.commission': 'Uzum komissiyasi',
    'kpi.commissionHint': 'Tushumning {v} qismi',
    'kpi.returns': 'Qaytarish',
    'kpi.returnsHint': 'Bekor qilish {v}',
    'kpi.stock': 'Qoldiq (tannarx)',
    'kpi.stockHint': '{units} dona · hozirgi holat',
    'kpi.frozen': 'Muzlagan qoldiq',
    'kpi.frozenHint': '{n} SKU · {days}+ kun sotilmagan yoki {excess}+ kunga yetadi',
    'kpi.frozenNone': 'Nolikvid qoldiq yo‘q',
    'table.title': 'Kategoriyalar',
    'table.subtitle': 'Sof foyda bo‘yicha · strelka eng foydali mahsulotlarni ochadi, qator — Mahsulotlar sahifasini',
    'table.count': '{n} ta kategoriya',
    'col.category': 'Kategoriya',
    'col.revenue': 'Tushum',
    'col.share': 'Ulush',
    'col.profit': 'Sof foyda',
    'col.margin': 'Marja',
    'col.commission': 'Komissiya',
    'col.returns': 'Qaytarish',
    'col.stock': 'Qoldiq',
    'cell.skus': '{n} SKU · {s} tasi sotildi',
    'cell.cancel': 'Bekor qilish: {v}',
    'cell.frozen': 'muzlagan {v}',
    'cell.noCost': 'Tannarxsiz: {n}',
    'cell.noCostTitle': '{n} ta mahsulotda tannarx kiritilmagan — foyda haqiqiydan katta ko‘rinadi',
    'cell.open': 'Mahsulotlarni ko‘rish',
    'cell.new': 'Yangi',
    'cell.newTitle': 'Taqqoslash davrida bu kategoriyada sotuv bo‘lmagan',
    uncategorized: 'Kategoriyasiz',
    uncategorizedHint: 'Uzum kartochkasida kategoriya ko‘rsatilmagan mahsulotlar',
    'total.label': 'Jami · {n} ta kategoriya',
    'expand.show': 'Mahsulotlar ({n})',
    'expand.hide': 'Yig‘ish',
    'top.title': 'Eng foydali mahsulotlar',
    'top.more': 'Yana {n} ta mahsulot — Mahsulotlar sahifasida',
    'top.all': 'Kategoriya mahsulotlari',
    'top.empty': 'Davrda bu kategoriyada sotuv bo‘lmagan',
    'top.units': '{n} dona',
    'top.share': 'kategoriyaning {v}',
    'top.margin': 'marja {v}',
    'top.hidden': 'Katalogdan yashirilgan — puli baribir hisobda',
    'detail.commission': 'Komissiya',
    'detail.logistics': 'Yetkazish',
    'detail.cancel': 'Bekor qilish',
    'detail.frozen': 'Muzlagan qoldiq',
    'detail.frozenSkus': '{n} SKU',
    'empty.title': 'Katalogda kategoriya yo‘q',
    'empty.hint': 'Birinchi sinxrondan keyin mahsulotlaringiz kategoriyalar bo‘yicha shu yerda chiqadi.',
    'note.title': 'Raqamlar qanday hisoblanadi',
    'note.money':
      'Pul — «Mahsulot foydasi» bilan bitta hisob: kategoriyalar yig‘indisi o‘sha sahifadagi mahsulotlar yig‘indisiga teng. Mahsulotga bog‘lanmagan xarajatlar ({v}) kategoriyalarga taqsimlanmaydi.',
    'note.returns':
      'Qaytarish — qaytgan ÷ (xaridor qabul qilgan + qaytgan); bekor qilish — bekor qilingan ÷ buyurtma qilingan barcha dona. Davr buyurtma sanasi bo‘yicha.',
    'note.stock':
      'Qoldiq va muzlagan qoldiq — hozirgi holat, tanlangan davrga bog‘liq emas; tannarx bo‘yicha. Muzlagan — {days}+ kun sotilmagan yoki qoldig‘i {excess} kundan ortiqqa yetadi («Nolikvidlar» qoidasi).',
  },
  ru: {
    title: 'Мои категории',
    subtitle: 'Какая категория приносит деньги, какая выросла и где деньги заморожены в остатках',
    'hero.title': 'Чистая прибыль категорий',
    'hero.loss': 'Убыток по категориям',
    'hero.sub': 'После себестоимости, налога и рекламы · категорий: {n}',
    'hero.margin': 'Маржа {v}',
    'hero.prev': 'было: {v}',
    'hero.share': 'Доля выручки',
    'hero.other': 'Остальные ({n})',
    'hero.noSales': 'За период продаж не было — остатки и замороженные деньги в таблице',
    'hi.profit': 'Больше всего прибыли — {name}: {v} прибыли',
    'hi.growth': 'Быстрее всех растёт — {name}: выручка {v}',
    'hi.frozen': 'Больше всего заморожено — {name}: {v} сум',
    'kpi.revenue': 'Выручка',
    'kpi.revenueHint': 'Продано: {units} шт.',
    'kpi.commission': 'Комиссия Uzum',
    'kpi.commissionHint': '{v} от выручки',
    'kpi.returns': 'Возвраты',
    'kpi.returnsHint': 'Отмены {v}',
    'kpi.stock': 'Остаток (себестоимость)',
    'kpi.stockHint': '{units} шт. · на сегодня',
    'kpi.frozen': 'Заморожено',
    'kpi.frozenHint': 'SKU: {n} · без продаж {days}+ дн. или запас на {excess}+ дн.',
    'kpi.frozenNone': 'Неликвидного остатка нет',
    'table.title': 'Категории',
    'table.subtitle': 'По чистой прибыли · стрелка раскрывает самые прибыльные товары, строка — страницу «Товары»',
    'table.count': 'Категорий: {n}',
    'col.category': 'Категория',
    'col.revenue': 'Выручка',
    'col.share': 'Доля',
    'col.profit': 'Чистая прибыль',
    'col.margin': 'Маржа',
    'col.commission': 'Комиссия',
    'col.returns': 'Возвраты',
    'col.stock': 'Остаток',
    'cell.skus': 'SKU: {n} · с продажами: {s}',
    'cell.cancel': 'Отмены: {v}',
    'cell.frozen': 'заморожено {v}',
    'cell.noCost': 'Без себестоимости: {n}',
    'cell.noCostTitle': 'Товаров без себестоимости: {n} — прибыль выглядит больше реальной',
    'cell.open': 'Смотреть товары',
    'cell.new': 'Новая',
    'cell.newTitle': 'В периоде сравнения продаж в этой категории не было',
    uncategorized: 'Без категории',
    uncategorizedHint: 'Товары, у которых в карточке Uzum не указана категория',
    'total.label': 'Итого · категорий: {n}',
    'expand.show': 'Товары ({n})',
    'expand.hide': 'Свернуть',
    'top.title': 'Самые прибыльные товары',
    'top.more': 'Ещё товаров: {n} — на странице «Товары»',
    'top.all': 'Товары категории',
    'top.empty': 'В периоде продаж в этой категории не было',
    'top.units': '{n} шт.',
    'top.share': '{v} категории',
    'top.margin': 'маржа {v}',
    'top.hidden': 'Скрыт из каталога — деньги всё равно учтены',
    'detail.commission': 'Комиссия',
    'detail.logistics': 'Доставка',
    'detail.cancel': 'Отмены',
    'detail.frozen': 'Заморожено',
    'detail.frozenSkus': 'SKU: {n}',
    'empty.title': 'В каталоге нет категорий',
    'empty.hint': 'После первой синхронизации ваши товары появятся здесь по категориям.',
    'note.title': 'Как считаются цифры',
    'note.money':
      'Деньги — тот же расчёт, что и «Прибыль по товарам»: сумма категорий равна сумме товаров там. Расходы, не привязанные к товару ({v}), по категориям не распределяются.',
    'note.returns':
      'Возвраты — вернули ÷ (получили покупатели + вернули); отмены — отменено ÷ все заказанные штуки. Период — по дате заказа.',
    'note.stock':
      'Остаток и замороженный остаток — на сегодня, не зависят от выбранного периода; по себестоимости. Заморожено — без продаж {days}+ дн. или запаса хватит более чем на {excess} дн. (правило «Неликвидов»).',
  },
  en: {
    title: 'My categories',
    subtitle: 'Which category makes money, which one grew and where cash is frozen in stock',
    'hero.title': 'Net profit of categories',
    'hero.loss': 'Loss across categories',
    'hero.sub': 'After cost of goods, tax and ads · categories: {n}',
    'hero.margin': 'Margin {v}',
    'hero.prev': 'was {v}',
    'hero.share': 'Revenue share',
    'hero.other': 'Others ({n})',
    'hero.noSales': 'No sales in this period — stock and frozen cash are in the table',
    'hi.profit': 'Most profit — {name}: {v} of profit',
    'hi.growth': 'Fastest growing — {name}: revenue {v}',
    'hi.frozen': 'Most cash frozen — {name}: {v} UZS',
    'kpi.revenue': 'Revenue',
    'kpi.revenueHint': '{units} units sold',
    'kpi.commission': 'Uzum commission',
    'kpi.commissionHint': '{v} of revenue',
    'kpi.returns': 'Returns',
    'kpi.returnsHint': 'Cancellations {v}',
    'kpi.stock': 'Stock (at cost)',
    'kpi.stockHint': '{units} units · as of today',
    'kpi.frozen': 'Frozen stock',
    'kpi.frozenHint': 'SKUs: {n} · no sale for {days}+ days or {excess}+ days of cover',
    'kpi.frozenNone': 'No illiquid stock',
    'table.title': 'Categories',
    'table.subtitle': 'By net profit · the arrow opens the most profitable products, the row opens Products',
    'table.count': 'Categories: {n}',
    'col.category': 'Category',
    'col.revenue': 'Revenue',
    'col.share': 'Share',
    'col.profit': 'Net profit',
    'col.margin': 'Margin',
    'col.commission': 'Commission',
    'col.returns': 'Returns',
    'col.stock': 'Stock',
    'cell.skus': 'SKUs: {n} · sold: {s}',
    'cell.cancel': 'Cancellations: {v}',
    'cell.frozen': 'frozen {v}',
    'cell.noCost': 'No cost price: {n}',
    'cell.noCostTitle': 'Products without a cost price: {n} — profit looks higher than it is',
    'cell.open': 'Open products',
    'cell.new': 'New',
    'cell.newTitle': 'No sales in this category during the comparison period',
    uncategorized: 'Uncategorised',
    uncategorizedHint: 'Products whose Uzum card has no category',
    'total.label': 'Total · categories: {n}',
    'expand.show': 'Products ({n})',
    'expand.hide': 'Collapse',
    'top.title': 'Most profitable products',
    'top.more': 'More products: {n} — on the Products page',
    'top.all': 'Products in this category',
    'top.empty': 'No sales in this category during the period',
    'top.units': '{n} units',
    'top.share': '{v} of category',
    'top.margin': 'margin {v}',
    'top.hidden': 'Hidden from catalogue — its money still counts',
    'detail.commission': 'Commission',
    'detail.logistics': 'Delivery',
    'detail.cancel': 'Cancellations',
    'detail.frozen': 'Frozen stock',
    'detail.frozenSkus': 'SKUs: {n}',
    'empty.title': 'No categories in the catalogue',
    'empty.hint': 'After the first sync your products will appear here grouped by category.',
    'note.title': 'How the numbers are calculated',
    'note.money':
      'Money uses the same calculation as “Profit by product”: the categories add up to the products there. Costs not tied to a product ({v}) are not split across categories.',
    'note.returns':
      'Returns — returned ÷ (received by buyers + returned); cancellations — cancelled ÷ all ordered units. Periods go by order date.',
    'note.stock':
      'Stock and frozen stock are as of today, regardless of the selected period, valued at cost. Frozen — no sale for {days}+ days or cover beyond {excess} days (the “Illiquid” rule).',
  },
});

/**
 * Kategoriyalarim — sotuvchining O'Z katalogidagi kategoriyalar: qaysi biri
 * pul qoldiradi, qaysi biri o'sdi, qayerda pul qoldiqda muzlab turibdi.
 * Bozor ma'lumoti ATAYLAB yo'q (apps/api routes/categories.ts) — sarlavha
 * ostidagi chip va sahifa oxiridagi izoh buni ochiq aytadi (2026-10-24).
 *
 * Tarif — 'abc_analysis' (ABC tahlil bilan bir oila). To'liq ochiq bo'lmasa
 * so'rov yuborilmaydi: 402 javobi qulf oynasi ostida xato chizardi — o'rniga
 * namuna (components/growth/sample.ts) xira ko'rinadi (Vgh.tsx kabi).
 */
export default function Categories() {
  const t = useT('categories');
  const q = usePeriodQuery();
  const access = useFeature('abc_analysis');

  const query = useQuery({
    queryKey: ['growth-categories', q],
    queryFn: () => api.get<CategoriesResponse>('/growth/categories', q),
    placeholderData: keepPreviousData,
    enabled: access === 'full',
  });
  const data = query.data;

  return (
    <>
      <PageHeader
        icon={<LayoutGrid className="h-5 w-5" />}
        title={t('title')}
        description={t('subtitle')}
        badge={<PreviewBadge feature="abc_analysis" />}
        meta={
          <>
            <PeriodChip />
            {data && (data.comparePeriod || data.totals.revenue > 0) ? <ComparePeriodChip period={data.comparePeriod} /> : null}
            <OwnDataChip />
            <DataFreshness />
            <CostCoverage />
          </>
        }
      />

      {/* Telefonda do'kon tanlagichi; davr va taqqoslash — yuqori panelda */}
      <FilterBar />

      <PlanGate feature="abc_analysis" previewChildren={<CategoriesReport data={CATEGORIES_SAMPLE} />}>
        {query.isError ? (
          <Card>
            <ErrorState
              message={query.error instanceof Error ? query.error.message : undefined}
              onRetry={() => void query.refetch()}
            />
          </Card>
        ) : (
          <CategoriesReport data={data} loading={query.isLoading} fetching={query.isFetching && !query.isLoading} />
        )}
      </PlanGate>
    </>
  );
}

/** Bosh kartochka, jadval va izoh — sahifa ham, sinovdagi namuna ham shu bilan chiziladi */
function CategoriesReport({ data, loading, fetching }: { data?: CategoriesResponse; loading?: boolean; fetching?: boolean }) {
  const t = useT('categories');
  const f = useFormat();

  if (loading || !data) {
    return (
      <div className="space-y-5">
        <Skeleton className="h-[360px] w-full rounded-2xl" />
        <Skeleton className="h-[420px] w-full rounded-2xl" />
      </div>
    );
  }

  if (data.rows.length === 0) {
    return (
      <Card>
        <EmptyState icon={<LayoutGrid className="h-6 w-6" />} title={t('empty.title')} hint={t('empty.hint')} />
      </Card>
    );
  }

  return (
    <div className={cn('space-y-5 transition-opacity', fetching && 'opacity-70')}>
      <CategoriesHero data={data} />
      <CategoriesTable data={data} />
      <OwnDataNote>
        <p>{t('note.money', { v: f.money(data.unallocated) })}</p>
        <p>{t('note.returns')}</p>
        <p>{t('note.stock', { days: f.num(data.thresholds.illiquidDays), excess: f.num(data.thresholds.excessDays) })}</p>
      </OwnDataNote>
    </div>
  );
}

/**
 * Sahifaning yagona HeroCard'i: kategoriyalar sof foydasi va tushum ulushi
 * halqasi, ostida besh plitka. Sof foyda — "Mahsulot foydasi" sahifasidagi
 * mahsulotlar yig'indisining o'zi (do'kon sof foydasi emas: mahsulotga
 * bog'lanmagan xarajatlar kategoriyalarga taqsimlanmaydi — izoh pastda).
 */
function CategoriesHero({ data }: { data: CategoriesResponse }) {
  const t = useT('categories');
  const f = useFormat();
  const T = data.totals;
  const loss = T.netProfit < 0;
  const shown = useCountUp(T.netProfit);
  const compared = data.comparePeriod !== null;
  const marginTone = categoryMarginTone(T.margin, T.revenue);

  return (
    <HeroCard tone={loss ? 'danger' : 'brand'} className="p-5 sm:p-6">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] lg:gap-8">
        <div className="flex min-w-0 flex-col">
          <div className="flex min-w-0 items-center gap-3">
            <span className="icon-tile h-10 w-10 rounded-xl [&_svg]:h-5 [&_svg]:w-5" aria-hidden>
              <LayoutGrid />
            </span>
            <div className="min-w-0">
              <p className="font-display text-[15px] font-semibold leading-5 text-ink">
                {loss ? t('hero.loss') : t('hero.title')}
              </p>
              <p className="truncate text-xs text-muted">{t('hero.sub', { n: f.num(T.categories) })}</p>
            </div>
          </div>

          <p
            className={cn(
              'tnum mt-5 font-title text-[30px] font-semibold leading-none tracking-[-0.03em] sm:text-[38px]',
              loss ? 'text-danger-ink' : 'text-ink',
            )}
          >
            <Amount value={f.money(shown)} />
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            <Badge tone={marginTone}>
              <span className="tnum">{t('hero.margin', { v: f.pct(T.margin) })}</span>
            </Badge>
            {/* O'zgarish faqat taqqoslash davri saqlangan tarix ichida bo'lsa (server comparePeriod) */}
            {compared ? <Delta value={T.deltas.netProfit} /> : null}
            {compared && T.previous ? (
              <span className="tnum text-2xs text-muted">{t('hero.prev', { v: f.money(T.previous.netProfit) })}</span>
            ) : null}
          </div>

          <Highlights data={data} />
        </div>

        <div className="min-w-0 lg:border-l lg:border-line/70 lg:pl-8">
          <p className="eyebrow">{t('hero.share')}</p>
          {T.revenue > 0 ? (
            <CategoryShare rows={data.rows} revenue={T.revenue} compared={compared} className="mt-3" />
          ) : (
            // Davrda sotuv yo'q, lekin katalog va qoldiq bor — jadval baribir chiqadi (muzlagan pul shu yerda)
            <p className="mt-3 rounded-xl border border-line/70 bg-surface-2/50 px-4 py-6 text-center text-sm text-muted">
              {t('hero.noSales')}
            </p>
          )}
        </div>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-5">
        <HeroWell
          label={t('kpi.revenue')}
          value={f.money(T.revenue)}
          hint={t('kpi.revenueHint', { units: f.num(T.units) })}
          delta={compared ? T.deltas.revenue : undefined}
        />
        <HeroWell
          label={t('kpi.commission')}
          value={f.money(T.commission)}
          hint={T.commissionShare === null ? '—' : t('kpi.commissionHint', { v: f.pct(T.commissionShare) })}
        />
        <HeroWell
          label={t('kpi.returns')}
          value={T.returnRate === null ? '—' : f.pct(T.returnRate)}
          hint={t('kpi.returnsHint', { v: T.cancelRate === null ? '—' : f.pct(T.cancelRate) })}
          delta={compared ? T.deltas.returnRate : undefined}
          deltaUnit="pp"
          // Qaytarish ko'paysa — yomon: o'sish qizil, kamayish yashil
          invert
        />
        <HeroWell
          label={t('kpi.stock')}
          value={f.money(T.stockValue)}
          hint={t('kpi.stockHint', { units: f.num(T.stockUnits) })}
        />
        <HeroWell
          className="col-span-2 sm:col-span-1"
          label={t('kpi.frozen')}
          value={f.money(T.frozenValue)}
          hint={
            // Qiymat yashirilgan bo'lsa (pulsiz ko'rinish shabloni, null) — SKU sanog'i bo'yicha
            T.frozenValue > 0 || (T.frozenValue === null && T.frozenSkus > 0)
              ? t('kpi.frozenHint', {
                  n: f.num(T.frozenSkus),
                  days: f.num(data.thresholds.illiquidDays),
                  excess: f.num(data.thresholds.excessDays),
                })
              : t('kpi.frozenNone')
          }
          warn={T.frozenValue > 0}
          icon={<Snowflake className="h-3.5 w-3.5" />}
        />
      </div>
    </HeroCard>
  );
}

/** Bir xil sotuvli kategoriya "eng tez o'sgan" bo'lishi uchun tushumdagi eng kichik ulushi, % — 2% lik kategoriya +80% bilan baqirmasin */
const GROWTH_MIN_SHARE = 5;

/**
 * Uch qisqa xulosa — jadvalni o'qimasdan javob: qaysi kategoriya eng ko'p
 * foyda qoldirdi, qaysi biri eng tez o'sdi (taqqoslash davri bo'lsa) va pul
 * qayerda ko'proq muzlagan. Kategoriyasiz guruh "g'olib" bo'lmaydi — u
 * kategoriya emas.
 */
function Highlights({ data }: { data: CategoriesResponse }) {
  const t = useT('categories');
  const f = useFormat();
  const named = data.rows.filter((r) => r.category !== null);
  const positive = named.reduce((s, r) => s + Math.max(0, r.netProfit), 0);
  const topProfit = named.filter((r) => r.netProfit > 0).sort((a, b) => b.netProfit - a.netProfit)[0];
  const topGrowth =
    data.comparePeriod === null
      ? undefined
      : named
          .filter(
            (r) =>
              r.deltas.revenue !== null &&
              r.deltas.revenue > 0 &&
              (r.previous?.revenue ?? 0) > 0 &&
              r.revenueShare >= GROWTH_MIN_SHARE,
          )
          .sort((a, b) => (b.deltas.revenue ?? 0) - (a.deltas.revenue ?? 0))[0];
  const topFrozen = named.filter((r) => r.frozenValue > 0).sort((a, b) => b.frozenValue - a.frozenValue)[0];

  const items: { key: string; icon: ReactNode; text: string; tone: string }[] = [];
  if (topProfit) {
    items.push({
      key: 'profit',
      icon: <Trophy className="h-3.5 w-3.5" />,
      text: t('hi.profit', { name: topProfit.category ?? '', v: f.pct(pct(topProfit.netProfit, positive), 0) }),
      tone: 'text-brand-ink',
    });
  }
  if (topGrowth) {
    items.push({
      key: 'growth',
      icon: <TrendingUp className="h-3.5 w-3.5" />,
      text: t('hi.growth', { name: topGrowth.category ?? '', v: `+${f.num(topGrowth.deltas.revenue ?? 0, 1)}%` }),
      tone: 'text-brand-ink',
    });
  }
  if (topFrozen) {
    items.push({
      key: 'frozen',
      icon: <Snowflake className="h-3.5 w-3.5" />,
      text: t('hi.frozen', { name: topFrozen.category ?? '', v: f.compact(topFrozen.frozenValue) }),
      tone: 'text-warn-ink',
    });
  }
  if (items.length === 0) return null;

  return (
    <ul className="mt-5 space-y-1.5 lg:mt-auto lg:pt-5">
      {items.map((x) => (
        <li key={x.key} className="flex min-w-0 items-center gap-2 text-xs text-ink-soft">
          <span className={cn('shrink-0', x.tone)}>{x.icon}</span>
          <span className="min-w-0 truncate" title={x.text}>
            {x.text}
          </span>
        </li>
      ))}
    </ul>
  );
}

function HeroWell({
  label,
  value,
  hint,
  delta,
  deltaUnit = 'pct',
  invert,
  warn,
  icon,
  className,
}: {
  label: string;
  value: string;
  hint: string;
  /** undefined — taqqoslash yo'q (chip chizilmaydi); null — taqqoslab bo'lmaydi (tire) */
  delta?: number | null;
  deltaUnit?: 'pct' | 'pp';
  invert?: boolean;
  warn?: boolean;
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('well min-w-0 p-3', className)}>
      <p className={cn('eyebrow flex min-w-0 items-center gap-1.5', warn && 'text-warn-ink')}>
        {/* shrink-0: uzun ruscha yorliqda ("Замороженный остаток") ikonka nolgacha siqilib ketardi */}
        {icon ? <span className="shrink-0">{icon}</span> : null}
        <span className="truncate">{label}</span>
      </p>
      <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
        <p className={cn('tnum truncate font-display text-base font-bold leading-6', warn ? 'text-warn-ink' : 'text-ink')}>
          <Amount value={value} />
        </p>
        {delta !== undefined ? <Delta value={delta} unit={deltaUnit} invert={invert} className="px-1.5 py-0.5 text-2xs" /> : null}
      </div>
      <p className="mt-0.5 line-clamp-2 text-2xs leading-snug text-muted">{hint}</p>
    </div>
  );
}

/**
 * Kategoriyalar jadvali — sof foyda bo'yicha (server tartibi). Ustunlar 1366
 * px'ga sig'adi: ulush tasmasi faqat 2xl dan (u bosh kartochkadagi halqada
 * bor), komissiya — xl dan; telefondagi kartada ikkalasi "Batafsil" ostida.
 * Qator bosilganda — Mahsulotlar sahifasi shu kategoriya filtri bilan;
 * strelka — eng foydali mahsulotlar va tafsilot.
 */
function CategoriesTable({ data }: { data: CategoriesResponse }) {
  const t = useT('categories');
  const f = useFormat();
  const navigate = useNavigate();
  const compared = data.comparePeriod !== null;
  const colors = useMemo(() => categoryColors(data.rows), [data.rows]);

  const columns: Column<CategoryRow>[] = useMemo(
    () => [
      {
        key: 'category',
        header: t('col.category'),
        sortable: true,
        sortValue: (r) => r.category ?? '',
        render: (r) => {
          const fresh = compared && r.previous !== null && r.previous.revenue <= 0 && r.revenue > 0;
          return (
            <div className="min-w-0 max-w-[15rem] 2xl:max-w-[18rem]">
              <div className="flex min-w-0 items-center gap-2">
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ background: colors.get(r.category) ?? SERIES_OTHER }}
                  aria-hidden
                />
                <span
                  className={cn('truncate text-sm font-semibold', r.category === null ? 'text-muted' : 'text-ink')}
                  title={r.category ?? t('uncategorizedHint')}
                >
                  {r.category ?? t('uncategorized')}
                </span>
                {fresh ? (
                  <Badge tone="info" className="shrink-0 px-1.5 py-0" title={t('cell.newTitle')}>
                    {t('cell.new')}
                  </Badge>
                ) : null}
                {r.category !== null ? (
                  <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-muted opacity-0 transition-opacity group-hover:opacity-100" aria-label={t('cell.open')} />
                ) : null}
              </div>
              <p className="tnum mt-0.5 truncate pl-[18px] text-2xs text-muted">
                {t('cell.skus', { n: f.num(r.skuCount), s: f.num(r.sellingSkus) })}
              </p>
              {r.noCostProducts > 0 ? (
                <Badge tone="warn" className="ml-[18px] mt-1 px-1.5 py-0" title={t('cell.noCostTitle', { n: f.num(r.noCostProducts) })}>
                  <Tag className="h-3 w-3" />
                  <span className="tnum">{t('cell.noCost', { n: f.num(r.noCostProducts) })}</span>
                </Badge>
              ) : null}
            </div>
          );
        },
      },
      {
        key: 'revenue',
        header: t('col.revenue'),
        align: 'right',
        sortable: true,
        sortValue: (r) => r.revenue,
        render: (r) => (
          <div className="flex flex-col items-end gap-1 max-md:items-start">
            <span className="tnum text-ink">{f.money(r.revenue)}</span>
            {compared ? <Delta value={r.deltas.revenue} className="px-1.5 py-0.5 text-2xs" /> : null}
          </div>
        ),
      },
      {
        key: 'share',
        header: t('col.share'),
        align: 'right',
        hideBelow: '2xl',
        sortable: true,
        sortValue: (r) => r.revenueShare,
        render: (r) => (
          <div className="flex flex-col items-end gap-1 max-md:items-start">
            <span className="flex items-center gap-2">
              <span className="block h-1.5 w-16 overflow-hidden rounded-full bg-surface-3">
                <span
                  className="block h-full rounded-full"
                  style={{ width: `${Math.min(100, Math.max(0, r.revenueShare))}%`, background: colors.get(r.category) ?? SERIES_OTHER }}
                />
              </span>
              <span className="tnum w-12 text-right text-ink-soft">{f.pct(r.revenueShare)}</span>
            </span>
            {compared ? <Delta value={r.deltas.revenueShare} unit="pp" className="px-1.5 py-0.5 text-2xs" /> : null}
          </div>
        ),
      },
      {
        key: 'netProfit',
        header: t('col.profit'),
        align: 'right',
        sortable: true,
        sortValue: (r) => r.netProfit,
        render: (r) => (
          <div className="flex flex-col items-end gap-1 max-md:items-start">
            <span className={cn('tnum font-display text-sm font-bold', r.netProfit < 0 ? 'text-danger' : 'text-brand-ink')}>
              {f.money(r.netProfit)}
            </span>
            {compared ? <Delta value={r.deltas.netProfit} className="px-1.5 py-0.5 text-2xs" /> : null}
          </div>
        ),
      },
      {
        key: 'margin',
        header: t('col.margin'),
        align: 'right',
        sortable: true,
        sortValue: (r) => (r.revenue > 0 ? r.margin : -1e9),
        render: (r) => (
          <div className="flex flex-col items-end gap-1 max-md:items-start">
            {r.revenue > 0 ? (
              <Badge tone={categoryMarginTone(r.margin, r.revenue)} className="px-2 py-0.5">
                <span className="tnum">{f.pct(r.margin)}</span>
              </Badge>
            ) : (
              <span className="text-muted">—</span>
            )}
            {compared && r.deltas.margin !== null ? (
              <Delta value={r.deltas.margin} unit="pp" className="px-1.5 py-0.5 text-2xs" />
            ) : null}
          </div>
        ),
      },
      {
        key: 'commission',
        header: t('col.commission'),
        align: 'right',
        hideBelow: 'xl',
        sortable: true,
        sortValue: (r) => r.commissionShare ?? -1,
        render: (r) => (
          <div className="leading-tight" title={f.money(r.commission)}>
            {/* Binafsha — "Uzum oladigan qism" (COST_COLORS.commission), hamma sahifada bir xil */}
            <p className="tnum text-sm font-semibold text-violet-ink">
              {r.commissionShare === null ? '—' : f.pct(r.commissionShare)}
            </p>
            {/* Qisqa summa: to'liq "15 994 370 so'm" jadvalni 1366 px'dan chiqarib yuborardi; to'lig'i izohda va qator ochilganda */}
            <p className="tnum text-2xs text-muted">{f.compact(r.commission)}</p>
          </div>
        ),
      },
      {
        key: 'returns',
        header: t('col.returns'),
        align: 'right',
        sortable: true,
        sortValue: (r) => r.returnRate ?? -1,
        render: (r) => (
          /*
           * Ikki qator, boshqa raqam ustunlari kabi. Bekor qilish ulushi izohda va
           * qator ochilganda: uchinchi qator har qatorni ~80 px'ga cho'zardi,
           * bir qatorga yig'ilganda esa jadval 1366 px'dan chiqib ketdi (2026-10-24).
           */
          <div
            className="flex flex-col items-end gap-1 max-md:items-start"
            title={t('cell.cancel', { v: r.cancelRate === null ? '—' : f.pct(r.cancelRate) })}
          >
            <span className="tnum text-ink-soft">{r.returnRate === null ? '—' : f.pct(r.returnRate)}</span>
            {compared && r.deltas.returnRate !== null ? (
              <Delta value={r.deltas.returnRate} unit="pp" invert className="px-1.5 py-0.5 text-2xs" />
            ) : null}
          </div>
        ),
      },
      {
        key: 'stock',
        header: t('col.stock'),
        align: 'right',
        sortable: true,
        sortValue: (r) => r.stockValue,
        render: (r) => (
          <div className="leading-tight">
            <p className="tnum text-sm text-ink">{f.money(r.stockValue)}</p>
            {r.frozenValue > 0 ? (
              <p className="tnum text-2xs font-medium text-warn-ink">{t('cell.frozen', { v: f.compact(r.frozenValue) })}</p>
            ) : (
              <p className="tnum text-2xs text-muted">{t('top.units', { n: f.num(r.stockUnits) })}</p>
            )}
          </div>
        ),
      },
    ],
    [t, f, compared, colors],
  );

  const T = data.totals;
  const cell = 'px-5 py-2.5';
  // Telefondagi jami qatorida faqat nom va sof foyda — qolgani 375 px'da qatorni yon tomonga cho'zardi
  const wideOnly = 'hidden md:table-cell';

  return (
    <Card className="overflow-hidden">
      <CardHeader
        icon={<Table2 />}
        title={t('table.title')}
        subtitle={t('table.subtitle')}
        actions={<span className="meta-chip tnum">{t('table.count', { n: f.num(T.categories) })}</span>}
      />
      <div className="mt-4">
        <DataTable<CategoryRow>
          columns={columns}
          rows={data.rows}
          rowKey={(r) => r.category ?? '∅'}
          density="compact"
          localSort
          onRowClick={(r) => {
            const to = categoryLink(r.category);
            if (to) navigate(to);
          }}
          renderExpanded={(r) => <CategoryProducts row={r} />}
          expandLabel={(r, open) => (open ? t('expand.hide') : t('expand.show', { n: f.num(r.products) }))}
          footer={
            <>
              <td className={cell}>{t('total.label', { n: f.num(T.categories) })}</td>
              <td className={cn(cell, wideOnly, 'tnum whitespace-nowrap text-right')}>{f.money(T.revenue)}</td>
              {/* Ustunlar bilan bir xil yashiriladi — aks holda jami kataklari bir ustunga siljiydi */}
              <td className={cn(cell, 'hidden 2xl:table-cell')} />
              <td
                className={cn(
                  cell,
                  'tnum whitespace-nowrap text-right font-display font-bold',
                  T.netProfit < 0 ? 'text-danger' : 'text-brand-ink',
                )}
              >
                {f.money(T.netProfit)}
              </td>
              <td className={cn(cell, wideOnly, 'tnum whitespace-nowrap text-right')}>
                {/* Pulsiz ko'rinish shablonida sof foyda null — "0,0%" emas, "—" */}
                {T.revenue > 0 && T.netProfit !== null ? f.pct(pct(T.netProfit, T.revenue)) : '—'}
              </td>
              <td className={cn(cell, 'tnum hidden whitespace-nowrap text-right xl:table-cell')}>
                {T.commissionShare === null ? '—' : f.pct(T.commissionShare)}
              </td>
              <td className={cn(cell, wideOnly, 'tnum whitespace-nowrap text-right')}>
                {T.returnRate === null ? '—' : f.pct(T.returnRate)}
              </td>
              <td className={cn(cell, wideOnly, 'tnum whitespace-nowrap text-right')}>{f.money(T.stockValue)}</td>
            </>
          }
        />
      </div>
    </Card>
  );
}
