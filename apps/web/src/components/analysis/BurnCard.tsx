import { Flame, TrendingDown } from 'lucide-react';
import { useFormat } from '@/i18n';
import { cn } from '@/lib/utils';

/**
 * "Har kuni yo'qotayotgan pulingiz" — diqqatni tortuvchi karta.
 * Kunlik saqlash xarajati + oylik/yillik proyeksiya.
 */
export function BurnCard({
  perDay,
  perMonth,
  perYear,
  title,
  hint,
  monthLabel,
  yearLabel,
  footer,
  className,
}: {
  perDay: number;
  perMonth: number;
  perYear: number;
  title: string;
  hint: string;
  monthLabel: string;
  yearLabel: string;
  footer?: string;
  className?: string;
}) {
  const f = useFormat();

  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-2xl border border-danger/25 bg-danger/[0.07] p-5 shadow-card sm:p-6',
        className,
      )}
    >
      <div className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-danger/20 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-24 left-10 h-48 w-48 rounded-full bg-warn/15 blur-3xl" />

      <div className="relative flex flex-wrap items-start justify-between gap-5">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-danger/15 text-danger">
              <Flame className="h-4 w-4" />
            </span>
            <p className="font-display text-sm font-extrabold uppercase tracking-wide text-danger">{title}</p>
          </div>

          <p className="tnum mt-3 font-display text-[34px] font-extrabold leading-none tracking-tight text-ink sm:text-[42px]">
            {f.money(perDay)}
          </p>
          <p className="mt-2 max-w-md text-sm leading-relaxed text-ink-soft">{hint}</p>
          {footer ? <p className="mt-2 text-xs text-muted">{footer}</p> : null}
        </div>

        <div className="flex shrink-0 gap-3">
          <div className="rounded-xl border border-line bg-surface/70 px-4 py-3 backdrop-blur">
            <p className="text-2xs font-semibold uppercase tracking-wide text-muted">{monthLabel}</p>
            <p className="tnum mt-1 font-display text-base font-extrabold text-ink">{f.compact(perMonth)}</p>
          </div>
          <div className="rounded-xl border border-line bg-surface/70 px-4 py-3 backdrop-blur">
            <p className="text-2xs font-semibold uppercase tracking-wide text-muted">{yearLabel}</p>
            <p className="tnum mt-1 flex items-center gap-1 font-display text-base font-extrabold text-danger">
              <TrendingDown className="h-3.5 w-3.5" />
              {f.compact(perYear)}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
