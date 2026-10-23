import { useFormat } from '@/i18n';
import { cn } from '@/lib/utils';
import { ABC_CSS_VAR, ABC_INK_VAR, ABC_TONE, clamp01, type AbcGroupKey } from './shared';

/** Guruh rangida ishlaydigan doiraviy ko'rsatkich (ProgressRing brand rangga qat'iy bog'langani uchun) */
function GroupRing({ value, group, size = 104, stroke = 9 }: { value: number; group: AbcGroupKey; size?: number; stroke?: number }) {
  const pct = clamp01(value / 100) * 100;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const color = `rgb(var(${ABC_CSS_VAR[group]}))`;
  const inkColor = `rgb(var(${ABC_INK_VAR[group]}))`;
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
        <span className="mt-0.5 font-display text-xs font-extrabold" style={{ color: inkColor }}>
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
  const color = `rgb(var(${ABC_INK_VAR[group]}))`;

  return (
    /*
      Guruh rangi umumiy ohang tizimi orqali: tepada aksent chiziq va halqa bir
      rangda (A — brend, B — sariq, C — qizil). Ilgari har kartaning burchagida
      o'z rangli yorug'ligi bor edi — uch karta birdan "porlab", sahifadagi
      asosiy kartochka ajralmay qolardi.
    */
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'card card-hover card-accent group relative overflow-hidden p-5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/60',
        `tone-${ABC_TONE[group]}`,
        onClick && 'cursor-pointer',
        active && 'border-line-strong ring-2 ring-brand/40',
      )}
    >
      <div className="relative flex items-start gap-4">
        <GroupRing value={revenueShare} group={group} />
        <div className="min-w-0 flex-1">
          <p className="font-display text-base font-extrabold tracking-tight text-ink">{title}</p>
          <p className="mt-1 text-xs leading-relaxed text-muted">{description}</p>
        </div>
      </div>

      {/* Ichki statistik plitkalar — boshqa sahifalardagi .well bilan bir xil */}
      <div className="relative mt-4 grid grid-cols-3 gap-2">
        <div className="well min-w-0 px-3 py-2">
          <p className="truncate eyebrow">{labels.sku}</p>
          <p className="tnum mt-0.5 text-sm font-bold text-ink">{f.num(skuCount)}</p>
        </div>
        <div className="well min-w-0 px-3 py-2">
          <p className="truncate eyebrow">{labels.revenue}</p>
          <p className="tnum mt-0.5 text-sm font-bold" style={{ color }}>
            {f.compact(revenue)}
          </p>
        </div>
        <div className="well min-w-0 px-3 py-2">
          <p className="truncate eyebrow">{labels.units}</p>
          <p className="tnum mt-0.5 text-sm font-bold text-ink">{f.num(units)}</p>
        </div>
      </div>
    </button>
  );
}
