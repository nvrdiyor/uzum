import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  ArrowRight,
  CalendarClock,
  Download,
  History,
  PackagePlus,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Truck,
} from '@/components/icons';
import {
  toBusinessDate,
  type PlannerDraftResponse,
  type PlannerDraftScope,
  type PlannerResponse,
  type PlannerRow,
} from '@savdoiq/shared';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  DataTable,
  EmptyState,
  ErrorState,
  HeroCard,
  PageHeader,
  PreviewBadge,
  ProgressBar,
  Segmented,
  Skeleton,
  StatCard,
  StatGrid,
  toast,
  type Column,
} from '@/components/ui';
import { FilterBar } from '@/components/filters';
import { PlannerParams } from '@/components/planner/PlannerParams';
import { PLAN_STATUS_TONE, PlannerTeaser } from '@/components/planner/PlannerTeaser';
import {
  useCanEditPlanner,
  useMigrateLegacyPlannerParams,
  usePlannerSettings,
} from '@/components/planner/usePlannerSettings';
import { SkuNameCell } from '@/components/stock/common';
import { DataFreshness } from '@/components/trust/DataFreshness';
import { SkuSearchInput } from '@/components/products/SkuSearchInput';
import { useDebounced } from '@/components/sales/useDebounced';
import { api } from '@/lib/api';
import { useFeature } from '@/store/session';
import { usePeriodQuery } from '@/store/ui';
import { cn, downloadBlob } from '@/lib/utils';
import { useCanFetch, useSeesMoney } from '@/lib/view';
import { registerNamespace, useFormat, useT } from '@/i18n';

registerNamespace('planner', {
  uz: {
    title: 'Rejalashtiruvchi',
    subtitle: 'Nimani, qancha va qachon buyurtma qilish kerak — tovarsiz qolmaslik uchun',

    'hero.need': 'Buyurtma qilish kerak',
    'hero.skus': '{n} ta SKU',
    'hero.sum': 'jami taxminan {v}',
    'hero.none': 'Hozircha hech narsa buyurtma qilish shart emas',
    'hero.noneHint': 'Barcha mahsulotlar tanlangan zaxira davriga yetadi',
    'hero.ship': 'Ombordan FBO’ga jo‘nating: {units} dona · {n} ta SKU',
    'hero.draftAll': '{n} SKU bo‘yicha yetkazma',
    'hero.draftUrgent': 'Faqat shoshilinchlar ({n})',
    'hero.export': 'Sotib olish ro‘yxati',
    'hero.exportHint': 'Yetkazib beruvchi uchun Excel: SKU, shtrix-kod, dona, narx',
    'hero.noShip': 'O‘z omboringiz va FBS’da FBO’ga jo‘natiladigan tovar yo‘q — avval sotib olish kerak',
    'hero.viewer': 'Yetkazma yaratish — egasi yoki menejer uchun',

    'kpi.lost': 'Kelguncha yo‘qotiladi',
    'kpi.lostHint': 'Bugun buyurtma berilsa ham, tovar yetib kelguncha',
    'kpi.lostPast': 'O‘tgan {n} kunda yo‘qotilgan',
    'kpi.lostPastHint': 'Tovar tugab turgan kunlarda sotilmay qolgan',
    'kpi.orderNow': 'Bugun buyurtma',
    'kpi.orderNowHint': 'Buyurtma kuni yetgan yoki o‘tib ketgan SKU’lar',

    'alert.title': '{n} ta mahsulot kritik holatda',
    'alert.body': 'Bugun buyurtma bersangiz ham tovar kelguncha ({lead} kun) qoldiq tugaydi — kechiktirmang.',
    'alert.action': 'Kritiklarni ko‘rish',

    'table.title': 'Buyurtma rejasi',
    'table.subtitle': 'Har SKU uchun qoldiq, sotuv sur’ati, sotib olish va FBO’ga jo‘natish miqdori',
    'row.gapShort': '{n} kun tovarsiz',

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
    'table.qty': 'Sotib olish · jo‘natish',
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
    'row.buy': 'Sotib oling: {n} dona',
    'row.ship': 'FBO’ga {n}',
    'row.shipHint': 'Ombordan FBO’ga jo‘nating: {n} dona (o‘z ombori va FBS’da jo‘natsa bo‘ladigani: {m})',
    'note.method': 'Kunlik sotuv oxirgi {window} kunda tovar sotuvda bo‘lgan kunlar bo‘yicha hisoblanadi — tugab turgan kunlar kirmaydi. Buyurtma kuni = tugash sanasi − yetkazish muddati − {safety} kun ehtiyot zaxirasi.',
    'note.ship': 'FBO’ga kerakli miqdorning o‘z ombori va FBS’dagi (band qilinganidan tashqari) tovar qoplay oladigan qismi — jo‘natish, qolgani — sotib olish. Yetkazmaga faqat jo‘natiladigan miqdor tushadi.',

    'sel.count': '{n} ta tanlandi',
    'sel.create': 'Tanlanganlardan yetkazma yaratish',
    'sel.clear': 'Tanlovni tozalash',
    'sel.ok': 'Yetkazma qoralamasi yaratildi',
    'sel.okBody': '{n} ta SKU, {units} dona qoralamaga qo‘shildi',
    'sel.okBuy': 'Sotib olish kerak: {units} dona — “Sotib olish ro‘yxati”da',
    'sel.err': 'Yetkazma qoralamasini yaratib bo‘lmadi',
    'export.error': 'Faylni yuklab bo‘lmadi',

    'empty.title': 'Rejalashtirish uchun ma’lumot yo‘q',
    'empty.hint': 'Sinxronizatsiya tugagach, sotuv tarixi asosida tavsiyalar paydo bo‘ladi',
  },
  ru: {
    title: 'Планировщик',
    subtitle: 'Что, сколько и когда заказывать, чтобы не остаться без товара',

    'hero.need': 'Нужно заказать',
    'hero.skus': '{n} SKU',
    'hero.sum': 'на сумму около {v}',
    'hero.none': 'Пока заказывать нечего',
    'hero.noneHint': 'Всех товаров хватает на выбранный период запаса',
    'hero.ship': 'Отгрузить со склада на FBO: {units} шт. · SKU: {n}',
    'hero.draftAll': 'Поставка по {n} SKU',
    'hero.draftUrgent': 'Только срочные ({n})',
    'hero.export': 'Список закупки',
    'hero.exportHint': 'Excel для поставщика: SKU, штрихкод, количество, цена',
    'hero.noShip': 'На своём складе и FBS нечего отгрузить на FBO — сначала нужна закупка',
    'hero.viewer': 'Создать поставку может владелец или менеджер',

    'kpi.lost': 'Потеряем до прихода',
    'kpi.lostHint': 'Даже если заказать сегодня — пока товар едет',
    'kpi.lostPast': 'Потеряно за {n} дн.',
    'kpi.lostPastHint': 'Не продано в дни, когда товара не было',
    'kpi.orderNow': 'Заказать сегодня',
    'kpi.orderNowHint': 'SKU, у которых день заказа наступил или уже прошёл',

    'alert.title': 'Товаров в критическом состоянии: {n}',
    'alert.body': 'Даже при заказе сегодня остаток закончится раньше, чем товар приедет ({lead} дн.) — не откладывайте.',
    'alert.action': 'Показать критичные',

    'table.title': 'План закупки',
    'table.subtitle': 'Остаток, темп продаж, сколько закупить и отгрузить на FBO по каждому SKU',
    'row.gapShort': '{n} дн. без товара',

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
    'table.qty': 'Закупка · отгрузка',
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
    'row.buy': 'Закупить: {n} шт.',
    'row.ship': 'На FBO {n}',
    'row.shipHint': 'Отгрузить со склада на FBO: {n} шт. (можно отгрузить со своего склада и FBS: {m})',
    'note.method': 'Продажи в день считаются по дням, когда товар был в наличии за последние {window} дн. — дни без остатка не учитываются. День заказа = дата окончания − срок доставки − {safety} дн. страхового запаса.',
    'note.ship': 'Часть потребности FBO, которую покрывает товар на своём складе и FBS (кроме зарезервированного), — отгрузка, остальное — закупка. В поставку попадает только количество к отгрузке.',

    'sel.count': 'Выбрано: {n}',
    'sel.create': 'Создать поставку из выбранных',
    'sel.clear': 'Сбросить выбор',
    'sel.ok': 'Черновик поставки создан',
    'sel.okBody': 'В черновик добавлено: {n} SKU, {units} шт.',
    'sel.okBuy': 'Нужно закупить: {units} шт. — в «Списке закупки»',
    'sel.err': 'Не удалось создать черновик поставки',
    'export.error': 'Не удалось скачать файл',

    'empty.title': 'Нет данных для планирования',
    'empty.hint': 'После синхронизации появятся рекомендации на основе истории продаж',
  },
  en: {
    title: 'Planner',
    subtitle: 'What, how much and when to reorder so you never run out',

    'hero.need': 'You need to reorder',
    'hero.skus': '{n} SKUs',
    'hero.sum': 'roughly {v} in total',
    'hero.none': 'Nothing to reorder right now',
    'hero.noneHint': 'Every product covers the selected period',
    'hero.ship': 'Ship from your warehouse to FBO: {units} pcs · {n} SKUs',
    'hero.draftAll': 'Shipment for {n} SKUs',
    'hero.draftUrgent': 'Urgent only ({n})',
    'hero.export': 'Purchase list',
    'hero.exportHint': 'Excel for your supplier: SKU, barcode, quantity, price',
    'hero.noShip': 'Nothing in your warehouse or FBS to ship to FBO — buy first',
    'hero.viewer': 'Only the owner or a manager can create shipments',

    'kpi.lost': 'Lost before arrival',
    'kpi.lostHint': 'Even if you order today — while the goods are on the way',
    'kpi.lostPast': 'Lost in the last {n} days',
    'kpi.lostPastHint': 'Not sold on days the item was out of stock',
    'kpi.orderNow': 'Order today',
    'kpi.orderNowHint': 'SKUs whose order date has come or already passed',

    'alert.title': '{n} products are critical',
    'alert.body': 'Even if you order today, stock runs out before the goods arrive ({lead} days) — do not delay.',
    'alert.action': 'Show critical',

    'table.title': 'Reorder plan',
    'table.subtitle': 'Stock, sales pace, how much to buy and to ship to FBO for every SKU',
    'row.gapShort': '{n} days out of stock',

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
    'table.qty': 'Buy · ship',
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
    'row.buy': 'Buy: {n} pcs',
    'row.ship': 'To FBO {n}',
    'row.shipHint': 'Ship from your warehouse to FBO: {n} pcs (available in your warehouse and FBS: {m})',
    'note.method': 'Daily sales are based on the days the item was in stock over the last {window} days — out-of-stock days are excluded. Order date = run-out date − lead time − {safety} days of safety stock.',
    'note.ship': 'The part of the FBO need that your own warehouse and FBS stock (minus reserved units) can cover is shipped, the rest is bought. A shipment only carries the quantity to ship.',

    'sel.count': '{n} selected',
    'sel.create': 'Create a shipment from the selection',
    'sel.clear': 'Clear selection',
    'sel.ok': 'Shipment draft created',
    'sel.okBody': '{n} SKUs, {units} pcs added to the draft',
    'sel.okBuy': 'Still to buy: {units} pcs — see the purchase list',
    'sel.err': 'Could not create the shipment draft',
    'export.error': 'Could not download the file',

    'empty.title': 'Nothing to plan yet',
    'empty.hint': 'Recommendations appear once the sync finishes and sales history is available',
  },
});

type FilterKey = 'all' | 'critical' | 'ending' | 'enough' | 'no_action';

/** Yo'nalish shu foizdan kichik bo'lsa ko'rsatilmaydi — u tasodifiy tebranish */
const TREND_MIN_PCT = 10;

type DraftBody = { scope: PlannerDraftScope } | { skuIds: string[] };

export default function Planner() {
  const t = useT('planner');
  const access = useFeature('planner');

  return (
    <>
      <PageHeader
        icon={<Sparkles className="h-5 w-5" />}
        title={t('title')}
        description={t('subtitle')}
        badge={<PreviewBadge feature="planner" />}
        meta={<DataFreshness />}
      />

      <FilterBar />

      {/*
        Sinov tarifida ('preview') — sotuvchining o'z eng shoshilinch SKU'lari
        ochiq, qolgan reja xiralashgan (PlannerTeaser). Ilgari butun sahifa
        xiralashib, ustida oq qulf kartochkasi turardi: jadval so'rovi 402
        qaytarardi, xiralashgani esa xato kartochkasi edi.
      */}
      {access === 'full' ? <PlannerFull /> : <PlannerTeaser />}
    </>
  );
}

function PlannerFull() {
  const t = useT('planner');
  const f = useFormat();
  const q = usePeriodQuery();
  const navigate = useNavigate();
  const canEdit = useCanEditPlanner();
  // Pulsiz ko'rinish shablonida (Omborchi) xarid summasi null — u ham, pulli Excel ham ko'rsatilmaydi
  const money = useSeesMoney();
  const canExport = useCanFetch('/export/planner');
  const settings = usePlannerSettings();
  // Brauzerda qolgan eski tanlov — bir marta kompaniya sozlamasiga
  useMigrateLegacyPlannerParams(settings.data);

  const [filter, setFilter] = useState<FilterKey>('all');
  // Mahsulot sahifasidagi "Rejalashtiruvchida ochish" havolasi ?search= bilan keladi (Uzum ID bo'yicha)
  const [params] = useSearchParams();
  const [search, setSearch] = useState(() => params.get('search') ?? '');
  const debounced = useDebounced(search.trim(), 350);
  const [selected, setSelected] = useState<string[]>([]);
  const [exporting, setExporting] = useState(false);

  /**
   * Filtr serverga ham yuboriladi: standart ko'rinishda server "harakat kerak
   * emas" qatorlarini qaytarmaydi, shuning uchun o'sha yorliq faqat mahalliy
   * filtr bilan bo'sh ko'rinardi. Yetkazish muddati va zaxira davri
   * YUBORILMAYDI — server kompaniya sozlamasini oladi; sozlama saqlanganda
   * bu so'rov qayta yuklanadi (useSavePlannerSettings).
   *
   * Qidiruv ham serverda — umumiy qoida (shared search.ts): nom, SKU kodi,
   * shtrix-kod, Uzum SKU / mahsulot ID'si, uzum.uz havolasi. Ilgari jadval
   * o'zi nom va SKU kodi bo'yicha qidirardi: kartochkadagi "ID: 701009"
   * topilmasdi. Hisoblagich va jamlanmalar qidiruvga bog'liq emas — server
   * ularni butun katalog bo'yicha beradi (2026-10-24).
   */
  const planner = useQuery({
    queryKey: ['planner', q, filter, debounced],
    queryFn: () => api.get<PlannerResponse>('/planner', { ...q, status: filter, search: debounced || undefined }),
    placeholderData: (prev) => prev,
  });

  const data = planner.data;
  const rows = useMemo(() => data?.rows ?? [], [data]);
  const totals = data?.totals;
  const lead = data?.leadDays ?? settings.data?.leadDays ?? 7;
  const cover = data?.coverDays ?? settings.data?.coverDays ?? 30;

  // Qidiruvni server bajargan — bu yerda faqat holat yorlig'i (javob kelguncha eski qatorlar turadi)
  const visibleRows = useMemo(
    () => rows.filter((r) => filter === 'all' || r.status === filter),
    [rows, filter],
  );

  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const visibleIds = useMemo(() => visibleRows.map((r) => r.skuId), [visibleRows]);
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedSet.has(id));

  const toggleRow = (skuId: string) =>
    setSelected((prev) => (prev.includes(skuId) ? prev.filter((x) => x !== skuId) : [...prev, skuId]));

  const toggleAll = () =>
    setSelected((prev) =>
      allVisibleSelected ? prev.filter((id) => !visibleIds.includes(id)) : Array.from(new Set([...prev, ...visibleIds])),
    );

  /*
   * Qoralamaga FAQAT jo'natiladigan miqdor tushadi (o'z ombori/FBS → FBO) —
   * sotib olinadigan qism yetkazma emas, u "Sotib olish ro'yxati" da. Hero
   * tugmalari (`scope`) qatorlarni qo'lda tanlashni talab qilmaydi; do'kon
   * filtri ham yuboriladi — qoralama ekrandagi reja bilan bir xil bo'lsin.
   */
  const draft = useMutation({
    mutationFn: (body: DraftBody) =>
      api.post<PlannerDraftResponse>('/planner/shipment-draft', { ...body, storeId: q.storeId }),
    onSuccess: (res) => {
      const body = t('sel.okBody', { n: f.num(res.itemsCount), units: f.num(res.unitsCount) });
      toast.success(t('sel.ok'), res.buyUnits > 0 ? `${body}. ${t('sel.okBuy', { units: f.num(res.buyUnits) })}` : body);
      setSelected([]);
      navigate('/shipments');
    },
    onError: (err: unknown) => {
      toast.error(t('sel.err'), err instanceof Error ? err.message : undefined);
    },
  });
  const pendingScope = draft.isPending && draft.variables && 'scope' in draft.variables ? draft.variables.scope : null;
  const pendingSelection = draft.isPending && draft.variables !== undefined && 'skuIds' in draft.variables;

  /** Yetkazib beruvchi uchun Excel — sahifadagi filtrlar bilan (do'kon, holat yorlig'i, qidiruv) */
  async function onExport() {
    setExporting(true);
    try {
      const blob = await api.blob('/export/planner', {
        storeId: q.storeId,
        status: filter,
        // Jadvaldagi bilan aynan bir xil so'rov — fayl ekrandagi qatorlarni beradi
        search: debounced || undefined,
      });
      downloadBlob(blob, `sotib-olish-${toBusinessDate(new Date())}.xlsx`);
    } catch {
      toast.error(t('export.error'));
    } finally {
      setExporting(false);
    }
  }

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
        // Kenglik cheklangan, nom esa ikki qatorgacha: ilgari 13rem'da bir qatorga
        // kesilib "Paxta choyshab to'pl…" bo'lib qolardi (1366 px'da ham)
        <SkuNameCell
          className="min-w-[11rem] max-w-[15rem] 2xl:max-w-[24rem]"
          title={r.title}
          subtitle={r.variant ? `${r.variant} · ${r.sku}` : r.sku}
          imageUrl={r.imageUrl}
        />
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
              tone={PLAN_STATUS_TONE[r.status]}
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
            <p className={cn('tnum text-2xs', r.orderInDays < 0 ? 'font-medium text-danger-ink' : 'text-muted')}>
              {r.orderInDays < 0
                ? t('row.orderLate', { n: -r.orderInDays })
                : due
                  ? f.dateShort(r.orderBy)
                  : t('row.orderIn', { n: r.orderInDays })}
            </p>
            {/*
              Ilgari bu yerda to'rt qator qizil yozuv turardi ("Bugun / 10 kun
              kechikdi / kelguncha 7 kun tovarsiz / −6 735 750 so'm"). Endi bitta
              qator: necha kun tovarsiz va qancha tushum yo'qoladi; to'liq summa izohda.
            */}
            {r.gapDays > 0 ? (
              <p
                className="tnum mt-0.5 whitespace-nowrap text-2xs font-semibold text-danger"
                title={`${t('row.gap', { n: r.gapDays })}${r.lostRevenue > 0 ? ` · −${f.money(r.lostRevenue)}` : ''}`}
              >
                {t('row.gapShort', { n: r.gapDays })}
                {r.lostRevenue > 0 ? ` · −${f.compact(r.lostRevenue)}` : ''}
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
      sortValue: (r) => r.recommendedQty * 1_000_000 + r.shipQty,
      render: (r) =>
        r.recommendedQty > 0 || r.shipQty > 0 ? (
          <div className="flex flex-col items-end">
            {/*
              Katta raqam — SOTIB OLISH miqdori, shoshilinchlik rangida (holat
              nishoni bilan bir xil): kritik — qizil, buyurtma vaqti — sariq,
              qolgani — neytral. Ostida — o'z ombori/FBS dan FBO'ga
              jo'natiladigan qism (ko'k): u sotib olinmaydi, yetkazmaga tushadi.
            */}
            {r.recommendedQty > 0 ? (
              <span
                title={t('row.buy', { n: f.num(r.recommendedQty) })}
                className={cn(
                  'tnum inline-flex items-center rounded-xl px-3 py-1 font-display text-base font-extrabold',
                  r.status === 'critical'
                    ? 'bg-danger/10 text-danger-ink'
                    : r.status === 'ending'
                      ? 'bg-warn/10 text-warn-ink'
                      : 'bg-surface-3 text-ink',
                )}
              >
                {f.num(r.recommendedQty)}
              </span>
            ) : null}
            {r.recommendedQty > 0 && r.purchaseCost > 0 ? (
              <p className="mt-1 text-2xs font-normal text-muted">{f.money(r.purchaseCost)}</p>
            ) : null}
            {r.shipQty > 0 ? (
              <p
                className="tnum mt-1 inline-flex items-center gap-1 whitespace-nowrap text-2xs font-semibold text-info-ink"
                title={t('row.shipHint', { n: f.num(r.shipQty), m: f.num(r.shippable) })}
              >
                <Truck className="h-3 w-3" />
                {t('row.ship', { n: f.num(r.shipQty) })}
              </p>
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
      ship: visibleRows.reduce((sum, r) => sum + r.shipQty, 0),
    }),
    [visibleRows],
  );

  const needSkus = totals?.needSkus ?? 0;
  const shipSkus = totals?.shipSkus ?? 0;
  const urgentShipSkus = totals?.urgentShipSkus ?? 0;
  const critical = data?.counts.critical ?? 0;
  const draftTitle = !canEdit ? t('hero.viewer') : shipSkus === 0 && data ? t('hero.noShip') : undefined;

  if (planner.isError) {
    return (
      <Card>
        <ErrorState
          message={planner.error instanceof Error ? planner.error.message : undefined}
          onRetry={() => void planner.refetch()}
        />
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      {/*
        Sahifadagi yagona HeroCard: nimani va qanchaga SOTIB OLISH, qanchasini
        o'z omboridan FBO'ga JO'NATISH kerak. Yetkazma tugmalari qatorlarni
        tanlashni talab qilmaydi: "{n} SKU bo'yicha" — jo'natiladigan hammasi,
        "Faqat shoshilinchlar" — buyurtma kuni yetganlari.
      */}
      <HeroCard tone="brand" className="p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex min-w-0 items-start gap-4">
            <span className="icon-tile h-12 w-12 rounded-2xl [&_svg]:h-6 [&_svg]:w-6" aria-hidden>
              <PackagePlus />
            </span>
            <div className="min-w-0">
              <p className="eyebrow">{needSkus > 0 ? t('hero.need') : t('hero.none')}</p>
              {planner.isLoading ? (
                <Skeleton className="mt-2 h-8 w-64" />
              ) : needSkus > 0 ? (
                <p className="tnum mt-1 font-display text-xl font-bold tracking-[-0.02em] text-ink sm:text-2xl">
                  {t('hero.skus', { n: needSkus })}
                  {money ? (
                    <>
                      <span className="mx-2 text-muted">·</span>
                      <span className="text-brand-ink">{t('hero.sum', { v: f.money(totals?.purchaseCost ?? 0) })}</span>
                    </>
                  ) : null}
                </p>
              ) : (
                <p className="mt-1 text-sm text-muted">{t('hero.noneHint')}</p>
              )}
              {(totals?.shipUnits ?? 0) > 0 ? (
                <p className="tnum mt-1.5 inline-flex items-center gap-1.5 text-sm font-medium text-info-ink">
                  <Truck className="h-4 w-4 shrink-0" />
                  {t('hero.ship', { units: f.num(totals?.shipUnits ?? 0), n: f.num(shipSkus) })}
                </p>
              ) : null}
              {critical > 0 ? (
                <div className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                  <AlertTriangle className="h-4 w-4 shrink-0 text-danger" />
                  <span className="font-semibold text-danger-ink">{t('alert.title', { n: critical })}</span>
                  <span className="text-ink-soft">{t('alert.body', { lead })}</span>
                  {filter !== 'critical' ? (
                    <button
                      type="button"
                      onClick={() => setFilter('critical')}
                      className="focusable inline-flex items-center gap-1 rounded-md font-semibold text-danger-ink underline-offset-2 hover:underline"
                    >
                      {t('alert.action')}
                      <ArrowRight className="h-3.5 w-3.5" />
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {selected.length > 0 ? (
              <>
                <Badge tone="brand">{t('sel.count', { n: selected.length })}</Badge>
                <Button variant="ghost" onClick={() => setSelected([])}>
                  {t('sel.clear')}
                </Button>
                <Button
                  icon={<Truck className="h-4 w-4" />}
                  disabled={!canEdit || draft.isPending}
                  loading={pendingSelection}
                  title={canEdit ? undefined : t('hero.viewer')}
                  onClick={() => draft.mutate({ skuIds: selected })}
                >
                  {t('sel.create')}
                </Button>
              </>
            ) : (
              <>
                <Button
                  icon={<Truck className="h-4 w-4" />}
                  disabled={!canEdit || shipSkus === 0 || draft.isPending}
                  loading={pendingScope === 'needed'}
                  title={draftTitle}
                  onClick={() => draft.mutate({ scope: 'needed' })}
                >
                  {t('hero.draftAll', { n: f.num(shipSkus) })}
                </Button>
                <Button
                  variant="outline"
                  disabled={!canEdit || urgentShipSkus === 0 || draft.isPending}
                  loading={pendingScope === 'urgent'}
                  title={draftTitle}
                  onClick={() => draft.mutate({ scope: 'urgent' })}
                >
                  {t('hero.draftUrgent', { n: f.num(urgentShipSkus) })}
                </Button>
              </>
            )}
            {canExport ? (
              <Button
                variant="outline"
                icon={<Download className="h-4 w-4" />}
                loading={exporting}
                disabled={needSkus === 0}
                title={t('hero.exportHint')}
                onClick={() => void onExport()}
              >
                {t('hero.export')}
              </Button>
            ) : null}
          </div>
        </div>
      </HeroCard>

      {/*
        KPI: butun katalog bo'yicha, qaysi yorliq ochiq bo'lishidan qat'i
        nazar. SKU soni va xarid summasi hero'da — bu yerda takrorlanmaydi.
      */}
      <StatGrid>
        <StatCard
          label={t('kpi.orderNow')}
          value={t('hero.skus', { n: f.num(totals?.orderNow ?? 0) })}
          hint={t('kpi.orderNowHint')}
          icon={<CalendarClock className="h-5 w-5" />}
          tone={(totals?.orderNow ?? 0) > 0 ? 'warn' : 'brand'}
          loading={planner.isLoading}
          onClick={(totals?.orderNow ?? 0) > 0 ? () => setFilter('ending') : undefined}
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
          tone="danger"
          loading={planner.isLoading}
        />
      </StatGrid>

      {/* ── Jadval: hisob parametrlari sarlavhada, holat yorliqlari va qidiruv — bevosita jadval ustida ── */}
      <Card>
        {/*
          Parametrlar — kompaniya sozlamasi (PlannerParams): hamma ko'radi,
          owner/manager o'zgartiradi. Ilgari ular faqat shu brauzerda saqlanardi.
        */}
        <CardHeader
          icon={<Sparkles />}
          title={t('table.title')}
          subtitle={t('table.subtitle')}
          actions={<PlannerParams />}
        />
        {/* Holat yorliqlari va qidiruv — bevosita jadval ustida */}
        <div className="mt-4 flex flex-col gap-3 border-y border-line bg-surface-2/40 px-5 py-3 md:flex-row md:items-center md:justify-between">
          <div className="no-scrollbar max-w-full overflow-x-auto">
            <Segmented options={filterOptions} value={filter} onChange={setFilter} size="sm" />
          </div>
          <SkuSearchInput value={search} onChange={setSearch} className="w-full md:w-72" />
        </div>
        <div className={cn(planner.isFetching && !planner.isLoading && 'opacity-70')}>
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
                  <span className="text-ink">{visibleTotals.qty > 0 ? f.num(visibleTotals.qty) : '—'}</span>
                  {visibleTotals.cost > 0 ? (
                    <p className="text-2xs font-normal text-muted">{f.money(visibleTotals.cost)}</p>
                  ) : null}
                  {visibleTotals.ship > 0 ? (
                    <p className="text-2xs font-semibold text-info-ink">{t('row.ship', { n: f.num(visibleTotals.ship) })}</p>
                  ) : null}
                </td>
              </>
            }
          />
        </div>
        {data ? (
          <p className="border-t border-line px-5 py-3 text-xs leading-relaxed text-muted">
            {t('note.method', { window: data.windowDays, safety: data.safetyDays })} {t('note.ship')}
          </p>
        ) : null}
      </Card>
    </div>
  );
}
