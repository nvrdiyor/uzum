import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  Calculator as CalculatorIcon,
  Coins,
  Download,
  Scale,
  Target,
} from '@/components/icons';
import type { UnitEconomicsResponse, UnitEconomicsRow } from '@savdoiq/shared';
import {
  Amount,
  Badge,
  Button,
  Card,
  CardHeader,
  DataTable,
  Divider,
  Drawer,
  EmptyState,
  ErrorState,
  HeroCard,
  PageHeader,
  PlanGate,
  PreviewBadge,
  ProductCell,
  Segmented,
  Skeleton,
  toast,
  type Column,
} from '@/components/ui';
import { SkuSearchInput } from '@/components/products/SkuSearchInput';
import { FilterBar } from '@/components/filters';
import { PeriodChip } from '@/components/finance/PeriodChip';
import { CostCoverage } from '@/components/trust/CostCoverage';
import { DataFreshness } from '@/components/trust/DataFreshness';
import { CostSplitBar, SplitStrip } from '@/components/unit/CostSplitBar';
import { PART_COLOR, PART_ORDER, rowParts, type PartKey } from '@/components/unit/types';
import { useCountUp } from '@/hooks/useCountUp';
import { api } from '@/lib/api';
import { usePeriodQuery } from '@/store/ui';
import { registerNamespace, useFormat, useT } from '@/i18n';
import { cn, downloadBlob } from '@/lib/utils';

registerNamespace('unitEconomics', {
  uz: {
    title: 'Unit-iqtisod',
    subtitle: 'Har bir mahsulotning bitta donasidan qancha foyda qolishini ko‘ring',
    'kpi.revenue': 'Tushum',
    'kpi.revenueHint': 'Tanlangan davrdagi sotuv summasi',
    'kpi.profit': 'Tovarlar bo‘yicha foyda',
    'kpi.profitHint': 'Reklama va omborga logistikagacha — sof foyda Moliyada',
    'kpi.margin': 'O‘rtacha marja',
    'kpi.marginHint': 'Sof foyda / tushum',
    'kpi.roi': 'O‘rtacha ROI',
    'kpi.roiHint': 'Sof foyda / tannarxga sarflangan mablag‘',
    'alert.title': '{n} ta mahsulot zarar keltirmoqda',
    'alert.body': 'Ularning sotuv narxi barcha xarajatlarni qoplamayapti — narx yoki tannarxni qayta ko‘rib chiqing.',
    'alert.action': 'Faqat zararlilarni ko‘rsatish',
    'filter.pageScope': 'Sanoqlar shu sahifadagi qatorlar bo‘yicha',
    'filter.all': 'Barchasi',
    'filter.loss': 'Zararli',
    'filter.profit': 'Foydali',
    'view.compact': 'Qisqa',
    'view.full': 'Barcha ustunlar',
    'view.hint': 'Xarajat moddalari alohida ustunlarda — jadval yon tomonga suriladi',
    'legend.title': 'Narx taqsimoti:',
    'col.split': 'Narx taqsimoti',
    'col.soldShort': '{n} dona',
    'col.product': 'Mahsulot',
    'col.price': 'Narx',
    'col.cost': 'Tannarx',
    'col.commission': 'Komissiya',
    'col.logistics': 'Logistika',
    'col.storage': 'Ombor',
    'col.tax': 'Soliq',
    'col.profit': 'Foyda (1 dona)',
    'col.margin': 'Marja',
    'col.roi': 'ROI',
    'col.breakEven': 'Nol foyda narxi',
    'col.sold': 'Sotildi',
    'col.total': 'Umumiy foyda',
    'badge.loss': 'zarar',
    'empty.title': 'Ma’lumot topilmadi',
    'empty.hint': 'Davrni o‘zgartiring yoki qidiruvni tozalang',
    'empty.loss': 'Zararli mahsulot yo‘q',
    'empty.lossHint': 'Barcha mahsulotlar ijobiy foyda bilan sotilmoqda',
    'export.done': 'Excel fayl tayyor',
    'export.error': 'Eksport qilib bo‘lmadi',
    'rows.count': '{n} ta SKU',
    'drawer.title': '1 dona qayerga ketadi',
    'drawer.hint': 'Sotuv narxining har bir qismi qanday taqsimlanadi',
    'drawer.open': 'Kalkulyatorda ochish',
    'drawer.price': 'Sotuv narxi',
    'drawer.breakEven': 'Nol foyda narxi',
    'drawer.breakEvenHint': 'Shu narxdan pastda sotish zarar keltiradi',
    'drawer.margin': 'Marja',
    'drawer.roi': 'ROI',
    'drawer.sold': 'Sotilgan dona',
    'drawer.total': 'Umumiy foyda',
    'drawer.loss': 'Bu mahsulot zarar keltirmoqda',
    'part.cogs': 'Tannarx',
    'part.commission': 'Komissiya',
    'part.logistics': 'Logistika',
    'part.storage': 'Ombor',
    'part.other': 'Boshqa xarajat',
    'part.tax': 'Soliq',
    'part.profit': 'Sof foyda',
  },
  ru: {
    title: 'Юнит-экономика',
    subtitle: 'Смотрите, сколько прибыли остаётся с одной единицы товара',
    'kpi.revenue': 'Выручка',
    'kpi.revenueHint': 'Сумма продаж за выбранный период',
    'kpi.profit': 'Прибыль по товарам',
    'kpi.profitHint': 'До рекламы и логистики на склад — чистая прибыль в Финансах',
    'kpi.margin': 'Средняя маржа',
    'kpi.marginHint': 'Чистая прибыль / выручка',
    'kpi.roi': 'Средний ROI',
    'kpi.roiHint': 'Чистая прибыль / вложения в себестоимость',
    'alert.title': '{n} товаров приносят убыток',
    'alert.body': 'Цена продажи не покрывает все расходы — пересмотрите цену или себестоимость.',
    'alert.action': 'Показать только убыточные',
    'filter.pageScope': 'Счётчики по строкам текущей страницы',
    'filter.all': 'Все',
    'filter.loss': 'Убыточные',
    'filter.profit': 'Прибыльные',
    'view.compact': 'Кратко',
    'view.full': 'Все столбцы',
    'view.hint': 'Статьи расходов в отдельных столбцах — таблица прокручивается вбок',
    'legend.title': 'Структура цены:',
    'col.split': 'Структура цены',
    'col.soldShort': '{n} шт.',
    'col.product': 'Товар',
    'col.price': 'Цена',
    'col.cost': 'Себестоимость',
    'col.commission': 'Комиссия',
    'col.logistics': 'Логистика',
    'col.storage': 'Хранение',
    'col.tax': 'Налог',
    'col.profit': 'Прибыль (1 шт.)',
    'col.margin': 'Маржа',
    'col.roi': 'ROI',
    'col.breakEven': 'Точка безубыточности',
    'col.sold': 'Продано',
    'col.total': 'Общая прибыль',
    'badge.loss': 'убыток',
    'empty.title': 'Данные не найдены',
    'empty.hint': 'Измените период или очистите поиск',
    'empty.loss': 'Убыточных товаров нет',
    'empty.lossHint': 'Все товары продаются с положительной прибылью',
    'export.done': 'Excel-файл готов',
    'export.error': 'Не удалось выгрузить',
    'rows.count': '{n} SKU',
    'drawer.title': 'Куда уходит одна единица',
    'drawer.hint': 'Как распределяется каждая часть цены продажи',
    'drawer.open': 'Открыть в калькуляторе',
    'drawer.price': 'Цена продажи',
    'drawer.breakEven': 'Точка безубыточности',
    'drawer.breakEvenHint': 'Ниже этой цены продажа приносит убыток',
    'drawer.margin': 'Маржа',
    'drawer.roi': 'ROI',
    'drawer.sold': 'Продано штук',
    'drawer.total': 'Общая прибыль',
    'drawer.loss': 'Этот товар приносит убыток',
    'part.cogs': 'Себестоимость',
    'part.commission': 'Комиссия',
    'part.logistics': 'Логистика',
    'part.storage': 'Хранение',
    'part.other': 'Прочие расходы',
    'part.tax': 'Налог',
    'part.profit': 'Чистая прибыль',
  },
  en: {
    title: 'Unit economics',
    subtitle: 'See how much profit is left from a single unit of every product',
    'kpi.revenue': 'Revenue',
    'kpi.revenueHint': 'Sales amount for the selected period',
    'kpi.profit': 'Profit on goods',
    'kpi.profitHint': 'Before ads and inbound logistics — net profit is in Finance',
    'kpi.margin': 'Average margin',
    'kpi.marginHint': 'Net profit / revenue',
    'kpi.roi': 'Average ROI',
    'kpi.roiHint': 'Net profit / money invested in cost price',
    'alert.title': '{n} products are losing money',
    'alert.body': 'Their selling price does not cover all costs — review the price or the cost price.',
    'alert.action': 'Show loss-making only',
    'filter.pageScope': 'Counts are for the current page',
    'filter.all': 'All',
    'filter.loss': 'Loss-making',
    'filter.profit': 'Profitable',
    'view.compact': 'Compact',
    'view.full': 'All columns',
    'view.hint': 'Each cost in its own column — the table scrolls sideways',
    'legend.title': 'Price split:',
    'col.split': 'Price split',
    'col.soldShort': '{n} pcs',
    'col.product': 'Product',
    'col.price': 'Price',
    'col.cost': 'Cost',
    'col.commission': 'Commission',
    'col.logistics': 'Logistics',
    'col.storage': 'Storage',
    'col.tax': 'Tax',
    'col.profit': 'Profit (1 unit)',
    'col.margin': 'Margin',
    'col.roi': 'ROI',
    'col.breakEven': 'Break-even price',
    'col.sold': 'Sold',
    'col.total': 'Total profit',
    'badge.loss': 'loss',
    'empty.title': 'Nothing found',
    'empty.hint': 'Change the period or clear the search',
    'empty.loss': 'No loss-making products',
    'empty.lossHint': 'Every product is sold with a positive profit',
    'export.done': 'Excel file is ready',
    'export.error': 'Export failed',
    'rows.count': '{n} SKUs',
    'drawer.title': 'Where one unit goes',
    'drawer.hint': 'How each part of the selling price is split',
    'drawer.open': 'Open in calculator',
    'drawer.price': 'Selling price',
    'drawer.breakEven': 'Break-even price',
    'drawer.breakEvenHint': 'Selling below this price makes a loss',
    'drawer.margin': 'Margin',
    'drawer.roi': 'ROI',
    'drawer.sold': 'Units sold',
    'drawer.total': 'Total profit',
    'drawer.loss': 'This product is losing money',
    'part.cogs': 'Cost price',
    'part.commission': 'Commission',
    'part.logistics': 'Logistics',
    'part.storage': 'Storage',
    'part.other': 'Other costs',
    'part.tax': 'Tax',
    'part.profit': 'Net profit',
  },
});

const PAGE_SIZE = 25;

/**
 * "Sport krossovka Runner Air — 41" → nom va variant ("41").
 *
 * SKU nomi mahsulot nomi + variantdan iborat. Tor ustunda nom oxiridan
 * kesilib, aynan variant yo'qolardi — to'rtta "Sport krossovka Runner Air…"
 * qatorini faqat SKU kodidan ajratish mumkin edi (2026-10-24).
 */
function splitVariant(title: string): { base: string; variant: string | null } {
  const at = title.lastIndexOf(' — ');
  if (at <= 0) return { base: title, variant: null };
  const variant = title.slice(at + 3).trim();
  return variant ? { base: title.slice(0, at), variant } : { base: title, variant: null };
}

type RowFilter = 'all' | 'loss' | 'profit';
/**
 * Jadval ko'rinishi. 'compact' — xarajat moddalari bitta rangli chiziqda,
 * jadval 1366 px'ga sig'adi. Ilgari 13 ustun bir qatorda turardi va shu
 * kenglikda Foyda, Marja, ROI ekrandan tashqarida qolib, sahifaning asosiy
 * javobini ko'rish uchun jadvalni yon tomonga surish kerak edi (2026-10-23).
 */
type ColumnsView = 'compact' | 'full';

export default function UnitEconomics() {
  const t = useT('unitEconomics');
  const f = useFormat();
  const navigate = useNavigate();
  const periodQuery = usePeriodQuery();

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [filter, setFilter] = useState<RowFilter>('all');
  const [colView, setColView] = useState<ColumnsView>('compact');
  const [active, setActive] = useState<UnitEconomicsRow | null>(null);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    const id = setTimeout(() => {
      setDebounced(search.trim());
      setPage(1);
    }, 350);
    return () => clearTimeout(id);
  }, [search]);

  const query = useMemo(
    () => ({ ...periodQuery, page, pageSize: PAGE_SIZE, search: debounced || undefined }),
    [periodQuery, page, debounced],
  );

  const unit = useQuery({
    queryKey: ['unit', query],
    queryFn: () => api.get<UnitEconomicsResponse>('/unit', query),
    placeholderData: (prev) => prev,
  });

  const totals = unit.data?.totals;
  const rows = useMemo(() => unit.data?.rows.items ?? [], [unit.data]);
  const lossRows = useMemo(() => rows.filter((r) => r.netProfit < 0), [rows]);

  const visibleRows = useMemo(() => {
    if (filter === 'loss') return lossRows;
    if (filter === 'profit') return rows.filter((r) => r.netProfit >= 0);
    return rows;
  }, [rows, lossRows, filter]);

  const onExport = async () => {
    setExporting(true);
    try {
      const blob = await api.blob('/export/unit-economics', {
        ...periodQuery,
        search: debounced || undefined,
      });
      downloadBlob(blob, `unit-economics-${periodQuery.from}_${periodQuery.to}.xlsx`);
      toast.success(t('export.done'));
    } catch (err) {
      toast.error(t('export.error'), err instanceof Error ? err.message : undefined);
    } finally {
      setExporting(false);
    }
  };

  const columns: Column<UnitEconomicsRow>[] = useMemo(() => {
    const product: Column<UnitEconomicsRow> = {
      key: 'title',
      header: t('col.product'),
      sortable: true,
      sortValue: (r) => r.title,
      render: (r) => {
        const { base, variant } = splitVariant(r.title);
        return (
          // max-w: uzun nom ustunni kengaytirib, o'ngdagi Foyda va Marja'ni ekrandan surib chiqarmasin
          <div className="max-w-[15rem] 2xl:max-w-[20rem]">
            {r.netProfit < 0 ? <span className="sp-loss sr-only" aria-hidden /> : null}
            <ProductCell
              title={base}
              imageUrl={r.imageUrl}
              size={36}
              subtitle={
                <span className="flex items-center gap-1.5">
                  {/* Variant (o'lcham, rang) ajratib yoziladi — nom kesilganda ham ko'rinsin */}
                  {variant ? <span className="shrink-0 font-semibold text-ink-soft">{variant}</span> : null}
                  <span className="truncate">{variant ? `· ${r.sku}` : r.sku}</span>
                  {r.netProfit < 0 ? <span className="shrink-0 font-semibold text-danger">· {t('badge.loss')}</span> : null}
                </span>
              }
            />
          </div>
        );
      },
    };
    const price: Column<UnitEconomicsRow> = {
      key: 'price',
      header: t('col.price'),
      align: 'right',
      sortable: true,
      sortValue: (r) => r.price,
      render: (r) => <span className="tnum font-semibold text-ink">{f.money(r.price)}</span>,
    };
    // Narx qayerga ketadi — har bo'lak COST_COLORS'da, sichqoncha olib borilganda summasi bilan
    const split: Column<UnitEconomicsRow> = {
      key: 'split',
      header: t('col.split'),
      hideOnMobile: true,
      render: (r) => (
        <SplitStrip
          className="w-28 2xl:w-36"
          parts={rowParts(r).map((p) => ({
            key: p.key,
            label: t(`part.${p.key}`),
            value: p.value,
            color: PART_COLOR[p.key],
          }))}
        />
      ),
    };
    const profit: Column<UnitEconomicsRow> = {
      key: 'netProfit',
      header: t('col.profit'),
      align: 'right',
      sortable: true,
      sortValue: (r) => r.netProfit,
      render: (r) => (
        <span className={cn('tnum font-display font-extrabold', r.netProfit < 0 ? 'text-danger' : 'text-brand-ink')}>
          {f.money(r.netProfit)}
        </span>
      ),
    };
    const margin: Column<UnitEconomicsRow> = {
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
    };
    const roi: Column<UnitEconomicsRow> = {
      key: 'roi',
      header: t('col.roi'),
      align: 'right',
      sortable: true,
      hideOnMobile: true,
      sortValue: (r) => r.roi,
      render: (r) => <span className={cn('tnum', r.roi < 0 ? 'text-danger' : 'text-ink-soft')}>{f.pct(r.roi, 0)}</span>,
    };
    // Sotilgan dona — umumiy foyda ostida: alohida ustun qisqa ko'rinishda sig'masdi
    const total: Column<UnitEconomicsRow> = {
      key: 'totalProfit',
      header: t('col.total'),
      align: 'right',
      sortable: true,
      sortValue: (r) => r.totalProfit,
      render: (r) => (
        <div className="leading-tight">
          <p className={cn('tnum font-semibold', r.totalProfit < 0 ? 'text-danger' : 'text-ink')}>
            {f.money(r.totalProfit)}
          </p>
          <p className="tnum text-2xs text-muted">{t('col.soldShort', { n: f.num(r.unitsSold) })}</p>
        </div>
      ),
    };
    if (colView === 'compact') return [product, price, split, profit, margin, roi, total];

    const money = (key: 'logistics' | 'storage' | 'tax', header: string): Column<UnitEconomicsRow> => ({
      key,
      header,
      align: 'right',
      sortable: true,
      hideOnMobile: true,
      sortValue: (r) => r[key],
      render: (r) => <span className="tnum">{f.money(r[key])}</span>,
    });
    return [
      product,
      price,
      // To'liq ko'rinishda ham asosiy javob (foyda, marja) birinchi — xarajat ustunlari undan keyin
      profit,
      margin,
      roi,
      {
        key: 'purchasePrice',
        header: t('col.cost'),
        align: 'right',
        sortable: true,
        hideOnMobile: true,
        sortValue: (r) => r.purchasePrice,
        render: (r) =>
          r.purchasePrice > 0 ? <span className="tnum">{f.money(r.purchasePrice)}</span> : <span className="text-warn">—</span>,
      },
      {
        key: 'commission',
        header: t('col.commission'),
        align: 'right',
        sortable: true,
        hideOnMobile: true,
        sortValue: (r) => r.commission,
        render: (r) => (
          <div className="leading-tight">
            <p className="tnum text-sm">{f.money(r.commission)}</p>
            <p className="tnum text-2xs text-muted">{f.pct(r.commissionPct)}</p>
          </div>
        ),
      },
      money('logistics', t('col.logistics')),
      money('storage', t('col.storage')),
      money('tax', t('col.tax')),
      {
        key: 'breakEvenPrice',
        header: t('col.breakEven'),
        align: 'right',
        sortable: true,
        hideOnMobile: true,
        sortValue: (r) => r.breakEvenPrice,
        render: (r) => <span className="tnum text-muted">{f.money(r.breakEvenPrice)}</span>,
      },
      total,
    ];
  }, [t, f, colView]);

  /** Jadval ustidagi rang izohi — chiziqdagi bo'laklarni o'qish uchun */
  const legend = PART_ORDER.map((key) => ({ key, label: t(`part.${key}`), color: PART_COLOR[key] }));

  const drawerSegments = useMemo(() => {
    if (!active) return [];
    return rowParts(active)
      .filter((p) => p.value !== 0 || p.key === 'profit')
      .sort((a, b) => PART_ORDER.indexOf(a.key) - PART_ORDER.indexOf(b.key))
      .map((p) => ({
        key: p.key,
        label: t(`part.${p.key}`),
        value: p.value,
        color: PART_COLOR[p.key as PartKey],
      }));
  }, [active, t]);

  return (
    <>
      <PageHeader
        icon={<Scale className="h-5 w-5" />}
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
        actions={
          <>
            <Button
              variant="outline"
              icon={<CalculatorIcon className="h-4 w-4" />}
              onClick={() => navigate('/calculator')}
            >
              {t('nav.calculator')}
            </Button>
            <Button
              variant="outline"
              icon={<Download className="h-4 w-4" />}
              loading={exporting}
              onClick={() => void onExport()}
            >
              {t('btn.export')}
            </Button>
          </>
        }
      />

      <FilterBar />

      <PlanGate feature="unit_economics">
        {unit.isError ? (
          <Card>
            <ErrorState
              message={unit.error instanceof Error ? unit.error.message : undefined}
              onRetry={() => void unit.refetch()}
              retryLabel={t('btn.retry')}
            />
          </Card>
        ) : (
          <div className="space-y-5">
            <UnitHero totals={totals} loading={unit.isLoading} />

            {lossRows.length > 0 && filter !== 'loss' ? (
              <div className="flex flex-wrap items-start gap-3 rounded-2xl border border-danger/25 bg-danger/10 p-4 sm:p-5">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-danger" />
                <div className="min-w-0 flex-1">
                  <p className="font-display text-sm font-bold text-ink">{t('alert.title', { n: lossRows.length })}</p>
                  <p className="mt-1 text-sm text-ink-soft">{t('alert.body')}</p>
                </div>
                <Button size="sm" variant="outline" onClick={() => setFilter('loss')}>
                  {t('alert.action')}
                </Button>
              </div>
            ) : null}

            <Card>
              <CardHeader
                icon={<Coins className="h-4 w-4" />}
                title={t('col.product')}
                subtitle={t('rows.count', { n: f.num(unit.data?.rows.total ?? 0) })}
                actions={
                  <div className="flex flex-wrap items-center gap-2">
                    {/*
                      Sanoqlar JORIY SAHIFA bo'yicha — server butun davr uchun
                      kesimni bermaydi. Sarlavhadagi umumiy SKU soni bilan
                      chalkashmasligi uchun izoh qo'shilgan.
                    */}
                    <div className="max-w-full overflow-x-auto no-scrollbar" title={t('filter.pageScope')}>
                      <Segmented<RowFilter>
                        size="sm"
                        value={filter}
                        onChange={setFilter}
                        options={[
                          { value: 'all', label: t('filter.all'), count: rows.length },
                          { value: 'loss', label: t('filter.loss'), count: lossRows.length },
                          { value: 'profit', label: t('filter.profit'), count: rows.length - lossRows.length },
                        ]}
                      />
                    </div>
                    {/* Nom, SKU kodi, shtrix-kod, Uzum ID yoki havola — server umumiy qoida bilan qidiradi (shared search.ts) */}
                    <SkuSearchInput className="w-full sm:w-72" value={search} onChange={setSearch} />
                  </div>
                }
              />

              {/* Rang izohi va ustunlar tanlovi — chiziq bo'laklari nimani bildirishi bir qatorda */}
              <div className="mt-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-2.5 px-5">
                {colView === 'compact' ? (
                  <div className="flex min-w-0 flex-wrap items-center gap-x-3.5 gap-y-1.5 text-xs">
                    <span className="font-medium text-muted">{t('legend.title')}</span>
                    {legend.map((l) => (
                      <span key={l.key} className="inline-flex items-center gap-1.5 text-ink-soft">
                        <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: l.color }} />
                        {l.label}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted">{t('view.hint')}</p>
                )}
                <Segmented<ColumnsView>
                  size="sm"
                  className="hidden md:inline-flex"
                  value={colView}
                  onChange={setColView}
                  options={[
                    { value: 'compact', label: t('view.compact') },
                    { value: 'full', label: t('view.full') },
                  ]}
                />
              </div>

              <div className={cn('mt-3', unit.isFetching && !unit.isLoading && 'opacity-70 transition-opacity')}>
                <DataTable<UnitEconomicsRow>
                  className="[&_tbody_tr:has(.sp-loss)]:bg-danger/5"
                  columns={columns}
                  rows={visibleRows}
                  rowKey={(r) => r.skuId}
                  loading={unit.isLoading}
                  density="compact"
                  onRowClick={(r) => setActive(r)}
                  empty={
                    <EmptyState
                      icon={<Scale className="h-6 w-6" />}
                      title={filter === 'loss' ? t('empty.loss') : t('empty.title')}
                      hint={filter === 'loss' ? t('empty.lossHint') : t('empty.hint')}
                      action={
                        filter === 'all' ? undefined : (
                          <Button variant="outline" onClick={() => setFilter('all')}>
                            {t('filter.all')}
                          </Button>
                        )
                      }
                    />
                  }
                  pagination={{
                    page: unit.data?.rows.page ?? 1,
                    pages: unit.data?.rows.pages ?? 1,
                    total: unit.data?.rows.total ?? 0,
                    pageSize: PAGE_SIZE,
                    onPage: setPage,
                  }}
                />
              </div>
            </Card>
          </div>
        )}
      </PlanGate>

      <Drawer
        open={Boolean(active)}
        onClose={() => setActive(null)}
        title={t('drawer.title')}
        footer={
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Button variant="ghost" onClick={() => setActive(null)}>
              {t('btn.close')}
            </Button>
            <Button
              icon={<CalculatorIcon className="h-4 w-4" />}
              onClick={() => {
                if (active) navigate(`/calculator?skuId=${encodeURIComponent(active.skuId)}`);
                setActive(null);
              }}
            >
              {t('drawer.open')}
            </Button>
          </div>
        }
      >
        {active ? (
          <div className="space-y-5">
            <ProductCell title={active.title} subtitle={active.sku} imageUrl={active.imageUrl} size={52} />

            {active.netProfit < 0 ? (
              <div className="flex items-center gap-2.5 rounded-xl border border-danger/25 bg-danger/10 px-3.5 py-2.5">
                <AlertTriangle className="h-4 w-4 shrink-0 text-danger" />
                <p className="text-sm font-medium text-ink">{t('drawer.loss')}</p>
              </div>
            ) : null}

            <div className="well p-4">
              <div className="flex items-baseline justify-between gap-3">
                <span className="eyebrow-lg">{t('drawer.price')}</span>
                <span className="tnum font-display text-xl font-extrabold text-ink">{f.money(active.price)}</span>
              </div>
              <p className="mt-1 text-xs text-muted">{t('drawer.hint')}</p>
            </div>

            <CostSplitBar segments={drawerSegments} total={active.price} />

            <Divider />

            <div className="grid grid-cols-2 gap-3">
              <MiniStat label={t('drawer.margin')} value={f.pct(active.margin)} danger={active.margin < 0} />
              <MiniStat label={t('drawer.roi')} value={f.pct(active.roi)} danger={active.roi < 0} />
              <MiniStat label={t('drawer.sold')} value={f.num(active.unitsSold)} />
              <MiniStat
                label={t('drawer.total')}
                value={f.money(active.totalProfit)}
                danger={active.totalProfit < 0}
              />
            </div>

            <div className="well flex items-start gap-3 p-4">
              <Target className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="text-sm font-medium text-ink-soft">{t('drawer.breakEven')}</p>
                  <Badge tone={active.price >= active.breakEvenPrice ? 'brand' : 'danger'}>
                    <span className="tnum">{f.money(active.breakEvenPrice)}</span>
                  </Badge>
                </div>
                <p className="mt-1 text-xs text-muted">{t('drawer.breakEvenHint')}</p>
              </div>
            </div>
          </div>
        ) : null}
      </Drawer>
    </>
  );
}

/** Yon paneldagi kichik statistik plitka — sahifalardagi boshqa ichki plitkalar bilan bir xil `.well` */
function MiniStat({ label, value, danger }: { label: string; value: string; danger?: boolean }) {
  return (
    <div className="well p-3.5">
      <p className="truncate eyebrow">{label}</p>
      <p className={cn('tnum mt-1 font-display text-base font-extrabold', danger ? 'text-danger' : 'text-ink')}>
        {value}
      </p>
    </div>
  );
}

/**
 * Sahifaning yagona HeroCard'i: tovarlar bo'yicha foyda va uni o'lchaydigan
 * uch ko'rsatkich. Ilgari to'rtta bir xil KPI kartochkasi edi — bitta
 * ixcham kartochka jadvalga joy bo'shatadi (sahifaning asosiy qismi — jadval).
 */
function UnitHero({ totals, loading }: { totals?: UnitEconomicsResponse['totals']; loading: boolean }) {
  const t = useT('unitEconomics');
  const f = useFormat();
  const profit = totals?.profit ?? 0;
  const loss = profit < 0;
  const shown = useCountUp(profit);

  return (
    <HeroCard tone={loss ? 'danger' : 'brand'} className="p-5 sm:p-6">
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.45fr)] lg:items-center lg:gap-8">
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-3">
            <span className="icon-tile h-10 w-10 rounded-xl [&_svg]:h-5 [&_svg]:w-5" aria-hidden>
              <Coins />
            </span>
            <div className="min-w-0">
              <p className="font-display text-[15px] font-semibold leading-5 text-ink">{t('kpi.profit')}</p>
              <p className="text-xs leading-snug text-muted">{t('kpi.profitHint')}</p>
            </div>
          </div>
          {loading ? (
            <Skeleton className="mt-4 h-10 w-64 max-w-full" />
          ) : (
            <p
              className={cn(
                'tnum mt-4 font-title text-[28px] font-semibold leading-none tracking-[-0.03em] sm:text-[36px]',
                loss ? 'text-danger-ink' : 'text-ink',
              )}
            >
              <Amount value={f.money(shown)} />
            </p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
          <HeroWell
            className="col-span-2 sm:col-span-1"
            label={t('kpi.revenue')}
            value={loading ? null : f.money(totals?.revenue ?? 0)}
            hint={t('kpi.revenueHint')}
          />
          <HeroWell
            label={t('kpi.margin')}
            value={loading ? null : f.pct(totals?.margin ?? 0)}
            hint={t('kpi.marginHint')}
            danger={(totals?.margin ?? 0) < 0}
          />
          <HeroWell
            label={t('kpi.roi')}
            value={loading ? null : f.pct(totals?.roi ?? 0)}
            hint={t('kpi.roiHint')}
            danger={(totals?.roi ?? 0) < 0}
          />
        </div>
      </div>
    </HeroCard>
  );
}

function HeroWell({
  label,
  value,
  hint,
  danger,
  className,
}: {
  label: string;
  /** null — yuklanmoqda */
  value: string | null;
  hint: string;
  danger?: boolean;
  className?: string;
}) {
  return (
    <div className={cn('well min-w-0 p-3.5', className)}>
      <p className="eyebrow truncate">{label}</p>
      {value === null ? (
        <Skeleton className="mt-2 h-6 w-24" />
      ) : (
        <p
          className={cn(
            'tnum mt-1 truncate font-display text-lg font-bold leading-6',
            danger ? 'text-danger' : 'text-ink',
          )}
        >
          <Amount value={value} />
        </p>
      )}
      <p className="mt-1 line-clamp-2 text-2xs leading-snug text-muted">{hint}</p>
    </div>
  );
}
