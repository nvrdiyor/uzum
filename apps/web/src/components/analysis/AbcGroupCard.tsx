import { useFormat } from '@/i18n';
import { cn } from '@/lib/utils';
import { ABC_CSS_VAR, clamp01, type AbcGroupKey } from './shared';

/** Guruh rangida ishlaydigan doiraviy ko'rsatkich (ProgressRing brand rangga qat'iy bog'langani uchun) */
function GroupRing({ value, group, size = 104, stroke = 9 }: { value: number; group: AbcGroupKey; size?: number; stroke?: number }) {
  const pct = clamp01(value / 100) * 100;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const color = `rgb(var(${ABC_CSS_VAR[group]}))`;
  return (
    <div className="relative inline-flex shrink-0 items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgb(var(--c-surface-3))" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c - (pct / 100) * c}
          style={{ transition: 'stroke-dashoffset 900ms cubic-bezier(0.22,1,0.36,1)' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="tnum font-display text-lg font-extrabold leading-none text-ink">{Math.round(pct)}%</span>
        <span className="mt-0.5 font-display text-xs font-extrabold" style={{ color }}>
          {group}
        </span>
      </div>
    </div>
  );
}

export function AbcGroupCard({
  group,
  title,
  description,
  revenueShare,
  skuCount,
  revenue,
  units,
  labels,
  active,
  onClick,
}: {
  group: AbcGroupKey;
  title: string;
  description: string;
  revenueShare: number;
  skuCount: number;
  revenue: number;
  units: number;
  labels: { sku: string; revenue: string; units: string };
  active?: boolean;
  onClick?: () => void;
}) {
  const f = useFormat();
  const color = `rgb(var(${ABC_CSS_VAR[group]}))`;

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'card card-hover group relative overflow-hidden p-5 text-left',
        onClick && 'cursor-pointer',
        active && 'border-line-strong ring-2 ring-brand/40',
      )}
    >
      <div
        className="pointer-events-none absolute -right-12 -top-14 h-36 w-36 rounded-full opacity-40 blur-2xl transition-opacity duration-500 group-hover:opacity-80"
        style={{ background: `rgb(var(${ABC_CSS_VAR[group]}) / 0.35)` }}
      />

      <div className="relative flex items-start gap-4">
        <GroupRing value={revenueShare} group={group} />
        <div className="min-w-0 flex-1">
          <p className="font-display text-base font-extrabold tracking-tight text-ink">{title}</p>
          <p className="mt-1 text-xs leading-relaxed text-muted">{description}</p>
        </div>
      </div>

      <div className="relative mt-4 grid grid-cols-3 gap-2 border-t border-line pt-3.5">
        <div className="min-w-0">
          <p className="truncate text-2xs font-semibold uppercase tracking-wide text-muted">{labels.sku}</p>
          <p className="tnum mt-0.5 text-sm font-bold text-ink">{f.num(skuCount)}</p>
        </div>
        <div className="min-w-0">
          <p className="truncate text-2xs font-semibold uppercase tracking-wide text-muted">{labels.revenue}</p>
          <p className="tnum mt-0.5 text-sm font-bold" style={{ color }}>
            {f.compact(revenue)}
          </p>
        </div>
        <div className="min-w-0">
          <p className="truncate text-2xs font-semibold uppercase tracking-wide text-muted">{labels.units}</p>
          <p className="tnum mt-0.5 text-sm font-bold text-ink">{f.num(units)}</p>
        </div>
      </div>
    </button>
  );
}
