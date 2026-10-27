import { useEffect, useMemo, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Boxes, Coins, Download, Inbox, PackageCheck, ShoppingCart, Table2, TrendingUp, Wallet } from '@/components/icons';
import type { SalesStockResponse, SalesStockRow } from '@savdoiq/shared';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  DataTable,
  EmptyState,
  ErrorState,
  PageHeader,
  PlanGate,
  PreviewBadge,
  Segmented,
  StatCard,
  StatGrid,
  toast,
  type Column,
} from '@/components/ui';
import { SkuSearchInput } from '@/components/products/SkuSearchInput';
import { FilterBar } from '@/components/filters';
import { DataFreshness } from '@/components/trust/DataFreshness';
import {
  NEUTRAL_TONE,
  STATE_COLOR,
  STATE_TONE,
  STOCK_STATES,
  SkuNameCell,
  StockStatusBadge,
  TONE_TEXT,
  type StockState,
} from '@/components/stock/common';
import { useDebounced } from '@/components/sales/useDebounced';
import { registerNamespace, useFormat, useT } from '@/i18n';
import { api } from '@/lib/api';
import { cn, downloadBlob } from '@/lib/utils';
import { useCanFetch, useSeesMoney } from '@/lib/view';
import { useStores } from '@/store/session';
import { usePeriodQuery } from '@/store/ui';

registerNamespace('salesStock', {
  uz: {
    title: 'Sotuv va qoldiq',
    subtitle: 'Har bir SKU bo‘yicha sotuv sur’ati va qoldiq nechaga yetishi',
    'kpi.sold': 'Sotildi',
    'kpi.soldHint': '{count} ta SKU bo‘yicha',
    'kpi.stock': 'Omborda',
    'kpi.stockHint': 'FBO + FBS + o‘z ombori',
    'kpi.revenue': 'Tushum',
    'kpi.payout': 'To‘lovga',
    'kpi.profit': 'Tovarlar bo‘yicha foyda',
    'unit': 'dona',
    'seg.all': 'Barchasi',
    'strip.title': 'Qoldiq holati — barcha SKU’lar taqsimoti',
    'strip.share': '{status}: {count} SKU ({pct})',
    'table.title': 'SKU bo‘yicha kesim',
    'table.hint': 'Summalar so‘mda. Holat va necha kunga yetishi Rejalashtiruvchidagidek: yo‘ldagi tovar va yetkazish muddati bilan',
    'table.empty': 'Mos SKU topilmadi',
    'table.emptyHint': 'Filtrni o‘zgartiring yoki boshqa davrni tanlang',
    'col.product': 'Mahsulot',
    'col.sold': 'Sotildi',
    'col.stock': 'Omborda',
    'col.revenue': 'Tushum',
    'col.payout': 'To‘lovga',
    'col.netProfit': 'Sof foyda',
    'col.status': 'Holat · yetadi',
    'revenueShare': 'Jami tushumdagi ulushi: {pct}. Chiziq — eng ko‘p tushumli SKU’ga nisbatan',
    'own': 'O‘z ombori {n}',
    'margin': 'marja {pct}',
    'perMonth': '{n}/oy',
    'coverHint': 'So‘nggi 30 kunda, tovar sotuvda bo‘lgan kunlar bo‘yicha: kuniga {day}, oyiga {month} dona',
    'days': 'kun',
    'noSales': 'Sotuv yo‘q',
    'export.ok': 'Excel fayl yuklab olindi',
    'export.fail': 'Eksport qilishda xatolik',
  },
  ru: {
    title: 'Продажи и остатки',
    subtitle: 'Скорость продаж по каждому SKU и на сколько хватит остатка',
    'kpi.sold': 'Продано',
    'kpi.soldHint': 'По {count} SKU',
    'kpi.stock': 'На складе',
    'kpi.stockHint': 'FBO + FBS + свой склад',
    'kpi.revenue': 'Выручка',
    'kpi.payout': 'К выплате',
    'kpi.profit': 'Прибыль по товарам',
    'unit': 'шт',
    'seg.all': 'Все',
    'strip.title': 'Состояние остатков — распределение всех SKU',
    'strip.share': '{status}: {count} SKU ({pct})',
    'table.title': 'Разрез по SKU',
    'table.hint': 'Суммы в сумах. Статус и на сколько хватит — как в Планировщике: с товаром в пути и сроком поставки',
    'table.empty': 'Подходящих SKU нет',
    'table.emptyHint': 'Измените фильтр или выберите другой период',
    'col.product': 'Товар',
    'col.sold': 'Продано',
    'col.stock': 'На складе',
    'col.revenue': 'Выручка',
    'col.payout': 'К выплате',
    'col.netProfit': 'Чистая прибыль',
    'col.status': 'Статус · хватит',
    'revenueShare': 'Доля в общей выручке: {pct}. Полоса — относительно SKU с наибольшей выручкой',
    'own': 'Свой склад {n}',
    'margin': 'маржа {pct}',
    'perMonth': '{n}/мес',
    'coverHint': 'За последние 30 дней, по дням в наличии: {day} в день, {month} шт в месяц',
    'days': 'дн.',
    'noSales': 'Нет продаж',
    'export.ok': 'Excel-файл скачан',
    'export.fail': 'Ошибка при экспорте',
  },
  en: {
    title: 'Sales & stock',
    subtitle: 'Sales velocity per SKU and how long the stock will last',
    'kpi.sold': 'Sold',
    'kpi.soldHint': 'Across {count} SKUs',
    'kpi.stock': 'In stock',
    'kpi.stockHint': 'FBO + FBS + own warehouse',
    'kpi.revenue': 'Revenue',
    'kpi.payout': 'Payout',
    'kpi.profit': 'Profit on goods',
    'unit': 'pcs',
    'seg.all': 'All',
    'strip.title': 'Stock health — split of all SKUs',
    'strip.share': '{status}: {count} SKUs ({pct})',
    'table.title': 'SKU breakdown',
    'table.hint': 'Amounts in UZS. Status and days of cover match the Planner: with stock in transit and your lead time',
    'table.empty': 'No matching SKUs',
    'table.emptyHint': 'Change the filter or pick another period',
    'col.product': 'Product',
    'col.sold': 'Sold',
    'col.stock': 'In stock',
    'col.revenue': 'Revenue',
    'col.payout': 'Payout',
    'col.netProfit': 'Net profit',
    'col.status': 'Status · lasts',
    'revenueShare': 'Share of total revenue: {pct}. The bar is relative to the top-revenue SKU',
    'own': 'Own warehouse {n}',
    'margin': 'margin {pct}',
    'perMonth': '{n}/mo',
    'coverHint': 'Last 30 days, counting days in stock: {day} a day, {month} pcs a month',
    'days': 'days',
    'noSales': 'No sales',
    'export.ok': 'Excel file downloaded',
    'export.fail': 'Export failed',
  },
});

const PAGE_SIZE = 50;
/**
 * "Yetarli" (ok) ham filtr: Qoldiqlar sahifasidagi bilan bir xil besh holat.
 * Ilgari u yo'q edi — sog'lom SKU'larni alohida ko'rib bo'lmasdi.
 */
type Segment = 'all' | StockState;
const SEGMENTS: Segment[] = ['all', ...STOCK_STATES];

const NO_COUNTS: Record<StockState, number> = { critical: 0, low: 0, ok: 0, excess: 0, dead: 0 };

/** Chiziq uzunligi, %: eng kattasiga nisbatan, 0–100 oralig'ida */
function barPct(value: number, max: number): number {
  return max > 0 ? Math.min(100, Math.max(0, Math.round((value / max) * 1000) / 10)) : 0;
}

/*
 * Kataklar orasidagi bo'shliq: DataTable'ning px-5 (har ustunga 40 px) o'rniga
 * 20 px — yetti ustunda ~120 px yutuq, 1280 px ekranda ruscha sarlavhalar bilan
 * ham jadval gorizontal aylantirishsiz sig'adi (o'lchandi: uz 875 / ru 946 px,
 * joy 958 px). pl-/pr- Tailwind CSS'ida px- dan keyin chiqadi, shuning uchun
 * aynan shular ustun keladi. Birinchi ustunning chap va oxirgisining o'ng
 * cheti px-5 da qoladi — karta chizig'i bilan teng.
 */
const PAD = 'pl-2.5 pr-2.5';
const PAD_FIRST = 'pr-2.5';
const PAD_LAST = 'pl-2.5';

/**
 * Qoldiq holati tasmasi: holatlarning 100% ga yoyilgan ulushi va ostida filtr.
 * Tasma bo'lagini bosish ham o'sha holatni tanlaydi (qayta bosilsa — Barchasi).
 *
 * Ilgari jadval yonida alohida halqa kartochkasi turardi: u jadvaldan uchdan
 * bir kenglikni olib, 1366 px'da Tushum…Holat ustunlarini gorizontal aylantirish
 * ortiga surardi, o'zi esa jadval balandligicha bo'sh cho'zilardi (2026-10-24).
 */
function StatusStrip({
  counts,
  value,
  onChange,
}: {
  counts: Record<StockState, number>;
  value: Segment;
  onChange: (next: Segment) => void;
}) {
  const t = useT('salesStock');
  const tc = useT('common');
  const f = useFormat();
  const total = STOCK_STATES.reduce((sum, s) => sum + counts[s], 0);

  return (
    <div className="space-y-2.5">
      {/* Klaviatura uchun xuddi shu tanlov pastdagi tugmalarda bor — tasma faqat sichqoncha uchun */}
      <div
        className="flex h-2 w-full gap-0.5 overflow-hidden rounded-full bg-surface-3"
        aria-hidden
        title={t('strip.title')}
      >
        {total > 0
          ? STOCK_STATES.filter((s) => counts[s] > 0).map((s) => (
              <button
                key={s}
                type="button"
                tabIndex={-1}
                title={t('strip.share', {
                  status: tc(`status.${s}`),
                  count: f.num(counts[s]),
                  pct: f.pct((counts[s] / total) * 100),
                })}
                onClick={() => onChange(value === s ? 'all' : s)}
                className={cn(
                  'h-full min-w-1.5 transition-opacity duration-150 hover:opacity-100',
                  value !== 'all' && value !== s && 'opacity-30',
                )}
                style={{ flex: `${counts[s]} 1 0%`, backgroundColor: STATE_COLOR[s] }}
              />
            ))
          : null}
      </div>
      <Segmented
        value={value}
        onChange={onChange}
        size="sm"
        options={SEGMENTS.map((s) => ({
          value: s,
          label:
            s === 'all' ? (
              t('seg.all')
            ) : (
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: STATE_COLOR[s] }} />
                {tc(`status.${s}`)}
              </span>
            ),
          count: s === 'all' ? total : counts[s],
        }))}
      />
    </div>
  );
}

export default function SalesStock() {
  const t = useT('salesStock');
  const tc = useT('common');
  const f = useFormat();
  const q = usePeriodQuery();
  const stores = useStores();

  const [page, setPage] = useState(1);
  const [segment, setSegment] = useState<Segment>('all');
  const [searchInput, setSearchInput] = useState('');
  const search = useDebounced(searchInput);
  const [exporting, setExporting] = useState(false);
  // Excel'da to'lov va foyda bor — pulsiz ko'rinish shablonida (Omborchi) tugma yo'q (server ham 403)
  const canExport = useCanFetch('/export/sales-stock');
  // To'lov va sof foyda — pulsiz shablonda null: kartalar va ustunlar chizilmaydi
  const money = useSeesMoney();

  /**
   * Holat filtri SERVERGA yuboriladi. Ilgari u faqat joriy 50 qatorga
   * qo'llanardi: "Kritik" tanlangan sahifada kritik SKU bo'lmasa jadval
   * bo'shab qolardi VA sahifalash tugmalari ham yo'qolardi — foydalanuvchi
   * keyingi sahifadagi kritik tovarlarga umuman o'ta olmasdi.
   */
  const query = {
    ...q,
    page,
    pageSize: PAGE_SIZE,
    search: search || undefined,
    status: segment === 'all' ? undefined : segment,
  };

  useEffect(() => {
    setPage(1);
  }, [search, segment, q.from, q.to, q.storeId]);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['sales-stock', query],
    queryFn: () => api.get<SalesStockResponse>('/stocks/sales-stock', query),
    placeholderData: keepPreviousData,
  });

  // Filtr server tomonida qo'llangan — bu yerda qayta filtrlash shart emas
  const rows = useMemo(() => data?.rows.items ?? [], [data]);
  const totals = data?.totals;
  /*
   * Holatlar soni serverdan: qidiruvga mos barcha SKU bo'yicha, holat
   * filtridan oldin. Ilgari ular joriy, allaqachon filtrlangan sahifadan
   * sanalardi — "Kritik" bosilsa Barchasi 8 ga, qolganlari 0 ga tushardi.
   */
  const statusCounts = totals?.statusCounts ?? NO_COUNTS;

  /*
   * Do'kon nomi alohida ustun emas (u ~170 px olardi, hatto do'kon bitta
   * bo'lsa ham): faqat bir nechta do'kon aralash ko'rinsa, SKU yonida.
   */
  const multiStore = !q.storeId && stores.length > 1;
  /*
   * Tushum chizig'i miqyosi serverdan: ro'yxatdagi (barcha sahifalar) eng katta
   * tushum = to'liq uzunlik, izohda shu aytiladi. Ilgari u joriy 50 qatordan
   * olinardi: har sahifaning birinchi qatori to'liq chiziq olardi, izohda esa
   * faqat "jami tushumdagi ulushi: 9,9%" turardi (2026-10-24).
   */
  const maxRevenue = totals?.maxRevenue ?? 0;
  const totalRevenue = totals?.revenue ?? 0;

  async function onExport() {
    setExporting(true);
    try {
      const blob = await api.blob('/export/sales-stock', query);
      downloadBlob(blob, `sales-stock-${q.from}_${q.to}.xlsx`);
      toast.success(t('export.ok'));
    } catch {
      toast.error(t('export.fail'));
    } finally {
      setExporting(false);
    }
  }

  /*
   * Ustunlar 1280 px'da sig'adi: Do'kon ustuni SKU ostiga, "Yetadi" esa Holat
   * ustuniga tushdi; FBO/FBS, marja va oylik sur'at — sub-qatorlarda.
   * Ilgari 11 ustun bor edi va 1366 px'da faqat Mahsulot / Do'kon / Sotildi
   * ko'rinardi (2026-10-24).
   */
  const columns = useMemo<Column<SalesStockRow>[]>(
    () => [
      {
        key: 'product',
        header: t('col.product'),
        render: (row) => (
          // Kenglik chegaralangan: uzun nom jadvalni cho'zmasin, tor joyda ikki
          // qatorga sig'sin — "… — Yashil" / "… — Bej" kabi variant kesilmaydi.
          // Bo'sh joy qolsa ustun o'zi kengayadi (22rem gacha).
          <SkuNameCell
            className="md:min-w-[13.5rem] md:max-w-[22rem] 2xl:max-w-[28rem]"
            title={row.title}
            subtitle={multiStore ? `${row.sku} · ${row.storeTitle}` : row.sku}
            imageUrl={row.imageUrl}
          />
        ),
        sortValue: (row) => row.title,
        sortable: true,
        className: PAD_FIRST,
        headerClassName: PAD_FIRST,
      },
      {
        key: 'sold',
        header: t('col.sold'),
        align: 'right',
        render: (row) => <span className="font-medium text-ink">{f.num(row.sold)}</span>,
        sortValue: (row) => row.sold,
        sortable: true,
        className: PAD,
        headerClassName: PAD,
      },
      {
        /*
         * Izoh qatorlari yig'indiga teng: o'z ombori (bo'lsa) alohida qatorda.
         * Ilgari faqat FBO · FBS edi — 30 ostida "FBO 22 · FBS 6" turardi
         * (2026-10-24). Bitta qatorga qo'shilsa ustun ~55 px kengayib, ruscha
         * 1280 px'da jadval 53 px gorizontal aylanib qolardi (o'lchandi).
         */
        key: 'stock',
        header: t('col.stock'),
        align: 'right',
        render: (row) => (
          <div className="leading-tight" title={t('kpi.stockHint')}>
            <span className="tnum font-medium text-ink">{f.num(row.stockFbo + row.stockFbs + row.stockOwn)}</span>
            <p className="tnum text-2xs text-muted">
              FBO {f.num(row.stockFbo)} · FBS {f.num(row.stockFbs)}
            </p>
            {row.stockOwn > 0 ? (
              <p className="tnum text-2xs text-muted">{t('own', { n: f.num(row.stockOwn) })}</p>
            ) : null}
          </div>
        ),
        sortValue: (row) => row.stockFbo + row.stockFbs + row.stockOwn,
        sortable: true,
        className: PAD,
        headerClassName: PAD,
      },
      {
        key: 'revenue',
        header: t('col.revenue'),
        align: 'right',
        render: (row) => (
          <div
            className="leading-tight"
            title={
              totalRevenue > 0 ? t('revenueShare', { pct: f.pct((row.revenue / totalRevenue) * 100) }) : undefined
            }
          >
            <span className="font-semibold text-ink">{f.num(row.revenue)}</span>
            {/*
              Tushum chizig'i: qaysi SKU pul olib kelayotganini ko'z bilan ajratish
              uchun. Neytral rangda — yashil faqat sotuvchida qoladigan foyda uchun.
            */}
            <span className="mt-1 flex h-0.5 w-full justify-end overflow-hidden rounded-full bg-surface-3">
              <span className="h-full rounded-full bg-ink-soft/40" style={{ width: `${barPct(row.revenue, maxRevenue)}%` }} />
            </span>
          </div>
        ),
        sortValue: (row) => row.revenue,
        sortable: true,
        className: PAD,
        headerClassName: PAD,
      },
      {
        key: 'payout',
        header: t('col.payout'),
        align: 'right',
        hideOnMobile: true,
        render: (row) => <span className="text-ink-soft">{f.num(row.payout)}</span>,
        sortValue: (row) => row.payout,
        sortable: true,
        className: PAD,
        headerClassName: PAD,
      },
      {
        key: 'netProfit',
        header: t('col.netProfit'),
        align: 'right',
        render: (row) => (
          <div className="leading-tight">
            <span className={cn('font-semibold', row.netProfit < 0 ? 'text-danger' : 'text-brand-ink')}>
              {f.num(row.netProfit)}
            </span>
            {row.revenue > 0 ? (
              <p className={cn('tnum text-2xs', row.netProfit < 0 ? 'text-danger' : 'text-muted')}>
                {t('margin', { pct: f.pct((row.netProfit / row.revenue) * 100) })}
              </p>
            ) : null}
          </div>
        ),
        sortValue: (row) => row.netProfit,
        sortable: true,
        className: PAD,
        headerClassName: PAD,
      },
      {
        /*
         * Holat va "Yetadi" bitta ustunda: holat aynan qoldiq necha kunga
         * yetishidan kelib chiqadi. Ostida — kun (holat rangida) va oylik
         * sur'at; kunlik o'rtacha izohda (u oylikning 30 dan biri).
         */
        key: 'status',
        header: t('col.status'),
        align: 'right',
        render: (row) => (
          <div className="text-right leading-tight">
            <StockStatusBadge status={row.status} />
            <p
              className="tnum mt-1 text-2xs"
              title={
                row.avgDaily > 0
                  ? t('coverHint', { day: f.num(row.avgDaily, 1), month: f.num(row.monthPotential) })
                  : undefined
              }
            >
              {/*
                Kun yozuvi nishon rangida — holat Rejalashtiruvchidan (yetkazish
                muddati bilan). Qat'iy 7/14 kunlik chegaradan bo'yalsa, yetkazish
                14 kun bo'lganda 12 kunlik SKU nishoni qizil, kun yozuvi sariq
                chiqardi — Qoldiqlar sahifasidagi kabi (2026-10-24).
              */}
              <span className={cn('font-semibold', TONE_TEXT[STATE_TONE[row.status]])}>
                {row.daysLeft === null ? t('noSales') : `${f.num(row.daysLeft)} ${t('days')}`}
              </span>
              {row.avgDaily > 0 ? (
                <span className="text-muted"> · {t('perMonth', { n: f.num(row.monthPotential) })}</span>
              ) : null}
            </p>
          </div>
        ),
        /*
         * Saralash — shoshilinchlik bo'yicha: DataTable birinchi bosishda (va
         * telefondagi tanlov) kamayish tartibida saralaydi, shuning uchun kun
         * manfiy olinadi — 0 kunlik "Kritik" tepada, "Sotuv yo'q" pastda.
         * Ilgari teskari edi: birinchi bosishda eng kam shoshilinchlari
         * (232 kun, "Sotuv yo'q") tepaga chiqardi (2026-10-24).
         */
        sortValue: (row) => -(row.daysLeft ?? Number.MAX_SAFE_INTEGER),
        sortable: true,
        className: PAD_LAST,
        headerClassName: PAD_LAST,
      },
    ],
    [t, f, multiStore, maxRevenue, totalRevenue],
  );

  return (
    <>
      <PageHeader
        icon={<ShoppingCart className="h-5 w-5" />}
        title={t('title')}
        description={t('subtitle')}
        badge={<PreviewBadge feature="stocks_fbo_fbs" />}
        meta={<DataFreshness />}
        actions={
          canExport ? (
            <Button
              variant="outline"
              icon={<Download className="h-4 w-4" />}
              loading={exporting}
              onClick={onExport}
            >
              {tc('btn.export')}
            </Button>
          ) : undefined
        }
      />

      <FilterBar>
        {/* Nom, SKU kodi, shtrix-kod, Uzum ID yoki havola — server umumiy qoida bilan qidiradi (shared search.ts) */}
        <SkuSearchInput value={searchInput} onChange={setSearchInput} className="w-full sm:w-72" />
      </FilterBar>

      <PlanGate feature="stocks_fbo_fbs">
        {isError ? (
          <Card>
            <ErrorState
              message={error instanceof Error ? error.message : tc('common.error')}
              onRetry={() => void refetch()}
              retryLabel={tc('btn.retry')}
            />
          </Card>
        ) : (
          <div className="space-y-5">
            {/*
              Ranglar ma'no bo'yicha: sotilgan dona va tushum (Uzum ulushi ham
              ichida) — neytral, qoldiq — ko'k, to'lovga — sariq (hali kelmagan
              pul), foyda — yashil. Ilgari tushum binafsha — Uzum ulushi
              rangida — turardi va "bu Uzumniki" deb o'qilardi.
            */}
            <StatGrid>
              <StatCard
                label={t('kpi.sold')}
                value={`${f.num(totals?.sold ?? 0)} ${t('unit')}`}
                hint={t('kpi.soldHint', { count: f.num(totals?.skuCount ?? 0) })}
                icon={<PackageCheck className="h-5 w-5" />}
                className={NEUTRAL_TONE}
                loading={isLoading}
              />
              <StatCard
                label={t('kpi.stock')}
                value={`${f.num(totals?.inStock ?? 0)} ${t('unit')}`}
                hint={t('kpi.stockHint')}
                icon={<Boxes className="h-5 w-5" />}
                tone="info"
                loading={isLoading}
              />
              <StatCard
                label={t('kpi.revenue')}
                value={f.money(totals?.revenue ?? 0)}
                icon={<Coins className="h-5 w-5" />}
                className={NEUTRAL_TONE}
                loading={isLoading}
              />
              {money ? (
                <>
                  <StatCard
                    label={t('kpi.payout')}
                    value={f.money(totals?.payout ?? 0)}
                    icon={<Wallet className="h-5 w-5" />}
                    tone="warn"
                    loading={isLoading}
                  />
                  <StatCard
                    label={t('kpi.profit')}
                    value={f.money(totals?.netProfit ?? 0)}
                    icon={<TrendingUp className="h-5 w-5" />}
                    tone={(totals?.netProfit ?? 0) < 0 ? 'danger' : 'brand'}
                    loading={isLoading}
                  />
                </>
              ) : null}
            </StatGrid>

            {/* Jadval to'liq kenglikda: holat tasmasi uning sarlavhasida, filtr vazifasini ham bajaradi */}
            <Card>
              <CardHeader
                icon={<Table2 />}
                title={t('table.title')}
                subtitle={t('table.hint')}
                actions={<Badge tone="muted">{f.num(data?.rows.total ?? 0)}</Badge>}
              />
              <div className="px-5 pt-4">
                <StatusStrip counts={statusCounts} value={segment} onChange={setSegment} />
              </div>
              <div className="mt-3">
                <DataTable
                  columns={money ? columns : columns.filter((c) => c.key !== 'payout' && c.key !== 'netProfit')}
                  rows={rows}
                  rowKey={(row) => row.skuId}
                  loading={isLoading}
                  density="compact"
                  stickyFirstColumn
                  empty={
                    <EmptyState
                      icon={<Inbox className="h-6 w-6" />}
                      title={t('table.empty')}
                      hint={t('table.emptyHint')}
                    />
                  }
                  pagination={{
                    page: data?.rows.page ?? 1,
                    pages: data?.rows.pages ?? 1,
                    total: data?.rows.total ?? 0,
                    pageSize: PAGE_SIZE,
                    onPage: setPage,
                  }}
                />
              </div>
            </Card>
          </div>
        )}
      </PlanGate>
    </>
  );
}
