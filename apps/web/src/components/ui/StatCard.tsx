import { Children, type ReactNode } from 'react';
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
  warn: 'bg-warn/[0.12] text-warn',
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
        // flex-col + pastdagi mt-auto: qatordagi barcha kartochkalarda
        // o'zgarish chipi va sparkline bir sathda turadi
        'card card-hover group relative flex flex-col overflow-hidden p-5',
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
          {/* min-h: bir va ikki qatorli izohlar qatordagi kartochkalarni siljitmasin */}
          {/* Yuklanayotganda izoh ham skeleton — aks holda eski davr izohi
              yangi qiymat bilan birga ko'rinib, chalkashtirardi */}
          {hint ? (
            loading ? (
              <Skeleton className="mt-2 h-3 w-28" />
            ) : (
              <p className="mt-1 line-clamp-2 min-h-[2.75em] text-xs leading-snug text-muted">{hint}</p>
            )
          ) : null}
        </div>
        {icon ? (
          <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', TONE_BG[tone])}>
            {icon}
          </div>
        ) : null}
      </div>

      {(delta !== undefined || spark) && !loading ? (
        <div className="relative mt-3 flex items-end justify-between gap-3">
          {delta !== undefined ? <Delta value={delta} invert={invertDelta} /> : <span />}
          {spark && spark.length > 1 ? (
            <Sparkline data={spark} tone={tone === 'violet' ? 'info' : tone} className="opacity-80" />
          ) : null}
        </div>
      ) : null}

      {footer ? (
        <div className="relative mt-auto border-t border-line pt-3 text-xs text-muted">
          <span className="block">{footer}</span>
        </div>
      ) : null}
    </div>
  );
}

/**
 * KPI qatori.
 *
 * Ustunlar soni kartochkalar soniga moslanadi: 5 ta kartochka 4 ustunli to'rda
 * bittasi yolg'iz qolib, qator noto'g'ri ko'rinardi.
 */
const GRID_COLS: Record<number, string> = {
  1: 'sm:grid-cols-1',
  2: 'sm:grid-cols-2',
  3: 'sm:grid-cols-2 xl:grid-cols-3',
  4: 'sm:grid-cols-2 xl:grid-cols-4',
  5: 'sm:grid-cols-2 xl:grid-cols-5',
  6: 'sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6',
};

export function StatGrid({ children, className }: { children: ReactNode; className?: string }) {
  const count = Children.toArray(children).filter(Boolean).length;
  return (
    <div className={cn('grid gap-4', GRID_COLS[count] ?? 'sm:grid-cols-2 xl:grid-cols-4', className)}>
      {children}
    </div>
  );
}
