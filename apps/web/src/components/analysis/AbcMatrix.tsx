import { cn } from '@/lib/utils';
import { useFormat } from '@/i18n';
import { ABC_CSS_VAR, ABC_INK_VAR, ABC_KEYS, XYZ_KEYS, clamp01, type AbcGroupKey, type XyzGroupKey } from './shared';

export interface MatrixCellData {
  abc: AbcGroupKey;
  xyz: XyzGroupKey;
  count: number;
  revenue: number;
}

export interface MatrixLabels {
  /** X/Y/Z qatorlari uchun qisqa izoh */
  xyzHint: Record<XyzGroupKey, string>;
  abcHint: Record<AbcGroupKey, string>;
  skuWord: string;
}

/**
 * 3x3 ABC × XYZ issiqlik jadvali.
 * Rang intensivligi ustun (ABC) rangining tushumga mutanosib shaffofligi bilan beriladi.
 */
export function AbcMatrix({
  cells,
  active,
  onSelect,
  labels,
  className,
}: {
  cells: MatrixCellData[];
  active: { abc: AbcGroupKey; xyz: XyzGroupKey } | null;
  onSelect: (cell: { abc: AbcGroupKey; xyz: XyzGroupKey }) => void;
  labels: MatrixLabels;
  className?: string;
}) {
  const f = useFormat();
  const max = cells.reduce((m, c) => Math.max(m, c.revenue), 0);

  const at = (abc: AbcGroupKey, xyz: XyzGroupKey): MatrixCellData =>
    cells.find((c) => c.abc === abc && c.xyz === xyz) ?? { abc, xyz, count: 0, revenue: 0 };

  return (
    <div className={cn('overflow-x-auto', className)}>
      <div className="min-w-[440px]">
        {/* ustun sarlavhalari */}
        <div className="grid grid-cols-[40px_repeat(3,minmax(0,1fr))] gap-2">
          <div />
          {ABC_KEYS.map((abc) => (
            <div key={abc} className="pb-1 text-center">
              <span
                className="inline-flex h-6 min-w-6 items-center justify-center rounded-lg px-2 font-display text-xs font-extrabold"
                style={{
                  background: `rgb(var(${ABC_CSS_VAR[abc]}) / 0.14)`,
                  color: `rgb(var(${ABC_INK_VAR[abc]}))`,
                }}
              >
                {abc}
              </span>
              <p className="mt-1 truncate text-2xs text-muted">{labels.abcHint[abc]}</p>
            </div>
          ))}
        </div>

        {XYZ_KEYS.map((xyz) => (
          <div key={xyz} className="mt-2 grid grid-cols-[40px_repeat(3,minmax(0,1fr))] items-stretch gap-2">
            <div className="flex flex-col items-center justify-center" title={labels.xyzHint[xyz]}>
              <span className="font-display text-sm font-extrabold text-ink-soft">{xyz}</span>
              <span className="text-2xs text-muted">{xyz === 'X' ? '±' : xyz === 'Y' ? '≈' : '~'}</span>
            </div>

            {ABC_KEYS.map((abc) => {
              const cell = at(abc, xyz);
              const intensity = max > 0 ? clamp01(cell.revenue / max) : 0;
              // Bo'yoq kuchi mavzuga bog'liq — qorong'ida bo'yoq fonni ochadi
              const alpha =
                cell.count === 0
                  ? '0.04'
                  : `calc(var(--abc-tint-base) + ${intensity} * var(--abc-tint-span))`;
              const isActive = active?.abc === abc && active?.xyz === xyz;
              const disabled = cell.count === 0;
              return (
                <button
                  key={`${abc}${xyz}`}
                  type="button"
                  disabled={disabled}
                  onClick={() => onSelect({ abc, xyz })}
                  title={`${abc}${xyz} · ${labels.abcHint[abc]} / ${labels.xyzHint[xyz]}`}
                  className={cn(
                    'group relative flex min-h-[72px] flex-col items-center justify-center rounded-xl border p-2 text-center transition-all duration-200 ease-spring',
                    isActive ? 'border-line-strong ring-2 ring-brand/50' : 'border-line',
                    disabled ? 'cursor-default opacity-60' : 'hover:-translate-y-0.5 hover:border-line-strong',
                  )}
                  style={{ background: `rgb(var(${ABC_CSS_VAR[abc]}) / ${alpha})` }}
                >
                  <span className="absolute left-1.5 top-1.5 text-2xs font-bold tracking-wider text-ink-soft">
                    {abc}
                    {xyz}
                  </span>
                  <span className="tnum font-display text-xl font-extrabold leading-none text-ink">{cell.count}</span>
                  <span className="mt-0.5 text-2xs text-ink-soft">{labels.skuWord}</span>
                  <span className="tnum mt-1 text-xs font-semibold text-ink-soft">{f.compact(cell.revenue)}</span>
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
