import { Children, type ReactNode } from 'react';
import { useT } from '@/i18n';
import { cn } from '@/lib/utils';
import { Amount, Delta, Skeleton, Sparkline } from './primitives';

export interface StatCardProps {
  label: ReactNode;
  value: ReactNode;
  /** Foizdagi o'zgarish (oldingi davrga nisbatan) */
  delta?: number | null;
  /** Kamayish yaxshi bo'lsa true (xarajatlar uchun) */
  invertDelta?: boolean;
  /** 'pp' — marja, ROI, xarid va qaytarish ulushi kabi foiz ko'rsatkichlar uchun */
  deltaUnit?: 'pct' | 'pp';
  /** Oldingi davr qiymati (formatlangan) — o'zgarish chipi yonida xira yoziladi */
  previous?: ReactNode;
  hint?: ReactNode;
  icon?: ReactNode;
  spark?: number[];
  /** 'muted' — ma'nosi neytral ko'rsatkich (masalan, SKU soni); 'pink' — pullik saqlash (COST_COLORS.storage) */
  tone?: 'brand' | 'info' | 'warn' | 'danger' | 'violet' | 'muted' | 'pink';
  /** Tepadagi ohang chizig'i (standart: bor). Bir qatorda hamma kartochka bir xil bo'lsin */
  accent?: boolean;
  loading?: boolean;
  className?: string;
  onClick?: () => void;
  footer?: ReactNode;
}

export function StatCard({
  label,
  value,
  delta,
  invertDelta,
  deltaUnit = 'pct',
  previous,
  hint,
  icon,
  spark,
  tone = 'brand',
  accent = true,
  loading,
  className,
  onClick,
  footer,
}: StatCardProps) {
  const t = useT('common');
  return (
    <div
      className={cn(
        // flex-col + pastdagi mt-auto: qatordagi barcha kartochkalarda
        // o'zgarish chipi va sparkline bir sathda turadi
        // container: raqam o'lchami karta kengligiga moslashadi (telefonda 2 ustun)
        'card card-hover relative flex flex-col p-4 [container-type:inline-size] sm:p-5',
        `tone-${tone}`,
        accent && 'card-accent',
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
          <div className="flex min-w-0 items-center gap-2.5">
            {icon ? (
              /*
                Ohang rangidagi plitka. Ilgari bu yerda `bg-brand/12` turardi —
                Tailwind shkalasida 12 yo'qligi sababli fon umuman chizilmas
                edi va belgi yalang'och turardi (2026-10-24 gacha).
              */
              <span className="icon-tile h-8 w-8 rounded-[10px] [&_svg]:h-4 [&_svg]:w-4">{icon}</span>
            ) : null}
            {/* Sarlavha ikki qatorgacha — tor kartada kesilib ma'nosi yo'qolmasin */}
            <p className="line-clamp-2 eyebrow-lg">{label}</p>
          </div>
          {loading ? (
            <Skeleton className="mt-3 h-8 w-32" />
          ) : (
            <p className="tnum mt-3 font-display text-[clamp(17px,12.5cqi,26px)] font-bold leading-[1.15] tracking-[-0.02em] text-ink">
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
          {delta !== undefined ? (
            <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
              <Delta value={delta} invert={invertDelta} unit={deltaUnit} />
              {previous !== undefined && previous !== null ? (
                <span className="tnum truncate text-2xs text-muted">{t('common.prevValue', { v: String(previous) })}</span>
              ) : null}
            </span>
          ) : (
            <span />
          )}
          {spark && spark.length > 1 ? (
            <Sparkline
              data={spark}
              tone={tone === 'violet' || tone === 'muted' || tone === 'pink' ? 'info' : tone}
              className="opacity-80"
            />
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
    <div
      className={cn(
        'grid gap-3 sm:gap-4',
        // Telefonda ikki ustun; toq qolgan oxirgi kartochka butun qatorni oladi
        count >= 2 && 'grid-cols-2 max-sm:[&>*:last-child:nth-child(odd)]:col-span-2',
        GRID_COLS[count] ?? 'sm:grid-cols-2 xl:grid-cols-4',
        className,
      )}
    >
      {children}
    </div>
  );
}
