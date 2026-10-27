import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Boxes,
  Building2,
  Container,
  Download,
  ExternalLink,
  Lock,
  Store,
  Table2,
  Truck,
  Warehouse as WarehouseIcon,
  Wallet,
} from '@/components/icons';
import {
  FREE_TURNOVER_DAYS,
  TARIFF_EFFECTIVE_FROM,
  matchesSkuQuery,
  storageFeePerDay,
  storageRatePerLiterDay,
  turnoverDays,
  type StocksResponse,
} from '@savdoiq/shared';
import { MANUAL_STORAGE_URL, TIER_COUNT, paidRates, tierIndex, tierLabel, tierRate } from '@/components/calculator/tariff';
import {
  Amount,
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
  SkeletonRows,
  StatCard,
  StatGrid,
  toast,
  type Column,
} from '@/components/ui';
import { ZeroAware } from '@/components/ui/ZeroAware';
import { DonutChart, seriesColor } from '@/components/charts';
import { FilterBar } from '@/components/filters';
import { SkuSearchInput, useSkuQuery } from '@/components/products/SkuSearchInput';
import { DataFreshness } from '@/components/trust/DataFreshness';
import { api } from '@/lib/api';
import { cn, downloadBlob } from '@/lib/utils';
import { useCanFetch, useSeesMoney } from '@/lib/view';
import { useStores } from '@/store/session';
import { usePeriodQuery } from '@/store/ui';
import { registerNamespace, useFormat, useT } from '@/i18n';
import { NEUTRAL_TONE, STORAGE_TONE, SchemeShareCard, SkuNameCell } from '@/components/stock/common';
import { rowsOf, type SchemeTotal, type WarehouseResponse, type WarehouseRow } from '@/components/stock/types';

registerNamespace('warehouse', {
  uz: {
    title: 'Ombor',
    subtitle: 'O‘z omboringiz kesimi, FBO/FBS bilan taqqoslash va saqlash xarajati bahosi',
    'kpi.units': 'O‘z omborida dona',
    'kpi.unitsHint': 'Sizning omboringizdagi jami qoldiq',
    'kpi.value': 'Ombor qiymati',
    'kpi.valueHint': 'Tannarx bo‘yicha muzlagan kapital',
    'kpi.reserved': 'Band',
    'kpi.reservedHint': 'Buyurtmalarga ajratilgan dona',
    'kpi.inTransit': 'Yo‘lda',
    'kpi.inTransitHint': 'Yetkazmalarda ketayotgan dona',
    'stores.title': 'Do‘konlar bo‘yicha taqsimot',
    'stores.hint': 'Ombor qiymatining do‘konlar kesimi',
    'schemes.title': 'FBO / FBS / o‘z ombori',
    'schemes.hint': 'Qoldiqning saqlash sxemalari bo‘yicha taqsimoti',
    'scheme.fbo': 'FBO — Uzum ombori',
    'scheme.fbs': 'FBS — o‘z yetkazish',
    'scheme.own': 'O‘z ombori',
    'scheme.share': 'Umumiy qoldiqdagi ulush',
    'capacity.title': 'Hajm va Uzum omborida saqlash',
    'capacity.hint': 'Shu qoldiq Uzum omborida (FBO) tursa — Uzum aylanma bo‘yicha qancha olardi',
    'capacity.volume': 'Jami hajm',
    'capacity.volumeUnit': 'litr',
    'capacity.perDay': 'Uzum omborida — kuniga',
    'capacity.perMonth': 'Oyiga (30 kun)',
    'capacity.rate': 'Tarif',
    'capacity.free': 'Bepul',
    'capacity.freeWord': 'bepul',
    'capacity.rateFree': 'aylanma {tier} kun — bepul',
    'capacity.ratePaid': 'aylanma {tier} kun: {rate} so‘m/l/kun',
    'capacity.turnover': 'O‘rtacha aylanma: {n} kun',
    'capacity.noSales': 'Sotuv yo‘q — eng qimmat guruh',
    'capacity.split': 'Pullik: {paid} SKU · bepul (aylanma ≤ {free} kun): {freeSkus} SKU',
    'capacity.noVolumeSkus': 'Hajmi yo‘q {n} SKU hisobga kirmadi',
    'capacity.tiers':
      'Uzum tarifi, {date} dan: aylanma = qoldiq ÷ kunlik sotuv. {list} so‘m/l/kun; imtiyozli toifalarda (kiyim, poyabzal, aksessuar…) {reduced}. Hisob oddiy tarifda — imtiyozli toifada kamroq chiqadi.',
    'capacity.own': 'O‘z omboringizda Uzum saqlash to‘lovi olmaydi — bu baho tovarni FBO’ga yuborsangiz nima bo‘lishini ko‘rsatadi.',
    'capacity.manual': 'Uzum qo‘llanmasi: pullik saqlash tariflari',
    'capacity.noVolume': 'Hajm ma’lumoti yo‘q',
    'capacity.noVolumeHint': 'Mahsulot kartochkasida hajm (litr) to‘ldirilsa, saqlash xarajati hisoblanadi',
    'capacity.avgPerUnit': 'O‘rtacha hajm (1 dona)',
    'table.title': 'O‘z omboridagi qoldiqlar',
    'table.hint': 'SKU kesimida qoldiq, band, yo‘lda va qiymat',
    'col.product': 'Mahsulot',
    'col.store': 'Do‘kon',
    'col.own': 'Qoldiq',
    'col.reserved': 'Band',
    'col.inTransit': 'Yo‘lda',
    'col.available': 'Mavjud',
    'col.value': 'Qiymat',
    'col.volume': 'Hajm, l',
    'empty.title': 'O‘z omboringizda qoldiq yo‘q',
    'empty.hint': 'Yetkazma qabul qilinganidan so‘ng qoldiqlar shu yerda ko‘rinadi',
    'export.done': 'Excel fayl tayyor',
    'export.error': 'Eksport qilishda xatolik',
  },
  ru: {
    title: 'Склад',
    subtitle: 'Разрез своего склада, сравнение с FBO/FBS и оценка стоимости хранения',
    'kpi.units': 'Штук на своём складе',
    'kpi.unitsHint': 'Общий остаток на вашем складе',
    'kpi.value': 'Стоимость склада',
    'kpi.valueHint': 'Замороженный капитал по себестоимости',
    'kpi.reserved': 'Зарезервировано',
    'kpi.reservedHint': 'Штук, отложенных под заказы',
    'kpi.inTransit': 'В пути',
    'kpi.inTransitHint': 'Штук в текущих поставках',
    'stores.title': 'Распределение по магазинам',
    'stores.hint': 'Стоимость склада в разрезе магазинов',
    'schemes.title': 'FBO / FBS / свой склад',
    'schemes.hint': 'Распределение остатка по схемам хранения',
    'scheme.fbo': 'FBO — склад Uzum',
    'scheme.fbs': 'FBS — своя доставка',
    'scheme.own': 'Свой склад',
    'scheme.share': 'Доля в общем остатке',
    'capacity.title': 'Объём и хранение на складе Uzum',
    'capacity.hint': 'Если бы этот остаток лежал на складе Uzum (FBO) — сколько взял бы Uzum по оборачиваемости',
    'capacity.volume': 'Общий объём',
    'capacity.volumeUnit': 'л',
    'capacity.perDay': 'На складе Uzum — в день',
    'capacity.perMonth': 'В месяц (30 дн.)',
    'capacity.rate': 'Тариф',
    'capacity.free': 'Бесплатно',
    'capacity.freeWord': 'бесплатно',
    'capacity.rateFree': 'оборачиваемость {tier} дн. — бесплатно',
    'capacity.ratePaid': 'оборачиваемость {tier} дн.: {rate} сум/л/день',
    'capacity.turnover': 'Средняя оборачиваемость: {n} дн.',
    'capacity.noSales': 'Нет продаж — самая дорогая группа',
    'capacity.split': 'Платно: SKU — {paid} · бесплатно (оборачиваемость ≤ {free} дн.): SKU — {freeSkus}',
    'capacity.noVolumeSkus': 'Без объёма, не учтены: SKU — {n}',
    'capacity.tiers':
      'Тариф Uzum с {date}: оборачиваемость = остаток ÷ продажи в день. {list} сум/л/день; в льготных категориях (одежда, обувь, аксессуары…) {reduced}. Расчёт по обычному тарифу — в льготной категории выйдет меньше.',
    'capacity.own': 'За ваш собственный склад Uzum не берёт плату — оценка показывает, сколько стоило бы хранение этого товара на FBO.',
    'capacity.manual': 'Справка Uzum: тарифы платного хранения (на узбекском)',
    'capacity.noVolume': 'Нет данных об объёме',
    'capacity.noVolumeHint': 'Заполните объём (литры) в карточке товара — и мы посчитаем хранение',
    'capacity.avgPerUnit': 'Средний объём (1 шт)',
    'table.title': 'Остатки на своём складе',
    'table.hint': 'Остаток, резерв, товар в пути и стоимость по каждому SKU',
    'col.product': 'Товар',
    'col.store': 'Магазин',
    'col.own': 'Остаток',
    'col.reserved': 'Резерв',
    'col.inTransit': 'В пути',
    'col.available': 'Доступно',
    'col.value': 'Стоимость',
    'col.volume': 'Объём, л',
    'empty.title': 'На своём складе пусто',
    'empty.hint': 'Остатки появятся здесь после приёмки поставки',
    'export.done': 'Файл Excel готов',
    'export.error': 'Ошибка при экспорте',
  },
  en: {
    title: 'Warehouse',
    subtitle: 'Your own warehouse, compared with FBO/FBS, plus a storage cost estimate',
    'kpi.units': 'Units in own warehouse',
    'kpi.unitsHint': 'Total stock stored by you',
    'kpi.value': 'Warehouse value',
    'kpi.valueHint': 'Capital frozen at cost price',
    'kpi.reserved': 'Reserved',
    'kpi.reservedHint': 'Units allocated to orders',
    'kpi.inTransit': 'In transit',
    'kpi.inTransitHint': 'Units moving in shipments',
    'stores.title': 'Split by store',
    'stores.hint': 'Warehouse value per store',
    'schemes.title': 'FBO / FBS / own warehouse',
    'schemes.hint': 'How stock is distributed across storage schemes',
    'scheme.fbo': 'FBO — Uzum warehouse',
    'scheme.fbs': 'FBS — your delivery',
    'scheme.own': 'Own warehouse',
    'scheme.share': 'Share of total stock',
    'capacity.title': 'Volume and Uzum storage',
    'capacity.hint': 'If this stock sat in Uzum’s warehouse (FBO) — what Uzum would charge by turnover',
    'capacity.volume': 'Total volume',
    'capacity.volumeUnit': 'litres',
    'capacity.perDay': 'At Uzum — per day',
    'capacity.perMonth': 'Per month (30 days)',
    'capacity.rate': 'Rate',
    'capacity.free': 'Free',
    'capacity.freeWord': 'free',
    'capacity.rateFree': 'turnover {tier} days — free',
    'capacity.ratePaid': 'turnover {tier} days: {rate} UZS/l/day',
    'capacity.turnover': 'Average turnover: {n} days',
    'capacity.noSales': 'No sales — the most expensive group',
    'capacity.split': 'Paid: {paid} SKUs · free (turnover ≤ {free} days): {freeSkus} SKUs',
    'capacity.noVolumeSkus': '{n} SKUs without volume are not counted',
    'capacity.tiers':
      'Uzum tariff from {date}: turnover = stock ÷ daily sales. {list} UZS/l/day; reduced categories (clothing, shoes, accessories…) {reduced}. Calculated at the standard rate — reduced categories pay less.',
    'capacity.own': 'Uzum charges nothing for your own warehouse — this shows what keeping the stock in FBO would cost.',
    'capacity.manual': 'Uzum manual: paid storage tariffs (in Uzbek)',
    'capacity.noVolume': 'No volume data',
    'capacity.noVolumeHint': 'Fill in the volume (litres) on the product card to estimate storage',
    'capacity.avgPerUnit': 'Average volume (1 unit)',
    'table.title': 'Own warehouse stock',
    'table.hint': 'Stock, reserved, in transit and value per SKU',
    'col.product': 'Product',
    'col.store': 'Store',
    'col.own': 'Stock',
    'col.reserved': 'Reserved',
    'col.inTransit': 'In transit',
    'col.available': 'Available',
    'col.value': 'Value',
    'col.volume': 'Volume, l',
    'empty.title': 'Your warehouse is empty',
    'empty.hint': 'Stock shows up here once a shipment is accepted',
    'export.done': 'Excel file is ready',
    'export.error': 'Export failed',
  },
});

const PAGE_SIZE = 20;
const EMPTY_SCHEME: SchemeTotal = { units: 0, amount: 0 };
/** Server bir so'rovda shundan ko'p qatorni bermaydi (lib/period.ts) */
const SERVER_MAX_ROWS = 500;

/** Server qatorida o'rtacha kunlik sotuv ham keladi (routes/stocks.ts WarehouseStockRow) */
type Row = WarehouseRow & { avgDaily?: number };

export default function Warehouse() {
  const t = useT('warehouse');
  const tc = useT('common');
  const f = useFormat();
  const q = usePeriodQuery();
  const stores = useStores();
  // Do'kon nomi alohida ustun emas (~170 px) — faqat bir nechta do'kon aralash ko'rinsa, SKU yonida
  const multiStore = !q.storeId && stores.length > 1;

  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [exporting, setExporting] = useState(false);
  // Pulsiz ko'rinish shablonida (Omborchi) tannarx qiymati null — qiymat kartasi, ustuni va Excel yo'q
  const money = useSeesMoney();
  const canExport = useCanFetch('/export/warehouse');

  /*
   * Hamma qator bir so'rovda (sahifalash saytda). Ilgari `pageSize`
   * yuborilmasdi va server standart 50 qatorni berardi: 50 dan ortiq SKU'da
   * jadval va saqlash bahosi to'liq emas edi (2026-10-24).
   */
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['warehouse', q],
    queryFn: () => api.get<WarehouseResponse>('/stocks/warehouse', { ...q, page: 1, pageSize: SERVER_MAX_ROWS }),
  });

  const totals = data?.totals;
  const rows = useMemo(() => rowsOf<Row>(data?.rows), [data]);

  /** Sxemalar bo'yicha taqsimot javobda bo'lmasa — /stocks dan hisoblaymiz */
  const needSchemeFallback = Boolean(data) && !totals?.fbo && !totals?.fbs;

  const schemesQuery = useQuery({
    queryKey: ['warehouse-schemes', q],
    queryFn: () => api.get<StocksResponse>('/stocks', { ...q, page: 1, pageSize: 500 }),
    enabled: needSchemeFallback,
  });

  const schemes = useMemo(() => {
    if (totals?.fbo || totals?.fbs || totals?.own) {
      return {
        fbo: totals.fbo ?? EMPTY_SCHEME,
        fbs: totals.fbs ?? EMPTY_SCHEME,
        own: totals.own ?? EMPTY_SCHEME,
      };
    }
    const stockRows = schemesQuery.data?.rows.items ?? [];
    const acc = { fbo: { ...EMPTY_SCHEME }, fbs: { ...EMPTY_SCHEME }, own: { ...EMPTY_SCHEME } };
    stockRows.forEach((r) => {
      const unitCost = r.total > 0 ? (r.costValue ?? 0) / r.total : 0;
      acc.fbo.units += r.fbo;
      acc.fbo.amount += r.fbo * unitCost;
      acc.fbs.units += r.fbs;
      acc.fbs.amount += r.fbs * unitCost;
      acc.own.units += r.own;
      acc.own.amount += r.own * unitCost;
    });
    if (acc.own.units === 0 && rows.length > 0) {
      acc.own.units = rows.reduce((s, r) => s + (r.own ?? 0), 0);
      acc.own.amount = rows.reduce((s, r) => s + (r.costValue ?? 0), 0);
    }
    return acc;
  }, [totals, schemesQuery.data, rows]);

  const schemeUnits = schemes.fbo.units + schemes.fbs.units + schemes.own.units;
  const share = (v: number) => (schemeUnits > 0 ? (v / schemeUnits) * 100 : 0);

  const kpi = useMemo(() => {
    const units = totals?.units ?? rows.reduce((s, r) => s + (r.own ?? 0), 0);
    const costValue = totals?.costValue ?? rows.reduce((s, r) => s + (r.costValue ?? 0), 0);
    const reserved = totals?.reserved ?? rows.reduce((s, r) => s + (r.reserved ?? 0), 0);
    const inTransit = totals?.inTransit ?? rows.reduce((s, r) => s + (r.inTransit ?? 0), 0);
    const volumeL = totals?.volumeL ?? rows.reduce((s, r) => s + (r.volumeL ?? 0), 0);
    return { units, costValue, reserved, inTransit, volumeL };
  }, [totals, rows]);

  /*
   * Saqlash bahosi — Uzum tarifi (shared tariffs.ts, 01.06.2026 dan). O'z
   * omboridagi tovarga Uzum to'lov olmaydi: bu — shu qoldiq FBO'da tursa
   * qancha bo'lishi. Aylanma har SKU uchun: qoldiq ÷ o'rtacha kunlik sotuv
   * (server 30 kunlik o'rtachani beradi), 60 kungacha bepul, keyin hajm ×
   * stavka. Toifa javobda yo'q — oddiy tarif olinadi, sahifa buni aytadi.
   * Ilgari jami hajm × 120 so'm edi: o'lchanmagan, ~10 baravar katta stavka
   * va bepul davrsiz (2026-10-24).
   */
  const storage = useMemo(() => {
    let perDay = 0;
    let paid = 0;
    let free = 0;
    let noVolume = 0;
    let units = 0;
    let daily = 0;
    for (const r of rows) {
      const own = r.own ?? 0;
      if (own <= 0) continue;
      const avg = r.avgDaily ?? 0;
      units += own;
      daily += avg;
      const turnover = turnoverDays(own, avg);
      if (storageRatePerLiterDay(turnover) === 0) {
        free += 1;
        continue;
      }
      // Server dona × hajmni beradi — bir donaning hajmi shundan
      const perUnitL = (r.volumeL ?? 0) / own;
      if (!(perUnitL > 0)) {
        noVolume += 1;
        continue;
      }
      paid += 1;
      perDay += storageFeePerDay({ units: own, volumeL: perUnitL, turnover });
    }
    return { perDay, perMonth: perDay * 30, paid, free, noVolume, turnover: turnoverDays(units, daily) };
  }, [rows]);
  const overallTier = tierIndex(storage.turnover);
  const tierList = Array.from({ length: TIER_COUNT }, (_, i) => {
    const rate = tierRate(i, 'standard');
    return `${tierLabel(i)} — ${rate > 0 ? f.num(rate) : t('capacity.freeWord')}`;
  }).join(' · ');

  const byStore = useMemo(() => {
    if (totals?.byStore?.length) {
      return totals.byStore.map((s, i) => ({
        name: s.title,
        value: s.costValue ?? s.amount ?? 0,
        color: seriesColor(i),
      }));
    }
    const map = new Map<string, number>();
    rows.forEach((r) => {
      const key = r.storeTitle ?? tc('common.store');
      map.set(key, (map.get(key) ?? 0) + (r.costValue ?? 0));
    });
    return [...map.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([name, value], i) => ({ name, value, color: seriesColor(i) }));
  }, [totals, rows, tc]);

  /*
   * Qidiruv shu yerda (yuklangan qatorlar ichida), lekin serverdagi BILAN BIR
   * XIL qoida (shared search.ts): nom, SKU kodi, shtrix-kod, Uzum SKU /
   * mahsulot ID'si yoki uzum.uz havolasi — qator kalitlari serverdan keladi.
   * Ilgari faqat nom va SKU kodi `toLowerCase().includes` bilan edi
   * (2026-10-24). KPI, sxemalar va saqlash bahosi avvalgidek butun ombor
   * bo'yicha — qidiruv faqat jadvalni (va uning jami qatorini) toraytiradi.
   */
  const query = useSkuQuery(search);
  const filtered = useMemo(() => {
    if (!query) return rows;
    return rows.filter((r) =>
      matchesSkuQuery(
        query,
        { id: r.skuId, sku: r.sku, title: r.title, barcode: r.barcode, uzumSkuId: r.uzumSkuId },
        { id: r.productId, uzumProductId: r.uzumProductId },
      ),
    );
  }, [rows, query]);

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pages);
  const pageRows = useMemo(
    () => filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE),
    [filtered, safePage],
  );

  async function handleExport() {
    setExporting(true);
    try {
      const blob = await api.blob('/export/warehouse', q);
      downloadBlob(blob, `warehouse-${q.from}-${q.to}.xlsx`);
      toast.success(t('export.done'));
    } catch {
      toast.error(t('export.error'));
    } finally {
      setExporting(false);
    }
  }

  /*
   * Do'kon ustuni SKU ostiga tushdi — ilgari u 1366 px'da "Qiymat" ustunini
   * gorizontal aylantirish ortiga surib yuborardi.
   */
  const columns: Column<WarehouseRow>[] = [
    {
      key: 'product',
      header: t('col.product'),
      sortable: true,
      sortValue: (r) => r.title,
      render: (r) => (
        <SkuNameCell
          className="md:min-w-[13rem] md:max-w-[20rem] 2xl:max-w-[28rem]"
          title={r.title}
          subtitle={multiStore && r.storeTitle ? `${r.sku} · ${r.storeTitle}` : r.sku}
          imageUrl={r.imageUrl}
        />
      ),
    },
    {
      key: 'own',
      header: t('col.own'),
      align: 'right',
      sortable: true,
      sortValue: (r) => r.own ?? 0,
      render: (r) => <span className="font-semibold text-ink">{f.num(r.own ?? 0)}</span>,
    },
    {
      key: 'reserved',
      header: t('col.reserved'),
      align: 'right',
      sortable: true,
      sortValue: (r) => r.reserved ?? 0,
      render: (r) => <ZeroAware value={r.reserved ?? 0} tone="text-warn-ink" text={f.num(r.reserved ?? 0)} />,
    },
    {
      key: 'inTransit',
      header: t('col.inTransit'),
      align: 'right',
      hideOnMobile: true,
      sortable: true,
      sortValue: (r) => r.inTransit ?? 0,
      render: (r) => <ZeroAware value={r.inTransit ?? 0} tone="text-info-ink" text={f.num(r.inTransit ?? 0)} />,
    },
    {
      key: 'available',
      header: t('col.available'),
      align: 'right',
      hideOnMobile: true,
      sortable: true,
      sortValue: (r) => (r.own ?? 0) - (r.reserved ?? 0),
      render: (r) => f.num(Math.max(0, (r.own ?? 0) - (r.reserved ?? 0))),
    },
    {
      key: 'volume',
      header: t('col.volume'),
      align: 'right',
      hideOnMobile: true,
      sortable: true,
      sortValue: (r) => r.volumeL ?? 0,
      render: (r) => (r.volumeL ? f.num(r.volumeL, 1) : <span className="text-muted">—</span>),
    },
    {
      key: 'value',
      header: t('col.value'),
      align: 'right',
      sortable: true,
      sortValue: (r) => r.costValue ?? 0,
      render: (r) => f.money(r.costValue ?? 0),
    },
  ];

  return (
    <>
      <PageHeader
        icon={<WarehouseIcon className="h-5 w-5" />}
        tone="info"
        title={t('title')}
        description={t('subtitle')}
        badge={<PreviewBadge feature="warehouse" />}
        meta={<DataFreshness />}
        actions={
          canExport ? (
            <Button variant="outline" icon={<Download className="h-4 w-4" />} loading={exporting} onClick={handleExport}>
              {tc('btn.export')}
            </Button>
          ) : undefined
        }
      />

      <FilterBar />

      <PlanGate feature="warehouse">
        <div className="space-y-5">
          {/*
            Qoldiq va yo'ldagi tovar — ombor/logistika rangi (ko'k), band —
            sariq (mavjud qoldiqdan ayriladi), qiymat — neytral. Ilgari qiymat
            binafsha edi — u faqat Uzum ulushi uchun.
          */}
          <StatGrid>
            <StatCard
              label={t('kpi.units')}
              value={isLoading ? '—' : f.num(kpi.units)}
              hint={t('kpi.unitsHint')}
              icon={<Boxes className="h-5 w-5" />}
              tone="info"
              loading={isLoading}
            />
            {money ? (
              <StatCard
                label={t('kpi.value')}
                value={isLoading ? '—' : f.money(kpi.costValue)}
                hint={t('kpi.valueHint')}
                icon={<Wallet className="h-5 w-5" />}
                className={NEUTRAL_TONE}
                loading={isLoading}
              />
            ) : null}
            <StatCard
              label={t('kpi.reserved')}
              value={isLoading ? '—' : f.num(kpi.reserved)}
              hint={t('kpi.reservedHint')}
              icon={<Lock className="h-5 w-5" />}
              tone="warn"
              loading={isLoading}
            />
            <StatCard
              label={t('kpi.inTransit')}
              value={isLoading ? '—' : f.num(kpi.inTransit)}
              hint={t('kpi.inTransitHint')}
              icon={<Truck className="h-5 w-5" />}
              tone="info"
              loading={isLoading}
            />
          </StatGrid>

          {isError ? (
            <Card>
              <ErrorState
                message={error instanceof Error ? error.message : undefined}
                onRetry={() => void refetch()}
                retryLabel={tc('btn.retry')}
              />
            </Card>
          ) : (
            <>
              <div>
                <div className="mb-3">
                  <h2 className="section-title">{t('schemes.title')}</h2>
                  <p className="mt-0.5 text-sm text-muted">{t('schemes.hint')}</p>
                </div>
                {/*
                  Uchala sxema ham bir ma'no — qoldiq — shuning uchun bir rangda
                  (ko'k); farqni ikonka va nom beradi. Ilgari FBO yashil (foyda
                  rangi), o'z ombori binafsha (Uzum ulushi rangi) edi.
                */}
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  <SchemeShareCard
                    icon={<Building2 />}
                    title={t('scheme.fbo')}
                    hint={t('scheme.share')}
                    units={Math.round(schemes.fbo.units)}
                    amount={money ? Math.round(schemes.fbo.amount) : null}
                    share={share(schemes.fbo.units)}
                    tone="info"
                  />
                  <SchemeShareCard
                    icon={<Truck />}
                    title={t('scheme.fbs')}
                    hint={t('scheme.share')}
                    units={Math.round(schemes.fbs.units)}
                    amount={money ? Math.round(schemes.fbs.amount) : null}
                    share={share(schemes.fbs.units)}
                    tone="info"
                  />
                  <SchemeShareCard
                    icon={<WarehouseIcon />}
                    title={t('scheme.own')}
                    hint={t('scheme.share')}
                    units={Math.round(schemes.own.units)}
                    amount={money ? Math.round(schemes.own.amount) : null}
                    share={share(schemes.own.units)}
                    tone="info"
                  />
                </div>
              </div>

              <div className={cn('grid gap-4', money && 'xl:grid-cols-2')}>
                {/* Do'konlar kesimi tannarx qiymati bo'yicha — pulsiz shablonda yo'q */}
                {money ? (
                <Card>
                  <CardHeader icon={<Store />} tone="muted" title={t('stores.title')} subtitle={t('stores.hint')} />
                  <CardBody>
                    {isLoading ? (
                      <SkeletonRows rows={5} />
                    ) : byStore.length === 0 ? (
                      <EmptyState icon={<Building2 className="h-6 w-6" />} title={tc('common.noData')} />
                    ) : (
                      <DonutChart
                        data={byStore}
                        height={260}
                        center={
                          <div>
                            <p className="text-xs text-muted">{tc('common.total')}</p>
                            <p className="tnum font-display text-xl font-extrabold text-ink">
                              {f.compact(byStore.reduce((s, d) => s + d.value, 0))}
                            </p>
                          </div>
                        }
                      />
                    )}
                  </CardBody>
                </Card>
                ) : null}

                {/* Saqlash xarajati — xarajat xaritasidagi pushti rangda (COST_COLORS.storage) */}
                <Card accent className={STORAGE_TONE}>
                  <CardHeader title={t('capacity.title')} subtitle={t('capacity.hint')} icon={<Container />} />
                  <CardBody>
                    {isLoading ? (
                      <SkeletonRows rows={5} />
                    ) : kpi.volumeL <= 0 ? (
                      <EmptyState
                        icon={<Container className="h-6 w-6" />}
                        title={t('capacity.noVolume')}
                        hint={t('capacity.noVolumeHint')}
                      />
                    ) : (
                      <div className="space-y-3">
                        {/*
                          Ilgari hajm shu blokda ikki marta yozilardi (katta raqam va
                          ostida binafsha "1 081,2 l") — ikkinchisi olib tashlandi.
                          Sig'im chegarasi Uzumda yo'q, shuning uchun foiz emas, hajm.
                        */}
                        <div className="well flex flex-wrap items-end justify-between gap-3 p-4">
                          <div>
                            <p className="eyebrow">{t('capacity.volume')}</p>
                            <p className="tnum mt-1 font-display text-3xl font-bold tracking-[-0.02em] text-ink">
                              {f.num(kpi.volumeL, 1)}{' '}
                              <span className="text-base font-semibold text-muted">{t('capacity.volumeUnit')}</span>
                            </p>
                          </div>
                          <p className="tnum text-xs text-muted">
                            {t('capacity.avgPerUnit')}:{' '}
                            <span className="font-semibold text-ink-soft">
                              {f.num(kpi.units > 0 ? kpi.volumeL / kpi.units : 0, 2)} {t('capacity.volumeUnit')}
                            </span>
                          </p>
                        </div>

                        {/* Amount: "so'm" kichik — tor plitkada summa ikki qatorga bo'linmasin */}
                        <div className="grid gap-3 sm:grid-cols-3">
                          <div className="well p-3.5">
                            <p className="line-clamp-2 min-h-[2rem] eyebrow">{t('capacity.perDay')}</p>
                            <p className="tnum mt-1 truncate font-display text-lg font-bold tracking-[-0.01em] text-ink">
                              {storage.perDay > 0 ? <Amount value={f.money(storage.perDay)} /> : t('capacity.free')}
                            </p>
                          </div>
                          <div className="well p-3.5">
                            <p className="line-clamp-2 min-h-[2rem] eyebrow">{t('capacity.perMonth')}</p>
                            <p className="tnum mt-1 truncate font-display text-lg font-bold tracking-[-0.01em] text-ink">
                              {storage.perMonth > 0 ? <Amount value={f.money(storage.perMonth)} /> : t('capacity.free')}
                            </p>
                          </div>
                          {/*
                            Ilgari bu plitkada "1 litr / kun — 120 so'm" turardi. Endi
                            stavka aylanmaga bog'liq: umumiy aylanma qaysi guruhga
                            tushgani va shu guruh stavkasi.
                          */}
                          <div className="well p-3.5">
                            <p className="line-clamp-2 min-h-[2rem] eyebrow">{t('capacity.rate')}</p>
                            <p className="tnum mt-1 text-sm font-semibold leading-snug text-ink">
                              {overallTier === 0
                                ? t('capacity.rateFree', { tier: tierLabel(0) })
                                : t('capacity.ratePaid', { tier: tierLabel(overallTier), rate: f.num(tierRate(overallTier, 'standard')) })}
                            </p>
                            <p className="tnum mt-1 text-2xs text-muted">
                              {Number.isFinite(storage.turnover)
                                ? t('capacity.turnover', { n: f.num(storage.turnover) })
                                : t('capacity.noSales')}
                            </p>
                          </div>
                        </div>

                        <div className="space-y-1.5 text-xs leading-relaxed text-muted">
                          <p className="tnum text-ink-soft">
                            {t('capacity.split', { paid: storage.paid, free: FREE_TURNOVER_DAYS, freeSkus: storage.free })}
                            {storage.noVolume > 0 ? ` · ${t('capacity.noVolumeSkus', { n: storage.noVolume })}` : ''}
                          </p>
                          <p className="tnum">
                            {t('capacity.tiers', {
                              date: f.date(TARIFF_EFFECTIVE_FROM),
                              list: tierList,
                              reduced: paidRates('reduced'),
                            })}
                          </p>
                          <p>{t('capacity.own')}</p>
                          <a
                            className="inline-flex items-center gap-1.5 font-semibold text-brand-ink hover:underline"
                            href={MANUAL_STORAGE_URL}
                            target="_blank"
                            rel="noreferrer noopener"
                          >
                            {t('capacity.manual')}
                            <ExternalLink className="h-3.5 w-3.5" />
                          </a>
                        </div>
                      </div>
                    )}
                  </CardBody>
                </Card>
              </div>

              <Card>
                <CardHeader
                  icon={<Table2 />}
                  tone="info"
                  title={t('table.title')}
                  subtitle={t('table.hint')}
                  actions={
                    <SkuSearchInput
                      value={search}
                      onChange={(v) => {
                        setSearch(v);
                        setPage(1);
                      }}
                      className="w-full sm:w-72"
                    />
                  }
                />
                <div className="mt-3">
                  <DataTable<WarehouseRow>
                    columns={money ? columns : columns.filter((c) => c.key !== 'value')}
                    rows={pageRows}
                    rowKey={(r) => r.skuId}
                    loading={isLoading}
                    stickyFirstColumn
                    empty={
                      <EmptyState
                        icon={<WarehouseIcon className="h-6 w-6" />}
                        title={t('empty.title')}
                        hint={t('empty.hint')}
                      />
                    }
                    pagination={{
                      page: safePage,
                      pages,
                      total: filtered.length,
                      pageSize: PAGE_SIZE,
                      onPage: setPage,
                    }}
                    footer={
                      <>
                        {/* Telefonda (jami qatori alohida tor jadval) chekinish kichikroq — gorizontal surilmasin */}
                        <td className="px-3 py-3 text-sm md:px-5">{tc('common.total')}</td>
                        <td className="tnum px-3 py-3 text-right md:px-5">
                          {f.num(filtered.reduce((s, r) => s + (r.own ?? 0), 0))}
                        </td>
                        <td className="tnum px-3 py-3 text-right md:px-5">
                          {f.num(filtered.reduce((s, r) => s + (r.reserved ?? 0), 0))}
                        </td>
                        <td className="tnum hidden px-5 py-3 text-right md:table-cell">
                          {f.num(filtered.reduce((s, r) => s + (r.inTransit ?? 0), 0))}
                        </td>
                        <td className="hidden px-5 py-3 md:table-cell" />
                        <td className="tnum hidden whitespace-nowrap px-5 py-3 text-right md:table-cell">
                          {f.num(filtered.reduce((s, r) => s + (r.volumeL ?? 0), 0), 1)}
                        </td>
                        {money ? (
                          <td className="tnum px-3 py-3 text-right md:whitespace-nowrap md:px-5">
                            {f.money(filtered.reduce((s, r) => s + (r.costValue ?? 0), 0))}
                          </td>
                        ) : null}
                      </>
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
