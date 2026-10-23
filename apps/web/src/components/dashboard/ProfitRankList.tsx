import { RankBadge } from '@/components/ui';
import { useFormat } from '@/i18n';
import { cn } from '@/lib/utils';

export interface ProfitRankRow {
  name: string;
  /** Variant yoki SKU — nom yonida xira; bir xil nomli ikki tovar ajralsin */
  sub: string;
  profit: number;
  /** O'rin; "Boshqa tovarlar" qatorida yo'q */
  rank?: number;
}

/**
 * "Qaysi tovar ko'proq foyda keltiryapti" — reyting ro'yxati.
 *
 * Umumiy BarsChart (horizontal) o'rni oddiy matnda yozardi — sahifadagi
 * Top mahsulotlar jadvali bilan bir xil RankBadge (1 oltin, 2 kumush,
 * 3 bronza) shu yerda ham bo'lsin. Chiziq uzunligi eng kattasiga nisbatan,
 * o'ngdagi foiz — ro'yxatdagi jami foydadagi ulush.
 */
export function ProfitRankList({ rows, className }: { rows: ProfitRankRow[]; className?: string }) {
  const f = useFormat();
  const max = Math.max(1, ...rows.map((r) => Math.abs(r.profit)));
  const total = rows.reduce((acc, r) => acc + Math.max(0, r.profit), 0);

  return (
    <ol className={cn('space-y-3', className)}>
      {rows.map((r, i) => (
        <li key={`${r.name}-${r.sub}-${i}`} className="grid grid-cols-[1.75rem_minmax(0,1fr)] items-start gap-x-3">
          {r.rank ? (
            <RankBadge rank={r.rank} className="mt-px" />
          ) : (
            <span className="mt-px inline-flex h-6 w-6 items-center justify-center rounded-lg text-xs font-bold text-muted" aria-hidden>
              …
            </span>
          )}
          <div className="min-w-0">
            {/* Telefonda summa nom ostida — yonma-yon turganda nom 8–10 harfgacha kesilib qolardi */}
            <div className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between sm:gap-3">
              {/* Nom kesiladi, variant esa hech qachon: aks holda «ЧЕРН» va «БЕЛЫЙ» bir xil ko'rinardi */}
              <p className="flex min-w-0 text-sm leading-6 text-ink" title={r.sub ? `${r.name} · ${r.sub}` : r.name}>
                <span className="truncate">{r.name}</span>
                {r.sub ? <span className="shrink-0 whitespace-pre text-muted"> · {r.sub}</span> : null}
              </p>
              <p
                className={cn(
                  'tnum shrink-0 whitespace-nowrap text-sm font-semibold',
                  r.profit < 0 ? 'text-danger-ink' : 'text-ink',
                )}
              >
                {f.money(r.profit)}
              </p>
            </div>
            <div className="mt-1 flex items-center gap-2.5">
              <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-surface-3">
                <div
                  className={cn(
                    'h-full rounded-full bg-gradient-to-r transition-[width] duration-700 ease-spring',
                    r.profit < 0 ? 'from-danger/50 to-danger' : r.rank ? 'from-brand/50 to-brand' : 'from-muted/40 to-muted/70',
                  )}
                  style={{ width: `${Math.max(1.5, (Math.abs(r.profit) / max) * 100)}%` }}
                />
              </div>
              <span className="tnum w-9 shrink-0 text-right text-2xs text-muted">
                {total > 0 && r.profit > 0 ? f.pct((r.profit / total) * 100, 0) : '—'}
              </span>
            </div>
          </div>
        </li>
      ))}
    </ol>
  );
}
