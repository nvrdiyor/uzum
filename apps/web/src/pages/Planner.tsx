import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  CalendarClock,
  Coins,
  PackagePlus,
  Sparkles,
  Timer,
  TrendingDown,
  Truck,
} from 'lucide-react';
import type { PlannerResponse, PlannerRow } from '@savdoiq/shared';
import {
  Badge,
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
  ProductCell,
  ProgressBar,
  SearchInput,
  Segmented,
  Select,
  Skeleton,
  StatCard,
  StatGrid,
  toast,
  type Column,
  type Tone,
} from '@/components/ui';
import { FilterBar } from '@/components/filters';
import { api } from '@/lib/api';
import { usePeriodQuery } from '@/store/ui';
import { cn } from '@/lib/utils';
import { registerNamespace, useFormat, useT } from '@/i18n';

registerNamespace('planner', {
  uz: {
    title: 'Rejalashtiruvchi',
    subtitle: 'Tovarsiz qolmaslik uchun nimani va qancha olib kelish kerak',

    'ctrl.title': 'Hisob parametrlari',
    'ctrl.subtitle': 'Zaxira davri va yetkazib berish muddatiga qarab miqdor hisoblanadi',
    'ctrl.cover': 'Zaxira davri',
    'ctrl.coverHint': 'Qoldiq necha kunga yetishi kerak',
    'ctrl.lead': 'Yetkazib berish muddati',
    'ctrl.leadHint': 'Buyurtmadan omborga tushgunicha o‘tadigan vaqt',
    'ctrl.days': 'kun',
    'ctrl.search': 'Nomi yoki SKU bo‘yicha qidirish',

    'hero.need': 'Buyurtma qilish kerak',
    'hero.skus': '{n} ta SKU',
    'hero.sum': 'jami taxminan {v}',
    'hero.none': 'Hozircha hech narsa buyurtma qilish shart emas',
    'hero.noneHint': 'Barcha mahsulotlar tanlangan zaxira davriga yetadi',

    'kpi.skus': 'Buyurtmalik SKU',
    'kpi.skusHint': 'Miqdor tavsiya etilgan pozitsiyalar',
    'kpi.cost': 'Xarid qiymati',
    'kpi.costHint': 'Tannarx bo‘yicha taxminiy summa',
    'kpi.lost': 'Yo‘qotilayotgan tushum',
    'kpi.lostHint': 'Tovar tugashi sababli qo‘ldan boy beriladi',
    'kpi.critical': 'Kritik pozitsiyalar',
    'kpi.criticalHint': 'Eng tez harakat talab qiladi',

    'alert.title': '{n} ta mahsulot kritik holatda',
    'alert.body': 'Yetkazib berish muddati ({lead} kun) qoldiqdan uzun — bu pozitsiyalarni bugunoq buyurtma qiling.',
    'alert.action': 'Kritiklarni ko‘rish',

    'filter.all': 'Hammasi',
    'filter.critical': 'Kritik',
    'filter.ending': 'Tugayapti',
    'filter.enough': 'Yetarli',
    'filter.no_action': 'Harakatsiz',

    'table.product': 'Mahsulot',
    'table.stock': 'Qoldiq',
    'table.avgDaily': 'Kunlik o‘rtacha',
    'table.daysLeft': 'Necha kunga yetadi',
    'table.stockout': 'Tugash sanasi',
    'table.qty': 'Tavsiya etilgan miqdor',
    'table.cost': 'Xarid qiymati',
    'table.lost': 'Yo‘qotilayotgan tushum',
    'table.status': 'Holat',
    'table.totals': 'Jami',
    'table.empty': 'Bu filtr bo‘yicha mahsulot topilmadi',
    'table.emptyHint': 'Filtrni o‘zgartiring yoki zaxira davrini oshiring',
    'table.noSales': 'Sotuv yo‘q',
    'table.selectAll': 'Barchasini tanlash',

    'sel.count': '{n} ta tanlandi',
    'sel.create': 'Tanlanganlardan yetkazma yaratish',
    'sel.clear': 'Tanlovni tozalash',
    'sel.ok': 'Yetkazma qoralamasi yaratildi',
    'sel.okBody': '{n} ta SKU qoralamaga qo‘shildi',
    'sel.err': 'Yetkazma qoralamasini yaratib bo‘lmadi',

    'status.critical': 'Kritik',
    'status.ending': 'Tugayapti',
    'status.enough': 'Yetarli',
    'status.no_action': 'Harakatsiz',

    'empty.title': 'Rejalashtirish uchun ma’lumot yo‘q',
    'empty.hint': 'Sinxronizatsiya tugagach, sotuv tarixi asosida tavsiyalar paydo bo‘ladi',
  },
  ru: {
    title: 'Планировщик',
    subtitle: 'Что и сколько привезти, чтобы не остаться без товара',

    'ctrl.title': 'Параметры расчёта',
    'ctrl.subtitle': 'Количество считается по периоду запаса и сроку поставки',
    'ctrl.cover': 'Период запаса',
    'ctrl.coverHint': 'На сколько дней должно хватить остатка',
    'ctrl.lead': 'Срок поставки',
    'ctrl.leadHint': 'Время от заказа до приёмки на склад',
    'ctrl.days': 'дн.',
    'ctrl.search': 'Поиск по названию или SKU',

    'hero.need': 'Нужно заказать',
    'hero.skus': '{n} SKU',
    'hero.sum': 'на сумму около {v}',
    'hero.none': 'Пока заказывать нечего',
    'hero.noneHint': 'Всех товаров хватает на выбранный период запаса',

    'kpi.skus': 'SKU к заказу',
    'kpi.skusHint': 'Позиции с рекомендованным количеством',
    'kpi.cost': 'Стоимость закупки',
    'kpi.costHint': 'Примерная сумма по себестоимости',
    'kpi.lost': 'Упущенная выручка',
    'kpi.lostHint': 'Теряется из-за отсутствия товара',
    'kpi.critical': 'Критичных позиций',
    'kpi.criticalHint': 'Требуют действия в первую очередь',

    'alert.title': '{n} товаров в критическом состоянии',
    'alert.body': 'Срок поставки ({lead} дн.) больше, чем хватит остатка — закажите эти позиции сегодня.',
    'alert.action': 'Показать критичные',

    'filter.all': 'Все',
    'filter.critical': 'Критичные',
    'filter.ending': 'Заканчиваются',
    'filter.enough': 'Достаточно',
    'filter.no_action': 'Без движения',

    'table.product': 'Товар',
    'table.stock': 'Остаток',
    'table.avgDaily': 'Средн. в день',
    'table.daysLeft': 'На сколько хватит',
    'table.stockout': 'Дата исчерпания',
    'table.qty': 'Рекомендуемое количество',
    'table.cost': 'Стоимость закупки',
    'table.lost': 'Упущенная выручка',
    'table.status': 'Статус',
    'table.totals': 'Итого',
    'table.empty': 'По этому фильтру товаров нет',
    'table.emptyHint': 'Измените фильтр или увеличьте период запаса',
    'table.noSales': 'Нет продаж',
    'table.selectAll': 'Выбрать всё',

    'sel.count': 'Выбрано: {n}',
    'sel.create': 'Создать поставку из выбранных',
    'sel.clear': 'Сбросить выбор',
    'sel.ok': 'Черновик поставки создан',
    'sel.okBody': 'В черновик добавлено {n} SKU',
    'sel.err': 'Не удалось создать черновик поставки',

    'status.critical': 'Критично',
    'status.ending': 'Заканчивается',
    'status.enough': 'Достаточно',
    'status.no_action': 'Без движения',

    'empty.title': 'Нет данных для планирования',
    'empty.hint': 'После синхронизации появятся рекомендации на основе истории продаж',
  },
  en: {
    title: 'Planner',
    subtitle: 'What to reorder and how much, so you never run out of stock',

    'ctrl.title': 'Calculation settings',
    'ctrl.subtitle': 'Quantities are derived from the cover period and the lead time',
    'ctrl.cover': 'Cover period',
    'ctrl.coverHint': 'How many days the stock should last',
    'ctrl.lead': 'Lead time',
    'ctrl.leadHint': 'Time from ordering to arrival at the warehouse',
    'ctrl.days': 'days',
    'ctrl.search': 'Search by name or SKU',

    'hero.need': 'You need to reorder',
    'hero.skus': '{n} SKUs',
    'hero.sum': 'roughly {v} in total',
    'hero.none': 'Nothing to reorder right now',
    'hero.noneHint': 'Every product covers the selected period',

    'kpi.skus': 'SKUs to order',
    'kpi.skusHint': 'Positions with a recommended quantity',
    'kpi.cost': 'Purchase cost',
    'kpi.costHint': 'Estimated amount at cost price',
    'kpi.lost': 'Lost revenue',
    'kpi.lostHint': 'Missed because the item runs out',
    'kpi.critical': 'Critical positions',
    'kpi.criticalHint': 'These need action first',

    'alert.title': '{n} products are critical',
    'alert.body': 'The lead time ({lead} days) is longer than the stock will last — order these today.',
    'alert.action': 'Show critical',

    'filter.all': 'All',
    'filter.critical': 'Critical',
    'filter.ending': 'Running out',
    'filter.enough': 'Healthy',
    'filter.no_action': 'No movement',

    'table.product': 'Product',
    'table.stock': 'Stock',
    'table.avgDaily': 'Daily average',
    'table.daysLeft': 'Days of cover',
    'table.stockout': 'Stockout date',
    'table.qty': 'Recommended quantity',
    'table.cost': 'Purchase cost',
    'table.lost': 'Lost revenue',
    'table.status': 'Status',
    'table.totals': 'Total',
    'table.empty': 'No products match this filter',
    'table.emptyHint': 'Change the filter or increase the cover period',
    'table.noSales': 'No sales',
    'table.selectAll': 'Select all',

    'sel.count': '{n} selected',
    'sel.create': 'Create a shipment from the selection',
    'sel.clear': 'Clear selection',
    'sel.ok': 'Shipment draft created',
    'sel.okBody': '{n} SKUs added to the draft',
    'sel.err': 'Could not create the shipment draft',

    'status.critical': 'Critical',
    'status.ending': 'Running out',
    'status.enough': 'Healthy',
    'status.no_action': 'No movement',

    'empty.title': 'Nothing to plan yet',
    'empty.hint': 'Recommendations appear once the sync finishes and sales history is available',
  },
});

type FilterKey = 'all' | 'critical' | 'ending' | 'enough' | 'no_action';

const STATUS_TONE: Record<PlannerRow['status'], Tone> = {
  critical: 'danger',
  ending: 'warn',
  enough: 'brand',
  no_action: 'muted',
};

const LEAD_OPTIONS = [1, 3, 5, 7, 10, 14, 21, 30];

export default function Planner() {
  const t = useT('planner');
  const f = useFormat();
  const q = usePeriodQuery();
  const navigate = useNavigate();

  const [coverInput, setCoverInput] = useState(30);
  const [cover, setCover] = useState(30);
  const [lead, setLead] = useState(7);
  const [filter, setFilter] = useState<FilterKey>('all');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<string[]>([]);

  // Slayder harakatlanayotganda so'rovlar bilan to'ldirib yubormaslik uchun
  useEffect(() => {
    const id = setTimeout(() => setCover(coverInput), 300);
    return () => clearTimeout(id);
  }, [coverInput]);

  /**
   * Filtr serverga ham yuboriladi: standart ko'rinishda server "harakat kerak
   * emas" qatorlarini qaytarmaydi, shuning uchun o'sha yorliq faqat mahalliy
   * filtr bilan bo'sh ko'rinardi.
   */
  const planner = useQuery({
    queryKey: ['planner', q, cover, lead, filter],
    queryFn: () => api.get<PlannerResponse>('/planner', { ...q, cover, lead, status: filter }),
    placeholderData: (prev) => prev,
  });

  const data = planner.data;
  const rows = useMemo(() => data?.rows ?? [], [data]);

  const visibleRows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (filter !== 'all' && r.status !== filter) return false;
      if (!term) return true;
      return r.title.toLowerCase().includes(term) || r.sku.toLowerCase().includes(term);
    });
  }, [rows, filter, search]);

  const needRows = useMemo(() => rows.filter((r) => r.recommendedQty > 0), [rows]);
  const criticalRows = useMemo(() => rows.filter((r) => r.status === 'critical'), [rows]);
  const lostTotal = useMemo(() => rows.reduce((s, r) => s + r.lostRevenue, 0), [rows]);

  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const visibleIds = useMemo(() => visibleRows.map((r) => r.skuId), [visibleRows]);
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedSet.has(id));

  const toggleRow = (skuId: string) =>
    setSelected((prev) => (prev.includes(skuId) ? prev.filter((x) => x !== skuId) : [...prev, skuId]));

  const toggleAll = () =>
    setSelected((prev) =>
      allVisibleSelected ? prev.filter((id) => !visibleIds.includes(id)) : Array.from(new Set([...prev, ...visibleIds])),
    );

  const draft = useMutation({
    mutationFn: (skuIds: string[]) => api.post<unknown>('/planner/shipment-draft', { skuIds }),
    onSuccess: (_res, skuIds) => {
      toast.success(t('sel.ok'), t('sel.okBody', { n: skuIds.length }));
      setSelected([]);
      navigate('/shipments');
    },
    onError: (err: unknown) => {
      toast.error(t('sel.err'), err instanceof Error ? err.message : undefined);
    },
  });

  const filterOptions: { value: FilterKey; label: string; count?: number }[] = [
    { value: 'all', label: t('filter.all'), count: data?.counts.all },
    { value: 'critical', label: t('filter.critical'), count: data?.counts.critical },
    { value: 'ending', label: t('filter.ending'), count: data?.counts.ending },
    { value: 'enough', label: t('filter.enough'), count: data?.counts.enough },
    { value: 'no_action', label: t('filter.no_action'), count: data?.counts.noAction },
  ];

  const columns: Column<PlannerRow>[] = [
    {
      key: 'select',
      width: 44,
      header: (
        <input
          type="checkbox"
          aria-label={t('table.selectAll')}
          checked={allVisibleSelected}
          onChange={toggleAll}
          className="h-4 w-4 cursor-pointer rounded border-line bg-surface-2 accent-brand"
        />
      ),
      render: (r) => (
        <input
          type="checkbox"
          aria-label={r.title}
          checked={selectedSet.has(r.skuId)}
          onChange={() => toggleRow(r.skuId)}
          onClick={(e) => e.stopPropagation()}
          className="h-4 w-4 cursor-pointer rounded border-line bg-surface-2 accent-brand"
        />
      ),
    },
    {
      key: 'title',
      header: t('table.product'),
      render: (r) => <ProductCell title={r.title} subtitle={r.sku} imageUrl={r.imageUrl} size={40} />,
    },
    {
      key: 'stock',
      header: t('table.stock'),
      align: 'right',
      sortable: true,
      sortValue: (r) => r.stock,
      render: (r) => <span className="font-semibold text-ink">{f.num(r.stock)}</span>,
    },
    {
      key: 'avgDaily',
      header: t('table.avgDaily'),
      align: 'right',
      hideOnMobile: true,
      sortable: true,
      sortValue: (r) => r.avgDaily,
      render: (r) => (r.avgDaily > 0 ? f.num(r.avgDaily, 1) : <span className="text-muted">—</span>),
    },
    {
      key: 'daysLeft',
      header: t('table.daysLeft'),
      width: 160,
      hideOnMobile: true,
      sortable: true,
      sortValue: (r) => (r.daysLeft === null ? Number.MAX_SAFE_INTEGER : r.daysLeft),
      render: (r) => {
        if (r.daysLeft === null) return <span className="text-xs text-muted">{t('table.noSales')}</span>;
        const pct = cover > 0 ? Math.min(100, (r.daysLeft / cover) * 100) : 0;
        return (
          <div className="min-w-[120px]">
            <div className="flex items-baseline justify-between gap-2">
              <span className="tnum text-sm font-semibold text-ink">
                {f.num(r.daysLeft)} {t('ctrl.days')}
              </span>
            </div>
            <ProgressBar value={pct} tone={STATUS_TONE[r.status]} className="mt-1.5" />
          </div>
        );
      },
    },
    {
      key: 'stockoutDate',
      header: t('table.stockout'),
      align: 'right',
      hideOnMobile: true,
      sortable: true,
      sortValue: (r) => r.stockoutDate ?? '',
      render: (r) =>
        r.stockoutDate ? (
          <span className="tnum text-sm text-ink-soft">{f.date(r.stockoutDate)}</span>
        ) : (
          <span className="text-muted">—</span>
        ),
    },
    {
      key: 'recommendedQty',
      header: t('table.qty'),
      align: 'right',
      width: 150,
      sortable: true,
      sortValue: (r) => r.recommendedQty,
      render: (r) =>
        r.recommendedQty > 0 ? (
          <span className="tnum inline-flex items-center rounded-xl bg-brand/[0.12] px-3 py-1.5 font-display text-base font-extrabold text-brand-ink">
            {f.num(r.recommendedQty)}
          </span>
        ) : (
          <span className="text-muted">—</span>
        ),
    },
    {
      key: 'purchaseCost',
      header: t('table.cost'),
      align: 'right',
      hideOnMobile: true,
      sortable: true,
      sortValue: (r) => r.purchaseCost,
      render: (r) => (r.purchaseCost > 0 ? f.money(r.purchaseCost) : <span className="text-muted">—</span>),
    },
    {
      key: 'lostRevenue',
      header: t('table.lost'),
      align: 'right',
      hideOnMobile: true,
      sortable: true,
      sortValue: (r) => r.lostRevenue,
      render: (r) =>
        r.lostRevenue > 0 ? (
          <span className="text-danger">{f.money(r.lostRevenue)}</span>
        ) : (
          <span className="text-muted">—</span>
        ),
    },
    {
      key: 'status',
      header: t('table.status'),
      align: 'center',
      render: (r) => (
        <Badge tone={STATUS_TONE[r.status]} dot>
          {t(`status.${r.status}`)}
        </Badge>
      ),
    },
  ];

  /** Jamlanmada ham nol o'rniga "—" — qatorlar bilan bir xil ko'rinish */
  const totalNum = (v: number) => (v > 0 ? f.num(v) : '—');
  const totalMoney = (v: number) => (v > 0 ? f.money(v) : '—');

  const visibleTotals = useMemo(
    () => ({
      stock: visibleRows.reduce((s, r) => s + r.stock, 0),
      qty: visibleRows.reduce((s, r) => s + r.recommendedQty, 0),
      cost: visibleRows.reduce((s, r) => s + r.purchaseCost, 0),
      lost: visibleRows.reduce((s, r) => s + r.lostRevenue, 0),
    }),
    [visibleRows],
  );

  return (
    <>
      <PageHeader
        icon={<Sparkles className="h-5 w-5" />}
        title={t('title')}
        description={t('subtitle')}
        badge={<PreviewBadge feature="planner" />}
      />

      <FilterBar />

      <PlanGate feature="planner">
        {planner.isError ? (
          <Card>
            <ErrorState
              message={planner.error instanceof Error ? planner.error.message : undefined}
              onRetry={() => void planner.refetch()}
            />
          </Card>
        ) : (
          <div className="space-y-5">
            {/* ── Boshqaruv ── */}
            <Card>
              <CardHeader icon={<Timer className="h-4 w-4" />} title={t('ctrl.title')} subtitle={t('ctrl.subtitle')} />
              <CardBody className="grid grid-cols-1 gap-5 lg:grid-cols-3">
                <div>
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="label mb-0">{t('ctrl.cover')}</span>
                    <span className="tnum font-display text-lg font-extrabold text-brand">
                      {coverInput} {t('ctrl.days')}
                    </span>
                  </div>
                  <input
                    type="range"
                    min={7}
                    max={90}
                    step={1}
                    value={coverInput}
                    onChange={(e) => setCoverInput(Number(e.target.value))}
                    aria-label={t('ctrl.cover')}
                    className="mt-3 h-2 w-full cursor-pointer appearance-none rounded-full bg-surface-3 accent-brand"
                  />
                  <div className="tnum mt-1.5 flex justify-between text-2xs text-muted">
                    <span>7</span>
                    <span>30</span>
                    <span>60</span>
                    <span>90</span>
                  </div>
                  <p className="mt-1.5 text-xs text-muted">{t('ctrl.coverHint')}</p>
                </div>

                <div>
                  <span className="label">{t('ctrl.lead')}</span>
                  <Select value={lead} onChange={(e) => setLead(Number(e.target.value))}>
                    {LEAD_OPTIONS.map((d) => (
                      <option key={d} value={d}>
                        {d} {t('ctrl.days')}
                      </option>
                    ))}
                  </Select>
                  <p className="mt-1.5 text-xs text-muted">{t('ctrl.leadHint')}</p>
                </div>

                <div>
                  <span className="label">{t('ctrl.search')}</span>
                  <SearchInput value={search} onChange={setSearch} placeholder={t('ctrl.search')} />
                </div>
              </CardBody>
            </Card>

            {/* ── Umumiy karta ── */}
            <div className="card overflow-hidden bg-aurora p-5 sm:p-6">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex min-w-0 items-start gap-4">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-brand-grad text-white">
                    <PackagePlus className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted">
                      {needRows.length > 0 ? t('hero.need') : t('hero.none')}
                    </p>
                    {planner.isLoading ? (
                      <Skeleton className="mt-2 h-8 w-64" />
                    ) : needRows.length > 0 ? (
                      <p className="tnum mt-1 font-display text-xl font-extrabold text-ink sm:text-2xl">
                        {t('hero.skus', { n: needRows.length })}
                        <span className="mx-2 text-muted">·</span>
                        <span className="text-brand">
                          {t('hero.sum', { v: f.money(data?.totalPurchaseCost ?? 0) })}
                        </span>
                      </p>
                    ) : (
                      <p className="mt-1 text-sm text-muted">{t('hero.noneHint')}</p>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {selected.length > 0 ? (
                    <>
                      <Badge tone="brand">{t('sel.count', { n: selected.length })}</Badge>
                      <Button variant="ghost" onClick={() => setSelected([])}>
                        {t('sel.clear')}
                      </Button>
                    </>
                  ) : null}
                  <Button
                    icon={<Truck className="h-4 w-4" />}
                    disabled={selected.length === 0}
                    loading={draft.isPending}
                    onClick={() => draft.mutate(selected)}
                  >
                    {t('sel.create')}
                  </Button>
                </div>
              </div>
            </div>

            {/* ── KPI ── */}
            <StatGrid>
              <StatCard
                label={t('kpi.skus')}
                value={f.num(needRows.length)}
                hint={t('kpi.skusHint')}
                icon={<PackagePlus className="h-5 w-5" />}
                tone="brand"
                loading={planner.isLoading}
              />
              <StatCard
                label={t('kpi.cost')}
                value={f.money(data?.totalPurchaseCost ?? 0)}
                hint={t('kpi.costHint')}
                icon={<Coins className="h-5 w-5" />}
                tone="info"
                loading={planner.isLoading}
              />
              <StatCard
                label={t('kpi.lost')}
                value={f.money(lostTotal)}
                hint={t('kpi.lostHint')}
                icon={<TrendingDown className="h-5 w-5" />}
                tone="danger"
                loading={planner.isLoading}
              />
              <StatCard
                label={t('kpi.critical')}
                value={f.num(data?.counts.critical ?? 0)}
                hint={t('kpi.criticalHint')}
                icon={<CalendarClock className="h-5 w-5" />}
                tone="warn"
                loading={planner.isLoading}
              />
            </StatGrid>

            {/* ── Kritik ogohlantirish ── */}
            {criticalRows.length > 0 ? (
              <div className="flex flex-wrap items-start gap-3 rounded-2xl border border-danger/25 bg-danger/10 p-4 sm:p-5">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-danger" />
                <div className="min-w-0 flex-1">
                  <p className="font-display text-sm font-bold text-ink">
                    {t('alert.title', { n: criticalRows.length })}
                  </p>
                  <p className="mt-1 text-sm text-ink-soft">{t('alert.body', { lead })}</p>
                </div>
                <Button size="sm" variant="outline" onClick={() => setFilter('critical')}>
                  {t('alert.action')}
                </Button>
              </div>
            ) : null}

            {/* ── Jadval ── */}
            <Card>
              <CardHeader
                title={t('table.product')}
                actions={
                  <div className="max-w-full overflow-x-auto no-scrollbar">
                    <Segmented options={filterOptions} value={filter} onChange={setFilter} size="sm" />
                  </div>
                }
              />
              <div className={cn('mt-4 overflow-x-auto', planner.isFetching && !planner.isLoading && 'opacity-70')}>
                <DataTable
                  columns={columns}
                  rows={visibleRows}
                  rowKey={(r) => r.skuId}
                  loading={planner.isLoading}
                  density="compact"
                  empty={
                    <EmptyState
                      icon={<Sparkles className="h-6 w-6" />}
                      title={rows.length === 0 ? t('empty.title') : t('table.empty')}
                      hint={rows.length === 0 ? t('empty.hint') : t('table.emptyHint')}
                    />
                  }
                  footer={
                    <>
                      <td className="px-3 py-2.5" colSpan={2}>
                        {t('table.totals')}
                      </td>
                      <td className="tnum px-3 py-2.5 text-right">{f.num(visibleTotals.stock)}</td>
                      <td className="hidden px-3 py-2.5 md:table-cell" />
                      <td className="hidden px-3 py-2.5 md:table-cell" />
                      <td className="hidden px-3 py-2.5 md:table-cell" />
                      <td className="tnum px-3 py-2.5 text-right text-brand">{totalNum(visibleTotals.qty)}</td>
                      <td className="tnum hidden px-3 py-2.5 text-right md:table-cell">
                        {totalMoney(visibleTotals.cost)}
                      </td>
                      <td className="tnum hidden px-3 py-2.5 text-right text-danger md:table-cell">
                        {totalMoney(visibleTotals.lost)}
                      </td>
                      <td className="px-3 py-2.5" />
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
