/**
 * Oylik hisobot sahifasi uchun yordamchi bloklar.
 * Faqat `pages/Reports.tsx` ishlatadi — tarjimalar 'reports' namespace'ida.
 *
 * Rang ma'no bildiradi (index.css): firuza — sotuvchining puli va foydasi,
 * binafsha — Uzum ulushi, za'faron — xavf, qizil — faqat yo'qotish, ko'k —
 * buyurtma oqimi, qoldiq va logistika. Xarajat turlari hamma sahifada bir xil
 * ranglarda (COST_COLORS) — Boshqaruv panelida komissiya qaysi rangda bo'lsa,
 * hisobotda ham o'sha.
 */
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowRight,
  ArrowDownRight,
  CheckCircle2,
  CircleCheck,
  Hourglass,
  Info,
  Layers,
  Lightbulb,
  PackageCheck,
  Trophy,
  Truck,
  Undo2,
  Wallet,
  Warehouse,
} from '@/components/icons';
import {
  EXPENSE_CATEGORIES,
  type DeliveryType,
  type ExpenseCategory,
  type Insight,
  type MonthlyReportFinality,
  type MonthlyReportResponse,
  type TopProductRow,
} from '@savdoiq/shared';
import {
  Amount,
  Badge,
  Card,
  CardBody,
  CardHeader,
  DataTable,
  Delta,
  EmptyState,
  HeroCard,
  ProgressBar,
  ProgressRing,
  RankBadge,
  type Column,
  type Tone,
} from '@/components/ui';
import { ProductTitleCell } from '@/components/sales/ProductTitleCell';
import { returnsTone } from '@/components/dashboard/rates';
import { useCountUp } from '@/hooks/useCountUp';
import { CHART_COLORS, COST_COLORS } from '@/lib/theme';
import { useFormat, useLang, useT } from '@/i18n';
import { cn } from '@/lib/utils';
import type { DateBasis } from '@/store/ui';

/**
 * Qabul sanasi rejimidagi matn kaliti: `kalit.receipt` (Reports.tsx). Raqamlar
 * o'sha javobdan — faqat izoh rejimga mos bo'ladi: bu rejimda yo'ldagi tovar
 * yo'q va "bekor qilingan" deyarli doim 0, eski matnlar esa buni aytmasdi
 * (2026-10-27).
 */
const byBasis = (key: string, basis: DateBasis | undefined): string => (basis === 'receipt' ? `${key}.receipt` : key);

// ─────────────────────────── Chop etish uslublari ───────────────────────────

/**
 * Print-friendly CSS. Global uslublarga tegmaslik uchun sahifaning o'zida turadi:
 * chop etishda faqat `.report-sheet` ko'rinadi.
 */
export function PrintStyles() {
  return (
    <style>{`
      .print-only { display: none; }

      @media print {
        @page { margin: 12mm; }

        html, body { background: white !important; }

        /* Chop etishda faqat hisobot varag'i ko'rinadi */
        body * { visibility: hidden !important; }
        .report-sheet, .report-sheet * { visibility: visible !important; }
        .report-sheet {
          position: absolute !important;
          left: 0 !important;
          top: 0 !important;
          width: 100% !important;
        }

        .no-print { display: none !important; }
        .print-only { display: block !important; }

        .print-avoid-break { break-inside: avoid; page-break-inside: avoid; }
        .print-break-before { break-before: page; page-break-before: always; }

        .report-sheet .card, .report-sheet .hero-card { box-shadow: none !important; }

        * {
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
        }
      }
    `}</style>
  );
}

/** Chop etilgan varaqning sarlavhasi (ekranda ko'rinmaydi) */
export function PrintHead({
  from,
  to,
  finality,
  basis,
}: {
  from: string;
  to: string;
  finality?: MonthlyReportFinality;
  basis?: DateBasis;
}) {
  const t = useT('reports');
  const f = useFormat();
  return (
    <div className="print-only mb-4 border-b border-line pb-3">
      <p className="font-display text-xl font-extrabold text-ink">{t('print.head')}</p>
      <p className="tnum mt-1 text-sm text-muted">
        {f.date(from)} — {f.date(to)}
        {/* Qabul sanasi bo'yicha PDF buni o'zi aytsin — buyurtma sanasidagi bilan adashmasin */}
        {basis === 'receipt' ? ` · ${t('print.receipt')}` : null}
        {/* PDF ham Excel kabi holatini aytadi — oraliq hisobot buxgalterga yakuniy deb ketmasin */}
        {finality
          ? ` · ${
              finality.status === 'final'
                ? t('final.final', { v: f.pct(finality.completionPct, 1) })
                : t('final.preliminary', { v: f.pct(finality.completionPct, 1) })
            }`
          : null}
      </p>
    </div>
  );
}

// ─────────────────────────── Hisobot holati ───────────────────────────

/**
 * "Yakuniy / Oraliq" chipi — Excel fayl va Telegram nusxasidagi "Holat"
 * qatorining o'zi (2026-10-24). Joriy oy yoki ko'p donasi hali yo'lda bo'lgan
 * oy raqamlari o'zgaradi: sotuvchi uni buxgalterga yakuniy deb yubormasin.
 * Foiz bir kasr bilan — butunga yaxlitlansa 94,6% "95%" bo'lib, chegaraga
 * yetgandek ko'rinardi.
 */
export function FinalityChip({
  finality,
  className,
  basis,
}: {
  finality: MonthlyReportFinality;
  className?: string;
  basis?: DateBasis;
}) {
  const t = useT('reports');
  const f = useFormat();
  const final = finality.status === 'final';
  const done = f.pct(finality.completionPct, 1);
  // Qabul sanasida 'in_transit' bo'lmaydi (server finalityOf) — faqat "davr tugamagan" yoki "yakuniy"
  const why = final
    ? t(byBasis('final.finalHint', basis))
    : finality.reason === 'current'
      ? t(byBasis('final.currentHint', basis))
      : t('final.transitHint', { n: f.num(finality.inTransitUnits) });
  const rule = t(byBasis('final.rule', basis), {
    done: f.num(finality.completedUnits),
    total: f.num(finality.orderedUnits),
    v: f.pct(finality.thresholdPct, 0),
  });

  return (
    <span
      className={cn('meta-chip tnum', !final && 'border-warn/40 bg-warn/10 text-warn-ink', className)}
      title={`${why}\n${rule}`}
    >
      {final ? (
        <CircleCheck className="h-3.5 w-3.5 text-brand" />
      ) : (
        <Hourglass className="h-3.5 w-3.5 text-warn-ink" />
      )}
      {final ? t('final.final', { v: done }) : t('final.preliminary', { v: done })}
    </span>
  );
}

// ─────────────────────────── Ohang va ranglar ───────────────────────────

/**
 * Ohang klasslari TO'LIQ yozilgan. Tailwind faqat manba matnida butun holda
 * uchragan klassni CSS'ga chiqaradi: `tone-${tone}` kabi yig'ilgan nom
 * skanerdan o'tmaydi. 2026-10-24 da shu sabab bilan sariq, qizil va ko'k deb
 * berilgan kartochkalar ham brend rangida chizilayotgan edi.
 */
export const TONE_CLASS: Record<Tone, string> = {
  brand: 'tone-brand',
  info: 'tone-info',
  warn: 'tone-warn',
  danger: 'tone-danger',
  violet: 'tone-violet',
  muted: 'tone-muted',
};

type ValueTone = 'ink' | Exclude<Tone, 'muted'>;

const VALUE_TONE: Record<ValueTone, string> = {
  ink: 'text-ink',
  brand: 'text-brand-ink',
  info: 'text-info-ink',
  warn: 'text-warn-ink',
  danger: 'text-danger-ink',
  violet: 'text-violet-ink',
};

/** Xarajat turining rangi — hamma sahifada bir xil (COST_COLORS, lib/theme.ts) */
const EXPENSE_COLOR: Record<ExpenseCategory, string> = {
  commission: COST_COLORS.commission,
  logistics: COST_COLORS.logistics,
  storage: COST_COLORS.storage,
  marketing: COST_COLORS.marketing,
  tax: COST_COLORS.tax,
  salary: COST_COLORS.salary,
  other: COST_COLORS.other,
};

/** Lentadagi tartib: avval Uzum oladigan qism, keyin davlat, keyin sotuvchining o'zi */
const EXPENSE_ORDER: ExpenseCategory[] = ['commission', 'logistics', 'storage', 'marketing', 'tax', 'salary', 'other'];

function useExpenseLabel() {
  const lang = useLang();
  return (id: ExpenseCategory): string => {
    const def = EXPENSE_CATEGORIES.find((c) => c.id === id);
    return def ? (def.label[lang] ?? def.label.uz) : id;
  };
}

// ─────────────────────────── Kichik yordamchilar ───────────────────────────

/** Kartochka ichidagi statistik plitka — hamma bloklarda bir xil */
function StatWell({
  label,
  value,
  hint,
  tone = 'ink',
  className,
}: {
  label: ReactNode;
  value: ReactNode;
  hint?: ReactNode;
  tone?: ValueTone;
  className?: string;
}) {
  return (
    <div className={cn('well min-w-0 px-3.5 py-3', className)}>
      <p className="eyebrow flex min-w-0 items-center gap-1.5">{label}</p>
      <p className={cn('tnum mt-1.5 font-display text-xl font-bold leading-tight tracking-[-0.01em]', VALUE_TONE[tone])}>
        {value}
      </p>
      {hint ? <p className="mt-1 text-2xs leading-snug text-muted">{hint}</p> : null}
    </div>
  );
}

/** Plitkaning yotiq varianti: chapda nom va izoh, o'ngda raqam — tor kartochkada ham sig'adi */
function StatRow({
  label,
  value,
  hint,
  tone = 'ink',
}: {
  label: ReactNode;
  value: ReactNode;
  hint?: ReactNode;
  tone?: ValueTone;
}) {
  return (
    <div className="well flex items-center justify-between gap-3 px-3.5 py-2.5">
      <div className="min-w-0">
        <p className="eyebrow truncate">{label}</p>
        {hint ? <p className="mt-0.5 truncate text-2xs text-muted">{hint}</p> : null}
      </div>
      <p className={cn('tnum shrink-0 font-display text-lg font-bold leading-tight', VALUE_TONE[tone])}>{value}</p>
    </div>
  );
}

/** Ingichka chiziq — rangi token orqali (COST_COLORS kabi qatorlar uchun) */
function Meter({ value, color, className }: { value: number; color: string; className?: string }) {
  return (
    <div className={cn('h-1.5 overflow-hidden rounded-full bg-surface-3', className)}>
      <div
        className="h-full origin-left animate-grow-x rounded-full"
        style={{ width: `${Math.max(0, Math.min(100, value))}%`, background: color }}
      />
    </div>
  );
}

interface Segment {
  key: string;
  label: string;
  amount: number;
  color: string;
}

/**
 * 100% li bo'lakli lenta. Har bo'lak ustida sichqoncha to'xtasa nomi va
 * summasi chiqadi; juda kichik bo'lak ham ko'rinib tursin deb kamida 4px.
 */
function SegmentBar({ segments, label, className }: { segments: Segment[]; label: string; className?: string }) {
  const f = useFormat();
  const total = segments.reduce((s, x) => s + Math.max(0, x.amount), 0);
  const shown = segments.filter((s) => s.amount > 0);
  return (
    <div
      role="img"
      aria-label={`${label}: ${shown.map((s) => `${s.label} ${f.pct(total ? (s.amount / total) * 100 : 0, 0)}`).join(', ')}`}
      className={cn('flex h-3 w-full gap-[3px]', className)}
    >
      {total > 0 ? (
        shown.map((s, i) => (
          <div
            key={s.key}
            title={`${s.label} — ${f.money(s.amount)} (${f.pct((s.amount / total) * 100, 1)})`}
            className="h-full min-w-[4px] origin-left animate-grow-x rounded-full"
            style={{ flex: `${s.amount} 1 0%`, background: s.color, animationDelay: `${80 + i * 70}ms` }}
          />
        ))
      ) : (
        <div className="h-full flex-1 rounded-full bg-surface-3" />
      )}
    </div>
  );
}

// ─────────────────────────── Davr natijasi (asosiy kartochka) ───────────────────────────

/**
 * Sahifadagi YAGONA HeroCard: davrning sof foydasi va tushumning har bir
 * so'mi qayerga ketgani. Lentadagi bo'laklar serverdagi tayyor raqamlardan
 * (api services/monthly-report.ts): tannarx, javobdagi xarajat kategoriyalari
 * va sof foyda — davr xarajatlaridan keyin, Boshqaruv panelidagi bilan bir
 * xil. Soliq qatori pozitsiyalarda haqiqatda ayrilgan soliq, shuning uchun
 * yig'indi tushumga teng. Yangi hisob yo'q: Excel fayl ham, Telegram'ga
 * yuboriladigan nusxa ham aynan shu raqamlar; ranglar pastdagi "Davr
 * xarajatlari" kartochkasi bilan bir xil.
 */
export function ResultHero({
  report,
  prevMargin,
  className,
}: {
  report: MonthlyReportResponse;
  /** Oldingi kalendar oyining sof marjasi (%) — davr bitta oy bo'lgandagina */
  prevMargin: number | null;
  className?: string;
}) {
  const t = useT('reports');
  const f = useFormat();
  const expenseLabel = useExpenseLabel();

  const revenue = Math.max(0, report.revenue);
  const profit = report.netProfit;
  const loss = profit < 0;
  const cogs = Math.max(0, report.cogs);
  // Serverdagi marja — Excel fayldagi "Sof marja" katagi bilan bitta qiymat
  const margin = revenue > 0 ? report.margin : null;
  const marginDelta = margin !== null && prevMargin !== null ? margin - prevMargin : null;
  const shownProfit = useCountUp(profit);

  const byCategory = new Map(report.expenses.map((e) => [e.category, e.amount]));
  const expenseSegments: Segment[] = EXPENSE_ORDER.map((id) => ({
    key: id,
    label: expenseLabel(id),
    amount: Math.max(0, byCategory.get(id) ?? 0),
    color: EXPENSE_COLOR[id],
  })).filter((s) => s.amount > 0);
  const expensesTotal = expenseSegments.reduce((s, x) => s + x.amount, 0);

  const segments: Segment[] = [
    { key: 'cogs', label: t('hero.cogs'), amount: cogs, color: COST_COLORS.cogs },
    ...expenseSegments,
    // Zararda "foyda" bo'lagi yo'q — lenta xarajatlarning o'zidan iborat va tushumdan uzun
    ...(loss ? [] : [{ key: 'profit', label: t('hero.profit'), amount: profit, color: COST_COLORS.profit }]),
  ];
  const base = segments.reduce((s, x) => s + x.amount, 0);
  const ofRevenue = (v: number) => (revenue > 0 ? f.pct((v / revenue) * 100, 1) : '—');

  const groups: { key: string; swatch: ReactNode; label: string; amount: number; hint: string; tone: ValueTone }[] = [
    {
      key: 'cogs',
      swatch: <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: COST_COLORS.cogs }} />,
      label: t('hero.cogs'),
      amount: cogs,
      hint: t('hero.cogsHint'),
      tone: 'ink',
    },
    {
      key: 'costs',
      // Kichik ko'p rangli namuna: "Xarajatlar" lentadagi qaysi bo'laklar ekani ko'rinsin
      swatch: (
        <span className="flex h-2 w-5 shrink-0 gap-px overflow-hidden rounded-full" aria-hidden>
          {expenseSegments.map((s) => (
            <span key={s.key} className="h-full" style={{ flex: `${s.amount} 1 0%`, background: s.color }} />
          ))}
        </span>
      ),
      label: t('hero.costs'),
      amount: expensesTotal,
      hint: t('hero.costsHint'),
      tone: 'ink',
    },
    {
      key: 'profit',
      swatch: <span className={cn('h-2 w-2 shrink-0 rounded-full', loss ? 'bg-danger' : 'bg-brand')} />,
      label: loss ? t('hero.loss') : t('hero.profit'),
      amount: Math.abs(profit),
      hint: t('hero.netHint'),
      tone: loss ? 'danger' : 'brand',
    },
  ];

  return (
    <HeroCard tone={loss ? 'danger' : 'brand'} className={cn('print-avoid-break flex flex-col p-5 sm:p-7', className)}>
      <div className="flex flex-wrap items-start justify-between gap-x-8 gap-y-5">
        <div className="min-w-0">
          <p className="eyebrow-lg">{loss ? t('hero.loss') : t('hero.profit')}</p>
          <p
            className={cn(
              'tnum mt-2 font-title text-[32px] font-semibold leading-none tracking-[-0.03em] sm:text-[42px]',
              loss ? 'text-danger-ink' : 'text-ink',
            )}
          >
            <Amount value={f.money(shownProfit)} />
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {margin !== null ? (
              <Badge tone={loss ? 'danger' : 'brand'} className="tnum font-semibold">
                {t('hero.margin', { v: f.pct(margin, 1) })}
              </Badge>
            ) : null}
            {/*
              Marja — foiz ko'rsatkich, o'zgarishi foiz punktida. Oldingi qiymat
              faqat davr bitta kalendar oyi bo'lganda bor (oylar taqqoslovidan);
              boshqa davrda chip chiqmaydi — taxmin qilib yozilmaydi.
            */}
            {marginDelta !== null && prevMargin !== null ? (
              <>
                <Delta value={marginDelta} unit="pp" />
                <span className="tnum text-xs text-muted">{t('hero.prevMonth', { v: f.pct(prevMargin, 1) })}</span>
              </>
            ) : null}
            {loss ? (
              <span className="text-sm text-muted">{t('hero.lost', { v: f.money(Math.abs(profit)) })}</span>
            ) : null}
          </div>
        </div>

        {/* Yalpi foyda — tannarxdan keyin, xarajatlardan oldin; lentadagi "Xarajatlar + Sof foyda" ga teng */}
        <div className="min-w-0 sm:ml-auto sm:text-right">
          <p className="eyebrow-lg">{t('hero.gross')}</p>
          <p className="tnum mt-2 font-display text-[22px] font-bold leading-none tracking-[-0.02em] text-ink sm:text-2xl">
            <Amount value={f.money(report.grossProfit)} />
          </p>
          <p className="tnum mt-2.5 text-xs text-muted">{t('hero.grossHint', { v: f.pct(report.grossMargin, 1) })}</p>
        </div>
      </div>

      {/* mt-auto: yonidagi ustun balandroq bo'lsa ham lenta kartochka pastida turadi */}
      <div className="mt-7 sm:mt-auto sm:pt-8">
        <div className="mb-2.5 flex items-center justify-between gap-3">
          <p className="eyebrow">{t('hero.bar')}</p>
          {/* Telefonda yashirin: tushum yuqoridagi "Tushum" kartochkasida bor, bu yerda ikki qatorga sinardi */}
          <p className="tnum hidden text-2xs text-muted sm:block">{t('hero.barBase', { v: f.money(revenue) })}</p>
        </div>
        <div className="relative">
          <SegmentBar segments={segments} label={t('hero.bar')} />
          {/* Zararda lenta tushumdan uzun — tushum qayerda tugagani belgilanadi */}
          {loss && base > 0 && revenue > 0 ? (
            <span
              className="absolute -top-1 h-5 w-0.5 -translate-x-1/2 rounded-full bg-ink/80"
              style={{ left: `${(revenue / base) * 100}%` }}
              title={t('hero.revenueMark')}
              aria-hidden
            />
          ) : null}
        </div>

        <ul className="mt-5 grid gap-x-6 gap-y-4 sm:grid-cols-3">
          {groups.map((g) => (
            <li key={g.key} className="min-w-0">
              <div className="flex items-center gap-2 text-[13px] font-medium text-ink-soft">
                {g.swatch}
                <span className="truncate">{g.label}</span>
                <span className="tnum ml-auto text-muted sm:ml-0">{ofRevenue(g.amount)}</span>
              </div>
              <p className={cn('tnum mt-1.5 text-[17px] font-semibold leading-6', VALUE_TONE[g.tone])}>
                <Amount value={f.money(g.amount)} />
              </p>
              <p className="line-clamp-2 text-xs text-muted">{g.hint}</p>
            </li>
          ))}
        </ul>
      </div>
    </HeroCard>
  );
}

// ─────────────────────────── Buyurtmalar oqimi ───────────────────────────

export function OrdersFlowCard({ report, basis }: { report: MonthlyReportResponse; basis?: DateBasis }) {
  const t = useT('reports');
  const f = useFormat();
  const rate = Number.isFinite(report.successRate) ? report.successRate : 0;

  return (
    <Card tone="info" className="print-avoid-break">
      <CardHeader
        icon={<PackageCheck className="h-4 w-4" />}
        title={t('orders.title')}
        subtitle={t(byBasis('orders.subtitle', basis))}
      />
      <CardBody className="flex flex-col items-center gap-5 sm:flex-row sm:items-center">
        {/* Halqa brend rangida: muvaffaqiyatli buyurtma — sotuvchining puli */}
        <ProgressRing value={rate} size={120} stroke={10} tone="brand">
          <span className="tnum font-display text-[22px] font-bold tracking-tight text-ink">{f.pct(rate, 1)}</span>
          {/* Kichik harfda: bosh harfli "MUVAFFAQIYAT" halqa ichiga sig'masdan chiziqqa tegardi */}
          <span className="mt-0.5 text-2xs font-medium text-muted">{t('orders.rate')}</span>
        </ProgressRing>

        {/*
          Uch plitka yotiq qatorda: yarim kenglikdagi kartochkada ular uch
          ustunga bo'linganda yorliqlar sinib, izohlar uch qatorga tushardi.
        */}
        <div className="w-full flex-1 space-y-2">
          <StatRow label={t('orders.total')} value={f.num(report.ordersTotal)} hint={t(byBasis('orders.totalHint', basis))} />
          <StatRow
            label={t('orders.success')}
            value={f.num(report.ordersSuccess)}
            hint={t('orders.successHint')}
            tone="brand"
          />
          <StatRow label={t('orders.units')} value={f.num(report.unitsSold)} hint={t('orders.unitsHint')} />
        </div>
      </CardBody>
    </Card>
  );
}

// ─────────────────────────── Xavf va qaytarishlar ───────────────────────────

/** Shkala 0–20%: chiziq uzunligi = ulush × 5 */
const RISK_SCALE = 5;
/** Xavfli zona chegarasi, % — rates.ts returnsTone dagi "danger" bilan bir xil */
const RISK_DANGER_PCT = 8;

export function RiskCard({ report, basis }: { report: MonthlyReportResponse; basis?: DateBasis }) {
  const t = useT('reports');
  const f = useFormat();
  /*
   * Qaytarish ulushi — DONA bo'yicha: Boshqaruv panelidagi "Qaytarish va
   * bekor qilish" kartasining aynan o'zi (server: services/returns.ts) va
   * o'sha ranglar bilan (rates.ts returnsTone: 4% dan sariq, 8% dan qizil).
   * Ilgari bu yerda "qaytgan buyurtma ÷ barcha buyurtma" va 5/10% chegaralar
   * turardi — bir oy uchun panel bilan ikki xil foiz va ikki xil rang
   * (2026-10-27). Asos (qabul qilingan + qaytgan dona) 0 bo'lsa — tire, panel
   * kartasidagidek: yashil "0%" "qaytarish yo'q" deb o'qilardi. Pastdagi
   * ikki plitka esa buyurtma SONI.
   */
  const hasBase = report.receivedUnits + report.returnedUnits > 0;
  const rate = hasBase && Number.isFinite(report.returnRate) ? report.returnRate : 0;

  // Zona ohangi kartochkaning o'ziga ham beriladi: xavfsiz bo'lsa firuza, diqqat — za'faron, xavfli — qizil
  const zone: Tone = hasBase ? returnsTone(rate) : 'muted';
  const zoneLabel = !hasBase
    ? t('risk.zoneNone')
    : zone === 'danger'
      ? t('risk.zoneHigh')
      : zone === 'warn'
        ? t('risk.zoneMid')
        : t('risk.zoneLow');

  return (
    <Card tone={zone} className="print-avoid-break">
      <CardHeader
        icon={<AlertTriangle className="h-4 w-4" />}
        title={t('risk.title')}
        subtitle={t('risk.subtitle')}
        actions={
          <Badge tone={zone} dot>
            {zoneLabel}
          </Badge>
        }
      />
      <CardBody className="space-y-2.5">
        <div className="well px-4 py-3.5">
          <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
            <div>
              <p className="eyebrow">{t('risk.returnRate')}</p>
              <p
                className={cn(
                  'tnum mt-1.5 font-display text-[28px] font-bold leading-none tracking-[-0.02em]',
                  VALUE_TONE[zone === 'muted' ? 'ink' : zone],
                )}
              >
                {hasBase ? f.pct(rate, 1) : '—'}
              </p>
              <p className="tnum mt-1 text-2xs text-muted">
                {hasBase
                  ? t('risk.units', { r: f.num(report.returnedUnits), s: f.num(report.receivedUnits) })
                  : t('risk.noBase')}
              </p>
            </div>
            {/* Formula — butun kenglikda, chapdan: tor ustunda o'ngga tekislangan uzun matn qiyin o'qilardi */}
            <p className="w-full text-2xs leading-snug text-muted">{t(byBasis('risk.rateHint', basis))}</p>
          </div>
          {/* Shkala 0–20%: belgi 8% da — undan o'ngi xavfli zona (panel kartasidagi qizil chegara) */}
          <ProgressBar
            value={Math.min(100, rate * RISK_SCALE)}
            tone={zone}
            marker={RISK_DANGER_PCT * RISK_SCALE}
            markerLabel={t('risk.marker')}
            className="mt-3"
          />
        </div>

        <div className="grid grid-cols-2 gap-2.5">
          <StatWell
            label={
              <>
                <ArrowDownRight className="h-3 w-3 shrink-0" />
                {t('risk.canceled')}
              </>
            }
            value={f.num(report.canceled)}
            hint={t(byBasis('risk.canceledHint', basis))}
            tone="warn"
          />
          <StatWell
            label={
              <>
                <Undo2 className="h-3 w-3 shrink-0" />
                {t('risk.returns')}
              </>
            }
            value={f.num(report.returns)}
            hint={t(byBasis('risk.returnsHint', basis))}
            tone="danger"
          />
        </div>
      </CardBody>
    </Card>
  );
}

// ─────────────────────────── Top sotuvlar ───────────────────────────

/** Bitta mahsulot tushumning shuncha foizidan ko'pini bersa — bog'liqlik xavfi */
const LEADER_RISK_SHARE = 40;

type RankedRow = TopProductRow & { rank: number };

/**
 * Top sotuvlar — butun kenglikda. Ilgari jadval sahifaning 3/5 qismida turib,
 * 1366px da Foyda, Marja va Ulush ustunlari ko'rinmasdi; "Sotuv ulushi"
 * donuti esa yozuvsiz edi va yarmini "Boshqalar" egallardi. Endi ulush shu
 * jadvalning o'zida, tepada esa konsentratsiya: top-3 tushumning qanchasi.
 */
export function TopSalesCard({ rows }: { rows: TopProductRow[] }) {
  const t = useT('reports');
  const f = useFormat();

  // O'rin serverdagi tartibdan (tushum bo'yicha) — ustun bo'yicha saralanganda ham o'zgarmaydi
  const ranked: RankedRow[] = rows.map((r, i) => ({ ...r, rank: i + 1 }));
  const top3 = rows.slice(0, 3).reduce((s, r) => s + r.share, 0);
  const leader = rows[0];
  const concentrated = Boolean(leader && leader.share >= LEADER_RISK_SHARE);
  const maxShare = Math.max(...rows.map((r) => r.share), 1);

  const columns: Column<RankedRow>[] = [
    {
      key: 'rank',
      header: '#',
      width: 56,
      mobile: 'hidden',
      sortable: true,
      sortValue: (r) => -r.rank,
      render: (r) => <RankBadge rank={r.rank} />,
    },
    {
      key: 'title',
      header: t('top.product'),
      mobile: 'title',
      render: (r) => (
        <ProductTitleCell
          title={r.title}
          subtitle={r.sku}
          imageUrl={r.imageUrl}
          maxWidth={300}
          // Telefonda "#" ustuni yo'q — o'rin nom yonida
          lead={<RankBadge rank={r.rank} className="md:hidden" />}
        />
      ),
    },
    {
      key: 'units',
      header: t('top.units'),
      align: 'right',
      sortable: true,
      sortValue: (r) => r.units,
      render: (r) => f.num(r.units),
    },
    {
      key: 'revenue',
      header: t('top.revenue'),
      align: 'right',
      sortable: true,
      sortValue: (r) => r.revenue,
      render: (r) => <span className="font-semibold text-ink">{f.money(r.revenue)}</span>,
    },
    {
      key: 'profit',
      header: t('top.profit'),
      align: 'right',
      sortable: true,
      sortValue: (r) => r.profit,
      // Foyda va marja bitta katakda: ilgari alohida ustun bo'lib, jadvalni ekrandan chiqarib yuborardi
      // text-right (flex emas): telefondagi kartada DataTable uni chapga o'giradi, raqam maydon nomi ostida turadi
      render: (r) => (
        <div className="text-right">
          <span className={cn('block font-semibold', r.profit >= 0 ? 'text-brand-ink' : 'text-danger-ink')}>
            {f.money(r.profit)}
          </span>
          <span className={cn('block text-2xs', r.margin < 0 ? 'text-danger-ink' : 'text-muted')}>
            {t('top.marginSub', { v: f.pct(r.margin, 1) })}
          </span>
        </div>
      ),
    },
    {
      key: 'share',
      header: t('top.share'),
      align: 'right',
      sortable: true,
      sortValue: (r) => r.share,
      render: (r) => (
        <div className="flex items-center justify-end gap-2.5">
          {/* Chiziq eng katta ulushga nisbatan — yetakchilar orasidagi farq ko'zga tashlansin */}
          <Meter value={(r.share / maxShare) * 100} color={CHART_COLORS.brand} className="hidden w-16 lg:block" />
          <span className="w-12 text-ink-soft">{f.pct(r.share, 1)}</span>
        </div>
      ),
    },
  ];

  return (
    <Card tone="brand" className="print-avoid-break">
      <CardHeader
        icon={<Trophy className="h-4 w-4" />}
        title={t('top.title')}
        subtitle={t('top.subtitle')}
        actions={
          rows.length ? (
            <>
              <span className="meta-chip tnum" title={t('top.top3Hint')}>
                {t('top.top3', { v: f.pct(top3, 1) })}
              </span>
              {concentrated && leader ? (
                <Badge tone="warn" dot title={t('top.concentratedHint', { v: f.pct(leader.share, 1) })}>
                  {t('top.concentrated')}
                </Badge>
              ) : null}
            </>
          ) : null
        }
      />
      <div className="mt-4">
        <DataTable
          columns={columns}
          rows={ranked}
          rowKey={(r) => r.skuId}
          density="compact"
          empty={<EmptyState title={t('top.empty')} />}
        />
      </div>
    </Card>
  );
}

// ─────────────────────────── Ro'yxat qatori (kategoriya, xarajat) ───────────────────────────

/**
 * Kategoriya va xarajat ro'yxatlari bir xil qatordan quriladi: chiziq eng
 * katta qatorga nisbatan (yetakchi to'liq), o'ngdagi foiz esa tushumdan.
 * Boshqaruv panelidagi "Qaysi tovar ko'proq foyda keltiryapti" ham shunday.
 */
function BarRow({
  lead,
  label,
  value,
  bar,
  color,
  pct,
}: {
  lead: ReactNode;
  label: string;
  value: string;
  bar: number;
  color: string;
  pct: string;
}) {
  return (
    <li className="min-w-0">
      <div className="flex items-baseline justify-between gap-3">
        <span className="flex min-w-0 items-center gap-2.5">
          {lead}
          <span className="truncate text-sm font-medium text-ink" title={label}>
            {label}
          </span>
        </span>
        <span className="tnum shrink-0 text-sm font-semibold text-ink">{value}</span>
      </div>
      <div className="mt-1.5 flex items-center gap-3">
        <Meter value={bar} color={color} className="flex-1" />
        <span className="tnum w-12 shrink-0 text-right text-xs text-muted">{pct}</span>
      </div>
    </li>
  );
}

/** Ro'yxat tepasidagi jamlovchi plitka */
function SummaryWell({ label, value, aside }: { label: string; value: string; aside?: ReactNode }) {
  return (
    <div className="well flex flex-wrap items-end justify-between gap-x-4 gap-y-1 px-4 py-3">
      <div className="min-w-0">
        <p className="eyebrow">{label}</p>
        <p className="tnum mt-1 font-display text-lg font-bold leading-tight text-ink">
          <Amount value={value} />
        </p>
      </div>
      {aside ? <div className="text-xs text-muted">{aside}</div> : null}
    </div>
  );
}

// ─────────────────────────── Kategoriyalar ───────────────────────────

/**
 * Ro'yxatda nechta kategoriya. Qolganlari bitta qatorda yig'iladi — yonidagi
 * "Davr xarajatlari" bilan bo'yi teng tursin (u odatda 5–6 qator).
 */
const CATEGORY_LIMIT = 6;

export function CategoriesCard({
  rows,
  revenue,
}: {
  rows: MonthlyReportResponse['categories'];
  revenue: number;
}) {
  const t = useT('reports');
  const f = useFormat();
  const sorted = [...rows].sort((a, b) => b.revenue - a.revenue);
  const top = sorted.slice(0, CATEGORY_LIMIT);
  const rest = sorted.slice(CATEGORY_LIMIT);
  const max = Math.max(...top.map((c) => c.revenue), 1);

  return (
    <Card className="print-avoid-break flex flex-col">
      <CardHeader icon={<Layers className="h-4 w-4" />} title={t('cats.title')} subtitle={t('cats.subtitle')} />
      <CardBody className="flex flex-1 flex-col gap-4">
        {top.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted">{t('cats.empty')}</p>
        ) : (
          <>
            <SummaryWell
              label={t('cats.total')}
              value={f.money(revenue)}
              aside={t('cats.count', { n: f.num(rows.length) })}
            />
            <ul className="space-y-3.5">
              {top.map((c, i) => (
                <BarRow
                  key={c.category}
                  lead={<span className="tnum w-4 shrink-0 text-right text-xs font-semibold text-muted">{i + 1}</span>}
                  label={c.category}
                  value={f.money(c.revenue)}
                  bar={(c.revenue / max) * 100}
                  color={CHART_COLORS.brand}
                  pct={f.pct(c.share, 1)}
                />
              ))}
            </ul>
            {rest.length ? (
              <p className="tnum mt-auto text-xs text-muted">
                {t('cats.more', {
                  n: f.num(rest.length),
                  v: f.money(rest.reduce((s, c) => s + c.revenue, 0)),
                })}
              </p>
            ) : null}
          </>
        )}
      </CardBody>
    </Card>
  );
}

// ─────────────────────────── Yetkazib berish turlari ───────────────────────────

// Rang ma'nosi butun saytda bir xil: binafsha — Uzum (FBO = Uzum ombori), firuza — sotuvchining o'zi
const DELIVERY_TONE: Record<DeliveryType, { tone: Tone; color: string }> = {
  FBO: { tone: 'violet', color: CHART_COLORS.violet },
  FBS: { tone: 'brand', color: CHART_COLORS.brand },
  DBS: { tone: 'info', color: CHART_COLORS.info },
};

export function DeliveryTypesCard({ rows }: { rows: MonthlyReportResponse['deliveryTypes'] }) {
  const t = useT('reports');
  const f = useFormat();
  const totalOrders = rows.reduce((s, r) => s + r.orders, 0);
  const segments: Segment[] = rows.map((r) => ({
    key: r.type,
    label: r.type,
    amount: r.orders,
    color: (DELIVERY_TONE[r.type] ?? DELIVERY_TONE.FBO).color,
  }));

  return (
    <Card tone="info" className="print-avoid-break flex flex-col">
      <CardHeader
        icon={<Truck className="h-4 w-4" />}
        title={t('delivery.title')}
        subtitle={t('delivery.subtitle')}
        actions={totalOrders > 0 ? <span className="meta-chip tnum">{t('delivery.totalChip', { n: f.num(totalOrders) })}</span> : null}
      />
      <CardBody className="flex flex-1 flex-col gap-4">
        {rows.length === 0 || totalOrders === 0 ? (
          <p className="py-6 text-center text-sm text-muted">{t('delivery.empty')}</p>
        ) : (
          <>
            <SegmentBar segments={segments} label={t('delivery.title')} />
            {/* flex-1: yonidagi "Ombor" balandroq bo'lsa plitkalar cho'ziladi, kartochka ichi bo'sh qolmaydi */}
            <div className="grid flex-1 grid-cols-1 gap-2.5 sm:grid-cols-3">
              {rows.map((r) => {
                const meta = DELIVERY_TONE[r.type] ?? DELIVERY_TONE.FBO;
                const share = totalOrders ? (r.orders / totalOrders) * 100 : 0;
                const success = r.orders ? (r.success / r.orders) * 100 : 0;
                return (
                  <div key={r.type} className="well flex min-w-0 flex-col px-3.5 py-3">
                    <div className="flex items-center justify-between gap-2">
                      <Badge tone={meta.tone} className="px-2 py-0.5 font-bold tracking-wide">
                        {r.type}
                      </Badge>
                      <span className="tnum text-xs font-medium text-muted">{f.pct(share, 0)}</span>
                    </div>
                    <p className="tnum mt-2.5 font-display text-xl font-bold leading-tight text-ink">{f.num(r.orders)}</p>
                    <p className="text-2xs text-muted">{t(`delivery.${r.type}`)}</p>
                    <div className="mt-auto pt-3">
                      <ProgressBar value={success} tone={meta.tone} />
                      <p className="tnum mt-1.5 text-2xs text-muted">
                        {t('delivery.successLine', { n: f.num(r.success), v: f.pct(success, 1) })}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </CardBody>
    </Card>
  );
}

// ─────────────────────────── Davr xarajatlari ───────────────────────────

export function ExpensesCard({
  rows,
  total,
  revenue,
}: {
  rows: MonthlyReportResponse['expenses'];
  total: number;
  revenue: number;
}) {
  const t = useT('reports');
  const f = useFormat();
  const expenseLabel = useExpenseLabel();
  const sorted = [...rows].filter((r) => r.amount !== 0).sort((a, b) => b.amount - a.amount);
  const max = Math.max(...sorted.map((r) => r.amount), 1);
  const ofRevenue = (v: number) => (revenue > 0 ? f.pct((v / revenue) * 100, 1) : '—');

  return (
    <Card className="print-avoid-break flex flex-col">
      <CardHeader icon={<Wallet className="h-4 w-4" />} title={t('expenses.title')} subtitle={t('expenses.subtitle')} />
      <CardBody className="flex flex-1 flex-col gap-4">
        {sorted.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted">{t('expenses.empty')}</p>
        ) : (
          <>
            {/*
              Jami — qizil emas: xarajat zarar degani emas (qizil faqat zarar
              uchun). Ilgari jami qizilda turib, sotuvchini bekorga cho'chitardi.
            */}
            <SummaryWell
              label={t('expenses.total')}
              value={f.money(total)}
              aside={t('expenses.totalAside', { v: ofRevenue(total) })}
            />
            <ul className="space-y-3.5">
              {sorted.map((e) => (
                <BarRow
                  key={e.category}
                  lead={
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ background: EXPENSE_COLOR[e.category] ?? COST_COLORS.other }}
                    />
                  }
                  label={expenseLabel(e.category)}
                  value={f.money(e.amount)}
                  bar={(e.amount / max) * 100}
                  color={EXPENSE_COLOR[e.category] ?? COST_COLORS.other}
                  pct={ofRevenue(e.amount)}
                />
              ))}
            </ul>
            <p className="mt-auto text-xs text-muted">{t('expenses.pctNote')}</p>
          </>
        )}
      </CardBody>
    </Card>
  );
}

// ─────────────────────────── Ombor ───────────────────────────

export function WarehouseCard({ warehouse }: { warehouse: MonthlyReportResponse['warehouse'] }) {
  const t = useT('reports');
  const f = useFormat();
  const capital = warehouse.fboAmount + warehouse.fbsAmount;
  const units = warehouse.fbo + warehouse.fbs;
  const share = (v: number) => (capital > 0 ? (v / capital) * 100 : 0);

  const tiles = [
    { key: 'FBO' as const, units: warehouse.fbo, amount: warehouse.fboAmount },
    { key: 'FBS' as const, units: warehouse.fbs, amount: warehouse.fbsAmount },
  ];

  return (
    <Card tone="info" className="print-avoid-break">
      <CardHeader
        icon={<Warehouse className="h-4 w-4" />}
        title={t('warehouse.title')}
        subtitle={t('warehouse.subtitle')}
      />
      <CardBody className="space-y-4">
        <div>
          <SegmentBar
            label={t('warehouse.title')}
            segments={tiles.map((x) => ({
              key: x.key,
              label: x.key,
              amount: x.amount,
              color: DELIVERY_TONE[x.key].color,
            }))}
          />
          {capital > 0 ? (
            <p className="tnum mt-2 text-2xs text-muted">
              {t('warehouse.split', { a: f.pct(share(warehouse.fboAmount), 0), b: f.pct(share(warehouse.fbsAmount), 0) })}
            </p>
          ) : null}
        </div>

        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          {tiles.map((x) => (
            <div key={x.key} className="well min-w-0 px-3.5 py-3">
              <div className="flex items-center justify-between gap-2">
                <Badge tone={DELIVERY_TONE[x.key].tone} className="px-2 py-0.5 font-bold tracking-wide">
                  {x.key}
                </Badge>
                <span className="text-2xs text-muted">{t(`warehouse.${x.key}`)}</span>
              </div>
              <p className="tnum mt-2.5 font-display text-xl font-bold leading-tight text-ink">
                {f.num(x.units)} <span className="text-xs font-semibold text-muted">{t('warehouse.units')}</span>
              </p>
              <p className="tnum mt-1 text-sm font-semibold text-ink-soft">
                <Amount value={f.money(x.amount)} />
              </p>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-xl border border-info/25 bg-info/[0.06] px-4 py-3">
          <span className="min-w-0">
            <span className="block text-sm font-semibold text-ink">{t('warehouse.capital')}</span>
            <span className="block text-2xs text-muted">{t('warehouse.capitalHint')}</span>
          </span>
          <span className="flex shrink-0 items-baseline gap-3">
            <span className="tnum text-xs font-semibold text-muted">
              {f.num(units)} {t('warehouse.units')}
            </span>
            <span className="tnum font-display text-lg font-bold text-ink">
              <Amount value={f.money(capital)} />
            </span>
          </span>
        </div>
      </CardBody>
    </Card>
  );
}

// ─────────────────────────── Xulosalar ───────────────────────────

const LEVEL_TONE: Record<Insight['level'], Tone> = {
  info: 'info',
  success: 'brand',
  warning: 'warn',
  danger: 'danger',
};

const LEVEL_ICON = {
  info: Info,
  success: CheckCircle2,
  warning: AlertTriangle,
  danger: AlertTriangle,
} as const;

/** Xulosa kartochkasi ostidagi ko'rsatkich nishoni — tarjimasi bo'lsa */
function metricLabel(t: (k: string) => string, metric?: string) {
  if (!metric) return null;
  const label = t(`metric.${metric}`);
  if (label === `metric.${metric}`) return null;
  return <span className="chip bg-surface-3 px-2 py-0.5 text-2xs font-semibold text-ink-soft">{label}</span>;
}

export function InsightsBlock({ insights }: { insights: Insight[] }) {
  const t = useT('reports');

  return (
    <Card className="print-avoid-break">
      <CardHeader
        icon={<Lightbulb className="h-4 w-4" />}
        title={t('insights.title')}
        subtitle={t('insights.subtitle')}
        actions={insights.length ? <span className="meta-chip tnum">{insights.length}</span> : null}
      />
      <CardBody>
        {insights.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted">{t('insights.empty')}</p>
        ) : (
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {insights.map((i) => {
              const tone = LEVEL_TONE[i.level] ?? 'info';
              const Icon = LEVEL_ICON[i.level] ?? Info;
              return (
                <div key={i.id} className="well flex gap-3 p-4 print-avoid-break">
                  {/*
                    Kartochka bo'yalmaydi — faqat belgi plitkasi darajaga qarab.
                    Ilgari har bir xulosa to'liq rangli quti edi va beshta
                    rangli quti yonma-yon turib, qaysi biri muhimligi yo'qolardi.
                  */}
                  <span
                    className={cn(
                      'icon-tile mt-0.5 h-8 w-8 rounded-[10px] [&_svg]:h-4 [&_svg]:w-4',
                      TONE_CLASS[tone],
                    )}
                  >
                    <Icon />
                  </span>
                  <div className="flex min-w-0 flex-1 flex-col">
                    <p className="text-sm font-semibold text-ink">{i.title}</p>
                    <p className="mt-1 text-xs leading-relaxed text-ink-soft">{i.body}</p>
                    {/*
                      `metric` — serverdagi texnik kalit. Ilgari u shundayligicha
                      chiqib, sotuvchi "successRate" degan yozuvni ko'rardi.
                      Endi tarjimasi bor kalitlargina ko'rsatiladi.
                    */}
                    <div className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-2.5">
                      {metricLabel(t, i.metric) ?? <span />}
                      {i.link ? (
                        <Link
                          to={i.link}
                          className="no-print focusable inline-flex items-center gap-1 rounded-md text-xs font-semibold text-brand-ink hover:underline"
                        >
                          {t('insights.more')}
                          <ArrowRight className="h-3.5 w-3.5" />
                        </Link>
                      ) : null}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardBody>
    </Card>
  );
}
