import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowRight,
  Bookmark,
  BookmarkPlus,
  Boxes,
  Calculator as CalculatorIcon,
  Coins,
  PackageOpen,
  Receipt,
  RotateCcw,
  SlidersHorizontal,
  Target,
  Trash2,
  TrendingUp,
  Truck,
} from '@/components/icons';
import {
  LOGISTICS_FEE,
  TARIFF_EFFECTIVE_FROM,
  billableLiters,
  calcUnitEconomics,
  storageFeePerDay,
  type ProductsResponse,
  type UnitCalcInput,
  type UnitCalcResult,
} from '@savdoiq/shared';
import { LitrovkaTab } from '@/components/calculator/LitrovkaTab';
import { LITR_EXAMPLE, MAX_TURNOVER, computeLitrovka, litrVolume, type LitrInput } from '@/components/calculator/litrovka';
import { SourceHint, SourceSlot } from '@/components/calculator/SourceBadge';
import { literDigits } from '@/components/calculator/tariff';
import {
  AUTO_FIELDS,
  buildUnitAuto,
  type AutoField,
  type UnitAuto,
  type UnitDefaultsFull,
} from '@/components/calculator/unitSources';
import {
  Amount,
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  ErrorState,
  HeroCard,
  IconButton,
  Input,
  Modal,
  PageHeader,
  PlanGate,
  PreviewBadge,
  Segmented,
  Select,
  Skeleton,
  toast,
  type Tone,
} from '@/components/ui';
import { CostSplitBar, type SplitSegment } from '@/components/unit/CostSplitBar';
import { NumberField } from '@/components/unit/NumberField';
import {
  DEFAULT_INPUT,
  PART_COLOR,
  PRICE_STEPS,
  mergeInput,
  normalizeScenarios,
  type PartKey,
  type UnitDefaultsResponse,
} from '@/components/unit/types';
import { api } from '@/lib/api';
import { usePeriodQuery } from '@/store/ui';
import { registerNamespace, useFormat, useT } from '@/i18n';
import { cn } from '@/lib/utils';

registerNamespace('calculator', {
  uz: {
    title: 'Unit kalkulyator',
    subtitle: 'Bitta dona qancha foyda beradi va narxi qayerga ketadi',
    'sku.label': 'Mahsulot (SKU)',
    'sku.manual': 'Qo‘lda kiritish',
    'sku.hint': 'SKU tanlansa, narx va tannarx o‘z ma’lumotlaringizdan to‘ldiriladi',
    'sku.loaded': 'SKU ma’lumotlari yuklandi',
    'section.price': 'Narx va tannarx',
    'section.market': 'Uzum xarajatlari',
    'section.extra': 'Qo‘shimcha xarajat va soliq',
    'section.batch': 'Partiya va qaytarishlar',
    'fld.price': 'Sotuv narxi',
    'fld.priceHint': 'Xaridor to‘laydigan narx (chegirmadan keyin)',
    'fld.cost': 'Tannarx',
    'fld.costHint': 'Mahsulotning sizga tushgan xarid narxi (1 dona)',
    'fld.commission': 'Komissiya',
    'fld.commissionHint': 'Uzum ushlab qoladigan foiz — kategoriyaga qarab odatda 8–20%',
    'fld.logistics': 'Logistika',
    'fld.logisticsHint': 'Sotilgan 1 dona uchun Uzum logistika yig‘imi (tovar qaytsa, qaytariladi)',
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
    'fld.returnLogistics': 'Qaytgan donaga xarajat',
    'fld.returnLogisticsHint':
      'Uzum qaytgan tovarning logistika yig‘imini qaytaradi. Bu yerga faqat o‘z xarajatingizni yozing (qayta qadoqlash, brak) — 1 dona uchun',
    'fld.qty': 'Miqdor',
    'fld.qtyHint': 'Partiyadagi dona soni — butun partiya hisobi shundan chiqadi',
    'unit.som': 'so‘m',
    'unit.pct': '%',
    'unit.days': 'kun',
    'unit.pcs': 'dona',
    'res.profit': 'Sof foyda (1 dona)',
    'res.batchProfit': 'Butun partiyadan ({n} dona):',
    'res.loss': 'Zarar',
    'res.ok': 'Foydali',
    'res.margin': 'Marja',
    'res.roi': 'ROI',
    'res.breakEven': 'Nol foyda narxi',
    'res.buffer': 'Narx {v} dan pastga tushsa zarar boshlanadi — hozir undan {n} yuqorisiz.',
    'res.bufferNeg': 'Zarar ko‘rmaslik uchun narx kamida {v} bo‘lishi kerak — hozirgisi {n} past.',
    'split.title': 'Narx qayerga ketadi',
    'split.revenue': 'Tushum: {v}',
    'split.unit': '1 dona',
    'split.batch': 'Partiya',
    'split.note':
      'Bir donaga tushum sotuv narxidan ({price}) kam: yuborilgan tovarning {pct} i sotib olinadi, qolgani qaytadi. Qaytgan tovar omborga qaytib qayta sotiladi — uning tannarxi va logistikasi zarar hisoblanmaydi.',
    'res.cogs': 'Tannarx',
    'res.commission': 'Komissiya',
    'res.logistics': 'Logistika',
    'res.storage': 'Ombor',
    'res.other': 'Qadoqlash va boshqa',
    'res.tax': 'Soliq',
    'res.net': 'Sof foyda',
    'sens.title': 'Narx o‘zgarsa',
    'sens.subtitle': 'Narxni tushirsangiz yoki ko‘tarsangiz bir donadan foyda va marja',
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
    subtitle: 'Сколько прибыли даёт одна единица и на что уходит её цена',
    'sku.label': 'Товар (SKU)',
    'sku.manual': 'Ввести вручную',
    'sku.hint': 'Если выбрать SKU, цена и себестоимость подставятся из ваших данных',
    'sku.loaded': 'Данные SKU загружены',
    'section.price': 'Цена и себестоимость',
    'section.market': 'Расходы Uzum',
    'section.extra': 'Доп. расходы и налог',
    'section.batch': 'Партия и возвраты',
    'fld.price': 'Цена продажи',
    'fld.priceHint': 'Цена, которую платит покупатель (после скидки)',
    'fld.cost': 'Себестоимость',
    'fld.costHint': 'Закупочная цена товара (за 1 шт.)',
    'fld.commission': 'Комиссия',
    'fld.commissionHint': 'Процент маркетплейса — обычно 8–20% по категории',
    'fld.logistics': 'Логистика',
    'fld.logisticsHint': 'Логистика Uzum за 1 проданную шт. (при возврате возвращается)',
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
    'fld.returnLogistics': 'Расход на возврат',
    'fld.returnLogisticsHint':
      'Uzum возвращает логистику за возвращённый товар. Укажите только свои расходы (переупаковка, брак) — на 1 шт.',
    'fld.qty': 'Количество',
    'fld.qtyHint': 'Штук в партии — из этого считается итог по партии',
    'unit.som': 'сум',
    'unit.pct': '%',
    'unit.days': 'дн.',
    'unit.pcs': 'шт.',
    'res.profit': 'Чистая прибыль (1 шт.)',
    'res.batchProfit': 'Со всей партии ({n} шт.):',
    'res.loss': 'Убыток',
    'res.ok': 'Прибыльно',
    'res.margin': 'Маржа',
    'res.roi': 'ROI',
    'res.breakEven': 'Точка безубыточности',
    'res.buffer': 'Ниже {v} начнётся убыток — сейчас цена выше на {n}.',
    'res.bufferNeg': 'Чтобы не уйти в минус, цена должна быть не ниже {v} — сейчас она ниже на {n}.',
    'split.title': 'На что уходит цена',
    'split.revenue': 'Выручка: {v}',
    'split.unit': '1 шт.',
    'split.batch': 'Партия',
    'split.note':
      'Выручка на единицу меньше цены ({price}): выкупают {pct} отправленного товара, остальное возвращается. Возврат снова поступает на склад и продаётся — его себестоимость и логистика не считаются убытком.',
    'res.cogs': 'Себестоимость',
    'res.commission': 'Комиссия',
    'res.logistics': 'Логистика',
    'res.storage': 'Хранение',
    'res.other': 'Упаковка и прочее',
    'res.tax': 'Налог',
    'res.net': 'Чистая прибыль',
    'sens.title': 'Если изменить цену',
    'sens.subtitle': 'Прибыль с единицы и маржа при снижении или повышении цены',
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
    subtitle: 'How much one unit earns and where its price goes',
    'sku.label': 'Product (SKU)',
    'sku.manual': 'Enter manually',
    'sku.hint': 'Pick a SKU to fill the price and cost from your own data',
    'sku.loaded': 'SKU data loaded',
    'section.price': 'Price and cost',
    'section.market': 'Uzum costs',
    'section.extra': 'Extra costs and tax',
    'section.batch': 'Batch and returns',
    'fld.price': 'Selling price',
    'fld.priceHint': 'What the buyer pays (after discounts)',
    'fld.cost': 'Cost price',
    'fld.costHint': 'What one unit costs you to buy',
    'fld.commission': 'Commission',
    'fld.commissionHint': 'Marketplace fee — usually 8–20% depending on the category',
    'fld.logistics': 'Logistics',
    'fld.logisticsHint': 'Uzum logistics fee per sold unit (refunded if the item is returned)',
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
    'fld.returnLogistics': 'Cost per return',
    'fld.returnLogisticsHint':
      'Uzum refunds the logistics fee on returned items. Enter only your own costs (repacking, defects) — per unit',
    'fld.qty': 'Quantity',
    'fld.qtyHint': 'Units in the batch — the batch totals come from this',
    'unit.som': 'UZS',
    'unit.pct': '%',
    'unit.days': 'days',
    'unit.pcs': 'pcs',
    'res.profit': 'Net profit (1 unit)',
    'res.batchProfit': 'From the whole batch ({n} units):',
    'res.loss': 'Loss',
    'res.ok': 'Profitable',
    'res.margin': 'Margin',
    'res.roi': 'ROI',
    'res.breakEven': 'Break-even price',
    'res.buffer': 'Below {v} you start losing money — the current price is {n} above it.',
    'res.bufferNeg': 'To avoid a loss the price must be at least {v} — it is currently {n} below.',
    'split.title': 'Where the price goes',
    'split.revenue': 'Revenue: {v}',
    'split.unit': '1 unit',
    'split.batch': 'Batch',
    'split.note':
      'Revenue per unit is lower than the price ({price}): {pct} of shipped items are bought out, the rest come back. Returns go back to stock and are sold again, so their cost and logistics are not counted as a loss.',
    'res.cogs': 'Cost of goods',
    'res.commission': 'Commission',
    'res.logistics': 'Logistics',
    'res.storage': 'Storage',
    'res.other': 'Packaging and other',
    'res.tax': 'Tax',
    'res.net': 'Net profit',
    'sens.title': 'If the price changes',
    'sens.subtitle': 'Profit per unit and margin when you lower or raise the price',
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

/** "Narx qayerga ketadi" bloki: bitta dona yoki butun partiya bo'yicha */
type SplitMode = 'unit' | 'batch';

/** Sahifa bo'limlari: unit-iqtisod va Litrovka (`?tab=litr`) */
type CalcTab = 'unit' | 'litr';

/**
 * Qo'lda rejimdagi boshlang'ich qiymatlar. Namunadagi saqlash (300 so'm/kun)
 * Uzum tarifiga o'tkazildi: 30 kunlik aylanma 60 dan kam — saqlash bepul
 * (tariffs.ts, 2026-10-24). Qolgani components/unit DEFAULT_INPUT.
 */
const START_INPUT: UnitCalcInput = {
  ...DEFAULT_INPUT,
  storagePerDay: storageFeePerDay({ units: 1, volumeL: 1, turnover: DEFAULT_INPUT.storageDays }),
};

export default function Calculator() {
  const t = useT('calculator');
  const ts = useT('calcSource');
  const tl = useT('litrovka');
  const f = useFormat();
  const qc = useQueryClient();
  const periodQuery = usePeriodQuery();
  const [params, setParams] = useSearchParams();

  const skuId = params.get('skuId') ?? '';
  const tab: CalcTab = params.get('tab') === 'litr' ? 'litr' : 'unit';
  const setTab = (next: CalcTab) => {
    const p = new URLSearchParams(params);
    if (next === 'litr') p.set('tab', 'litr');
    else p.delete('tab');
    setParams(p, { replace: true });
  };

  /** Formadagi joriy qiymatlar (har bosishda yangilanadi) */
  const [draft, setDraft] = useState<UnitCalcInput>(START_INPUT);
  /** Hisob uchun kechiktirilgan qiymatlar (300ms) */
  const [input, setInput] = useState<UnitCalcInput>(START_INPUT);
  const [saveOpen, setSaveOpen] = useState(false);
  const [name, setName] = useState('');
  const [splitMode, setSplitMode] = useState<SplitMode>('unit');

  /*
   * Litrovka holati sahifada turadi: bo'limlar almashganda yo'qolmasin va
   * qo'lda rejimda unit kalkulyator logistika/saqlashni shu hajmdan olsin.
   * `litrTouched` — namunaviy misol emas, sotuvchining o'z qiymati.
   */
  const [litr, setLitr] = useState<LitrInput>(LITR_EXAMPLE);
  const [litrTouched, setLitrTouched] = useState(false);
  /** Qaysi SKU'dan to'ldirilgan — bir SKU uchun bir marta (keyingi tahrirlar ustidan yozilmasin) */
  const litrPrefilledFor = useRef<string | null>(null);
  const onLitrChange = (next: LitrInput) => {
    setLitr(next);
    setLitrTouched(true);
  };

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

  /*
   * Narx qayerga ketadi: xarajatlar va sof foyda — yig'indisi tushumga teng.
   * Aylana diagramma (afsonasiz) va uch ustunli jadval o'rniga bitta chiziq
   * va ro'yxat: har qismning summasi va tushumdagi ulushi yonma-yon.
   */
  const scale = splitMode === 'unit' ? 1 / qty : 1;
  const splitTotal = Math.round(result.revenue * scale);
  const segments = useMemo<SplitSegment[]>(
    () =>
      [
        { key: 'cogs', label: t('res.cogs'), value: result.cogs },
        { key: 'commission', label: t('res.commission'), value: result.commission },
        { key: 'logistics', label: t('res.logistics'), value: result.logisticsTotal },
        { key: 'storage', label: t('res.storage'), value: result.storageTotal },
        { key: 'other', label: t('res.other'), value: otherTotal },
        { key: 'tax', label: t('res.tax'), value: result.tax },
        { key: 'profit', label: t('res.net'), value: result.netProfit },
      ].map((x) => ({ ...x, value: Math.round(x.value * scale), color: PART_COLOR[x.key as PartKey] })),
    [result, otherTotal, scale, t],
  );

  /** Joriy narx nol foyda narxidan necha foiz yuqori (manfiy — past, ya'ni zarar) */
  const buffer = input.price > 0 ? ((input.price - result.breakEvenPrice) / input.price) * 100 : 0;

  /*
   * Qiymat qayerdan olingani — maydon ostida belgi ("Uzum tarifi" / "Sizning
   * ma'lumotingiz" / "Taxmin"), izohda formula (components/calculator/
   * unitSources.ts). SKU tanlanganda manba serverdan (`source` + `basis`),
   * qo'lda rejimda — namunaviy qiymat yoki Litrovka bo'limidagi hajm bo'yicha
   * Uzum tarifi. Belgi faqat maydon avtomatik qiymatga teng tursa ko'rinadi:
   * qo'lda yozilgan raqam endi hech qaysi manbadan emas. Ilgari belgi faqat
   * SKU tanlanganda chiqardi, qo'lda rejimdagi 12% va 13 350 taxmin ekani
   * aytilmasdi (2026-10-24).
   */
  const skuDefaults = skuId ? ((defaults.data as UnitDefaultsFull | undefined) ?? null) : null;
  const skuBasis = skuDefaults?.basis ?? null;
  /** SKU tanlangan, javobi hali kelmagan — avtomatik qiymatlar "muzlaydi" (forma oraliq qiymatlarga sakramasin) */
  const autoLoading = Boolean(skuId) && !skuBasis;
  const manualVolume = litrTouched ? litrVolume(litr) : null;
  const auto = useMemo<UnitAuto>(
    () =>
      buildUnitAuto(
        {
          sku: skuBasis ? skuDefaults : null,
          manualVolume,
          manualKind: litr.kind,
          storageDays: draft.storageDays,
          base: DEFAULT_INPUT,
        },
        ts,
        f,
      ),
    // `f` har renderda yangi obyekt — til o'zgarishi `ts` orqali keladi
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [skuDefaults, skuBasis, manualVolume, litr.kind, draft.storageDays, ts],
  );

  /*
   * Avtomatik qiymat o'zgarsa (saqlash kunlari → aylanma guruhi, Litrovka
   * hajmi, boshqa SKU), maydon ham yangilanadi — lekin faqat foydalanuvchi uni
   * o'zgartirmagan bo'lsa (hali eski avtomatik qiymatda turgan bo'lsa).
   */
  const prevAuto = useRef<UnitAuto | null>(null);
  useEffect(() => {
    if (autoLoading) return;
    const prev = prevAuto.current;
    prevAuto.current = auto;
    if (!prev) return;
    const changed = AUTO_FIELDS.filter(
      (k) => auto.values[k] !== undefined && prev.values[k] !== undefined && auto.values[k] !== prev.values[k],
    );
    if (changed.length === 0) return;
    setDraft((d) => {
      let next = d;
      for (const k of changed) {
        const value = auto.values[k];
        if (value !== undefined && d[k] === prev.values[k]) next = { ...next, [k]: value };
      }
      return next;
    });
  }, [auto, autoLoading]);

  /** Maydon manbai — faqat qiymat avtomatik bo'lsa */
  const activeSource = (field: AutoField) => {
    const value = auto.values[field];
    return value !== undefined && draft[field] === value ? auto.sources[field] : undefined;
  };

  // ── Litrovka: SKU tanlansa kartochkadagi hajm, FBO qoldiq, aylanma va tarif turi ──
  useEffect(() => {
    if (!skuId || !skuBasis || litrPrefilledFor.current === skuId) return;
    litrPrefilledFor.current = skuId;
    const b = skuBasis;
    setLitr((cur) => ({
      ...cur,
      ...(b.volumeL > 0 ? { mode: 'l' as const, liters: b.volumeL } : {}),
      ...(b.fbo > 0 ? { units: b.fbo } : {}),
      // Aylanma: sotuv yo'q — 361+ guruh; FBO qoldiq yo'q (0) — avvalgisi qoladi
      ...(b.turnoverDays === null
        ? { turnover: 365 }
        : b.turnoverDays > 0
          ? { turnover: Math.min(MAX_TURNOVER, b.turnoverDays) }
          : {}),
      kind: b.tariffKind,
    }));
    setLitrTouched(true);
  }, [skuId, skuBasis]);

  /** Hajm qayerdan — "Uzum xarajatlari" bo'limi ostidagi qator */
  const fmtL = (v: number) => f.num(v, literDigits(v));
  const volumeLine: { text: string; warn?: boolean; link: boolean } | null = skuBasis
    ? skuBasis.volumeL > 0
      ? {
          text: tl('unitLine.card', {
            v: fmtL(skuBasis.volumeL),
            b: f.num(skuBasis.billableL),
            kind: tl(skuBasis.tariffKind === 'reduced' ? 'kind.reducedLong' : 'kind.standardLong'),
          }),
          link: true,
        }
      : { text: tl('unitLine.noDims', { fee: f.money(LOGISTICS_FEE.noDimensions) }), warn: true, link: false }
    : skuId
      ? null
      : manualVolume && manualVolume > 0
        ? { text: tl('unitLine.litr', { v: fmtL(manualVolume), b: f.num(billableLiters(manualVolume)) }), link: true }
        : { text: tl('unitLine.none'), link: true };

  /** Litrovka natijasini unit kalkulyatorga o'tkazish: logistika, aylanma va kunlik saqlash */
  const onUseLitr = () => {
    const r = computeLitrovka(litr);
    if (r.logistics === null) return;
    const days = Math.min(365, Math.max(0, Math.round(litr.turnover)));
    applyInput({ ...draft, logistics: r.logistics, storageDays: days, storagePerDay: r.perItemDay });
    setLitrTouched(true);
    setTab('unit');
    toast.success(tl('use.done'));
  };

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

  /** Ustunchalar uzunligi uchun — eng katta foyda (yoki zarar) */
  const sensMax = Math.max(1, ...sensitivity.map((x) => Math.abs(x.profit)));

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
    // Qo'lda rejimdagi avtomatik qiymatlar: Litrovka hajmi kiritilgan bo'lsa — Uzum tarifidan
    const manual = buildUnitAuto(
      { sku: null, manualVolume, manualKind: litr.kind, storageDays: DEFAULT_INPUT.storageDays, base: DEFAULT_INPUT },
      ts,
      f,
    );
    applyInput({ ...START_INPUT, ...manual.values });
    toast.info(t('reset.done'));
  };

  const onResetLitr = () => {
    setLitr(LITR_EXAMPLE);
    setLitrTouched(false);
  };

  return (
    <>
      <PageHeader
        icon={<CalculatorIcon className="h-5 w-5" />}
        title={t('title')}
        description={tab === 'litr' ? tl('subtitle') : t('subtitle')}
        badge={<PreviewBadge feature="unit_calculator" />}
        meta={
          tab === 'litr' ? (
            <span className="meta-chip">{tl('src.title', { date: f.date(TARIFF_EFFECTIVE_FROM) })}</span>
          ) : undefined
        }
        actions={
          tab === 'litr' ? (
            <Button variant="outline" icon={<RotateCcw className="h-4 w-4" />} onClick={onResetLitr}>
              {tl('reset')}
            </Button>
          ) : (
            <>
              <Button variant="outline" icon={<RotateCcw className="h-4 w-4" />} onClick={onReset}>
                {t('btn.reset')}
              </Button>
              <Button icon={<BookmarkPlus className="h-4 w-4" />} onClick={() => setSaveOpen(true)}>
                {t('sc.save')}
              </Button>
            </>
          )
        }
      />

      <PlanGate feature="unit_calculator">
        <div className="space-y-5">
          {/*
            Bo'limlar: unit-iqtisod va Litrovka (hajm → Uzum logistikasi va
            saqlashi). Tanlov manzilda (`?tab=litr`) — havola bilan ochish mumkin.
            SKU tanlovi umumiy: bir bo'limda tanlangan SKU ikkinchisida ham turadi.
          */}
          <Segmented<CalcTab>
            value={tab}
            onChange={setTab}
            options={[
              { value: 'unit', label: tl('tab.unit') },
              { value: 'litr', label: tl('tab.litr') },
            ]}
          />

          {tab === 'litr' ? (
            <LitrovkaTab
              value={litr}
              onChange={onLitrChange}
              skuOptions={skuOptions}
              skuId={skuId}
              onSelectSku={onSelectSku}
              skuListLoading={products.isLoading}
              basis={skuBasis}
              basisLoading={Boolean(skuId) && defaults.isFetching}
              onUseInUnit={onUseLitr}
            />
          ) : (
          <>
          {/*
            Ikki ustun: chapda kiritish, o'ngda natija (yopishib turadi). Telefonda
            ustunlar "erib ketadi" (`contents`) va bloklar `order` bo'yicha tiziladi:
            avval natija, keyin forma — raqamni o'zgartirgan odam nimaga ta'sir
            qilayotganini ko'rib tursin.
          */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(360px,440px)] lg:gap-5 xl:grid-cols-[minmax(0,1fr)_480px]">
            {/* ── Chap ustun: kiritish ── */}
            <div className="contents lg:block lg:space-y-4">
              <Card className="order-2">
                <CardBody className="flex flex-col gap-3 sm:flex-row sm:items-center">
                  <div className="flex shrink-0 items-center gap-2.5 text-sm font-semibold text-ink">
                    <span className="icon-tile h-9 w-9 rounded-[10px] [&_svg]:h-4 [&_svg]:w-4" aria-hidden>
                      <Boxes />
                    </span>
                    {t('sku.label')}
                  </div>
                  <div className="min-w-0 flex-1">
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
                  </div>
                </CardBody>
                <p className="-mt-2 px-5 pb-4 text-xs text-muted">
                  {defaults.isFetching ? (
                    t('common.loading')
                  ) : defaults.data ? (
                    <span className="text-brand-ink">{t('sku.loaded')}</span>
                  ) : (
                    t('sku.hint')
                  )}
                </p>
              </Card>

              {/* Bitta forma: beshta alohida kartochka o'rniga bo'limlar ingichka chiziq bilan ajratilgan */}
              <Card className="order-3">
                <div className="divide-y divide-line/70">
                  <FormSection icon={<Coins />} tone="brand" title={t('section.price')}>
                    <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
                      <NumberField
                        label={t('fld.price')}
                        hint={t('fld.priceHint')}
                        hintOnFocus
                        suffix={t('unit.som')}
                        value={draft.price}
                        step={1000}
                        tone="brand"
                        onChange={(v) => patch('price', v)}
                      />
                      <NumberField
                        label={t('fld.cost')}
                        hint={t('fld.costHint')}
                        hintOnFocus
                        suffix={t('unit.som')}
                        value={draft.purchasePrice}
                        step={1000}
                        onChange={(v) => patch('purchasePrice', v)}
                      />
                    </div>
                  </FormSection>

                  <FormSection icon={<Truck />} tone="violet" title={t('section.market')}>
                    {/*
                      Ustunlar soni chap ustun kengligidan kelib chiqib tanlangan:
                      lg dan boshlab o'ngda natija paneli turadi va chap ustun torayadi
                      (1280 px'da ~436 px). Ilgari xl'da 4 ta maydon bir qatorga
                      tizilardi — har biri ~98 px, so'm qo'shimchasidan keyin raqamga
                      ~40 px qolib, "13 350" "133", "300" "30C" bo'lib kesilardi.
                      4 ustun faqat har maydon ≥150 px bo'lganda: md (bir ustunli
                      tartib) va 2xl (2026-10-24).
                    */}
                    {/*
                      Manba belgisi yorliq qatorida emas, maydon OSTIDA: yorliqlar katta
                      harfli va tor ustunda "SIZNING MA'LUMOTINGIZ" yonida kesilib qolardi.
                    */}
                    <div className="grid grid-cols-2 gap-3.5 md:grid-cols-4 lg:grid-cols-2 2xl:grid-cols-4">
                      <div className="min-w-0">
                        <NumberField
                          label={t('fld.commission')}
                          hint={<SourceHint hint={t('fld.commissionHint')} source={activeSource('commissionPct')} />}
                          hintOnFocus
                          suffix={t('unit.pct')}
                          value={draft.commissionPct}
                          min={0}
                          max={100}
                          step={0.5}
                          onChange={(v) => patch('commissionPct', v)}
                        />
                        <SourceSlot source={activeSource('commissionPct')} />
                      </div>
                      <div className="min-w-0">
                        <NumberField
                          label={t('fld.logistics')}
                          hint={<SourceHint hint={t('fld.logisticsHint')} source={activeSource('logistics')} />}
                          hintOnFocus
                          suffix={t('unit.som')}
                          value={draft.logistics}
                          step={500}
                          onChange={(v) => patch('logistics', v)}
                        />
                        <SourceSlot source={activeSource('logistics')} />
                      </div>
                      <div className="min-w-0">
                        <NumberField
                          label={t('fld.storagePerDay')}
                          hint={<SourceHint hint={t('fld.storagePerDayHint')} source={activeSource('storagePerDay')} />}
                          hintOnFocus
                          suffix={t('unit.som')}
                          value={draft.storagePerDay}
                          step={50}
                          onChange={(v) => patch('storagePerDay', v)}
                        />
                        <SourceSlot source={activeSource('storagePerDay')} />
                      </div>
                      <div className="min-w-0">
                        <NumberField
                          label={t('fld.storageDays')}
                          hint={<SourceHint hint={t('fld.storageDaysHint')} source={activeSource('storageDays')} />}
                          hintOnFocus
                          suffix={t('unit.days')}
                          value={draft.storageDays}
                          min={0}
                          max={365}
                          step={1}
                          onChange={(v) => patch('storageDays', v)}
                        />
                        <SourceSlot source={activeSource('storageDays')} />
                      </div>
                    </div>
                    {volumeLine ? (
                      <p
                        className={cn(
                          'tnum mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs leading-relaxed',
                          volumeLine.warn ? 'text-warn-ink' : 'text-muted',
                        )}
                      >
                        <span className="min-w-0">{volumeLine.text}</span>
                        {volumeLine.link ? (
                          <button
                            type="button"
                            onClick={() => setTab('litr')}
                            className="inline-flex items-center gap-1 font-semibold text-brand-ink hover:underline"
                          >
                            {tl('unitLine.open')}
                            <ArrowRight className="h-3.5 w-3.5" />
                          </button>
                        ) : null}
                      </p>
                    ) : null}
                  </FormSection>

                  <FormSection icon={<Receipt />} tone="warn" title={t('section.extra')}>
                    {/* Xuddi shu sabab: 1280–1535 px'da 3 ustun ~136 px bo'lib, yorliqlar kesilardi */}
                    <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-3 lg:grid-cols-2 2xl:grid-cols-3">
                      <NumberField
                        label={t('fld.packaging')}
                        hint={t('fld.packagingHint')}
                        hintOnFocus
                        suffix={t('unit.som')}
                        value={draft.packaging}
                        step={500}
                        onChange={(v) => patch('packaging', v)}
                      />
                      <NumberField
                        label={t('fld.other')}
                        hint={t('fld.otherHint')}
                        hintOnFocus
                        suffix={t('unit.som')}
                        value={draft.otherCost}
                        step={500}
                        onChange={(v) => patch('otherCost', v)}
                      />
                      <NumberField
                        label={t('fld.tax')}
                        hint={t('fld.taxHint')}
                        hintOnFocus
                        suffix={t('unit.pct')}
                        value={draft.taxPct}
                        min={0}
                        max={50}
                        step={0.5}
                        className="col-span-2 sm:col-span-1 lg:col-span-2 2xl:col-span-1"
                        onChange={(v) => patch('taxPct', v)}
                      />
                    </div>
                  </FormSection>

                  <FormSection icon={<PackageOpen />} tone="info" title={t('section.batch')}>
                    <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-3 lg:grid-cols-2 2xl:grid-cols-3">
                      <div className="min-w-0">
                        <NumberField
                          label={t('fld.buyout')}
                          hint={<SourceHint hint={t('fld.buyoutHint')} source={activeSource('buyoutPct')} />}
                          hintOnFocus
                          suffix={t('unit.pct')}
                          value={draft.buyoutPct}
                          min={1}
                          max={100}
                          step={1}
                          onChange={(v) => patch('buyoutPct', v)}
                        />
                        <SourceSlot source={activeSource('buyoutPct')} />
                      </div>
                      <NumberField
                        label={t('fld.returnLogistics')}
                        hint={t('fld.returnLogisticsHint')}
                        hintOnFocus
                        suffix={t('unit.som')}
                        value={draft.returnLogistics}
                        step={500}
                        onChange={(v) => patch('returnLogistics', v)}
                      />
                      <NumberField
                        label={t('fld.qty')}
                        hint={t('fld.qtyHint')}
                        hintOnFocus
                        suffix={t('unit.pcs')}
                        value={draft.qty}
                        min={1}
                        step={1}
                        className="col-span-2 sm:col-span-1 lg:col-span-2 2xl:col-span-1"
                        onChange={(v) => patch('qty', Math.max(1, Math.round(v)))}
                      />
                    </div>
                  </FormSection>
                </div>
              </Card>

              {/* ── Narx o'zgarsa ── */}
              <Card className="order-5">
                <CardHeader
                  icon={<SlidersHorizontal className="h-4 w-4" />}
                  title={t('sens.title')}
                  subtitle={t('sens.subtitle')}
                />
                {/*
                  Ilgari bu yerda butun kenglikdagi chiziqli grafik turardi. Foyda
                  narxga chiziqli bog'liq — grafik har doim to'g'ri chiziq chizardi
                  va hech narsa demasdi. Ustunchalar o'sha ma'lumotni raqam bilan
                  birga, joy egallamasdan ko'rsatadi.
                */}
                <ul className="mt-3 divide-y divide-line/60 border-t border-line/70">
                  {sensitivity.map((s) => (
                    <li
                      key={s.step}
                      className={cn(
                        'grid grid-cols-[3.25rem_minmax(0,1fr)_auto] items-center gap-x-3 px-5 py-2 sm:grid-cols-[3.5rem_7.5rem_minmax(0,1fr)_7.5rem_3.5rem]',
                        s.step === 0 && 'bg-brand/[0.06]',
                      )}
                    >
                      <span
                        className={cn('tnum text-sm font-semibold', s.step === 0 ? 'text-brand-ink' : 'text-ink-soft')}
                      >
                        {s.step === 0 ? t('sens.current') : s.label}
                      </span>
                      <span className="tnum whitespace-nowrap text-sm text-ink">{f.money(s.price)}</span>
                      {/* Ustuncha: shu narxdagi foyda eng katta foydaga nisbatan */}
                      <span className="hidden h-2 overflow-hidden rounded-full bg-surface-3 sm:block" aria-hidden>
                        <span
                          className={cn('block h-full rounded-full', s.profit < 0 ? 'bg-danger' : 'bg-brand')}
                          style={{ width: `${Math.max(2, (Math.abs(s.profit) / sensMax) * 100)}%` }}
                        />
                      </span>
                      <span
                        className={cn(
                          'tnum whitespace-nowrap text-right text-sm font-semibold',
                          s.profit < 0 ? 'text-danger' : 'text-brand-ink',
                        )}
                      >
                        {f.money(s.profit)}
                      </span>
                      <span
                        className={cn(
                          'tnum hidden text-right text-xs sm:block',
                          s.margin < 0 ? 'text-danger' : 'text-muted',
                        )}
                      >
                        {f.pct(s.margin)}
                      </span>
                    </li>
                  ))}
                </ul>
              </Card>
            </div>

            {/* ── O'ng ustun: natija (yuqori panel ostida yopishib turadi) ── */}
            <div className="contents lg:sticky lg:top-20 lg:block lg:space-y-4 lg:self-start">
              {/*
                Sahifaning yagona HeroCard'i — hisob natijasi. Ilgari o'zining
                `bg-aurora` foni bor edi; endi boshqa sahifalardagi bosh kartochka
                bilan bir xil va zararda qizil ohangga o'tadi (zarar — qizilning
                yagona ma'nosi).
              */}
              <HeroCard tone={profitable ? 'brand' : 'danger'} className="order-1 overflow-hidden p-5 sm:p-6">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <span className="icon-tile h-9 w-9 rounded-[10px] [&_svg]:h-[18px] [&_svg]:w-[18px]" aria-hidden>
                      <CalculatorIcon />
                    </span>
                    <p className="truncate font-display text-[15px] font-semibold text-ink">{t('res.profit')}</p>
                  </div>
                  <Badge tone={profitable ? 'brand' : 'danger'} dot>
                    {profitable ? t('res.ok') : t('res.loss')}
                  </Badge>
                </div>
                <p
                  className={cn(
                    'tnum mt-4 font-title text-[34px] font-semibold leading-none tracking-[-0.03em] sm:text-[40px]',
                    profitable ? 'text-brand-ink' : 'text-danger',
                  )}
                >
                  <Amount value={f.money(result.netProfitPerUnit)} />
                </p>
                <p className="tnum mt-2.5 text-sm text-muted">
                  {t('res.batchProfit', { n: f.num(qty) })}{' '}
                  <span className={cn('font-semibold', profitable ? 'text-ink' : 'text-danger')}>
                    {f.money(result.netProfit)}
                  </span>
                </p>

                <div className="mt-5 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                  <MiniStat label={t('res.margin')} value={f.pct(result.margin)} danger={result.margin < 0} />
                  <MiniStat label={t('res.roi')} value={f.pct(result.roi)} danger={result.roi < 0} />
                  <MiniStat
                    label={t('res.breakEven')}
                    value={<Amount value={f.money(result.breakEvenPrice)} />}
                    danger={buffer < 0}
                    // Telefonda summa uchdan bir kenglikka sig'maydi — butun qatorni oladi
                    className="col-span-2 sm:col-span-1"
                  />
                </div>
                {/* Nol foyda narxi nimani anglatishi — raqamning o'zi yetarli emas */}
                <p className={cn('mt-3 flex items-start gap-2 text-xs leading-snug', buffer < 0 ? 'text-danger' : 'text-muted')}>
                  <Target className="mt-px h-3.5 w-3.5 shrink-0" />
                  {buffer < 0
                    ? t('res.bufferNeg', { v: f.money(result.breakEvenPrice), n: f.pct(-buffer) })
                    : t('res.buffer', { v: f.money(result.breakEvenPrice), n: f.pct(buffer) })}
                </p>
              </HeroCard>

              <Card className="order-4">
                <CardHeader
                  icon={<Receipt className="h-4 w-4" />}
                  title={t('split.title')}
                  subtitle={t('split.revenue', { v: f.money(splitTotal) })}
                  actions={
                    <Segmented<SplitMode>
                      size="sm"
                      value={splitMode}
                      onChange={setSplitMode}
                      options={[
                        { value: 'unit', label: t('split.unit') },
                        { value: 'batch', label: t('split.batch') },
                      ]}
                    />
                  }
                />
                <CardBody>
                  <CostSplitBar segments={segments} total={splitTotal} compact />
                  {/* Bir donaga tushum sotuv narxidan kam chiqishining sababi */}
                  {input.buyoutPct < 100 ? (
                    <p className="mt-3 border-t border-line/70 pt-3 text-xs leading-relaxed text-muted">
                      {t('split.note', { pct: f.pct(input.buyoutPct), price: f.money(input.price) })}
                    </p>
                  ) : null}
                </CardBody>
              </Card>
            </div>
          </div>

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
            <CardBody>
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
                      // Kartochka ichidagi kartochka emas — sahifadagi boshqa ichki plitkalar bilan bir xil `.well`
                      <div key={s.id} className="well flex flex-col gap-3 p-4 transition-colors hover:border-line-strong">
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
                          <span className={cn('tnum font-semibold', r.netProfit < 0 ? 'text-danger' : 'text-brand-ink')}>
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
          </>
          )}
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

/**
 * Forma bo'limi: kichik sarlavha va maydonlar. Bo'limlar bitta kartochka ichida chiziq bilan ajraladi.
 * Ikonka plitkasi bo'lim ma'nosi rangida — "Narx qayerga ketadi" ranglari bilan bir oila:
 * Uzum xarajatlari binafsha (Uzum ulushi), soliq va qo'shimcha za'faron, partiya va
 * qaytarish logistikasi ko'k. Ilgari to'rttala belgi bir xil kulrang edi.
 */
function FormSection({
  icon,
  tone,
  title,
  children,
}: {
  icon: ReactNode;
  tone: Tone;
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="p-5">
      <h3 className="mb-3.5 flex items-center gap-2.5 text-sm font-semibold text-ink">
        <span className={cn('icon-tile h-7 w-7 rounded-lg [&_svg]:h-3.5 [&_svg]:w-3.5', `tone-${tone}`)} aria-hidden>
          {icon}
        </span>
        {title}
      </h3>
      {children}
    </section>
  );
}

function MiniStat({
  label,
  value,
  danger,
  className,
}: {
  label: string;
  value: ReactNode;
  danger?: boolean;
  className?: string;
}) {
  return (
    <div className={cn('well min-w-0 p-3', className)}>
      <p className="truncate eyebrow">{label}</p>
      <p
        className={cn(
          'tnum mt-1 whitespace-nowrap font-display text-[15px] font-extrabold leading-tight',
          danger ? 'text-danger' : 'text-ink',
        )}
      >
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
          tone === 'brand' && 'text-brand-ink',
          tone === 'danger' && 'text-danger',
          !tone && 'text-ink',
        )}
      >
        {value}
      </span>
    </div>
  );
}
