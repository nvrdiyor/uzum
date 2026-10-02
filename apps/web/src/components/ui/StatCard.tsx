import { Children, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { Amount, Delta, Skeleton, Sparkline } from './primitives';

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

/** Yorliq yonidagi kichik belgi — rang ma'no bildiradi, katta plitka emas */
const TONE_ICON = {
  brand: 'bg-brand/12 text-brand-ink',
  info: 'bg-info/12 text-info-ink',
  warn: 'bg-warn/12 text-warn-ink',
  danger: 'bg-danger/12 text-danger-ink',
  violet: 'bg-violet/12 text-violet-ink',
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
        'card card-hover relative flex flex-col overflow-hidden p-5',
        onClick && 'cursor-pointer',
        className,
      )}
      onClick={onClick}
    >
      {/*
        Hover'dagi blur nuri olib tashlandi: blur-2xl har kadrda qayta
        chizilib, kuchsiz kompyuterda sahifani qotirardi.
      */}
      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            {icon ? (
              <span
                className={cn(
                  'flex h-6 w-6 shrink-0 items-center justify-center rounded-md [&_svg]:h-3.5 [&_svg]:w-3.5',
                  TONE_ICON[tone],
                )}
              >
                {icon}
              </span>
            ) : null}
            <p className="truncate eyebrow-lg">{label}</p>
          </div>
          {loading ? (
            <Skeleton className="mt-3 h-8 w-32" />
          ) : (
            <p className="tnum mt-3 font-display text-[26px] font-bold leading-[1.15] tracking-[-0.02em] text-ink">
              {typeof value === 'string' ? <Amount value={value} /> : value}
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
      </div>

      {/* mt-auto — izoh uzunligi turlicha bo'lsa ham pastki blok bir sathda turadi */}
      {(delta !== undefined || spark) && !loading ? (
        <div className="relative mt-auto flex items-end justify-between gap-3 pt-3">
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
