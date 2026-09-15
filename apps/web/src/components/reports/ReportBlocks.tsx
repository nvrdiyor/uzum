/**
 * Oylik hisobot sahifasi uchun yordamchi bloklar.
 * Faqat `pages/Reports.tsx` ishlatadi — tarjimalar 'reports' namespace'ida.
 */
import type { ReactNode } from 'react';
import {
  AlertTriangle,
  ArrowDownRight,
  Boxes,
  CheckCircle2,
  Layers,
  PackageCheck,
  Truck,
  Undo2,
  Wallet,
} from 'lucide-react';
import {
  EXPENSE_CATEGORIES,
  type DeliveryType,
  type ExpenseCategory,
  type Insight,
  type MonthlyReportResponse,
} from '@savdoiq/shared';
import { Badge, Card, CardBody, CardHeader, ProgressBar, ProgressRing } from '@/components/ui';
import { LEVEL_TONE } from '@/lib/theme';
import { useFormat, useLang, useT } from '@/i18n';
import { cn } from '@/lib/utils';

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

        .report-sheet .card { box-shadow: none !important; }

        * {
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
        }
      }
    `}</style>
  );
}

/** Chop etilgan varaqning sarlavhasi (ekranda ko'rinmaydi) */
export function PrintHead({ from, to }: { from: string; to: string }) {
  const t = useT('reports');
  const f = useFormat();
  return (
    <div className="print-only mb-4 border-b border-line pb-3">
      <p className="font-display text-xl font-extrabold text-ink">{t('print.head')}</p>
      <p className="tnum mt-1 text-sm text-muted">
        {f.date(from)} — {f.date(to)}
      </p>
    </div>
  );
}

// ─────────────────────────── Kichik yordamchilar ───────────────────────────

function MiniStat({
  label,
  value,
  tone = 'ink',
  hint,
}: {
  label: ReactNode;
  value: ReactNode;
  tone?: 'ink' | 'brand' | 'warn' | 'danger' | 'info' | 'violet';
  hint?: ReactNode;
}) {
  const toneClass = {
    ink: 'text-ink',
    brand: 'text-brand',
    warn: 'text-warn',
    danger: 'text-danger',
    info: 'text-info',
    violet: 'text-violet',
  }[tone];
  return (
    <div className="rounded-xl border border-line bg-surface-2 px-3.5 py-3">
      <p className="text-2xs font-semibold uppercase tracking-wider text-muted">{label}</p>
      <p className={cn('tnum mt-1 font-display text-lg font-extrabold leading-tight', toneClass)}>{value}</p>
      {hint ? <p className="mt-0.5 text-2xs text-muted">{hint}</p> : null}
    </div>
  );
}

// ─────────────────────────── Buyurtmalar oqimi ───────────────────────────

export function OrdersFlowCard({ report }: { report: MonthlyReportResponse }) {
  const t = useT('reports');
  const f = useFormat();
  const rate = Number.isFinite(report.successRate) ? report.successRate : 0;

  return (
    <Card className="print-avoid-break">
      <CardHeader
        icon={<PackageCheck className="h-4 w-4" />}
        title={t('orders.title')}
        subtitle={t('orders.subtitle')}
      />
      <CardBody className="flex flex-col items-center gap-5 sm:flex-row sm:items-center">
        <ProgressRing value={rate} size={132} stroke={11}>
          <span className="tnum font-display text-2xl font-extrabold text-ink">{f.pct(rate, 1)}</span>
          <span className="mt-0.5 text-2xs uppercase tracking-wider text-muted">{t('orders.rate')}</span>
        </ProgressRing>

        <div className="grid w-full flex-1 grid-cols-1 gap-2.5 sm:grid-cols-3">
          <MiniStat label={t('orders.total')} value={f.num(report.ordersTotal)} />
          <MiniStat label={t('orders.success')} value={f.num(report.ordersSuccess)} tone="brand" />
          <MiniStat label={t('orders.units')} value={f.num(report.unitsSold)} tone="info" />
        </div>
      </CardBody>
    </Card>
  );
}

// ─────────────────────────── Xavf va qaytarishlar ───────────────────────────

export function RiskCard({ report }: { report: MonthlyReportResponse }) {
  const t = useT('reports');
  const f = useFormat();
  const rate = Number.isFinite(report.returnRate) ? report.returnRate : 0;

  const zone = rate >= 10 ? 'danger' : rate >= 5 ? 'warn' : 'brand';
  const zoneLabel = zone === 'danger' ? t('risk.zoneHigh') : zone === 'warn' ? t('risk.zoneMid') : t('risk.zoneLow');
  const zoneBadge = zone === 'danger' ? 'danger' : zone === 'warn' ? 'warn' : 'brand';

  const ring = {
    danger: 'border-danger/30 bg-danger/10',
    warn: 'border-warn/30 bg-warn/10',
    brand: 'border-brand/30 bg-brand/10',
  }[zone];
  const text = { danger: 'text-danger', warn: 'text-warn', brand: 'text-brand' }[zone];

  return (
    <Card className="print-avoid-break">
      <CardHeader
        icon={<AlertTriangle className="h-4 w-4" />}
        title={t('risk.title')}
        subtitle={t('risk.subtitle')}
        actions={<Badge tone={zoneBadge} dot>{zoneLabel}</Badge>}
      />
      <CardBody className="space-y-4">
        <div className={cn('rounded-2xl border px-4 py-4 text-center', ring)}>
          <p className="text-2xs font-semibold uppercase tracking-wider text-muted">{t('risk.returnRate')}</p>
          <p className={cn('tnum mt-1 font-display text-3xl font-extrabold leading-none', text)}>{f.pct(rate, 1)}</p>
          <p className="mt-1.5 text-xs text-muted">{t('risk.rateHint')}</p>
          <ProgressBar value={Math.min(100, rate * 5)} tone={zoneBadge} className="mt-3" />
        </div>

        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          <MiniStat
            label={
              <span className="inline-flex items-center gap-1.5">
                <ArrowDownRight className="h-3 w-3" />
                {t('risk.canceled')}
              </span>
            }
            value={f.num(report.canceled)}
            tone="warn"
            hint={t('risk.canceledHint')}
          />
          <MiniStat
            label={
              <span className="inline-flex items-center gap-1.5">
                <Undo2 className="h-3 w-3" />
                {t('risk.returns')}
              </span>
            }
            value={f.num(report.returns)}
            tone="danger"
            hint={t('risk.returnsHint')}
          />
        </div>
      </CardBody>
    </Card>
  );
}

// ─────────────────────────── Kategoriyalar ───────────────────────────

export function CategoriesCard({ rows }: { rows: MonthlyReportResponse['categories'] }) {
  const t = useT('reports');
  const f = useFormat();
  const top = [...rows].sort((a, b) => b.revenue - a.revenue).slice(0, 8);

  return (
    <Card className="print-avoid-break">
      <CardHeader icon={<Layers className="h-4 w-4" />} title={t('cats.title')} subtitle={t('cats.subtitle')} />
      <CardBody>
        {top.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted">{t('cats.empty')}</p>
        ) : (
          <ul className="space-y-3.5">
            {top.map((c) => (
              <li key={c.category}>
                <div className="flex items-baseline justify-between gap-3">
                  <span className="truncate text-sm font-medium text-ink">{c.category}</span>
                  <span className="tnum shrink-0 text-sm font-semibold text-ink-soft">{f.money(c.revenue)}</span>
                </div>
                <div className="mt-1.5 flex items-center gap-2.5">
                  <ProgressBar value={c.share} tone="brand" className="flex-1" />
                  <span className="tnum w-12 text-right text-xs text-muted">{f.pct(c.share, 1)}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}

// ─────────────────────────── Yetkazib berish turlari ───────────────────────────

const DELIVERY_TONE: Record<DeliveryType, { text: string; bg: string; bar: 'brand' | 'info' | 'violet' }> = {
  FBO: { text: 'text-brand-ink', bg: 'bg-brand/10', bar: 'brand' },
  FBS: { text: 'text-info-ink', bg: 'bg-info/10', bar: 'info' },
  DBS: { text: 'text-violet-ink', bg: 'bg-violet/10', bar: 'violet' },
};

export function DeliveryTypesCard({ rows }: { rows: MonthlyReportResponse['deliveryTypes'] }) {
  const t = useT('reports');
  const f = useFormat();
  const totalOrders = rows.reduce((s, r) => s + r.orders, 0);

  return (
    <Card className="print-avoid-break">
      <CardHeader icon={<Truck className="h-4 w-4" />} title={t('delivery.title')} subtitle={t('delivery.subtitle')} />
      <CardBody>
        {rows.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted">{t('delivery.empty')}</p>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {rows.map((r) => {
              const tone = DELIVERY_TONE[r.type] ?? DELIVERY_TONE.FBO;
              const share = totalOrders ? (r.orders / totalOrders) * 100 : 0;
              const success = r.orders ? (r.success / r.orders) * 100 : 0;
              return (
                <div key={r.type} className="rounded-2xl border border-line bg-surface-2 p-4">
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={cn(
                        'inline-flex items-center rounded-lg px-2 py-1 text-xs font-bold tracking-wide',
                        tone.bg,
                        tone.text,
                      )}
                    >
                      {r.type}
                    </span>
                    <span className="tnum text-xs text-muted">{f.pct(share, 0)}</span>
                  </div>
                  <p className="tnum mt-3 font-display text-xl font-extrabold text-ink">{f.num(r.orders)}</p>
                  <p className="text-2xs uppercase tracking-wider text-muted">{t('delivery.orders')}</p>
                  <ProgressBar value={success} tone={tone.bar} className="mt-3" />
                  <p className="tnum mt-1.5 text-xs text-muted">
                    {t('delivery.success')}: {f.num(r.success)} · {f.pct(success, 1)}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </CardBody>
    </Card>
  );
}

// ─────────────────────────── Davr xarajatlari ───────────────────────────

const EXPENSE_DOT: Record<ExpenseCategory, string> = {
  commission: 'bg-danger',
  logistics: 'bg-warn',
  marketing: 'bg-info',
  storage: 'bg-violet',
  tax: 'bg-brand',
  salary: 'bg-info',
  other: 'bg-muted',
};

export function ExpensesCard({
  rows,
  total,
}: {
  rows: MonthlyReportResponse['expenses'];
  total: number;
}) {
  const t = useT('reports');
  const f = useFormat();
  const lang = useLang();
  const sorted = [...rows].filter((r) => r.amount !== 0).sort((a, b) => b.amount - a.amount);

  const label = (id: ExpenseCategory): string => {
    const def = EXPENSE_CATEGORIES.find((c) => c.id === id);
    return def ? (def.label[lang] ?? def.label.uz) : id;
  };

  return (
    <Card className="print-avoid-break">
      <CardHeader icon={<Wallet className="h-4 w-4" />} title={t('expenses.title')} subtitle={t('expenses.subtitle')} />
      <CardBody>
        {sorted.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted">{t('expenses.empty')}</p>
        ) : (
          <ul className="divide-y divide-line">
            {sorted.map((e) => {
              const share = total ? (e.amount / total) * 100 : 0;
              return (
                <li key={e.category} className="flex items-center justify-between gap-3 py-2.5 first:pt-0">
                  <span className="flex min-w-0 items-center gap-2.5">
                    <span className={cn('h-2.5 w-2.5 shrink-0 rounded-full', EXPENSE_DOT[e.category] ?? 'bg-muted')} />
                    <span className="truncate text-sm text-ink-soft">{label(e.category)}</span>
                  </span>
                  <span className="flex shrink-0 items-baseline gap-2.5">
                    <span className="tnum text-xs text-muted">{f.pct(share, 1)}</span>
                    <span className="tnum text-sm font-semibold text-ink">{f.money(e.amount)}</span>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
        <div className="mt-4 flex items-center justify-between rounded-xl bg-surface-2 px-3.5 py-3">
          <span className="text-sm font-semibold text-ink">{t('expenses.total')}</span>
          <span className="tnum font-display text-lg font-extrabold text-danger">{f.money(total)}</span>
        </div>
      </CardBody>
    </Card>
  );
}

// ─────────────────────────── Ombor ───────────────────────────

export function WarehouseCard({ warehouse }: { warehouse: MonthlyReportResponse['warehouse'] }) {
  const t = useT('reports');
  const f = useFormat();
  const capital = warehouse.fboAmount + warehouse.fbsAmount;
  const fboShare = capital ? (warehouse.fboAmount / capital) * 100 : 0;

  return (
    <Card className="print-avoid-break">
      <CardHeader icon={<Boxes className="h-4 w-4" />} title={t('warehouse.title')} subtitle={t('warehouse.subtitle')} />
      <CardBody className="space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="rounded-2xl border border-brand/25 bg-brand/10 p-4">
            <p className="text-2xs font-bold uppercase tracking-wider text-brand">FBO</p>
            <p className="tnum mt-1.5 font-display text-xl font-extrabold text-ink">{f.num(warehouse.fbo)}</p>
            <p className="text-2xs text-muted">{t('warehouse.units')}</p>
            <p className="tnum mt-2 text-sm font-semibold text-ink-soft">{f.money(warehouse.fboAmount)}</p>
          </div>
          <div className="rounded-2xl border border-info/25 bg-info/10 p-4">
            <p className="text-2xs font-bold uppercase tracking-wider text-info">FBS</p>
            <p className="tnum mt-1.5 font-display text-xl font-extrabold text-ink">{f.num(warehouse.fbs)}</p>
            <p className="text-2xs text-muted">{t('warehouse.units')}</p>
            <p className="tnum mt-2 text-sm font-semibold text-ink-soft">{f.money(warehouse.fbsAmount)}</p>
          </div>
        </div>

        <ProgressBar value={fboShare} tone="brand" />

        <div className="flex items-center justify-between rounded-xl bg-surface-2 px-3.5 py-3">
          <span className="min-w-0">
            <span className="block text-sm font-semibold text-ink">{t('warehouse.capital')}</span>
            <span className="block text-2xs text-muted">{t('warehouse.capitalHint')}</span>
          </span>
          <span className="tnum shrink-0 font-display text-lg font-extrabold text-ink">{f.money(capital)}</span>
        </div>
      </CardBody>
    </Card>
  );
}

// ─────────────────────────── Xulosalar ───────────────────────────

const LEVEL_ICON = {
  info: CheckCircle2,
  success: CheckCircle2,
  warning: AlertTriangle,
  danger: AlertTriangle,
} as const;

export function InsightsBlock({ insights }: { insights: Insight[] }) {
  const t = useT('reports');

  return (
    <Card className="print-avoid-break">
      <CardHeader icon={<CheckCircle2 className="h-4 w-4" />} title={t('insights.title')} subtitle={t('insights.subtitle')} />
      <CardBody>
        {insights.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted">{t('insights.empty')}</p>
        ) : (
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {insights.map((i) => {
              const tone = LEVEL_TONE[i.level] ?? LEVEL_TONE.info;
              const Icon = LEVEL_ICON[i.level] ?? CheckCircle2;
              return (
                <div
                  key={i.id}
                  className={cn('flex gap-3 rounded-2xl border p-4 print-avoid-break', tone.bg, tone.border)}
                >
                  <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', tone.text)} />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-ink">{i.title}</p>
                    <p className="mt-1 text-xs leading-relaxed text-ink-soft">{i.body}</p>
                    {i.metric ? <p className="tnum mt-1.5 text-2xs text-muted">{i.metric}</p> : null}
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
