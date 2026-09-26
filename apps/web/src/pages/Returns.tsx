import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Coins, Download, Percent, Receipt, Undo2 } from 'lucide-react';
import { eachDay, type ReturnKind, type ReturnRow, type ReturnsResponse } from '@savdoiq/shared';
import { registerNamespace, useFormat, useT } from '@/i18n';
import { api } from '@/lib/api';
import { usePeriodQuery } from '@/store/ui';
import { cn, downloadBlob } from '@/lib/utils';
import { FilterBar } from '@/components/filters';
import { ChartCard, DonutChart, SERIES_PALETTE, TrendChart, seriesColor } from '@/components/charts';
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
  Segmented,
  StatCard,
  StatGrid,
  toast,
  type Column,
  type Tone,
} from '@/components/ui';

registerNamespace('returns', {
  uz: {
    title: 'Qaytarishlar',
    subtitle: 'Qaytarish va bekor qilishlar: sabablari, dinamikasi va eng ko‘p qaytariladigan mahsulotlar',
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
    'kind.returned': 'Qaytarishlar',
    'kind.canceled': 'Bekor qilishlar',
    'kind.all': 'Hammasi',
    'kind.returnedHint': 'Tovar punktga keldi: xaridor olmadi yoki oldi-yu qaytardi',
    'kind.canceledHint': 'Xaridor buyurtma berib, tovarni olmasdan bekor qildi',
    'kind.allHint': 'Qaytarishlar va bekor qilishlar birga',
    'col.kind': 'Turi',
    'kpi.count.canceled': 'Bekor qilishlar soni',
    'kpi.amount.canceled': 'Bekor qilingan summa',
    'kpi.amountHint.canceled': 'Sotilmay qolgan tushum',
    'kpi.rate.canceled': 'Bekor qilish ulushi',
    'kpi.rateHint.canceled': 'Buyurtmalardagi bekor qilishlar foizi',
    'kpi.avg.canceled': 'O‘rtacha bekor qilingan qiymat',
    'kpi.count.all': 'Qaytarish + bekor qilish',
    'kpi.amount.all': 'Jami summa',
    'kpi.amountHint.all': 'Sotilmay qolgan va qaytgan tushum',
    'kpi.rate.all': 'Jami ulush',
    'kpi.rateHint.all': 'Buyurtmalardan sotilmay qolganlari foizi',
    'kpi.avg.all': 'O‘rtacha qiymat',
    'chart.reasonsSub.canceled': 'Bekor qilish sabablarining taqsimoti',
    'chart.reasonsSub.all': 'Barcha sabablar taqsimoti',
    'chart.dynamicsSub.canceled': 'Kunlik bekor qilishlar soni',
    'chart.dynamicsSub.all': 'Kunlik qaytarish va bekor qilishlar',
    'chart.count.canceled': 'Bekor qilishlar',
    'chart.count.all': 'Jami',
    'table.title.canceled': 'Bekor qilishlar ro‘yxati',
    'table.title.all': 'Qaytarish va bekor qilishlar',
    'empty.title.canceled': 'Bekor qilishlar yo‘q',
    'empty.hint.canceled': 'Tanlangan davrda bekor qilish qayd etilmagan',
    'empty.title.all': 'Qaytarish va bekor qilishlar yo‘q',
    'empty.hint.all': 'Tanlangan davrda hech narsa qaytmagan va bekor qilinmagan',
    'reason.cancelBeforeReceipt': 'Qabul qilishdan oldin bekor qilindi',
    'reason.sizeMismatch': 'O‘lchami to‘g‘ri kelmadi',
    'reason.noReason': 'Xaridor sabab ko‘rsatmadi',
    'reason.missingItem': 'Buyurtmada tovar bo‘lmagan',
  },
  ru: {
    title: 'Возвраты',
    subtitle: 'Возвраты и отмены: причины, динамика и товары с наибольшим числом возвратов',
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
    'kind.returned': 'Возвраты',
    'kind.canceled': 'Отмены',
    'kind.all': 'Все',
    'kind.returnedHint': 'Товар пришёл в пункт выдачи: покупатель не забрал или забрал и вернул',
    'kind.canceledHint': 'Покупатель отменил заказ, не получив товар',
    'kind.allHint': 'Возвраты и отмены вместе',
    'col.kind': 'Тип',
    'kpi.count.canceled': 'Количество отмен',
    'kpi.amount.canceled': 'Сумма отмен',
    'kpi.amountHint.canceled': 'Непроданная выручка',
    'kpi.rate.canceled': 'Доля отмен',
    'kpi.rateHint.canceled': 'Процент отменённых заказов',
    'kpi.avg.canceled': 'Средняя стоимость отмены',
    'kpi.count.all': 'Возвраты + отмены',
    'kpi.amount.all': 'Общая сумма',
    'kpi.amountHint.all': 'Непроданная и возвращённая выручка',
    'kpi.rate.all': 'Общая доля',
    'kpi.rateHint.all': 'Процент заказов, не ставших продажей',
    'kpi.avg.all': 'Средняя стоимость',
    'chart.reasonsSub.canceled': 'Распределение причин отмен',
    'chart.reasonsSub.all': 'Распределение всех причин',
    'chart.dynamicsSub.canceled': 'Количество отмен по дням',
    'chart.dynamicsSub.all': 'Возвраты и отмены по дням',
    'chart.count.canceled': 'Отмены',
    'chart.count.all': 'Всего',
    'table.title.canceled': 'Список отмен',
    'table.title.all': 'Возвраты и отмены',
    'empty.title.canceled': 'Отмен нет',
    'empty.hint.canceled': 'За выбранный период отмены не зафиксированы',
    'empty.title.all': 'Возвратов и отмен нет',
    'empty.hint.all': 'За выбранный период ничего не вернули и не отменили',
    'reason.cancelBeforeReceipt': 'Отменён до получения',
    'reason.sizeMismatch': 'Не подошёл размер',
    'reason.noReason': 'Клиент не указал причину',
    'reason.missingItem': 'Товара не оказалось в заказе',
  },
  en: {
    title: 'Returns',
    subtitle: 'Returns and cancellations: reasons, trends and the products customers send back most',
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
    'kind.returned': 'Returns',
    'kind.canceled': 'Cancellations',
    'kind.all': 'All',
    'kind.returnedHint': 'Reached the pickup point: the buyer didn’t collect it, or collected and returned it',
    'kind.canceledHint': 'The buyer cancelled the order before receiving it',
    'kind.allHint': 'Returns and cancellations together',
    'col.kind': 'Type',
    'kpi.count.canceled': 'Cancelled units',
    'kpi.amount.canceled': 'Cancelled amount',
    'kpi.amountHint.canceled': 'Revenue that never happened',
    'kpi.rate.canceled': 'Cancellation rate',
    'kpi.rateHint.canceled': 'Share of orders cancelled',
    'kpi.avg.canceled': 'Average cancelled value',
    'kpi.count.all': 'Returns + cancellations',
    'kpi.amount.all': 'Total amount',
    'kpi.amountHint.all': 'Unsold and returned revenue',
    'kpi.rate.all': 'Combined rate',
    'kpi.rateHint.all': 'Share of orders that didn’t become sales',
    'kpi.avg.all': 'Average value',
    'chart.reasonsSub.canceled': 'How cancellation reasons are distributed',
    'chart.reasonsSub.all': 'All reasons combined',
    'chart.dynamicsSub.canceled': 'Cancelled units per day',
    'chart.dynamicsSub.all': 'Returns and cancellations per day',
    'chart.count.canceled': 'Cancellations',
    'chart.count.all': 'Total',
    'table.title.canceled': 'Cancellations',
    'table.title.all': 'Returns and cancellations',
    'empty.title.canceled': 'No cancellations',
    'empty.hint.canceled': 'Nothing was cancelled in the selected period',
    'empty.title.all': 'No returns or cancellations',
    'empty.hint.all': 'Nothing was returned or cancelled in the selected period',
    'reason.cancelBeforeReceipt': 'Cancelled before receipt',
    'reason.sizeMismatch': 'Size didn’t fit',
    'reason.noReason': 'Buyer gave no reason',
    'reason.missingItem': 'Item missing from the order',
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

/**
 * Uzum sababni asl (ruscha) matnda yuboradi. Ko'p uchraydiganlari tarjima
 * qilinadi, qolgani o'zgarishsiz ko'rsatiladi.
 */
const REASON_RULES: ReadonlyArray<readonly [RegExp, string]> = [
  [/до\s+получени/i, 'reason.cancelBeforeReceipt'],
  [/размер/i, 'reason.sizeMismatch'],
  [/не\s+указал\s+причин/i, 'reason.noReason'],
  [/не\s+оказалось/i, 'reason.missingItem'],
];
/** Server sababsiz yozuvlarni shu matn bilan guruhlaydi */
const SERVER_NO_REASON = 'Sabab ko‘rsatilmagan';

type Kind = ReturnKind | 'all';

export default function Returns() {
  const t = useT('returns');
  const f = useFormat();
  const q = usePeriodQuery();

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [exporting, setExporting] = useState(false);
  const [kind, setKind] = useState<Kind>('returned');

  const query = useMemo(
    () => ({ ...q, page, pageSize: 25, search: search || undefined, kind }),
    [q, page, search, kind],
  );

  /** Turga bog'liq matn: `kpi.count` → `kpi.count.canceled` (qaytarish — asosiy kalit) */
  const tk = (key: string) => (kind === 'returned' ? t(key) : t(`${key}.${kind}`));
  const reasonLabel = (raw: string | null | undefined) => {
    const value = raw?.trim();
    if (!value || value === SERVER_NO_REASON) return t('reason.unknown');
    const rule = REASON_RULES.find(([re]) => re.test(value));
    return rule ? t(rule[1]) : value;
  };

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
        name: reasonLabel(r.reason),
        value: r.qty,
        color: seriesColor(i),
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
          <span className="line-clamp-2 max-w-[220px] text-sm text-ink-soft" title={r.reason ?? undefined}>
            {reasonLabel(r.reason)}
          </span>
        ),
        sortValue: (r) => r.reason ?? '',
      },
      {
        key: 'status',
        header: t('col.kind'),
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
        <Segmented<Kind>
          value={kind}
          onChange={(v) => {
            setKind(v);
            setPage(1);
          }}
          options={[
            { value: 'returned', label: t('kind.returned'), count: data?.counts.returned.qty },
            { value: 'canceled', label: t('kind.canceled'), count: data?.counts.canceled.qty },
            { value: 'all', label: t('kind.all') },
          ]}
        />
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
          <p className="-mt-1 text-sm text-muted">{t(`kind.${kind}Hint`)}</p>
          <StatGrid>
            <StatCard
              label={tk('kpi.count')}
              value={f.num(totals.qty)}
              hint={t('kpi.countHint')}
              icon={<Undo2 className="h-5 w-5" />}
              tone="warn"
              loading={isLoading}
            />
            <StatCard
              label={tk('kpi.amount')}
              value={f.money(totals.amount)}
              hint={tk('kpi.amountHint')}
              icon={<Coins className="h-5 w-5" />}
              tone="danger"
              loading={isLoading}
            />
            <StatCard
              label={tk('kpi.rate')}
              value={f.pct(totals.rate)}
              hint={tk('kpi.rateHint')}
              icon={<Percent className="h-5 w-5" />}
              tone={totals.rate >= 10 ? 'danger' : 'info'}
              loading={isLoading}
            />
            <StatCard
              label={tk('kpi.avg')}
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
                <ChartCard title={t('chart.reasons')} subtitle={tk('chart.reasonsSub')} className="xl:col-span-1">
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
                            <p className="tnum font-display text-2xl font-extrabold tracking-tight text-ink">{f.num(totals.qty)}</p>
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
                                  style={{ background: seriesColor(i) }}
                                />
                                <span className="truncate">{reasonLabel(r.reason)}</span>
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

                <ChartCard title={t('chart.dynamics')} subtitle={tk('chart.dynamicsSub')} className="xl:col-span-2">
                  {isLoading ? (
                    <div className="skeleton h-[300px] w-full" />
                  ) : (
                    <TrendChart
                      data={daily}
                      xKey="date"
                      series={[{ key: 'qty', name: tk('chart.count') }]}
                      showLegend={false}
                      height={300}
                    />
                  )}
                </ChartCard>
              </div>

              {kind === 'returned' && topRisky.length ? (
                <Card className="border-warn/30 bg-warn/5 p-5">
                  <div className="flex items-start gap-3">
                    <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-warn/10 text-warn-ink">
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
                          <span className={cn('tnum font-semibold', p.share >= 25 ? 'text-danger' : 'text-warn-ink')}>
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
                  <h3 className="section-title">{tk('table.title')}</h3>
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
                    empty={<EmptyState icon={<Undo2 className="h-6 w-6" />} title={tk('empty.title')} hint={tk('empty.hint')} />}
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
                          <td className="px-4 py-3 eyebrow-lg" colSpan={2}>
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
