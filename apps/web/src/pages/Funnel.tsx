import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  BarChart3,
  CalendarRange,
  Filter,
  History,
  Info,
  PackageCheck,
  Percent,
  ShoppingBag,
  Tags,
  Truck,
  Undo2,
  XCircle,
} from '@/components/icons';
import type { FunnelResponse, FunnelStepId } from '@savdoiq/shared';
import { api, ApiError } from '@/lib/api';
import { registerNamespace, useFormat, useT } from '@/i18n';
import { usePeriodQuery } from '@/store/ui';
import { FilterBar } from '@/components/filters';
import { ChartCard, TrendChart } from '@/components/charts';
import { ProductTitleCell } from '@/components/sales/ProductTitleCell';
import { DataFreshness } from '@/components/trust/DataFreshness';
import { CHART_COLORS } from '@/lib/theme';
import {
  Badge,
  Card,
  CardBody,
  CardHeader,
  DataTable,
  Delta,
  EmptyState,
  ErrorState,
  PageHeader,
  PlanGate,
  Segmented,
  Skeleton,
  StatCard,
  StatGrid,
  type Column,
  type Tone,
} from '@/components/ui';
import { cn } from '@/lib/utils';

registerNamespace('funnel', {
  uz: {
    title: 'Sotuv voronkasi',
    subtitle: 'Buyurtmadan yakuniy sotuvgacha — qayerda yo‘qotyapsiz',
    'kpi.ordered': 'Buyurtmalar',
    'kpi.orderedHint': '{n} dona · {v} so‘m · bekor/qaytganlar bilan',
    'kpi.sold': 'Sotildi',
    'kpi.soldHint': '{v} so‘m — xaridor qabul qilgan',
    'kpi.buyout': 'Sotib olish foizi',
    'kpi.buyoutHint': 'Yakunlangan donalardan (bekor va qaytganlar bilan)',
    'kpi.buyoutHintTransit': 'Yakunlanganlardan · {n} dona yo‘lda, hisobga kirmaydi',
    'kpi.buyoutNone': 'Hali yakunlangan dona yo‘q — hammasi yo‘lda',
    'kpi.avg': 'O‘rtacha narx',
    'kpi.avgHint': 'Sotilgan bitta dona uchun',
    'step.ordered': 'Buyurtma qilindi',
    'step.sold': 'Sotildi',
    'step.inTransit': 'Yo‘lda',
    'step.canceled': 'Bekor qilindi',
    'step.returned': 'Qaytarildi',
    'steps.title': 'Voronka bosqichlari',
    'steps.subtitle': 'Buyurtma qilingan donalar nima bo‘ldi',
    'steps.units': '{v} dona',
    'steps.conv': 'buyurtma qilingan donadan {v}',
    'steps.bar': 'Buyurtma qilingan donalar taqsimoti',
    'steps.unit': 'dona',
    'steps.transitHint': 'Hali natija yo‘q — xaridor qabul qilmagan',
    'meta.compare': 'Taqqoslash: {from} — {to}',
    'meta.compareHint': 'O‘zgarishlar shu oldingi teng davrga nisbatan',
    'transit.note':
      '{n} dona hali yo‘lda — xaridor qabul qilmagan. Ular sotilganga ham, yo‘qotilganga ham kirmaydi va sotib olish foiziga hisoblanmaydi.',
    'transit.compare':
      '“Sotildi” o‘zgarishi teng sharoitda: oldingi davrdan ham buyurtmadan keyin xuddi shuncha vaqt ichida qabul qilinganlari olinadi.',
    'chart.title': 'Kunlik dinamika',
    'chart.subtitle': 'Dona hisobida: buyurtma va uning holati',
    'chart.ordered': 'Buyurtma',
    'chart.sold': 'Sotildi',
    'chart.inTransit': 'Yo‘lda',
    'chart.canceled': 'Bekor',
    'chart.returned': 'Qaytarish',
    'table.empty': 'Mos tovar topilmadi',
    'table.emptyHint': 'Tanlangan filtr bo‘yicha tovar yo‘q — “Barchasi” ni tanlab ko‘ring',
    'table.title': 'Mahsulotlar kesimi',
    // Birlik sarlavha ostida: "Buyurtma, dona" kabi uzun ustun nomlari jadvalni 1366px dan chiqarardi
    'table.subtitle': 'Dona hisobida — oldingi davr bilan solishtirib',
    'col.product': 'Mahsulot',
    'col.ordered': 'Buyurtma',
    'col.sold': 'Sotildi',
    'col.amount': 'Summa',
    'col.buyout': 'Sotib olish',
    'col.buyoutTransit': '{n} dona yo‘lda',
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
    'problem.body': 'Yakunlangan donalarning yarmidan ko‘pi bekor qilingan yoki qaytgan — narx, tavsif yoki qadoqni tekshiring.',
  },
  ru: {
    title: 'Воронка продаж',
    subtitle: 'От заказа до продажи — где теряются деньги',
    'kpi.ordered': 'Заказы',
    'kpi.orderedHint': '{n} шт. · {v} сум · с отменами и возвратами',
    'kpi.sold': 'Продано',
    'kpi.soldHint': '{v} сум — получено покупателями',
    'kpi.buyout': 'Процент выкупа',
    'kpi.buyoutHint': 'От завершённых штук (с отменами и возвратами)',
    'kpi.buyoutHintTransit': 'От завершённых · {n} шт. в пути не учитываются',
    'kpi.buyoutNone': 'Завершённых штук пока нет — всё в пути',
    'kpi.avg': 'Средняя цена',
    'kpi.avgHint': 'За проданную единицу',
    'step.ordered': 'Заказано',
    'step.sold': 'Продано',
    'step.inTransit': 'В пути',
    'step.canceled': 'Отменено',
    'step.returned': 'Возвращено',
    'steps.title': 'Этапы воронки',
    'steps.subtitle': 'Что стало с заказанными штуками',
    'steps.units': '{v} шт.',
    'steps.conv': '{v} от заказанных штук',
    'steps.bar': 'Распределение заказанных штук',
    'steps.unit': 'шт.',
    'steps.transitHint': 'Итога ещё нет — покупатель не получил',
    'meta.compare': 'Сравнение: {from} — {to}',
    'meta.compareHint': 'Изменения — относительно этого предыдущего равного периода',
    'transit.note':
      '{n} шт. ещё в пути — покупатель их не получил. Они не считаются ни проданными, ни потерянными и не входят в процент выкупа.',
    'transit.compare':
      'Изменение «Продано» — в равных условиях: из прошлого периода тоже берутся штуки, полученные за то же время после заказа.',
    'chart.title': 'Динамика по дням',
    'chart.subtitle': 'В штуках: заказы и их статус',
    'chart.ordered': 'Заказы',
    'chart.sold': 'Продано',
    'chart.inTransit': 'В пути',
    'chart.canceled': 'Отмены',
    'chart.returned': 'Возвраты',
    'table.empty': 'Подходящих товаров нет',
    'table.emptyHint': 'По выбранному фильтру ничего не найдено — попробуйте «Все»',
    'table.title': 'По товарам',
    'table.subtitle': 'В штуках — в сравнении с прошлым периодом',
    'col.product': 'Товар',
    'col.ordered': 'Заказано',
    'col.sold': 'Продано',
    'col.amount': 'Сумма',
    'col.buyout': 'Выкуп',
    'col.buyoutTransit': '{n} шт. в пути',
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
    'problem.body': 'Больше половины завершённых штук отменены или возвращены — проверьте цену, описание и упаковку.',
  },
  en: {
    title: 'Sales funnel',
    subtitle: 'From order to sale — where the money leaks',
    'kpi.ordered': 'Orders',
    'kpi.orderedHint': '{n} units · {v} UZS · incl. cancelled & returned',
    'kpi.sold': 'Sold',
    'kpi.soldHint': '{v} UZS received by buyers',
    'kpi.buyout': 'Buyout rate',
    'kpi.buyoutHint': 'Of completed units (incl. cancelled and returned)',
    'kpi.buyoutHintTransit': 'Of completed units · {n} in transit not counted',
    'kpi.buyoutNone': 'No completed units yet — all in transit',
    'kpi.avg': 'Average price',
    'kpi.avgHint': 'Per sold unit',
    'step.ordered': 'Ordered',
    'step.sold': 'Sold',
    'step.inTransit': 'In transit',
    'step.canceled': 'Cancelled',
    'step.returned': 'Returned',
    'steps.title': 'Funnel steps',
    'steps.subtitle': 'What happened to the ordered units',
    'steps.units': '{v} units',
    'steps.conv': '{v} of ordered units',
    'steps.bar': 'How the ordered units split',
    'steps.unit': 'units',
    'steps.transitHint': 'No outcome yet — not received by the buyer',
    'meta.compare': 'Compared with: {from} — {to}',
    'meta.compareHint': 'Changes are against this previous period of equal length',
    'transit.note':
      '{n} units are still in transit — the buyer has not received them. They count as neither sold nor lost and are left out of the buyout rate.',
    'transit.compare':
      'The “Sold” change is like for like: from the previous period we also count only units received within the same time after ordering.',
    'chart.title': 'Daily dynamics',
    'chart.subtitle': 'In units: orders and their outcome',
    'chart.ordered': 'Ordered',
    'chart.sold': 'Sold',
    'chart.inTransit': 'In transit',
    'chart.canceled': 'Cancelled',
    'chart.returned': 'Returned',
    'table.empty': 'No matching products',
    'table.emptyHint': 'Nothing matches this filter — try “All”',
    'table.title': 'By product',
    'table.subtitle': 'In units — compared with the previous period',
    'col.product': 'Product',
    'col.ordered': 'Ordered',
    'col.sold': 'Sold',
    'col.amount': 'Amount',
    'col.buyout': 'Buyout',
    'col.buyoutTransit': '{n} in transit',
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
    'problem.body': 'More than half of the completed units were cancelled or returned — check price, description and packaging.',
  },
});

type StepToken = 'info' | 'brand' | 'slate' | 'warn' | 'danger';

/*
 * `toneClass` TO'LIQ yozilgan: Tailwind faqat manbada butun uchragan klassni
 * CSS'ga chiqaradi, `tone-${tone}` kabi yig'ilgani skanerdan o'tmaydi.
 */
const STEP_META: Record<
  FunnelStepId,
  { token: StepToken; icon: typeof ShoppingBag; tone: Tone; toneClass: string }
> = {
  ordered: { token: 'info', icon: ShoppingBag, tone: 'info', toneClass: 'tone-info' },
  sold: { token: 'brand', icon: PackageCheck, tone: 'brand', toneClass: 'tone-brand' },
  // Yo'ldagi dona — neytral kulrang: na yutuq, na yo'qotish
  inTransit: { token: 'slate', icon: Truck, tone: 'muted', toneClass: 'tone-muted' },
  canceled: { token: 'warn', icon: XCircle, tone: 'warn', toneClass: 'tone-warn' },
  returned: { token: 'danger', icon: Undo2, tone: 'danger', toneClass: 'tone-danger' },
};

/** Sotib olish foizi: sotildi / yakunlangan (sotildi + bekor + qaytdi) — funnel.ts dagi `buyoutOf` bilan bir xil */
function buyoutOfSteps(steps: FunnelResponse['steps'], key: 'value' | 'prevValue'): number | null {
  const pick = (id: FunnelStepId) => steps.find((s) => s.id === id)?.[key] ?? 0;
  const sold = pick('sold');
  const done = sold + pick('canceled') + pick('returned');
  return done > 0 ? (sold / done) * 100 : null;
}

/*
 * Token rangi shaffofligi bilan. Ilgari `${CHART_COLORS.x}22` yozilardi —
 * "rgb(var(--c-info))22" yaroqsiz CSS, brauzer uni tashlab yuborardi va
 * bosqich chizig'i hamda belgi foni umuman chizilmasdi (2026-10-24).
 */
const tokenColor = (token: StepToken, alpha?: number): string =>
  alpha === undefined ? `rgb(var(--c-${token}))` : `rgb(var(--c-${token}) / ${alpha})`;

/** Muammoli tovar: kamida 2 ta yakunlangan dona va ularning yarmidan kami sotib olingan */
const isProblem = (r: FunnelResponse['rows'][number]): boolean =>
  r.completed >= 2 && r.buyoutRate !== null && r.buyoutRate < 50;

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
    if (filter === 'problem') return all.filter(isProblem);
    if (filter === 'top') return all.slice(0, 10);
    return all;
  }, [data, filter]);

  const problemCount = useMemo(() => (data?.rows ?? []).filter(isProblem).length, [data]);

  /*
   * Sarlavha ostida davr va TAQQOSLANAYOTGAN davr: sahifadagi har bir
   * o'zgarish chipi shu oldingi teng davrga nisbatan, lekin ilgari bu hech
   * qayerda yozilmagan edi.
   */
  const header = (
    <PageHeader
      icon={<Filter className="h-5 w-5" />}
      title={t('title')}
      description={t('subtitle')}
      meta={
        <>
          {data ? (
            <>
              <span className="meta-chip tnum">
                <CalendarRange className="h-3.5 w-3.5" />
                {f.date(data.period.from)} — {f.date(data.period.to)}
              </span>
              <span className="meta-chip tnum" title={t('meta.compareHint')}>
                <History className="h-3.5 w-3.5" />
                {t('meta.compare', { from: f.date(data.previous.from), to: f.date(data.previous.to) })}
              </span>
            </>
          ) : null}
          <DataFreshness />
        </>
      }
    />
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
  const orderedStep = steps.find((s) => s.id === 'ordered');
  const soldStep = steps.find((s) => s.id === 'sold');
  const outcomes = steps.filter((s) => s.id !== 'ordered');
  const buyout = totals.buyoutRate;
  /*
   * Sotib olish foizi — foiz ko'rsatkich, o'zgarishi foiz punktida (joriy −
   * oldingi). Oldingi qiymat bosqichlarning `prevValue` laridan (teng yoshda),
   * yakunlangan dona bo'lmasa — o'zgarish yo'q, taxmin qilinmaydi.
   */
  const prevBuyout = buyoutOfSteps(steps, 'prevValue');
  const buyoutDelta = buyout !== null && prevBuyout !== null ? buyout - prevBuyout : null;
  // O'rtacha narx oldingi davrda: o'sha teng yoshdagi sotilgan summa / dona
  const prevAvg = soldStep && soldStep.prevValue > 0 ? soldStep.prevAmount / soldStep.prevValue : null;
  const avgDelta = prevAvg && totals.avgPrice > 0 ? ((totals.avgPrice - prevAvg) / prevAvg) * 100 : null;

  const columns: Column<FunnelResponse['rows'][number]>[] = [
    {
      key: 'product',
      header: t('col.product'),
      // Nom ikki qatorga sig'adi — kesilmagan nom ustunni kengaytirib, jadvalni 1366px dan chiqarardi
      render: (r) => <ProductTitleCell title={r.title} subtitle={r.sku} imageUrl={r.imageUrl} maxWidth={240} />,
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
        <div className="flex flex-col items-end gap-1 max-md:items-start">
          <span className="font-semibold text-ink">{f.num(r.ordered)}</span>
          <Delta value={r.deltas.ordered} className="px-1.5 py-0.5 text-2xs" />
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
        <div className="flex flex-col items-end gap-1 max-md:items-start">
          <span className="font-semibold text-ink">{f.num(r.sold)}</span>
          <Delta value={r.deltas.sold} className="px-1.5 py-0.5 text-2xs" />
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
        <div className="flex flex-col items-end gap-1 max-md:items-start">
          <span className="font-semibold text-ink">{f.money(r.soldAmount, data.currency)}</span>
          <Delta value={r.deltas.soldAmount} className="px-1.5 py-0.5 text-2xs" />
        </div>
      ),
    },
    {
      key: 'buyout',
      header: t('col.buyout'),
      align: 'right',
      sortable: true,
      // Yakunlangani yo'q tovar (null) kamayish tartibida oxirga tushadi
      sortValue: (r) => r.buyoutRate ?? -1,
      render: (r) => {
        const rate = r.buyoutRate;
        /*
         * Foiz faqat yakunlangan donadan, shuning uchun yo'ldagilar ostida
         * alohida yoziladi. Ilgari "Buyurtma 14 · Sotildi 7 · 100%" bir-biriga
         * zid ko'rinardi: qolgan 7 dona yo'lda ekani hech qayerda yo'q edi
         * (2026-10-24).
         */
        const transit =
          r.inTransit > 0 ? (
            <span className="tnum text-2xs text-muted">{t('col.buyoutTransit', { n: f.num(r.inTransit) })}</span>
          ) : null;
        // Hamma donasi yo'lda — foiz hali yo'q, "0%" sotuvchini chalg'itardi
        if (rate === null) {
          return (
            <div className="flex flex-col items-end gap-1 max-md:items-start">
              <span className="text-muted">—</span>
              {transit}
            </div>
          );
        }
        return (
          // max-md:items-start: telefondagi kartada qiymat maydon nomi ostida, chapda turadi
          <div className="flex flex-col items-end gap-1.5 max-md:items-start">
            <span
              className={cn('font-semibold', rate >= 70 ? 'text-brand-ink' : rate >= 40 ? 'text-warn-ink' : 'text-danger')}
            >
              {f.pct(rate)}
            </span>
            <span className="block h-1.5 w-16 overflow-hidden rounded-full bg-surface-3">
              <span
                className={cn('block h-full rounded-full', rate >= 70 ? 'bg-brand' : rate >= 40 ? 'bg-warn' : 'bg-danger')}
                style={{ width: `${Math.min(100, rate)}%` }}
              />
            </span>
            {transit}
          </div>
        );
      },
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
      // Ikkinchi darajali ustun — faqat keng ekranda; 1366px da jadval yon tomonga surilmasin.
      // `hideOnMobile` ATAYLAB yo'q: uning `md:table-cell` klassi bu yashirishni bekor qilardi
      mobile: 'detail',
      className: 'hidden 2xl:table-cell',
      headerClassName: 'hidden 2xl:table-cell',
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
            {/* Ilgari bu kartochka "Buyurtma qilindi" deb DONA ko'rsatardi — endi buyurtmalar soni, dona izohda.
                Izoh asosni aytadi: bu yerda bekor/qaytganlar ham bor, Boshqaruv panelidagi
                "Buyurtmalar" da esa yo'q — bir xil yorliq ostida ikki xil raqam chiqardi (2026-10-24) */}
            <StatCard
              label={t('kpi.ordered')}
              value={f.num(totals.orders)}
              hint={t('kpi.orderedHint', { n: f.num(totals.ordered), v: f.compact(totals.orderedAmount) })}
              delta={totals.ordersDeltaPct}
              icon={<ShoppingBag className="h-5 w-5" />}
              tone="info"
            />
            {/* Summa — xaridor qabul qilgani, yo'ldagilarsiz. Ilgari "tushum" deyilardi va
                Boshqaruv panelidagi "Tushum" (yo'ldagilar bilan) dan kam chiqib, zid ko'rinardi (2026-10-24) */}
            <StatCard
              label={t('kpi.sold')}
              value={t('steps.units', { v: f.num(totals.sold) })}
              hint={t('kpi.soldHint', { v: f.compact(totals.soldAmount) })}
              delta={soldStep?.deltaPct}
              previous={soldStep ? f.num(soldStep.prevValue) : undefined}
              icon={<PackageCheck className="h-5 w-5" />}
              tone="brand"
            />
            <StatCard
              label={t('kpi.buyout')}
              value={buyout === null ? '—' : f.pct(buyout)}
              hint={
                buyout === null
                  ? t('kpi.buyoutNone')
                  : totals.inTransit > 0
                    ? t('kpi.buyoutHintTransit', { n: f.num(totals.inTransit) })
                    : t('kpi.buyoutHint')
              }
              delta={buyoutDelta}
              deltaUnit="pp"
              previous={prevBuyout !== null ? f.pct(prevBuyout) : undefined}
              icon={<Percent className="h-5 w-5" />}
              tone={buyout === null ? 'info' : buyout >= 70 ? 'brand' : buyout >= 40 ? 'warn' : 'danger'}
            />
            {/*
              Ilgari binafsha edi — binafsha endi faqat "Uzum ulushi". Narx —
              buyurtma ko'rsatkichi, "Buyurtmalar" bilan bir oila (ko'k).
            */}
            <StatCard
              label={t('kpi.avg')}
              value={f.money(totals.avgPrice, data.currency)}
              hint={t('kpi.avgHint')}
              delta={avgDelta}
              previous={prevAvg !== null ? f.money(prevAvg, data.currency) : undefined}
              icon={<Tags className="h-5 w-5" />}
              tone="info"
            />
          </StatGrid>

          {/*
            ── Voronka ──
            Buyurtma qilingan har bir dona to'rt natijaning biriga tushadi
            (sotildi + yo'lda + bekor + qaytdi = buyurtma). Ilgari besh
            bosqich ustma-ust ro'yxat edi va bo'linish ko'rinmasdi; endi bitta
            100% li lenta va to'rt natija plitkasi — ranglar grafik bilan bir xil.
          */}
          <Card>
            <CardHeader
              icon={<Filter className="h-4 w-4" />}
              title={t('steps.title')}
              subtitle={t('steps.subtitle')}
            />
            <CardBody className="space-y-4">
              {orderedStep ? (
                <div className="well flex flex-wrap items-center justify-between gap-3 px-4 py-3.5">
                  <div className="flex min-w-0 items-center gap-3">
                    <span
                      className={cn(
                        'icon-tile h-9 w-9 rounded-[10px] [&_svg]:h-[18px] [&_svg]:w-[18px]',
                        STEP_META.ordered.toneClass,
                      )}
                    >
                      <ShoppingBag />
                    </span>
                    <div className="min-w-0">
                      <p className="eyebrow">{t('step.ordered')}</p>
                      <p className="tnum mt-0.5 font-display text-xl font-bold leading-tight text-ink">
                        {t('steps.units', { v: f.num(orderedStep.value) })}
                        <span className="ml-2 text-sm font-semibold text-muted">
                          {f.money(orderedStep.amount, data.currency)}
                        </span>
                      </p>
                    </div>
                  </div>
                  <Delta value={orderedStep.deltaPct} />
                </div>
              ) : null}

              <div
                role="img"
                aria-label={`${t('steps.bar')}: ${outcomes
                  .map((s) => `${t(`step.${s.id}`)} ${s.conversion !== null ? f.pct(s.conversion) : '—'}`)
                  .join(', ')}`}
                className="flex h-3 w-full gap-[3px]"
              >
                {outcomes
                  .filter((s) => s.value > 0)
                  .map((s, i) => (
                    <div
                      key={s.id}
                      title={`${t(`step.${s.id}`)} — ${t('steps.units', { v: f.num(s.value) })}`}
                      className="h-full min-w-[4px] origin-left animate-grow-x rounded-full"
                      style={{
                        flex: `${s.value} 1 0%`,
                        background: tokenColor(STEP_META[s.id].token),
                        animationDelay: `${80 + i * 80}ms`,
                      }}
                    />
                  ))}
              </div>

              <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
                {outcomes.map((step) => {
                  const meta = STEP_META[step.id];
                  const StepIcon = meta.icon;
                  return (
                    <div key={step.id} className="well flex min-w-0 flex-col px-4 py-3.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="flex min-w-0 items-center gap-2">
                          <span
                            className={cn(
                              'icon-tile h-7 w-7 rounded-lg [&_svg]:h-3.5 [&_svg]:w-3.5',
                              meta.toneClass,
                            )}
                          >
                            <StepIcon />
                          </span>
                          <span className="truncate text-sm font-semibold text-ink">{t(`step.${step.id}`)}</span>
                        </span>
                        {step.conversion !== null ? (
                          <Badge tone={meta.tone} title={t('steps.conv', { v: f.pct(step.conversion) })}>
                            {f.pct(step.conversion)}
                          </Badge>
                        ) : null}
                      </div>
                      <p className="tnum mt-3 font-display text-2xl font-bold leading-none tracking-[-0.02em] text-ink">
                        {f.num(step.value)}
                        <span className="ml-1.5 text-xs font-semibold text-muted">{t('steps.unit')}</span>
                      </p>
                      <p className="tnum mt-1.5 text-xs text-muted">
                        {step.amount > 0 ? f.money(step.amount, data.currency) : '—'}
                      </p>
                      <div className="mt-auto pt-3">
                        {/* Yo'ldagi dona na yutuq, na yo'qotish — uning o'zgarishini yashil/qizil bilan baholab bo'lmaydi */}
                        {step.id === 'inTransit' ? (
                          <span className="text-2xs leading-snug text-muted">{t('steps.transitHint')}</span>
                        ) : (
                          <Delta value={step.deltaPct} invert={step.id === 'canceled' || step.id === 'returned'} />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {totals.inTransit > 0 ? (
                <div className="flex gap-3 rounded-xl border border-line bg-surface-2/60 p-4">
                  <Truck className="mt-0.5 h-4 w-4 shrink-0 text-muted" />
                  {/* Oldingi davr teng yoshda olinadi (funnel.ts collect) — aks holda "Sotildi" o'zgarishi sun'iy tushardi */}
                  <p className="text-xs leading-relaxed text-muted">
                    {t('transit.note', { n: f.num(totals.inTransit) })} {t('transit.compare')}
                  </p>
                </div>
              ) : null}

              {problemCount > 0 ? (
                <div className="flex gap-3 rounded-xl border border-warn/25 bg-warn/5 p-4">
                  <Info className="mt-0.5 h-4 w-4 shrink-0 text-warn-ink" />
                  <div>
                    <p className="text-sm font-semibold text-ink">{t('problem.title', { n: problemCount })}</p>
                    <p className="mt-0.5 text-xs leading-relaxed text-muted">{t('problem.body')}</p>
                  </div>
                </div>
              ) : null}
            </CardBody>
          </Card>

          {/* ── Kunlik dinamika ── */}
          <ChartCard title={t('chart.title')} subtitle={t('chart.subtitle')} icon={<BarChart3 />}>
            <TrendChart
              data={data.daily}
              series={[
                { key: 'ordered', name: t('chart.ordered'), color: CHART_COLORS.info },
                { key: 'sold', name: t('chart.sold'), color: CHART_COLORS.brand },
                { key: 'inTransit', name: t('chart.inTransit'), color: CHART_COLORS.slate },
                { key: 'canceled', name: t('chart.canceled'), color: CHART_COLORS.warn },
                { key: 'returned', name: t('chart.returned'), color: CHART_COLORS.danger },
              ]}
              height={280}
              // Keng och ustun — buyurtma qilingan dona; ichida ular nima bo'lgani: sotildi, yo'lda, bekor, qaytdi
              variant="bars"
              stacked
            />
          </ChartCard>

          {/* ── Mahsulotlar ── */}
          <Card>
            <CardHeader
              icon={<PackageCheck className="h-4 w-4" />}
              title={t('table.title')}
              subtitle={t('table.subtitle')}
              actions={
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
              }
            />
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
            <span className="icon-tile tone-info h-8 w-8 rounded-[10px] [&_svg]:h-4 [&_svg]:w-4">
              <Info />
            </span>
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
