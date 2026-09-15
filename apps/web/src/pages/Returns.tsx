import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Coins, Download, Percent, Receipt, Undo2 } from 'lucide-react';
import { eachDay, type ReturnRow, type ReturnsResponse } from '@savdoiq/shared';
import { registerNamespace, useFormat, useT } from '@/i18n';
import { api } from '@/lib/api';
import { usePeriodQuery } from '@/store/ui';
import { cn, downloadBlob } from '@/lib/utils';
import { FilterBar } from '@/components/filters';
import { ChartCard, DonutChart, SERIES_PALETTE, TrendChart } from '@/components/charts';
import {
  Badge,
  Button,
  Card,
  DataTable,
  EmptyState,
  ErrorState,
  PageHeader,
  PlanGate,
  PreviewBadge,
  ProductCell,
  ProgressBar,
  SearchInput,
  StatCard,
  StatGrid,
  toast,
  type Column,
  type Tone,
} from '@/components/ui';

registerNamespace('returns', {
  uz: {
    title: 'Qaytarishlar',
    subtitle: 'Qaytarish sabablari, dinamikasi va eng ko‘p qaytariladigan mahsulotlar',
    'kpi.count': 'Qaytarishlar soni',
    'kpi.countHint': 'Davr uchun jami dona',
    'kpi.amount': 'Qaytarish summasi',
    'kpi.amountHint': 'Yo‘qotilgan tushum',
    'kpi.rate': 'Qaytarish ulushi',
    'kpi.rateHint': 'Sotuvdagi qaytarishlar foizi',
    'kpi.avg': 'O‘rtacha qaytarish qiymati',
    'kpi.avgHint': 'Bitta dona uchun',
    'chart.reasons': 'Sabablar bo‘yicha',
    'chart.reasonsSub': 'Qaytarishlar sabablarining taqsimoti',
    'chart.dynamics': 'Vaqt bo‘yicha dinamika',
    'chart.dynamicsSub': 'Kunlik qaytarishlar soni',
    'chart.count': 'Qaytarishlar',
    'chart.center': 'Jami',
    'col.product': 'Mahsulot',
    'col.order': 'Buyurtma kodi',
    'col.qty': 'Dona',
    'col.amount': 'Summa',
    'col.reason': 'Sabab',
    'status.new': 'Yangi',
    'status.processing': 'Jarayonda',
    'status.accepted': 'Qabul qilingan',
    'status.completed': 'Yakunlangan',
    'status.returned': 'Qaytarilgan',
    'status.canceled': 'Bekor qilingan',
    'status.rejected': 'Rad etilgan',
    'col.status': 'Holat',
    'col.date': 'Sana',
    'table.title': 'Qaytarishlar ro‘yxati',
    'table.pageTotal': 'Sahifadagi jami',
    'alert.title': 'Yuqori qaytarish ulushiga ega mahsulotlar',
    'alert.hint': 'Ushbu mahsulotlar barcha qaytarishlarning katta qismini tashkil qiladi — tavsif, o‘lcham jadvali va qadoqni tekshiring',
    'alert.share': 'qaytarishlardan',
    'reason.unknown': 'Sabab ko‘rsatilmagan',
    'search.placeholder': 'Mahsulot yoki buyurtma kodi',
    'empty.title': 'Qaytarishlar yo‘q',
    'empty.hint': 'Tanlangan davrda qaytarish qayd etilmagan',
    'empty.reasons': 'Sabablar bo‘yicha ma’lumot yo‘q',
    'export.failed': 'Excel faylini yuklab bo‘lmadi',
  },
  ru: {
    title: 'Возвраты',
    subtitle: 'Причины возвратов, динамика и товары с наибольшим числом возвратов',
    'kpi.count': 'Количество возвратов',
    'kpi.countHint': 'Всего штук за период',
    'kpi.amount': 'Сумма возвратов',
    'kpi.amountHint': 'Потерянная выручка',
    'kpi.rate': 'Доля возвратов',
    'kpi.rateHint': 'Процент возвратов от продаж',
    'kpi.avg': 'Средняя стоимость возврата',
    'kpi.avgHint': 'На одну штуку',
    'chart.reasons': 'По причинам',
    'chart.reasonsSub': 'Распределение причин возвратов',
    'chart.dynamics': 'Динамика по времени',
    'chart.dynamicsSub': 'Количество возвратов по дням',
    'chart.count': 'Возвраты',
    'chart.center': 'Всего',
    'col.product': 'Товар',
    'col.order': 'Код заказа',
    'col.qty': 'Шт.',
    'col.amount': 'Сумма',
    'col.reason': 'Причина',
    'status.new': 'Новый',
    'status.processing': 'В обработке',
    'status.accepted': 'Принят',
    'status.completed': 'Завершён',
    'status.returned': 'Возвращён',
    'status.canceled': 'Отменён',
    'status.rejected': 'Отклонён',
    'col.status': 'Статус',
    'col.date': 'Дата',
    'table.title': 'Список возвратов',
    'table.pageTotal': 'Итого на странице',
    'alert.title': 'Товары с высокой долей возвратов',
    'alert.hint': 'На эти товары приходится основная часть возвратов — проверьте описание, размерную сетку и упаковку',
    'alert.share': 'от возвратов',
    'reason.unknown': 'Причина не указана',
    'search.placeholder': 'Товар или код заказа',
    'empty.title': 'Возвратов нет',
    'empty.hint': 'За выбранный период возвраты не зафиксированы',
    'empty.reasons': 'Нет данных по причинам',
    'export.failed': 'Не удалось скачать файл Excel',
  },
  en: {
    title: 'Returns',
    subtitle: 'Return reasons, trends and the products customers send back most',
    'kpi.count': 'Returned units',
    'kpi.countHint': 'Total units for the period',
    'kpi.amount': 'Returned amount',
    'kpi.amountHint': 'Revenue lost to returns',
    'kpi.rate': 'Return rate',
    'kpi.rateHint': 'Share of sales that came back',
    'kpi.avg': 'Average return value',
    'kpi.avgHint': 'Per single unit',
    'chart.reasons': 'By reason',
    'chart.reasonsSub': 'How return reasons are distributed',
    'chart.dynamics': 'Trend over time',
    'chart.dynamicsSub': 'Returned units per day',
    'chart.count': 'Returns',
    'chart.center': 'Total',
    'col.product': 'Product',
    'col.order': 'Order code',
    'col.qty': 'Units',
    'col.amount': 'Amount',
    'col.reason': 'Reason',
    'status.new': 'New',
    'status.processing': 'Processing',
    'status.accepted': 'Accepted',
    'status.completed': 'Completed',
    'status.returned': 'Returned',
    'status.canceled': 'Canceled',
    'status.rejected': 'Rejected',
    'col.status': 'Status',
    'col.date': 'Date',
    'table.title': 'Return records',
    'table.pageTotal': 'Page total',
    'alert.title': 'Products with a high return share',
    'alert.hint': 'These products drive most of your returns — review the description, size chart and packaging',
    'alert.share': 'of all returns',
    'reason.unknown': 'Reason not provided',
    'search.placeholder': 'Product or order code',
    'empty.title': 'No returns',
    'empty.hint': 'Nothing was returned in the selected period',
    'empty.reasons': 'No reason data available',
    'export.failed': 'Could not download the Excel file',
  },
});

/** Serverdan kelgan holat kodlari uchun tarjima kalitlari */
const STATUS_KEY: Record<string, string> = {
  new: 'status.new',
  processing: 'status.processing',
  accepted: 'status.accepted',
  completed: 'status.completed',
  returned: 'status.returned',
  canceled: 'status.canceled',
  rejected: 'status.rejected',
};

const STATUS_TONE: Record<string, Tone> = {
  new: 'info',
  processing: 'info',
  accepted: 'brand',
  completed: 'brand',
  returned: 'warn',
  canceled: 'muted',
  rejected: 'danger',
};

export default function Returns() {
  const t = useT('returns');
  const f = useFormat();
  const q = usePeriodQuery();

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [exporting, setExporting] = useState(false);

  const query = useMemo(() => ({ ...q, page, pageSize: 25, search: search || undefined }), [q, page, search]);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['warehouse-returns', query],
    queryFn: () => api.get<ReturnsResponse>('/warehouse/returns', query),
  });

  const rows = data?.rows.items ?? [];
  const totals = data?.totals ?? { qty: 0, amount: 0, rate: 0 };
  const avgValue = totals.qty > 0 ? totals.amount / totals.qty : 0;

  const reasons = useMemo(() => {
    const list = data?.byReason ?? [];
    return [...list].sort((a, b) => b.qty - a.qty);
  }, [data]);

  const donut = useMemo(
    () =>
      reasons.slice(0, 8).map((r, i) => ({
        name: r.reason || t('reason.unknown'),
        value: r.qty,
        color: SERIES_PALETTE[i % SERIES_PALETTE.length],
      })),
    [reasons, t],
  );

  /** Kunlik dinamika — javobda tayyor seriya yo'q, shuning uchun qatorlardan yig'amiz */
  /** Kunlik seriya serverdan — butun davr bo'yicha (jadval sahifasiga bog'liq emas) */
  const daily = useMemo(
    () => (data?.daily ?? []).map((d) => ({ date: d.date, qty: d.qty, amount: d.amount })),
    [data],
  );

  /** Eng ko'p qaytariladigan 5 mahsulot (barcha qaytarishlardagi ulushi bo'yicha) */
  /** Eng ko'p qaytariladigan tovarlar — serverdan, butun davr bo'yicha */
  const topRisky = useMemo(() => data?.topRisky ?? [], [data]);

  const onExport = async () => {
    setExporting(true);
    try {
      const blob = await api.blob('/export/returns', query);
      downloadBlob(blob, `returns-${q.from}_${q.to}.xlsx`);
    } catch {
      toast.error(t('export.failed'));
    } finally {
      setExporting(false);
    }
  };

  const columns: Column<ReturnRow>[] = useMemo(
    () => [
      {
        key: 'product',
        header: t('col.product'),
        width: '30%',
        render: (r) => (
          <ProductCell title={r.title ?? r.sku ?? '—'} subtitle={r.sku ?? undefined} imageUrl={r.imageUrl} />
        ),
        sortable: true,
        sortValue: (r) => r.title ?? r.sku ?? '',
      },
      {
        key: 'order',
        header: t('col.order'),
        hideOnMobile: true,
        render: (r) => <span className="tnum text-muted">{r.orderCode ?? '—'}</span>,
        sortValue: (r) => r.orderCode ?? '',
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
        key: 'amount',
        header: t('col.amount'),
        align: 'right',
        render: (r) => <span className="tnum font-medium text-ink">{f.money(r.amount)}</span>,
        sortable: true,
        sortValue: (r) => r.amount,
      },
      {
        key: 'reason',
        header: t('col.reason'),
        render: (r) => (
          <span className="line-clamp-2 max-w-[220px] text-sm text-ink-soft">{r.reason || t('reason.unknown')}</span>
        ),
        sortValue: (r) => r.reason ?? '',
      },
      {
        key: 'status',
        header: t('col.status'),
        render: (r) => (
          <Badge tone={STATUS_TONE[r.status] ?? 'muted'} dot>
            {STATUS_KEY[r.status] ? t(STATUS_KEY[r.status]) : r.status}
          </Badge>
        ),
        sortValue: (r) => r.status,
      },
      {
        key: 'date',
        header: t('col.date'),
        align: 'right',
        hideOnMobile: true,
        render: (r) => <span className="tnum text-muted">{f.date(r.returnedAt)}</span>,
        sortable: true,
        sortValue: (r) => r.returnedAt,
      },
    ],
    [t, f],
  );

  const pageQty = rows.reduce((s, r) => s + r.qty, 0);
  const pageAmount = rows.reduce((s, r) => s + r.amount, 0);

  return (
    <>
      <PageHeader
        icon={<Undo2 className="h-5 w-5" />}
        title={t('title')}
        description={t('subtitle')}
        badge={<PreviewBadge feature="returns_report" />}
        actions={
          <Button variant="outline" icon={<Download className="h-4 w-4" />} loading={exporting} onClick={onExport}>
            Excel
          </Button>
        }
      />

      <FilterBar>
        <SearchInput
          className="w-full sm:w-64"
          value={search}
          onChange={(v) => {
            setSearch(v);
            setPage(1);
          }}
          placeholder={t('search.placeholder')}
        />
      </FilterBar>

      <PlanGate feature="returns_report">
        <div className="space-y-5">
          <StatGrid>
            <StatCard
              label={t('kpi.count')}
              value={f.num(totals.qty)}
              hint={t('kpi.countHint')}
              icon={<Undo2 className="h-5 w-5" />}
              tone="warn"
              loading={isLoading}
            />
            <StatCard
              label={t('kpi.amount')}
              value={f.money(totals.amount)}
              hint={t('kpi.amountHint')}
              icon={<Coins className="h-5 w-5" />}
              tone="danger"
              loading={isLoading}
            />
            <StatCard
              label={t('kpi.rate')}
              value={f.pct(totals.rate)}
              hint={t('kpi.rateHint')}
              icon={<Percent className="h-5 w-5" />}
              tone={totals.rate >= 10 ? 'danger' : 'info'}
              loading={isLoading}
            />
            <StatCard
              label={t('kpi.avg')}
              value={f.money(avgValue)}
              hint={t('kpi.avgHint')}
              icon={<Receipt className="h-5 w-5" />}
              tone="violet"
              loading={isLoading}
            />
          </StatGrid>

          {isError ? (
            <Card>
              <ErrorState message={error instanceof Error ? error.message : undefined} onRetry={() => refetch()} />
            </Card>
          ) : (
            <>
              <div className="grid gap-4 grid-cols-1 xl:grid-cols-3">
                <ChartCard title={t('chart.reasons')} subtitle={t('chart.reasonsSub')} className="xl:col-span-1">
                  {isLoading ? (
                    <div className="skeleton h-[260px] w-full" />
                  ) : donut.length ? (
                    <>
                      <DonutChart
                        data={donut}
                        money={false}
                        center={
                          <>
                            <p className="text-xs text-muted">{t('chart.center')}</p>
                            <p className="tnum font-display text-2xl font-extrabold text-ink">{f.num(totals.qty)}</p>
                          </>
                        }
                      />
                      <ul className="mt-4 space-y-3">
                        {reasons.slice(0, 6).map((r, i) => (
                          <li key={`${r.reason}-${i}`}>
                            <div className="mb-1.5 flex items-center justify-between gap-3">
                              <span className="flex min-w-0 items-center gap-2 text-sm text-ink-soft">
                                <span
                                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                                  style={{ background: SERIES_PALETTE[i % SERIES_PALETTE.length] }}
                                />
                                <span className="truncate">{r.reason || t('reason.unknown')}</span>
                              </span>
                              <span className="tnum shrink-0 text-sm font-semibold text-ink">{f.pct(r.share)}</span>
                            </div>
                            <ProgressBar value={r.share} tone="brand" />
                          </li>
                        ))}
                      </ul>
                    </>
                  ) : (
                    <EmptyState icon={<Undo2 className="h-6 w-6" />} title={t('empty.reasons')} />
                  )}
                </ChartCard>

                <ChartCard title={t('chart.dynamics')} subtitle={t('chart.dynamicsSub')} className="xl:col-span-2">
                  {isLoading ? (
                    <div className="skeleton h-[300px] w-full" />
                  ) : (
                    <TrendChart
                      data={daily}
                      xKey="date"
                      series={[{ key: 'qty', name: t('chart.count') }]}
                      showLegend={false}
                      height={300}
                    />
                  )}
                </ChartCard>
              </div>

              {topRisky.length ? (
                <Card className="border-warn/30 bg-warn/5 p-5">
                  <div className="flex items-start gap-3">
                    <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-warn/[0.12] text-warn">
                      <AlertTriangle className="h-4 w-4" />
                    </span>
                    <div className="min-w-0">
                      <h3 className="section-title">{t('alert.title')}</h3>
                      <p className="mt-0.5 text-sm text-muted">{t('alert.hint')}</p>
                    </div>
                  </div>
                  <ul className="mt-4 grid gap-3 grid-cols-1 sm:grid-cols-2 xl:grid-cols-3">
                    {topRisky.map((p) => (
                      <li key={p.key} className="rounded-xl border border-line bg-surface p-3">
                        <ProductCell title={p.title} subtitle={p.sku ?? undefined} imageUrl={p.imageUrl} size={34} />
                        <div className="mt-3 flex items-center justify-between gap-2 text-xs">
                          <span className="text-muted">
                            {f.num(p.qty)} {t('common.units')} · {f.money(p.amount)}
                          </span>
                          <span className={cn('tnum font-semibold', p.share >= 25 ? 'text-danger' : 'text-warn')}>
                            {f.pct(p.share)} {t('alert.share')}
                          </span>
                        </div>
                        <ProgressBar className="mt-2" value={p.share} tone={p.share >= 25 ? 'danger' : 'warn'} />
                      </li>
                    ))}
                  </ul>
                </Card>
              ) : null}

              <Card>
                <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-5">
                  <h3 className="section-title">{t('table.title')}</h3>
                  <p className="text-sm text-muted">
                    {f.num(data?.rows.total ?? 0)} {t('common.rows')}
                  </p>
                </div>
                <div className="mt-4">
                  <DataTable
                    columns={columns}
                    rows={rows}
                    rowKey={(r) => r.id}
                    loading={isLoading}
                    empty={<EmptyState icon={<Undo2 className="h-6 w-6" />} title={t('empty.title')} hint={t('empty.hint')} />}
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
                          <td className="px-4 py-3 text-xs uppercase tracking-wide text-muted" colSpan={2}>
                            {t('table.pageTotal')}
                          </td>
                          <td className="tnum px-4 py-3 text-right">{f.num(pageQty)}</td>
                          <td className="tnum px-4 py-3 text-right">{f.money(pageAmount)}</td>
                          <td className="px-4 py-3" colSpan={3} />
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
