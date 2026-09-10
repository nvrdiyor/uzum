import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { Delta, Skeleton, Sparkline } from './primitives';

export interface StatCardProps {
  label: ReactNode;
  value: ReactNode;
  /** Foizdagi o'zgarish (oldingi davrga nisbatan) */
  delta?: number | null;
  /** Kamayish yaxshi bo'lsa true (xarajatlar uchun) */
  invertDelta?: boolean;
  hint?: ReactNode;
  icon?: ReactNode;
  spark?: number[];
  tone?: 'brand' | 'info' | 'warn' | 'danger' | 'violet';
  loading?: boolean;
  className?: string;
  onClick?: () => void;
  footer?: ReactNode;
}

const TONE_BG = {
  brand: 'bg-brand/10 text-brand',
  info: 'bg-info/10 text-info',
  warn: 'bg-warn/12 text-warn',
  danger: 'bg-danger/10 text-danger',
  violet: 'bg-violet/10 text-violet',
} as const;

export function StatCard({
  label,
  value,
  delta,
  invertDelta,
  hint,
  icon,
  spark,
  tone = 'brand',
  loading,
  className,
  onClick,
  footer,
}: StatCardProps) {
  return (
    <div
      className={cn(
        'card card-hover group relative overflow-hidden p-5',
        onClick && 'cursor-pointer',
        className,
      )}
      onClick={onClick}
    >
      {/* yumshoq fon nuri */}
      <div
        className={cn(
          'pointer-events-none absolute -right-10 -top-12 h-32 w-32 rounded-full opacity-0 blur-2xl transition-opacity duration-500 group-hover:opacity-100',
          tone === 'brand' && 'bg-brand/20',
          tone === 'info' && 'bg-info/20',
          tone === 'warn' && 'bg-warn/20',
          tone === 'danger' && 'bg-danger/20',
          tone === 'violet' && 'bg-violet/20',
        )}
      />

      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-xs font-semibold uppercase tracking-wide text-muted">{label}</p>
          {loading ? (
            <Skeleton className="mt-3 h-8 w-32" />
          ) : (
            <p className="tnum mt-2 font-display text-[26px] font-extrabold leading-tight tracking-tight text-ink">
              {value}
            </p>
          )}
          {hint ? <p className="mt-1 truncate text-xs text-muted">{hint}</p> : null}
        </div>
        {icon ? (
          <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', TONE_BG[tone])}>
            {icon}
          </div>
        ) : null}
      </div>

      {(delta !== undefined || spark) && !loading ? (
        <div className="relative mt-4 flex items-end justify-between gap-3">
          {delta !== undefined ? <Delta value={delta} invert={invertDelta} /> : <span />}
          {spark && spark.length > 1 ? (
            <Sparkline data={spark} tone={tone === 'violet' ? 'info' : tone} className="opacity-80" />
          ) : null}
        </div>
      ) : null}

      {footer ? <div className="relative mt-4 border-t border-line pt-3 text-xs text-muted">{footer}</div> : null}
    </div>
  );
}

/** KPI qatorini bir xil to'rda joylash uchun */
export function StatGrid({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('grid gap-4 sm:grid-cols-2 xl:grid-cols-4', className)}>{children}</div>;
}
