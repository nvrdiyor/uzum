import { useFormat } from '@/i18n';
import { cn } from '@/lib/utils';

export interface SplitSegment {
  key: string;
  label: string;
  value: number;
  color: string;
}

/**
 * Ixcham ulush chizig'i — jadval katagi va kartochka osti uchun.
 *
 * Bo'laklar orasida 1 px tirqish: ilgari yonma-yon turgan ikki yaqin rang
 * (masalan soliq va foyda) bitta bo'lakdek qo'shilib ketardi. Sichqoncha
 * olib borilganda har bo'lakning summasi va ulushi chiqadi.
 */
export function SplitStrip({
  parts,
  className,
}: {
  parts: { key: string; label: string; value: number; color: string }[];
  className?: string;
}) {
  const f = useFormat();
  const positive = parts.filter((p) => p.value > 0);
  const total = positive.reduce((s, p) => s + p.value, 0);
  if (total <= 0) return <div className={cn('h-2 w-full rounded-full bg-surface-3', className)} aria-hidden />;
  const title = positive.map((p) => `${p.label}: ${f.money(p.value)} · ${f.pct((p.value / total) * 100)}`).join('\n');
  return (
    <div
      role="img"
      aria-label={title}
      title={title}
      className={cn('flex h-2 w-full gap-px overflow-hidden rounded-full bg-surface-3', className)}
    >
      {positive.map((p) => (
        <div key={p.key} className="h-full min-w-[2px]" style={{ flex: `${p.value} 1 0%`, background: p.color }} />
      ))}
    </div>
  );
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
      <SplitStrip parts={positives} className="h-3.5" />

      <ul className={cn('space-y-1.5', compact && 'space-y-1')}>
        {segments.map((s) => {
          const share = (s.value / base) * 100;
          return (
            <li
              key={s.key}
              // Telefonda ustunlar torayadi: aks holda foiz va summa nomga 40 px qoldirib, hatto "Tannarx" ham kesilardi
              className={cn(
                'flex items-center gap-2 rounded-xl px-1.5 py-2 transition-colors hover:bg-surface-2 sm:gap-3 sm:px-2.5',
                // Sof foyda — xarajatlardan keyingi natija: ingichka chiziq bilan ajratiladi
                s.key === 'profit' && 'mt-1 rounded-t-none border-t border-line pt-2.5',
              )}
            >
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: s.color }} />
              <span
                className={cn(
                  'min-w-0 flex-1 truncate text-sm',
                  s.key === 'profit' ? 'font-semibold text-ink' : 'text-ink-soft',
                )}
              >
                {s.label}
              </span>
              <span className="tnum w-11 shrink-0 text-right text-xs text-muted sm:w-14">
                {Number.isFinite(share) ? f.pct(share) : '—'}
              </span>
              <span
                className={cn(
                  'tnum w-[6.25rem] shrink-0 whitespace-nowrap text-right text-sm font-semibold sm:w-32',
                  s.value < 0 ? 'text-danger' : s.key === 'profit' ? 'text-brand-ink' : 'text-ink',
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
