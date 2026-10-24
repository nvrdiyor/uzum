import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  BarChart3,
  Coins,
  LayoutDashboard,
  RefreshCw,
  ReceiptText,
  Rocket,
  ShoppingCart,
  Target,
  TrendingUp,
  PackageSearch,
  Tag,
} from '@/components/icons';
import type { DashboardResponse, TopProductRow } from '@savdoiq/shared';
import { registerNamespace, useFormat, useT } from '@/i18n';
import { api, ApiError } from '@/lib/api';
import { usePeriodQuery } from '@/store/ui';
import { CHART_COLORS } from '@/lib/theme';
import { ChartCard, TrendChart, type CompareDef, type SeriesDef } from '@/components/charts';
import { FilterBar } from '@/components/filters';
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  IconButton,
  PageHeader,
  PlanGate,
  Segmented,
  Skeleton,
  StatCard,
} from '@/components/ui';
import { DataFreshness } from '@/components/trust/DataFreshness';
import { CostCoverage } from '@/components/trust/CostCoverage';
import { ComparePeriodChip } from '@/components/trust/ComparePeriod';
import { MoneyFlow } from '@/components/dashboard/MoneyFlow';
import { InsightsBlock } from '@/components/dashboard/InsightsBlock';
import { MarginRoiCard, PayoutsCard, StockValueCard } from '@/components/dashboard/SummaryRow';
import { ExpensesCard } from '@/components/dashboard/ExpensesCard';
import { StoresCard } from '@/components/dashboard/StoresCard';
import { TopProductsCard } from '@/components/dashboard/TopProductsCard';
import { ProfitRankList, type ProfitRankRow } from '@/components/dashboard/ProfitRankList';
import { MarginMap } from '@/components/dashboard/MarginMap';
import { splitProductName } from '@/components/dashboard/productName';
import { TodayTasks } from '@/components/dashboard/TodayTasks';
import { TODAY_QUERY_KEY } from '@/components/dashboard/today/useToday';
import { GoalsCard } from '@/components/dashboard/GoalsCard';
import { GOALS_QUERY_KEY } from '@/components/dashboard/goals/useGoals';
import { RETURNS_QUERY_KEY, ReturnsCard } from '@/components/dashboard/ReturnsCard';
import { cn } from '@/lib/utils';

registerNamespace('dashboard', {
  uz: {
    title: 'Boshqaruv paneli',
    subtitle: 'Do‘koningizning bugungi holati — bir ekranda',
    refresh: 'Ma’lumotni yangilash',

    'kpi.revenue': 'Tushum',
    'kpi.revenueHint': 'To‘lovga: {v}',
    'kpi.profit': 'Sof foyda',
    'kpi.profitHint': 'Marja {v}',
    'kpi.operating': 'Sotilgan tovarlar bo‘yicha foyda {item}, undan davr xarajatlari {exp} ayirilgan',
    'kpi.operatingHint':
      'Sof foyda hamma xarajatdan keyin hisoblanadi: komissiya, yetkazish, tannarx, soliq, omborga logistika, reklama va saqlash.',
    'kpi.orders': 'Buyurtmalar',
    // Yo'ldagi (hali qabul qilinmagan) buyurtmalar ham shu sonda — "sotildi" deyish noto'g'ri edi
    'kpi.ordersHint': '{v} dona (yo‘ldagilar bilan)',
    'kpi.avgCheck': 'O‘rtacha chek',
    'kpi.avgCheckHint': 'Bitta buyurtmaga o‘rtacha summa',

    'payouts.balance': 'Umumiy balans',
    'payouts.balanceHint': 'Uzum kabinetidagi raqam bilan bir xil: sotuv − komissiya − xizmat to‘lovlari',
    'payouts.title': 'To‘lovlar',
    'payouts.subtitle': 'Uzum tomonidan o‘tkazmalar',
    'payouts.yesterday': 'Kecha to‘landi',
    'payouts.today': 'Bugun kutilmoqda',
    'payouts.orders': '{n} ta buyurtma',
    'payouts.hint': 'Summalar yetkazib berilgan buyurtmalar bo‘yicha hisoblanadi.',

    'margin.title': 'Marja va ROI',
    'margin.subtitle': 'Davr bo‘yicha samaradorlik',
    'margin.margin': 'Marja',
    'margin.roi': 'ROI',
    'margin.buyout': 'Sotib olish darajasi',

    'stock.title': 'Qoldiq qiymati',
    'stock.subtitle': 'Omborlardagi tovar bahosi',
    'stock.units': '{n} dona zaxirada',
    'stock.fbo': 'Uzum ombori',
    'stock.fbs': 'O‘z omboringiz',
    'stock.pcs': 'dona',
    'stock.hint': 'Qiymat tannarx bo‘yicha hisoblangan — bu muzlatilgan kapital.',

    'insights.title': 'Davr xulosalari',
    'insights.subtitle': 'Tanlangan davrda nima bo‘ldi — raqamlar bilan',
    'insights.count': '{n} ta',
    'insights.view': 'Ko‘rish',
    'insights.empty': 'Hammasi joyida',
    'insights.emptyHint': 'Bu davrda e’tibor talab qiladigan holat topilmadi.',
    'insights.kind.stock': 'Qoldiq',
    'insights.kind.loss': 'Zarar',
    'insights.kind.illiquid': 'Nolikvid',
    'insights.kind.returns': 'Qaytarish',
    'insights.kind.profit': 'Foyda',
    'insights.kind.revenue': 'Tushum',
    'insights.kind.margin': 'Marja',
    'insights.kind.buyout': 'Sotib olish',
    'insights.kind.sync': 'Sinxron',
    'insights.kind.check': 'O‘rtacha chek',

    'ptop.title': 'Qaysi tovar ko‘proq foyda keltiryapti',
    'ptop.subtitle': 'Sof foyda bo‘yicha, davr ichida',
    'ptop.other': 'Boshqa tovarlar',
    'ptop.empty': 'Bu davrda sotuv bo‘lmadi',
    'map.title': 'Marja xaritasi',
    'map.subtitle': 'O‘ngda — ko‘p sotilgan, tepada — foydali. Nuqta kattaligi: sotilgan dona',
    'map.x': 'Tushum',
    'map.y': 'Marja',
    'map.hint':
      'Chiziqdan pastdagi nuqtalar — ko‘p pul aylanyapti, lekin foyda o‘rtachadan kam. Narxni yoki tannarxni shular bo‘yicha qayta ko‘ring.',
    'map.empty': 'Xarita uchun kamida ikkita sotilgan tovar kerak',
    'chart.title': 'Dinamika',
    'chart.subtitle': 'Kunlik ko‘rsatkichlar',
    'chart.empty': 'Grafik uchun ma’lumot yetarli emas',
    'chart.prev': 'O‘tgan davr',
    'chart.prevRevenue': 'O‘tgan davr tushumi',
    'metric.revenue': 'Tushum',
    'metric.profit': 'Sof foyda',
    'metric.orders': 'Buyurtmalar',
    'metric.units': 'Dona',

    'expenses.title': 'Davr xarajatlari',
    'expenses.subtitle': 'Qayerga qancha ketdi',
    'expenses.total': 'Jami',
    'expenses.empty': 'Xarajat yozuvlari yo‘q',
    'expenses.emptyHint': 'Tanlangan davrda xarajat qayd etilmagan.',

    'stores.title': 'Do‘konlar',
    'stores.subtitle': '{n} ta do‘kon bo‘yicha taqsimot',
    'stores.empty': 'Do‘kon topilmadi',
    'stores.emptyHint': 'Uzum kabinetini ulang — do‘konlar avtomatik chiqadi.',
    'stores.orders': '{n} ta buyurtma',

    'top.title': 'Top mahsulotlar',
    'top.subtitle': 'Tushum bo‘yicha yetakchilar',
    'top.all': 'Barchasi',
    'top.empty': 'Mahsulot topilmadi',
    'top.emptyHint': 'Bu davrda sotuv qayd etilmagan.',
    'top.col.product': 'Mahsulot',
    'top.col.sold': 'Sotildi',
    'top.col.revenue': 'Tushum',
    'top.col.profit': 'Foyda',
    'top.col.margin': 'Marja',
    'top.col.share': 'Ulush',

    'empty.title': 'Hozircha ko‘rsatiladigan ma’lumot yo‘q',
    'empty.hint':
      'Ma’lumot hali yig‘ilmoqda yoki tanlangan davrda sotuv bo‘lmagan. Boshqa davrni tanlab ko‘ring yoki ulanishni tekshiring.',
    'empty.setup': 'Ulanishni tekshirish',
    'empty.periodHint': 'Yuqoridagi davr tanlagichidan kengroq oraliqni belgilang.',
    'nosales.title': 'Bu davrda hali sotuv bo‘lmagan',
    'nosales.hint':
      'Kabinet ulangan va omborda {units} dona tovar ko‘rinyapti, lekin tanlangan davrda buyurtma qayd etilmagan. Birinchi sotuvdan keyin tushum, foyda va marja shu yerda avtomatik paydo bo‘ladi.',
    'nosales.cost': 'Tannarx kiritish',
    'nosales.stocks': 'Qoldiqlarni ko‘rish',
    'nosales.costHint': 'Tannarx kiritilmasa, sotuv boshlanganda foyda noto‘g‘ri hisoblanadi.',
  },
  ru: {
    title: 'Дашборд',
    subtitle: 'Состояние вашего магазина — на одном экране',
    refresh: 'Обновить данные',

    'kpi.revenue': 'Выручка',
    'kpi.revenueHint': 'К выплате: {v}',
    'kpi.profit': 'Чистая прибыль',
    'kpi.profitHint': 'Маржа {v}',
    'kpi.operating': 'Прибыль по проданным товарам {item}, из неё вычтены расходы периода {exp}',
    'kpi.operatingHint':
      'Чистая прибыль считается после всех расходов: комиссия, доставка, себестоимость, налог, логистика на склад, реклама и хранение.',
    'kpi.orders': 'Заказы',
    'kpi.ordersHint': '{v} шт. (включая в пути)',
    'kpi.avgCheck': 'Средний чек',
    'kpi.avgCheckHint': 'Средняя сумма одного заказа',

    'payouts.balance': 'Общий баланс',
    'payouts.balanceHint': 'Совпадает с кабинетом Uzum: продажи − комиссия − оплата услуг',
    'payouts.title': 'Выплаты',
    'payouts.subtitle': 'Переводы от Uzum',
    'payouts.yesterday': 'Выплачено вчера',
    'payouts.today': 'Ожидается сегодня',
    // "Заказов: N" — без согласования числа ("1 заказов")
    'payouts.orders': 'Заказов: {n}',
    'payouts.hint': 'Суммы считаются по доставленным заказам.',

    'margin.title': 'Маржа и ROI',
    'margin.subtitle': 'Эффективность за период',
    'margin.margin': 'Маржа',
    'margin.roi': 'ROI',
    'margin.buyout': 'Процент выкупа',

    'stock.title': 'Стоимость остатков',
    'stock.subtitle': 'Товар на складах',
    'stock.units': '{n} шт. в наличии',
    'stock.fbo': 'Склад Uzum',
    'stock.fbs': 'Ваш склад',
    'stock.pcs': 'шт.',
    'stock.hint': 'Стоимость по себестоимости — это замороженный капитал.',

    'insights.title': 'Итоги периода',
    'insights.subtitle': 'Что произошло за выбранный период — в цифрах',
    'insights.count': '{n} шт.',
    'insights.view': 'Смотреть',
    'insights.empty': 'Всё в порядке',
    'insights.emptyHint': 'За этот период проблем не обнаружено.',
    'insights.kind.stock': 'Остатки',
    'insights.kind.loss': 'Убыток',
    'insights.kind.illiquid': 'Неликвид',
    'insights.kind.returns': 'Возвраты',
    'insights.kind.profit': 'Прибыль',
    'insights.kind.revenue': 'Выручка',
    'insights.kind.margin': 'Маржа',
    'insights.kind.buyout': 'Выкуп',
    'insights.kind.sync': 'Синхронизация',
    'insights.kind.check': 'Средний чек',

    'ptop.title': 'Какой товар приносит больше прибыли',
    'ptop.subtitle': 'По чистой прибыли за период',
    'ptop.other': 'Прочие товары',
    'ptop.empty': 'За этот период продаж не было',
    'map.title': 'Карта маржи',
    'map.subtitle': 'Правее — больше продаж, выше — выгоднее. Размер точки: штук продано',
    'map.x': 'Выручка',
    'map.y': 'Маржа',
    'map.hint':
      'Точки ниже линии — денег проходит много, а прибыль ниже средней. Пересмотрите по ним цену или себестоимость.',
    'map.empty': 'Для карты нужно хотя бы два проданных товара',
    'chart.title': 'Динамика',
    'chart.subtitle': 'Показатели по дням',
    'chart.empty': 'Недостаточно данных для графика',
    'chart.prev': 'Прошлый период',
    'chart.prevRevenue': 'Выручка прошлого периода',
    'metric.revenue': 'Выручка',
    'metric.profit': 'Чистая прибыль',
    'metric.orders': 'Заказы',
    'metric.units': 'Штуки',

    'expenses.title': 'Расходы за период',
    'expenses.subtitle': 'Куда ушли деньги',
    'expenses.total': 'Итого',
    'expenses.empty': 'Расходов нет',
    'expenses.emptyHint': 'За выбранный период расходы не зафиксированы.',

    'stores.title': 'Магазины',
    'stores.subtitle': 'Распределение по {n} магазинам',
    'stores.empty': 'Магазины не найдены',
    'stores.emptyHint': 'Подключите кабинет Uzum — магазины появятся автоматически.',
    // "Заказов: N" — без согласования числа ("1 заказов")
    'stores.orders': 'Заказов: {n}',

    'top.title': 'Топ товаров',
    'top.subtitle': 'Лидеры по выручке',
    'top.all': 'Все',
    'top.empty': 'Товары не найдены',
    'top.emptyHint': 'За этот период продаж не было.',
    'top.col.product': 'Товар',
    'top.col.sold': 'Продано',
    'top.col.revenue': 'Выручка',
    'top.col.profit': 'Прибыль',
    'top.col.margin': 'Маржа',
    'top.col.share': 'Доля',

    'empty.title': 'Пока нечего показать',
    'empty.hint':
      'Данные ещё собираются или за выбранный период продаж не было. Попробуйте другой период или проверьте подключение.',
    'empty.setup': 'Проверить подключение',
    'empty.periodHint': 'Выберите более широкий диапазон в переключателе периода выше.',
    'nosales.title': 'За этот период продаж ещё не было',
    'nosales.hint':
      'Кабинет подключён, на складе видно {units} шт. товара, но за выбранный период заказов нет. После первой продажи выручка, прибыль и маржа появятся здесь автоматически.',
    'nosales.cost': 'Ввести себестоимость',
    'nosales.stocks': 'Посмотреть остатки',
    'nosales.costHint': 'Без себестоимости прибыль будет посчитана неверно.',
  },
  en: {
    title: 'Dashboard',
    subtitle: 'Your store at a glance',
    refresh: 'Refresh data',

    'kpi.revenue': 'Revenue',
    'kpi.revenueHint': 'Payout: {v}',
    'kpi.profit': 'Net profit',
    'kpi.profitHint': 'Margin {v}',
    'kpi.operating': 'Profit on sold goods {item}, less period expenses {exp}',
    'kpi.operatingHint':
      'Net profit is after every cost: commission, delivery, cost price, tax, inbound logistics, ads and storage.',
    'kpi.orders': 'Orders',
    'kpi.ordersHint': '{v} units (incl. in transit)',
    'kpi.avgCheck': 'Average check',
    'kpi.avgCheckHint': 'Average amount per order',

    'payouts.balance': 'Total balance',
    'payouts.balanceHint': 'Matches your Uzum cabinet: sales − commission − service fees',
    'payouts.title': 'Payouts',
    'payouts.subtitle': 'Transfers from Uzum',
    'payouts.yesterday': 'Paid yesterday',
    'payouts.today': 'Expected today',
    'payouts.orders': 'Orders: {n}',
    'payouts.hint': 'Amounts are calculated from delivered orders.',

    'margin.title': 'Margin & ROI',
    'margin.subtitle': 'Efficiency for the period',
    'margin.margin': 'Margin',
    'margin.roi': 'ROI',
    'margin.buyout': 'Buyout rate',

    'stock.title': 'Stock value',
    'stock.subtitle': 'Goods sitting in warehouses',
    'stock.units': '{n} units in stock',
    'stock.fbo': 'Uzum warehouse',
    'stock.fbs': 'Your warehouse',
    'stock.pcs': 'units',
    'stock.hint': 'Valued at cost price — this is your frozen capital.',

    'insights.title': 'Period summary',
    'insights.subtitle': 'What happened in the selected period — in numbers',
    'insights.count': '{n}',
    'insights.view': 'View',
    'insights.empty': 'All good',
    'insights.emptyHint': 'Nothing needs your attention in this period.',
    'insights.kind.stock': 'Stock',
    'insights.kind.loss': 'Loss',
    'insights.kind.illiquid': 'Dead stock',
    'insights.kind.returns': 'Returns',
    'insights.kind.profit': 'Profit',
    'insights.kind.revenue': 'Revenue',
    'insights.kind.margin': 'Margin',
    'insights.kind.buyout': 'Buyout',
    'insights.kind.sync': 'Sync',
    'insights.kind.check': 'Avg check',

    'ptop.title': 'Which product earns the most',
    'ptop.subtitle': 'By net profit over the period',
    'ptop.other': 'Other products',
    'ptop.empty': 'No sales in this period',
    'map.title': 'Margin map',
    'map.subtitle': 'Right — sells more, up — earns more. Dot size: units sold',
    'map.x': 'Revenue',
    'map.y': 'Margin',
    'map.hint':
      'Dots below the line move a lot of money at below-average margin. Revisit their price or cost.',
    'map.empty': 'The map needs at least two sold products',
    'chart.title': 'Trend',
    'chart.subtitle': 'Daily performance',
    'chart.empty': 'Not enough data to draw a chart',
    'chart.prev': 'Previous period',
    'chart.prevRevenue': 'Previous period revenue',
    'metric.revenue': 'Revenue',
    'metric.profit': 'Net profit',
    'metric.orders': 'Orders',
    'metric.units': 'Units',

    'expenses.title': 'Period expenses',
    'expenses.subtitle': 'Where the money went',
    'expenses.total': 'Total',
    'expenses.empty': 'No expenses',
    'expenses.emptyHint': 'No expenses were recorded for the selected period.',

    'stores.title': 'Stores',
    'stores.subtitle': 'Split across {n} stores',
    'stores.empty': 'No stores found',
    'stores.emptyHint': 'Connect an Uzum cabinet — stores appear automatically.',
    'stores.orders': 'Orders: {n}',

    'top.title': 'Top products',
    'top.subtitle': 'Revenue leaders',
    'top.all': 'View all',
    'top.empty': 'No products found',
    'top.emptyHint': 'No sales were recorded in this period.',
    'top.col.product': 'Product',
    'top.col.sold': 'Sold',
    'top.col.revenue': 'Revenue',
    'top.col.profit': 'Profit',
    'top.col.margin': 'Margin',
    'top.col.share': 'Share',

    'empty.title': 'Nothing to show yet',
    'empty.hint':
      'Data is still syncing, or there were no sales in the selected period. Try another period or check the connection.',
    'empty.setup': 'Check connection',
    'empty.periodHint': 'Pick a wider range in the period switcher above.',
    'nosales.title': 'No sales in this period yet',
    'nosales.hint':
      'Your cabinet is connected and {units} units are in stock, but no orders were recorded for the selected period. Revenue, profit and margin will appear here automatically after the first sale.',
    'nosales.cost': 'Enter cost prices',
    'nosales.stocks': 'View stock',
    'nosales.costHint': 'Without cost prices, profit will be calculated incorrectly.',
  },
});

type MetricKey = 'revenue' | 'profit' | 'orders' | 'units';

/** Ro'yxat qatori: nom kesiladi, variant esa yonida va hech qachon kesilmaydi */
function productLabel(r: TopProductRow): { name: string; sub: string } {
  const { name, variant } = splitProductName(r);
  return { name, sub: variant };
}

/**
 * Marja xaritasi nuqtasi: to'liq nom izoh oynasida, qisqasi nuqta yonida.
 * Variant oldinda ("41 · Sport krossovka…") — qisqartirishda u kesilmaydi;
 * ilgari uchta "Sport krossovka R…" bir xil ko'rinardi.
 */
function mapLabel(r: TopProductRow): { name: string; label: string } {
  const { name, variant } = splitProductName(r);
  return variant ? { name: `${name} · ${variant}`, label: `${variant} · ${name}` } : { name, label: name };
}

export default function Dashboard() {
  const t = useT('dashboard');
  const f = useFormat();
  const q = usePeriodQuery();
  const [metric, setMetric] = useState<MetricKey>('revenue');

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ['dashboard', q],
    queryFn: () => api.get<DashboardResponse>('/analytics/dashboard', q),
  });

  // Vazifalar, maqsadlar va qaytarish kartasi o'z so'rovlari bilan — "Yangilash" ularni ham yangilasin
  const qc = useQueryClient();
  const refreshAll = () => {
    void refetch();
    for (const key of [TODAY_QUERY_KEY, GOALS_QUERY_KEY, RETURNS_QUERY_KEY]) {
      void qc.invalidateQueries({ queryKey: [key] });
    }
  };

  const points = data?.series ?? [];

  const chartData = useMemo(
    () =>
      points.map((p) => ({
        date: p.date,
        revenue: p.revenue,
        profit: p.profit,
        orders: p.orders,
        units: p.units,
      })),
    [points],
  );

  const sparks = useMemo(
    () => ({
      revenue: points.map((p) => p.revenue),
      profit: points.map((p) => p.profit),
      orders: points.map((p) => p.orders),
      avgCheck: points.map((p) => (p.orders > 0 ? p.revenue / p.orders : 0)),
    }),
    [points],
  );

  /** Foyda bo'yicha TOP 8, qolgani bitta «Boshqa» qatoriga (o'rinsiz) */
  const topByProfit = useMemo<ProfitRankRow[]>(() => {
    const rows = [...(data?.topProducts ?? [])].filter((r) => r.profit > 0).sort((a, b) => b.profit - a.profit);
    const head = rows.slice(0, 8).map((r, i) => ({ ...productLabel(r), profit: Math.round(r.profit), rank: i + 1 }));
    const tail = rows.slice(8).reduce((sum, r) => sum + r.profit, 0);
    return tail > 0 ? [...head, { name: t('ptop.other'), sub: '', profit: Math.round(tail) }] : head;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.topProducts, t]);

  /** Marja xaritasi: tushum × marja, nuqta kattaligi — dona */
  const marginMap = useMemo(() => {
    const rows = (data?.topProducts ?? []).filter((r) => r.revenue > 0);
    const points = rows.map((r) => ({
      x: Math.round(r.revenue),
      y: Number(r.margin.toFixed(1)),
      z: Math.max(1, r.units),
      ...mapLabel(r),
      sku: r.sku,
    }));
    const totalRevenue = rows.reduce((s2, r) => s2 + r.revenue, 0);
    const totalProfit = rows.reduce((s2, r) => s2 + r.profit, 0);
    // O'rtacha marja — oddiy o'rtacha emas, TUSHUM bo'yicha tortilgan:
    // kichik tovarning katta marjasi qiyoslash chizig'ini surib yubormasin
    const avg = totalRevenue > 0 ? Number(((totalProfit / totalRevenue) * 100).toFixed(1)) : undefined;
    return { points, avg };
  }, [data?.topProducts]);

  const chartSeries: SeriesDef[] = useMemo(() => {
    const revenue: SeriesDef = { key: 'revenue', name: t('metric.revenue'), money: true, color: CHART_COLORS.info };
    // Zarar ko'rilgan kun qizil ustun bo'lib nol chizig'idan pastga tushadi
    const profit: SeriesDef = {
      key: 'profit',
      name: t('metric.profit'),
      money: true,
      color: CHART_COLORS.brand,
      negColor: CHART_COLORS.danger,
    };
    if (metric === 'revenue') return [revenue, profit];
    if (metric === 'profit') return [profit];
    if (metric === 'orders') return [{ key: 'orders', name: t('metric.orders'), color: CHART_COLORS.info }];
    // Dona — hajm ko'rsatkichi, buyurtmalar bilan bir rangda. Ilgari sariq (warn) edi,
    // u esa sahifada "kutilayotgan pul / xavf" ma'nosida band
    return [{ key: 'units', name: t('metric.units'), color: CHART_COLORS.info }];
  }, [metric, t]);

  /*
   * Oldingi teng davr — tanlangan ko'rsatkich bo'yicha uzuq chiziq. Server
   * uni joriy seriya bilan bir ta'rifda beradi (foyda davr xarajatlaridan
   * keyin), jami esa KPI'dagi "oldingi" bilan teng. Tarix yetmasa null —
   * chiziq chizilmaydi, nol chiziq "o'sish" deb o'qilmasin.
   */
  const compare = useMemo<CompareDef | null>(() => {
    const prev = data?.previousSeries;
    if (!prev?.length) return null;
    return {
      rows: prev.map((p) => ({ date: p.date, revenue: p.revenue, profit: p.profit, orders: p.orders, units: p.units })),
      key: metric,
      // "Tushum" rejimida grafikda foyda ham bor — chiziq qaysi biri ekani nomida
      name: metric === 'revenue' ? t('chart.prevRevenue') : t('chart.prev'),
    };
  }, [data?.previousSeries, metric, t]);

  const header = (
    <PageHeader
      icon={<LayoutDashboard className="h-5 w-5" />}
      title={t('title')}
      description={
        data ? `${f.date(data.period.from)} — ${f.date(data.period.to)}` : t('subtitle')
      }
      // Raqamlar qanchalik yangi va tannarx qanchasida bor — har raqamning konteksti
      meta={
        <>
          <DataFreshness />
          <CostCoverage />
          {data?.comparePeriod ? <ComparePeriodChip period={data.comparePeriod} /> : null}
        </>
      }
      actions={
        <IconButton label={t('refresh')} onClick={refreshAll} disabled={isFetching}>
          <RefreshCw className={cn('h-4 w-4', isFetching && 'animate-spin')} />
        </IconButton>
      }
    />
  );

  if (isLoading) {
    return (
      <>
        {header}
        <FilterBar />
        {/* Tayyor sahifa bilan bir xil tartib va bo'shliqlar — ma'lumot kelganda sahifa sakramasin */}
        <div className="space-y-4 xl:space-y-5">
          <div className="grid gap-4 xl:grid-cols-3 xl:gap-5">
            <Skeleton className="h-[400px] w-full rounded-2xl xl:col-span-2" />
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1 xl:gap-5">
              <Skeleton className="h-[190px] w-full rounded-2xl" />
              <Skeleton className="h-[190px] w-full rounded-2xl" />
            </div>
          </div>
          {/* Bugungi vazifalar va oylik maqsadlar qatori */}
          <div className="grid gap-4 xl:grid-cols-3 xl:gap-5">
            <Skeleton className="h-[372px] w-full rounded-2xl xl:col-span-2" />
            <Skeleton className="h-[372px] w-full rounded-2xl" />
          </div>
          <InsightsBlock items={[]} loading />
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 xl:gap-5">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className={cn('h-[400px] w-full rounded-2xl', i === 2 && 'md:col-span-2 xl:col-span-1')} />
            ))}
          </div>
          <Skeleton className="h-[440px] w-full rounded-2xl" />
        </div>
      </>
    );
  }

  if (isError || !data) {
    return (
      <>
        {header}
        <FilterBar />
        <Card>
          <ErrorState
            message={error instanceof ApiError ? error.message : (error as Error | null)?.message}
            onRetry={() => void refetch()}
          />
        </Card>
      </>
    );
  }

  const hasSales = data.revenue.value > 0 || data.ordersCount.value > 0;
  const hasStock = data.stockValue.units > 0;

  // To'liq bo'sh ekran faqat hech narsa sinxronlanmagan holatda ko'rsatiladi.
  // Qoldiq bor, lekin sotuv yo'q bo'lsa — oddiy panel nollar bilan chiqadi.
  if (!hasSales && !hasStock) {
    return (
      <>
        {header}
        <FilterBar />
        <Card>
          <EmptyState
            icon={<Rocket className="h-6 w-6" />}
            title={t('empty.title')}
            hint={t('empty.hint')}
            action={
              <div className="flex flex-col items-center gap-3">
                <Link to="/onboarding">
                  <Button icon={<Rocket className="h-4 w-4" />}>{t('empty.setup')}</Button>
                </Link>
                <p className="max-w-xs text-xs text-muted">{t('empty.periodHint')}</p>
              </div>
            }
          />
        </Card>
      </>
    );
  }

  // Bitta do'konda "Do'konlar" kartochkasi bitta 100% qatordan iborat bo'lardi — ko'rsatmaymiz
  const showStores = data.storesBreakdown.length > 1;
  const prevOrders = data.ordersCount.previous;

  return (
    <>
      {header}
      <FilterBar />

      {/* Bo'shliq hamma joyda bir xil: telefonda 16px, katta ekranda 20px (qatorlar orasi ham, ichi ham) */}
      <div className="space-y-4 xl:space-y-5">
        {/* Qoldiq bor, sotuv yo'q — nima qilish kerakligini aytamiz */}
        {!hasSales ? (
          <Card tone="info" className="p-5">
            <div className="flex flex-wrap gap-4">
              <span className="icon-tile h-10 w-10 rounded-xl [&_svg]:h-5 [&_svg]:w-5" aria-hidden>
                <PackageSearch />
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-display text-base font-bold text-ink">{t('nosales.title')}</p>
                <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted">
                  {t('nosales.hint', { units: f.num(data.stockValue.units) })}
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <Link to="/cost-price">
                    <Button size="sm" variant="soft" icon={<Tag className="h-3.5 w-3.5" />}>
                      {t('nosales.cost')}
                    </Button>
                  </Link>
                  <Link to="/stocks">
                    <Button size="sm" variant="outline">
                      {t('nosales.stocks')}
                    </Button>
                  </Link>
                  <span className="text-xs text-muted">{t('nosales.costHint')}</span>
                </div>
              </div>
            </div>
          </Card>
        ) : null}

        {/*
          1. Pul oqimi — sahifaning yagona HeroCard'i. Tushum va sof foyda
          shu yerda; o'ngda faqat ular bilan takrorlanmaydigan ikki ko'rsatkich.
          Ikkalasi ham hajm (sotuv) ko'rsatkichi — grafikdagi tushum kabi ko'k;
          ilgari o'rtacha chek sariq edi, sariq esa "kutilayotgan pul / xavf".
        */}
        <div className="grid gap-4 xl:grid-cols-3 xl:gap-5">
          <MoneyFlow
            className="xl:col-span-2"
            data={data}
            footer={
              (data.expenses.periodOnly ?? 0) > 0 ? (
                <span title={t('kpi.operatingHint')}>
                  {t('kpi.operating', {
                    item: f.money(data.itemProfit ?? data.netProfit.value, data.currency),
                    exp: f.money(data.expenses.periodOnly ?? 0, data.currency),
                  })}
                </span>
              ) : undefined
            }
          />
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1 xl:gap-5">
            <StatCard
              label={t('kpi.orders')}
              value={f.num(data.ordersCount.value)}
              delta={data.ordersCount.deltaPct}
              previous={prevOrders !== null ? f.num(prevOrders) : undefined}
              hint={t('kpi.ordersHint', { v: f.num(data.unitsSold.value) })}
              icon={<ShoppingCart />}
              spark={sparks.orders}
              tone="info"
            />
            <StatCard
              label={t('kpi.avgCheck')}
              value={f.money(data.avgCheck.value, data.currency)}
              delta={data.avgCheck.deltaPct}
              // Oldingi davrda buyurtma bo'lmasa o'rtacha chek yo'q — "0 so'm" emas.
              // Ixcham ("436 ming"): to'liq summa sparkline yonida ikkinchi qatorga tushardi
              previous={
                (prevOrders ?? 0) > 0 && data.avgCheck.previous !== null ? f.compact(data.avgCheck.previous) : undefined
              }
              hint={t('kpi.avgCheckHint')}
              icon={<ReceiptText />}
              spark={sparks.avgCheck}
              tone="info"
            />
          </div>
        </div>

        {/*
          2. Bugun nima qilish kerak (2/3) va oylik maqsadlar (1/3) — birinchi
          ekranda. Ikkalasi ham davr tanlagichiga bog'liq emas: vazifalar bugungi
          kun uchun, maqsadlar joriy oy uchun.
        */}
        <PlanGate feature="dashboard_realtime">
          <div className="grid gap-4 xl:grid-cols-3 xl:gap-5">
            <TodayTasks className="xl:col-span-2" />
            <GoalsCard />
          </div>
        </PlanGate>

        {/* 3. Davr xulosalari — tanlangan davrda nima bo'ldi (vazifalardan farqli, davrga bog'liq) */}
        <PlanGate feature="dashboard_realtime">
          <InsightsBlock items={data.insights} />
        </PlanGate>

        {/*
          4. To'lovlar / marja va ROI / qoldiq qiymati. 1024px da uchta ustun
          ~230px bo'lib qolardi — o'rtada ikki ustun, uchinchisi butun qator.
        */}
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 xl:gap-5">
          <PayoutsCard data={data} />
          <MarginRoiCard data={data} />
          <StockValueCard data={data} className="md:col-span-2 xl:col-span-1" />
        </div>

        {/* 5. Asosiy grafik — oldingi teng davr uzuq chiziq bilan */}
        <ChartCard
          icon={<BarChart3 />}
          title={t('chart.title')}
          subtitle={t('chart.subtitle')}
          actions={
            <Segmented<MetricKey>
              size="sm"
              value={metric}
              onChange={setMetric}
              options={[
                { value: 'revenue', label: t('metric.revenue') },
                { value: 'profit', label: t('metric.profit') },
                { value: 'orders', label: t('metric.orders') },
                { value: 'units', label: t('metric.units') },
              ]}
            />
          }
        >
          {chartData.length > 1 ? (
            <TrendChart data={chartData} series={chartSeries} height={320} variant="bars" compare={compare} />
          ) : (
            <EmptyState
              className="py-16"
              icon={<TrendingUp className="h-6 w-6" />}
              title={t('chart.empty')}
              hint={t('empty.periodHint')}
            />
          )}
        </ChartCard>

        {/* 6. Qaysi tovar foyda keltiryapti va marja xaritasi */}
        <div className="grid gap-4 xl:grid-cols-2 xl:gap-5">
          <ChartCard icon={<Coins />} title={t('ptop.title')} subtitle={t('ptop.subtitle')}>
            {topByProfit.length > 0 ? (
              <ProfitRankList rows={topByProfit} />
            ) : (
              <EmptyState className="py-12" icon={<TrendingUp className="h-6 w-6" />} title={t('ptop.empty')} />
            )}
          </ChartCard>

          <ChartCard icon={<Target />} title={t('map.title')} subtitle={t('map.subtitle')}>
            {marginMap.points.length > 1 ? (
              <>
                <MarginMap points={marginMap.points} avg={marginMap.avg} xLabel={t('map.x')} yLabel={t('map.y')} />
                <p className="mt-3 border-t border-line pt-3 text-xs leading-relaxed text-muted">{t('map.hint')}</p>
              </>
            ) : (
              <EmptyState className="py-12" icon={<TrendingUp className="h-6 w-6" />} title={t('map.empty')} />
            )}
          </ChartCard>
        </div>

        {/*
          7. Xarajatlar (2/3), o'ngda qaytarish va bekor qilish kartasi va (bir
          nechta do'kon bo'lsa) do'konlar — ustunlar tepadagi uchlik qator bilan
          bir chiziqda.
        */}
        <div className="grid gap-4 xl:grid-cols-3 xl:gap-5">
          <ExpensesCard data={data} className="xl:col-span-2" />
          <div className="grid content-start gap-4 xl:gap-5">
            <ReturnsCard />
            {showStores ? <StoresCard data={data} /> : null}
          </div>
        </div>

        {/* 8. Top mahsulotlar */}
        <TopProductsCard rows={data.topProducts} />
      </div>
    </>
  );
}
