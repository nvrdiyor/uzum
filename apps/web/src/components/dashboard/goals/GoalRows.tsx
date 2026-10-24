import type { ReactNode } from 'react';
import { Check } from '@/components/icons';
import { Badge, Delta, ProgressBar } from '@/components/ui';
import { useFormat, useT } from '@/i18n';
import { cn } from '@/lib/utils';
import { GOALS_NS } from './i18n';
import type { MarginRow, PacedRow } from './model';

/**
 * Tushum / sof foyda / dona qatori: "hozir / maqsad", sur'at belgili chiziq,
 * prognoz va kuniga kerakli sur'at.
 */
export function PacedGoalRow({
  row,
  isSuggestion,
  marker,
  markerLabel,
  lastDay,
}: {
  row: PacedRow;
  /** Maqsad saqlanmagan — qiymat shtrixli "taklif" bo'lib ko'rinadi */
  isSuggestion: boolean;
  marker: number;
  markerLabel: string;
  lastDay: boolean;
}) {
  const t = useT(GOALS_NS);
  const f = useFormat();
  // Pul — ixcham ("315,6 mln"): 1/3 kenglikdagi kartochkada to'liq summa ikki qatorga tushardi
  const fmt = (v: number) => (row.key === 'units' ? f.num(v) : f.compact(v));
  const needValue = (v: number) => (row.key === 'units' ? t('unitsValue', { v: f.num(v) }) : f.compact(v));

  let need: ReactNode = null;
  if (row.need !== null && row.target !== null) {
    need =
      row.need <= 0 ? (
        <span className="inline-flex items-center gap-1 font-semibold text-brand-ink">
          <Check className="h-3 w-3" />
          {t('reached')}
        </span>
      ) : (
        t(lastDay ? 'lastDay' : 'perDay', { v: needValue(row.need) })
      );
  }

  return (
    <div className="min-w-0">
      <div className="flex items-center justify-between gap-2">
        <p
          className="flex min-w-0 items-center gap-1.5 text-[13px] font-medium leading-5 text-ink-soft"
          title={t(`hint.${row.key}`)}
        >
          <span className="truncate">{t(`row.${row.key}`)}</span>
          {row.donePct !== null ? (
            <Badge tone={row.tone} className="tnum shrink-0 px-1.5 py-0 text-2xs font-semibold">
              {f.pct(row.donePct, 0)}
            </Badge>
          ) : null}
        </p>
        <p className="tnum shrink-0 whitespace-nowrap text-[13px] leading-5 text-muted">
          <span className={cn('font-semibold', row.actual < 0 ? 'text-danger-ink' : 'text-ink')}>{fmt(row.actual)}</span>
          {row.target !== null ? (
            <>
              {' / '}
              <span
                className={cn(isSuggestion && 'rounded border border-dashed border-line-strong px-1')}
                title={isSuggestion ? t('suggest.hint') : undefined}
              >
                {fmt(row.target)}
              </span>
            </>
          ) : null}
        </p>
      </div>

      {row.target !== null ? (
        <ProgressBar className="mt-1.5" value={row.fill} tone={row.tone} marker={marker} markerLabel={markerLabel} />
      ) : null}

      <div className="mt-1 flex flex-wrap items-center justify-between gap-x-3 text-2xs leading-4 text-muted">
        <span className="tnum" title={row.key === 'netProfit' ? t('hint.netProfit') : undefined}>
          {row.forecastPct !== null
            ? t('forecast', { v: fmt(row.forecast), p: f.pct(row.forecastPct, 0) })
            : t('forecastOnly', { v: fmt(row.forecast) })}
        </span>
        {need ? <span className="tnum">{need}</span> : null}
      </div>
    </div>
  );
}

/**
 * Marja — CHEGARA, to'ldiriladigan chiziq emas. "68% / 51% = 100%" kabi
 * ko'rsatish hech narsa aytmaydi; farq foiz punktida (+/−) va rangda.
 */
export function MarginGoalRow({ row, isSuggestion }: { row: MarginRow; isSuggestion: boolean }) {
  const t = useT(GOALS_NS);
  const f = useFormat();

  return (
    <div className="well px-3 py-2.5">
      {/* Qiymat nom bilan bir qatorda: 1/3 kenglikda izoh qatori bilan yonma-yon sig'masdi */}
      <div className="flex items-center justify-between gap-2">
        <p className="min-w-0 truncate text-[13px] font-medium leading-5 text-ink-soft" title={t('hint.margin')}>
          {t('row.margin')}
        </p>
        <div className="flex shrink-0 items-center gap-2">
          <span className={cn('tnum font-display text-[17px] font-bold leading-6', row.actual < 0 ? 'text-danger-ink' : 'text-ink')}>
            {f.pct(row.actual)}
          </span>
          {row.gap !== null ? <Delta value={row.gap} unit="pp" className="px-2 py-0.5 text-2xs" /> : null}
        </div>
      </div>
      {row.target !== null || row.forecast !== null ? (
        <p className="tnum mt-0.5 text-2xs leading-4 text-muted">
          {row.target !== null ? (
            <span
              className={cn(isSuggestion && 'rounded border border-dashed border-line-strong px-1')}
              title={isSuggestion ? t('suggest.hint') : undefined}
            >
              {t('margin.target', { v: f.pct(row.target) })}
            </span>
          ) : null}
          {row.target !== null && row.forecast !== null ? ' · ' : null}
          {row.forecast !== null ? t('margin.forecast', { v: f.pct(row.forecast) }) : null}
        </p>
      ) : null}
    </div>
  );
}
