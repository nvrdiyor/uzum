import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Archive,
  CalendarOff,
  Download,
  Eye,
  Hourglass,
  Lightbulb,
  Megaphone,
  PackageX,
  Percent,
  Snowflake,
  Table2,
} from '@/components/icons';
import type { IlliquidResponse, IlliquidRow } from '@savdoiq/shared';
import { api } from '@/lib/api';
import { usePeriodQuery } from '@/store/ui';
import { registerNamespace, useFormat, useT } from '@/i18n';
import { cn, downloadBlob } from '@/lib/utils';
import { useCanFetch, useSeesMoney } from '@/lib/view';
import { FilterBar } from '@/components/filters';
import { BarsChart, ChartCard, DonutChart, CHART_COLORS } from '@/components/charts';
import { SkuSearchInput } from '@/components/products/SkuSearchInput';
import { useDebounced } from '@/components/sales/useDebounced';
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
  Skeleton,
  StatCard,
  StatGrid,
  toast,
  type Column,
  type Tone,
} from '@/components/ui';
import { ZeroAware } from '@/components/ui/ZeroAware';
import { BurnCard } from '@/components/analysis/BurnCard';
import { NEUTRAL_TONE, STORAGE_TONE, SkuNameCell } from '@/components/stock/common';
import { DataFreshness } from '@/components/trust/DataFreshness';

registerNamespace('illiquid', {
  uz: {
    title: 'Nolikvidlar',
    subtitle: 'Sotilmayotgan tovarlar qancha pulingizni muzlatib turibdi',
    'kpi.frozen': 'Muzlagan kapital',
    'kpi.frozenHint': 'Sotilmayotgan qoldiqqa kirgan pul',
    'kpi.units': 'Harakatsiz dona',
    'kpi.skus': 'Nolikvid SKU',
    'kpi.storage': 'Oylik saqlash',
    'kpi.storageHint': 'Shu tovarlar uchun ombor to‘lovi',
    'burn.title': 'Har kuni yo‘qotayotgan pulingiz',
    'burn.hint':
      'Bu summa har kuni faqat sotilmayotgan tovarlarni omborda ushlab turish uchun ketadi. Chegirma yoki chiqarib olish — har kun kechikkani sari qimmatroq.',
    'burn.month': 'Oyiga',
    'burn.year': 'Yiliga',
    'burn.footer': 'Hisob ko‘rsatilgan {n} ta SKU bo‘yicha',
    'filter.30': '30+ kun',
    'filter.60': '60+ kun',
    'filter.90': '90+ kun',
    'filter.all': 'Barchasi',
    'chart.buckets': 'Muzlagan kapital — sotuvsiz kunlar bo‘yicha',
    'chart.bucketsSub': 'Qancha uzoq turgan bo‘lsa, qaytarish shunchalik qiyin',
    'chart.reco': 'Tavsiyalar taqsimoti',
    'chart.recoSub': 'Muzlagan kapital ulushi bo‘yicha',
    'bucket.30': '30–60 kun',
    'bucket.60': '60–90 kun',
    'bucket.90': '90–180 kun',
    'bucket.180': '180+ kun',
    'col.product': 'Mahsulot',
    'col.stock': 'Qoldiq',
    'col.stockValue': 'Qoldiq qiymati',
    'col.days': 'Sotuvsiz',
    'col.lastSale': 'Oxirgi sotuv',
    'col.storage': 'Oylik saqlash',
    'col.frozen': 'Muzlagan kapital',
    'col.reco': 'Tavsiya',
    'reco.discount': 'Chegirma',
    'reco.promo': 'Aksiya',
    'reco.withdraw': 'Chiqarib olish',
    'reco.watch': 'Kuzatish',
    'reco.discount.hint': 'Narxni 10–20% tushiring — oqim tiklanadi',
    'reco.promo.hint': 'Aksiya yoki to‘plamga qo‘shing, reklama bering',
    'reco.withdraw.hint': 'Ombordan olib chiqing — saqlash foydani yeb qo‘yadi',
    'reco.watch.hint': 'Hozircha kuzating, keskin qadam shart emas',
    'table.title': 'Harakatsiz tovarlar',
    'table.found': '{n} ta SKU',
    'never.sold': 'Sotilmagan',
    export: 'Excel',
    'export.error': 'Faylni yuklab bo‘lmadi',
    'empty.title': 'Nolikvid topilmadi',
    'empty.hint': 'Ajoyib — barcha tovarlaringiz aylanmoqda',
    'empty.filtered': 'Bu filtr bo‘yicha SKU yo‘q',
  },
  ru: {
    title: 'Неликвиды',
    subtitle: 'Сколько денег заморожено в товарах, которые не продаются',
    'kpi.frozen': 'Замороженный капитал',
    'kpi.frozenHint': 'Деньги в непродающихся остатках',
    'kpi.units': 'Штук без движения',
    'kpi.skus': 'Неликвидных SKU',
    'kpi.storage': 'Хранение в месяц',
    'kpi.storageHint': 'Плата за склад по этим товарам',
    'burn.title': 'Вы теряете каждый день',
    'burn.hint':
      'Эта сумма уходит ежедневно только на то, чтобы держать непродающийся товар на складе. Скидка или вывоз — каждый день промедления дороже.',
    'burn.month': 'В месяц',
    'burn.year': 'В год',
    'burn.footer': 'Расчёт по показанным {n} SKU',
    'filter.30': '30+ дней',
    'filter.60': '60+ дней',
    'filter.90': '90+ дней',
    'filter.all': 'Все',
    'chart.buckets': 'Замороженный капитал по дням без продаж',
    'chart.bucketsSub': 'Чем дольше лежит, тем труднее вернуть деньги',
    'chart.reco': 'Распределение рекомендаций',
    'chart.recoSub': 'По доле замороженного капитала',
    'bucket.30': '30–60 дней',
    'bucket.60': '60–90 дней',
    'bucket.90': '90–180 дней',
    'bucket.180': '180+ дней',
    'col.product': 'Товар',
    'col.stock': 'Остаток',
    'col.stockValue': 'Стоимость остатка',
    'col.days': 'Без продаж',
    'col.lastSale': 'Последняя продажа',
    'col.storage': 'Хранение/мес',
    'col.frozen': 'Заморожено',
    'col.reco': 'Рекомендация',
    'reco.discount': 'Скидка',
    'reco.promo': 'Акция',
    'reco.withdraw': 'Вывезти',
    'reco.watch': 'Наблюдать',
    'reco.discount.hint': 'Снизьте цену на 10–20% — поток восстановится',
    'reco.promo.hint': 'Добавьте в акцию или набор, включите рекламу',
    'reco.withdraw.hint': 'Заберите со склада — хранение съедает прибыль',
    'reco.watch.hint': 'Пока наблюдайте, резких шагов не нужно',
    'table.title': 'Товары без движения',
    'table.found': '{n} SKU',
    'never.sold': 'Не продавался',
    export: 'Excel',
    'export.error': 'Не удалось скачать файл',
    'empty.title': 'Неликвидов нет',
    'empty.hint': 'Отлично — весь товар оборачивается',
    'empty.filtered': 'По этому фильтру SKU нет',
  },
  en: {
    title: 'Dead stock',
    subtitle: 'How much money is frozen in products that are not selling',
    'kpi.frozen': 'Frozen capital',
    'kpi.frozenHint': 'Money locked in non-moving stock',
    'kpi.units': 'Units without movement',
    'kpi.skus': 'Dead-stock SKUs',
    'kpi.storage': 'Storage per month',
    'kpi.storageHint': 'Warehouse fee for these items',
    'burn.title': 'You lose this every day',
    'burn.hint':
      'This is what it costs daily just to keep non-selling stock in the warehouse. A discount or a withdrawal gets more expensive with every day you wait.',
    'burn.month': 'Per month',
    'burn.year': 'Per year',
    'burn.footer': 'Calculated across the {n} SKUs shown',
    'filter.30': '30+ days',
    'filter.60': '60+ days',
    'filter.90': '90+ days',
    'filter.all': 'All',
    'chart.buckets': 'Frozen capital by days without a sale',
    'chart.bucketsSub': 'The longer it sits, the harder the money is to recover',
    'chart.reco': 'Recommendation split',
    'chart.recoSub': 'By share of frozen capital',
    'bucket.30': '30–60 days',
    'bucket.60': '60–90 days',
    'bucket.90': '90–180 days',
    'bucket.180': '180+ days',
    'col.product': 'Product',
    'col.stock': 'Stock',
    'col.stockValue': 'Stock value',
    'col.days': 'No sales for',
    'col.lastSale': 'Last sale',
    'col.storage': 'Storage/mo',
    'col.frozen': 'Frozen',
    'col.reco': 'Recommendation',
    'reco.discount': 'Discount',
    'reco.promo': 'Promotion',
    'reco.withdraw': 'Withdraw',
    'reco.watch': 'Watch',
    'reco.discount.hint': 'Cut the price by 10–20% to restart the flow',
    'reco.promo.hint': 'Add to a promo or bundle and run ads',
    'reco.withdraw.hint': 'Pull it from the warehouse — storage eats the profit',
    'reco.watch.hint': 'Keep an eye on it, no drastic move needed yet',
    'table.title': 'Non-moving products',
    'table.found': '{n} SKUs',
    'never.sold': 'Never sold',
    export: 'Excel',
    'export.error': 'Could not download the file',
    'empty.title': 'No dead stock',
    'empty.hint': 'Great — everything in your catalogue is turning over',
    'empty.filtered': 'No SKUs match this filter',
  },
});

type DaysFilter = '30' | '60' | '90';

const RECO_TONE: Record<IlliquidRow['recommendation'], Tone> = {
  discount: 'warn',
  promo: 'info',
  withdraw: 'danger',
  watch: 'muted',
};

const RECO_ICON = {
  discount: Percent,
  promo: Megaphone,
  withdraw: PackageX,
  watch: Eye,
} as const;

const RECO_COLOR: Record<IlliquidRow['recommendation'], string> = {
  discount: CHART_COLORS.warn,
  promo: CHART_COLORS.info,
  withdraw: CHART_COLORS.danger,
  watch: CHART_COLORS.slate,
};

const PAGE_SIZE = 25;

/* Kataklar orasi 20 px — olti ustunli jadval 1366 px'da aylantirishsiz sig'adi */
const PAD = 'pl-2.5 pr-2.5';
const PAD_FIRST = 'pr-2.5';
const PAD_LAST = 'pl-2.5';

function daysTone(days: number): string {
  if (days >= 90) return 'text-danger';
  if (days >= 60) return 'text-warn-ink';
  return 'text-ink-soft';
}

export default function Illiquid() {
  const t = useT('illiquid');
  const f = useFormat();
  const q = usePeriodQuery();

  const [days, setDays] = useState<DaysFilter>('30');
  const [search, setSearch] = useState('');
  const debounced = useDebounced(search.trim(), 350);
  const [page, setPage] = useState(1);
  const [exporting, setExporting] = useState(false);
  // Excel'da tannarx qiymati bor — pulsiz ko'rinish shablonida (Omborchi) tugma yo'q (server ham 403)
  const canExport = useCanFetch('/export/illiquid');
  /*
   * Pulsiz shablonda muzlagan kapital va qoldiq qiymati null (tannarx bo'yicha):
   * kartalar va grafiklar SKU soni bo'yicha chiziladi, pul ustunlari yo'q.
   * Saqlash to'lovi ochiq — omborchi aynan shu bilan ishlaydi.
   */
  const money = useSeesMoney();

  /*
   * Qidiruv SERVERDA — umumiy qoida (shared search.ts): nom, SKU kodi,
   * shtrix-kod, Uzum SKU / mahsulot ID'si, uzum.uz havolasi. Ilgari jadval
   * faqat JORIY SAHIFANI (25 qator) nom va SKU kodi bo'yicha qidirardi:
   * ikkinchi sahifadagi tovar umuman topilmasdi (2026-10-24).
   */
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['illiquid', q, days, page, debounced],
    queryFn: () =>
      api.get<IlliquidResponse>('/products/illiquid', {
        ...q,
        days: Number(days),
        search: debounced || undefined,
        page,
        pageSize: PAGE_SIZE,
      }),
  });

  useEffect(() => {
    setPage(1);
  }, [days, search]);

  /*
   * Ro'yxat — serverning o'zi: nolikvid = tanlangan kundan ko'p sotilmagan YOKI
   * qoldig'i 90 kundan ortiqqa yetadigan (sotilib tursa ham). Ilgari sahifa
   * qatorlarni yana "sotilmagan kunlar" bo'yicha filtrlardi: ortiqcha qoldiqli,
   * lekin sotilayotgan SKU jadvaldan tushib, xulosada "13 SKU" turgan holda
   * jadval bo'sh chiqardi (2026-10-27).
   */
  const rows = useMemo<IlliquidRow[]>(() => data?.rows.items ?? [], [data]);

  /**
   * Muzlagan kapital va dona serverdan (butun ro'yxat), saqlash va sotuv
   * qiymati esa joriy sahifadan hisoblanardi — bir kartochkada ikki xil
   * qamrov chalkashlik tug'dirardi. Endi ikkalasi ham bir xil ro'yxatdan:
   * agar server jamisi bo'lsa, ulushga qarab butun ro'yxatga keltiriladi.
   */
  const totals = useMemo(() => {
    const pageUnits = rows.reduce((s, r) => s + r.stock, 0);
    const allUnits = data?.totalUnits ?? pageUnits;
    // Sahifadagi donaga to'g'ri keladigan ulush bo'yicha kengaytiramiz
    const scale = pageUnits > 0 && allUnits > 0 ? allUnits / pageUnits : 1;
    const storagePerMonth = rows.reduce((s, r) => s + r.storageCostPerMonth, 0) * scale;
    return {
      frozen: data?.totalFrozen ?? rows.reduce((s, r) => s + r.frozenCapital, 0),
      units: data?.totalUnits ?? rows.reduce((s, r) => s + r.stock, 0),
      skus: data?.rows.total ?? rows.length,
      storagePerMonth,
      storagePerDay: storagePerMonth / 30,
      stockValue: rows.reduce((s, r) => s + r.stockValue, 0) * scale,
    };
  }, [data, rows]);

  const buckets = useMemo(() => {
    const defs: { key: string; min: number; max: number }[] = [
      { key: 'bucket.30', min: 30, max: 60 },
      { key: 'bucket.60', min: 60, max: 90 },
      { key: 'bucket.90', min: 90, max: 180 },
      { key: 'bucket.180', min: 180, max: Number.POSITIVE_INFINITY },
    ];
    return defs.map((d) => {
      const list = rows.filter((r) => r.daysWithoutSale >= d.min && r.daysWithoutSale < d.max);
      return {
        name: t(d.key),
        frozen: list.reduce((s, r) => s + r.frozenCapital, 0),
        skus: list.length,
      };
    });
  }, [rows, t]);

  const recoData = useMemo(() => {
    const keys: IlliquidRow['recommendation'][] = ['discount', 'promo', 'withdraw', 'watch'];
    return keys
      .map((k) => {
        const list = rows.filter((r) => r.recommendation === k);
        return {
          name: t(`reco.${k}`),
          value: money ? list.reduce((s, r) => s + (r.frozenCapital ?? 0), 0) : list.length,
          color: RECO_COLOR[k],
        };
      })
      .filter((d) => d.value > 0);
  }, [rows, t, money]);

  const pages = data?.rows.pages ?? 1;

  async function onExport() {
    setExporting(true);
    try {
      const blob = await api.blob('/export/illiquid', { ...q, days: Number(days) });
      downloadBlob(blob, `illiquid-${q.from}_${q.to}.xlsx`);
    } catch {
      toast.error(t('export.error'));
    } finally {
      setExporting(false);
    }
  }

  /*
   * Ustunlar 1366 px'ga sig'adi: qoldiq qiymati — dona ostida, oxirgi sotuv
   * sanasi — "sotuvsiz" ostida. Ilgari sakkiz ustun bor edi va "Muzlagan
   * kapital" kesilib, "Tavsiya" umuman ko'rinmasdi — sahifaning asosiy javobi.
   */
  const columns: Column<IlliquidRow>[] = [
    {
      key: 'product',
      header: t('col.product'),
      sortable: true,
      sortValue: (r) => r.title,
      render: (r) => (
        <SkuNameCell className="md:min-w-[12rem] md:max-w-[18rem]" title={r.title} subtitle={r.sku} imageUrl={r.imageUrl} />
      ),
      className: PAD_FIRST,
      headerClassName: PAD_FIRST,
    },
    {
      key: 'stock',
      header: t('col.stock'),
      align: 'right',
      sortable: true,
      sortValue: (r) => r.stock,
      render: (r) => (
        <div className="leading-tight">
          <span className="font-semibold text-ink">{f.num(r.stock)}</span>
          {money ? (
            <p className="tnum text-2xs text-muted" title={t('col.stockValue')}>
              {f.money(r.stockValue)}
            </p>
          ) : null}
        </div>
      ),
      className: PAD,
      headerClassName: PAD,
    },
    {
      key: 'days',
      header: t('col.days'),
      align: 'right',
      sortable: true,
      sortValue: (r) => r.daysWithoutSale,
      render: (r) => (
        <div className="leading-tight">
          <span className={cn('font-semibold', daysTone(r.daysWithoutSale))}>
            {f.num(r.daysWithoutSale)} {t('common.days')}
          </span>
          <p className="tnum text-2xs text-muted" title={t('col.lastSale')}>
            {r.lastSaleAt ? (
              f.date(r.lastSaleAt)
            ) : (
              <span className="inline-flex items-center gap-1">
                <CalendarOff className="h-3 w-3" />
                {t('never.sold')}
              </span>
            )}
          </p>
        </div>
      ),
      className: PAD,
      headerClassName: PAD,
    },
    {
      key: 'storage',
      header: t('col.storage'),
      align: 'right',
      hideOnMobile: true,
      sortable: true,
      sortValue: (r) => r.storageCostPerMonth,
      // Jadvalda rangsiz: qiymat bo'lsa to'q, nol bo'lsa xira — rang KPI va "har kuni yo'qotayotgan" kartochkasida
      render: (r) => (
        <ZeroAware value={r.storageCostPerMonth} tone="font-medium text-ink" text={f.money(r.storageCostPerMonth)} />
      ),
      className: PAD,
      headerClassName: PAD,
    },
    {
      key: 'frozen',
      header: t('col.frozen'),
      align: 'right',
      sortable: true,
      sortValue: (r) => r.frozenCapital,
      render: (r) => <span className="font-semibold text-warn-ink">{f.money(r.frozenCapital)}</span>,
      className: PAD,
      headerClassName: PAD,
    },
    {
      key: 'reco',
      header: t('col.reco'),
      sortable: true,
      sortValue: (r) => r.recommendation,
      render: (r) => {
        const Icon = RECO_ICON[r.recommendation];
        return (
          <div className="min-w-[10rem] max-w-[15rem]">
            <Badge tone={RECO_TONE[r.recommendation]}>
              <Icon className="h-3 w-3" />
              {t(`reco.${r.recommendation}`)}
            </Badge>
            <p className="mt-1 whitespace-normal text-2xs leading-snug text-muted">{t(`reco.${r.recommendation}.hint`)}</p>
          </div>
        );
      },
      className: PAD_LAST,
      headerClassName: PAD_LAST,
    },
  ];

  return (
    <>
      <PageHeader
        icon={<Snowflake className="h-5 w-5" />}
        title={t('title')}
        description={t('subtitle')}
        badge={<PreviewBadge feature="illiquid" />}
        meta={<DataFreshness />}
        actions={
          canExport ? (
            <Button variant="outline" icon={<Download className="h-4 w-4" />} loading={exporting} onClick={onExport}>
              {t('export')}
            </Button>
          ) : undefined
        }
      />

      <FilterBar>
        <Segmented<DaysFilter>
          value={days}
          onChange={setDays}
          options={[
            { value: '30', label: t('filter.30') },
            { value: '60', label: t('filter.60') },
            { value: '90', label: t('filter.90') },
          ]}
        />
      </FilterBar>

      <PlanGate feature="illiquid">
        {isError ? (
          <Card>
            <ErrorState message={error instanceof Error ? error.message : undefined} onRetry={() => void refetch()} />
          </Card>
        ) : (
          <div className="space-y-5">
            {/*
              Muzlagan kapital — sariq: bu hali zarar emas, xavf (pul sotilmay
              turibdi). Haqiqiy yo'qotish — saqlash to'lovi: u pushti (xarajat
              xaritasidagi saqlash rangi), kunlik summasi esa pastdagi qizil
              kartochkada. Ilgari saqlash binafsha — Uzum ulushi rangida edi.
            */}
            <StatGrid>
              {money ? (
                <StatCard
                  label={t('kpi.frozen')}
                  value={isLoading ? '' : f.money(totals.frozen)}
                  hint={t('kpi.frozenHint')}
                  loading={isLoading}
                  icon={<Snowflake className="h-5 w-5" />}
                  tone="warn"
                />
              ) : null}
              <StatCard
                label={t('kpi.units')}
                value={isLoading ? '' : f.num(totals.units)}
                loading={isLoading}
                icon={<PackageX className="h-5 w-5" />}
                tone="info"
              />
              <StatCard
                label={t('kpi.skus')}
                value={isLoading ? '' : f.num(totals.skus)}
                loading={isLoading}
                icon={<Archive className="h-5 w-5" />}
                className={NEUTRAL_TONE}
              />
              <StatCard
                label={t('kpi.storage')}
                value={isLoading ? '' : f.money(totals.storagePerMonth)}
                hint={t('kpi.storageHint')}
                loading={isLoading}
                icon={<Archive className="h-5 w-5" />}
                className={STORAGE_TONE}
              />
            </StatGrid>

            {isLoading ? (
              <Skeleton className="h-40 w-full" />
            ) : (
              <BurnCard
                perDay={totals.storagePerDay}
                perMonth={totals.storagePerMonth}
                perYear={totals.storagePerMonth * 12}
                title={t('burn.title')}
                hint={t('burn.hint')}
                monthLabel={t('burn.month')}
                yearLabel={t('burn.year')}
                footer={t('burn.footer', { n: rows.length })}
              />
            )}

            <div className="grid gap-4 xl:grid-cols-3">
              <ChartCard
                className="xl:col-span-2"
                icon={<Hourglass />}
                tone="warn"
                title={t('chart.buckets')}
                subtitle={t('chart.bucketsSub')}
              >
                {isLoading ? (
                  <Skeleton className="h-[260px] w-full" />
                ) : rows.length ? (
                  <BarsChart
                    data={buckets}
                    xKey="name"
                    height={260}
                    // Muzlagan kapital — KPI bilan bir rangda (sariq: xavf, hali zarar emas); pulsiz shablonda — SKU soni
                    series={
                      money
                        ? [{ key: 'frozen', name: t('kpi.frozen'), money: true, color: CHART_COLORS.warn }]
                        : [{ key: 'skus', name: t('kpi.skus'), color: CHART_COLORS.warn }]
                    }
                  />
                ) : (
                  <EmptyState title={t('empty.title')} hint={t('empty.hint')} />
                )}
              </ChartCard>

              <ChartCard icon={<Lightbulb />} tone="muted" title={t('chart.reco')} subtitle={t('chart.recoSub')}>
                {isLoading ? (
                  <Skeleton className="h-[260px] w-full" />
                ) : recoData.length ? (
                  <DonutChart
                    data={recoData}
                    height={260}
                    center={
                      <>
                        <span className="eyebrow">{money ? t('kpi.frozen') : t('kpi.skus')}</span>
                        <span className="tnum font-display text-lg font-extrabold text-ink">
                          {money ? f.compact(totals.frozen) : f.num(rows.length)}
                        </span>
                      </>
                    }
                  />
                ) : (
                  <EmptyState title={t('empty.title')} hint={t('empty.hint')} />
                )}
              </ChartCard>
            </div>

            <Card>
              <CardHeader
                icon={<Table2 />}
                tone="warn"
                title={t('table.title')}
                subtitle={t('table.found', { n: rows.length })}
                actions={<SkuSearchInput value={search} onChange={setSearch} className="w-full sm:w-72" />}
              />
              <div className="mt-4">
                <DataTable<IlliquidRow>
                  columns={money ? columns : columns.filter((c) => c.key !== 'frozen')}
                  rows={rows}
                  rowKey={(r) => r.skuId}
                  loading={isLoading}
                  pagination={{ page, pages, total: data?.rows.total ?? rows.length, onPage: setPage }}
                  empty={
                    <EmptyState
                      icon={<Snowflake className="h-6 w-6" />}
                      title={debounced ? t('empty.filtered') : t('empty.title')}
                      hint={debounced ? undefined : t('empty.hint')}
                    />
                  }
                  footer={
                    <>
                      <td className="py-3 pl-3 pr-2.5 text-sm md:pl-5">{t('common.total')}</td>
                      <td className="tnum px-2.5 py-3 text-right text-sm">
                        {f.num(totals.units)}
                        {money ? (
                          <p className="text-2xs font-normal text-muted md:whitespace-nowrap">{f.money(totals.stockValue)}</p>
                        ) : null}
                      </td>
                      <td className="px-2.5 py-3" />
                      <td className="tnum hidden whitespace-nowrap px-2.5 py-3 text-right text-sm md:table-cell">
                        {f.money(totals.storagePerMonth)}
                      </td>
                      {money ? (
                        <td className="tnum px-2.5 py-3 text-right text-sm text-warn-ink md:whitespace-nowrap">
                          {f.money(totals.frozen)}
                        </td>
                      ) : null}
                      <td className="py-3 pl-2.5 pr-3 md:pr-5" />
                    </>
                  }
                />
              </div>
            </Card>
          </div>
        )}
      </PlanGate>
    </>
  );
}
