import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  Coins,
  History,
  PackagePlus,
  Sparkles,
  Timer,
  TrendingDown,
  TrendingUp,
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
    subtitle: 'Nimani, qancha va qachon buyurtma qilish kerak — tovarsiz qolmaslik uchun',

    'ctrl.title': 'Hisob parametrlari',
    'ctrl.subtitle': 'Yetkazib berish muddati buyurtma kunini, zaxira davri esa miqdorni belgilaydi',
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
    'kpi.lost': 'Kelguncha yo‘qotiladi',
    'kpi.lostHint': 'Bugun buyurtma berilsa ham, tovar yetib kelguncha',
    'kpi.lostPast': 'O‘tgan {n} kunda yo‘qotilgan',
    'kpi.lostPastHint': 'Tovar tugab turgan kunlarda sotilmay qolgan',

    'alert.title': '{n} ta mahsulot kritik holatda',
    'alert.body': 'Bugun buyurtma bersangiz ham tovar kelguncha ({lead} kun) qoldiq tugaydi — kechiktirmang.',
    'alert.action': 'Kritiklarni ko‘rish',

    'filter.all': 'Hammasi',
    'filter.critical': 'Kritik',
    'filter.ending': 'Buyurtma vaqti',
    'filter.enough': 'Yetarli',
    'filter.no_action': 'Harakatsiz',

    'table.product': 'Mahsulot',
    'table.stock': 'Qoldiq',
    'table.avgDaily': 'Kunlik sotuv',
    'table.daysLeft': 'Yetadi',
    'table.orderBy': 'Buyurtma kuni',
    'table.qty': 'Tavsiya',
    'table.totals': 'Jami',
    'table.empty': 'Bu filtr bo‘yicha mahsulot topilmadi',
    'table.emptyHint': 'Filtrni o‘zgartiring yoki zaxira davrini oshiring',
    'table.noSales': 'Sotuv yo‘q',
    'table.selectAll': 'Barchasini tanlash',
    'row.inbound': '+{n} yo‘lda',
    'row.sold': '{days} kunda {n} ta',
    'row.stockout': '{n} kun tugab turdi',
    'row.until': '{date} gacha',
    'row.days': '{n} kun',
    'row.orderToday': 'Bugun',
    'row.orderLate': '{n} kun kechikdi',
    'row.orderIn': '{n} kundan keyin',
    'row.gap': 'kelguncha {n} kun tovarsiz',
    'note.method': 'Kunlik sotuv oxirgi {window} kunda tovar sotuvda bo‘lgan kunlar bo‘yicha hisoblanadi — tugab turgan kunlar kirmaydi. Buyurtma kuni = tugash sanasi − yetkazish muddati − {safety} kun ehtiyot zaxirasi.',

    'sel.count': '{n} ta tanlandi',
    'sel.create': 'Tanlanganlardan yetkazma yaratish',
    'sel.clear': 'Tanlovni tozalash',
    'sel.ok': 'Yetkazma qoralamasi yaratildi',
    'sel.okBody': '{n} ta SKU qoralamaga qo‘shildi',
    'sel.err': 'Yetkazma qoralamasini yaratib bo‘lmadi',


    'empty.title': 'Rejalashtirish uchun ma’lumot yo‘q',
    'empty.hint': 'Sinxronizatsiya tugagach, sotuv tarixi asosida tavsiyalar paydo bo‘ladi',
  },
  ru: {
    title: 'Планировщик',
    subtitle: 'Что, сколько и когда заказывать, чтобы не остаться без товара',

    'ctrl.title': 'Параметры расчёта',
    'ctrl.subtitle': 'Срок доставки определяет день заказа, период запаса — количество',
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
    'kpi.lost': 'Потеряем до прихода',
    'kpi.lostHint': 'Даже если заказать сегодня — пока товар едет',
    'kpi.lostPast': 'Потеряно за {n} дн.',
    'kpi.lostPastHint': 'Не продано в дни, когда товара не было',

    'alert.title': '{n} товаров в критическом состоянии',
    'alert.body': 'Даже при заказе сегодня остаток закончится раньше, чем товар приедет ({lead} дн.) — не откладывайте.',
    'alert.action': 'Показать критичные',

    'filter.all': 'Все',
    'filter.critical': 'Критичные',
    'filter.ending': 'Пора заказывать',
    'filter.enough': 'Достаточно',
    'filter.no_action': 'Без движения',

    'table.product': 'Товар',
    'table.stock': 'Остаток',
    'table.avgDaily': 'Продаж в день',
    'table.daysLeft': 'Хватит на',
    'table.orderBy': 'День заказа',
    'table.qty': 'Заказать',
    'table.totals': 'Итого',
    'table.empty': 'По этому фильтру товаров нет',
    'table.emptyHint': 'Измените фильтр или увеличьте период запаса',
    'table.noSales': 'Нет продаж',
    'table.selectAll': 'Выбрать всё',
    'row.inbound': '+{n} в пути',
    'row.sold': '{n} шт. за {days} дн.',
    'row.stockout': 'не было {n} дн.',
    'row.until': 'до {date}',
    'row.days': '{n} дн.',
    'row.orderToday': 'Сегодня',
    'row.orderLate': 'опоздание {n} дн.',
    'row.orderIn': 'через {n} дн.',
    'row.gap': 'до прихода {n} дн. без товара',
    'note.method': 'Продажи в день считаются по дням, когда товар был в наличии за последние {window} дн. — дни без остатка не учитываются. День заказа = дата окончания − срок доставки − {safety} дн. страхового запаса.',

    'sel.count': 'Выбрано: {n}',
    'sel.create': 'Создать поставку из выбранных',
    'sel.clear': 'Сбросить выбор',
    'sel.ok': 'Черновик поставки создан',
    'sel.okBody': 'В черновик добавлено {n} SKU',
    'sel.err': 'Не удалось создать черновик поставки',


    'empty.title': 'Нет данных для планирования',
    'empty.hint': 'После синхронизации появятся рекомендации на основе истории продаж',
  },
  en: {
    title: 'Planner',
    subtitle: 'What, how much and when to reorder so you never run out',

    'ctrl.title': 'Calculation settings',
    'ctrl.subtitle': 'Lead time sets the order date, the cover period sets the quantity',
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
    'kpi.lost': 'Lost before arrival',
    'kpi.lostHint': 'Even if you order today — while the goods are on the way',
    'kpi.lostPast': 'Lost in the last {n} days',
    'kpi.lostPastHint': 'Not sold on days the item was out of stock',

    'alert.title': '{n} products are critical',
    'alert.body': 'Even if you order today, stock runs out before the goods arrive ({lead} days) — do not delay.',
    'alert.action': 'Show critical',

    'filter.all': 'All',
    'filter.critical': 'Critical',
    'filter.ending': 'Time to order',
    'filter.enough': 'Healthy',
    'filter.no_action': 'No movement',

    'table.product': 'Product',
    'table.stock': 'Stock',
    'table.avgDaily': 'Daily sales',
    'table.daysLeft': 'Lasts',
    'table.orderBy': 'Order by',
    'table.qty': 'Order',
    'table.totals': 'Total',
    'table.empty': 'No products match this filter',
    'table.emptyHint': 'Change the filter or increase the cover period',
    'table.noSales': 'No sales',
    'table.selectAll': 'Select all',
    'row.inbound': '+{n} inbound',
    'row.sold': '{n} sold in {days} days',
    'row.stockout': 'out of stock {n} days',
    'row.until': 'until {date}',
    'row.days': '{n} days',
    'row.orderToday': 'Today',
    'row.orderLate': '{n} days late',
    'row.orderIn': 'in {n} days',
    'row.gap': '{n} days without stock before arrival',
    'note.method': 'Daily sales are based on the days the item was in stock over the last {window} days — out-of-stock days are excluded. Order date = run-out date − lead time − {safety} days of safety stock.',

    'sel.count': '{n} selected',
    'sel.create': 'Create a shipment from the selection',
    'sel.clear': 'Clear selection',
    'sel.ok': 'Shipment draft created',
    'sel.okBody': '{n} SKUs added to the draft',
    'sel.err': 'Could not create the shipment draft',


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

/** Yo'nalish shu foizdan kichik bo'lsa ko'rsatilmaydi — u tasodifiy tebranish */
const TREND_MIN_PCT = 10;

/** Sotuvchining tanlovi eslab qolinadi: yetkazish muddati har kirganda qayta terilmasin */
const PARAMS_KEY = 'sq-planner';

function readParams(): { cover: number; lead: number } {
  try {
    const saved = JSON.parse(localStorage.getItem(PARAMS_KEY) ?? '{}') as { cover?: unknown; lead?: unknown };
    const cover = Number(saved.cover);
    const lead = Number(saved.lead);
    return {
      cover: Number.isFinite(cover) && cover >= 7 && cover <= 90 ? Math.round(cover) : 30,
      lead: LEAD_OPTIONS.includes(lead) ? lead : 7,
    };
  } catch {
    return { cover: 30, lead: 7 };
  }
}

export default function Planner() {
  const t = useT('planner');
  const f = useFormat();
  const q = usePeriodQuery();
  const navigate = useNavigate();

  const [initial] = useState(readParams);
  const [coverInput, setCoverInput] = useState(initial.cover);
  const [cover, setCover] = useState(initial.cover);
  const [lead, setLead] = useState(initial.lead);
  const [filter, setFilter] = useState<FilterKey>('all');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<string[]>([]);

  // Slayder harakatlanayotganda so'rovlar bilan to'ldirib yubormaslik uchun
  useEffect(() => {
    const id = setTimeout(() => setCover(coverInput), 300);
    return () => clearTimeout(id);
  }, [coverInput]);

  useEffect(() => {
    try {
      localStorage.setItem(PARAMS_KEY, JSON.stringify({ cover, lead }));
    } catch {
      // xotira yopiq (maxfiy rejim) — tanlov shu kirishdagina amal qiladi
    }
  }, [cover, lead]);

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
  const totals = data?.totals;

  const visibleRows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (filter !== 'all' && r.status !== filter) return false;
      if (!term) return true;
      return (
        r.title.toLowerCase().includes(term) ||
        r.sku.toLowerCase().includes(term) ||
        (r.variant ?? '').toLowerCase().includes(term)
      );
    });
  }, [rows, filter, search]);

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
    // Tanlangan parametrlar ham yuboriladi: qoralamadagi miqdor jadvaldagi "Tavsiya" bilan bir xil chiqsin
    mutationFn: (skuIds: string[]) => api.post<unknown>('/planner/shipment-draft', { skuIds, cover, lead }),
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

  /** "Yetadi" chizig'i shu davrga nisbatan to'ladi: yetkazish muddati + zaxira davri */
  const horizon = Math.max(1, lead + cover);

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
      render: (r) => (
        // Kenglik cheklangan: uzun nom ustunni cho'zib, jadvalni yon tomonga surib yubormaydi
        <div className="max-w-[13rem] 2xl:max-w-[24rem]">
          <ProductCell
            title={r.title}
            subtitle={r.variant ? `${r.variant} · ${r.sku}` : r.sku}
            imageUrl={r.imageUrl}
            size={40}
          />
        </div>
      ),
    },
    {
      key: 'stock',
      header: t('table.stock'),
      align: 'right',
      sortable: true,
      sortValue: (r) => r.stock + r.inbound,
      render: (r) => (
        <div>
          <span className="font-semibold text-ink">{f.num(r.stock)}</span>
          {r.inbound > 0 ? (
            <p className="text-2xs font-medium text-info-ink">{t('row.inbound', { n: f.num(r.inbound) })}</p>
          ) : null}
        </div>
      ),
    },
    {
      key: 'avgDaily',
      header: t('table.avgDaily'),
      align: 'right',
      hideOnMobile: true,
      sortable: true,
      sortValue: (r) => r.avgDaily,
      render: (r) => {
        if (r.avgDaily <= 0) return <span className="text-xs font-normal text-muted">{t('table.noSales')}</span>;
        const trend = r.trendPct !== null && Math.abs(r.trendPct) >= TREND_MIN_PCT ? r.trendPct : null;
        return (
          <div>
            <span className="font-semibold text-ink">{f.num(r.avgDaily, r.avgDaily < 1 ? 2 : 1)}</span>
            {trend !== null ? (
              <span
                className={cn(
                  'ml-1.5 inline-flex items-center gap-0.5 text-2xs font-semibold',
                  trend > 0 ? 'text-brand-ink' : 'text-danger',
                )}
              >
                {trend > 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                {trend > 0 ? '+' : ''}
                {trend}%
              </span>
            ) : null}
            {/* Tezlik qayerdan chiqqani — sotuvchi o'zi tekshirib ko'ra oladi */}
            <p className="text-2xs font-normal text-muted">{t('row.sold', { days: r.inStockDays, n: f.num(r.soldUnits) })}</p>
            {r.stockoutDays > 0 ? (
              <p className="text-2xs font-medium text-warn-ink">{t('row.stockout', { n: r.stockoutDays })}</p>
            ) : null}
          </div>
        );
      },
    },
    {
      key: 'daysLeft',
      header: t('table.daysLeft'),
      width: 130,
      hideOnMobile: true,
      sortable: true,
      sortValue: (r) => (r.daysLeft === null ? Number.MAX_SAFE_INTEGER : r.daysLeft),
      render: (r) => {
        if (r.daysLeft === null) return <span className="text-muted">—</span>;
        return (
          <div className="min-w-[6rem]">
            <span className="tnum text-sm font-semibold text-ink">{t('row.days', { n: f.num(r.daysLeft) })}</span>
            <ProgressBar
              value={Math.min(100, (r.daysLeft / horizon) * 100)}
              tone={STATUS_TONE[r.status]}
              className="mt-1.5"
            />
            {r.stockoutDate ? (
              <p className="tnum mt-1 text-2xs text-muted">{t('row.until', { date: f.dateShort(r.stockoutDate) })}</p>
            ) : null}
          </div>
        );
      },
    },
    {
      key: 'orderBy',
      header: t('table.orderBy'),
      sortable: true,
      sortValue: (r) => (r.orderInDays === null ? Number.MAX_SAFE_INTEGER : r.orderInDays),
      render: (r) => {
        if (r.orderInDays === null || !r.orderBy) return <span className="text-muted">—</span>;
        const due = r.orderInDays <= 0;
        return (
          <div className="min-w-[6.5rem] max-w-[11rem]">
            <p
              className={cn(
                'tnum text-sm font-semibold',
                r.status === 'critical' ? 'text-danger' : due ? 'text-warn-ink' : 'text-ink',
              )}
            >
              {due ? t('row.orderToday') : f.dateShort(r.orderBy)}
            </p>
            <p className="tnum text-2xs text-muted">
              {r.orderInDays < 0
                ? t('row.orderLate', { n: -r.orderInDays })
                : due
                  ? f.dateShort(r.orderBy)
                  : t('row.orderIn', { n: r.orderInDays })}
            </p>
            {r.gapDays > 0 ? (
              <p className="tnum text-2xs font-medium leading-snug text-danger">
                {t('row.gap', { n: r.gapDays })}
                {r.lostRevenue > 0 ? <span className="block whitespace-nowrap">−{f.money(r.lostRevenue)}</span> : null}
              </p>
            ) : null}
          </div>
        );
      },
    },
    {
      key: 'recommendedQty',
      header: t('table.qty'),
      align: 'right',
      sortable: true,
      sortValue: (r) => r.recommendedQty,
      render: (r) =>
        r.recommendedQty > 0 ? (
          <div>
            <span className="tnum inline-flex items-center rounded-xl bg-brand/10 px-3 py-1 font-display text-base font-extrabold text-brand-ink">
              {f.num(r.recommendedQty)}
            </span>
            {r.purchaseCost > 0 ? (
              <p className="mt-1 text-2xs font-normal text-muted">{f.money(r.purchaseCost)}</p>
            ) : null}
          </div>
        ) : (
          <span className="text-muted">—</span>
        ),
    },
  ];

  const visibleTotals = useMemo(
    () => ({
      stock: visibleRows.reduce((sum, r) => sum + r.stock, 0),
      qty: visibleRows.reduce((sum, r) => sum + r.recommendedQty, 0),
      cost: visibleRows.reduce((sum, r) => sum + r.purchaseCost, 0),
    }),
    [visibleRows],
  );

  const needSkus = totals?.needSkus ?? 0;

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
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="label mb-0">{t('ctrl.cover')}</span>
                    <span className="tnum font-display text-lg font-extrabold text-brand-ink">
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
                  <span className="label">{t('ctrl.search')}</span>
                  <SearchInput value={search} onChange={setSearch} placeholder={t('ctrl.search')} />
                </div>
              </CardBody>
            </Card>

            {/* ── Umumiy karta ── */}
            <div className="card overflow-hidden bg-aurora p-5 sm:p-6">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex min-w-0 items-start gap-4">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-brand-grad text-on-brand">
                    <PackagePlus className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <p className="eyebrow-lg">{needSkus > 0 ? t('hero.need') : t('hero.none')}</p>
                    {planner.isLoading ? (
                      <Skeleton className="mt-2 h-8 w-64" />
                    ) : needSkus > 0 ? (
                      <p className="tnum mt-1 font-display text-xl font-extrabold tracking-tight text-ink sm:text-2xl">
                        {t('hero.skus', { n: needSkus })}
                        <span className="mx-2 text-muted">·</span>
                        <span className="text-brand">{t('hero.sum', { v: f.money(totals?.purchaseCost ?? 0) })}</span>
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

            {/* ── KPI: butun katalog bo'yicha, qaysi yorliq ochiq bo'lishidan qat'i nazar ── */}
            <StatGrid>
              <StatCard
                label={t('kpi.skus')}
                value={f.num(needSkus)}
                hint={t('kpi.skusHint')}
                icon={<PackagePlus className="h-5 w-5" />}
                tone="brand"
                loading={planner.isLoading}
              />
              <StatCard
                label={t('kpi.cost')}
                value={f.money(totals?.purchaseCost ?? 0)}
                hint={t('kpi.costHint')}
                icon={<Coins className="h-5 w-5" />}
                tone="info"
                loading={planner.isLoading}
              />
              <StatCard
                label={t('kpi.lost')}
                value={f.money(totals?.lostRevenue ?? 0)}
                hint={t('kpi.lostHint')}
                icon={<TrendingDown className="h-5 w-5" />}
                tone="danger"
                loading={planner.isLoading}
              />
              <StatCard
                label={t('kpi.lostPast', { n: data?.windowDays ?? 30 })}
                value={f.money(totals?.lostPast ?? 0)}
                hint={t('kpi.lostPastHint')}
                icon={<History className="h-5 w-5" />}
                tone="warn"
                loading={planner.isLoading}
              />
            </StatGrid>

            {/* ── Kritik ogohlantirish ── */}
            {(data?.counts.critical ?? 0) > 0 ? (
              <div className="flex flex-wrap items-start gap-3 rounded-2xl border border-danger/25 bg-danger/10 p-4 sm:p-5">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-danger" />
                <div className="min-w-0 flex-1">
                  <p className="font-display text-sm font-bold text-ink">
                    {t('alert.title', { n: data?.counts.critical ?? 0 })}
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
                  <div className="no-scrollbar max-w-full overflow-x-auto">
                    <Segmented options={filterOptions} value={filter} onChange={setFilter} size="sm" />
                  </div>
                }
              />
              <div className={cn('mt-4', planner.isFetching && !planner.isLoading && 'opacity-70')}>
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
                      <td className="px-5 py-2.5" colSpan={2}>
                        {t('table.totals')}
                      </td>
                      <td className="tnum px-5 py-2.5 text-right">{f.num(visibleTotals.stock)}</td>
                      <td className="hidden px-5 py-2.5 md:table-cell" />
                      <td className="hidden px-5 py-2.5 md:table-cell" />
                      <td className="px-5 py-2.5" />
                      <td className="tnum px-5 py-2.5 text-right">
                        <span className="text-brand-ink">{visibleTotals.qty > 0 ? f.num(visibleTotals.qty) : '—'}</span>
                        {visibleTotals.cost > 0 ? (
                          <p className="text-2xs font-normal text-muted">{f.money(visibleTotals.cost)}</p>
                        ) : null}
                      </td>
                    </>
                  }
                />
              </div>
              {data ? (
                <p className="border-t border-line px-5 py-3 text-xs leading-relaxed text-muted">
                  {t('note.method', { window: data.windowDays, safety: data.safetyDays })}
                </p>
              ) : null}
            </Card>
          </div>
        )}
      </PlanGate>
    </>
  );
}
