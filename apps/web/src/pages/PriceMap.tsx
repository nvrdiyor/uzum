import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  Clock,
  Info,
  Package,
  Scale,
  ShieldCheck,
  Target,
  TrendingDown,
  TrendingUp,
  X,
} from '@/components/icons';
import {
  COMPETITOR_LIMITS,
  type PriceMapResponse,
  type PriceMapRow,
  type PriceMapSort,
} from '@savdoiq/shared';
import {
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
  Select,
  Skeleton,
  StatCard,
  StatGrid,
  type Column,
} from '@/components/ui';
import { FilterBar } from '@/components/filters';
import { PeriodChip } from '@/components/finance/PeriodChip';
import {
  ChangeMark,
  CheckedAgo,
  CompetitorLink,
  DiffChip,
  GapValue,
  MoneyRange,
  PositionBadge,
  money,
} from '@/components/competitors/common';
import '@/components/competitors/texts';
import { SkuSearchInput } from '@/components/products/SkuSearchInput';
import { CostCoverage } from '@/components/trust/CostCoverage';
import { DataFreshness } from '@/components/trust/DataFreshness';
import { api } from '@/lib/api';
import { useFeature } from '@/store/session';
import { usePeriodQuery } from '@/store/ui';
import { registerNamespace, useFormat, useT } from '@/i18n';
import { cn } from '@/lib/utils';

registerNamespace('priceMap', {
  uz: {
    title: 'Narxlar xaritasi',
    subtitle: 'Raqobatchilar narxi bizning narx, zararsizlik narxi va marja bilan yonma-yon: qayerda qimmatmiz, qayerda tenglashish zarar',
    'sum.cheaperHint': 'Medianadan kamida {pct}% arzon',
    'sum.similarHint': 'Medianadan ±{pct}% ichida',
    'sum.pricierHint': 'Medianadan kamida {pct}% qimmat',
    'sum.below': 'Zararsizlikdan past',
    'sum.belowHint': 'Raqobatchi narxi zararsizlikdan past',
    'sum.belowHidden': 'Sizning ko‘rinishingizda zararsizlik narxi yashirin',
    'sum.stale': 'Eskirgan',
    'sum.staleHint': '{days} kundan ko‘p tekshirilmagan',
    'table.title': 'Mahsulotlar',
    'table.subtitle': 'Raqobatchi narxi kiritilgan mahsulotlar — qatorni bosing, mahsulot sahifasi ochiladi',
    'filter.category': 'Kategoriya',
    'filter.allCategories': 'Barcha kategoriyalar',
    'filter.sort': 'Saralash',
    'sort.gap': 'Farq bo‘yicha',
    'sort.stale': 'Eskirgani avval',
    'sort.name': 'Nom bo‘yicha',
    'focus.clear': 'Filtrni olib tashlash',
    'col.product': 'Mahsulot',
    'col.our': 'Bizning narx',
    'col.competitors': 'Raqobatchilar',
    'col.gap': 'Farq',
    'col.breakEven': 'Zararsizlik narxi',
    'col.checked': 'Tekshirilgan',
    'cell.margin': 'marja {v}',
    'cell.noCategory': 'Kategoriyasiz',
    'cell.count': '{n} ta · mediana {m}',
    'cell.below': 'raqobatchi {v}',
    'cell.belowHint': 'Eng arzon raqobatchi zararsizlik narxingizdan past: unga tenglashsangiz, har donadan zarar ko‘rasiz',
    'cell.costMissing': 'tannarx kiritilmagan',
    'cell.staleCount': '{n} tasi eski',
    'cell.stale': 'Eskirgan',
    expand: 'Raqobatchilar ({n})',
    collapse: 'Yig‘ish',
    'empty.title': 'Raqobatchi narxi hali kiritilmagan',
    'empty.hint':
      'Mahsulot sahifasidagi “Raqobatchilar narxi” kartasida raqobatchi do‘koni va narxini yozing — hammasi shu xaritada yig‘iladi. Narxni o‘zingiz kiritasiz — biz Uzum sahifalarini o‘qimaymiz.',
    'empty.action': 'Mahsulotlarga o‘tish',
    'empty.filtered': 'Filtr bo‘yicha mahsulot topilmadi',
    'empty.filteredHint': 'Qidiruv, kategoriya yoki do‘kon filtrini o‘zgartiring',
    'note.title': 'Qanday hisoblanadi',
    'note.manual':
      'Narxni o‘zingiz kiritasiz — biz Uzum sahifalarini o‘qimaymiz. Havolalar faqat saqlanadi: SavdoIQ ularni ochmaydi va yuklab olmaydi.',
    'note.position':
      'Farq — bizning narx (eng arzon faol variant; hamma raqobatchi bitta variantga bog‘langan bo‘lsa — o‘sha variant) raqobatchilar medianasiga nisbatan. ±{pct}% ichida — teng.',
    'note.breakEven':
      'Zararsizlik narxi va marja — mahsulot sahifasidagi unit-iqtisodning o‘zi, tanlangan davr sotuvi bo‘yicha. Raqobatchi narxi undan past bo‘lsa, unga tenglashish zarar.',
    'note.stale': 'Oxirgi tekshiruv {days} kundan eski bo‘lsa — narx eskirgan: raqobatchi sahifasini o‘zingiz ochib, narxni yangilang.',
  },
  ru: {
    title: 'Карта цен',
    subtitle: 'Цены конкурентов рядом с нашей ценой, ценой безубыточности и маржой: где мы дороже и где сравняться — в убыток',
    'sum.cheaperHint': 'Минимум на {pct}% ниже медианы',
    'sum.similarHint': 'В пределах ±{pct}% от медианы',
    'sum.pricierHint': 'Минимум на {pct}% выше медианы',
    'sum.below': 'Риск убытка',
    'sum.belowHint': 'Конкурент дешевле безубыточности',
    'sum.belowHidden': 'В вашем представлении цена безубыточности скрыта',
    'sum.stale': 'Устарели',
    'sum.staleHint': 'Не проверялись больше {days} дн.',
    'table.title': 'Товары',
    'table.subtitle': 'Товары с ценами конкурентов — нажмите на строку, откроется страница товара',
    'filter.category': 'Категория',
    'filter.allCategories': 'Все категории',
    'filter.sort': 'Сортировка',
    'sort.gap': 'По разнице',
    'sort.stale': 'Сначала устаревшие',
    'sort.name': 'По названию',
    'focus.clear': 'Снять фильтр',
    'col.product': 'Товар',
    'col.our': 'Наша цена',
    'col.competitors': 'Конкуренты',
    'col.gap': 'Разница',
    'col.breakEven': 'Цена безубыточности',
    'col.checked': 'Проверено',
    'cell.margin': 'маржа {v}',
    'cell.noCategory': 'Без категории',
    'cell.count': '{n} шт. · медиана {m}',
    'cell.below': 'конкурент {v}',
    'cell.belowHint': 'Самый дешёвый конкурент ниже вашей безубыточности: сравняетесь — убыток с каждой штуки',
    'cell.costMissing': 'нет себестоимости',
    'cell.staleCount': 'устарели: {n}',
    'cell.stale': 'Устарело',
    expand: 'Конкуренты ({n})',
    collapse: 'Свернуть',
    'empty.title': 'Цены конкурентов ещё не добавлены',
    'empty.hint':
      'Укажите магазин конкурента и цену в карточке «Цены конкурентов» на странице товара — всё соберётся на этой карте. Цены вы вводите сами — мы не читаем страницы Uzum.',
    'empty.action': 'К товарам',
    'empty.filtered': 'По фильтру товаров нет',
    'empty.filteredHint': 'Измените поиск, категорию или магазин',
    'note.title': 'Как считается',
    'note.manual':
      'Цены вы вводите сами — мы не читаем страницы Uzum. Ссылки только сохраняются: SavdoIQ их не открывает и не скачивает.',
    'note.position':
      'Разница — наша цена (самый дешёвый вариант в продаже; если все конкуренты привязаны к одному варианту — его цена) относительно медианы конкурентов. В пределах ±{pct}% — на уровне.',
    'note.breakEven':
      'Цена безубыточности и маржа — та же юнит-экономика, что на странице товара, по продажам за выбранный период. Если конкурент дешевле её, сравняться — значит торговать в убыток.',
    'note.stale': 'Если последняя проверка старше {days} дн., цена устарела: откройте страницу конкурента сами и обновите цену.',
  },
  en: {
    title: 'Price map',
    subtitle: 'Competitor prices next to our price, break-even price and margin: where we are pricier and where matching means a loss',
    'sum.cheaperHint': 'At least {pct}% below the median',
    'sum.similarHint': 'Within ±{pct}% of the median',
    'sum.pricierHint': 'At least {pct}% above the median',
    'sum.below': 'Below break-even',
    'sum.belowHint': 'A competitor is below break-even',
    'sum.belowHidden': 'The break-even price is hidden in your view',
    'sum.stale': 'Stale',
    'sum.staleHint': 'Not checked for more than {days} days',
    'table.title': 'Products',
    'table.subtitle': 'Products with competitor prices — click a row to open the product page',
    'filter.category': 'Category',
    'filter.allCategories': 'All categories',
    'filter.sort': 'Sort',
    'sort.gap': 'By gap',
    'sort.stale': 'Stale first',
    'sort.name': 'By name',
    'focus.clear': 'Clear filter',
    'col.product': 'Product',
    'col.our': 'Our price',
    'col.competitors': 'Competitors',
    'col.gap': 'Gap',
    'col.breakEven': 'Break-even price',
    'col.checked': 'Checked',
    'cell.margin': 'margin {v}',
    'cell.noCategory': 'No category',
    'cell.count': '{n} · median {m}',
    'cell.below': 'competitor {v}',
    'cell.belowHint': 'The cheapest competitor is below your break-even price: matching it loses money on every unit',
    'cell.costMissing': 'no cost price',
    'cell.staleCount': '{n} stale',
    'cell.stale': 'Stale',
    expand: 'Competitors ({n})',
    collapse: 'Collapse',
    'empty.title': 'No competitor prices yet',
    'empty.hint':
      'Add a competitor’s shop and price in the “Competitor prices” card on a product page — everything comes together on this map. You enter prices yourself — we never read Uzum pages.',
    'empty.action': 'Go to products',
    'empty.filtered': 'No products match the filter',
    'empty.filteredHint': 'Change the search, category or store',
    'note.title': 'How it is calculated',
    'note.manual': 'You enter prices yourself — we never read Uzum pages. Links are only stored: SavdoIQ never opens or downloads them.',
    'note.position':
      'Gap — our price (the cheapest variant on sale; if every competitor is linked to one variant, that variant) against the competitors’ median. Within ±{pct}% counts as on par.',
    'note.breakEven':
      'Break-even price and margin are the same unit economics as on the product page, based on sales for the selected period. If a competitor is below it, matching that price means selling at a loss.',
    'note.stale': 'If the last check is older than {days} days the price is stale: open the competitor’s page yourself and update it.',
  },
});

/** Jamlanma kartasini bosib qatorlarni shu belgiga cheklash (saytda, so'rovsiz) */
type Focus = 'cheaper' | 'similar' | 'pricier' | 'below' | 'stale';

const SORTS: PriceMapSort[] = ['gap', 'stale', 'name'];

function useDebounced<T>(value: T, ms: number): T {
  const [out, setOut] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setOut(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return out;
}

const matchesFocus = (r: PriceMapRow, focus: Focus | null): boolean => {
  if (!focus) return true;
  if (focus === 'below') return r.stats.belowBreakEven === true;
  if (focus === 'stale') return r.stats.stale;
  return r.stats.position === focus;
};

/**
 * Narxlar xaritasi — sotuvchi O'ZI kiritgan raqobatchi narxlari bir joyda
 * (apps/api routes/competitors.ts GET /price-map), 2026-10-24.
 *
 * Har qatorda bizning narx, zararsizlik narxi va marja (mahsulot sahifasidagi
 * unit-iqtisodning o'zi, tanlangan davr) va raqobatchilar min / mediana / max.
 * Narx o'qilmaydi va havola ochilmaydi — sarlavha ostida va izohda ochiq yozilgan.
 * Do'kon — yuqori paneldagi tanlagich; davr — nol foyda narxi va marja uchun.
 */
export default function PriceMap() {
  const t = useT('priceMap');
  const tc = useT('competitors');
  const access = useFeature('products_assortment');
  const pq = usePeriodQuery();
  const [params] = useSearchParams();
  const [searchRaw, setSearchRaw] = useState(params.get('search') ?? '');
  const search = useDebounced(searchRaw.trim(), 300);
  const [category, setCategory] = useState(params.get('category') ?? '');
  const [sort, setSort] = useState<PriceMapSort>('gap');
  const [focus, setFocus] = useState<Focus | null>(null);

  const q = {
    from: pq.from,
    to: pq.to,
    storeId: pq.storeId,
    search: search || undefined,
    category: category || undefined,
    sort,
  };
  const query = useQuery({
    queryKey: ['price-map', q],
    queryFn: () => api.get<PriceMapResponse>('/competitors/price-map', q),
    placeholderData: keepPreviousData,
    enabled: access === 'full',
  });
  const data = query.data;
  const filtered = Boolean(search || category || pq.storeId);

  return (
    <>
      <PageHeader
        icon={<Target className="h-5 w-5" />}
        title={t('title')}
        description={t('subtitle')}
        badge={<PreviewBadge feature="products_assortment" />}
        meta={
          <>
            <PeriodChip />
            <span className="meta-chip" title={tc('manualHint')}>
              <ShieldCheck className="h-3.5 w-3.5" />
              {tc('manual')}
            </span>
            <DataFreshness />
            <CostCoverage />
          </>
        }
      />

      {/* Telefonda do'kon tanlagichi; davr va do'kon — yuqori panelda */}
      <FilterBar />

      <PlanGate feature="products_assortment">
        {query.isError ? (
          <Card>
            <ErrorState
              message={query.error instanceof Error ? query.error.message : undefined}
              onRetry={() => void query.refetch()}
            />
          </Card>
        ) : query.isLoading || !data ? (
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-5">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-32 w-full" />
              ))}
            </div>
            <Skeleton className="h-96 w-full rounded-2xl" />
          </div>
        ) : data.summary.products === 0 && !filtered ? (
          <Card>
            <EmptyState
              icon={<Target className="h-6 w-6" />}
              title={t('empty.title')}
              hint={t('empty.hint')}
              action={
                <Link to="/products">
                  <Button variant="outline" icon={<Package className="h-4 w-4" />}>
                    {t('empty.action')}
                  </Button>
                </Link>
              }
            />
          </Card>
        ) : (
          <div className={cn('space-y-5 transition-opacity', query.isFetching && !query.isLoading && 'opacity-70')}>
            <Summary data={data} focus={focus} onFocus={setFocus} />

            <Card className="overflow-hidden">
              <CardHeader icon={<Target />} tone="violet" title={t('table.title')} subtitle={t('table.subtitle')} />
              <div className="flex flex-col gap-2.5 px-5 pt-4 md:flex-row md:flex-wrap md:items-center">
                <SkuSearchInput className="md:w-72" value={searchRaw} onChange={setSearchRaw} />
                {/* Telefonda ustma-ust: yonma-yon "Barcha kategoriyalar" kesilib qolardi */}
                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 md:flex">
                  <Select
                    className="h-10 md:w-56"
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    aria-label={t('filter.category')}
                    title={t('filter.category')}
                  >
                    <option value="">{t('filter.allCategories')}</option>
                    {/* Tanlangan kategoriya qidiruvdan keyin ro'yxatdan chiqib ketsa ham ko'rinib tursin */}
                    {(category && !data.categories.includes(category) ? [category, ...data.categories] : data.categories).map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </Select>
                  <Select
                    className="h-10 md:w-48"
                    value={sort}
                    onChange={(e) => setSort(e.target.value as PriceMapSort)}
                    aria-label={t('filter.sort')}
                    title={t('filter.sort')}
                  >
                    {SORTS.map((s) => (
                      <option key={s} value={s}>
                        {t(`sort.${s}`)}
                      </option>
                    ))}
                  </Select>
                </div>
                {focus ? (
                  <button
                    type="button"
                    onClick={() => setFocus(null)}
                    title={t('focus.clear')}
                    className="chip focusable self-start bg-brand/10 text-brand-ink transition-colors hover:bg-brand/20 md:self-auto"
                  >
                    {focus === 'below' ? t('sum.below') : focus === 'stale' ? t('sum.stale') : tc(`position.${focus}`)}
                    <X className="h-3 w-3" />
                  </button>
                ) : null}
              </div>
              <div className="mt-4">
                <PriceMapTable rows={data.rows.filter((r) => matchesFocus(r, focus))} />
              </div>
            </Card>

            <Card className="flex gap-3 p-5">
              <span className="icon-tile tone-info h-8 w-8 shrink-0 rounded-[10px] [&_svg]:h-4 [&_svg]:w-4" aria-hidden>
                <Info />
              </span>
              <div className="min-w-0 space-y-1.5 text-xs leading-relaxed text-muted">
                <p className="text-sm font-semibold text-ink">{t('note.title')}</p>
                <p className="max-w-3xl">{t('note.manual')}</p>
                <p className="max-w-3xl">{t('note.position', { pct: COMPETITOR_LIMITS.similarPct })}</p>
                <p className="max-w-3xl">{t('note.breakEven')}</p>
                <p className="max-w-3xl">{t('note.stale', { days: COMPETITOR_LIMITS.staleDays })}</p>
              </div>
            </Card>
          </div>
        )}
      </PlanGate>
    </>
  );
}

/** Besh sanoq kartasi; bosilsa — jadval shu belgiga cheklanadi (yana bosilsa — olib tashlanadi) */
function Summary({ data, focus, onFocus }: { data: PriceMapResponse; focus: Focus | null; onFocus: (f: Focus | null) => void }) {
  const t = useT('priceMap');
  const tc = useT('competitors');
  const f = useFormat();
  const s = data.summary;
  const pct = data.limits.similarPct;
  const cards: { key: Focus; label: string; hint: string; value: number | null; icon: ReactNode; tone: 'brand' | 'info' | 'warn' | 'danger' }[] = [
    { key: 'cheaper', label: tc('position.cheaper'), hint: t('sum.cheaperHint', { pct }), value: s.cheaper, icon: <TrendingDown />, tone: 'brand' },
    { key: 'similar', label: tc('position.similar'), hint: t('sum.similarHint', { pct }), value: s.similar, icon: <Scale />, tone: 'info' },
    { key: 'pricier', label: tc('position.pricier'), hint: t('sum.pricierHint', { pct }), value: s.pricier, icon: <TrendingUp />, tone: 'warn' },
    {
      key: 'below',
      label: t('sum.below'),
      hint: s.belowBreakEven === null ? t('sum.belowHidden') : t('sum.belowHint'),
      value: s.belowBreakEven,
      icon: <AlertTriangle />,
      tone: 'danger',
    },
    { key: 'stale', label: t('sum.stale'), hint: t('sum.staleHint', { days: data.limits.staleDays }), value: s.stale, icon: <Clock />, tone: 'warn' },
  ];
  return (
    <StatGrid>
      {cards.map((c) => {
        const active = focus === c.key;
        const counted = typeof c.value === 'number';
        return (
          <StatCard
            key={c.key}
            label={c.label}
            value={counted ? f.num(c.value as number) : '—'}
            hint={c.hint}
            icon={c.icon}
            // Nol — rangsiz: "0 ta qimmat" sariq, "0 ta zarar" qizil turmasin
            tone={counted && (c.value as number) > 0 ? c.tone : 'muted'}
            className={cn(active && 'ring-2 ring-brand/50')}
            onClick={counted ? () => onFocus(active ? null : c.key) : undefined}
          />
        );
      })}
    </StatGrid>
  );
}

/*
 * Kataklar orasi px-5 o'rniga 20 px (pl/pr-2.5 — `px-5` dan keyin chiqadi va
 * uni bosadi; `cn` klasslarni birlashtirmaydi): olti ustun 1366 px'da
 * gorizontal aylantirishsiz sig'adi (mahsulot sahifasidagi variantlar jadvali kabi).
 */
const PAD = 'pl-2.5 pr-2.5';
const PAD_FIRST = 'pr-2.5';
const PAD_LAST = 'pl-2.5';

function PriceMapTable({ rows }: { rows: PriceMapRow[] }) {
  const t = useT('priceMap');
  const tc = useT('competitors');
  const f = useFormat();
  const navigate = useNavigate();
  // Pulsiz ko'rinishda nol foyda narxi hamma qatorda null — bo'sh ustun joy egallamasin
  const showBreakEven = rows.length === 0 || rows.some((r) => typeof r.our.breakEvenPrice === 'number');

  const columns: Column<PriceMapRow>[] = useMemo(
    () => [
      {
        key: 'product',
        header: t('col.product'),
        className: PAD_FIRST,
        headerClassName: PAD_FIRST,
        render: (r) => (
          <div className="min-w-0 max-w-[14rem] xl:max-w-[18rem] 2xl:max-w-[24rem]">
            <ProductCell
              name={r.title}
              imageUrl={r.imageUrl}
              lines={2}
              title={
                <Link
                  to={`/products/${r.productId}`}
                  onClick={(e) => e.stopPropagation()}
                  className="focusable rounded-sm hover:text-brand-ink hover:underline"
                  title={r.title}
                >
                  {r.title}
                </Link>
              }
              subtitle={
                <span className="inline-flex min-w-0 items-center gap-1.5">
                  {r.stats.stale ? (
                    <span className="chip shrink-0 bg-warn/10 px-1.5 py-0 text-2xs text-warn-ink">{t('cell.stale')}</span>
                  ) : null}
                  <span className="truncate">{`${r.category ?? t('cell.noCategory')} · ${r.storeTitle}`}</span>
                </span>
              }
            />
          </div>
        ),
      },
      {
        key: 'our',
        header: t('col.our'),
        align: 'right',
        className: PAD,
        headerClassName: PAD,
        render: (r) => (
          <div className="leading-tight">
            <MoneyRange min={r.our.minPrice} max={r.our.maxPrice} className="tnum font-semibold text-ink" />
            <p className="tnum text-2xs text-muted" title={tc('ref.marginHint')}>
              {t('cell.margin', {
                v: typeof r.our.margin === 'number' && typeof r.our.price === 'number' && r.our.price > 0 ? f.pct(r.our.margin) : '—',
              })}
            </p>
          </div>
        ),
      },
      ...(showBreakEven
        ? [
            {
              key: 'breakEven',
              header: t('col.breakEven'),
              align: 'right' as const,
              className: PAD,
              headerClassName: PAD,
              render: (r: PriceMapRow) => (
                <div className="leading-tight">
                  <span className="tnum font-semibold text-ink">{money(f, r.our.breakEvenPrice)}</span>
                  {r.stats.belowBreakEven ? (
                    <p
                      className="tnum flex cursor-help items-center justify-end gap-1 text-2xs font-semibold text-danger-ink"
                      title={t('cell.belowHint')}
                    >
                      <AlertTriangle className="h-3 w-3 shrink-0" />
                      {t('cell.below', { v: typeof r.stats.minPrice === 'number' ? f.num(r.stats.minPrice) : '—' })}
                    </p>
                  ) : r.our.costMissing ? (
                    <p className="text-2xs text-warn-ink">{t('cell.costMissing')}</p>
                  ) : null}
                </div>
              ),
            },
          ]
        : []),
      {
        key: 'competitors',
        header: t('col.competitors'),
        align: 'right',
        className: PAD,
        headerClassName: PAD,
        render: (r) => (
          <div className="leading-tight">
            <MoneyRange min={r.stats.minPrice} max={r.stats.maxPrice} className="tnum font-semibold text-ink" />
            <p className="tnum text-2xs text-muted">
              {t('cell.count', {
                n: f.num(r.stats.count),
                m: typeof r.stats.medianPrice === 'number' ? f.num(r.stats.medianPrice) : '—',
              })}
            </p>
          </div>
        ),
      },
      {
        key: 'gap',
        header: <span title={tc('gap.vsMedian')}>{t('col.gap')}</span>,
        align: 'right',
        className: PAD,
        headerClassName: PAD,
        render: (r) => (
          <div className="flex flex-col items-start gap-1 leading-tight md:items-end">
            <GapValue gapPct={r.stats.gapPct} />
            <PositionBadge position={r.stats.position} />
          </div>
        ),
      },
      {
        key: 'checked',
        header: t('col.checked'),
        align: 'right',
        className: PAD_LAST,
        headerClassName: PAD_LAST,
        render: (r) => (
          <div className="flex flex-col items-start leading-tight md:items-end">
            <CheckedAgo checkedAt={r.stats.lastCheckedAt} daysAgo={r.stats.daysSinceCheck} stale={r.stats.stale} />
            {!r.stats.stale && r.stats.staleCount > 0 ? (
              <span className="text-2xs text-warn-ink">{t('cell.staleCount', { n: f.num(r.stats.staleCount) })}</span>
            ) : null}
          </div>
        ),
      },
    ],
    [t, tc, f, showBreakEven],
  );

  return (
    <DataTable<PriceMapRow>
      columns={columns}
      rows={rows}
      rowKey={(r) => r.productId}
      localSort={false}
      onRowClick={(r) => navigate(`/products/${r.productId}`)}
      renderExpanded={(r) => <Entries row={r} />}
      expandLabel={(r, open) => (open ? t('collapse') : t('expand', { n: f.num(r.stats.count) }))}
      empty={<EmptyState icon={<Target className="h-6 w-6" />} title={t('empty.filtered')} hint={t('empty.filteredHint')} />}
    />
  );
}

/** Ochilgan qator: har bir raqobatchi — kartadagi bilan bir xil ko'rinishda */
function Entries({ row }: { row: PriceMapRow }) {
  const f = useFormat();
  return (
    <ul className="divide-y divide-line/50 rounded-xl border border-line/60 bg-surface">
      {row.entries.map((e) => (
        <li key={e.id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-3 py-2.5 text-sm">
          <CompetitorLink title={e.title} url={e.url} className="min-w-0 flex-1 font-medium text-ink" />
          <span className={cn('tnum whitespace-nowrap font-semibold', e.belowBreakEven ? 'text-danger-ink' : 'text-ink')}>
            {money(f, e.price)}
          </span>
          <ChangeMark change={e.change} prevPrice={e.prevPrice} />
          <DiffChip diffPct={e.diffPct} ourPrice={e.ourPrice} belowBreakEven={e.belowBreakEven} />
          <CheckedAgo checkedAt={e.checkedAt} daysAgo={e.daysAgo} stale={e.stale} />
        </li>
      ))}
    </ul>
  );
}
