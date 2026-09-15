import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeftRight,
  Container,
  Info,
  Landmark,
  Megaphone,
  Package,
  Percent,
  RefreshCw,
  RotateCcw,
  Ship,
  Sparkles,
  Truck,
  Wallet,
} from 'lucide-react';
import {
  calcImportPrice,
  maxCostForPrice,
  maxPddPrice,
  type ImportCalcInput,
  IMPORT_CALC_FALLBACK,
  type ImportDefaults,
} from '@savdoiq/shared';
import { api } from '@/lib/api';
import { registerNamespace, useFormat, useT } from '@/i18n';
import { Badge, Button, Card, CardBody, CardHeader, IconButton, PageHeader, Segmented, Skeleton } from '@/components/ui';
import { CHART_COLORS } from '@/lib/theme';
import { cn } from '@/lib/utils';

registerNamespace('importCalc', {
  uz: {
    title: 'Import kalkulyatori',
    subtitle: 'Xitoydan (PDD / 1688) olib kelinadigan tovar uchun Uzum narxini hisoblang',
    inputs: 'Kirish ma’lumotlari',
    'f.pdd': 'PDD narxi',
    'f.pdd.hint': 'yuan, kupondan keyingi (券后) narx',
    'f.weight': 'Og‘irligi',
    'f.weight.hint': 'gramm, qadoq bilan',
    'f.rate': 'Kurs',
    'f.rate.hint': '1 CNY = ? so‘m',
    'f.cargo': 'Kargo',
    'f.cargo.hint': 'so‘m / kg (avto)',
    'f.commission': 'Uzum komissiyasi',
    'f.commission.hint': 'kategoriya bo‘yicha Uzum ulushi',
    'f.ads': 'Reklama / aksiya',
    'f.ads.hint': 'sotuv narxidan ajratma',
    'f.delivery': 'Yetkazib berish',
    'f.delivery.hint': 'so‘m / buyurtma',
    'f.profit': 'Foyda',
    'f.profit.hint': 'tannarxga nisbatan (×)',
    'f.round': 'Yaxlitlash',
    'f.round.hint': 'narxni yuqoriga yaxlitlash',
    'round.none': 'Yo‘q',
    result: 'Uzumda qo‘yish kerak bo‘lgan narx',
    sum: 'so‘m',
    summary: 'Tannarx {cost} so‘m · sof foyda {profit} so‘m har donadan',
    'leg.commission': 'Komissiya',
    'leg.ads': 'Reklama',
    'leg.delivery': 'Logistika',
    'leg.cost': 'Tannarx',
    'leg.profit': 'Sof foyda',
    'rule.title': 'PDD’da yurganda qoida:',
    'rule.formula': 'Uzum narxi × {factor} − {offset} = maksimal tannarx',
    'rule.example':
      'Masalan Uzumda {price} so‘mga sotmoqchi bo‘lsangiz — tovar + kargo {max} so‘mdan oshmasin.',
    'rule.pdd': 'Bu — taxminan {yuan} ¥ (joriy kurs va {weight} g og‘irlik bo‘yicha).',
    margin: 'Marja',
    roi: 'ROI',
    costShare: 'Tannarx ulushi',
    'reverse.title': 'Teskari hisob',
    'reverse.subtitle': 'Uzum narxini kiriting — PDD’da qanchagacha olsangiz bo‘ladi',
    'reverse.price': 'Uzum narxi',
    'reverse.maxCost': 'Maksimal tannarx',
    'reverse.maxPdd': 'PDD’da maksimal narx',
    'reverse.cargo': 'Shundan kargo',
    'reverse.impossible':
      'Bu narxda ushbu og‘irlikdagi tovar sig‘maydi: faqat kargo {cargo} so‘m, ruxsat etilgan tannarx esa {max} so‘m. Narxni oshiring, og‘irlikni yoki kargo tarifini kamaytiring.',
    'rate.cbu': 'Markaziy bank',
    'rate.fallback': 'Zaxira kurs',
    'rate.manual': 'Qo‘lda',
    'rate.refresh': 'Kursni yangilash',
    'commission.fromData': 'Sizning haqiqiy buyurtmalaringiz bo‘yicha hisoblandi',
    'commission.auto': 'Avtomatik',
    reset: 'Boshlang‘ich qiymatlar',
    'invalid.title': 'Komissiya va reklama birgalikda 100% dan oshmasligi kerak',
    'invalid.hint': 'Bu holatda hech qanday narx foyda keltirmaydi — foizlarni kamaytiring.',
    'loss.title': 'Bu shartlarda tovar zarar keltiradi',
    tip: 'Kurs Markaziy bankdan avtomatik olinadi, komissiya esa sizning haqiqiy buyurtmalaringizdan hisoblanadi. Barcha qiymatlarni qo‘lda o‘zgartirishingiz mumkin.',
  },
  ru: {
    title: 'Калькулятор импорта',
    subtitle: 'Рассчитайте цену для Uzum по товару из Китая (PDD / 1688)',
    inputs: 'Исходные данные',
    'f.pdd': 'Цена на PDD',
    'f.pdd.hint': 'юань, цена после купона (券后)',
    'f.weight': 'Вес',
    'f.weight.hint': 'граммы, с упаковкой',
    'f.rate': 'Курс',
    'f.rate.hint': '1 CNY = ? сум',
    'f.cargo': 'Карго',
    'f.cargo.hint': 'сум / кг (авто)',
    'f.commission': 'Комиссия Uzum',
    'f.commission.hint': 'доля Uzum по категории',
    'f.ads': 'Реклама / акции',
    'f.ads.hint': 'отчисление от цены продажи',
    'f.delivery': 'Доставка',
    'f.delivery.hint': 'сум / заказ',
    'f.profit': 'Прибыль',
    'f.profit.hint': 'к себестоимости (×)',
    'f.round': 'Округление',
    'f.round.hint': 'округлять цену вверх',
    'round.none': 'Нет',
    result: 'Цена, которую нужно поставить на Uzum',
    sum: 'сум',
    summary: 'Себестоимость {cost} сум · чистая прибыль {profit} сум с единицы',
    'leg.commission': 'Комиссия',
    'leg.ads': 'Реклама',
    'leg.delivery': 'Логистика',
    'leg.cost': 'Себестоимость',
    'leg.profit': 'Чистая прибыль',
    'rule.title': 'Правило при закупке на PDD:',
    'rule.formula': 'Цена Uzum × {factor} − {offset} = максимальная себестоимость',
    'rule.example':
      'Например, если продаёте на Uzum за {price} сум — товар + карго не должны превышать {max} сум.',
    'rule.pdd': 'Это примерно {yuan} ¥ (по текущему курсу и весу {weight} г).',
    margin: 'Маржа',
    roi: 'ROI',
    costShare: 'Доля себестоимости',
    'reverse.title': 'Обратный расчёт',
    'reverse.subtitle': 'Введите цену Uzum — узнаете лимит закупки на PDD',
    'reverse.price': 'Цена на Uzum',
    'reverse.maxCost': 'Максимальная себестоимость',
    'reverse.maxPdd': 'Максимальная цена на PDD',
    'reverse.cargo': 'Из них карго',
    'reverse.impossible':
      'При этой цене товар такого веса не проходит: только карго {cargo} сум, а допустимая себестоимость {max} сум. Повысьте цену, уменьшите вес или тариф карго.',
    'rate.cbu': 'Центральный банк',
    'rate.fallback': 'Резервный курс',
    'rate.manual': 'Вручную',
    'rate.refresh': 'Обновить курс',
    'commission.fromData': 'Рассчитано по вашим реальным заказам',
    'commission.auto': 'Автоматически',
    reset: 'Значения по умолчанию',
    'invalid.title': 'Комиссия и реклама вместе не должны превышать 100%',
    'invalid.hint': 'При таких условиях ни одна цена не даёт прибыли — уменьшите проценты.',
    'loss.title': 'При таких условиях товар убыточен',
    tip: 'Курс берётся автоматически из Центрального банка, комиссия считается по вашим реальным заказам. Все значения можно изменить вручную.',
  },
  en: {
    title: 'Import calculator',
    subtitle: 'Work out the Uzum price for goods imported from China (PDD / 1688)',
    inputs: 'Inputs',
    'f.pdd': 'PDD price',
    'f.pdd.hint': 'yuan, after-coupon (券后) price',
    'f.weight': 'Weight',
    'f.weight.hint': 'grams, with packaging',
    'f.rate': 'Rate',
    'f.rate.hint': '1 CNY = ? UZS',
    'f.cargo': 'Cargo',
    'f.cargo.hint': 'UZS / kg (by road)',
    'f.commission': 'Uzum commission',
    'f.commission.hint': 'Uzum share for the category',
    'f.ads': 'Ads / promos',
    'f.ads.hint': 'share of the selling price',
    'f.delivery': 'Delivery',
    'f.delivery.hint': 'UZS / order',
    'f.profit': 'Profit',
    'f.profit.hint': 'multiple of cost (×)',
    'f.round': 'Rounding',
    'f.round.hint': 'round the price up',
    'round.none': 'None',
    result: 'Price to set on Uzum',
    sum: 'UZS',
    summary: 'Cost {cost} UZS · net profit {profit} UZS per unit',
    'leg.commission': 'Commission',
    'leg.ads': 'Ads',
    'leg.delivery': 'Logistics',
    'leg.cost': 'Cost',
    'leg.profit': 'Net profit',
    'rule.title': 'Rule of thumb when sourcing on PDD:',
    'rule.formula': 'Uzum price × {factor} − {offset} = maximum cost',
    'rule.example': 'If you want to sell at {price} UZS on Uzum — goods + cargo must stay under {max} UZS.',
    'rule.pdd': 'That is roughly {yuan} ¥ (at the current rate and {weight} g).',
    margin: 'Margin',
    roi: 'ROI',
    costShare: 'Cost share',
    'reverse.title': 'Reverse check',
    'reverse.subtitle': 'Enter an Uzum price to see your sourcing limit',
    'reverse.price': 'Uzum price',
    'reverse.maxCost': 'Maximum cost',
    'reverse.maxPdd': 'Maximum PDD price',
    'reverse.cargo': 'Of which cargo',
    'reverse.impossible':
      'At this price an item of this weight does not fit: cargo alone is {cargo} UZS while the allowed cost is {max} UZS. Raise the price, or reduce the weight or cargo rate.',
    'rate.cbu': 'Central Bank',
    'rate.fallback': 'Fallback rate',
    'rate.manual': 'Manual',
    'rate.refresh': 'Refresh rate',
    'commission.fromData': 'Derived from your real orders',
    'commission.auto': 'Automatic',
    reset: 'Reset to defaults',
    'invalid.title': 'Commission and ads together must stay below 100%',
    'invalid.hint': 'No price is profitable under these terms — lower the percentages.',
    'loss.title': 'This product loses money under these terms',
    tip: 'The exchange rate is pulled from the Central Bank automatically and the commission is derived from your real orders. Every value can be edited by hand.',
  },
});

const STORAGE_KEY = 'sq-import-calc';
const ROUND_STEPS = [0, 1000, 5000, 10_000];

interface Draft extends ImportCalcInput {
  /** Kurs qo'lda o'zgartirilganmi */
  rateTouched?: boolean;
}

function readDraft(): Draft | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Draft) : null;
  } catch {
    return null;
  }
}

function saveDraft(draft: Draft): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
  } catch {
    /* noop */
  }
}

/** Bo'sh joy va vergul bilan yozilgan raqamni ham tushunadi */
function parseNumber(value: string): number {
  const clean = value.replace(/\s/g, '').replace(',', '.').replace(/[^\d.]/g, '');
  const n = Number(clean);
  return Number.isFinite(n) ? n : 0;
}

function NumberField({
  label,
  hint,
  value,
  onChange,
  suffix,
  icon,
  badge,
  step,
}: {
  label: string;
  hint?: string;
  value: number;
  onChange: (v: number) => void;
  suffix?: string;
  icon?: ReactNode;
  badge?: ReactNode;
  step?: number;
}) {
  const [text, setText] = useState(String(value));
  const [focused, setFocused] = useState(false);

  // Tashqaridan kelgan qiymat (masalan kurs yangilanganda) inputga ko'chiriladi
  useEffect(() => {
    if (!focused) setText(String(value));
  }, [value, focused]);

  return (
    <div className="flex items-center justify-between gap-4 border-b border-line/70 py-3 last:border-0">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          {icon ? <span className="text-muted">{icon}</span> : null}
          <span className="text-sm font-medium text-ink">{label}</span>
          {badge}
        </div>
        {hint ? <p className="mt-0.5 pl-0 text-xs text-muted">{hint}</p> : null}
      </div>
      <div className="relative shrink-0">
        <input
          inputMode="decimal"
          value={text}
          step={step}
          onFocus={() => setFocused(true)}
          onBlur={() => {
            setFocused(false);
            setText(String(value));
          }}
          onChange={(e) => {
            setText(e.target.value);
            onChange(parseNumber(e.target.value));
          }}
          className={cn(
            'tnum w-[132px] rounded-xl border border-line bg-surface-2 px-3 py-2 text-right text-sm font-semibold text-ink',
            'focus:border-brand/60 focus:outline-none focus:ring-2 focus:ring-brand/20',
            suffix && 'pr-9',
          )}
        />
        {suffix ? (
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted">
            {suffix}
          </span>
        ) : null}
      </div>
    </div>
  );
}

export default function ImportCalculator() {
  const t = useT('importCalc');
  const f = useFormat();

  const [draft, setDraft] = useState<Draft | null>(() => readDraft());
  const [reversePrice, setReversePrice] = useState(100_000);

  const {
    data: defaults,
    isLoading,
    isError,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: ['import-defaults'],
    queryFn: () => api.get<ImportDefaults>('/unit/import-defaults'),
    staleTime: 30 * 60_000,
  });

  /**
   * So'rov xato bo'lsa ham kalkulyator ishlashi kerak: qoralama ham, server
   * qiymatlari ham bo'lmasa umumiy zaxira qiymatlar bilan ochiladi.
   * Aks holda sahifa cheksiz "yuklanmoqda" holatida qolardi.
   */
  useEffect(() => {
    if (isError) setDraft((prev) => prev ?? { ...IMPORT_CALC_FALLBACK });
  }, [isError]);

  // Boshlang'ich qiymatlar kelganda formani to'ldiramiz (saqlangan qoralama ustuvor)
  useEffect(() => {
    if (!defaults) return;
    setDraft((prev) => {
      if (!prev) return { ...defaults };
      // Kurs qo'lda tegilmagan bo'lsa — har doim yangi kursni qo'llaymiz
      return prev.rateTouched ? prev : { ...prev, rate: defaults.rate };
    });
  }, [defaults]);

  useEffect(() => {
    if (draft) saveDraft(draft);
  }, [draft]);

  const patch = (p: Partial<Draft>) => setDraft((d) => (d ? { ...d, ...p } : d));

  const result = useMemo(() => (draft ? calcImportPrice(draft) : null), [draft]);

  const reverse = useMemo(() => {
    if (!result || !draft) return null;
    const maxCost = maxCostForPrice(reversePrice, result.maxCostFactor, result.maxCostOffset);
    const cargo = result.cargoCost;
    return { maxCost, cargo, yuan: maxPddPrice(maxCost, cargo, draft.rate) };
  }, [result, draft, reversePrice]);

  if ((isLoading && !draft) || !draft || !result) {
    return (
      <>
        <PageHeader icon={<Ship className="h-5 w-5" />} title={t('title')} description={t('subtitle')} />
        <div className="grid gap-5 lg:grid-cols-[minmax(0,380px)_1fr]">
          <Skeleton className="h-[520px] w-full" />
          <Skeleton className="h-[520px] w-full" />
        </div>
      </>
    );
  }

  const segments = [
    { key: 'commission', value: result.commission, color: CHART_COLORS.danger, label: t('leg.commission') },
    { key: 'ads', value: result.ads, color: CHART_COLORS.warn, label: t('leg.ads') },
    { key: 'delivery', value: result.delivery, color: CHART_COLORS.slate, label: t('leg.delivery') },
    { key: 'cost', value: result.cost, color: CHART_COLORS.info, label: t('leg.cost') },
    { key: 'profit', value: Math.max(0, result.netProfit), color: CHART_COLORS.brand, label: t('leg.profit') },
  ];
  const barTotal = segments.reduce((s, x) => s + x.value, 0) || 1;

  const factorLabel = f.dec(result.maxCostFactor, 3);

  const rateBadge =
    defaults?.rateSource === 'cbu'
      ? { tone: 'brand' as const, text: t('rate.cbu') }
      : { tone: 'warn' as const, text: t('rate.fallback') };

  return (
    <>
      <PageHeader
        icon={<Ship className="h-5 w-5" />}
        title={t('title')}
        description={t('subtitle')}
        actions={
          <Button
            variant="outline"
            size="sm"
            icon={<RotateCcw className="h-3.5 w-3.5" />}
            onClick={() => {
              if (defaults) setDraft({ ...defaults });
            }}
          >
            {t('reset')}
          </Button>
        }
      />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,400px)_1fr]">
        {/* ── Kirish ma'lumotlari ── */}
        <Card>
          <CardHeader title={t('inputs')} icon={<Sparkles className="h-4 w-4" />} />
          <CardBody className="pt-2">
            <NumberField
              label={t('f.pdd')}
              hint={t('f.pdd.hint')}
              icon={<Package className="h-3.5 w-3.5" />}
              value={draft.pddPrice}
              onChange={(v) => patch({ pddPrice: v })}
              suffix="¥"
            />
            <NumberField
              label={t('f.weight')}
              hint={t('f.weight.hint')}
              icon={<Container className="h-3.5 w-3.5" />}
              value={draft.weightGr}
              onChange={(v) => patch({ weightGr: v })}
              suffix="g"
            />
            <NumberField
              label={t('f.rate')}
              hint={
                defaults?.rateUpdatedAt
                  ? `${t('f.rate.hint')} · ${f.date(defaults.rateUpdatedAt)}`
                  : t('f.rate.hint')
              }
              icon={<Landmark className="h-3.5 w-3.5" />}
              badge={
                <span className="flex items-center gap-1">
                  <Badge tone={draft.rateTouched ? 'muted' : rateBadge.tone} className="whitespace-nowrap px-2 py-0.5 text-2xs">
                    {draft.rateTouched ? t('rate.manual') : rateBadge.text}
                  </Badge>
                  <IconButton
                    label={t('rate.refresh')}
                    className="h-6 w-6 rounded-lg border-0 bg-transparent"
                    onClick={() => {
                      patch({ rateTouched: false });
                      void refetch();
                    }}
                  >
                    <RefreshCw className={cn('h-3 w-3', isFetching && 'animate-spin')} />
                  </IconButton>
                </span>
              }
              value={draft.rate}
              onChange={(v) => patch({ rate: v, rateTouched: true })}
            />
            <NumberField
              label={t('f.cargo')}
              hint={t('f.cargo.hint')}
              icon={<Truck className="h-3.5 w-3.5" />}
              value={draft.cargoPerKg}
              onChange={(v) => patch({ cargoPerKg: v })}
            />
            <NumberField
              label={t('f.commission')}
              hint={t('f.commission.hint')}
              icon={<Percent className="h-3.5 w-3.5" />}
              badge={
                defaults?.commissionFromData && draft.commissionPct === defaults.commissionPct ? (
                  <Badge tone="brand" className="whitespace-nowrap px-2 py-0.5 text-2xs" title={t('commission.fromData')}>
                    {t('commission.auto')}
                  </Badge>
                ) : undefined
              }
              value={draft.commissionPct}
              onChange={(v) => patch({ commissionPct: v })}
              suffix="%"
            />
            <NumberField
              label={t('f.ads')}
              hint={t('f.ads.hint')}
              icon={<Megaphone className="h-3.5 w-3.5" />}
              value={draft.adsPct}
              onChange={(v) => patch({ adsPct: v })}
              suffix="%"
            />
            <NumberField
              label={t('f.delivery')}
              hint={t('f.delivery.hint')}
              icon={<Truck className="h-3.5 w-3.5" />}
              value={draft.deliveryFee}
              onChange={(v) => patch({ deliveryFee: v })}
            />
            <NumberField
              label={t('f.profit')}
              hint={t('f.profit.hint')}
              icon={<Wallet className="h-3.5 w-3.5" />}
              value={draft.profitMultiplier}
              onChange={(v) => patch({ profitMultiplier: v })}
              suffix="×"
              step={0.1}
            />

            <div className="flex flex-wrap items-center justify-between gap-3 pt-4">
              <div>
                <p className="text-sm font-medium text-ink">{t('f.round')}</p>
                <p className="mt-0.5 text-xs text-muted">{t('f.round.hint')}</p>
              </div>
              <Segmented
                size="sm"
                value={String(draft.roundStep ?? 1000)}
                onChange={(v) => patch({ roundStep: Number(v) })}
                options={ROUND_STEPS.map((s) => ({
                  value: String(s),
                  label: s === 0 ? t('round.none') : f.num(s),
                }))}
              />
            </div>

            <p className="mt-4 flex items-start gap-2 rounded-xl bg-surface-2 p-3 text-xs leading-relaxed text-muted">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {t('tip')}
            </p>
          </CardBody>
        </Card>

        {/* ── Natija ── */}
        <div className="space-y-5">
          <Card className="bg-aurora p-6">
            {!result.valid ? (
              <div className="py-6 text-center">
                <p className="font-display text-lg font-bold text-danger">{t('invalid.title')}</p>
                <p className="mt-1.5 text-sm text-muted">{t('invalid.hint')}</p>
              </div>
            ) : (
              <>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted">{t('result')}</p>
                <p className="mt-2 flex items-baseline gap-2">
                  <span className="tnum font-display text-[44px] font-extrabold leading-none tracking-tight text-ink sm:text-[56px]">
                    {f.num(result.price)}
                  </span>
                  <span className="text-lg font-semibold text-muted">{t('sum')}</span>
                </p>
                <p className="mt-2 text-sm text-ink-soft">
                  {t('summary', { cost: f.num(result.cost), profit: f.num(result.netProfit) })}
                </p>

                {result.netProfit <= 0 ? (
                  <p className="mt-3 inline-flex rounded-xl bg-danger/10 px-3 py-1.5 text-xs font-semibold text-danger-ink">
                    {t('loss.title')}
                  </p>
                ) : null}

                {/* Taqsimot chizig'i */}
                <div className="mt-6 flex h-7 w-full overflow-hidden rounded-lg">
                  {segments.map((s) => (
                    <div
                      key={s.key}
                      title={`${s.label}: ${f.money(s.value)}`}
                      style={{ width: `${(s.value / barTotal) * 100}%`, background: s.color }}
                      className="h-full transition-[width] duration-500 ease-spring"
                    />
                  ))}
                </div>

                <div className="mt-4 grid gap-x-6 gap-y-2.5 sm:grid-cols-2 lg:grid-cols-3">
                  {segments.map((s) => (
                    <div key={s.key} className="flex items-center justify-between gap-3 text-sm">
                      <span className="flex items-center gap-2 text-muted">
                        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: s.color }} />
                        {s.label}
                      </span>
                      <span className="tnum font-semibold text-ink">{f.num(s.value)}</span>
                    </div>
                  ))}
                </div>

                <div className="mt-5 flex flex-wrap gap-2 border-t border-line pt-4">
                  <Badge tone={result.margin >= 20 ? 'brand' : result.margin > 0 ? 'warn' : 'danger'}>
                    {t('margin')}: {f.pct(result.margin)}
                  </Badge>
                  <Badge tone="info">
                    {t('roi')}: {f.pct(result.roi)}
                  </Badge>
                  <Badge tone="muted">
                    {t('costShare')}: {f.pct(result.costShare)}
                  </Badge>
                </div>
              </>
            )}
          </Card>

          {/* ── Qoida ── */}
          {result.valid ? (
            <Card className="p-5">
              <p className="text-sm text-ink-soft">
                <span className="font-semibold text-ink">{t('rule.title')}</span>{' '}
                <code className="tnum rounded-lg bg-surface-2 px-2 py-1 font-mono text-[13px] text-brand">
                  {t('rule.formula', { factor: factorLabel, offset: f.num(result.maxCostOffset) })}
                </code>
              </p>
              <p className="mt-3 text-sm text-muted">
                {t('rule.example', {
                  price: f.num(reversePrice),
                  max: f.num(maxCostForPrice(reversePrice, result.maxCostFactor, result.maxCostOffset)),
                })}
              </p>
            </Card>
          ) : null}

          {/* ── Teskari hisob ── */}
          {result.valid && reverse ? (
            <Card>
              <CardHeader
                title={t('reverse.title')}
                subtitle={t('reverse.subtitle')}
                icon={<ArrowLeftRight className="h-4 w-4" />}
              />
              <CardBody className="pt-3">
                <div className="grid gap-4 sm:grid-cols-2">
                  <NumberField
                    label={t('reverse.price')}
                    value={reversePrice}
                    onChange={setReversePrice}
                    suffix={t('sum')}
                  />
                  <div className="flex items-center justify-between gap-4 py-3">
                    <span className="text-sm font-medium text-ink">{t('reverse.maxCost')}</span>
                    <span className="tnum font-display text-lg font-bold text-brand">
                      {f.num(reverse.maxCost)}
                    </span>
                  </div>
                </div>

                <div className="mt-2 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-xl bg-surface-2 p-4">
                    <p className="text-xs text-muted">{t('reverse.maxPdd')}</p>
                    <p className="tnum mt-1 font-display text-2xl font-extrabold text-ink">
                      {f.num(reverse.yuan, 2)} <span className="text-base text-muted">¥</span>
                    </p>
                  </div>
                  <div className="rounded-xl bg-surface-2 p-4">
                    <p className="text-xs text-muted">{t('reverse.cargo')}</p>
                    <p className="tnum mt-1 font-display text-2xl font-extrabold text-ink">
                      {f.num(reverse.cargo)} <span className="text-base text-muted">{t('sum')}</span>
                    </p>
                  </div>
                </div>

                {reverse.yuan > 0 ? (
                  <p className="mt-3 text-xs text-muted">
                    {t('rule.pdd', { yuan: f.num(reverse.yuan, 2), weight: f.num(draft.weightGr) })}
                  </p>
                ) : (
                  <p className="mt-3 rounded-xl bg-warn/10 p-3 text-xs leading-relaxed text-warn-ink">
                    {t('reverse.impossible', { cargo: f.num(reverse.cargo), max: f.num(reverse.maxCost) })}
                  </p>
                )}
              </CardBody>
            </Card>
          ) : null}
        </div>
      </div>
    </>
  );
}
