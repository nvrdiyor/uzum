import { Flame, TrendingDown } from '@/components/icons';
import { HeroCard } from '@/components/ui';
import { useFormat } from '@/i18n';
import { cn } from '@/lib/utils';

/**
 * "Har kuni yo'qotayotgan pulingiz" — Nolikvidlar sahifasining yagona
 * HeroCard'i: kunlik saqlash xarajati + oylik/yillik proyeksiya.
 *
 * Qizil ohang ATAYLAB: bu sahifadagi yagona haqiqiy yo'qotish (muzlagan
 * kapital hali zarar emas — u sariq). Ilgari karta o'z qo'lda yozilgan qizil
 * foni va yorug'ligi bilan turardi; endi umumiy HeroCard — chegara, yorug'lik
 * va ikonka plitkasi boshqa sahifalardagi hero bilan bir xil.
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
    <HeroCard tone="danger" className={cn('p-5 sm:p-6', className)}>
      <div className="flex flex-wrap items-start justify-between gap-5">
        <div className="min-w-0">
          <div className="flex items-center gap-2.5">
            <span className="icon-tile h-9 w-9 rounded-[10px] [&_svg]:h-[18px] [&_svg]:w-[18px]" aria-hidden>
              <Flame />
            </span>
            <p className="font-display text-sm font-bold text-danger-ink">{title}</p>
          </div>

          <p className="tnum mt-3 font-display text-[34px] font-extrabold leading-none tracking-[-0.02em] text-ink sm:text-[42px]">
            {f.money(perDay)}
          </p>
          <p className="mt-2 max-w-md text-sm leading-relaxed text-ink-soft">{hint}</p>
          {footer ? <p className="mt-2 text-xs text-muted">{footer}</p> : null}
        </div>

        <div className="flex shrink-0 gap-3">
          <div className="well px-4 py-3">
            <p className="eyebrow">{monthLabel}</p>
            <p className="tnum mt-1 font-display text-base font-extrabold text-ink">{f.compact(perMonth)}</p>
          </div>
          <div className="well px-4 py-3">
            <p className="eyebrow">{yearLabel}</p>
            <p className="tnum mt-1 flex items-center gap-1 font-display text-base font-extrabold text-danger">
              <TrendingDown className="h-3.5 w-3.5" />
              {f.compact(perYear)}
            </p>
          </div>
        </div>
      </div>
    </HeroCard>
  );
}
