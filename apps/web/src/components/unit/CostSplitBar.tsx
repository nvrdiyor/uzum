import { useFormat } from '@/i18n';
import { cn } from '@/lib/utils';

export interface SplitSegment {
  key: string;
  label: string;
  value: number;
  color: string;
}

/**
 * "1 dona qayerga ketadi" — gorizontal stacked bar + ketma-ket bloklar.
 * Foizlar `total` (sotuv narxi) ga nisbatan hisoblanadi.
 */
export function CostSplitBar({
  segments,
  total,
  className,
  compact,
}: {
  segments: SplitSegment[];
  total: number;
  className?: string;
  compact?: boolean;
}) {
  const f = useFormat();
  const positives = segments.filter((s) => s.value > 0);
  const sumPositive = positives.reduce((s, x) => s + x.value, 0) || 1;
  const base = total > 0 ? total : sumPositive;

  return (
    <div className={cn('space-y-4', className)}>
      <div className="flex h-4 w-full overflow-hidden rounded-full bg-surface-3">
        {positives.map((s) => (
          <div
            key={s.key}
            title={`${s.label} · ${f.money(s.value)}`}
            style={{ width: `${(s.value / sumPositive) * 100}%`, background: s.color }}
            className="h-full first:rounded-l-full last:rounded-r-full"
          />
        ))}
      </div>

      <ul className={cn('space-y-1.5', compact && 'space-y-1')}>
        {segments.map((s) => {
          const share = (s.value / base) * 100;
          return (
            <li
              key={s.key}
              className="flex items-center gap-3 rounded-xl px-2.5 py-2 transition-colors hover:bg-surface-2"
            >
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: s.color }} />
              <span className="min-w-0 flex-1 truncate text-sm text-ink-soft">{s.label}</span>
              <span className="tnum w-14 shrink-0 text-right text-xs text-muted">
                {Number.isFinite(share) ? f.pct(share) : '—'}
              </span>
              <span
                className={cn(
                  'tnum w-32 shrink-0 text-right text-sm font-semibold',
                  s.value < 0 ? 'text-danger' : 'text-ink',
                )}
              >
                {f.money(s.value)}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
