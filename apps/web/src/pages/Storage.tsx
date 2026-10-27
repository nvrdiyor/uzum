import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Archive, BarChart3, Box, CalendarDays, CalendarRange, Coins, Download, PieChart, Snowflake } from '@/components/icons';
import type { DashboardResponse, StorageResponse, StorageRow } from '@savdoiq/shared';
import { registerNamespace, useFormat, useT } from '@/i18n';
import { api } from '@/lib/api';
import { usePeriodQuery } from '@/store/ui';
import { cn, downloadBlob } from '@/lib/utils';
import { COST_COLORS } from '@/lib/theme';
import { FilterBar } from '@/components/filters';
import { BarsChart, ChartCard } from '@/components/charts';
import { ProductTitleCell } from '@/components/sales/ProductTitleCell';
import { SectionHeading } from '@/components/storage/SectionHeading';
import { TurnoverSection } from '@/components/storage/TurnoverSection';
import { DataFreshness } from '@/components/trust/DataFreshness';
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
  ProgressBar,
  StatCard,
  StatGrid,
  toast,
  type Column,
} from '@/components/ui';

registerNamespace('storage', {
  uz: {
    title: 'Pullik saqlash',
    subtitle: 'Uzum omborida saqlash xarajati va uning foydangizga ta’siri',
    'actual.title': 'Uzum ushlagan to‘lov',
    'actual.subtitle': 'Tanlangan davrdagi haqiqiy saqlash to‘lovlari',
    'kpi.amount': 'Davr uchun saqlash to‘lovi',
    'kpi.amountHint': 'Tanlangan davrdagi jami',
    'kpi.perDay': 'Kunlik o‘rtacha',
    'kpi.perDayHint': 'Bir kunga to‘lov',
    'kpi.volume': 'Umumiy hajm',
    'kpi.volumeHint': 'Saqlanayotgan tovarlar hajmi',
    'kpi.share': 'Foydadagi ulushi',
    'kpi.shareHint': 'Sof foydaning necha foizi saqlashga ketdi',
    'kpi.shareEmpty': 'Foyda ma’lumoti yo‘q',
    'chart.daily': 'Kunlik dinamika',
    'chart.dailySub': 'Saqlash to‘lovi kunlar kesimida',
    'chart.amount': 'Saqlash to‘lovi',
    'col.product': 'Mahsulot',
    'col.qty': 'Dona',
    'col.volume': 'Hajm (l)',
    'col.amount': 'Summa',
    'col.perUnit': 'Dona uchun',
    'col.days': 'Saqlangan kun',
    'col.share': 'Foydadagi ulushi',
    'table.title': 'Saqlash xarajatlari',
    'table.pageTotal': 'Sahifadagi jami',
    'top.title': 'Eng qimmat saqlanadigan',
    'top.hint': 'Saqlash to‘lovining katta qismi shu 5 ta pozitsiyaga to‘g‘ri keladi',
    'top.link': 'Nolikvidlarni ko‘rish',
    'top.linkHint': 'Uzoq turib qolgan tovarlarni chegirma yoki chiqarish orqali bo‘shatish mumkin',
    'unit.liter': 'l',
    'unit.days': 'kun',
    'empty.title': 'Saqlash xarajati yo‘q',
    'empty.hint': 'Tanlangan davr uchun pullik saqlash bo‘yicha yozuv topilmadi',
    'export.failed': 'Excel faylini yuklab bo‘lmadi',
  },
  ru: {
    title: 'Платное хранение',
    subtitle: 'Стоимость хранения на складе Uzum и её влияние на прибыль',
    'actual.title': 'Удержано Uzum',
    'actual.subtitle': 'Фактическая плата за хранение за выбранный период',
    'kpi.amount': 'Хранение за период',
    'kpi.amountHint': 'Итого за выбранный период',
    'kpi.perDay': 'В среднем за день',
    'kpi.perDayHint': 'Плата за один день',
    'kpi.volume': 'Общий объём',
    'kpi.volumeHint': 'Объём хранящегося товара',
    'kpi.share': 'Доля в прибыли',
    'kpi.shareHint': 'Какой процент чистой прибыли ушёл на хранение',
    'kpi.shareEmpty': 'Нет данных о прибыли',
    'chart.daily': 'Динамика по дням',
    'chart.dailySub': 'Плата за хранение в разрезе дней',
    'chart.amount': 'Плата за хранение',
    'col.product': 'Товар',
    'col.qty': 'Шт.',
    'col.volume': 'Объём (л)',
    'col.amount': 'Сумма',
    'col.perUnit': 'За штуку',
    'col.days': 'Дней хранения',
    'col.share': 'Доля в прибыли',
    'table.title': 'Расходы на хранение',
    'table.pageTotal': 'Итого на странице',
    'top.title': 'Самое дорогое хранение',
    'top.hint': 'Основная часть платы приходится на эти 5 позиций',
    'top.link': 'Смотреть неликвиды',
    'top.linkHint': 'Залежавшийся товар можно распродать со скидкой или вывезти',
    'unit.liter': 'л',
    'unit.days': 'дн.',
    'empty.title': 'Расходов на хранение нет',
    'empty.hint': 'За выбранный период записей по платному хранению не найдено',
    'export.failed': 'Не удалось скачать файл Excel',
  },
  en: {
    title: 'Paid storage',
    subtitle: 'What Uzum warehousing costs you and how it eats into profit',
    'actual.title': 'Charged by Uzum',
    'actual.subtitle': 'Actual storage fees for the selected period',
    'kpi.amount': 'Storage fee for the period',
    'kpi.amountHint': 'Total for the selected period',
    'kpi.perDay': 'Daily average',
    'kpi.perDayHint': 'Charge per single day',
    'kpi.volume': 'Total volume',
    'kpi.volumeHint': 'Volume of goods in storage',
    'kpi.share': 'Share of profit',
    'kpi.shareHint': 'How much of net profit went to storage',
    'kpi.shareEmpty': 'No profit data',
    'chart.daily': 'Daily trend',
    'chart.dailySub': 'Storage fee day by day',
    'chart.amount': 'Storage fee',
    'col.product': 'Product',
    'col.qty': 'Units',
    'col.volume': 'Volume (L)',
    'col.amount': 'Amount',
    'col.perUnit': 'Per unit',
    'col.days': 'Days stored',
    'col.share': 'Share of profit',
    'table.title': 'Storage costs',
    'table.pageTotal': 'Page total',
    'top.title': 'Most expensive to store',
    'top.hint': 'These five positions account for most of the storage bill',
    'top.link': 'Open dead stock',
    'top.linkHint': 'Slow movers can be discounted or withdrawn to free up space',
    'unit.liter': 'L',
    'unit.days': 'days',
    'empty.title': 'No storage costs',
    'empty.hint': 'No paid-storage records for the selected period',
    'export.failed': 'Could not download the Excel file',
  },
});

/** Foydadagi ulush chegaralari — KPI kartochkasi va jadval bir xil zonada */
function shareClass(share: number): string {
  if (share > 30) return 'text-danger-ink';
  if (share > 15) return 'text-warn-ink';
  return 'text-ink-soft';
}

function shareTone(share: number | null): 'brand' | 'warn' | 'danger' {
  if (share === null) return 'brand';
  if (share > 30) return 'danger';
  if (share > 15) return 'warn';
  return 'brand';
}

export default function Storage() {
  const t = useT('storage');
  const f = useFormat();
  const q = usePeriodQuery();

  const [page, setPage] = useState(1);
  const [exporting, setExporting] = useState(false);

  const query = useMemo(() => ({ ...q, page, pageSize: 25 }), [q, page]);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['warehouse-storage', query],
    queryFn: () => api.get<StorageResponse>('/warehouse/storage', query),
  });

  /** Foydadagi ulushni hisoblash uchun davr foydasi kerak */
  const { data: dashboard } = useQuery({
    queryKey: ['storage-profit', q],
    queryFn: () => api.get<DashboardResponse>('/analytics/dashboard', q),
    staleTime: 120_000,
  });

  const rows = data?.rows.items ?? [];
  const totals = data?.totals ?? { amount: 0, perDay: 0, volumeL: 0 };
  const daily = data?.daily ?? [];

  const netProfit = dashboard?.netProfit.value ?? 0;
  const profitShare = netProfit > 0 ? (totals.amount / netProfit) * 100 : null;

  const top5 = useMemo(() => {
    const max = rows.reduce((m, r) => Math.max(m, r.amount), 0) || 1;
    return [...rows]
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 5)
      .map((r) => ({ ...r, bar: (r.amount / max) * 100 }));
  }, [rows]);

  const onExport = async () => {
    setExporting(true);
    try {
      const blob = await api.blob('/export/storage', query);
      downloadBlob(blob, `storage-${q.from}_${q.to}.xlsx`);
    } catch {
      toast.error(t('export.failed'));
    } finally {
      setExporting(false);
    }
  };

  const columns: Column<StorageRow>[] = useMemo(
    () => [
      {
        key: 'product',
        header: t('col.product'),
        // Nom ikki qatorda — oxirgi "Foydadagi ulushi" ustuni 1366px da ekrandan chiqib ketardi
        render: (r) => <ProductTitleCell title={r.title ?? r.sku ?? '—'} subtitle={r.sku ?? undefined} maxWidth={260} />,
        sortable: true,
        sortValue: (r) => r.title ?? r.sku ?? '',
      },
      {
        key: 'qty',
        header: t('col.qty'),
        align: 'right',
        render: (r) => <span className="tnum">{f.num(r.qty)}</span>,
        sortable: true,
        sortValue: (r) => r.qty,
      },
      {
        key: 'volume',
        header: t('col.volume'),
        align: 'right',
        hideOnMobile: true,
        render: (r) => (
          <span className="tnum whitespace-nowrap text-muted">
            {f.num(r.volumeL, 1)} {t('unit.liter')}
          </span>
        ),
        sortable: true,
        sortValue: (r) => r.volumeL,
      },
      {
        key: 'amount',
        header: t('col.amount'),
        align: 'right',
        render: (r) => <span className="tnum font-medium text-ink">{f.money(r.amount)}</span>,
        sortable: true,
        sortValue: (r) => r.amount,
      },
      {
        key: 'perUnit',
        header: t('col.perUnit'),
        align: 'right',
        hideOnMobile: true,
        render: (r) => <span className="tnum text-muted">{f.money(r.perUnit)}</span>,
        sortable: true,
        sortValue: (r) => r.perUnit,
      },
      {
        key: 'days',
        header: t('col.days'),
        align: 'right',
        hideOnMobile: true,
        render: (r) => (
          <span className="tnum text-muted">
            {f.num(r.daysStored)} {t('unit.days')}
          </span>
        ),
        sortable: true,
        sortValue: (r) => r.daysStored,
      },
      {
        key: 'share',
        header: t('col.share'),
        align: 'right',
        render: (r) => (
          <span className={cn('tnum font-semibold', shareClass(r.shareOfProfit))}>{f.pct(r.shareOfProfit)}</span>
        ),
        sortable: true,
        sortValue: (r) => r.shareOfProfit,
      },
    ],
    [t, f],
  );

  const pageQty = rows.reduce((s, r) => s + r.qty, 0);
  const pageVolume = rows.reduce((s, r) => s + r.volumeL, 0);
  const pageAmount = rows.reduce((s, r) => s + r.amount, 0);

  return (
    <>
      <PageHeader
        icon={<Archive className="h-5 w-5" />}
        title={t('title')}
        description={t('subtitle')}
        badge={<PreviewBadge feature="paid_storage" />}
        meta={
          <>
            <span className="meta-chip tnum">
              <CalendarRange className="h-3.5 w-3.5" />
              {f.date(q.from)} — {f.date(q.to)}
            </span>
            <DataFreshness />
          </>
        }
        actions={
          <Button variant="outline" icon={<Download className="h-4 w-4" />} loading={exporting} onClick={onExport}>
            Excel
          </Button>
        }
      />

      <FilterBar />

      <PlanGate feature="paid_storage">
        <div className="space-y-5">
          {/*
            Ikki bo'lim: avval bugungi holat (aylanma va tarif — davrga bog'liq
            emas, Uzum to'lovni har kuni oxirgi 15 kundan hisoblaydi), keyin
            Uzum tanlangan davrda haqiqatda ushlagan to'lov. Ilgari sahifada
            faqat ikkinchisi bor edi — qaysi SKU nega pullik bo'lgani va
            ertaga qancha ketishi ko'rinmasdi (2026-10-24).
          */}
          <TurnoverSection storeId={q.storeId} />

          <SectionHeading
            id="storage-actual-title"
            className="pt-4"
            tone="violet"
            icon={<Coins />}
            title={t('actual.title')}
            subtitle={t('actual.subtitle')}
            meta={
              <span className="meta-chip tnum">
                <CalendarRange className="h-3.5 w-3.5" />
                {f.date(q.from)} — {f.date(q.to)}
              </span>
            }
          />
          {/*
            Ohanglar: saqlash to'lovini Uzum ushlab qoladi — binafsha; kunlik
            sarf — davom etayotgan xarajat (za'faron); hajm — qoldiq (ko'k);
            foydadagi ulush jadvaldagi bilan bir xil zonada (15% / 30%).
          */}
          <StatGrid>
            <StatCard
              label={t('kpi.amount')}
              value={f.money(totals.amount)}
              hint={t('kpi.amountHint')}
              icon={<Coins className="h-5 w-5" />}
              tone="violet"
              loading={isLoading}
            />
            <StatCard
              label={t('kpi.perDay')}
              value={f.money(totals.perDay)}
              hint={t('kpi.perDayHint')}
              icon={<CalendarDays className="h-5 w-5" />}
              tone="warn"
              loading={isLoading}
            />
            <StatCard
              label={t('kpi.volume')}
              value={`${f.num(totals.volumeL, 1)} ${t('unit.liter')}`}
              hint={t('kpi.volumeHint')}
              icon={<Box className="h-5 w-5" />}
              tone="info"
              loading={isLoading}
            />
            <StatCard
              label={t('kpi.share')}
              value={profitShare === null ? '—' : f.pct(profitShare)}
              hint={profitShare === null ? t('kpi.shareEmpty') : t('kpi.shareHint')}
              icon={<PieChart className="h-5 w-5" />}
              tone={shareTone(profitShare)}
              loading={isLoading}
            />
          </StatGrid>

          {isError ? (
            <Card>
              <ErrorState message={error instanceof Error ? error.message : undefined} onRetry={() => refetch()} />
            </Card>
          ) : (
            <>
              <ChartCard title={t('chart.daily')} subtitle={t('chart.dailySub')} icon={<BarChart3 />}>
                {isLoading ? (
                  <div className="skeleton h-[280px] w-full" />
                ) : daily.length ? (
                  <BarsChart
                    data={daily}
                    xKey="date"
                    xIsDate
                    // Saqlash xarajati hamma joyda bir rangda (COST_COLORS) — Boshqaruv paneli va Moliya bilan bir xil
                    series={[{ key: 'amount', name: t('chart.amount'), money: true, color: COST_COLORS.storage }]}
                    height={280}
                  />
                ) : (
                  <EmptyState icon={<Archive className="h-6 w-6" />} title={t('empty.title')} hint={t('empty.hint')} />
                )}
              </ChartCard>

              {top5.length ? (
                <Card tone="warn">
                  <CardHeader
                    icon={<Coins className="h-4 w-4" />}
                    title={t('top.title')}
                    subtitle={t('top.hint')}
                    actions={
                      <Link
                        to="/illiquid"
                        title={t('top.linkHint')}
                        className="btn-outline px-3.5 py-2 text-sm text-brand-ink"
                      >
                        <Snowflake className="h-4 w-4" />
                        {t('top.link')}
                      </Link>
                    }
                  />
                  <CardBody>
                    <ul className="space-y-4">
                      {top5.map((r, i) => (
                        <li key={r.skuId ?? r.sku ?? `top-${i}`}>
                          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                            <ProductTitleCell
                              title={r.title ?? r.sku ?? '—'}
                              subtitle={r.sku ?? undefined}
                              size={34}
                              maxWidth={420}
                            />
                            <div className="flex items-center gap-3 text-xs">
                              <span className="tnum text-muted">
                                {f.num(r.daysStored)} {t('unit.days')}
                              </span>
                              <span className="tnum whitespace-nowrap font-display text-sm font-bold text-ink">
                                {f.money(r.amount)}
                              </span>
                            </div>
                          </div>
                          <ProgressBar value={r.bar} tone={r.shareOfProfit > 30 ? 'danger' : 'warn'} />
                        </li>
                      ))}
                    </ul>
                  </CardBody>
                </Card>
              ) : null}

              <Card>
                <CardHeader
                  icon={<Archive className="h-4 w-4" />}
                  title={t('table.title')}
                  actions={
                    <span className="meta-chip tnum">
                      {f.num(data?.rows.total ?? 0)} {t('common.rows')}
                    </span>
                  }
                />
                <div className="mt-4">
                  <DataTable
                    columns={columns}
                    rows={rows}
                    rowKey={(r, i) => r.skuId ?? r.sku ?? `row-${i}`}
                    loading={isLoading}
                    empty={<EmptyState icon={<Archive className="h-6 w-6" />} title={t('empty.title')} hint={t('empty.hint')} />}
                    pagination={
                      data
                        ? {
                            page: data.rows.page,
                            pages: data.rows.pages,
                            total: data.rows.total,
                            pageSize: data.rows.pageSize,
                            onPage: (p) => setPage(p),
                          }
                        : undefined
                    }
                    footer={
                      rows.length ? (
                        <>
                          <td className="px-5 py-3 eyebrow-lg">
                            {t('table.pageTotal')}
                          </td>
                          <td className="tnum px-5 py-3 text-right">{f.num(pageQty)}</td>
                          {/* Yashiringan ustunlar bilan bir xil klass — aks holda mobilda
                              qiymatlar boshqa ustun ostiga siljib ketardi.
                              nowrap: "10 184,2 l" va summa ikki qatorga sinmasin */}
                          <td className="tnum hidden whitespace-nowrap px-5 py-3 text-right md:table-cell">
                            {f.num(pageVolume, 1)} {t('unit.liter')}
                          </td>
                          <td className="tnum whitespace-nowrap px-5 py-3 text-right">{f.money(pageAmount)}</td>
                          <td className="hidden px-5 py-3 md:table-cell" colSpan={2} />
                          <td className="px-5 py-3" />
                        </>
                      ) : undefined
                    }
                  />
                </div>
              </Card>
            </>
          )}
        </div>
      </PlanGate>
    </>
  );
}
