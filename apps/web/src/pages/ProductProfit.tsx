import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, ArrowRight, Coins, HandCoins, ImageOff, Package, Tag, Wallet } from 'lucide-react';
import type { ProductProfitMoney, ProductProfitResponse, ProductProfitRow } from '@savdoiq/shared';
import {
  Amount,
  Card,
  EmptyState,
  ErrorState,
  PageHeader,
  PlanGate,
  PreviewBadge,
  SearchInput,
  Segmented,
  Skeleton,
  StatCard,
  StatGrid,
} from '@/components/ui';
import { FilterBar } from '@/components/filters';
import { PART_COLOR } from '@/components/unit/types';
import { api } from '@/lib/api';
import { usePeriodQuery } from '@/store/ui';
import { registerNamespace, useFormat, useT } from '@/i18n';
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
    'kpi.revenue': 'Tushum',
    'kpi.revenueHint': '{units} dona, {orders} buyurtma',
    'kpi.payout': 'Chiqarishga',
    'kpi.payoutHint': 'Uzum komissiya va yetkazishni ushlab, sizga to‘laydigani',
    'kpi.cogs': 'Tannarx',
    'kpi.cogsHint': 'Sotilgan tovarlarning sotib olish narxi',
    'kpi.profit': 'Sof foyda',
    'kpi.profitHint': 'Tannarx, soliq va reklamadan keyin · marja {m}',
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
    'empty.title': 'Bu davrda sotuv yo‘q',
    'empty.hint': 'Yuqoridagi davrni kengroq tanlang — masalan «Shu yil».',
    'empty.search': 'Qidiruv bo‘yicha mahsulot topilmadi',
    'note.money': 'Summalar so‘mda. Bekor qilingan va qaytarilgan sotuvlar kirmaydi.',
  },
  ru: {
    title: 'Прибыль по товарам',
    subtitle: 'Сколько денег оставил каждый товар — с одной штуки и всего',
    search: 'Поиск по названию товара',
    'sort.profit': 'Чистая прибыль',
    'sort.perUnit': 'С 1 шт.',
    'sort.revenue': 'Выручка',
    'sort.margin': 'Маржа',
    'kpi.revenue': 'Выручка',
    'kpi.revenueHint': '{units} шт., {orders} заказов',
    'kpi.payout': 'К выводу',
    'kpi.payoutHint': 'Что Uzum платит вам после комиссии и доставки',
    'kpi.cogs': 'Себестоимость',
    'kpi.cogsHint': 'Закупочная цена проданных товаров',
    'kpi.profit': 'Чистая прибыль',
    'kpi.profitHint': 'После себестоимости, налога и рекламы · маржа {m}',
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
    'empty.title': 'За этот период продаж нет',
    'empty.hint': 'Выберите период шире — например «Этот год».',
    'empty.search': 'По запросу товары не найдены',
    'note.money': 'Суммы в сумах. Отменённые и возвращённые продажи не учитываются.',
  },
  en: {
    title: 'Profit by product',
    subtitle: 'How much money each product left you — per unit and in total',
    search: 'Search by product name',
    'sort.profit': 'Net profit',
    'sort.perUnit': 'Per unit',
    'sort.revenue': 'Revenue',
    'sort.margin': 'Margin',
    'kpi.revenue': 'Revenue',
    'kpi.revenueHint': '{units} units, {orders} orders',
    'kpi.payout': 'To withdraw',
    'kpi.payoutHint': 'What Uzum pays you after commission and delivery',
    'kpi.cogs': 'Cost of goods',
    'kpi.cogsHint': 'Purchase price of the goods sold',
    'kpi.profit': 'Net profit',
    'kpi.profitHint': 'After cost, tax and ads · margin {m}',
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
    'empty.title': 'No sales in this period',
    'empty.hint': 'Pick a wider period above — for example “This year”.',
    'empty.search': 'No products match the search',
    'note.money': 'Amounts in UZS. Cancelled and returned sales are excluded.',
  },
});

type SortKey = 'profit' | 'perUnit' | 'revenue' | 'margin';

const SORTERS: Record<SortKey, (r: ProductProfitRow) => number> = {
  profit: (r) => r.netProfit,
  perUnit: (r) => r.perUnit.netProfit,
  revenue: (r) => r.revenue,
  margin: (r) => r.margin,
};

/**
 * Bir mahsulot sahifasi qatorlari: tushumdan sof foydagacha zanjir.
 * `kind`: ayiriladigan xarajat (−), oraliq natija (=) yoki boshlang'ich summa.
 * `always` — nol bo'lsa ham ko'rinadigan asosiy qatorlar.
 */
const ROWS: {
  key: keyof ProductProfitMoney;
  kind: 'start' | 'minus' | 'subtotal' | 'result';
  color?: string;
  always?: boolean;
}[] = [
  { key: 'revenue', kind: 'start', always: true },
  { key: 'commission', kind: 'minus', color: PART_COLOR.commission, always: true },
  { key: 'logistics', kind: 'minus', color: PART_COLOR.logistics, always: true },
  { key: 'payout', kind: 'subtotal', always: true },
  { key: 'cogs', kind: 'minus', color: PART_COLOR.cogs, always: true },
  { key: 'otherCost', kind: 'minus', color: PART_COLOR.storage },
  { key: 'tax', kind: 'minus', color: PART_COLOR.tax },
  { key: 'ads', kind: 'minus', color: PART_COLOR.other },
  { key: 'netProfit', kind: 'result', always: true },
];

export default function ProductProfit() {
  const t = useT('productProfit');
  const f = useFormat();
  const periodQuery = usePeriodQuery();
  const [sort, setSort] = useState<SortKey>('profit');
  const [search, setSearch] = useState('');

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

  const totals = data?.totals;

  return (
    <>
      <PageHeader
        icon={<HandCoins className="h-5 w-5" />}
        title={t('title')}
        description={t('subtitle')}
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
            <StatGrid>
              <StatCard
                label={t('kpi.revenue')}
                value={f.money(totals?.revenue ?? 0)}
                hint={t('kpi.revenueHint', { units: f.num(totals?.units ?? 0), orders: f.num(totals?.orders ?? 0) })}
                icon={<Wallet className="h-5 w-5" />}
                tone="info"
                loading={query.isLoading}
              />
              <StatCard
                label={t('kpi.payout')}
                value={f.money(totals?.payout ?? 0)}
                hint={t('kpi.payoutHint')}
                icon={<Coins className="h-5 w-5" />}
                tone="violet"
                loading={query.isLoading}
              />
              <StatCard
                label={t('kpi.cogs')}
                value={f.money(totals?.cogs ?? 0)}
                hint={t('kpi.cogsHint')}
                icon={<Package className="h-5 w-5" />}
                tone="warn"
                loading={query.isLoading}
              />
              <StatCard
                label={t('kpi.profit')}
                value={f.money(totals?.netProfit ?? 0)}
                hint={t('kpi.profitHint', { m: f.pct(totals?.margin ?? 0) })}
                icon={<HandCoins className="h-5 w-5" />}
                tone={(totals?.netProfit ?? 0) < 0 ? 'danger' : 'brand'}
                loading={query.isLoading}
              />
            </StatGrid>

            {/*
              Nega bu yig'indi Boshqaruv panelidagi sof foydadan farq qiladi — raqam
              bilan tushuntiriladi: farq aynan mahsulotga bog'lanmaydigan xarajatlar.
            */}
            {data && data.unallocated > 0 && data.rows.length > 0 ? (
              <p className="rounded-xl border border-line bg-surface-2/60 px-4 py-3 text-xs leading-relaxed text-muted">
                {t('recon.text', {
                  products: f.money(data.totals.netProfit),
                  other: f.money(data.unallocated),
                  store: f.money(data.totals.netProfit - data.unallocated),
                })}
              </p>
            ) : null}

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
            ) : (
              <>
                <div className="grid items-start gap-4 lg:grid-cols-2 2xl:grid-cols-3">
                  {rows.map((r) => (
                    <ProfitCard key={r.productId} row={r} />
                  ))}
                </div>
                <p className="text-2xs text-muted">{t('note.money')}</p>
              </>
            )}
          </div>
        )}
      </PlanGate>
    </>
  );
}

/** Bitta mahsulot: sof foyda yirik, ostida tushumdan foydagacha zanjir — 1 dona va jami */
export function ProfitCard({ row }: { row: ProductProfitRow }) {
  const t = useT('productProfit');
  const f = useFormat();
  const loss = row.netProfit < 0;
  const noCost = row.units > 0 && row.cogs <= 0;

  // Tushum qayerga ketdi — chiziq bo'laklari (sof foyda manfiy bo'lsa chiziqda ko'rsatilmaydi)
  const parts = [
    { key: 'cogs', value: row.cogs + row.otherCost, color: PART_COLOR.cogs },
    { key: 'uzum', value: row.commission + row.logistics, color: PART_COLOR.commission },
    { key: 'tax', value: row.tax + row.ads, color: PART_COLOR.tax },
    { key: 'profit', value: Math.max(0, row.netProfit), color: PART_COLOR.profit },
  ].filter((p) => p.value > 0);
  const partsTotal = parts.reduce((s, p) => s + p.value, 0) || 1;

  return (
    <div className={cn('card flex flex-col overflow-hidden', loss && 'border-danger/40')}>
      {/* Sarlavha */}
      <div className="flex items-start gap-3 p-4 pb-3 sm:p-5 sm:pb-3">
        <div className="h-14 w-14 shrink-0 overflow-hidden rounded-xl border border-line bg-surface-2">
          {row.imageUrl ? (
            <img src={row.imageUrl} alt="" loading="lazy" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-muted">
              <ImageOff className="h-5 w-5" />
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <Link
            to={`/products/${row.productId}`}
            className="line-clamp-2 text-sm font-semibold leading-snug text-ink hover:text-brand-ink"
            title={row.title}
          >
            {row.title}
          </Link>
          <p className="mt-1 flex min-w-0 items-center gap-2 text-xs text-muted">
            <span className="truncate">{[row.category, t('card.skus', { n: row.skuCount })].filter(Boolean).join(' · ')}</span>
            {/* Yashirilgan bo'lsa ham puli hisobda — sotuvchi qaysi biri ekanini bilsin */}
            {row.hidden ? (
              <span className="shrink-0 rounded-md border border-line bg-surface-2 px-1.5 py-px text-2xs">{t('card.hidden')}</span>
            ) : null}
          </p>
          <p className="tnum mt-0.5 text-xs text-ink-soft">
            {t('card.meta', { units: f.num(row.units), orders: f.num(row.orders) })}
            {row.returns > 0 ? <span className="text-muted"> · {t('card.returns', { n: f.num(row.returns) })}</span> : null}
          </p>
        </div>
      </div>

      {/* Asosiy javob: qancha foyda qoldi */}
      <div
        className={cn(
          'mx-4 rounded-xl border px-4 py-3 sm:mx-5',
          loss ? 'border-danger/30 bg-danger/5' : 'border-brand/25 bg-brand/[0.06]',
        )}
      >
        <div className="flex items-center justify-between gap-3">
          <p className="eyebrow">{loss ? t('card.loss') : t('card.net')}</p>
          <p className="tnum text-xs text-muted">
            {t('card.margin', { v: f.pct(row.margin) })} ·{' '}
            {/* Tannarx kiritilmagan bo'lsa ROI'ni hisoblab bo'lmaydi — 0% emas, chiziqcha */}
            {t('card.roi', { v: row.cogs + row.otherCost > 0 ? f.pct(row.roi, 0) : '—' })}
          </p>
        </div>
        <p
          className={cn(
            'tnum mt-1 font-display text-[26px] font-bold leading-tight tracking-[-0.02em]',
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
      <div className="px-4 pb-1 pt-3 sm:px-5">
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

      {/* Tushum qayerga ketdi — bir qarashda */}
      <div className="px-4 pb-4 pt-2 sm:px-5">
        <div className="flex h-2 w-full overflow-hidden rounded-full bg-surface-3" aria-hidden>
          {parts.map((p) => (
            <div key={p.key} style={{ width: `${(p.value / partsTotal) * 100}%`, background: p.color }} className="h-full" />
          ))}
        </div>
      </div>

      {noCost ? (
        <div className="mx-4 mb-4 flex items-start gap-2 rounded-xl border border-warn/30 bg-warn/5 px-3 py-2.5 text-xs text-warn-ink sm:mx-5">
          <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" />
          <span className="min-w-0 flex-1">{t('card.noCost')}</span>
          <Link to="/cost-price" className="inline-flex shrink-0 items-center gap-1 font-semibold hover:underline">
            <Tag className="h-3 w-3" />
            {t('card.setCost')}
          </Link>
        </div>
      ) : null}

      <div className="mt-auto flex justify-end border-t border-line px-4 py-2.5 sm:px-5">
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
