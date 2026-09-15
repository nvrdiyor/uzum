import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  BadgePercent,
  Bookmark,
  BookmarkPlus,
  Boxes,
  Calculator as CalculatorIcon,
  Coins,
  LineChart as LineChartIcon,
  PieChart as PieChartIcon,
  Receipt,
  RotateCcw,
  Target,
  Trash2,
  TrendingUp,
  Truck,
  Warehouse,
} from 'lucide-react';
import {
  calcUnitEconomics,
  type ProductsResponse,
  type UnitCalcInput,
  type UnitCalcResult,
} from '@savdoiq/shared';
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  ErrorState,
  IconButton,
  Input,
  Modal,
  PageHeader,
  PlanGate,
  PreviewBadge,
  Select,
  Skeleton,
  toast,
} from '@/components/ui';
import { ChartCard, DonutChart, LinesChart } from '@/components/charts';
import { NumberField } from '@/components/unit/NumberField';
import {
  DEFAULT_INPUT,
  PART_COLOR,
  PRICE_STEPS,
  mergeInput,
  normalizeScenarios,
  type UnitDefaultsResponse,
} from '@/components/unit/types';
import { api } from '@/lib/api';
import { usePeriodQuery } from '@/store/ui';
import { registerNamespace, useFormat, useT } from '@/i18n';
import { cn } from '@/lib/utils';

registerNamespace('calculator', {
  uz: {
    title: 'Unit kalkulyator',
    subtitle: 'Sotishdan oldin bitta donaning iqtisodini hisoblab ko‘ring',
    'sku.label': 'Mahsulot (SKU)',
    'sku.manual': 'Qo‘lda kiritish',
    'sku.hint': 'SKU tanlansa, narx va tannarx sizning ma’lumotlaringizdan to‘ldiriladi',
    'sku.loaded': 'SKU ma’lumotlari yuklandi',
    'section.price': 'Narx va tannarx',
    'section.priceHint': 'Asosiy raqamlar — qolgan hammasi shulardan hisoblanadi',
    'section.market': 'Marketpleys xarajatlari',
    'section.marketHint': 'Uzum ushlab qoladigan va ombor bilan bog‘liq xarajatlar',
    'section.extra': 'Qo‘shimcha xarajat va soliq',
    'section.extraHint': 'Qadoqlash, boshqa xarajatlar va soliq stavkasi',
    'section.batch': 'Sotib olish va partiya',
    'section.batchHint': 'Qaytarishlar va partiya hajmi natijaga sezilarli ta’sir qiladi',
    'fld.price': 'Sotuv narxi',
    'fld.priceHint': 'Xaridor to‘laydigan narx (chegirmadan keyin)',
    'fld.cost': 'Tannarx',
    'fld.costHint': 'Mahsulotning sizga tushgan xarid narxi (1 dona)',
    'fld.commission': 'Komissiya',
    'fld.commissionHint': 'Uzum ushlab qoladigan foiz — kategoriyaga qarab odatda 8–20%',
    'fld.logistics': 'Logistika',
    'fld.logisticsHint': 'Bitta donani yetkazish narxi',
    'fld.storagePerDay': 'Saqlash (kuniga)',
    'fld.storagePerDayHint': 'Omborda 1 dona uchun kunlik saqlash haqi',
    'fld.storageDays': 'Saqlash kunlari',
    'fld.storageDaysHint': 'Tovar sotilguncha omborda necha kun turadi',
    'fld.packaging': 'Qadoqlash',
    'fld.packagingHint': 'Quti, plyonka, yorliq va shu kabi xarajatlar',
    'fld.other': 'Boshqa xarajat',
    'fld.otherHint': 'Reklama, ishchi kuchi va boshqa qo‘shimchalar (1 dona)',
    'fld.tax': 'Soliq',
    'fld.taxHint': 'Aylanmadan olinadigan soliq stavkasi',
    'fld.buyout': 'Sotib olish ulushi',
    'fld.buyoutHint': 'Yetkazilgan buyurtmalarning necha foizi qaytarilmaydi',
    'fld.returnLogistics': 'Qaytarish logistikasi',
    'fld.returnLogisticsHint': 'Qaytgan bitta dona uchun qo‘shimcha xarajat',
    'fld.qty': 'Miqdor',
    'fld.qtyHint': 'Partiyadagi dona soni — butun partiya hisobi shundan chiqadi',
    'unit.som': 'so‘m',
    'unit.pct': '%',
    'unit.days': 'kun',
    'unit.pcs': 'dona',
    'res.title': 'Natija',
    'res.profit': 'Sof foyda (1 dona)',
    'res.batchProfit': 'Butun partiya: {v}',
    'res.loss': 'Zarar',
    'res.ok': 'Foydali',
    'res.margin': 'Marja',
    'res.roi': 'ROI',
    'res.markup': 'Ustama',
    'res.breakEven': 'Nol foyda narxi',
    'res.breakEvenHint': 'Shu narxdan pastda sotish zarar keltiradi',
    'res.split': 'Xarajatlar taqsimoti',
    'res.splitHint': 'Butun partiya bo‘yicha',
    'res.costTotal': 'Jami xarajat',
    'res.revenue': 'Tushum',
    'res.cogs': 'Tannarx',
    'res.commission': 'Komissiya',
    'res.logistics': 'Logistika',
    'res.storage': 'Ombor',
    'res.other': 'Qadoqlash va boshqa',
    'res.tax': 'Soliq',
    'res.net': 'Sof foyda',
    'res.table': 'Hisob-kitob',
    'res.perUnit': '1 dona',
    'res.batch': 'Butun partiya',
    'sens.title': 'Narx sezgirligi',
    'sens.subtitle': 'Narxni o‘zgartirsangiz foyda va marja qanday o‘zgaradi',
    'sens.change': 'O‘zgarish',
    'sens.price': 'Narx',
    'sens.profit': 'Foyda (1 dona)',
    'sens.margin': 'Marja',
    'sens.current': 'Joriy',
    'sc.title': 'Ssenariylar',
    'sc.subtitle': 'Hisobni saqlab qo‘ying va keyin taqqoslang',
    'sc.save': 'Ssenariyni saqlash',
    'sc.name': 'Ssenariy nomi',
    'sc.placeholder': 'Masalan: Qishki partiya, chegirmali narx',
    'sc.empty': 'Saqlangan ssenariy yo‘q',
    'sc.emptyHint': 'Joriy hisobni saqlab qo‘ying — keyin bir bosishda qaytarasiz',
    'sc.load': 'Yuklash',
    'sc.saved': 'Ssenariy saqlandi',
    'sc.saveErr': 'Saqlab bo‘lmadi',
    'sc.deleted': 'Ssenariy o‘chirildi',
    'sc.deleteErr': 'O‘chirib bo‘lmadi',
    'sc.loadedMsg': 'Ssenariy yuklandi',
    'sc.nameRequired': 'Nom kiriting',
    'btn.reset': 'Tozalash',
    'reset.done': 'Standart qiymatlar tiklandi',
  },
  ru: {
    title: 'Юнит-калькулятор',
    subtitle: 'Посчитайте экономику одной единицы до старта продаж',
    'sku.label': 'Товар (SKU)',
    'sku.manual': 'Ввести вручную',
    'sku.hint': 'При выборе SKU цена и себестоимость подставятся из ваших данных',
    'sku.loaded': 'Данные SKU загружены',
    'section.price': 'Цена и себестоимость',
    'section.priceHint': 'Базовые цифры — от них считается всё остальное',
    'section.market': 'Расходы маркетплейса',
    'section.marketHint': 'Что удерживает Uzum и сколько стоит хранение',
    'section.extra': 'Доп. расходы и налог',
    'section.extraHint': 'Упаковка, прочие расходы и налоговая ставка',
    'section.batch': 'Выкуп и партия',
    'section.batchHint': 'Возвраты и объём партии заметно влияют на итог',
    'fld.price': 'Цена продажи',
    'fld.priceHint': 'Цена, которую платит покупатель (после скидки)',
    'fld.cost': 'Себестоимость',
    'fld.costHint': 'Закупочная цена товара (за 1 шт.)',
    'fld.commission': 'Комиссия',
    'fld.commissionHint': 'Процент маркетплейса — обычно 8–20% по категории',
    'fld.logistics': 'Логистика',
    'fld.logisticsHint': 'Стоимость доставки одной единицы',
    'fld.storagePerDay': 'Хранение (в день)',
    'fld.storagePerDayHint': 'Плата за хранение 1 шт. в сутки',
    'fld.storageDays': 'Дней хранения',
    'fld.storageDaysHint': 'Сколько дней товар лежит на складе до продажи',
    'fld.packaging': 'Упаковка',
    'fld.packagingHint': 'Коробка, плёнка, этикетка и подобное',
    'fld.other': 'Прочие расходы',
    'fld.otherHint': 'Реклама, труд и другие добавки (на 1 шт.)',
    'fld.tax': 'Налог',
    'fld.taxHint': 'Ставка налога с оборота',
    'fld.buyout': 'Процент выкупа',
    'fld.buyoutHint': 'Какая доля доставленных заказов не возвращается',
    'fld.returnLogistics': 'Логистика возврата',
    'fld.returnLogisticsHint': 'Доп. расход за одну возвращённую единицу',
    'fld.qty': 'Количество',
    'fld.qtyHint': 'Штук в партии — из этого считается итог по партии',
    'unit.som': 'сум',
    'unit.pct': '%',
    'unit.days': 'дн.',
    'unit.pcs': 'шт.',
    'res.title': 'Результат',
    'res.profit': 'Чистая прибыль (1 шт.)',
    'res.batchProfit': 'Вся партия: {v}',
    'res.loss': 'Убыток',
    'res.ok': 'Прибыльно',
    'res.margin': 'Маржа',
    'res.roi': 'ROI',
    'res.markup': 'Наценка',
    'res.breakEven': 'Точка безубыточности',
    'res.breakEvenHint': 'Ниже этой цены продажа приносит убыток',
    'res.split': 'Распределение расходов',
    'res.splitHint': 'По всей партии',
    'res.costTotal': 'Всего расходов',
    'res.revenue': 'Выручка',
    'res.cogs': 'Себестоимость',
    'res.commission': 'Комиссия',
    'res.logistics': 'Логистика',
    'res.storage': 'Хранение',
    'res.other': 'Упаковка и прочее',
    'res.tax': 'Налог',
    'res.net': 'Чистая прибыль',
    'res.table': 'Расчёт',
    'res.perUnit': '1 шт.',
    'res.batch': 'Вся партия',
    'sens.title': 'Чувствительность к цене',
    'sens.subtitle': 'Как меняются прибыль и маржа при изменении цены',
    'sens.change': 'Изменение',
    'sens.price': 'Цена',
    'sens.profit': 'Прибыль (1 шт.)',
    'sens.margin': 'Маржа',
    'sens.current': 'Текущая',
    'sc.title': 'Сценарии',
    'sc.subtitle': 'Сохраните расчёт и сравнивайте варианты',
    'sc.save': 'Сохранить сценарий',
    'sc.name': 'Название сценария',
    'sc.placeholder': 'Например: Зимняя партия, цена со скидкой',
    'sc.empty': 'Сохранённых сценариев нет',
    'sc.emptyHint': 'Сохраните текущий расчёт — вернётесь к нему в один клик',
    'sc.load': 'Загрузить',
    'sc.saved': 'Сценарий сохранён',
    'sc.saveErr': 'Не удалось сохранить',
    'sc.deleted': 'Сценарий удалён',
    'sc.deleteErr': 'Не удалось удалить',
    'sc.loadedMsg': 'Сценарий загружен',
    'sc.nameRequired': 'Введите название',
    'btn.reset': 'Сбросить',
    'reset.done': 'Значения по умолчанию восстановлены',
  },
  en: {
    title: 'Unit calculator',
    subtitle: 'Work out the economics of a single unit before you start selling',
    'sku.label': 'Product (SKU)',
    'sku.manual': 'Enter manually',
    'sku.hint': 'Pick a SKU and the price and cost are filled in from your own data',
    'sku.loaded': 'SKU data loaded',
    'section.price': 'Price and cost',
    'section.priceHint': 'The base numbers — everything else is derived from them',
    'section.market': 'Marketplace costs',
    'section.marketHint': 'What Uzum keeps and what storage costs you',
    'section.extra': 'Extra costs and tax',
    'section.extraHint': 'Packaging, other costs and the tax rate',
    'section.batch': 'Buyout and batch',
    'section.batchHint': 'Returns and batch size change the result noticeably',
    'fld.price': 'Selling price',
    'fld.priceHint': 'What the buyer pays (after discounts)',
    'fld.cost': 'Cost price',
    'fld.costHint': 'What one unit costs you to buy',
    'fld.commission': 'Commission',
    'fld.commissionHint': 'Marketplace fee — usually 8–20% depending on the category',
    'fld.logistics': 'Logistics',
    'fld.logisticsHint': 'Delivery cost of a single unit',
    'fld.storagePerDay': 'Storage (per day)',
    'fld.storagePerDayHint': 'Daily warehouse fee for one unit',
    'fld.storageDays': 'Days in storage',
    'fld.storageDaysHint': 'How long a unit sits in the warehouse before it sells',
    'fld.packaging': 'Packaging',
    'fld.packagingHint': 'Box, film, label and similar costs',
    'fld.other': 'Other costs',
    'fld.otherHint': 'Ads, labour and other extras (per unit)',
    'fld.tax': 'Tax',
    'fld.taxHint': 'Turnover tax rate',
    'fld.buyout': 'Buyout rate',
    'fld.buyoutHint': 'Share of delivered orders that is not returned',
    'fld.returnLogistics': 'Return logistics',
    'fld.returnLogisticsHint': 'Extra cost for one returned unit',
    'fld.qty': 'Quantity',
    'fld.qtyHint': 'Units in the batch — the batch totals come from this',
    'unit.som': 'UZS',
    'unit.pct': '%',
    'unit.days': 'days',
    'unit.pcs': 'pcs',
    'res.title': 'Result',
    'res.profit': 'Net profit (1 unit)',
    'res.batchProfit': 'Whole batch: {v}',
    'res.loss': 'Loss',
    'res.ok': 'Profitable',
    'res.margin': 'Margin',
    'res.roi': 'ROI',
    'res.markup': 'Markup',
    'res.breakEven': 'Break-even price',
    'res.breakEvenHint': 'Selling below this price makes a loss',
    'res.split': 'Cost breakdown',
    'res.splitHint': 'For the whole batch',
    'res.costTotal': 'Total costs',
    'res.revenue': 'Revenue',
    'res.cogs': 'Cost of goods',
    'res.commission': 'Commission',
    'res.logistics': 'Logistics',
    'res.storage': 'Storage',
    'res.other': 'Packaging and other',
    'res.tax': 'Tax',
    'res.net': 'Net profit',
    'res.table': 'Breakdown',
    'res.perUnit': '1 unit',
    'res.batch': 'Whole batch',
    'sens.title': 'Price sensitivity',
    'sens.subtitle': 'How profit and margin move when you change the price',
    'sens.change': 'Change',
    'sens.price': 'Price',
    'sens.profit': 'Profit (1 unit)',
    'sens.margin': 'Margin',
    'sens.current': 'Current',
    'sc.title': 'Scenarios',
    'sc.subtitle': 'Save a calculation and compare the options',
    'sc.save': 'Save scenario',
    'sc.name': 'Scenario name',
    'sc.placeholder': 'For example: winter batch, discounted price',
    'sc.empty': 'No saved scenarios',
    'sc.emptyHint': 'Save the current calculation and bring it back in one click',
    'sc.load': 'Load',
    'sc.saved': 'Scenario saved',
    'sc.saveErr': 'Could not save',
    'sc.deleted': 'Scenario deleted',
    'sc.deleteErr': 'Could not delete',
    'sc.loadedMsg': 'Scenario loaded',
    'sc.nameRequired': 'Enter a name',
    'btn.reset': 'Reset',
    'reset.done': 'Default values restored',
  },
});

interface SkuOption {
  id: string;
  label: string;
}

interface BreakdownRow {
  key: string;
  label: string;
  value: number;
  /** Qalin qatorlar: tushum, jami xarajat, sof foyda */
  strong?: boolean;
  net?: boolean;
}

export default function Calculator() {
  const t = useT('calculator');
  const f = useFormat();
  const qc = useQueryClient();
  const periodQuery = usePeriodQuery();
  const [params, setParams] = useSearchParams();

  const skuId = params.get('skuId') ?? '';

  /** Formadagi joriy qiymatlar (har bosishda yangilanadi) */
  const [draft, setDraft] = useState<UnitCalcInput>(DEFAULT_INPUT);
  /** Hisob uchun kechiktirilgan qiymatlar (300ms) */
  const [input, setInput] = useState<UnitCalcInput>(DEFAULT_INPUT);
  const [saveOpen, setSaveOpen] = useState(false);
  const [name, setName] = useState('');

  useEffect(() => {
    const id = setTimeout(() => setInput(draft), 300);
    return () => clearTimeout(id);
  }, [draft]);

  const patch = (key: keyof UnitCalcInput, value: number) => setDraft((d) => ({ ...d, [key]: value }));

  // ── SKU ro'yxati ──
  const products = useQuery({
    queryKey: ['calc-products', periodQuery],
    queryFn: () => api.get<ProductsResponse>('/products', { ...periodQuery, page: 1, pageSize: 100 }),
  });

  const skuOptions: SkuOption[] = useMemo(() => {
    const items = products.data?.items.items ?? [];
    return items.flatMap((p) =>
      p.skus.map((s) => ({ id: s.id, label: `${s.title || p.title} · ${s.sku}` })),
    );
  }, [products.data]);

  // ── SKU standart qiymatlari ──
  const defaults = useQuery({
    queryKey: ['unit-defaults', skuId],
    queryFn: () => api.get<UnitDefaultsResponse>('/unit/defaults', { skuId }),
    enabled: Boolean(skuId),
  });

  useEffect(() => {
    if (!defaults.data) return;
    /**
     * Server barcha raqamlarni `input` ichida qaytaradi
     * (`{ skuId, sku, title, input: {...}, result, skus, source }`).
     * Ilgari yuqori darajadagi kalitlar o'qilgani uchun SKU tanlansa ham forma
     * namunaviy 150 000 / 70 000 bilan qolib ketardi — sotuvchi o'z tovarining
     * emas, o'ylab topilgan tovarning iqtisodini ko'rardi.
     */
    const values = defaults.data.input ?? defaults.data;
    setDraft((d) => mergeInput(d, values));
    setInput((d) => mergeInput(d, values));
  }, [defaults.data]);

  // ── Mahalliy hisob ──
  const result = useMemo<UnitCalcResult>(() => calcUnitEconomics(input), [input]);
  const qty = Math.max(1, input.qty || 1);
  const otherTotal = Math.max(
    0,
    result.costTotal -
      (result.commission + result.logisticsTotal + result.storageTotal + result.cogs + result.tax),
  );
  const profitable = result.netProfit >= 0;

  const donutData = useMemo(
    () => [
      { name: t('res.cogs'), value: result.cogs, color: PART_COLOR.cogs },
      { name: t('res.commission'), value: result.commission, color: PART_COLOR.commission },
      { name: t('res.logistics'), value: result.logisticsTotal, color: PART_COLOR.logistics },
      { name: t('res.storage'), value: result.storageTotal, color: PART_COLOR.storage },
      { name: t('res.other'), value: otherTotal, color: PART_COLOR.other },
      { name: t('res.tax'), value: result.tax, color: PART_COLOR.tax },
    ],
    [result, otherTotal, t],
  );

  const breakdown = useMemo<BreakdownRow[]>(
    () => [
      { key: 'revenue', label: t('res.revenue'), value: result.revenue, strong: true },
      { key: 'cogs', label: t('res.cogs'), value: result.cogs },
      { key: 'commission', label: t('res.commission'), value: result.commission },
      { key: 'logistics', label: t('res.logistics'), value: result.logisticsTotal },
      { key: 'storage', label: t('res.storage'), value: result.storageTotal },
      { key: 'other', label: t('res.other'), value: otherTotal },
      { key: 'tax', label: t('res.tax'), value: result.tax },
      { key: 'costTotal', label: t('res.costTotal'), value: result.costTotal, strong: true },
      { key: 'net', label: t('res.net'), value: result.netProfit, strong: true, net: true },
    ],
    [result, otherTotal, t],
  );

  // ── Narx sezgirligi ──
  const sensitivity = useMemo(
    () =>
      PRICE_STEPS.map((step) => {
        const price = Math.round(input.price * (1 + step / 100));
        const r = calcUnitEconomics({ ...input, price });
        return {
          step,
          label: `${step > 0 ? '+' : ''}${step}%`,
          price,
          profit: r.netProfitPerUnit,
          margin: r.margin,
          total: r.netProfit,
        };
      }),
    [input],
  );

  // ── Ssenariylar ──
  const scenarios = useQuery({
    queryKey: ['unit-scenarios'],
    queryFn: async () => normalizeScenarios(await api.get<unknown>('/unit/scenarios')),
  });

  const saveScenario = useMutation({
    // API tomonida sxema `{ name, ...input }` yoki `{ name, input }` bo'lishi mumkin — ikkalasini yuboramiz
    mutationFn: (scenarioName: string) =>
      api.post<unknown>('/unit/scenarios', { ...input, name: scenarioName, input, data: input }),
    onSuccess: () => {
      toast.success(t('sc.saved'));
      setSaveOpen(false);
      setName('');
      void qc.invalidateQueries({ queryKey: ['unit-scenarios'] });
    },
    onError: (err: unknown) => toast.error(t('sc.saveErr'), err instanceof Error ? err.message : undefined),
  });

  const removeScenario = useMutation({
    mutationFn: (id: string) => api.del<unknown>(`/unit/scenarios/${id}`),
    onSuccess: () => {
      toast.success(t('sc.deleted'));
      void qc.invalidateQueries({ queryKey: ['unit-scenarios'] });
    },
    onError: (err: unknown) => toast.error(t('sc.deleteErr'), err instanceof Error ? err.message : undefined),
  });

  const applyInput = (next: UnitCalcInput) => {
    setDraft(next);
    setInput(next);
  };

  const onSelectSku = (id: string) => {
    const next = new URLSearchParams(params);
    if (id) next.set('skuId', id);
    else next.delete('skuId');
    setParams(next, { replace: true });
  };

  const onReset = () => {
    onSelectSku('');
    applyInput(DEFAULT_INPUT);
    toast.info(t('reset.done'));
  };

  return (
    <>
      <PageHeader
        icon={<CalculatorIcon className="h-5 w-5" />}
        title={t('title')}
        description={t('subtitle')}
        badge={<PreviewBadge feature="unit_calculator" />}
        actions={
          <>
            <Button variant="outline" icon={<RotateCcw className="h-4 w-4" />} onClick={onReset}>
              {t('btn.reset')}
            </Button>
            <Button icon={<BookmarkPlus className="h-4 w-4" />} onClick={() => setSaveOpen(true)}>
              {t('sc.save')}
            </Button>
          </>
        }
      />

      <PlanGate feature="unit_calculator">
        <div className="space-y-5">
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_360px] xl:grid-cols-[minmax(0,1fr)_400px]">
            {/* ── Chap ustun: forma ── */}
            <div className="space-y-4">
              <Card>
                <CardHeader
                  icon={<Boxes className="h-4 w-4" />}
                  title={t('sku.label')}
                  subtitle={t('sku.hint')}
                />
                <CardBody className="pt-4">
                  {products.isLoading ? (
                    <Skeleton className="h-11 w-full" />
                  ) : (
                    <Select value={skuId} onChange={(e) => onSelectSku(e.target.value)}>
                      <option value="">{t('sku.manual')}</option>
                      {skuOptions.map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.label}
                        </option>
                      ))}
                    </Select>
                  )}
                  {defaults.isFetching ? (
                    <p className="mt-2 text-xs text-muted">{t('common.loading')}</p>
                  ) : defaults.data ? (
                    <p className="mt-2 text-xs text-brand">{t('sku.loaded')}</p>
                  ) : null}
                </CardBody>
              </Card>

              <Card>
                <CardHeader
                  icon={<Coins className="h-4 w-4" />}
                  title={t('section.price')}
                  subtitle={t('section.priceHint')}
                />
                <CardBody className="grid grid-cols-1 gap-4 pt-4 sm:grid-cols-2">
                  <NumberField
                    label={t('fld.price')}
                    hint={t('fld.priceHint')}
                    suffix={t('unit.som')}
                    value={draft.price}
                    step={1000}
                    tone="brand"
                    onChange={(v) => patch('price', v)}
                  />
                  <NumberField
                    label={t('fld.cost')}
                    hint={t('fld.costHint')}
                    suffix={t('unit.som')}
                    value={draft.purchasePrice}
                    step={1000}
                    onChange={(v) => patch('purchasePrice', v)}
                  />
                </CardBody>
              </Card>

              <Card>
                <CardHeader
                  icon={<Truck className="h-4 w-4" />}
                  title={t('section.market')}
                  subtitle={t('section.marketHint')}
                />
                <CardBody className="grid grid-cols-1 gap-4 pt-4 sm:grid-cols-2">
                  <NumberField
                    label={t('fld.commission')}
                    hint={t('fld.commissionHint')}
                    suffix={t('unit.pct')}
                    value={draft.commissionPct}
                    min={0}
                    max={100}
                    step={0.5}
                    icon={<BadgePercent className="h-3.5 w-3.5" />}
                    onChange={(v) => patch('commissionPct', v)}
                  />
                  <NumberField
                    label={t('fld.logistics')}
                    hint={t('fld.logisticsHint')}
                    suffix={t('unit.som')}
                    value={draft.logistics}
                    step={500}
                    onChange={(v) => patch('logistics', v)}
                  />
                  <NumberField
                    label={t('fld.storagePerDay')}
                    hint={t('fld.storagePerDayHint')}
                    suffix={t('unit.som')}
                    value={draft.storagePerDay}
                    step={50}
                    icon={<Warehouse className="h-3.5 w-3.5" />}
                    onChange={(v) => patch('storagePerDay', v)}
                  />
                  <NumberField
                    label={t('fld.storageDays')}
                    hint={t('fld.storageDaysHint')}
                    suffix={t('unit.days')}
                    value={draft.storageDays}
                    min={0}
                    max={365}
                    step={1}
                    onChange={(v) => patch('storageDays', v)}
                  />
                </CardBody>
              </Card>

              <Card>
                <CardHeader
                  icon={<Receipt className="h-4 w-4" />}
                  title={t('section.extra')}
                  subtitle={t('section.extraHint')}
                />
                <CardBody className="grid grid-cols-1 gap-4 pt-4 sm:grid-cols-3">
                  <NumberField
                    label={t('fld.packaging')}
                    hint={t('fld.packagingHint')}
                    suffix={t('unit.som')}
                    value={draft.packaging}
                    step={500}
                    onChange={(v) => patch('packaging', v)}
                  />
                  <NumberField
                    label={t('fld.other')}
                    hint={t('fld.otherHint')}
                    suffix={t('unit.som')}
                    value={draft.otherCost}
                    step={500}
                    onChange={(v) => patch('otherCost', v)}
                  />
                  <NumberField
                    label={t('fld.tax')}
                    hint={t('fld.taxHint')}
                    suffix={t('unit.pct')}
                    value={draft.taxPct}
                    min={0}
                    max={50}
                    step={0.5}
                    onChange={(v) => patch('taxPct', v)}
                  />
                </CardBody>
              </Card>

              <Card>
                <CardHeader
                  icon={<Boxes className="h-4 w-4" />}
                  title={t('section.batch')}
                  subtitle={t('section.batchHint')}
                />
                <CardBody className="grid grid-cols-1 gap-4 pt-4 sm:grid-cols-3">
                  <NumberField
                    label={t('fld.buyout')}
                    hint={t('fld.buyoutHint')}
                    suffix={t('unit.pct')}
                    value={draft.buyoutPct}
                    min={1}
                    max={100}
                    step={1}
                    onChange={(v) => patch('buyoutPct', v)}
                  />
                  <NumberField
                    label={t('fld.returnLogistics')}
                    hint={t('fld.returnLogisticsHint')}
                    suffix={t('unit.som')}
                    value={draft.returnLogistics}
                    step={500}
                    onChange={(v) => patch('returnLogistics', v)}
                  />
                  <NumberField
                    label={t('fld.qty')}
                    hint={t('fld.qtyHint')}
                    suffix={t('unit.pcs')}
                    value={draft.qty}
                    min={1}
                    step={1}
                    onChange={(v) => patch('qty', Math.max(1, Math.round(v)))}
                  />
                </CardBody>
              </Card>
            </div>

            {/* ── O'ng ustun: natija ── */}
            <div className="lg:sticky lg:top-4 lg:self-start">
              <div className="space-y-4">
                <div className="card overflow-hidden bg-aurora p-5">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted">{t('res.profit')}</p>
                    <Badge tone={profitable ? 'brand' : 'danger'} dot>
                      {profitable ? t('res.ok') : t('res.loss')}
                    </Badge>
                  </div>
                  <p
                    className={cn(
                      'tnum mt-2 font-display text-3xl font-extrabold leading-tight tracking-tight',
                      profitable ? 'text-brand' : 'text-danger',
                    )}
                  >
                    {f.money(result.netProfitPerUnit)}
                  </p>
                  <p className="mt-1.5 text-xs text-muted">
                    {t('res.batchProfit', { v: f.money(result.netProfit) })}
                  </p>

                  <div className="mt-4 grid grid-cols-3 gap-2.5">
                    <MiniStat label={t('res.margin')} value={f.pct(result.margin)} danger={result.margin < 0} />
                    <MiniStat label={t('res.roi')} value={f.pct(result.roi)} danger={result.roi < 0} />
                    <MiniStat label={t('res.markup')} value={f.pct(result.markup)} danger={result.markup < 0} />
                  </div>
                </div>

                <div className="card flex items-start gap-3 p-4">
                  <Target className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <p className="text-sm font-medium text-ink-soft">{t('res.breakEven')}</p>
                      <span
                        className={cn(
                          'tnum font-display text-base font-extrabold',
                          input.price >= result.breakEvenPrice ? 'text-brand' : 'text-danger',
                        )}
                      >
                        {f.money(result.breakEvenPrice)}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-muted">{t('res.breakEvenHint')}</p>
                  </div>
                </div>

                <ChartCard title={t('res.split')} subtitle={t('res.splitHint')}>
                  <DonutChart
                    data={donutData.filter((d) => d.value > 0)}
                    height={220}
                    innerRadius={54}
                    outerRadius={82}
                    center={
                      <div>
                        <p className="text-2xs uppercase tracking-wide text-muted">{t('res.costTotal')}</p>
                        <p className="tnum font-display text-sm font-extrabold text-ink">
                          {f.compact(result.costTotal)}
                        </p>
                      </div>
                    }
                  />
                </ChartCard>

                <Card className="overflow-hidden">
                  <CardHeader
                    icon={<PieChartIcon className="h-4 w-4" />}
                    title={t('res.table')}
                    subtitle={t('res.batch')}
                  />
                  <div className="mt-3 overflow-x-auto">
                    <table className="w-full border-collapse text-sm">
                      <thead>
                        <tr>
                          <th className="table-head px-4 py-2 text-left">{t('res.title')}</th>
                          <th className="table-head px-4 py-2 text-right">{t('res.perUnit')}</th>
                          <th className="table-head px-4 py-2 text-right">{t('res.batch')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {breakdown.map((row) => (
                          <tr key={row.key} className="border-b border-line/60 last:border-0">
                            <td
                              className={cn(
                                'px-4 py-2 text-ink-soft',
                                row.strong && 'font-semibold text-ink',
                              )}
                            >
                              {row.label}
                            </td>
                            <td
                              className={cn(
                                'tnum px-4 py-2 text-right',
                                row.net && (profitable ? 'font-semibold text-brand' : 'font-semibold text-danger'),
                              )}
                            >
                              {f.money(row.value / qty)}
                            </td>
                            <td
                              className={cn(
                                'tnum px-4 py-2 text-right',
                                row.strong && 'font-semibold text-ink',
                                row.net && (profitable ? 'text-brand' : 'text-danger'),
                              )}
                            >
                              {f.money(row.value)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Card>
              </div>
            </div>
          </div>

          {/* ── Narx sezgirligi ── */}
          <ChartCard
            title={t('sens.title')}
            subtitle={t('sens.subtitle')}
            actions={<LineChartIcon className="h-4 w-4 text-muted" />}
          >
            <LinesChart
              data={sensitivity}
              xKey="label"
              xIsDate={false}
              height={240}
              series={[{ key: 'profit', name: t('sens.profit'), money: true }]}
            />

            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[520px] border-collapse text-sm">
                <thead>
                  <tr>
                    <th className="table-head px-4 py-2 text-left">{t('sens.change')}</th>
                    <th className="table-head px-4 py-2 text-right">{t('sens.price')}</th>
                    <th className="table-head px-4 py-2 text-right">{t('sens.profit')}</th>
                    <th className="table-head px-4 py-2 text-right">{t('sens.margin')}</th>
                  </tr>
                </thead>
                <tbody>
                  {sensitivity.map((s) => (
                    <tr
                      key={s.step}
                      className={cn('border-b border-line/60 last:border-0', s.step === 0 && 'bg-brand/5')}
                    >
                      <td className="px-4 py-2">
                        <span className="flex items-center gap-2">
                          <span className={cn('tnum font-semibold', s.step === 0 ? 'text-brand' : 'text-ink-soft')}>
                            {s.label}
                          </span>
                          {s.step === 0 ? <Badge tone="brand">{t('sens.current')}</Badge> : null}
                        </span>
                      </td>
                      <td className="tnum whitespace-nowrap px-4 py-2 text-right text-ink">{f.money(s.price)}</td>
                      <td
                        className={cn(
                          'tnum px-4 py-2 text-right font-semibold',
                          s.profit < 0 ? 'text-danger' : 'text-brand',
                        )}
                      >
                        {f.money(s.profit)}
                      </td>
                      <td className={cn('tnum px-4 py-2 text-right', s.margin < 0 ? 'text-danger' : 'text-ink-soft')}>
                        {f.pct(s.margin)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </ChartCard>

          {/* ── Ssenariylar ── */}
          <Card>
            <CardHeader
              icon={<Bookmark className="h-4 w-4" />}
              title={t('sc.title')}
              subtitle={t('sc.subtitle')}
              actions={
                <Button
                  size="sm"
                  variant="outline"
                  icon={<BookmarkPlus className="h-3.5 w-3.5" />}
                  onClick={() => setSaveOpen(true)}
                >
                  {t('sc.save')}
                </Button>
              }
            />
            <CardBody className="pt-4">
              {scenarios.isLoading ? (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <Skeleton key={i} className="h-24 w-full" />
                  ))}
                </div>
              ) : scenarios.isError ? (
                <ErrorState
                  message={scenarios.error instanceof Error ? scenarios.error.message : undefined}
                  onRetry={() => void scenarios.refetch()}
                  retryLabel={t('btn.retry')}
                />
              ) : (scenarios.data ?? []).length === 0 ? (
                <EmptyState
                  icon={<Bookmark className="h-6 w-6" />}
                  title={t('sc.empty')}
                  hint={t('sc.emptyHint')}
                  action={
                    <Button variant="outline" icon={<BookmarkPlus className="h-4 w-4" />} onClick={() => setSaveOpen(true)}>
                      {t('sc.save')}
                    </Button>
                  }
                />
              ) : (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {(scenarios.data ?? []).map((s) => {
                    const r = calcUnitEconomics(s.input);
                    return (
                      <div key={s.id} className="card card-hover flex flex-col gap-3 p-4">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate font-display text-sm font-bold text-ink">{s.name}</p>
                            <p className="mt-0.5 text-2xs text-muted">{f.date(s.createdAt)}</p>
                          </div>
                          <IconButton
                            label={t('btn.delete')}
                            className="h-8 w-8 hover:text-danger"
                            onClick={() => removeScenario.mutate(s.id)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </IconButton>
                        </div>

                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                          <span className="tnum text-muted">{f.money(s.input.price)}</span>
                          <span className="text-muted">·</span>
                          <span className={cn('tnum font-semibold', r.netProfit < 0 ? 'text-danger' : 'text-brand')}>
                            {f.money(r.netProfitPerUnit)}
                          </span>
                          <Badge tone={r.margin < 0 ? 'danger' : 'muted'}>
                            <span className="tnum">{f.pct(r.margin)}</span>
                          </Badge>
                        </div>

                        <Button
                          size="sm"
                          variant="outline"
                          className="w-full"
                          icon={<TrendingUp className="h-3.5 w-3.5" />}
                          onClick={() => {
                            applyInput(s.input);
                            toast.success(t('sc.loadedMsg'), s.name);
                          }}
                        >
                          {t('sc.load')}
                        </Button>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardBody>
          </Card>
        </div>
      </PlanGate>

      <Modal
        open={saveOpen}
        onClose={() => setSaveOpen(false)}
        title={t('sc.save')}
        description={t('sc.subtitle')}
        size="sm"
        footer={
          <div className="flex items-center justify-end gap-2">
            <Button variant="ghost" onClick={() => setSaveOpen(false)}>
              {t('btn.cancel')}
            </Button>
            <Button
              loading={saveScenario.isPending}
              onClick={() => {
                const trimmed = name.trim();
                if (!trimmed) {
                  toast.warning(t('sc.nameRequired'));
                  return;
                }
                saveScenario.mutate(trimmed);
              }}
            >
              {t('btn.save')}
            </Button>
          </div>
        }
      >
        <label className="label" htmlFor="scenario-name">
          {t('sc.name')}
        </label>
        <Input
          id="scenario-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t('sc.placeholder')}
          maxLength={80}
          autoFocus
        />
        <div className="mt-4 space-y-1.5 rounded-xl border border-line bg-surface-2 p-3.5 text-xs">
          <SummaryRow label={t('fld.price')} value={f.money(input.price)} />
          <SummaryRow label={t('fld.cost')} value={f.money(input.purchasePrice)} />
          <SummaryRow label={t('fld.qty')} value={`${f.num(qty)} ${t('unit.pcs')}`} />
          <SummaryRow
            label={t('res.net')}
            value={f.money(result.netProfit)}
            tone={profitable ? 'brand' : 'danger'}
          />
        </div>
      </Modal>
    </>
  );
}

function MiniStat({ label, value, danger }: { label: string; value: string; danger?: boolean }) {
  return (
    <div className="rounded-xl border border-line bg-surface p-2.5">
      <p className="truncate text-2xs font-semibold uppercase tracking-wide text-muted">{label}</p>
      <p className={cn('tnum mt-0.5 font-display text-sm font-extrabold', danger ? 'text-danger' : 'text-ink')}>
        {value}
      </p>
    </div>
  );
}

function SummaryRow({ label, value, tone }: { label: string; value: string; tone?: 'brand' | 'danger' }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted">{label}</span>
      <span
        className={cn(
          'tnum font-semibold',
          tone === 'brand' && 'text-brand',
          tone === 'danger' && 'text-danger',
          !tone && 'text-ink',
        )}
      >
        {value}
      </span>
    </div>
  );
}
