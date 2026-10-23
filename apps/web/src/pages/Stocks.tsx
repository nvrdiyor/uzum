import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Boxes, Download, Gauge, HandCoins, Layers, PackageSearch, Tag, TrendingUp, Wallet } from '@/components/icons';
import type { StockRow, StocksResponse } from '@savdoiq/shared';
import {
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
  SearchInput,
  Segmented,
  SkeletonRows,
  StatCard,
  toast,
  type Column,
} from '@/components/ui';
import { ZeroAware } from '@/components/ui/ZeroAware';
import { BarsChart, CHART_COLORS } from '@/components/charts';
import { FilterBar } from '@/components/filters';
import { DataFreshness } from '@/components/trust/DataFreshness';
import { api } from '@/lib/api';
import { cn, downloadBlob } from '@/lib/utils';
import { useStores } from '@/store/session';
import { usePeriodQuery } from '@/store/ui';
import { registerNamespace, useFormat, useT } from '@/i18n';
import {
  NEUTRAL_TONE,
  STATE_COLOR,
  STOCK_STATES,
  SkuNameCell,
  StockStatusBadge,
  TONE_TEXT,
  daysTone,
  type StockState,
} from '@/components/stock/common';
import { StockHistoryDrawer } from '@/components/stock/StockHistoryDrawer';

registerNamespace('stocks', {
  uz: {
    title: 'Qoldiqlar',
    subtitle: 'FBO, FBS va o‘z omboringizdagi qoldiqlar hamda ular necha kunga yetishi',
    'kpi.units': 'Jami dona',
    'kpi.unitsHint': 'Barcha omborlardagi qoldiq',
    'kpi.cost': 'Tannarx bo‘yicha qiymat',
    'kpi.costHint': 'Omborda muzlagan kapital',
    'kpi.retail': 'Chakana qiymat',
    'kpi.retailHint': 'Joriy narxlarda, Uzum ushlab qolishidan oldin',
    'kpi.skus': 'SKU soni',
    'kpi.skusHint': 'Qoldiqli pozitsiyalar',
    'kpi.payout': 'Kutilayotgan tushum',
    'kpi.payoutHint': 'Hammasi joriy narxda sotilsa, Uzum komissiyasi va logistikasidan keyin sizga tushadi',
    'kpi.profit': 'Kutilayotgan foyda',
    'kpi.profitHint': 'Tushum − tannarx − soliq',
    'kpi.noCostUnits': '{n} dona tannarxsiz — foydaga kirmagan',
    'filter.all': 'Barchasi',
    'search.placeholder': 'Nomi yoki SKU bo‘yicha qidirish',
    'chart.byStatus': 'Holat bo‘yicha taqsimot',
    'chart.byStatusHint': 'Qatorni bosing — jadval shu holat bo‘yicha filtrlanadi',
    'chart.frozen': 'Ortiqcha va harakatsiz qoldiqda',
    'chart.frozenHint': 'Tannarx bo‘yicha — sotilmay turgan pul',
    'status.skus': '{n} SKU',
    'status.units': '{n} dona',
    'chart.topCost': 'Qiymat bo‘yicha eng katta 10 SKU',
    'chart.topCostHint': 'Omborda eng ko‘p pul turgan pozitsiyalar',
    'table.title': 'Qoldiqlar jadvali',
    'table.hint': 'Batafsil ko‘rish uchun qatorga bosing',
    'col.product': 'Mahsulot',
    'col.store': 'Do‘kon',
    'col.stock': 'Qoldiq',
    'col.fbo': 'FBO',
    'col.fbs': 'FBS',
    'col.own': 'O‘z ombori',
    'col.ownSub': 'O‘z ombori {n}',
    'col.reserved': 'Band',
    'col.inTransit': 'Yo‘lda',
    'col.total': 'Jami',
    'col.costValue': 'Tannarx qiymati',
    'col.payoutValue': 'Kutilayotgan tushum',
    'payout.unit': '1 donadan: {v}',
    'payout.estimate': '1 donadan ≈ {v} — bu SKU hali sotilmagan, komissiya va logistika taxminiy',
    'col.avgDaily': 'Kunlik sotuv',
    'col.daysLeft': 'Yetadi',
    'col.status': 'Holat · yetadi',
    'days': '{n} kun',
    'perDay': '{n}/kun',
    'noSales': 'Sotuv yo‘q',
    'empty.title': 'Qoldiqlar topilmadi',
    'empty.hint': 'Tanlangan filtr bo‘yicha pozitsiya yo‘q — filtrni o‘zgartirib ko‘ring',
    'export.done': 'Excel fayl tayyor',
    'export.error': 'Eksport qilishda xatolik',
  },
  ru: {
    title: 'Остатки',
    subtitle: 'Остатки на FBO, FBS и своём складе и на сколько дней их хватит',
    'kpi.units': 'Всего штук',
    'kpi.unitsHint': 'Остаток по всем складам',
    'kpi.cost': 'Стоимость по себестоимости',
    'kpi.costHint': 'Замороженный на складе капитал',
    'kpi.retail': 'Розничная стоимость',
    'kpi.retailHint': 'По текущим ценам, до удержаний Uzum',
    'kpi.skus': 'Количество SKU',
    'kpi.skusHint': 'Позиции с остатком',
    'kpi.payout': 'Ожидаемая выручка',
    'kpi.payoutHint': 'Если всё продать по текущей цене — придёт вам после комиссии и логистики Uzum',
    'kpi.profit': 'Ожидаемая прибыль',
    'kpi.profitHint': 'Выручка − себестоимость − налог',
    'kpi.noCostUnits': '{n} шт. без себестоимости — не учтены в прибыли',
    'filter.all': 'Все',
    'search.placeholder': 'Поиск по названию или SKU',
    'chart.byStatus': 'Распределение по статусам',
    'chart.byStatusHint': 'Нажмите на строку — таблица отфильтруется по статусу',
    'chart.frozen': 'В избытке и неликвиде',
    'chart.frozenHint': 'По себестоимости — деньги, которые не продаются',
    'status.skus': '{n} SKU',
    'status.units': '{n} шт.',
    'chart.topCost': 'Топ-10 SKU по стоимости',
    'chart.topCostHint': 'Позиции, в которых заморожено больше всего денег',
    'table.title': 'Таблица остатков',
    'table.hint': 'Нажмите на строку, чтобы увидеть детали',
    'col.product': 'Товар',
    'col.store': 'Магазин',
    'col.stock': 'Остаток',
    'col.fbo': 'FBO',
    'col.fbs': 'FBS',
    'col.own': 'Свой склад',
    'col.ownSub': 'Свой склад {n}',
    'col.reserved': 'Резерв',
    'col.inTransit': 'В пути',
    'col.total': 'Всего',
    'col.costValue': 'Себестоимость',
    'col.payoutValue': 'Ожидаемая выручка',
    'payout.unit': 'за 1 шт.: {v}',
    'payout.estimate': 'за 1 шт. ≈ {v} — SKU ещё не продавался, комиссия и логистика оценочные',
    'col.avgDaily': 'Продаж в день',
    'col.daysLeft': 'Хватит на',
    'col.status': 'Статус · хватит',
    'days': '{n} дн.',
    'perDay': '{n}/дн.',
    'noSales': 'Нет продаж',
    'empty.title': 'Остатки не найдены',
    'empty.hint': 'По выбранному фильтру позиций нет — попробуйте изменить фильтр',
    'export.done': 'Файл Excel готов',
    'export.error': 'Ошибка при экспорте',
  },
  en: {
    title: 'Stock levels',
    subtitle: 'Stock across FBO, FBS and your own warehouse, and how long it lasts',
    'kpi.units': 'Total units',
    'kpi.unitsHint': 'Stock across all warehouses',
    'kpi.cost': 'Cost value',
    'kpi.costHint': 'Capital frozen in the warehouse',
    'kpi.retail': 'Retail value',
    'kpi.retailHint': 'At current prices, before Uzum deductions',
    'kpi.skus': 'SKU count',
    'kpi.skusHint': 'Positions with stock',
    'kpi.payout': 'Expected payout',
    'kpi.payoutHint': 'If everything sells at the current price — what you receive after Uzum commission and logistics',
    'kpi.profit': 'Expected profit',
    'kpi.profitHint': 'Payout − cost − tax',
    'kpi.noCostUnits': '{n} units without cost price — not in profit',
    'filter.all': 'All',
    'search.placeholder': 'Search by name or SKU',
    'chart.byStatus': 'Distribution by status',
    'chart.byStatusHint': 'Click a row — the table filters to that status',
    'chart.frozen': 'Tied up in excess and dead stock',
    'chart.frozenHint': 'At cost — money that is not selling',
    'status.skus': '{n} SKUs',
    'status.units': '{n} pcs',
    'chart.topCost': 'Top 10 SKUs by value',
    'chart.topCostHint': 'Positions holding the most money',
    'table.title': 'Stock table',
    'table.hint': 'Click a row to see the details',
    'col.product': 'Product',
    'col.store': 'Store',
    'col.stock': 'Stock',
    'col.fbo': 'FBO',
    'col.fbs': 'FBS',
    'col.own': 'Own',
    'col.ownSub': 'Own warehouse {n}',
    'col.reserved': 'Reserved',
    'col.inTransit': 'In transit',
    'col.total': 'Total',
    'col.costValue': 'Cost value',
    'col.payoutValue': 'Expected payout',
    'payout.unit': 'per unit: {v}',
    'payout.estimate': 'per unit ≈ {v} — this SKU has not sold yet, commission and logistics are estimated',
    'col.avgDaily': 'Daily sales',
    'col.daysLeft': 'Cover',
    'col.status': 'Status · lasts',
    'days': '{n} days',
    'perDay': '{n}/day',
    'noSales': 'No sales',
    'empty.title': 'No stock found',
    'empty.hint': 'Nothing matches the current filter — try changing it',
    'export.done': 'Excel file is ready',
    'export.error': 'Export failed',
  },
});

type StatusFilter = 'all' | StockState;

const PAGE_SIZE = 25;

/*
 * Kataklar orasi 20 px (DataTable'ning px-5 o'rniga) — Sotuv va qoldiq
 * jadvalidagi kabi. Ilgari 13 ta ustun bor edi va 1366 px'da "Yetadi" va
 * "Holat" umuman ko'rinmasdi: ular gorizontal aylantirish ortida qolardi.
 */
const PAD = 'pl-2.5 pr-2.5';
const PAD_FIRST = 'pr-2.5';
const PAD_LAST = 'pl-2.5';

/** "Gilam 160x230 … — Bej" → nom va variant: reytingda variant hech qachon kesilmaydi */
function splitVariant(title: string, sku: string): { name: string; sub: string } {
  const i = title.lastIndexOf(' — ');
  return i > 0 ? { name: title.slice(0, i), sub: title.slice(i + 3) } : { name: title, sub: sku };
}

export default function Stocks() {
  const t = useT('stocks');
  const tc = useT('common');
  const f = useFormat();
  const q = usePeriodQuery();
  const stores = useStores();
  // Do'kon nomi alohida ustun emas: faqat bir nechta do'kon aralash ko'rinsa, SKU yonida
  const multiStore = !q.storeId && stores.length > 1;

  const [status, setStatus] = useState<StatusFilter>('all');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [active, setActive] = useState<StockRow | null>(null);
  const [exporting, setExporting] = useState(false);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['stocks', q],
    queryFn: () => api.get<StocksResponse>('/stocks', { ...q, page: 1, pageSize: 500 }),
  });

  const allRows = useMemo<StockRow[]>(() => data?.rows?.items ?? [], [data]);

  const searched = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return allRows;
    return allRows.filter((r) => r.title.toLowerCase().includes(s) || r.sku.toLowerCase().includes(s));
  }, [allRows, search]);

  const counts = useMemo(() => {
    const map: Record<StatusFilter, number> = { all: searched.length, critical: 0, low: 0, ok: 0, excess: 0, dead: 0 };
    searched.forEach((r) => {
      map[r.status] += 1;
    });
    return map;
  }, [searched]);

  const filtered = useMemo(
    () => (status === 'all' ? searched : searched.filter((r) => r.status === status)),
    [searched, status],
  );

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pages);
  const pageRows = useMemo(
    () => filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE),
    [filtered, safePage],
  );

  /** Holatlar kesimi: SKU soni, dona va tannarx qiymati (ilgari halqa faqat donani ko'rsatardi) */
  const byStatus = useMemo(
    () =>
      STOCK_STATES.map((s) => {
        const list = searched.filter((r) => r.status === s);
        return {
          status: s,
          skus: list.length,
          units: list.reduce((sum, r) => sum + r.total, 0),
          value: list.reduce((sum, r) => sum + r.costValue, 0),
        };
      }),
    [searched],
  );

  /*
   * Nom va variant alohida: ilgari nom 22 belgidan kesilardi va "Sport
   * krossovka Runne…" to'rt marta takrorlanib, qaysi o'lcham ekani
   * ko'rinmasdi. Endi variant (yoki SKU) nom yonida to'liq turadi.
   */
  const topCost = useMemo(
    () =>
      [...searched]
        .sort((a, b) => b.costValue - a.costValue)
        .slice(0, 10)
        .map((r) => ({ ...splitVariant(r.title, r.sku), value: r.costValue })),
    [searched],
  );

  const visibleTotals = useMemo(
    () =>
      filtered.reduce(
        (acc, r) => {
          acc.total += r.total;
          acc.costValue += r.costValue;
          acc.payoutValue += r.payoutValue;
          return acc;
        },
        { total: 0, costValue: 0, payoutValue: 0 },
      ),
    [filtered],
  );

  const totals = data?.totals;

  async function handleExport() {
    setExporting(true);
    try {
      const blob = await api.blob('/export/stocks', { ...q, status: status === 'all' ? undefined : status });
      downloadBlob(blob, `stocks-${q.from}-${q.to}.xlsx`);
      toast.success(t('export.done'));
    } catch {
      toast.error(t('export.error'));
    } finally {
      setExporting(false);
    }
  }

  /*
   * Ustunlar 1366 px'ga sig'adi: do'kon — SKU ostida (faqat bir nechta do'kon
   * bo'lsa), FBO/FBS/o'z ombori — "Qoldiq" ichida izoh qatorlarida, kunlik
   * sur'at va "yetadi" — holat ustunida. Ma'lumotning birortasi tushib qolmadi.
   */
  const columns: Column<StockRow>[] = [
    {
      key: 'product',
      header: t('col.product'),
      render: (r) => (
        <SkuNameCell
          className="md:min-w-[13rem] md:max-w-[18rem] 2xl:max-w-[26rem]"
          title={r.title}
          subtitle={multiStore ? `${r.sku} · ${r.storeTitle}` : r.sku}
          imageUrl={r.imageUrl}
        />
      ),
      sortable: true,
      sortValue: (r) => r.title,
      className: PAD_FIRST,
      headerClassName: PAD_FIRST,
    },
    {
      key: 'total',
      header: t('col.stock'),
      align: 'right',
      sortable: true,
      sortValue: (r) => r.total,
      render: (r) => (
        <div className="leading-tight">
          <span className={cn('font-semibold', r.total > 0 ? 'text-ink' : 'text-danger')}>{f.num(r.total)}</span>
          <p className="tnum text-2xs text-muted">
            FBO {f.num(r.fbo)} · FBS {f.num(r.fbs)}
          </p>
          {r.own > 0 ? <p className="tnum text-2xs text-muted">{t('col.ownSub', { n: f.num(r.own) })}</p> : null}
        </div>
      ),
      className: PAD,
      headerClassName: PAD,
    },
    {
      key: 'reserved',
      header: t('col.reserved'),
      align: 'right',
      hideOnMobile: true,
      sortable: true,
      sortValue: (r) => r.reserved,
      render: (r) => <ZeroAware value={r.reserved} tone="text-ink-soft" text={f.num(r.reserved)} />,
      className: PAD,
      headerClassName: PAD,
    },
    {
      key: 'inTransit',
      header: t('col.inTransit'),
      align: 'right',
      hideOnMobile: true,
      sortable: true,
      sortValue: (r) => r.inTransit,
      render: (r) => <ZeroAware value={r.inTransit} tone="text-info-ink font-semibold" text={f.num(r.inTransit)} />,
      className: PAD,
      headerClassName: PAD,
    },
    {
      key: 'costValue',
      header: t('col.costValue'),
      align: 'right',
      hideOnMobile: true,
      // Telefondagi kartada ham ko'rinsin
      mobile: 'field',
      sortable: true,
      sortValue: (r) => r.costValue,
      render: (r) => <span className="text-ink-soft">{f.money(r.costValue)}</span>,
      className: PAD,
      headerClassName: PAD,
    },
    {
      key: 'payoutValue',
      header: t('col.payoutValue'),
      align: 'right',
      hideOnMobile: true,
      mobile: 'field',
      sortable: true,
      sortValue: (r) => r.payoutValue,
      render: (r) => (
        <span
          className={r.total > 0 ? 'tnum font-medium text-ink' : 'tnum text-muted'}
          title={
            r.payoutPerUnit > 0
              ? t(r.payoutSource === 'estimate' ? 'payout.estimate' : 'payout.unit', { v: f.money(r.payoutPerUnit) })
              : undefined
          }
        >
          {f.money(r.payoutValue)}
        </span>
      ),
      className: PAD,
      headerClassName: PAD,
    },
    {
      // Holat aynan "necha kunga yetadi"dan kelib chiqadi — bitta ustunda, sur'at bilan
      key: 'status',
      header: t('col.status'),
      align: 'right',
      sortable: true,
      // Kamayish tartibida (birinchi bosish) eng shoshilinchi tepada, "Sotuv yo'q" pastda
      sortValue: (r) => -(r.daysLeft ?? Number.MAX_SAFE_INTEGER),
      render: (r) => (
        <div className="text-right leading-tight">
          <StockStatusBadge status={r.status} />
          <p className="tnum mt-1 text-2xs" title={t('col.avgDaily')}>
            <span className={cn('font-semibold', TONE_TEXT[daysTone(r.daysLeft)])}>
              {r.daysLeft === null ? t('noSales') : t('days', { n: r.daysLeft > 999 ? '999+' : f.num(r.daysLeft) })}
            </span>
            {r.avgDaily > 0 ? <span className="text-muted"> · {t('perDay', { n: f.num(r.avgDaily, 1) })}</span> : null}
          </p>
        </div>
      ),
      className: PAD_LAST,
      headerClassName: PAD_LAST,
    },
  ];

  return (
    <>
      <PageHeader
        icon={<Layers className="h-5 w-5" />}
        tone="info"
        title={t('title')}
        description={t('subtitle')}
        badge={<PreviewBadge feature="stocks_fbo_fbs" />}
        meta={<DataFreshness />}
        actions={
          <Button variant="outline" icon={<Download className="h-4 w-4" />} loading={exporting} onClick={handleExport}>
            {tc('btn.export')}
          </Button>
        }
      />

      <FilterBar />

      <PlanGate feature="stocks_fbo_fbs">
        <div className="space-y-5">
          {/*
            Tartib savol ketma-ketligida: qancha tovar (dona, SKU) → u qanchaga
            tushgan (tannarx) va qanchaga baholanadi (chakana) → qo'lga qancha
            keladi (kutilayotgan tushum — sariq: hali kelmagan pul) → qancha
            foyda qoladi (brend). Ilgari tannarx va foyda binafsha — Uzum
            ulushi rangida — edi, SKU soni esa ogohlantirish sarig'ida turardi.
          */}
          <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
            <StatCard
              label={t('kpi.units')}
              value={isLoading ? '—' : f.num(totals?.units ?? 0)}
              hint={t('kpi.unitsHint')}
              icon={<Boxes className="h-5 w-5" />}
              tone="info"
              loading={isLoading}
            />
            <StatCard
              label={t('kpi.skus')}
              value={isLoading ? '—' : f.num(totals?.skuCount ?? 0)}
              hint={t('kpi.skusHint')}
              icon={<PackageSearch className="h-5 w-5" />}
              className={NEUTRAL_TONE}
              loading={isLoading}
            />
            <StatCard
              label={t('kpi.cost')}
              value={isLoading ? '—' : f.money(totals?.costValue ?? 0)}
              hint={t('kpi.costHint')}
              icon={<Wallet className="h-5 w-5" />}
              className={NEUTRAL_TONE}
              loading={isLoading}
            />
            <StatCard
              label={t('kpi.retail')}
              value={isLoading ? '—' : f.money(totals?.retailValue ?? 0)}
              hint={t('kpi.retailHint')}
              icon={<Tag className="h-5 w-5" />}
              className={NEUTRAL_TONE}
              loading={isLoading}
            />
            <StatCard
              label={t('kpi.payout')}
              value={isLoading ? '—' : f.money(totals?.payoutValue ?? 0)}
              hint={t('kpi.payoutHint')}
              icon={<HandCoins className="h-5 w-5" />}
              tone="warn"
              loading={isLoading}
            />
            <StatCard
              label={t('kpi.profit')}
              value={isLoading ? '—' : f.money(totals?.profitValue ?? 0)}
              hint={
                (totals?.unitsNoCost ?? 0) > 0
                  ? t('kpi.noCostUnits', { n: f.num(totals?.unitsNoCost ?? 0) })
                  : t('kpi.profitHint')
              }
              icon={<TrendingUp className="h-5 w-5" />}
              tone={(totals?.profitValue ?? 0) < 0 ? 'danger' : 'brand'}
              loading={isLoading}
            />
          </div>

          {isError ? (
            <Card>
              <ErrorState
                message={error instanceof Error ? error.message : undefined}
                onRetry={() => void refetch()}
                retryLabel={tc('btn.retry')}
              />
            </Card>
          ) : (
            <>
              <div className="grid gap-4 xl:grid-cols-2">
                {/*
                  Halqa o'rniga holatlar ro'yxati: halqa faqat donalar ulushini
                  ko'rsatib, kartochkaning yarmi bo'sh turardi. Endi har holat
                  uchun SKU, dona va pul; qator bosilsa jadval filtrlanadi.
                */}
                <Card>
                  <CardHeader
                    icon={<Gauge />}
                    tone="info"
                    title={t('chart.byStatus')}
                    subtitle={t('chart.byStatusHint')}
                  />
                  <CardBody>
                    {isLoading ? (
                      <SkeletonRows rows={5} />
                    ) : searched.length === 0 ? (
                      <EmptyState icon={<Boxes className="h-6 w-6" />} title={tc('common.noData')} />
                    ) : (
                      <StatusBreakdown
                        stats={byStatus}
                        value={status}
                        onSelect={(next) => {
                          setStatus(next);
                          setPage(1);
                        }}
                      />
                    )}
                  </CardBody>
                </Card>

                <Card>
                  <CardHeader
                    icon={<Wallet />}
                    tone="muted"
                    title={t('chart.topCost')}
                    subtitle={t('chart.topCostHint')}
                  />
                  <CardBody>
                    {isLoading ? (
                      <SkeletonRows rows={5} />
                    ) : topCost.length === 0 ? (
                      <EmptyState icon={<Wallet className="h-6 w-6" />} title={tc('common.noData')} />
                    ) : (
                      <BarsChart
                        data={topCost}
                        xKey="name"
                        horizontal
                        height={280}
                        // Qoldiq qiymati — ombor rangi (ko'k); binafsha faqat Uzum ulushi uchun
                        series={[{ key: 'value', name: t('col.costValue'), money: true, color: CHART_COLORS.info }]}
                      />
                    )}
                  </CardBody>
                </Card>
              </div>

              <Card>
                <CardHeader
                  title={t('table.title')}
                  subtitle={t('table.hint')}
                  actions={
                    <SearchInput
                      value={search}
                      onChange={(v) => {
                        setSearch(v);
                        setPage(1);
                      }}
                      placeholder={t('search.placeholder')}
                      className="w-full sm:w-72"
                    />
                  }
                />

                <div className="px-5 pt-4">
                  {/* Holat rangi nuqtada — jadvaldagi nishon va yuqoridagi taqsimot bilan bir xil */}
                  <Segmented<StatusFilter>
                    value={status}
                    onChange={(v) => {
                      setStatus(v);
                      setPage(1);
                    }}
                    size="sm"
                    options={[
                      { value: 'all', label: t('filter.all'), count: counts.all },
                      ...STOCK_STATES.map((s) => ({
                        value: s as StatusFilter,
                        label: (
                          <span className="inline-flex items-center gap-1.5">
                            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: STATE_COLOR[s] }} />
                            {tc(`status.${s}`)}
                          </span>
                        ),
                        count: counts[s],
                      })),
                    ]}
                  />
                </div>

                <div className="mt-3">
                  <DataTable<StockRow>
                    columns={columns}
                    rows={pageRows}
                    rowKey={(r) => r.skuId}
                    loading={isLoading}
                    onRowClick={(r) => setActive(r)}
                    density="compact"
                    stickyFirstColumn
                    empty={
                      <EmptyState
                        icon={<PackageSearch className="h-6 w-6" />}
                        title={t('empty.title')}
                        hint={t('empty.hint')}
                      />
                    }
                    pagination={{
                      page: safePage,
                      pages,
                      total: filtered.length,
                      pageSize: PAGE_SIZE,
                      onPage: setPage,
                    }}
                    footer={
                      <>
                        <td className="py-3 pl-5 pr-2.5 text-sm">{tc('common.total')}</td>
                        <td className="tnum px-2.5 py-3 text-right">{f.num(visibleTotals.total)}</td>
                        <td className="hidden px-2.5 py-3 md:table-cell" />
                        <td className="hidden px-2.5 py-3 md:table-cell" />
                        <td className="tnum hidden px-2.5 py-3 text-right md:table-cell">
                          {f.money(visibleTotals.costValue)}
                        </td>
                        <td className="tnum hidden px-2.5 py-3 text-right md:table-cell">
                          {f.money(visibleTotals.payoutValue)}
                        </td>
                        <td className="py-3 pl-2.5 pr-5" />
                      </>
                    }
                  />
                </div>
              </Card>
            </>
          )}
        </div>
      </PlanGate>

      <StockHistoryDrawer row={active} onClose={() => setActive(null)} />
    </>
  );
}

interface StatusStat {
  status: StockState;
  skus: number;
  units: number;
  value: number;
}

/**
 * Holatlar taqsimoti: donalar bo'yicha 100% tasma, ostida har holat — SKU,
 * dona va tannarx qiymati. Qator bosilsa jadval o'sha holatga filtrlanadi
 * (qayta bosilsa — Barchasi). Pastda ortiqcha va harakatsiz qoldiqda turgan
 * pul — sotuvchi uchun eng amaliy xulosa.
 */
function StatusBreakdown({
  stats,
  value,
  onSelect,
}: {
  stats: StatusStat[];
  value: StatusFilter;
  onSelect: (next: StatusFilter) => void;
}) {
  const t = useT('stocks');
  const tc = useT('common');
  const f = useFormat();
  const totalUnits = stats.reduce((s, x) => s + x.units, 0);
  const frozen = stats.filter((x) => x.status === 'excess' || x.status === 'dead').reduce((s, x) => s + x.value, 0);

  return (
    <div>
      <div className="flex h-2.5 w-full gap-0.5 overflow-hidden rounded-full bg-surface-3" aria-hidden>
        {totalUnits > 0
          ? stats
              .filter((x) => x.units > 0)
              .map((x) => (
                <span
                  key={x.status}
                  className={cn(
                    'h-full min-w-1.5 transition-opacity duration-150',
                    value !== 'all' && value !== x.status && 'opacity-30',
                  )}
                  style={{ flex: `${x.units} 1 0%`, backgroundColor: STATE_COLOR[x.status] }}
                />
              ))
          : null}
      </div>

      <ul className="mt-3 space-y-0.5">
        {stats.map((x) => {
          const active = value === x.status;
          return (
            <li key={x.status}>
              <button
                type="button"
                disabled={x.skus === 0}
                onClick={() => onSelect(active ? 'all' : x.status)}
                aria-pressed={active}
                className={cn(
                  'focusable grid w-full grid-cols-[minmax(0,1fr)_auto_5.5rem_6.5rem] items-center gap-3 rounded-xl px-3 py-2 text-left transition-colors',
                  active ? 'bg-surface-2 shadow-[inset_0_0_0_1px_rgb(var(--c-border-strong))]' : 'hover:bg-surface-2/70',
                  x.skus === 0 && 'cursor-default opacity-50 hover:bg-transparent',
                )}
              >
                <span className="flex min-w-0 items-center gap-2.5">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: STATE_COLOR[x.status] }} />
                  <span className="truncate text-sm font-medium text-ink">{tc(`status.${x.status}`)}</span>
                </span>
                <span className="tnum text-xs text-muted">{t('status.skus', { n: f.num(x.skus) })}</span>
                <span className="tnum text-right text-sm font-semibold text-ink">
                  {t('status.units', { n: f.num(x.units) })}
                </span>
                <span className="tnum text-right text-xs text-muted" title={f.money(x.value)}>
                  {f.compact(x.value)}
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      {frozen > 0 ? (
        <div className="well mt-3 flex items-center justify-between gap-3 px-3.5 py-2.5">
          <span className="min-w-0">
            <span className="block truncate text-xs font-medium text-ink-soft">{t('chart.frozen')}</span>
            <span className="block truncate text-2xs text-muted">{t('chart.frozenHint')}</span>
          </span>
          <span className="tnum shrink-0 font-display text-base font-bold text-info-ink" title={f.money(frozen)}>
            {f.compact(frozen)}
          </span>
        </div>
      ) : null}
    </div>
  );
}
