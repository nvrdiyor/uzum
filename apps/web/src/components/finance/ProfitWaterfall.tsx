import { Fragment, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react';
import { Route } from '@/components/icons';
import { Amount, Card, CardBody, CardHeader, Delta, EmptyState, ErrorState, Skeleton } from '@/components/ui';
import { useFormat, useT } from '@/i18n';
import { CHART_COLORS, COST_COLORS, tooltipStyle } from '@/lib/theme';
import { cn } from '@/lib/utils';
import { useUi } from '@/store/ui';
import { PNL_LINE_COLOR, SUBTOTAL_FILL, type FlowStep } from './financeData';

/**
 * Pul oqimi: Tushum → Uzum ushlagani → Hisobga tushadi → qolgan xarajatlar → Sof foyda.
 *
 * P&L jadvali to'g'ri, lekin buxgalter tilida: "yalpi foyda", "tovarlar
 * bo'yicha foyda" qatorlaridan sotuvchi "Uzum har sotuvdan qanchasini oldi,
 * hisobimga qancha tushdi, qo'limda nima qoldi?" degan savolga javobni o'zi
 * yig'ishi kerak edi. Sharshara o'sha raqamlarni pul haqiqatda oqadigan
 * tartibda ko'rsatadi: har ayirma oldingi qoldiqdan "osilib" turadi, oraliq
 * natija va sof foyda noldan to'liq ustun. Hisob serverda (routes/finance.ts
 * FLOW) — bu yerda faqat chiziladi, yangi son yo'q.
 *
 * Recharts ATAYLAB ishlatilmadi: osma ustunlar orasidagi ulagich chiziqlar
 * va ikki qatorli yozuvlar uchun uning ichki holatiga (Customized) kirish
 * kerak bo'lardi. Qadamlar soni kichik va qat'iy, shuning uchun oddiy
 * HTML/CSS: yozuvlar o'zi qatorga bo'linadi, har ustun klaviatura bilan
 * ham ochiladi. Ko'rinishi grafiklar bilan bir xil (tooltipStyle, ustun
 * gradienti, yoritilgan katak).
 */

/** Tarjimasi bor qadamlar (Finance.tsx: flow.<id>, flow.short.<id>); qolganiga server yorlig'i */
const KNOWN = new Set([
  'revenue',
  'commission',
  'delivery',
  'payout',
  'cogs',
  'itemOther',
  'tax',
  'manualTax',
  'marketingUzum',
  'marketingManual',
  'storage',
  'logistics',
  'salary',
  'manualCommission',
  'other',
  'operatingProfit',
]);

/** Izohida qisqa tushuntirish beriladigan qadamlar (flow.hint.<id>) */
const HINTED = new Set(['payout', 'itemOther', 'marketingUzum', 'marketingManual', 'operatingProfit']);

/**
 * Ikkinchi darajali moddalar — o'z oilasining ochroq tusida. Qo'shni ikki
 * reklama (Uzum va qo'lda kiritilgan) yoki soliq juftligi bir xil rangda
 * yonma-yon turib, bitta ustundek o'qilmasin.
 */
const SOFT = new Set(['marketingManual', 'manualTax', 'manualCommission', 'itemOther']);

/**
 * Ustunli ko'rinishda bitta qadamga kamida shuncha joy (px) — "−146,3 mln"
 * 11 px da sig'adi; undan tor bo'lsa yozuvlar qo'shnisiga tegardi va ro'yxat
 * ko'rinishiga o'tiladi. 16 qadamning hammasi ~1030 px kartochkaga sig'adi.
 */
const MIN_COL = 64;
/** Bundan tor katakda summa yozuvi bir pog'ona kichik (12 → 11 px) */
const ROOMY_COL = 76;
/** Ustun eni chegarasi — grafiklardagi MAX_BAND oilasi: kam qadamda "devor" bo'lmasin */
const MAX_BAR = 44;
/** Ustunlar maydoni va uning ustidagi yozuvlar joyi (px) */
const PLOT_H = 232;
const HEAD = 40;
/** Yoritilgan katak — grafiklardagi CURSOR_BAND bilan bir xil */
const BAND_FILL = 'rgb(var(--c-text) / 0.05)';

interface FlowBar {
  step: FlowStep;
  index: number;
  /** Qadamdan oldingi va keyingi qoldiq (natija qadamlarida — 0 va qiymatning o'zi) */
  before: number;
  after: number;
  lo: number;
  hi: number;
  color: string;
  soft: boolean;
  /** 'uzum' — hisobga tushgunicha Uzum ushlaydigan qism, 'costs' — undan keyingilari */
  group: 'uzum' | 'costs' | null;
}

interface Flow {
  bars: FlowBar[];
  lo: number;
  hi: number;
  /** Tushum — ulush va guruh foizlari shunga nisbatan */
  revenue: number;
}

interface FlowGroup {
  key: 'uzum' | 'costs';
  from: number;
  to: number;
  sum: number;
}

function buildFlow(steps: FlowStep[]): Flow {
  const sub = steps.findIndex((s) => s.kind === 'subtotal');
  let run = 0;
  const bars = steps.map((step, index): FlowBar => {
    const minus = step.kind === 'minus';
    const before = minus ? run : 0;
    const after = minus ? run - step.amount : step.amount;
    run = after;
    // Qizil faqat zarar: manfiy natija. Xarajat ustunlari o'z oilasi rangida
    const color =
      !minus && step.amount < 0
        ? CHART_COLORS.danger
        : step.kind === 'end'
          ? COST_COLORS.profit
          : step.kind === 'subtotal'
            ? SUBTOTAL_FILL
            : step.kind === 'start'
              ? (PNL_LINE_COLOR.revenue ?? CHART_COLORS.info)
              : (PNL_LINE_COLOR[step.id] ?? COST_COLORS.other);
    return {
      step,
      index,
      before,
      after,
      lo: Math.min(before, after),
      hi: Math.max(before, after),
      color,
      soft: minus && SOFT.has(step.id),
      group: !minus ? null : sub >= 0 && index < sub ? 'uzum' : 'costs',
    };
  });
  const edges = bars.flatMap((b) => [b.lo, b.hi]);
  const start = steps[0];
  return {
    bars,
    lo: Math.min(0, ...edges),
    hi: Math.max(0, ...edges),
    revenue: start?.kind === 'start' ? start.amount : 0,
  };
}

/** Ketma-ket ayirmalar guruhi: hisobga tushgunicha va undan keyin */
function groupsOf(bars: FlowBar[]): FlowGroup[] {
  const out: FlowGroup[] = [];
  for (const b of bars) {
    if (!b.group) continue;
    const last = out[out.length - 1];
    if (last && last.key === b.group && last.to === b.index - 1) {
      last.to = b.index;
      last.sum += b.step.amount;
    } else {
      out.push({ key: b.group, from: b.index, to: b.index, sum: b.step.amount });
    }
  }
  return out;
}

/** Ustun bo'yog'i: tepada to'q, pastga yengillashadi — grafiklardagi BarGradient kabi */
const barFill = (color: string) => `linear-gradient(180deg, ${color}, color-mix(in srgb, ${color} 62%, transparent))`;

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), Math.max(lo, hi));

/** Element kengligi (px) — o'lcham o'zgarsa yangilanadi (NetProfitHero'dagi kabi, chizishdan oldin) */
function useWidth() {
  const [el, setEl] = useState<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    if (!el) return undefined;
    const measure = () => {
      const w = Math.floor(el.getBoundingClientRect().width);
      // Bir-ikki pikselga o'zgarish (aylantirish chizig'i) qayta chizishga arzimaydi
      setWidth((prev) => (Math.abs(prev - w) < 2 ? prev : w));
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [el]);
  return [setEl, width] as const;
}

/** Qadam yorliqlari va summalari — ustunli va ro'yxat ko'rinishi uchun bitta qoida */
function useFlowText() {
  const t = useT('finance');
  const f = useFormat();
  return useMemo(() => {
    const isLoss = (s: FlowStep) => s.kind === 'end' && s.amount < 0;
    const full = (s: FlowStep) => (isLoss(s) ? t('flow.loss') : KNOWN.has(s.id) ? t(`flow.${s.id}`) : s.label);
    const short = (s: FlowStep) => (isLoss(s) ? t('flow.loss') : KNOWN.has(s.id) ? t(`flow.short.${s.id}`) : s.label);
    /**
     * Ayirma minus bilan, qaytib tushgan pul (manfiy ayirma, masalan reklama
     * qaytarilgani) plyus bilan; natija o'z ishorasida. Nol — ishorasiz.
     */
    const money = (s: FlowStep, v = s.amount) => {
      if (v === 0) return f.money(0);
      if (s.kind !== 'minus') return f.money(v);
      return `${v < 0 ? '+' : '−'} ${f.money(Math.abs(v))}`;
    };
    const compact = (s: FlowStep) => {
      const sign = s.kind === 'minus' ? (s.amount < 0 ? '+' : '−') : s.amount < 0 ? '−' : '';
      return `${s.amount === 0 ? '' : sign}${f.compact(Math.abs(s.amount))}`;
    };
    /*
     * 12 500 so'm 329 mln tushumda 0,004% — server ulushni ikki xonagacha
     * yaxlitlab 0 beradi va "0,0%" chiqardi, holbuki ayirma bor. Summa nol
     * bo'lmasa, juda kichik ulush "<0,1%".
     */
    const share = (s: FlowStep) => (s.amount !== 0 && Math.abs(s.share) < 0.1 ? `<${f.pct(0.1)}` : f.pct(s.share));
    /** Guruh jami: "−61,5 mln · 18,7%" (tushum bo'lmasa — foizsiz) */
    const group = (g: FlowGroup, revenue: number) =>
      `${g.sum < 0 ? '+' : '−'}${f.compact(Math.abs(g.sum))}${revenue > 0 ? ` · ${f.pct((g.sum / revenue) * 100)}` : ''}`;
    return { full, short, money, compact, share, group };
  }, [t, f.lang]); // eslint-disable-line react-hooks/exhaustive-deps
}

export function ProfitWaterfall({
  steps,
  comparable,
  loading,
  error,
  onRetry,
  className,
}: {
  steps: FlowStep[];
  /** Oldingi davr bilan taqqoslab bo'ladimi (server `comparePeriod`) */
  comparable: boolean;
  loading?: boolean;
  /** So'rov xatosi — bo'sh holat o'rniga xato va qayta urinish */
  error?: string | null;
  onRetry?: () => void;
  className?: string;
}) {
  const t = useT('finance');
  const [boxRef, width] = useWidth();
  const flow = useMemo(() => buildFlow(steps), [steps]);
  const empty = steps.length === 0 || steps.every((s) => s.amount === 0);
  // Har qadamga yozuv sig'adigan kenglikda ustunlar, tor ekranda (telefon) gorizontal ro'yxat
  const columns = width > 0 && width >= Math.max(560, flow.bars.length * MIN_COL);

  return (
    <Card tone="brand" className={cn('flex flex-col', className)}>
      <CardHeader icon={<Route className="h-4 w-4" />} title={t('flow.title')} subtitle={t('flow.subtitle')} />
      <CardBody>
        <div ref={boxRef} className="min-w-0">
          {loading ? (
            <Skeleton className="h-[340px] w-full" />
          ) : error ? (
            <ErrorState message={error} onRetry={onRetry} />
          ) : empty ? (
            <EmptyState className="py-10" icon={<Route className="h-6 w-6" />} title={t('flow.empty')} hint={t('flow.emptyHint')} />
          ) : columns ? (
            <FlowColumns flow={flow} width={width} comparable={comparable} />
          ) : (
            <FlowList flow={flow} comparable={comparable} />
          )}
        </div>
      </CardBody>
    </Card>
  );
}

// ─────────────────────────── Ustunli ko'rinish ───────────────────────────

function FlowColumns({ flow, width, comparable }: { flow: Flow; width: number; comparable: boolean }) {
  const t = useT('finance');
  const tc = useT('common');
  const tx = useFlowText();
  const { bars, lo, hi, revenue } = flow;
  const n = bars.length;
  const span = hi - lo || 1;
  const y = (v: number) => HEAD + ((hi - v) / span) * PLOT_H;
  const band = 100 / n;
  // Ustunning yarim eni: katakning 28% i, lekin MAX_BAR dan oshmaydi
  const half = `min(${MAX_BAR / 2}px, ${(band * 0.28).toFixed(4)}%)`;
  const roomy = width / n >= ROOMY_COL;
  const groups = groupsOf(bars);

  const plotRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [active, setActive] = useState<{ index: number; x: number; y: number } | null>(null);
  const [focusIdx, setFocusIdx] = useState(0);

  const onMove = (b: FlowBar) => (e: MouseEvent<HTMLDivElement>) => {
    const r = plotRef.current?.getBoundingClientRect();
    if (!r) return;
    setActive({ index: b.index, x: e.clientX - r.left, y: e.clientY - r.top });
  };
  // Klaviatura (va telefonda bosish) — izoh ustun o'rtasida
  const onFocus = (b: FlowBar) => () => {
    setFocusIdx(b.index);
    setActive({ index: b.index, x: ((b.index + 0.5) / n) * width, y: (y(b.hi) + y(b.lo)) / 2 });
  };
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const next =
      e.key === 'ArrowRight' ? focusIdx + 1 : e.key === 'ArrowLeft' ? focusIdx - 1 : e.key === 'Home' ? 0 : e.key === 'End' ? n - 1 : null;
    if (next === null) return;
    e.preventDefault();
    itemRefs.current[clamp(next, 0, n - 1)]?.focus();
  };

  const tip = active ? bars[active.index] : undefined;

  return (
    <div>
      <div
        ref={plotRef}
        className="relative"
        style={{ height: HEAD + PLOT_H }}
        role="list"
        aria-label={t('flow.title')}
        onMouseLeave={() => setActive(null)}
      >
        {/* Nol chizig'i — natija noldan pastga tushsa (zarar), chegara ko'rinadi */}
        <div aria-hidden className="absolute inset-x-0 border-t border-line-strong" style={{ top: y(0) }} />

        {bars.map((b) => {
          const s = b.step;
          const top = y(b.hi);
          const height = Math.max(2, y(b.lo) - top);
          const center = (b.index + 0.5) * band;
          const anchored = s.kind !== 'minus';
          const next = bars[b.index + 1];
          const prevText = comparable && s.previous !== null ? `, ${t('flow.tip.previous')}: ${tx.money(s, s.previous)}` : '';
          const shareText = s.kind === 'start' ? '' : `, ${tx.share(s)} ${t('exp.ofRevenue')}`;
          return (
            <Fragment key={s.id}>
              {active?.index === b.index ? (
                <div aria-hidden className="absolute inset-y-0 rounded-lg" style={{ left: `${b.index * band}%`, width: `${band}%`, background: BAND_FILL }} />
              ) : null}

              {/* Ustun: ayirma oldingi qoldiqdan osilib turadi, natija — noldan */}
              <div
                aria-hidden
                className={cn(
                  'absolute transition-[top,height] duration-500 ease-out motion-reduce:transition-none',
                  !anchored ? 'rounded-[3px]' : s.amount < 0 ? 'rounded-b-[4px]' : 'rounded-t-[4px]',
                )}
                style={{
                  left: `calc(${center}% - ${half})`,
                  width: `calc(2 * ${half})`,
                  top,
                  height,
                  background: barFill(b.color),
                  opacity: b.soft ? 0.62 : 1,
                }}
              />

              {/* Ulagich: shu qadamdan keyingi qoldiq keyingi ustunga o'tadi */}
              {next ? (
                <div
                  aria-hidden
                  className="absolute border-t border-line-strong"
                  style={{ left: `calc(${center}% + ${half})`, width: `calc(${band}% - 2 * ${half})`, top: y(b.after) }}
                />
              ) : null}

              {/* Summa va tushumdagi ulush — ustun tepasida, matn rangi doim matn tokenida */}
              <div
                aria-hidden
                className="pointer-events-none absolute -translate-x-1/2 text-center"
                style={{ left: `${center}%`, top: top - 35 }}
              >
                <p
                  className={cn(
                    'tnum whitespace-nowrap font-semibold leading-4',
                    roomy ? 'text-[12px]' : 'text-[11px]',
                    anchored && s.amount < 0 ? 'text-danger' : 'text-ink',
                  )}
                >
                  {tx.compact(s)}
                </p>
                <p className="tnum whitespace-nowrap text-2xs leading-4 text-muted">
                  {/* Tushum ulushi doim 100% — shovqin; bo'sh qator ustunlar balandligini teng tutadi */}
                  {s.kind === 'start' ? <>&nbsp;</> : tx.share(s)}
                </p>
              </div>

              {/* Butun katak — sichqoncha, bosish va klaviatura nishoni (ustunning o'zidan katta) */}
              <div
                ref={(el) => {
                  itemRefs.current[b.index] = el;
                }}
                role="listitem"
                tabIndex={b.index === focusIdx ? 0 : -1}
                aria-label={`${tx.full(s)}: ${tx.money(s)}${shareText}${prevText}`}
                className="absolute inset-y-0 rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/50"
                style={{ left: `${b.index * band}%`, width: `${band}%` }}
                onMouseEnter={onMove(b)}
                onMouseMove={onMove(b)}
                onFocus={onFocus(b)}
                onBlur={() => setActive(null)}
                onKeyDown={onKey}
              />
            </Fragment>
          );
        })}

        {tip ? (
          <div
            className="pointer-events-none absolute z-20"
            style={{
              left: active?.x,
              top: clamp(active?.y ?? 0, 72, HEAD + PLOT_H - 72),
              // Chap yarimda — o'ngga, o'ng yarimda — chapga: izoh kartochkadan chiqmaydi
              transform: (active?.x ?? 0) < width / 2 ? 'translate(16px, -50%)' : 'translate(calc(-100% - 16px), -50%)',
            }}
          >
            <FlowTip bar={tip} comparable={comparable} />
          </div>
        ) : null}
      </div>

      {/* Qadam nomlari — ustunlar bilan bir xil kataklar; uzun nom o'zi ikki qatorga bo'linadi */}
      <div aria-hidden className="mt-2 grid" style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}>
        {bars.map((b) => (
          <p
            key={b.step.id}
            className={cn(
              // Zich ustunda (64–76 px) 10 px: "Commission", "Логистика" so'z o'rtasidan bo'linmasin
              'hyphens-auto break-words text-center leading-tight',
              roomy ? 'px-1 text-2xs' : 'px-0.5 text-[10px]',
              b.step.kind === 'minus' ? 'text-muted' : 'font-semibold text-ink-soft',
            )}
            title={tx.full(b.step)}
          >
            {tx.short(b.step)}
          </p>
        ))}
      </div>

      {/* Guruh qavslari: Uzum hisobga tushgunicha qancha ushlaydi va qolgan xarajatlar — tushumga nisbatan */}
      {groups.length ? (
        <div aria-hidden className="mt-2.5 grid" style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}>
          {groups.map((g) => (
            <div key={`${g.key}-${g.from}`} className="min-w-0 px-1" style={{ gridColumn: `${g.from + 1} / ${g.to + 2}` }}>
              <div className="h-1.5 rounded-b-[3px] border-x border-b border-line-strong" />
              {/* Nom va son alohida qatorda: ikki ustunli tor qavsda ham uch qatorga sochilmaydi */}
              <p className="mt-1 text-center text-2xs font-semibold leading-tight text-ink-soft">{t(`flow.group.${g.key}`)}</p>
              <p className="tnum text-center text-2xs leading-tight text-muted">{tx.group(g, revenue)}</p>
            </div>
          ))}
        </div>
      ) : null}

      <p className="mt-3 text-2xs text-muted">{t(comparable ? 'flow.hover' : 'flow.hoverNoCompare')}</p>
      {/* Klaviatura foydalanuvchisi uchun: oldingi davr umuman yo'qligi sababi */}
      {!comparable ? <span className="sr-only">{tc('common.noCompare')}</span> : null}
    </div>
  );
}

/** Izoh oynasi — grafiklardagi TipCard ko'rinishida: qiymat yorqin, nom ikkinchi darajada */
function FlowTip({ bar, comparable }: { bar: FlowBar; comparable: boolean }) {
  const t = useT('finance');
  const f = useFormat();
  const tx = useFlowText();
  /*
   * "Hisobga tushadi" izohi sana asosiga qarab: buyurtma sanasida yo'ldagi
   * buyurtmalar ham kiradi, qabul sanasida — yo'q. Asos sahifa so'rovi bilan
   * bitta joydan (store/ui.ts, Finance.tsx useMoneyQuery) (2026-10-27).
   */
  const basis = useUi((st) => st.basis);
  const s = bar.step;
  const minus = s.kind === 'minus';
  const hintKey = s.id === 'payout' && basis === 'receipt' ? 'flow.hint.payout.receipt' : `flow.hint.${s.id}`;
  const hint = HINTED.has(s.id) && !(s.kind === 'end' && s.amount < 0) ? t(hintKey) : null;

  return (
    <div style={tooltipStyle()} className="w-max min-w-[212px] max-w-[288px]">
      <p className="font-semibold text-ink">{tx.full(s)}</p>
      {hint ? <p className="mt-0.5 text-2xs leading-snug text-muted">{hint}</p> : null}
      <div className="mt-2 space-y-1">
        <TipLine color={bar.color} name={t('flow.tip.amount')} value={tx.money(s)} negative={!minus && s.amount < 0} />
        <TipLine name={t('flow.tip.share')} value={tx.share(s)} />
        {minus ? <TipLine name={t('flow.tip.left')} value={f.money(bar.after)} negative={bar.after < 0} /> : null}
      </div>
      {comparable && s.previous !== null ? (
        // Oldingi davr — alohida qism (TipCard'dagi kabi uzuq chiziqcha bilan)
        <div className="mt-1.5 border-t border-line pt-1.5">
          <div className="flex items-center justify-between gap-6">
            <span className="flex items-center gap-2 whitespace-nowrap text-muted">
              <span className="w-2.5 shrink-0 border-t-2 border-dashed" style={{ borderColor: 'rgb(var(--c-muted))' }} />
              {t('flow.tip.previous')}
            </span>
            <span className={cn('tnum whitespace-nowrap font-semibold', !minus && s.previous < 0 ? 'text-danger' : 'text-ink-soft')}>
              {tx.money(s, s.previous)}
            </span>
          </div>
          <div className="mt-1 flex justify-end">
            {/* Xarajat o'sishi — yomon (qizil), natija o'sishi — yaxshi */}
            <Delta value={s.deltaPct} invert={minus} />
          </div>
        </div>
      ) : null}
    </div>
  );
}

function TipLine({ name, value, color, negative }: { name: string; value: string; color?: string; negative?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-6">
      <span className="flex items-center gap-2 whitespace-nowrap text-ink-soft">
        {color ? (
          <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: color }} />
        ) : (
          <span className="w-2 shrink-0" />
        )}
        {name}
      </span>
      <span className={cn('tnum whitespace-nowrap font-semibold', negative ? 'text-danger' : 'text-ink')}>{value}</span>
    </div>
  );
}

// ─────────────────────────── Ro'yxat ko'rinishi (telefon) ───────────────────────────

/**
 * Tor ekranda ustunlar ignadek ingichka, yozuvlar esa ustma-ust tushardi.
 * U yerda har qadam alohida qator: nom, summa va o'sha sharshara oralig'i
 * (P&L jadvalidagi kabi), oxirida ulush va o'zgarish — izohsiz ham hammasi
 * ko'rinadi (telefonda sichqoncha yo'q).
 */
function FlowList({ flow, comparable }: { flow: Flow; comparable: boolean }) {
  const t = useT('finance');
  const tx = useFlowText();
  const { bars, lo, hi, revenue } = flow;
  const span = hi - lo || 1;
  const groups = groupsOf(bars);

  return (
    <ol aria-label={t('flow.title')} className="space-y-0.5">
      {bars.map((b) => {
        const s = b.step;
        const minus = s.kind === 'minus';
        const result = s.kind === 'subtotal' || s.kind === 'end';
        const negative = !minus && s.amount < 0;
        const g = groups.find((x) => x.from === b.index);
        return (
          <li key={s.id} className={cn(result && 'mt-1.5 border-t border-line pt-1')}>
            {g ? (
              <p className="flex items-baseline justify-between gap-3 px-1 pb-1 pt-2.5">
                <span className="eyebrow">{t(`flow.group.${g.key}`)}</span>
                <span className="tnum text-2xs text-muted">{tx.group(g, revenue)}</span>
              </p>
            ) : null}
            <div className="px-1 py-1.5">
              <div className="flex items-center gap-2.5">
                <span
                  className={cn('shrink-0 rounded-full', result || s.kind === 'start' ? 'h-2.5 w-2.5' : 'h-2 w-2')}
                  style={{ background: b.color, opacity: b.soft ? 0.62 : 1 }}
                />
                {/* Uzun nom ("Komissiya (qo‘lda kiritilgan)") telefonda kesilmaydi — ikki qatorga o'tadi */}
                <span
                  className={cn(
                    'line-clamp-2 min-w-0 flex-1 break-words text-sm leading-snug',
                    minus ? 'text-ink-soft' : 'font-display font-semibold text-ink',
                  )}
                  title={tx.full(s)}
                >
                  {tx.full(s)}
                </span>
                <span
                  className={cn(
                    'tnum shrink-0 whitespace-nowrap text-sm',
                    minus ? 'font-semibold text-ink' : 'font-display font-bold',
                    negative ? 'text-danger' : s.kind === 'end' ? 'text-brand-ink' : !minus && 'text-ink',
                  )}
                >
                  <Amount value={tx.money(s)} nowrap />
                </span>
              </div>
              <div className="ml-[18px] mt-1.5 flex items-center gap-2.5">
                <span className="relative h-2 min-w-0 flex-1 rounded-full bg-surface-3/70" aria-hidden>
                  <span
                    className="absolute inset-y-0 rounded-full"
                    style={{
                      left: `${((b.lo - lo) / span) * 100}%`,
                      // Juda kichik modda ham ko'rinsin — kamida 3 px
                      width: `max(3px, ${((b.hi - b.lo) / span) * 100}%)`,
                      background: b.color,
                      opacity: b.soft ? 0.62 : 1,
                    }}
                  />
                </span>
                <span className="tnum w-11 shrink-0 text-right text-2xs text-muted">
                  {s.kind === 'start' ? '' : tx.share(s)}
                </span>
                {/* Qat'iy enli joy: "—" va "+26,2%" chiplari bilan chiziqlar bir xil uzunlikda qoladi */}
                {comparable ? (
                  <span className="flex w-[68px] shrink-0 justify-end">
                    <Delta value={s.deltaPct} invert={minus} className="px-1.5 text-[11px]" />
                  </span>
                ) : null}
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
