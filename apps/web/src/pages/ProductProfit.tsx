import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  ArrowRight,
  ChevronDown,
  Download,
  EyeOff,
  HandCoins,
  Info,
  LayoutGrid,
  RotateCcw,
  Rows3,
  ShoppingBag,
  Tag,
} from '@/components/icons';
import {
  matchesProductQuery,
  pct,
  round,
  type ProductProfitFlag,
  type ProductProfitMoney,
  type ProductProfitResponse,
  type ProductProfitRow,
} from '@savdoiq/shared';
import {
  Amount,
  Badge,
  Button,
  Card,
  DataTable,
  Drawer,
  EmptyState,
  ErrorState,
  HeroCard,
  PageHeader,
  PlanGate,
  PreviewBadge,
  ProductCell,
  ProductThumb,
  Segmented,
  Skeleton,
  toast,
  type Column,
} from '@/components/ui';
import { SkuSearchInput, useSkuQuery } from '@/components/products/SkuSearchInput';
import { FilterBar } from '@/components/filters';
import { PeriodChip } from '@/components/finance/PeriodChip';
import { useBuyout } from '@/components/products/Buyout';
import { ProfitAttention } from '@/components/products/ProfitAttention';
import { ProfitVariants, hasVariants, marginTone } from '@/components/products/ProfitVariants';
import { CostCoverage } from '@/components/trust/CostCoverage';
import { DataFreshness } from '@/components/trust/DataFreshness';
import { SplitStrip } from '@/components/unit/CostSplitBar';
import { useCountUp } from '@/hooks/useCountUp';
import { api } from '@/lib/api';
import { COST_COLORS } from '@/lib/theme';
import { useFeature } from '@/store/session';
import { usePeriodQuery } from '@/store/ui';
import { registerNamespace, useFormat, useT, type TFunc } from '@/i18n';
import { cn, downloadBlob } from '@/lib/utils';

registerNamespace('productProfit', {
  uz: {
    title: 'Mahsulot foydasi',
    subtitle: 'Har bir mahsulot qancha pul qoldirdi — bir donadan va jami',
    'sort.profit': 'Sof foyda',
    'sort.perUnit': '1 donadan',
    'sort.revenue': 'Tushum',
    'sort.margin': 'Marja',
    'view.table': 'Jadval',
    'view.cards': 'Kartalar',
    'kpi.revenue': 'Tushum',
    'kpi.revenueHint': '{units} dona, {orders} buyurtma',
    'kpi.payout': 'Chiqarishga',
    'kpi.payoutHint': 'Uzum komissiya va yetkazishni ushlab, sizga to‘laydigani',
    'kpi.cogs': 'Tannarx',
    'kpi.cogsHint': 'Sotilgan tovarlarning sotib olish narxi',
    'kpi.profit': 'Sof foyda',
    'kpi.profitHint': 'Tannarx, soliq va reklamadan keyin · marja {m}',
    'hero.title': 'Mahsulotlar sof foydasi',
    'hero.loss': 'Mahsulotlar zarari',
    'hero.sub': 'Tannarx, soliq va reklamadan keyin',
    'hero.margin': 'Marja {v}',
    'hero.roi': 'ROI {v}',
    'hero.perUnit': '1 donadan {v}',
    'hero.split': 'Tushum qayerga ketdi',
    'hero.store': 'Do‘kon sof foydasi',
    'hero.storeHint': 'Mahsulotga bog‘lanmagan xarajatlar −{v} ayirilgan',
    'hero.units': 'Sotildi',
    'hero.unitsHint': '{orders} buyurtma · {products} mahsulot',
    'recon.text':
      'Mahsulotlar sof foydasi {products}. Mahsulotga bog‘lab bo‘lmaydigan xarajatlar (omborga logistika, umumiy reklama, saqlash) {other} ayirilsa — do‘kon sof foydasi {store}, Boshqaruv panelidagi bilan bir xil.',
    'card.meta': '{units} dona · {orders} buyurtma',
    'card.skus': '{n} SKU',
    'card.hidden': 'Katalogdan yashirilgan',
    'card.net': 'Sof foyda',
    'card.perUnit': '1 donadan {v}',
    'card.loss': 'Zarar',
    'card.margin': 'Marja {v}',
    'card.roi': 'ROI {v}',
    'card.colUnit': '1 dona',
    'card.colTotal': 'Jami',
    'row.revenue': 'Tushum',
    'row.commission': 'Komissiya',
    'row.logistics': 'Yetkazish',
    'row.payout': 'Chiqarishga',
    'row.payoutHint': 'Uzum sizga to‘laydi',
    'row.cogs': 'Tannarx',
    'row.otherCost': 'Qadoq va boshqa',
    'row.tax': 'Soliq',
    'row.ads': 'Reklama',
    'row.netProfit': 'Sof foyda',
    'card.noCost': 'Tannarx kiritilmagan — foyda haqiqiydan katta ko‘rinadi',
    'card.setCost': 'Tannarx kiritish',
    'card.more': 'Batafsil',
    'card.returns': '{n} ta qaytgan',
    'tag.noCost': 'Tannarxsiz',
    'tag.returnsTitle': 'Qaytish ulushi {v} — do‘kon o‘rtachasi {avg}',
    'col.product': 'Mahsulot',
    'col.units': 'Sotildi',
    'col.orders': '{n} buyurtma',
    'col.revenue': 'Tushum',
    'col.split': 'Tushum taqsimoti',
    'col.profit': 'Sof foyda',
    'col.margin': 'Marja',
    'col.roi': 'ROI',
    'total.label': 'Jami · {n} mahsulot',
    'empty.title': 'Bu davrda sotuv yo‘q',
    'empty.hint': 'Yuqoridagi davrni kengroq tanlang — masalan «Shu yil».',
    'empty.search': 'Qidiruv bo‘yicha mahsulot topilmadi',
    'note.money': 'Summalar so‘mda. Bekor qilingan va qaytarilgan sotuvlar kirmaydi.',
    'note.table': 'Qatorni bosing — tushumdan sof foydagacha to‘liq hisob ochiladi.',
    'note.expand': 'Nom chapidagi strelka SKU variantlarini ochadi.',
    'tab.all': 'Hammasi',
    'tab.loss': 'Zararda',
    'tab.lowMargin': 'Past marja',
    'tab.noCost': 'Tannarxsiz',
    'tab.lowBuyout': 'Past xarid',
    'tabHint.loss': 'Sof foyda manfiy — tannarx, soliq va reklamadan keyin zarar qoldi.',
    'tabHint.lowMargin': 'Zarar yo‘q, lekin marja {v} dan past.',
    'tabHint.noCost': 'Sotilgan variantlardan kamida birining tannarxi kiritilmagan — foyda haqiqiydan katta ko‘rinadi.',
    'tabHint.lowBuyout':
      'Xarid foizi do‘kon o‘rtachasidan ({avg}) kamida {gap} p.p. past — kamida {min} ta yakunlangan dona bilan.',
    'empty.tab': 'Bu bo‘limda mahsulot yo‘q',
    'empty.tabHint': 'Yaxshi belgi. Boshqa bo‘limni tanlang yoki «Hammasi» ga qayting.',
    'variants.show': 'Variantlar ({n})',
    'variants.hide': 'Variantlarni yig‘ish',
    'total.labelOf': 'Jami · {n} / {all} mahsulot',
    'total.perUnit': '1 donadan {v}',
    'card.buyout': 'xarid {v}',
    'tag.lowBuyout': 'Past xarid {v}',
    'tag.lowBuyoutTitle': 'Xarid foizi {v} — do‘kon o‘rtachasi {avg}',
    'export.done': 'Excel fayl tayyor',
    'export.error': 'Eksport qilib bo‘lmadi',
    'export.locked': 'Excel eksporti tarifingizda yopiq',
  },
  ru: {
    title: 'Прибыль по товарам',
    subtitle: 'Сколько денег оставил каждый товар — с одной штуки и всего',
    'sort.profit': 'Чистая прибыль',
    'sort.perUnit': 'С 1 шт.',
    'sort.revenue': 'Выручка',
    'sort.margin': 'Маржа',
    'view.table': 'Таблица',
    'view.cards': 'Карточки',
    'kpi.revenue': 'Выручка',
    // "заказов: N" ko'rinishi — ilgari "1 заказов", "21 заказов" chiqardi (ruscha son kelishigi)
    'kpi.revenueHint': '{units} шт., заказов: {orders}',
    'kpi.payout': 'К выводу',
    'kpi.payoutHint': 'Что Uzum платит вам после комиссии и доставки',
    'kpi.cogs': 'Себестоимость',
    'kpi.cogsHint': 'Закупочная цена проданных товаров',
    'kpi.profit': 'Чистая прибыль',
    'kpi.profitHint': 'После себестоимости, налога и рекламы · маржа {m}',
    'hero.title': 'Чистая прибыль товаров',
    'hero.loss': 'Убыток по товарам',
    'hero.sub': 'После себестоимости, налога и рекламы',
    'hero.margin': 'Маржа {v}',
    'hero.roi': 'ROI {v}',
    'hero.perUnit': 'С 1 шт. {v}',
    'hero.split': 'Куда ушла выручка',
    'hero.store': 'Чистая прибыль магазина',
    'hero.storeHint': 'За вычетом расходов, не привязанных к товару: −{v}',
    'hero.units': 'Продано',
    'hero.unitsHint': 'заказов: {orders} · товаров: {products}',
    'recon.text':
      'Чистая прибыль товаров {products}. За вычетом расходов, не привязанных к товару (логистика на склад, общая реклама, хранение) {other}, прибыль магазина — {store}, как на главной панели.',
    'card.meta': '{units} шт. · заказов: {orders}',
    'card.skus': '{n} SKU',
    'card.hidden': 'Скрыт из каталога',
    'card.net': 'Чистая прибыль',
    'card.perUnit': 'С 1 шт. {v}',
    'card.loss': 'Убыток',
    'card.margin': 'Маржа {v}',
    'card.roi': 'ROI {v}',
    'card.colUnit': '1 шт.',
    'card.colTotal': 'Всего',
    'row.revenue': 'Выручка',
    'row.commission': 'Комиссия',
    'row.logistics': 'Доставка',
    'row.payout': 'К выводу',
    'row.payoutHint': 'Uzum платит вам',
    'row.cogs': 'Себестоимость',
    'row.otherCost': 'Упаковка и пр.',
    'row.tax': 'Налог',
    'row.ads': 'Реклама',
    'row.netProfit': 'Чистая прибыль',
    'card.noCost': 'Себестоимость не указана — прибыль выглядит больше реальной',
    'card.setCost': 'Указать себестоимость',
    'card.more': 'Подробнее',
    'card.returns': 'Возвратов: {n}',
    'tag.noCost': 'Без себестоимости',
    'tag.returnsTitle': 'Доля возвратов {v} — в среднем по магазину {avg}',
    'col.product': 'Товар',
    'col.units': 'Продано',
    'col.orders': 'заказов: {n}',
    'col.revenue': 'Выручка',
    'col.split': 'Структура выручки',
    'col.profit': 'Чистая прибыль',
    'col.margin': 'Маржа',
    'col.roi': 'ROI',
    'total.label': 'Итого · товаров: {n}',
    'empty.title': 'За этот период продаж нет',
    'empty.hint': 'Выберите период шире — например «Этот год».',
    'empty.search': 'По запросу товары не найдены',
    'note.money': 'Суммы в сумах. Отменённые и возвращённые продажи не учитываются.',
    'note.table': 'Нажмите на строку — откроется полный расчёт от выручки до чистой прибыли.',
    'note.expand': 'Стрелка слева от названия раскрывает варианты SKU.',
    'tab.all': 'Все',
    'tab.loss': 'В убытке',
    'tab.lowMargin': 'Низкая маржа',
    'tab.noCost': 'Без себестоимости',
    'tab.lowBuyout': 'Низкий выкуп',
    'tabHint.loss': 'Чистая прибыль отрицательная — убыток после себестоимости, налога и рекламы.',
    'tabHint.lowMargin': 'Убытка нет, но маржа ниже {v}.',
    'tabHint.noCost':
      'Хотя бы у одного проданного варианта не указана себестоимость — прибыль выглядит больше реальной.',
    'tabHint.lowBuyout':
      'Выкуп ниже среднего по магазину ({avg}) минимум на {gap} п.п. — если завершённых штук не меньше {min}.',
    'empty.tab': 'В этой вкладке товаров нет',
    'empty.tabHint': 'Хороший знак. Выберите другую вкладку или вернитесь во «Все».',
    'variants.show': 'Варианты ({n})',
    'variants.hide': 'Свернуть варианты',
    'total.labelOf': 'Итого · товаров: {n} из {all}',
    'total.perUnit': 'С 1 шт. {v}',
    'card.buyout': 'выкуп {v}',
    'tag.lowBuyout': 'Низкий выкуп {v}',
    'tag.lowBuyoutTitle': 'Выкуп {v} — в среднем по магазину {avg}',
    'export.done': 'Excel-файл готов',
    'export.error': 'Не удалось выгрузить',
    'export.locked': 'Выгрузка в Excel недоступна на вашем тарифе',
  },
  en: {
    title: 'Profit by product',
    subtitle: 'How much money each product left you — per unit and in total',
    'sort.profit': 'Net profit',
    'sort.perUnit': 'Per unit',
    'sort.revenue': 'Revenue',
    'sort.margin': 'Margin',
    'view.table': 'Table',
    'view.cards': 'Cards',
    'kpi.revenue': 'Revenue',
    'kpi.revenueHint': '{units} units, {orders} orders',
    'kpi.payout': 'To withdraw',
    'kpi.payoutHint': 'What Uzum pays you after commission and delivery',
    'kpi.cogs': 'Cost of goods',
    'kpi.cogsHint': 'Purchase price of the goods sold',
    'kpi.profit': 'Net profit',
    'kpi.profitHint': 'After cost, tax and ads · margin {m}',
    'hero.title': 'Net profit of products',
    'hero.loss': 'Loss on products',
    'hero.sub': 'After cost of goods, tax and ads',
    'hero.margin': 'Margin {v}',
    'hero.roi': 'ROI {v}',
    'hero.perUnit': '{v} per unit',
    'hero.split': 'Where revenue went',
    'hero.store': 'Store net profit',
    'hero.storeHint': 'Less costs not tied to a product: −{v}',
    'hero.units': 'Sold',
    'hero.unitsHint': '{orders} orders · {products} products',
    'recon.text':
      'Net profit of products is {products}. Less costs not tied to a product (inbound logistics, general ads, storage) of {other}, the store net profit is {store} — the same as on the dashboard.',
    'card.meta': '{units} units · {orders} orders',
    'card.skus': '{n} SKUs',
    'card.hidden': 'Hidden from catalogue',
    'card.net': 'Net profit',
    'card.perUnit': '{v} per unit',
    'card.loss': 'Loss',
    'card.margin': 'Margin {v}',
    'card.roi': 'ROI {v}',
    'card.colUnit': 'Per unit',
    'card.colTotal': 'Total',
    'row.revenue': 'Revenue',
    'row.commission': 'Commission',
    'row.logistics': 'Delivery',
    'row.payout': 'To withdraw',
    'row.payoutHint': 'Uzum pays you',
    'row.cogs': 'Cost of goods',
    'row.otherCost': 'Packaging etc.',
    'row.tax': 'Tax',
    'row.ads': 'Ads',
    'row.netProfit': 'Net profit',
    'card.noCost': 'No cost price — profit looks higher than it is',
    'card.setCost': 'Set cost price',
    'card.more': 'Details',
    'card.returns': '{n} returned',
    'tag.noCost': 'No cost price',
    'tag.returnsTitle': 'Return rate {v} — store average {avg}',
    'col.product': 'Product',
    'col.units': 'Sold',
    'col.orders': '{n} orders',
    'col.revenue': 'Revenue',
    'col.split': 'Revenue split',
    'col.profit': 'Net profit',
    'col.margin': 'Margin',
    'col.roi': 'ROI',
    'total.label': 'Total · {n} products',
    'empty.title': 'No sales in this period',
    'empty.hint': 'Pick a wider period above — for example “This year”.',
    'empty.search': 'No products match the search',
    'note.money': 'Amounts in UZS. Cancelled and returned sales are excluded.',
    'note.table': 'Click a row to open the full breakdown from revenue to net profit.',
    'note.expand': 'The arrow left of the name opens the SKU variants.',
    'tab.all': 'All',
    'tab.loss': 'Loss-making',
    'tab.lowMargin': 'Low margin',
    'tab.noCost': 'No cost price',
    'tab.lowBuyout': 'Low buyout',
    'tabHint.loss': 'Net profit is negative — a loss after cost, tax and ads.',
    'tabHint.lowMargin': 'Not a loss, but the margin is below {v}.',
    'tabHint.noCost': 'At least one sold variant has no cost price — profit looks higher than it is.',
    'tabHint.lowBuyout':
      'Buyout at least {gap} pp below the store average ({avg}) — with at least {min} completed units.',
    'empty.tab': 'No products in this tab',
    'empty.tabHint': 'A good sign. Pick another tab or go back to “All”.',
    'variants.show': 'Variants ({n})',
    'variants.hide': 'Hide variants',
    'total.labelOf': 'Total · {n} of {all} products',
    'total.perUnit': '{v} per unit',
    'card.buyout': 'buyout {v}',
    'tag.lowBuyout': 'Low buyout {v}',
    'tag.lowBuyoutTitle': 'Buyout rate {v} — store average {avg}',
    'export.done': 'Excel file is ready',
    'export.error': 'Export failed',
    'export.locked': 'Excel export is not available on your plan',
  },
});

type SortKey = 'profit' | 'perUnit' | 'revenue' | 'margin';
type ViewMode = 'table' | 'cards';
/**
 * Muammo bo'limlari (tablar). Qaysi mahsulot qaysi bo'limga tushishini server
 * belgilaydi (`row.flags`, services/product-profit.ts) — sanoq, kartalar va
 * Excel'dagi "Muammo" ustuni bitta qoidadan.
 */
type TabKey = 'all' | ProductProfitFlag;
const TABS: TabKey[] = ['all', 'loss', 'lowMargin', 'noCost', 'lowBuyout'];
const isTab = (v: string | null): v is TabKey => v !== null && (TABS as string[]).includes(v);

const SORTERS: Record<SortKey, (r: ProductProfitRow) => number> = {
  profit: (r) => r.netProfit,
  perUnit: (r) => r.perUnit.netProfit,
  revenue: (r) => r.revenue,
  margin: (r) => r.margin,
};

/**
 * Jadval standart ko'rinish bo'ladigan chegara. 16 mahsulot kartochkada
 * 5 000 px'lik sahifa edi (2026-10-24) — taqqoslash uchun pastga
 * aylantirib, raqamlarni yodda saqlashga to'g'ri kelardi.
 */
const TABLE_FROM = 12;

/**
 * Bir mahsulot sahifasi qatorlari: tushumdan sof foydagacha zanjir.
 * `kind`: ayiriladigan xarajat (−), oraliq natija (=) yoki boshlang'ich summa.
 * `always` — nol bo'lsa ham ko'rinadigan asosiy qatorlar.
 * Ranglar COST_COLORS'dan — yuqoridagi "Tushum qayerga ketdi" chizig'i,
 * Moliya va Unit-iqtisod sahifalari bilan bir xil.
 */
const ROWS: {
  key: keyof ProductProfitMoney;
  kind: 'start' | 'minus' | 'subtotal' | 'result';
  color?: string;
  always?: boolean;
}[] = [
  { key: 'revenue', kind: 'start', always: true },
  { key: 'commission', kind: 'minus', color: COST_COLORS.commission, always: true },
  { key: 'logistics', kind: 'minus', color: COST_COLORS.logistics, always: true },
  { key: 'payout', kind: 'subtotal', always: true },
  { key: 'cogs', kind: 'minus', color: COST_COLORS.cogs, always: true },
  { key: 'otherCost', kind: 'minus', color: COST_COLORS.other },
  { key: 'tax', kind: 'minus', color: COST_COLORS.tax },
  { key: 'ads', kind: 'minus', color: COST_COLORS.marketing },
  { key: 'netProfit', kind: 'result', always: true },
];

/**
 * Tushum bo'laklari — zanjir tartibida (Uzum ushlagani → o'z xarajatlaringiz
 * → sof foyda). Zarar bo'lsa foyda bo'lagi chiziqqa kirmaydi.
 */
function splitParts(m: ProductProfitMoney, t: TFunc) {
  return [
    ...ROWS.filter((r) => r.kind === 'minus').map((r) => ({
      key: r.key,
      label: t(`row.${r.key}`),
      value: m[r.key],
      color: r.color ?? COST_COLORS.other,
    })),
    { key: 'netProfit', label: t('row.netProfit'), value: Math.max(0, m.netProfit), color: COST_COLORS.profit },
  ];
}

/**
 * Javobni sahifa kutgan ko'rinishga keltiradi. Yangilanish paytida sayt eski
 * API bilan bir necha soniya gaplashib qolishi mumkin — yangi maydonlar
 * (flags, variants, attention) bo'lmasa sahifa yiqilmasin, ularsiz chiqsin.
 * `thresholds` zaxira qiymati faqat shu holat uchun (belgilar bo'lmagani
 * uchun bo'limlar baribir chiqmaydi); haqiqiy chegaralar — serverda.
 */
function normalize(d: ProductProfitResponse): ProductProfitResponse {
  return {
    ...d,
    attention: d.attention ?? [],
    thresholds: d.thresholds ?? { lowMargin: 10, nearZeroMargin: 5, buyoutGap: 10, buyoutMinCompleted: 5 },
    rows: d.rows.map((r) => ({ ...r, flags: r.flags ?? [], variants: r.variants ?? [] })),
  };
}

export default function ProductProfit() {
  const t = useT('productProfit');
  const periodQuery = usePeriodQuery();
  const [params, setParams] = useSearchParams();
  const [sort, setSort] = useState<SortKey>('profit');
  const [search, setSearch] = useState('');
  const [active, setActive] = useState<ProductProfitRow | null>(null);
  const [exporting, setExporting] = useState(false);
  // Ikkalasi ham shart: eksport routeri `export_excel`, bu fayl esa yana `unit_economics` talab qiladi
  const exportAccess = useFeature('export_excel');
  const profitAccess = useFeature('unit_economics');
  const canExport = exportAccess === 'full' && profitAccess === 'full';

  const setParam = (key: string, value: string | null) => {
    const next = new URLSearchParams(params);
    if (value === null) next.delete(key);
    else next.set(key, value);
    setParams(next, { replace: true });
  };
  /*
   * Ko'rinish manzilda (?view=cards) — havola ulashilsa yoki sahifa
   * yangilansa tanlov saqlanadi. Tanlanmaguncha mahsulotlar soniga qarab.
   */
  const urlView = params.get('view');
  const picked: ViewMode | null = urlView === 'table' || urlView === 'cards' ? urlView : null;
  const setPicked = (v: ViewMode) => setParam('view', v);
  /*
   * Bo'lim ham manzilda (?tab=loss): "Zararda" ro'yxatini havola bilan yuborish
   * mumkin, sahifa yangilansa tanlov yo'qolmaydi. Noma'lum qiymat — "Hammasi".
   */
  const urlTab = params.get('tab');
  const tab: TabKey = isTab(urlTab) ? urlTab : 'all';
  const setTab = (v: TabKey) => setParam('tab', v === 'all' ? null : v);

  const query = useQuery({
    queryKey: ['product-profit', periodQuery],
    queryFn: async () => normalize(await api.get<ProductProfitResponse>('/products/profit', periodQuery)),
    placeholderData: (prev) => prev,
  });

  const data = query.data;
  /*
   * Qidiruv: nomi, kategoriyasi, Uzum mahsulot ID'si yoki istalgan variantining
   * nomi, SKU kodi, shtrix-kodi, Uzum SKU ID'si; uzum.uz havolasi ham —
   * serverdagi BILAN BIR XIL qoida (shared search.ts), kalitlar qatorda keladi.
   * Ilgari faqat nom, kategoriya, SKU kodi va variant nomi edi (2026-10-24).
   * Bo'limlar sanog'i, jamlanma va "E‘tibor talab qiladi" qidiruvga bog'liq emas.
   */
  const skuQuery = useSkuQuery(search);
  const searched = useMemo(() => {
    const all = data?.rows ?? [];
    if (!skuQuery) return all;
    return all.filter((r) =>
      matchesProductQuery(
        skuQuery,
        { id: r.productId, title: r.title, category: r.category, uzumProductId: r.uzumProductId },
        r.variants.map((v) => ({ id: v.skuId, sku: v.sku, title: v.title, barcode: v.barcode, uzumSkuId: v.uzumSkuId })),
      ),
    );
  }, [data, skuQuery]);

  // Bo'limlar sanog'i — qidiruvga mos ro'yxat bo'yicha, bo'lim tanlovidan oldin: tab bosilsa aynan shuncha qator chiqadi
  const counts = useMemo(() => {
    const c: Record<TabKey, number> = { all: searched.length, loss: 0, lowMargin: 0, noCost: 0, lowBuyout: 0 };
    for (const r of searched) for (const flag of r.flags) c[flag] += 1;
    return c;
  }, [searched]);

  const rows = useMemo(() => {
    const flag = tab === 'all' ? null : tab;
    const list = flag ? searched.filter((r) => r.flags.includes(flag)) : searched;
    const by = SORTERS[sort];
    return [...list].sort((a, b) => by(b) - by(a));
  }, [searched, tab, sort]);

  // Qidiruvda qator kamayganda ko'rinish sakramasin — chegara umumiy son bo'yicha
  const view: ViewMode = picked ?? ((data?.rows.length ?? 0) > TABLE_FROM ? 'table' : 'cards');

  const onExport = async () => {
    setExporting(true);
    try {
      // Sahifadagi davr va do'kon filtri bilan; bo'lim va qidiruv faylga ta'sir qilmaydi — unda "Muammo" ustuni bor
      const blob = await api.blob('/export/product-profit', periodQuery);
      downloadBlob(blob, `product-profit-${periodQuery.from}_${periodQuery.to}.xlsx`);
      toast.success(t('export.done'));
    } catch (err) {
      toast.error(t('export.error'), err instanceof Error ? err.message : undefined);
    } finally {
      setExporting(false);
    }
  };

  // Do'kon bo'yicha o'rtacha qaytish ulushi — mahsulotning qaytishlari shunga solishtiriladi
  const avgReturn = useMemo(() => {
    let returns = 0;
    let base = 0;
    (data?.rows ?? []).forEach((r) => {
      returns += r.returns;
      base += r.units + r.returns;
    });
    return base > 0 ? returns / base : 0;
  }, [data]);

  return (
    <>
      <PageHeader
        icon={<HandCoins className="h-5 w-5" />}
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
          <Button
            variant="outline"
            icon={<Download className="h-4 w-4" />}
            loading={exporting}
            disabled={!canExport}
            title={canExport ? undefined : t('export.locked')}
            onClick={() => void onExport()}
          >
            {t('btn.export')}
          </Button>
        }
      />

      <FilterBar>
        <SkuSearchInput value={search} onChange={setSearch} className="w-full sm:w-72" />
        <Segmented<SortKey>
          size="sm"
          value={sort}
          onChange={setSort}
          options={(['profit', 'perUnit', 'revenue', 'margin'] as const).map((k) => ({ value: k, label: t(`sort.${k}`) }))}
        />
        <Segmented<ViewMode>
          size="sm"
          className="sm:ml-auto"
          value={view}
          onChange={setPicked}
          options={[
            {
              value: 'table',
              label: (
                <span className="inline-flex items-center gap-1.5">
                  <Rows3 className="h-3.5 w-3.5" />
                  {t('view.table')}
                </span>
              ),
            },
            {
              value: 'cards',
              label: (
                <span className="inline-flex items-center gap-1.5">
                  <LayoutGrid className="h-3.5 w-3.5" />
                  {t('view.cards')}
                </span>
              ),
            },
          ]}
        />
      </FilterBar>

      <PlanGate feature="unit_economics">
        {query.isError ? (
          <Card>
            <ErrorState
              message={query.error instanceof Error ? query.error.message : undefined}
              onRetry={() => void query.refetch()}
              retryLabel={t('btn.retry')}
            />
          </Card>
        ) : (
          <div className="space-y-5">
            <SummaryHero data={data} loading={query.isLoading} />

            {/* Eng katta pul ta'siri bo'lgan 4 ta holat — server tanlaydi, har biri mahsulot sahifasiga olib boradi */}
            <ProfitAttention
              items={data?.attention ?? []}
              rows={data?.rows ?? []}
              loading={query.isLoading}
              onShowTab={setTab}
              tabLabel={(flag) => t(`tab.${flag}`)}
            />

            {query.isLoading ? (
              <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-[480px] w-full rounded-2xl" />
                ))}
              </div>
            ) : (
              <div className="space-y-3">
                {data ? <ProblemTabs tab={tab} counts={counts} onChange={setTab} data={data} /> : null}
                {rows.length === 0 ? (
                  <Card>
                    <EmptyState
                      icon={<HandCoins className="h-6 w-6" />}
                      title={search.trim() ? t('empty.search') : tab !== 'all' ? t('empty.tab') : t('empty.title')}
                      hint={search.trim() ? undefined : tab !== 'all' ? t('empty.tabHint') : t('empty.hint')}
                      action={
                        tab !== 'all' ? (
                          <Button size="sm" variant="outline" onClick={() => setTab('all')}>
                            {t('tab.all')}
                          </Button>
                        ) : undefined
                      }
                    />
                  </Card>
                ) : view === 'table' ? (
                  <>
                    <ProfitTable
                      rows={rows}
                      allCount={searched.length}
                      avgReturn={avgReturn}
                      storeBuyout={data?.totals.buyoutRate ?? null}
                      onOpen={setActive}
                    />
                    <p className="text-2xs text-muted">
                      {t('note.table')} {rows.some(hasVariants) ? `${t('note.expand')} ` : ''}
                      {t('note.money')}
                    </p>
                  </>
                ) : (
                  <>
                    <div className="grid items-start gap-4 lg:grid-cols-2 2xl:grid-cols-3">
                      {rows.map((r) => (
                        <ProfitCard
                          key={r.productId}
                          row={r}
                          avgReturn={avgReturn}
                          storeBuyout={data?.totals.buyoutRate ?? null}
                        />
                      ))}
                    </div>
                    <p className="text-2xs text-muted">{t('note.money')}</p>
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </PlanGate>

      {/* Jadvaldagi qator bosilganda — o'sha mahsulotning to'liq hisobi (kartochkaning o'zi) */}
      <Drawer open={Boolean(active)} onClose={() => setActive(null)} title={active?.title}>
        {active ? (
          <ProfitCard row={active} avgReturn={avgReturn} storeBuyout={data?.totals.buyoutRate ?? null} embedded />
        ) : null}
      </Drawer>
    </>
  );
}

/**
 * Muammo bo'limlari jadval (yoki kartochkalar) ustida. Faqat ma'lumotda bor
 * bo'limlar va tanlangani ko'rinadi: "Zararda 0", "Tannarxsiz 0" kabi nol
 * tugmalar shovqin edi, muammo umuman bo'lmasa qator ham chiqmaydi. Tanlangan
 * bo'lim ostida uning qoidasi — chegaralar serverdan (`thresholds`): qoida
 * o'zgarsa, izoh ham o'zi o'zgaradi.
 */
function ProblemTabs({
  tab,
  counts,
  onChange,
  data,
}: {
  tab: TabKey;
  counts: Record<TabKey, number>;
  onChange: (v: TabKey) => void;
  data: ProductProfitResponse;
}) {
  const t = useT('productProfit');
  const f = useFormat();
  const visible = TABS.filter((k) => k === 'all' || k === tab || counts[k] > 0);
  if (visible.length <= 1) return null;

  const th = data.thresholds;
  const avg = data.totals.buyoutRate;
  const hint =
    tab === 'loss'
      ? t('tabHint.loss')
      : tab === 'lowMargin'
        ? t('tabHint.lowMargin', { v: f.pct(th.lowMargin, 0) })
        : tab === 'noCost'
          ? t('tabHint.noCost')
          : tab === 'lowBuyout'
            ? t('tabHint.lowBuyout', {
                avg: avg === null ? '—' : f.pct(avg),
                gap: f.num(th.buyoutGap),
                min: f.num(th.buyoutMinCompleted),
              })
            : null;

  return (
    <div className="space-y-2">
      <Segmented<TabKey>
        value={tab}
        onChange={onChange}
        options={visible.map((k) => ({ value: k, label: t(`tab.${k}`), count: counts[k] }))}
      />
      {hint ? (
        <p className="flex items-start gap-1.5 text-xs text-muted">
          <Info className="mt-px h-3.5 w-3.5 shrink-0" />
          <span className="min-w-0">
            {hint}
            {tab === 'noCost' ? (
              <>
                {' '}
                <Link to="/cost-price" className="font-semibold text-brand-ink hover:underline">
                  {t('card.setCost')}
                </Link>
              </>
            ) : null}
          </span>
        </p>
      ) : null}
    </div>
  );
}

/**
 * Sahifaning yagona HeroCard'i: mahsulotlar sof foydasi va tushum qayerga
 * ketgani. Ilgari bu yerda to'rtta bir xil KPI kartochkasi va ostida
 * kulrang izoh paragrafi turardi (do'kon foydasi bilan farq) — endi o'sha
 * farq ham alohida plitkada, raqami bilan.
 */
function SummaryHero({ data, loading }: { data?: ProductProfitResponse; loading: boolean }) {
  const t = useT('productProfit');
  const f = useFormat();
  const totals = data?.totals;
  const profit = totals?.netProfit ?? 0;
  const loss = profit < 0;
  const shown = useCountUp(profit);
  const revenue = totals?.revenue ?? 0;
  const units = totals?.units ?? 0;
  const parts = totals ? splitParts(totals, t).filter((p) => p.value > 0) : [];
  // Server `pct` kabi ikki xonagacha — Moliya sahifasidagi ulushlar bilan bir xil son chiqsin
  const share = (v: number) => (revenue > 0 ? Math.round((v / revenue) * 10_000) / 100 : 0);
  const unallocated = data?.unallocated ?? 0;

  if (loading || !totals || !data) {
    return (
      <HeroCard className="p-5 sm:p-6">
        <div className="grid gap-6 lg:grid-cols-2">
          <div>
            <Skeleton className="h-5 w-48" />
            <Skeleton className="mt-4 h-10 w-72 max-w-full" />
            <div className="mt-6 grid grid-cols-2 gap-2.5">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          </div>
          <Skeleton className="h-56 w-full" />
        </div>
      </HeroCard>
    );
  }

  return (
    <HeroCard tone={loss ? 'danger' : 'brand'} className="p-5 sm:p-6">
      {/*
        Tepada ikki ustun (javob | tushum taqsimoti), ostida to'rt plitka
        butun kenglikda — ikkala ustun bir xil balandlikda turadi.
      */}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:gap-8">
        <div className="flex min-w-0 flex-col">
          <div className="flex min-w-0 items-center gap-3">
            <span className="icon-tile h-10 w-10 rounded-xl [&_svg]:h-5 [&_svg]:w-5" aria-hidden>
              <HandCoins />
            </span>
            <div className="min-w-0">
              <p className="font-display text-[15px] font-semibold leading-5 text-ink">
                {loss ? t('hero.loss') : t('hero.title')}
              </p>
              <p className="truncate text-xs text-muted">{t('hero.sub')}</p>
            </div>
          </div>

          <p
            className={cn(
              'tnum mt-5 font-title text-[30px] font-semibold leading-none tracking-[-0.03em] sm:text-[38px]',
              loss ? 'text-danger-ink' : 'text-ink',
            )}
          >
            <Amount value={f.money(shown)} />
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            <Badge tone={totals.margin < 0 ? 'danger' : 'brand'}>
              <span className="tnum">{t('hero.margin', { v: f.pct(totals.margin) })}</span>
            </Badge>
            <Badge tone="muted">
              <span className="tnum">
                {t('hero.roi', { v: totals.cogs + totals.otherCost > 0 ? f.pct(totals.roi, 0) : '—' })}
              </span>
            </Badge>
            {units > 0 ? (
              <Badge tone="muted">
                <span className="tnum">{t('hero.perUnit', { v: f.money(profit / units) })}</span>
              </Badge>
            ) : null}
          </div>
        </div>

        {/* Tushum qayerga ketdi — har bir modda tushumga nisbatan, ranglar jadval va kartochkalardagi bilan bir xil */}
        <div className="min-w-0 lg:border-l lg:border-line/70 lg:pl-8">
          <div className="flex items-baseline justify-between gap-3">
            <p className="eyebrow">{t('hero.split')}</p>
            <p className="tnum text-xs text-muted">{f.money(revenue)}</p>
          </div>
          <SplitStrip parts={parts} className="mt-3 h-3" />
          <ul className="mt-3.5 grid gap-x-6 gap-y-1.5 sm:grid-cols-2 lg:grid-cols-1">
            {parts.map((p) => (
              <li key={p.key} className="flex items-center gap-2.5 text-sm">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: p.color }} />
                <span
                  className={cn(
                    'min-w-0 flex-1 truncate',
                    p.key === 'netProfit' ? 'font-semibold text-ink' : 'text-ink-soft',
                  )}
                >
                  {p.label}
                </span>
                <span
                  className={cn(
                    'tnum shrink-0 whitespace-nowrap font-semibold',
                    p.key === 'netProfit' ? 'text-brand-ink' : 'text-ink',
                  )}
                >
                  {f.money(p.value)}
                </span>
                <span className="tnum w-12 shrink-0 text-right text-xs text-muted">{f.pct(share(p.value))}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-2.5 xl:grid-cols-4">
        <HeroWell
          label={t('kpi.revenue')}
          value={f.money(revenue)}
          hint={t('kpi.revenueHint', { units: f.num(units), orders: f.num(totals.orders) })}
        />
        <HeroWell label={t('kpi.payout')} value={f.money(totals.payout)} hint={t('row.payoutHint')} />
        <HeroWell label={t('kpi.cogs')} value={f.money(totals.cogs)} hint={t('kpi.cogsHint')} />
        {/*
          Nega bu yig'indi Boshqaruv panelidagi sof foydadan farq qiladi — raqam
          bilan: farq aynan mahsulotga bog'lanmaydigan xarajatlar. To'liq
          izoh sichqoncha olib borilganda.
        */}
        {unallocated > 0 && data.rows.length > 0 ? (
          <HeroWell
            label={t('hero.store')}
            value={f.money(profit - unallocated)}
            hint={t('hero.storeHint', { v: f.compact(unallocated) })}
            title={t('recon.text', {
              products: f.money(profit),
              other: f.money(unallocated),
              store: f.money(profit - unallocated),
            })}
            danger={profit - unallocated < 0}
          />
        ) : (
          <HeroWell
            label={t('hero.units')}
            value={f.num(units)}
            hint={t('hero.unitsHint', { orders: f.num(totals.orders), products: f.num(totals.products) })}
          />
        )}
      </div>
    </HeroCard>
  );
}

function HeroWell({
  label,
  value,
  hint,
  title,
  danger,
}: {
  label: string;
  value: string;
  hint: string;
  title?: string;
  danger?: boolean;
}) {
  return (
    <div className="well min-w-0 p-3" title={title}>
      <p className="eyebrow truncate">{label}</p>
      <p className={cn('tnum mt-1 truncate font-display text-base font-bold leading-6', danger ? 'text-danger' : 'text-ink')}>
        <Amount value={value} />
      </p>
      <p className="mt-0.5 line-clamp-2 text-2xs leading-snug text-muted">{hint}</p>
    </div>
  );
}

/** Mahsulotning qaytish ulushi: qaytgan / (sotilgan + qaytgan) */
function returnRate(r: { units: number; returns: number }): number {
  const base = r.units + r.returns;
  return base > 0 ? r.returns / base : 0;
}

/**
 * Mahsulotning "muammo" belgilari — o'qiladigan plastinkalarda. Ilgari
 * qaytgan donalar xira matn bilan meta qatorga qo'shilib ketardi, tannarx
 * yo'qligi esa faqat kartochka pastida ko'rinardi.
 *
 * Qaytishlar za'faron rangda faqat do'kon o'rtachasidan 1,5 baravar yuqori
 * bo'lsa (va kamida 3 dona). Demo do'konda 16 mahsulotning 15 tasida qaytish
 * bor — hammasi bir xil ogohlantiruvchi rangda tursa, haqiqiy muammoli 3 ta
 * mahsulot ajralmay qolardi. Qolganlari tinch kulrang plastinkada.
 *
 * "Tannarxsiz" va "Past xarid" — server belgilari (`row.flags`): sahifadagi
 * shu nomli bo'limlar bilan bitta qoida. Ilgari "tannarxsiz" faqat butun
 * mahsulotning tannarxi 0 bo'lsa chiqardi: to'rt rangdan bittasiga tannarx
 * kiritilmagan bo'lsa ham foyda oshib ko'rinardi, belgi esa yo'q edi.
 */
function ProblemTags({
  row,
  avgReturn,
  storeBuyout,
  showBuyout,
  className,
}: {
  row: ProductProfitRow;
  /** Do'kon bo'yicha o'rtacha qaytish ulushi (0..1) */
  avgReturn: number;
  /** Do'kon o'rtacha xarid foizi — "Past xarid" belgisi izohi uchun */
  storeBuyout?: number | null;
  /** Kartochkada "Past xarid" ham ko'rinadi; jadvalda u o'z ustunida */
  showBuyout?: boolean;
  className?: string;
}) {
  const t = useT('productProfit');
  const f = useFormat();
  const b = useBuyout();
  const noCost = row.flags.includes('noCost');
  const lowBuyout = Boolean(showBuyout) && row.flags.includes('lowBuyout');
  if (!noCost && !lowBuyout && row.returns <= 0 && !row.hidden) return null;
  const rate = returnRate(row);
  const highReturns = row.returns >= 3 && avgReturn > 0 && rate >= avgReturn * 1.5;
  return (
    <span className={cn('flex flex-wrap items-center gap-1.5', className)}>
      {noCost ? (
        <Badge tone="warn" className="px-2 py-0.5" title={t('card.noCost')}>
          <Tag className="h-3 w-3" />
          {t('tag.noCost')}
        </Badge>
      ) : null}
      {lowBuyout ? (
        <Badge
          tone="warn"
          className="px-2 py-0.5"
          title={t('tag.lowBuyoutTitle', {
            v: b.value(row),
            avg: storeBuyout === null || storeBuyout === undefined ? '—' : f.pct(storeBuyout),
          })}
        >
          <ShoppingBag className="h-3 w-3" />
          <span className="tnum">{t('tag.lowBuyout', { v: b.value(row) })}</span>
        </Badge>
      ) : null}
      {row.returns > 0 ? (
        <Badge
          tone={highReturns ? 'warn' : 'muted'}
          className="px-2 py-0.5"
          title={t('tag.returnsTitle', { v: f.pct(rate * 100), avg: f.pct(avgReturn * 100) })}
        >
          <RotateCcw className="h-3 w-3" />
          <span className="tnum">{t('card.returns', { n: f.num(row.returns) })}</span>
        </Badge>
      ) : null}
      {/* Yashirilgan bo'lsa ham puli hisobda — sotuvchi qaysi biri ekanini bilsin */}
      {row.hidden ? (
        <Badge tone="muted" className="px-2 py-0.5">
          <EyeOff className="h-3 w-3" />
          {t('card.hidden')}
        </Badge>
      ) : null}
    </span>
  );
}

/**
 * Jadval ko'rinishi — mahsulotlarni yonma-yon solishtirish uchun. Ustunlar
 * 1366 px'da sig'adi: xarajat moddalari alohida ustun emas, bitta rangli
 * "Tushum taqsimoti" chizig'ida; to'liq hisob qator bosilganda ochiladi.
 *
 * Xarid foizi ustuni qo'shilgach (2026-10-24) jadval 1366 px'ga sig'ishi
 * uchun "Tushum taqsimoti" chizig'i faqat 2xl (1536 px) dan ko'rinadi — u
 * qator bosilganda ochiladigan hisobda va bosh kartochkada bor. SKU
 * variantlarini ochish tugmasi alohida ustun emas, nom katagining boshida.
 */
function ProfitTable({
  rows,
  allCount,
  avgReturn,
  storeBuyout,
  onOpen,
}: {
  rows: ProductProfitRow[];
  /** Bo'lim tanlanmagandagi (qidiruvdan keyingi) qatorlar soni — jami yozuvida "3 / 16" */
  allCount: number;
  avgReturn: number;
  /** Do'kon o'rtacha xarid foizi ("Past xarid" izohi uchun) */
  storeBuyout: number | null;
  onOpen: (r: ProductProfitRow) => void;
}) {
  const t = useT('productProfit');
  const f = useFormat();
  const b = useBuyout();

  const columns: Column<ProductProfitRow>[] = useMemo(
    () => [
      {
        key: 'title',
        header: t('col.product'),
        sortable: true,
        sortValue: (r) => r.title,
        render: (r) => (
          // max-w: uzun nom ustunni kengaytirib, o'ngdagi raqamlarni (ROI) ekrandan surib chiqarmasin
          <div className="max-w-[15rem] 2xl:max-w-[20rem]">
            <ProductCell
              title={r.title}
              imageUrl={r.imageUrl}
              size={40}
              subtitle={[r.category, t('card.skus', { n: r.skuCount })].filter(Boolean).join(' · ')}
            />
            <ProblemTags row={r} avgReturn={avgReturn} className="mt-1.5 pl-[52px]" />
          </div>
        ),
      },
      {
        key: 'units',
        header: t('col.units'),
        align: 'right',
        sortable: true,
        sortValue: (r) => r.units,
        render: (r) => (
          <div className="leading-tight">
            <p className="tnum text-sm text-ink">{f.num(r.units)}</p>
            <p className="tnum text-2xs text-muted">{t('col.orders', { n: f.num(r.orders) })}</p>
          </div>
        ),
      },
      {
        key: 'revenue',
        header: t('col.revenue'),
        align: 'right',
        sortable: true,
        sortValue: (r) => r.revenue,
        render: (r) => <span className="tnum text-ink">{f.money(r.revenue)}</span>,
      },
      {
        key: 'split',
        header: t('col.split'),
        hideBelow: '2xl',
        render: (r) => <SplitStrip parts={splitParts(r, t)} className="w-24 2xl:w-36" />,
      },
      {
        key: 'netProfit',
        header: t('col.profit'),
        align: 'right',
        sortable: true,
        sortValue: (r) => r.netProfit,
        render: (r) => (
          <div className="leading-tight">
            <p className={cn('tnum font-display text-sm font-bold', r.netProfit < 0 ? 'text-danger' : 'text-brand-ink')}>
              {f.money(r.netProfit)}
            </p>
            {r.units > 0 ? (
              <p className="tnum text-2xs text-muted">{t('card.perUnit', { v: f.money(r.perUnit.netProfit) })}</p>
            ) : null}
          </div>
        ),
      },
      {
        key: 'margin',
        header: t('col.margin'),
        align: 'right',
        sortable: true,
        sortValue: (r) => r.margin,
        render: (r) => (
          // Past marja (zarar emas) za'faron — "Past marja" bo'limi bilan bir xil qoida (server belgisi)
          <Badge tone={marginTone(r)} className="px-2 py-0.5">
            <span className="tnum">{f.pct(r.margin)}</span>
          </Badge>
        ),
      },
      {
        key: 'buyout',
        // Oddiy matn: telefondagi "Saralash" ro'yxati JSX sarlavhani ko'rsata olmaydi; formula katak izohida
        header: b.short,
        align: 'right',
        sortable: true,
        // Hisoblab bo'lmaganlari (hammasi yo'lda) kamayish tartibida oxirga tushadi — Mahsulotlar sahifasidagidek
        sortValue: (r) => r.buyoutRate ?? -1,
        render: (r) =>
          r.flags.includes('lowBuyout') ? (
            <Badge
              tone="warn"
              className="px-2 py-0.5"
              title={`${t('tag.lowBuyoutTitle', { v: b.value(r), avg: storeBuyout === null ? '—' : f.pct(storeBuyout) })}\n${b.hint(r)}`}
            >
              <span className="tnum">{b.value(r)}</span>
            </Badge>
          ) : (
            <span className={cn('tnum', r.buyoutRate === null ? 'text-muted' : 'text-ink-soft')} title={b.hint(r)}>
              {b.value(r)}
            </span>
          ),
      },
      {
        key: 'roi',
        header: t('col.roi'),
        align: 'right',
        sortable: true,
        hideOnMobile: true,
        sortValue: (r) => r.roi,
        render: (r) => (
          <span className={cn('tnum', r.roi < 0 ? 'text-danger' : 'text-ink-soft')}>
            {/* Tannarx kiritilmagan bo'lsa ROI'ni hisoblab bo'lmaydi — 0% emas, chiziqcha */}
            {r.cogs + r.otherCost > 0 ? f.pct(r.roi, 0) : '—'}
          </span>
        ),
      },
    ],
    [t, f, b, avgReturn, storeBuyout],
  );

  /*
   * Jami qatori — ko'rinib turgan (qidiruv va bo'limdan o'tgan) mahsulotlar
   * bo'yicha. Foizlar serverdagi bilan bir xil formulada (shared `pct`): hech
   * narsa tanlanmaganda jami qatori bosh kartochka va javobdagi `totals` ga
   * so'mgacha va foizgacha teng.
   */
  const sum = useMemo(() => {
    const s = { units: 0, revenue: 0, netProfit: 0, invested: 0, bought: 0, completed: 0 };
    rows.forEach((r) => {
      s.units += r.units;
      s.revenue += r.revenue;
      s.netProfit += r.netProfit;
      s.invested += r.cogs + r.otherCost;
      s.bought += r.buyoutUnits ?? 0;
      s.completed += r.completedUnits ?? 0;
    });
    return s;
  }, [rows]);
  const cell = 'px-4 py-2.5 md:px-5';
  /*
   * Telefonda jami qatori bitta qatorga sig'ishi uchun faqat nom va sof
   * foyda qoladi — qolganlari (dona, tushum, marja) 375 px'da qatorni
   * 620 px'ga cho'zib, yon tomonga surilardi.
   */
  const wideOnly = 'hidden md:table-cell';

  return (
    <Card className="overflow-hidden">
      <DataTable<ProductProfitRow>
        columns={columns}
        rows={rows}
        rowKey={(r) => r.productId}
        density="compact"
        localSort
        onRowClick={onOpen}
        renderExpanded={(r) => <ProfitVariants row={r} />}
        canExpand={hasVariants}
        expandLabel={(r, open) => (open ? t('variants.hide') : t('variants.show', { n: f.num(r.variants.length) }))}
        footer={
          <>
            <td className={cell}>
              {rows.length === allCount
                ? t('total.label', { n: f.num(rows.length) })
                : t('total.labelOf', { n: f.num(rows.length), all: f.num(allCount) })}
            </td>
            <td className={cn(cell, wideOnly, 'tnum whitespace-nowrap text-right')}>{f.num(sum.units)}</td>
            <td className={cn(cell, wideOnly, 'tnum whitespace-nowrap text-right')}>{f.money(sum.revenue)}</td>
            {/* "Tushum taqsimoti" ustuni bilan bir xil yashiriladi — aks holda jami kataklari bir ustunga siljiydi */}
            <td className={cn(cell, 'hidden 2xl:table-cell')} />
            <td
              className={cn(
                cell,
                'tnum whitespace-nowrap text-right font-display font-bold',
                sum.netProfit < 0 ? 'text-danger' : 'text-brand-ink',
              )}
            >
              {f.money(sum.netProfit)}
              {sum.units > 0 ? (
                <span className="block font-sans text-2xs font-normal text-muted">
                  {t('total.perUnit', { v: f.money(round(sum.netProfit / sum.units)) })}
                </span>
              ) : null}
            </td>
            <td className={cn(cell, wideOnly, 'tnum whitespace-nowrap text-right')}>
              {sum.revenue > 0 ? f.pct(pct(sum.netProfit, sum.revenue)) : '—'}
            </td>
            <td className={cn(cell, wideOnly, 'tnum whitespace-nowrap text-right')}>
              {sum.completed > 0 ? f.pct(pct(sum.bought, sum.completed)) : '—'}
            </td>
            <td className={cn(cell, wideOnly, 'tnum whitespace-nowrap text-right')}>
              {/* Ustundagidek: tannarx umuman kiritilmagan bo'lsa ROI yo'q */}
              {sum.invested > 0 ? f.pct(pct(sum.netProfit, sum.invested), 0) : '—'}
            </td>
          </>
        }
      />
    </Card>
  );
}

/** Bitta mahsulot: sof foyda yirik, ostida tushumdan foydagacha zanjir — 1 dona va jami */
export function ProfitCard({
  row,
  avgReturn,
  storeBuyout = null,
  embedded,
}: {
  row: ProductProfitRow;
  /** Do'kon o'rtacha qaytish ulushi — qaytishlar belgisining rangi uchun */
  avgReturn: number;
  /** Do'kon o'rtacha xarid foizi — "Past xarid" belgisi izohi uchun */
  storeBuyout?: number | null;
  /** Yon panel ichida: kartochka chegarasi va ichki chekinishsiz */
  embedded?: boolean;
}) {
  const t = useT('productProfit');
  const f = useFormat();
  const b = useBuyout();
  const loss = row.netProfit < 0;
  // Server belgisi: sotilgan variantlardan birortasining tannarxi yo'q bo'lsa ham foyda oshib ko'rinadi
  const noCost = row.flags.includes('noCost');
  // Variantlar: yon panelda doim ochiq, kartochkada — tugma bilan (16 ta kartochka 3 barobar uzayib ketmasin)
  const multi = hasVariants(row);
  const [showVariants, setShowVariants] = useState(false);
  // Ichki chekinish: kartochkada o'zi, yon paneldagida panelning o'z chekinishi bor
  const pad = embedded ? 'px-0' : 'px-4 sm:px-5';

  return (
    <div
      className={cn(
        'flex flex-col',
        !embedded && 'card card-hover overflow-hidden',
        !embedded && loss && 'border-danger/40',
      )}
    >
      {/* Sarlavha */}
      <div className={cn('flex items-start gap-3 pb-3', embedded ? 'pt-0' : 'pt-4 sm:pt-5', pad)}>
        <div className="h-14 w-14 shrink-0 overflow-hidden rounded-xl border border-line bg-surface-2">
          <ProductThumb name={row.title} imageUrl={row.imageUrl} style={{ fontSize: 18 }} />
        </div>
        <div className="min-w-0 flex-1">
          <Link
            to={`/products/${row.productId}`}
            className="line-clamp-2 text-sm font-semibold leading-snug text-ink hover:text-brand-ink"
            title={row.title}
          >
            {row.title}
          </Link>
          <p className="mt-0.5 truncate text-xs text-muted">
            {[row.category, t('card.skus', { n: row.skuCount })].filter(Boolean).join(' · ')}
          </p>
          <p className="tnum mt-0.5 text-xs text-ink-soft">
            {t('card.meta', { units: f.num(row.units), orders: f.num(row.orders) })}
            {/* Xarid foizi — voronka bilan bir xil ta'rif; formula va asosi izohda */}
            <span title={b.hint(row)}>
              {' · '}
              {t('card.buyout', { v: b.value(row) })}
            </span>
          </p>
          <ProblemTags row={row} avgReturn={avgReturn} storeBuyout={storeBuyout} showBuyout className="mt-1.5" />
        </div>
      </div>

      {/*
        Asosiy javob: qancha foyda qoldi. Tinch `.well` plitkada — ilgari har
        kartochkada yashil fonli blok turardi va 16 ta "porlayotgan" quti
        sahifaning bosh kartochkasini ajratmay qo'yardi.
      */}
      <div className={cn('well px-4 py-3', embedded ? 'mx-0' : 'mx-4 sm:mx-5', loss && 'border-danger/30 bg-danger/5')}>
        <div className="flex items-center justify-between gap-3">
          <p className="eyebrow">{loss ? t('card.loss') : t('card.net')}</p>
          <span className="flex flex-wrap items-center justify-end gap-1">
            <Badge tone={marginTone(row)} className="px-2 py-0.5">
              <span className="tnum">{t('card.margin', { v: f.pct(row.margin) })}</span>
            </Badge>
            <Badge tone="muted" className="px-2 py-0.5">
              {/* Tannarx kiritilmagan bo'lsa ROI'ni hisoblab bo'lmaydi — 0% emas, chiziqcha */}
              <span className="tnum">{t('card.roi', { v: row.cogs + row.otherCost > 0 ? f.pct(row.roi, 0) : '—' })}</span>
            </Badge>
          </span>
        </div>
        <p
          className={cn(
            'tnum mt-1.5 font-display text-[24px] font-bold leading-tight tracking-[-0.02em]',
            loss ? 'text-danger' : 'text-brand-ink',
          )}
        >
          <Amount value={f.money(row.netProfit)} />
        </p>
        {row.units > 0 ? (
          <p className={cn('tnum mt-0.5 text-sm font-semibold', loss ? 'text-danger' : 'text-ink')}>
            {t('card.perUnit', { v: f.money(row.perUnit.netProfit) })}
          </p>
        ) : null}
      </div>

      {/* Zanjir: tushum → chiqarishga → sof foyda */}
      <div className={cn('pb-1 pt-3', pad)}>
        <div className="grid grid-cols-[minmax(0,1fr)_5.5rem_6.75rem] gap-x-2 pb-1.5 text-2xs font-semibold text-muted">
          <span />
          <span className="text-right">{t('card.colUnit')}</span>
          <span className="text-right">{t('card.colTotal')}</span>
        </div>
        <ul>
          {ROWS.filter((r) => r.always || row[r.key] !== 0).map((r) => {
            const total = row[r.key];
            const unit = row.perUnit[r.key];
            // Xarajat qatorlari minus bilan; natija qatorlari manfiy bo'lsagina
            const signOf = (v: number) => (r.kind === 'minus' ? '−' : v < 0 ? '−' : '');
            const strong = r.kind === 'subtotal' || r.kind === 'result';
            return (
              <li
                key={r.key}
                className={cn(
                  'grid grid-cols-[minmax(0,1fr)_5.5rem_6.75rem] items-center gap-x-2 py-1.5 text-sm',
                  r.kind === 'subtotal' && 'mt-1 border-t border-line pt-2',
                  r.kind === 'result' && 'mt-1 border-t border-line pt-2',
                )}
                title={r.key === 'payout' ? t('row.payoutHint') : undefined}
              >
                <span className={cn('flex min-w-0 items-center gap-2', strong ? 'font-semibold text-ink' : 'text-ink-soft')}>
                  {r.color ? (
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: r.color }} />
                  ) : r.kind === 'result' ? (
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: COST_COLORS.profit }} />
                  ) : (
                    <span className="w-2 shrink-0" />
                  )}
                  <span className="truncate">{t(`row.${r.key}`)}</span>
                </span>
                <span
                  className={cn(
                    'tnum whitespace-nowrap text-right',
                    // Natija qatori rangi bitta joyda: foyda — yashil, zarar — qizil
                    r.kind === 'result'
                      ? cn('font-semibold', unit < 0 ? 'text-danger' : 'text-brand-ink')
                      : strong
                        ? 'font-semibold text-ink'
                        : 'text-muted',
                  )}
                >
                  {row.units > 0 ? `${signOf(unit)}${f.num(Math.abs(unit))}` : '—'}
                </span>
                <span
                  className={cn(
                    'tnum whitespace-nowrap text-right',
                    r.kind === 'result'
                      ? cn('font-semibold', total < 0 ? 'text-danger' : 'text-brand-ink')
                      : strong
                        ? 'font-semibold text-ink'
                        : 'text-ink-soft',
                  )}
                >
                  {signOf(total)}
                  {f.num(Math.abs(total))}
                </span>
              </li>
            );
          })}
        </ul>
      </div>

      {/* Tushum qayerga ketdi — bir qarashda, zanjirdagi nuqtalar bilan bir xil ranglarda */}
      <div className={cn('pb-4 pt-2', pad)}>
        <SplitStrip parts={splitParts(row, t)} />
      </div>

      {multi && (embedded || showVariants) ? (
        <div className={cn('pb-4', pad)}>
          <ProfitVariants row={row} layout="list" />
        </div>
      ) : null}

      {noCost ? (
        <div
          className={cn(
            'mb-4 flex items-start gap-2 rounded-xl border border-warn/30 bg-warn/5 px-3 py-2.5 text-xs text-warn-ink',
            embedded ? 'mx-0' : 'mx-4 sm:mx-5',
          )}
        >
          <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" />
          <span className="min-w-0 flex-1">{t('card.noCost')}</span>
          <Link to="/cost-price" className="inline-flex shrink-0 items-center gap-1 font-semibold hover:underline">
            <Tag className="h-3 w-3" />
            {t('card.setCost')}
          </Link>
        </div>
      ) : null}

      <div
        className={cn(
          'mt-auto flex items-center gap-3 border-t border-line py-2.5',
          multi && !embedded ? 'justify-between' : 'justify-end',
          pad,
        )}
      >
        {multi && !embedded ? (
          <button
            type="button"
            aria-expanded={showVariants}
            onClick={() => setShowVariants((v) => !v)}
            className="inline-flex items-center gap-1 rounded-md text-xs font-medium text-brand-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50"
          >
            {showVariants ? t('variants.hide') : t('variants.show', { n: f.num(row.variants.length) })}
            <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', showVariants && 'rotate-180')} />
          </button>
        ) : null}
        <Link
          to={`/products/${row.productId}`}
          className="inline-flex items-center gap-1 text-xs font-semibold text-brand-ink hover:underline"
        >
          {t('card.more')}
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    </div>
  );
}
