import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  ArrowRight,
  EyeOff,
  HandCoins,
  LayoutGrid,
  RotateCcw,
  Rows3,
  Tag,
} from '@/components/icons';
import type { ProductProfitMoney, ProductProfitResponse, ProductProfitRow } from '@savdoiq/shared';
import {
  Amount,
  Badge,
  Card,
  DataTable,
  Drawer,
  EmptyState,
  ErrorState,
  HeroCard,
  PageHeader,
  PlanGate,
  PreviewBadge,
  ProductCell,
  ProductThumb,
  SearchInput,
  Segmented,
  Skeleton,
  type Column,
} from '@/components/ui';
import { FilterBar } from '@/components/filters';
import { PeriodChip } from '@/components/finance/PeriodChip';
import { CostCoverage } from '@/components/trust/CostCoverage';
import { DataFreshness } from '@/components/trust/DataFreshness';
import { SplitStrip } from '@/components/unit/CostSplitBar';
import { useCountUp } from '@/hooks/useCountUp';
import { api } from '@/lib/api';
import { COST_COLORS } from '@/lib/theme';
import { usePeriodQuery } from '@/store/ui';
import { registerNamespace, useFormat, useT, type TFunc } from '@/i18n';
import { cn } from '@/lib/utils';

registerNamespace('productProfit', {
  uz: {
    title: 'Mahsulot foydasi',
    subtitle: 'Har bir mahsulot qancha pul qoldirdi — bir donadan va jami',
    search: 'Mahsulot nomi bo‘yicha qidirish',
    'sort.profit': 'Sof foyda',
    'sort.perUnit': '1 donadan',
    'sort.revenue': 'Tushum',
    'sort.margin': 'Marja',
    'view.table': 'Jadval',
    'view.cards': 'Kartalar',
    'kpi.revenue': 'Tushum',
    'kpi.revenueHint': '{units} dona, {orders} buyurtma',
    'kpi.payout': 'Chiqarishga',
    'kpi.payoutHint': 'Uzum komissiya va yetkazishni ushlab, sizga to‘laydigani',
    'kpi.cogs': 'Tannarx',
    'kpi.cogsHint': 'Sotilgan tovarlarning sotib olish narxi',
    'kpi.profit': 'Sof foyda',
    'kpi.profitHint': 'Tannarx, soliq va reklamadan keyin · marja {m}',
    'hero.title': 'Mahsulotlar sof foydasi',
    'hero.loss': 'Mahsulotlar zarari',
    'hero.sub': 'Tannarx, soliq va reklamadan keyin',
    'hero.margin': 'Marja {v}',
    'hero.roi': 'ROI {v}',
    'hero.perUnit': '1 donadan {v}',
    'hero.split': 'Tushum qayerga ketdi',
    'hero.store': 'Do‘kon sof foydasi',
    'hero.storeHint': 'Mahsulotga bog‘lanmagan xarajatlar −{v} ayirilgan',
    'hero.units': 'Sotildi',
    'hero.unitsHint': '{orders} buyurtma · {products} mahsulot',
    'recon.text':
      'Mahsulotlar sof foydasi {products}. Mahsulotga bog‘lab bo‘lmaydigan xarajatlar (omborga logistika, umumiy reklama, saqlash) {other} ayirilsa — do‘kon sof foydasi {store}, Boshqaruv panelidagi bilan bir xil.',
    'card.meta': '{units} dona · {orders} buyurtma',
    'card.skus': '{n} SKU',
    'card.hidden': 'Katalogdan yashirilgan',
    'card.net': 'Sof foyda',
    'card.perUnit': '1 donadan {v}',
    'card.loss': 'Zarar',
    'card.margin': 'Marja {v}',
    'card.roi': 'ROI {v}',
    'card.colUnit': '1 dona',
    'card.colTotal': 'Jami',
    'row.revenue': 'Tushum',
    'row.commission': 'Komissiya',
    'row.logistics': 'Yetkazish',
    'row.payout': 'Chiqarishga',
    'row.payoutHint': 'Uzum sizga to‘laydi',
    'row.cogs': 'Tannarx',
    'row.otherCost': 'Qadoq va boshqa',
    'row.tax': 'Soliq',
    'row.ads': 'Reklama',
    'row.netProfit': 'Sof foyda',
    'card.noCost': 'Tannarx kiritilmagan — foyda haqiqiydan katta ko‘rinadi',
    'card.setCost': 'Tannarx kiritish',
    'card.more': 'Batafsil',
    'card.returns': '{n} ta qaytgan',
    'tag.noCost': 'Tannarxsiz',
    'tag.returnsTitle': 'Qaytish ulushi {v} — do‘kon o‘rtachasi {avg}',
    'col.product': 'Mahsulot',
    'col.units': 'Sotildi',
    'col.orders': '{n} buyurtma',
    'col.revenue': 'Tushum',
    'col.split': 'Tushum taqsimoti',
    'col.profit': 'Sof foyda',
    'col.margin': 'Marja',
    'col.roi': 'ROI',
    'total.label': 'Jami · {n} mahsulot',
    'empty.title': 'Bu davrda sotuv yo‘q',
    'empty.hint': 'Yuqoridagi davrni kengroq tanlang — masalan «Shu yil».',
    'empty.search': 'Qidiruv bo‘yicha mahsulot topilmadi',
    'note.money': 'Summalar so‘mda. Bekor qilingan va qaytarilgan sotuvlar kirmaydi.',
    'note.table': 'Qatorni bosing — tushumdan sof foydagacha to‘liq hisob ochiladi.',
  },
  ru: {
    title: 'Прибыль по товарам',
    subtitle: 'Сколько денег оставил каждый товар — с одной штуки и всего',
    search: 'Поиск по названию товара',
    'sort.profit': 'Чистая прибыль',
    'sort.perUnit': 'С 1 шт.',
    'sort.revenue': 'Выручка',
    'sort.margin': 'Маржа',
    'view.table': 'Таблица',
    'view.cards': 'Карточки',
    'kpi.revenue': 'Выручка',
    'kpi.revenueHint': '{units} шт., {orders} заказов',
    'kpi.payout': 'К выводу',
    'kpi.payoutHint': 'Что Uzum платит вам после комиссии и доставки',
    'kpi.cogs': 'Себестоимость',
    'kpi.cogsHint': 'Закупочная цена проданных товаров',
    'kpi.profit': 'Чистая прибыль',
    'kpi.profitHint': 'После себестоимости, налога и рекламы · маржа {m}',
    'hero.title': 'Чистая прибыль товаров',
    'hero.loss': 'Убыток по товарам',
    'hero.sub': 'После себестоимости, налога и рекламы',
    'hero.margin': 'Маржа {v}',
    'hero.roi': 'ROI {v}',
    'hero.perUnit': 'С 1 шт. {v}',
    'hero.split': 'Куда ушла выручка',
    'hero.store': 'Чистая прибыль магазина',
    'hero.storeHint': 'За вычетом расходов, не привязанных к товару: −{v}',
    'hero.units': 'Продано',
    'hero.unitsHint': '{orders} заказов · {products} товаров',
    'recon.text':
      'Чистая прибыль товаров {products}. За вычетом расходов, не привязанных к товару (логистика на склад, общая реклама, хранение) {other}, прибыль магазина — {store}, как на главной панели.',
    'card.meta': '{units} шт. · {orders} заказов',
    'card.skus': '{n} SKU',
    'card.hidden': 'Скрыт из каталога',
    'card.net': 'Чистая прибыль',
    'card.perUnit': 'С 1 шт. {v}',
    'card.loss': 'Убыток',
    'card.margin': 'Маржа {v}',
    'card.roi': 'ROI {v}',
    'card.colUnit': '1 шт.',
    'card.colTotal': 'Всего',
    'row.revenue': 'Выручка',
    'row.commission': 'Комиссия',
    'row.logistics': 'Доставка',
    'row.payout': 'К выводу',
    'row.payoutHint': 'Uzum платит вам',
    'row.cogs': 'Себестоимость',
    'row.otherCost': 'Упаковка и пр.',
    'row.tax': 'Налог',
    'row.ads': 'Реклама',
    'row.netProfit': 'Чистая прибыль',
    'card.noCost': 'Себестоимость не указана — прибыль выглядит больше реальной',
    'card.setCost': 'Указать себестоимость',
    'card.more': 'Подробнее',
    'card.returns': 'Возвратов: {n}',
    'tag.noCost': 'Без себестоимости',
    'tag.returnsTitle': 'Доля возвратов {v} — в среднем по магазину {avg}',
    'col.product': 'Товар',
    'col.units': 'Продано',
    'col.orders': '{n} заказов',
    'col.revenue': 'Выручка',
    'col.split': 'Структура выручки',
    'col.profit': 'Чистая прибыль',
    'col.margin': 'Маржа',
    'col.roi': 'ROI',
    'total.label': 'Итого · {n} товаров',
    'empty.title': 'За этот период продаж нет',
    'empty.hint': 'Выберите период шире — например «Этот год».',
    'empty.search': 'По запросу товары не найдены',
    'note.money': 'Суммы в сумах. Отменённые и возвращённые продажи не учитываются.',
    'note.table': 'Нажмите на строку — откроется полный расчёт от выручки до чистой прибыли.',
  },
  en: {
    title: 'Profit by product',
    subtitle: 'How much money each product left you — per unit and in total',
    search: 'Search by product name',
    'sort.profit': 'Net profit',
    'sort.perUnit': 'Per unit',
    'sort.revenue': 'Revenue',
    'sort.margin': 'Margin',
    'view.table': 'Table',
    'view.cards': 'Cards',
    'kpi.revenue': 'Revenue',
    'kpi.revenueHint': '{units} units, {orders} orders',
    'kpi.payout': 'To withdraw',
    'kpi.payoutHint': 'What Uzum pays you after commission and delivery',
    'kpi.cogs': 'Cost of goods',
    'kpi.cogsHint': 'Purchase price of the goods sold',
    'kpi.profit': 'Net profit',
    'kpi.profitHint': 'After cost, tax and ads · margin {m}',
    'hero.title': 'Net profit of products',
    'hero.loss': 'Loss on products',
    'hero.sub': 'After cost of goods, tax and ads',
    'hero.margin': 'Margin {v}',
    'hero.roi': 'ROI {v}',
    'hero.perUnit': '{v} per unit',
    'hero.split': 'Where revenue went',
    'hero.store': 'Store net profit',
    'hero.storeHint': 'Less costs not tied to a product: −{v}',
    'hero.units': 'Sold',
    'hero.unitsHint': '{orders} orders · {products} products',
    'recon.text':
      'Net profit of products is {products}. Less costs not tied to a product (inbound logistics, general ads, storage) of {other}, the store net profit is {store} — the same as on the dashboard.',
    'card.meta': '{units} units · {orders} orders',
    'card.skus': '{n} SKUs',
    'card.hidden': 'Hidden from catalogue',
    'card.net': 'Net profit',
    'card.perUnit': '{v} per unit',
    'card.loss': 'Loss',
    'card.margin': 'Margin {v}',
    'card.roi': 'ROI {v}',
    'card.colUnit': 'Per unit',
    'card.colTotal': 'Total',
    'row.revenue': 'Revenue',
    'row.commission': 'Commission',
    'row.logistics': 'Delivery',
    'row.payout': 'To withdraw',
    'row.payoutHint': 'Uzum pays you',
    'row.cogs': 'Cost of goods',
    'row.otherCost': 'Packaging etc.',
    'row.tax': 'Tax',
    'row.ads': 'Ads',
    'row.netProfit': 'Net profit',
    'card.noCost': 'No cost price — profit looks higher than it is',
    'card.setCost': 'Set cost price',
    'card.more': 'Details',
    'card.returns': '{n} returned',
    'tag.noCost': 'No cost price',
    'tag.returnsTitle': 'Return rate {v} — store average {avg}',
    'col.product': 'Product',
    'col.units': 'Sold',
    'col.orders': '{n} orders',
    'col.revenue': 'Revenue',
    'col.split': 'Revenue split',
    'col.profit': 'Net profit',
    'col.margin': 'Margin',
    'col.roi': 'ROI',
    'total.label': 'Total · {n} products',
    'empty.title': 'No sales in this period',
    'empty.hint': 'Pick a wider period above — for example “This year”.',
    'empty.search': 'No products match the search',
    'note.money': 'Amounts in UZS. Cancelled and returned sales are excluded.',
    'note.table': 'Click a row to open the full breakdown from revenue to net profit.',
  },
});

type SortKey = 'profit' | 'perUnit' | 'revenue' | 'margin';
type ViewMode = 'table' | 'cards';

const SORTERS: Record<SortKey, (r: ProductProfitRow) => number> = {
  profit: (r) => r.netProfit,
  perUnit: (r) => r.perUnit.netProfit,
  revenue: (r) => r.revenue,
  margin: (r) => r.margin,
};

/**
 * Jadval standart ko'rinish bo'ladigan chegara. 16 mahsulot kartochkada
 * 5 000 px'lik sahifa edi (2026-10-24) — taqqoslash uchun pastga
 * aylantirib, raqamlarni yodda saqlashga to'g'ri kelardi.
 */
const TABLE_FROM = 12;

/**
 * Bir mahsulot sahifasi qatorlari: tushumdan sof foydagacha zanjir.
 * `kind`: ayiriladigan xarajat (−), oraliq natija (=) yoki boshlang'ich summa.
 * `always` — nol bo'lsa ham ko'rinadigan asosiy qatorlar.
 * Ranglar COST_COLORS'dan — yuqoridagi "Tushum qayerga ketdi" chizig'i,
 * Moliya va Unit-iqtisod sahifalari bilan bir xil.
 */
const ROWS: {
  key: keyof ProductProfitMoney;
  kind: 'start' | 'minus' | 'subtotal' | 'result';
  color?: string;
  always?: boolean;
}[] = [
  { key: 'revenue', kind: 'start', always: true },
  { key: 'commission', kind: 'minus', color: COST_COLORS.commission, always: true },
  { key: 'logistics', kind: 'minus', color: COST_COLORS.logistics, always: true },
  { key: 'payout', kind: 'subtotal', always: true },
  { key: 'cogs', kind: 'minus', color: COST_COLORS.cogs, always: true },
  { key: 'otherCost', kind: 'minus', color: COST_COLORS.other },
  { key: 'tax', kind: 'minus', color: COST_COLORS.tax },
  { key: 'ads', kind: 'minus', color: COST_COLORS.marketing },
  { key: 'netProfit', kind: 'result', always: true },
];

/**
 * Tushum bo'laklari — zanjir tartibida (Uzum ushlagani → o'z xarajatlaringiz
 * → sof foyda). Zarar bo'lsa foyda bo'lagi chiziqqa kirmaydi.
 */
function splitParts(m: ProductProfitMoney, t: TFunc) {
  return [
    ...ROWS.filter((r) => r.kind === 'minus').map((r) => ({
      key: r.key,
      label: t(`row.${r.key}`),
      value: m[r.key],
      color: r.color ?? COST_COLORS.other,
    })),
    { key: 'netProfit', label: t('row.netProfit'), value: Math.max(0, m.netProfit), color: COST_COLORS.profit },
  ];
}

export default function ProductProfit() {
  const t = useT('productProfit');
  const periodQuery = usePeriodQuery();
  const [params, setParams] = useSearchParams();
  const [sort, setSort] = useState<SortKey>('profit');
  const [search, setSearch] = useState('');
  const [active, setActive] = useState<ProductProfitRow | null>(null);
  /*
   * Ko'rinish manzilda (?view=cards) — havola ulashilsa yoki sahifa
   * yangilansa tanlov saqlanadi. Tanlanmaguncha mahsulotlar soniga qarab.
   */
  const urlView = params.get('view');
  const picked: ViewMode | null = urlView === 'table' || urlView === 'cards' ? urlView : null;
  const setPicked = (v: ViewMode) => {
    const next = new URLSearchParams(params);
    next.set('view', v);
    setParams(next, { replace: true });
  };

  const query = useQuery({
    queryKey: ['product-profit', periodQuery],
    queryFn: () => api.get<ProductProfitResponse>('/products/profit', periodQuery),
    placeholderData: (prev) => prev,
  });

  const data = query.data;
  const rows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const list = (data?.rows ?? []).filter(
      (r) => !needle || r.title.toLowerCase().includes(needle) || (r.category ?? '').toLowerCase().includes(needle),
    );
    const by = SORTERS[sort];
    return [...list].sort((a, b) => by(b) - by(a));
  }, [data, search, sort]);

  // Qidiruvda qator kamayganda ko'rinish sakramasin — chegara umumiy son bo'yicha
  const view: ViewMode = picked ?? ((data?.rows.length ?? 0) > TABLE_FROM ? 'table' : 'cards');

  // Do'kon bo'yicha o'rtacha qaytish ulushi — mahsulotning qaytishlari shunga solishtiriladi
  const avgReturn = useMemo(() => {
    let returns = 0;
    let base = 0;
    (data?.rows ?? []).forEach((r) => {
      returns += r.returns;
      base += r.units + r.returns;
    });
    return base > 0 ? returns / base : 0;
  }, [data]);

  return (
    <>
      <PageHeader
        icon={<HandCoins className="h-5 w-5" />}
        title={t('title')}
        description={t('subtitle')}
        meta={
          <>
            <PeriodChip />
            <DataFreshness />
            <CostCoverage />
          </>
        }
        badge={<PreviewBadge feature="unit_economics" />}
      />

      <FilterBar>
        <SearchInput value={search} onChange={setSearch} placeholder={t('search')} className="w-full sm:w-72" />
        <Segmented<SortKey>
          size="sm"
          value={sort}
          onChange={setSort}
          options={(['profit', 'perUnit', 'revenue', 'margin'] as const).map((k) => ({ value: k, label: t(`sort.${k}`) }))}
        />
        <Segmented<ViewMode>
          size="sm"
          className="sm:ml-auto"
          value={view}
          onChange={setPicked}
          options={[
            {
              value: 'table',
              label: (
                <span className="inline-flex items-center gap-1.5">
                  <Rows3 className="h-3.5 w-3.5" />
                  {t('view.table')}
                </span>
              ),
            },
            {
              value: 'cards',
              label: (
                <span className="inline-flex items-center gap-1.5">
                  <LayoutGrid className="h-3.5 w-3.5" />
                  {t('view.cards')}
                </span>
              ),
            },
          ]}
        />
      </FilterBar>

      <PlanGate feature="unit_economics">
        {query.isError ? (
          <Card>
            <ErrorState
              message={query.error instanceof Error ? query.error.message : undefined}
              onRetry={() => void query.refetch()}
              retryLabel={t('btn.retry')}
            />
          </Card>
        ) : (
          <div className="space-y-5">
            <SummaryHero data={data} loading={query.isLoading} />

            {query.isLoading ? (
              <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-[480px] w-full rounded-2xl" />
                ))}
              </div>
            ) : rows.length === 0 ? (
              <Card>
                <EmptyState
                  icon={<HandCoins className="h-6 w-6" />}
                  title={search.trim() ? t('empty.search') : t('empty.title')}
                  hint={search.trim() ? undefined : t('empty.hint')}
                />
              </Card>
            ) : view === 'table' ? (
              <>
                <ProfitTable rows={rows} avgReturn={avgReturn} onOpen={setActive} />
                <p className="text-2xs text-muted">
                  {t('note.table')} {t('note.money')}
                </p>
              </>
            ) : (
              <>
                <div className="grid items-start gap-4 lg:grid-cols-2 2xl:grid-cols-3">
                  {rows.map((r) => (
                    <ProfitCard key={r.productId} row={r} avgReturn={avgReturn} />
                  ))}
                </div>
                <p className="text-2xs text-muted">{t('note.money')}</p>
              </>
            )}
          </div>
        )}
      </PlanGate>

      {/* Jadvaldagi qator bosilganda — o'sha mahsulotning to'liq hisobi (kartochkaning o'zi) */}
      <Drawer open={Boolean(active)} onClose={() => setActive(null)} title={active?.title}>
        {active ? <ProfitCard row={active} avgReturn={avgReturn} embedded /> : null}
      </Drawer>
    </>
  );
}

/**
 * Sahifaning yagona HeroCard'i: mahsulotlar sof foydasi va tushum qayerga
 * ketgani. Ilgari bu yerda to'rtta bir xil KPI kartochkasi va ostida
 * kulrang izoh paragrafi turardi (do'kon foydasi bilan farq) — endi o'sha
 * farq ham alohida plitkada, raqami bilan.
 */
function SummaryHero({ data, loading }: { data?: ProductProfitResponse; loading: boolean }) {
  const t = useT('productProfit');
  const f = useFormat();
  const totals = data?.totals;
  const profit = totals?.netProfit ?? 0;
  const loss = profit < 0;
  const shown = useCountUp(profit);
  const revenue = totals?.revenue ?? 0;
  const units = totals?.units ?? 0;
  const parts = totals ? splitParts(totals, t).filter((p) => p.value > 0) : [];
  // Server `pct` kabi ikki xonagacha — Moliya sahifasidagi ulushlar bilan bir xil son chiqsin
  const share = (v: number) => (revenue > 0 ? Math.round((v / revenue) * 10_000) / 100 : 0);
  const unallocated = data?.unallocated ?? 0;

  if (loading || !totals || !data) {
    return (
      <HeroCard className="p-5 sm:p-6">
        <div className="grid gap-6 lg:grid-cols-2">
          <div>
            <Skeleton className="h-5 w-48" />
            <Skeleton className="mt-4 h-10 w-72 max-w-full" />
            <div className="mt-6 grid grid-cols-2 gap-2.5">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          </div>
          <Skeleton className="h-56 w-full" />
        </div>
      </HeroCard>
    );
  }

  return (
    <HeroCard tone={loss ? 'danger' : 'brand'} className="p-5 sm:p-6">
      {/*
        Tepada ikki ustun (javob | tushum taqsimoti), ostida to'rt plitka
        butun kenglikda — ikkala ustun bir xil balandlikda turadi.
      */}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:gap-8">
        <div className="flex min-w-0 flex-col">
          <div className="flex min-w-0 items-center gap-3">
            <span className="icon-tile h-10 w-10 rounded-xl [&_svg]:h-5 [&_svg]:w-5" aria-hidden>
              <HandCoins />
            </span>
            <div className="min-w-0">
              <p className="font-display text-[15px] font-semibold leading-5 text-ink">
                {loss ? t('hero.loss') : t('hero.title')}
              </p>
              <p className="truncate text-xs text-muted">{t('hero.sub')}</p>
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
            <Badge tone={totals.margin < 0 ? 'danger' : 'brand'}>
              <span className="tnum">{t('hero.margin', { v: f.pct(totals.margin) })}</span>
            </Badge>
            <Badge tone="muted">
              <span className="tnum">
                {t('hero.roi', { v: totals.cogs + totals.otherCost > 0 ? f.pct(totals.roi, 0) : '—' })}
              </span>
            </Badge>
            {units > 0 ? (
              <Badge tone="muted">
                <span className="tnum">{t('hero.perUnit', { v: f.money(profit / units) })}</span>
              </Badge>
            ) : null}
          </div>
        </div>

        {/* Tushum qayerga ketdi — har bir modda tushumga nisbatan, ranglar jadval va kartochkalardagi bilan bir xil */}
        <div className="min-w-0 lg:border-l lg:border-line/70 lg:pl-8">
          <div className="flex items-baseline justify-between gap-3">
            <p className="eyebrow">{t('hero.split')}</p>
            <p className="tnum text-xs text-muted">{f.money(revenue)}</p>
          </div>
          <SplitStrip parts={parts} className="mt-3 h-3" />
          <ul className="mt-3.5 grid gap-x-6 gap-y-1.5 sm:grid-cols-2 lg:grid-cols-1">
            {parts.map((p) => (
              <li key={p.key} className="flex items-center gap-2.5 text-sm">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: p.color }} />
                <span
                  className={cn(
                    'min-w-0 flex-1 truncate',
                    p.key === 'netProfit' ? 'font-semibold text-ink' : 'text-ink-soft',
                  )}
                >
                  {p.label}
                </span>
                <span
                  className={cn(
                    'tnum shrink-0 whitespace-nowrap font-semibold',
                    p.key === 'netProfit' ? 'text-brand-ink' : 'text-ink',
                  )}
                >
                  {f.money(p.value)}
                </span>
                <span className="tnum w-12 shrink-0 text-right text-xs text-muted">{f.pct(share(p.value))}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-2.5 xl:grid-cols-4">
        <HeroWell
          label={t('kpi.revenue')}
          value={f.money(revenue)}
          hint={t('kpi.revenueHint', { units: f.num(units), orders: f.num(totals.orders) })}
        />
        <HeroWell label={t('kpi.payout')} value={f.money(totals.payout)} hint={t('row.payoutHint')} />
        <HeroWell label={t('kpi.cogs')} value={f.money(totals.cogs)} hint={t('kpi.cogsHint')} />
        {/*
          Nega bu yig'indi Boshqaruv panelidagi sof foydadan farq qiladi — raqam
          bilan: farq aynan mahsulotga bog'lanmaydigan xarajatlar. To'liq
          izoh sichqoncha olib borilganda.
        */}
        {unallocated > 0 && data.rows.length > 0 ? (
          <HeroWell
            label={t('hero.store')}
            value={f.money(profit - unallocated)}
            hint={t('hero.storeHint', { v: f.compact(unallocated) })}
            title={t('recon.text', {
              products: f.money(profit),
              other: f.money(unallocated),
              store: f.money(profit - unallocated),
            })}
            danger={profit - unallocated < 0}
          />
        ) : (
          <HeroWell
            label={t('hero.units')}
            value={f.num(units)}
            hint={t('hero.unitsHint', { orders: f.num(totals.orders), products: f.num(totals.products) })}
          />
        )}
      </div>
    </HeroCard>
  );
}

function HeroWell({
  label,
  value,
  hint,
  title,
  danger,
}: {
  label: string;
  value: string;
  hint: string;
  title?: string;
  danger?: boolean;
}) {
  return (
    <div className="well min-w-0 p-3" title={title}>
      <p className="eyebrow truncate">{label}</p>
      <p className={cn('tnum mt-1 truncate font-display text-base font-bold leading-6', danger ? 'text-danger' : 'text-ink')}>
        <Amount value={value} />
      </p>
      <p className="mt-0.5 line-clamp-2 text-2xs leading-snug text-muted">{hint}</p>
    </div>
  );
}

/** Mahsulotning qaytish ulushi: qaytgan / (sotilgan + qaytgan) */
function returnRate(r: { units: number; returns: number }): number {
  const base = r.units + r.returns;
  return base > 0 ? r.returns / base : 0;
}

/**
 * Mahsulotning "muammo" belgilari — o'qiladigan plastinkalarda. Ilgari
 * qaytgan donalar xira matn bilan meta qatorga qo'shilib ketardi, tannarx
 * yo'qligi esa faqat kartochka pastida ko'rinardi.
 *
 * Qaytishlar za'faron rangda faqat do'kon o'rtachasidan 1,5 baravar yuqori
 * bo'lsa (va kamida 3 dona). Demo do'konda 16 mahsulotning 15 tasida qaytish
 * bor — hammasi bir xil ogohlantiruvchi rangda tursa, haqiqiy muammoli 3 ta
 * mahsulot ajralmay qolardi. Qolganlari tinch kulrang plastinkada.
 */
function ProblemTags({
  row,
  avgReturn,
  className,
}: {
  row: ProductProfitRow;
  /** Do'kon bo'yicha o'rtacha qaytish ulushi (0..1) */
  avgReturn: number;
  className?: string;
}) {
  const t = useT('productProfit');
  const f = useFormat();
  const noCost = row.units > 0 && row.cogs <= 0;
  if (!noCost && row.returns <= 0 && !row.hidden) return null;
  const rate = returnRate(row);
  const highReturns = row.returns >= 3 && avgReturn > 0 && rate >= avgReturn * 1.5;
  return (
    <span className={cn('flex flex-wrap items-center gap-1.5', className)}>
      {noCost ? (
        <Badge tone="warn" className="px-2 py-0.5" title={t('card.noCost')}>
          <Tag className="h-3 w-3" />
          {t('tag.noCost')}
        </Badge>
      ) : null}
      {row.returns > 0 ? (
        <Badge
          tone={highReturns ? 'warn' : 'muted'}
          className="px-2 py-0.5"
          title={t('tag.returnsTitle', { v: f.pct(rate * 100), avg: f.pct(avgReturn * 100) })}
        >
          <RotateCcw className="h-3 w-3" />
          <span className="tnum">{t('card.returns', { n: f.num(row.returns) })}</span>
        </Badge>
      ) : null}
      {/* Yashirilgan bo'lsa ham puli hisobda — sotuvchi qaysi biri ekanini bilsin */}
      {row.hidden ? (
        <Badge tone="muted" className="px-2 py-0.5">
          <EyeOff className="h-3 w-3" />
          {t('card.hidden')}
        </Badge>
      ) : null}
    </span>
  );
}

/**
 * Jadval ko'rinishi — mahsulotlarni yonma-yon solishtirish uchun. Ustunlar
 * 1366 px'da sig'adi: xarajat moddalari alohida ustun emas, bitta rangli
 * "Tushum taqsimoti" chizig'ida; to'liq hisob qator bosilganda ochiladi.
 */
function ProfitTable({
  rows,
  avgReturn,
  onOpen,
}: {
  rows: ProductProfitRow[];
  avgReturn: number;
  onOpen: (r: ProductProfitRow) => void;
}) {
  const t = useT('productProfit');
  const f = useFormat();

  const columns: Column<ProductProfitRow>[] = useMemo(
    () => [
      {
        key: 'title',
        header: t('col.product'),
        sortable: true,
        sortValue: (r) => r.title,
        render: (r) => (
          // max-w: uzun nom ustunni kengaytirib, o'ngdagi raqamlarni (ROI) ekrandan surib chiqarmasin
          <div className="max-w-[15rem] 2xl:max-w-[20rem]">
            <ProductCell
              title={r.title}
              imageUrl={r.imageUrl}
              size={40}
              subtitle={[r.category, t('card.skus', { n: r.skuCount })].filter(Boolean).join(' · ')}
            />
            <ProblemTags row={r} avgReturn={avgReturn} className="mt-1.5 pl-[52px]" />
          </div>
        ),
      },
      {
        key: 'units',
        header: t('col.units'),
        align: 'right',
        sortable: true,
        sortValue: (r) => r.units,
        render: (r) => (
          <div className="leading-tight">
            <p className="tnum text-sm text-ink">{f.num(r.units)}</p>
            <p className="tnum text-2xs text-muted">{t('col.orders', { n: f.num(r.orders) })}</p>
          </div>
        ),
      },
      {
        key: 'revenue',
        header: t('col.revenue'),
        align: 'right',
        sortable: true,
        sortValue: (r) => r.revenue,
        render: (r) => <span className="tnum text-ink">{f.money(r.revenue)}</span>,
      },
      {
        key: 'split',
        header: t('col.split'),
        hideOnMobile: true,
        render: (r) => <SplitStrip parts={splitParts(r, t)} className="w-24 2xl:w-36" />,
      },
      {
        key: 'netProfit',
        header: t('col.profit'),
        align: 'right',
        sortable: true,
        sortValue: (r) => r.netProfit,
        render: (r) => (
          <div className="leading-tight">
            <p className={cn('tnum font-display text-sm font-bold', r.netProfit < 0 ? 'text-danger' : 'text-brand-ink')}>
              {f.money(r.netProfit)}
            </p>
            {r.units > 0 ? (
              <p className="tnum text-2xs text-muted">{t('card.perUnit', { v: f.money(r.perUnit.netProfit) })}</p>
            ) : null}
          </div>
        ),
      },
      {
        key: 'margin',
        header: t('col.margin'),
        align: 'right',
        sortable: true,
        sortValue: (r) => r.margin,
        render: (r) => (
          <Badge tone={r.margin < 0 ? 'danger' : 'brand'} className="px-2 py-0.5">
            <span className="tnum">{f.pct(r.margin)}</span>
          </Badge>
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
          <span className={cn('tnum', r.roi < 0 ? 'text-danger' : 'text-ink-soft')}>
            {/* Tannarx kiritilmagan bo'lsa ROI'ni hisoblab bo'lmaydi — 0% emas, chiziqcha */}
            {r.cogs + r.otherCost > 0 ? f.pct(r.roi, 0) : '—'}
          </span>
        ),
      },
    ],
    [t, f, avgReturn],
  );

  // Jami qatori — ko'rinib turgan (qidiruvdan o'tgan) mahsulotlar bo'yicha
  const sum = useMemo(() => {
    const s = { units: 0, orders: 0, revenue: 0, netProfit: 0 };
    rows.forEach((r) => {
      s.units += r.units;
      s.orders += r.orders;
      s.revenue += r.revenue;
      s.netProfit += r.netProfit;
    });
    return s;
  }, [rows]);
  const cell = 'px-4 py-2.5 md:px-5';
  /*
   * Telefonda jami qatori bitta qatorga sig'ishi uchun faqat nom va sof
   * foyda qoladi — qolganlari (dona, tushum, marja) 375 px'da qatorni
   * 620 px'ga cho'zib, yon tomonga surilardi.
   */
  const wideOnly = 'hidden md:table-cell';

  return (
    <Card className="overflow-hidden">
      <DataTable<ProductProfitRow>
        columns={columns}
        rows={rows}
        rowKey={(r) => r.productId}
        density="compact"
        localSort
        onRowClick={onOpen}
        footer={
          <>
            <td className={cell}>{t('total.label', { n: f.num(rows.length) })}</td>
            <td className={cn(cell, wideOnly, 'tnum whitespace-nowrap text-right')}>{f.num(sum.units)}</td>
            <td className={cn(cell, wideOnly, 'tnum whitespace-nowrap text-right')}>{f.money(sum.revenue)}</td>
            <td className={cn(cell, wideOnly)} />
            <td
              className={cn(
                cell,
                'tnum whitespace-nowrap text-right font-display font-bold',
                sum.netProfit < 0 ? 'text-danger' : 'text-brand-ink',
              )}
            >
              {f.money(sum.netProfit)}
            </td>
            <td className={cn(cell, wideOnly, 'tnum whitespace-nowrap text-right')}>
              {sum.revenue > 0 ? f.pct((sum.netProfit / sum.revenue) * 100) : '—'}
            </td>
            <td className={cn(cell, wideOnly)} />
          </>
        }
      />
    </Card>
  );
}

/** Bitta mahsulot: sof foyda yirik, ostida tushumdan foydagacha zanjir — 1 dona va jami */
export function ProfitCard({
  row,
  avgReturn,
  embedded,
}: {
  row: ProductProfitRow;
  /** Do'kon o'rtacha qaytish ulushi — qaytishlar belgisining rangi uchun */
  avgReturn: number;
  /** Yon panel ichida: kartochka chegarasi va ichki chekinishsiz */
  embedded?: boolean;
}) {
  const t = useT('productProfit');
  const f = useFormat();
  const loss = row.netProfit < 0;
  const noCost = row.units > 0 && row.cogs <= 0;
  // Ichki chekinish: kartochkada o'zi, yon paneldagida panelning o'z chekinishi bor
  const pad = embedded ? 'px-0' : 'px-4 sm:px-5';

  return (
    <div
      className={cn(
        'flex flex-col',
        !embedded && 'card card-hover overflow-hidden',
        !embedded && loss && 'border-danger/40',
      )}
    >
      {/* Sarlavha */}
      <div className={cn('flex items-start gap-3 pb-3', embedded ? 'pt-0' : 'pt-4 sm:pt-5', pad)}>
        <div className="h-14 w-14 shrink-0 overflow-hidden rounded-xl border border-line bg-surface-2">
          <ProductThumb name={row.title} imageUrl={row.imageUrl} style={{ fontSize: 18 }} />
        </div>
        <div className="min-w-0 flex-1">
          <Link
            to={`/products/${row.productId}`}
            className="line-clamp-2 text-sm font-semibold leading-snug text-ink hover:text-brand-ink"
            title={row.title}
          >
            {row.title}
          </Link>
          <p className="mt-0.5 truncate text-xs text-muted">
            {[row.category, t('card.skus', { n: row.skuCount })].filter(Boolean).join(' · ')}
          </p>
          <p className="tnum mt-0.5 text-xs text-ink-soft">
            {t('card.meta', { units: f.num(row.units), orders: f.num(row.orders) })}
          </p>
          <ProblemTags row={row} avgReturn={avgReturn} className="mt-1.5" />
        </div>
      </div>

      {/*
        Asosiy javob: qancha foyda qoldi. Tinch `.well` plitkada — ilgari har
        kartochkada yashil fonli blok turardi va 16 ta "porlayotgan" quti
        sahifaning bosh kartochkasini ajratmay qo'yardi.
      */}
      <div className={cn('well px-4 py-3', embedded ? 'mx-0' : 'mx-4 sm:mx-5', loss && 'border-danger/30 bg-danger/5')}>
        <div className="flex items-center justify-between gap-3">
          <p className="eyebrow">{loss ? t('card.loss') : t('card.net')}</p>
          <span className="flex flex-wrap items-center justify-end gap-1">
            <Badge tone={row.margin < 0 ? 'danger' : 'brand'} className="px-2 py-0.5">
              <span className="tnum">{t('card.margin', { v: f.pct(row.margin) })}</span>
            </Badge>
            <Badge tone="muted" className="px-2 py-0.5">
              {/* Tannarx kiritilmagan bo'lsa ROI'ni hisoblab bo'lmaydi — 0% emas, chiziqcha */}
              <span className="tnum">{t('card.roi', { v: row.cogs + row.otherCost > 0 ? f.pct(row.roi, 0) : '—' })}</span>
            </Badge>
          </span>
        </div>
        <p
          className={cn(
            'tnum mt-1.5 font-display text-[24px] font-bold leading-tight tracking-[-0.02em]',
            loss ? 'text-danger' : 'text-brand-ink',
          )}
        >
          <Amount value={f.money(row.netProfit)} />
        </p>
        {row.units > 0 ? (
          <p className={cn('tnum mt-0.5 text-sm font-semibold', loss ? 'text-danger' : 'text-ink')}>
            {t('card.perUnit', { v: f.money(row.perUnit.netProfit) })}
          </p>
        ) : null}
      </div>

      {/* Zanjir: tushum → chiqarishga → sof foyda */}
      <div className={cn('pb-1 pt-3', pad)}>
        <div className="grid grid-cols-[minmax(0,1fr)_5.5rem_6.75rem] gap-x-2 pb-1.5 text-2xs font-semibold text-muted">
          <span />
          <span className="text-right">{t('card.colUnit')}</span>
          <span className="text-right">{t('card.colTotal')}</span>
        </div>
        <ul>
          {ROWS.filter((r) => r.always || row[r.key] !== 0).map((r) => {
            const total = row[r.key];
            const unit = row.perUnit[r.key];
            // Xarajat qatorlari minus bilan; natija qatorlari manfiy bo'lsagina
            const signOf = (v: number) => (r.kind === 'minus' ? '−' : v < 0 ? '−' : '');
            const strong = r.kind === 'subtotal' || r.kind === 'result';
            return (
              <li
                key={r.key}
                className={cn(
                  'grid grid-cols-[minmax(0,1fr)_5.5rem_6.75rem] items-center gap-x-2 py-1.5 text-sm',
                  r.kind === 'subtotal' && 'mt-1 border-t border-line pt-2',
                  r.kind === 'result' && 'mt-1 border-t border-line pt-2',
                )}
                title={r.key === 'payout' ? t('row.payoutHint') : undefined}
              >
                <span className={cn('flex min-w-0 items-center gap-2', strong ? 'font-semibold text-ink' : 'text-ink-soft')}>
                  {r.color ? (
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: r.color }} />
                  ) : r.kind === 'result' ? (
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: COST_COLORS.profit }} />
                  ) : (
                    <span className="w-2 shrink-0" />
                  )}
                  <span className="truncate">{t(`row.${r.key}`)}</span>
                </span>
                <span
                  className={cn(
                    'tnum whitespace-nowrap text-right',
                    // Natija qatori rangi bitta joyda: foyda — yashil, zarar — qizil
                    r.kind === 'result'
                      ? cn('font-semibold', unit < 0 ? 'text-danger' : 'text-brand-ink')
                      : strong
                        ? 'font-semibold text-ink'
                        : 'text-muted',
                  )}
                >
                  {row.units > 0 ? `${signOf(unit)}${f.num(Math.abs(unit))}` : '—'}
                </span>
                <span
                  className={cn(
                    'tnum whitespace-nowrap text-right',
                    r.kind === 'result'
                      ? cn('font-semibold', total < 0 ? 'text-danger' : 'text-brand-ink')
                      : strong
                        ? 'font-semibold text-ink'
                        : 'text-ink-soft',
                  )}
                >
                  {signOf(total)}
                  {f.num(Math.abs(total))}
                </span>
              </li>
            );
          })}
        </ul>
      </div>

      {/* Tushum qayerga ketdi — bir qarashda, zanjirdagi nuqtalar bilan bir xil ranglarda */}
      <div className={cn('pb-4 pt-2', pad)}>
        <SplitStrip parts={splitParts(row, t)} />
      </div>

      {noCost ? (
        <div
          className={cn(
            'mb-4 flex items-start gap-2 rounded-xl border border-warn/30 bg-warn/5 px-3 py-2.5 text-xs text-warn-ink',
            embedded ? 'mx-0' : 'mx-4 sm:mx-5',
          )}
        >
          <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" />
          <span className="min-w-0 flex-1">{t('card.noCost')}</span>
          <Link to="/cost-price" className="inline-flex shrink-0 items-center gap-1 font-semibold hover:underline">
            <Tag className="h-3 w-3" />
            {t('card.setCost')}
          </Link>
        </div>
      ) : null}

      <div className={cn('mt-auto flex justify-end border-t border-line py-2.5', pad)}>
        <Link
          to={`/products/${row.productId}`}
          className="inline-flex items-center gap-1 text-xs font-semibold text-brand-ink hover:underline"
        >
          {t('card.more')}
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    </div>
  );
}
