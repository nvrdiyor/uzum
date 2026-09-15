import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowDown, Filter, Info, PackageCheck, Percent, ShoppingBag, Undo2, XCircle } from 'lucide-react';
import type { FunnelResponse, FunnelStepId } from '@savdoiq/shared';
import { api, ApiError } from '@/lib/api';
import { registerNamespace, useFormat, useT } from '@/i18n';
import { usePeriodQuery } from '@/store/ui';
import { FilterBar } from '@/components/filters';
import { ChartCard, TrendChart } from '@/components/charts';
import { CHART_COLORS } from '@/lib/theme';
import {
  Badge,
  Card,
  DataTable,
  Delta,
  EmptyState,
  ErrorState,
  PageHeader,
  PlanGate,
  ProductCell,
  Segmented,
  Skeleton,
  StatCard,
  StatGrid,
  type Column,
} from '@/components/ui';
import { cn } from '@/lib/utils';

registerNamespace('funnel', {
  uz: {
    title: 'Sotuv voronkasi',
    subtitle: 'Buyurtmadan yakuniy sotuvgacha — qayerda yo‘qotyapsiz',
    'kpi.ordered': 'Buyurtma qilindi',
    'kpi.orderedHint': '{v} so‘mlik',
    'kpi.sold': 'Sotildi',
    'kpi.soldHint': '{v} so‘m tushum',
    'kpi.buyout': 'Sotib olish foizi',
    'kpi.buyoutHint': 'Buyurtmalarning qanchasi yetkazildi',
    'kpi.avg': 'O‘rtacha narx',
    'kpi.avgHint': 'Sotilgan bitta dona uchun',
    'step.ordered': 'Buyurtma qilindi',
    'step.sold': 'Sotildi',
    'step.canceled': 'Bekor qilindi',
    'step.returned': 'Qaytarildi',
    'steps.title': 'Voronka bosqichlari',
    'steps.subtitle': 'Har bir bosqichda nechta dona qoldi',
    'steps.units': '{v} dona',
    'steps.conv': 'buyurtmalardan {v}',
    'chart.title': 'Kunlik dinamika',
    'chart.subtitle': 'Buyurtma va sotuv taqqoslamasi',
    'chart.ordered': 'Buyurtma',
    'chart.sold': 'Sotildi',
    'chart.canceled': 'Bekor',
    'chart.returned': 'Qaytarish',
    'table.empty': 'Mos tovar topilmadi',
    'table.emptyHint': 'Tanlangan filtr bo‘yicha tovar yo‘q — “Barchasi” ni tanlab ko‘ring',
    'table.title': 'Mahsulotlar kesimi',
    'table.subtitle': 'Oldingi davr bilan solishtirib',
    'col.product': 'Mahsulot',
    'col.ordered': 'Buyurtma',
    'col.sold': 'Sotildi',
    'col.amount': 'Summa',
    'col.buyout': 'Sotib olish',
    'col.share': 'Ulush',
    'col.avg': 'O‘rtacha narx',
    'filter.all': 'Barchasi',
    'filter.problem': 'Muammoli',
    'filter.top': 'Yetakchilar',
    'note.title': 'Namoyish va savat ma’lumotlari nega yo‘q?',
    'note.body':
      'Uzum Seller API namoyishlar, kartochka ochilishi va savatga qo‘shish bo‘yicha ma’lumot bermaydi — ular faqat Uzum kabinetining ichki analitikasida bor. Shuning uchun voronka buyurtmadan boshlanadi: bu qism to‘liq va aniq.',
    'empty.title': 'Bu davrda buyurtma bo‘lmagan',
    'empty.hint': 'Boshqa davrni tanlang yoki birinchi sotuvni kuting.',
    'problem.title': '{n} ta mahsulotda sotib olish foizi past',
    'problem.body': 'Buyurtmalarning yarmidan ko‘pi yetkazilmagan — narx, tavsif yoki qadoqni tekshiring.',
  },
  ru: {
    title: 'Воронка продаж',
    subtitle: 'От заказа до продажи — где теряются деньги',
    'kpi.ordered': 'Заказано',
    'kpi.orderedHint': 'на {v} сум',
    'kpi.sold': 'Продано',
    'kpi.soldHint': '{v} сум выручки',
    'kpi.buyout': 'Процент выкупа',
    'kpi.buyoutHint': 'Сколько заказов доставлено',
    'kpi.avg': 'Средняя цена',
    'kpi.avgHint': 'За проданную единицу',
    'step.ordered': 'Заказано',
    'step.sold': 'Продано',
    'step.canceled': 'Отменено',
    'step.returned': 'Возвращено',
    'steps.title': 'Этапы воронки',
    'steps.subtitle': 'Сколько штук осталось на каждом этапе',
    'steps.units': '{v} шт.',
    'steps.conv': '{v} от заказов',
    'chart.title': 'Динамика по дням',
    'chart.subtitle': 'Заказы и продажи',
    'chart.ordered': 'Заказы',
    'chart.sold': 'Продано',
    'chart.canceled': 'Отмены',
    'chart.returned': 'Возвраты',
    'table.empty': 'Подходящих товаров нет',
    'table.emptyHint': 'По выбранному фильтру ничего не найдено — попробуйте «Все»',
    'table.title': 'По товарам',
    'table.subtitle': 'В сравнении с прошлым периодом',
    'col.product': 'Товар',
    'col.ordered': 'Заказы',
    'col.sold': 'Продано',
    'col.amount': 'Сумма',
    'col.buyout': 'Выкуп',
    'col.share': 'Доля',
    'col.avg': 'Средняя цена',
    'filter.all': 'Все',
    'filter.problem': 'Проблемные',
    'filter.top': 'Лидеры',
    'note.title': 'Почему нет показов и корзины?',
    'note.body':
      'Uzum Seller API не отдаёт показы, открытия карточки и добавления в корзину — они есть только во внутренней аналитике кабинета. Поэтому воронка начинается с заказа: эта часть полная и точная.',
    'empty.title': 'За этот период заказов не было',
    'empty.hint': 'Выберите другой период или дождитесь первой продажи.',
    'problem.title': 'У {n} товаров низкий выкуп',
    'problem.body': 'Больше половины заказов не доставлено — проверьте цену, описание и упаковку.',
  },
  en: {
    title: 'Sales funnel',
    subtitle: 'From order to sale — where the money leaks',
    'kpi.ordered': 'Ordered',
    'kpi.orderedHint': '{v} UZS worth',
    'kpi.sold': 'Sold',
    'kpi.soldHint': '{v} UZS revenue',
    'kpi.buyout': 'Buyout rate',
    'kpi.buyoutHint': 'Share of orders delivered',
    'kpi.avg': 'Average price',
    'kpi.avgHint': 'Per sold unit',
    'step.ordered': 'Ordered',
    'step.sold': 'Sold',
    'step.canceled': 'Cancelled',
    'step.returned': 'Returned',
    'steps.title': 'Funnel steps',
    'steps.subtitle': 'Units remaining at each step',
    'steps.units': '{v} units',
    'steps.conv': '{v} of orders',
    'chart.title': 'Daily dynamics',
    'chart.subtitle': 'Orders versus sales',
    'chart.ordered': 'Ordered',
    'chart.sold': 'Sold',
    'chart.canceled': 'Cancelled',
    'chart.returned': 'Returned',
    'table.empty': 'No matching products',
    'table.emptyHint': 'Nothing matches this filter — try “All”',
    'table.title': 'By product',
    'table.subtitle': 'Compared with the previous period',
    'col.product': 'Product',
    'col.ordered': 'Orders',
    'col.sold': 'Sold',
    'col.amount': 'Amount',
    'col.buyout': 'Buyout',
    'col.share': 'Share',
    'col.avg': 'Avg price',
    'filter.all': 'All',
    'filter.problem': 'Problematic',
    'filter.top': 'Leaders',
    'note.title': 'Why no impressions or cart data?',
    'note.body':
      'The Uzum Seller API does not expose impressions, card opens or add-to-cart events — they live only inside the Uzum cabinet. The funnel therefore starts at the order, where the data is complete and exact.',
    'empty.title': 'No orders in this period',
    'empty.hint': 'Pick another period or wait for the first sale.',
    'problem.title': '{n} products have a low buyout rate',
    'problem.body': 'More than half of the orders were not delivered — check price, description and packaging.',
  },
});

const STEP_META: Record<FunnelStepId, { color: string; icon: typeof ShoppingBag; tone: 'brand' | 'info' | 'warn' | 'danger' }> = {
  ordered: { color: CHART_COLORS.info, icon: ShoppingBag, tone: 'info' },
  sold: { color: CHART_COLORS.brand, icon: PackageCheck, tone: 'brand' },
  canceled: { color: CHART_COLORS.warn, icon: XCircle, tone: 'warn' },
  returned: { color: CHART_COLORS.danger, icon: Undo2, tone: 'danger' },
};

type RowFilter = 'all' | 'problem' | 'top';

export default function Funnel() {
  const t = useT('funnel');
  const f = useFormat();
  const q = usePeriodQuery();
  const [filter, setFilter] = useState<RowFilter>('all');

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['funnel', q],
    queryFn: () => api.get<FunnelResponse>('/funnel', q),
  });

  const rows = useMemo(() => {
    const all = data?.rows ?? [];
    if (filter === 'problem') return all.filter((r) => r.ordered >= 2 && r.buyoutRate < 50);
    if (filter === 'top') return all.slice(0, 10);
    return all;
  }, [data, filter]);

  const problemCount = useMemo(
    () => (data?.rows ?? []).filter((r) => r.ordered >= 2 && r.buyoutRate < 50).length,
    [data],
  );

  const header = (
    <PageHeader icon={<Filter className="h-5 w-5" />} title={t('title')} description={t('subtitle')} />
  );

  if (isLoading) {
    return (
      <>
        {header}
        <FilterBar />
        <div className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-32 w-full" />
            ))}
          </div>
          <Skeleton className="h-64 w-full" />
        </div>
      </>
    );
  }

  if (isError || !data) {
    return (
      <>
        {header}
        <Card>
          <ErrorState
            message={error instanceof ApiError ? error.message : undefined}
            onRetry={() => void refetch()}
          />
        </Card>
      </>
    );
  }

  const { totals, steps } = data;
  const maxStep = Math.max(...steps.map((s) => s.value), 1);

  const columns: Column<FunnelResponse['rows'][number]>[] = [
    {
      key: 'product',
      header: t('col.product'),
      width: '32%',
      render: (r) => <ProductCell title={r.title} subtitle={r.sku} imageUrl={r.imageUrl} />,
      sortValue: (r) => r.title,
      sortable: true,
    },
    {
      key: 'ordered',
      header: t('col.ordered'),
      align: 'right',
      sortable: true,
      sortValue: (r) => r.ordered,
      render: (r) => (
        <div className="flex flex-col items-end gap-1">
          <span className="font-semibold text-ink">{f.num(r.ordered)}</span>
          <Delta value={r.deltas.ordered} compact className="px-1.5 py-0.5 text-2xs" />
        </div>
      ),
    },
    {
      key: 'sold',
      header: t('col.sold'),
      align: 'right',
      sortable: true,
      sortValue: (r) => r.sold,
      render: (r) => (
        <div className="flex flex-col items-end gap-1">
          <span className="font-semibold text-ink">{f.num(r.sold)}</span>
          <Delta value={r.deltas.sold} compact className="px-1.5 py-0.5 text-2xs" />
        </div>
      ),
    },
    {
      key: 'amount',
      header: t('col.amount'),
      align: 'right',
      sortable: true,
      sortValue: (r) => r.soldAmount,
      render: (r) => (
        <div className="flex flex-col items-end gap-1">
          <span className="font-semibold text-ink">{f.money(r.soldAmount, data.currency)}</span>
          <Delta value={r.deltas.soldAmount} compact className="px-1.5 py-0.5 text-2xs" />
        </div>
      ),
    },
    {
      key: 'buyout',
      header: t('col.buyout'),
      align: 'right',
      sortable: true,
      sortValue: (r) => r.buyoutRate,
      render: (r) => (
        <div className="flex flex-col items-end gap-1.5">
          <span
            className={cn(
              'font-semibold',
              r.buyoutRate >= 70 ? 'text-brand-ink' : r.buyoutRate >= 40 ? 'text-warn-ink' : 'text-danger',
            )}
          >
            {f.pct(r.buyoutRate)}
          </span>
          <span className="block h-1.5 w-16 overflow-hidden rounded-full bg-surface-3">
            <span
              className={cn(
                'block h-full rounded-full',
                r.buyoutRate >= 70 ? 'bg-brand' : r.buyoutRate >= 40 ? 'bg-warn' : 'bg-danger',
              )}
              style={{ width: `${Math.min(100, r.buyoutRate)}%` }}
            />
          </span>
        </div>
      ),
    },
    {
      key: 'avg',
      header: t('col.avg'),
      align: 'right',
      hideOnMobile: true,
      sortable: true,
      sortValue: (r) => r.avgPrice,
      render: (r) => <span className="text-ink-soft">{f.money(r.avgPrice, data.currency)}</span>,
    },
    {
      key: 'share',
      header: t('col.share'),
      align: 'right',
      hideOnMobile: true,
      sortable: true,
      sortValue: (r) => r.share,
      render: (r) => <span className="text-muted">{f.pct(r.share)}</span>,
    },
  ];

  const isEmpty = totals.ordered === 0;

  return (
    <>
      {header}
      <FilterBar />

      {isEmpty ? (
        <Card>
          <EmptyState icon={<ShoppingBag className="h-6 w-6" />} title={t('empty.title')} hint={t('empty.hint')} />
        </Card>
      ) : (
        <div className="space-y-5">
          {/* ── KPI ── */}
          <StatGrid>
            <StatCard
              label={t('kpi.ordered')}
              value={f.num(totals.ordered)}
              hint={t('kpi.orderedHint', { v: f.compact(totals.orderedAmount) })}
              delta={steps[0]?.deltaPct}
              icon={<ShoppingBag className="h-5 w-5" />}
              tone="info"
            />
            <StatCard
              label={t('kpi.sold')}
              value={f.num(totals.sold)}
              hint={t('kpi.soldHint', { v: f.compact(totals.soldAmount) })}
              delta={steps[1]?.deltaPct}
              icon={<PackageCheck className="h-5 w-5" />}
              tone="brand"
            />
            <StatCard
              label={t('kpi.buyout')}
              value={f.pct(totals.buyoutRate)}
              hint={t('kpi.buyoutHint')}
              icon={<Percent className="h-5 w-5" />}
              tone={totals.buyoutRate >= 70 ? 'brand' : totals.buyoutRate >= 40 ? 'warn' : 'danger'}
            />
            <StatCard
              label={t('kpi.avg')}
              value={f.money(totals.avgPrice, data.currency)}
              hint={t('kpi.avgHint')}
              icon={<ShoppingBag className="h-5 w-5" />}
              tone="violet"
            />
          </StatGrid>

          {/* ── Voronka ── */}
          <Card className="p-5">
            <div className="mb-5">
              <h3 className="section-title">{t('steps.title')}</h3>
              <p className="mt-0.5 text-sm text-muted">{t('steps.subtitle')}</p>
            </div>

            <div className="space-y-3">
              {steps.map((step, i) => {
                const meta = STEP_META[step.id];
                const width = Math.max(4, (step.value / maxStep) * 100);
                const StepIcon = meta.icon;

                return (
                  <div key={step.id}>
                    {i > 0 ? (
                      <div className="mb-2 flex items-center gap-2 pl-1 text-2xs text-muted">
                        <ArrowDown className="h-3 w-3" />
                        {step.conversion !== null ? t('steps.conv', { v: f.pct(step.conversion) }) : ''}
                      </div>
                    ) : null}

                    <div className="group relative overflow-hidden rounded-xl border border-line bg-surface-2">
                      <div
                        className="absolute inset-y-0 left-0 transition-[width] duration-700 ease-spring"
                        style={{ width: `${width}%`, background: `${meta.color}22` }}
                      />
                      <div
                        className="absolute inset-y-0 left-0 w-1 rounded-r-full"
                        style={{ background: meta.color }}
                      />

                      <div className="relative flex flex-wrap items-center justify-between gap-3 px-4 py-3.5">
                        <div className="flex min-w-0 items-center gap-3">
                          <span
                            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
                            style={{ background: `${meta.color}1f`, color: meta.color }}
                          >
                            <StepIcon className="h-4 w-4" />
                          </span>
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-ink">{t(`step.${step.id}`)}</p>
                            <p className="tnum text-xs text-muted">
                              {t('steps.units', { v: f.num(step.value) })}
                              {step.amount > 0 ? ` · ${f.money(step.amount, data.currency)}` : ''}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-3">
                          {step.conversion !== null ? (
                            <Badge tone={meta.tone}>{f.pct(step.conversion)}</Badge>
                          ) : null}
                          <Delta value={step.deltaPct} invert={step.id === 'canceled' || step.id === 'returned'} />
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {problemCount > 0 ? (
              <div className="mt-5 flex gap-3 rounded-xl border border-warn/25 bg-warn/[0.07] p-4">
                <Info className="mt-0.5 h-4 w-4 shrink-0 text-warn" />
                <div>
                  <p className="text-sm font-semibold text-ink">{t('problem.title', { n: problemCount })}</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-muted">{t('problem.body')}</p>
                </div>
              </div>
            ) : null}
          </Card>

          {/* ── Kunlik dinamika ── */}
          <ChartCard title={t('chart.title')} subtitle={t('chart.subtitle')}>
            <TrendChart
              data={data.daily}
              series={[
                { key: 'ordered', name: t('chart.ordered'), color: CHART_COLORS.info },
                { key: 'sold', name: t('chart.sold'), color: CHART_COLORS.brand },
                { key: 'canceled', name: t('chart.canceled'), color: CHART_COLORS.warn },
                { key: 'returned', name: t('chart.returned'), color: CHART_COLORS.danger },
              ]}
              height={280}
            />
          </ChartCard>

          {/* ── Mahsulotlar ── */}
          <Card>
            <div className="flex flex-wrap items-start justify-between gap-3 px-5 pt-5">
              <div>
                <h3 className="section-title">{t('table.title')}</h3>
                <p className="mt-0.5 text-sm text-muted">{t('table.subtitle')}</p>
              </div>
              <Segmented
                size="sm"
                value={filter}
                onChange={setFilter}
                options={[
                  { value: 'all', label: t('filter.all'), count: data.rows.length },
                  { value: 'top', label: t('filter.top') },
                  { value: 'problem', label: t('filter.problem'), count: problemCount },
                ]}
              />
            </div>
            <div className="mt-4">
              <DataTable
                columns={columns}
                rows={rows}
                rowKey={(r) => r.skuId}
                /* Zaxira matn o'rniga tushunarli izoh — "Muammoli" filtri hech
                   narsa topmaganda foydalanuvchi sababni biladi */
                empty={<EmptyState icon={<Filter className="h-6 w-6" />} title={t('table.empty')} hint={t('table.emptyHint')} />}
              />
            </div>
          </Card>

          {/* ── Nima uchun namoyish yo'q ── */}
          <Card className="flex gap-3 p-5">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-info" />
            <div>
              <p className="text-sm font-semibold text-ink">{t('note.title')}</p>
              <p className="mt-1 max-w-3xl text-xs leading-relaxed text-muted">{t('note.body')}</p>
            </div>
          </Card>
        </div>
      )}
    </>
  );
}

/** Tarif cheklovi bilan o'ralgan ko'rinish */
export function FunnelGated() {
  return (
    <PlanGate feature="sales_analytics">
      <Funnel />
    </PlanGate>
  );
}
