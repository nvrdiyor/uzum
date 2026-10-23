import { useLayoutEffect, useState } from 'react';
import { Scale } from '@/components/icons';
import { Amount, Delta, HeroCard, Skeleton, Sparkline } from '@/components/ui';
import { useCountUp } from '@/hooks/useCountUp';
import { useFormat, useT } from '@/i18n';
import { cn } from '@/lib/utils';

/** Element kengligi (px) — o'lcham o'zgarsa yangilanadi */
function useElementWidth() {
  const [el, setEl] = useState<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    if (!el) return undefined;
    const measure = () => {
      const w = Math.floor(el.getBoundingClientRect().width);
      // Bir-ikki pikselga o'zgarish qayta chizishga arzimaydi
      setWidth((prev) => (Math.abs(prev - w) < 2 ? prev : w));
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [el]);
  return [setEl, width] as const;
}

/**
 * Moliya sahifasining bosh kartochkasi — "davr oxirida qo'limda qancha
 * qoldi?" degan savolning javobi.
 *
 * Ilgari sof foyda to'rtta bir xil KPI kartochkasidan biri edi va eng
 * oxirida turardi: sotuvchi asosiy raqamni tushum, yalpi va tovarlar
 * foydasi orasidan qidirib topardi. Endi u sahifadagi yagona HeroCard —
 * yonida oldingi davr, marja (foiz punktida) va undan ayrilgan davr
 * xarajatlari.
 */
export function NetProfitHero({
  value,
  previous,
  delta,
  margin,
  marginPrevious,
  periodExpenses,
  spark,
  loading,
  className,
}: {
  value: number;
  /** Oldingi davrdagi sof foyda (P&L'dan); hali kelmagan bo'lsa null */
  previous: number | null;
  delta: number | null;
  margin: number;
  /** Oldingi davr marjasi — o'zgarish foiz punktida ko'rsatiladi */
  marginPrevious: number | null;
  periodExpenses: number;
  spark: number[];
  loading?: boolean;
  className?: string;
}) {
  const t = useT('finance');
  const tc = useT('common');
  const f = useFormat();
  const loss = value < 0;
  const shown = useCountUp(value);
  const [sparkRef, sparkWidth] = useElementWidth();
  // Marja o'zgarishi — foiz punkti: 25% dan 27,3% ga chiqsa "+2,3 p.p.", "+9%" emas
  const marginDelta = marginPrevious === null ? null : margin - marginPrevious;

  return (
    <HeroCard tone={loss ? 'danger' : 'brand'} className={cn('flex flex-col p-5 sm:p-6', className)}>
      <div className="flex min-w-0 items-center gap-3">
        <span className="icon-tile h-10 w-10 rounded-xl [&_svg]:h-5 [&_svg]:w-5" aria-hidden>
          <Scale />
        </span>
        <div className="min-w-0">
          <p className="font-display text-[15px] font-semibold leading-5 text-ink">
            {loss ? t('hero.loss') : t('kpi.oper')}
          </p>
          <p className="truncate text-xs text-muted">{t('hero.sub')}</p>
        </div>
      </div>

      {loading ? (
        <>
          <Skeleton className="mt-5 h-10 w-64 max-w-full" />
          <Skeleton className="mt-3 h-5 w-40" />
          <Skeleton className="mt-5 h-14 w-full" />
        </>
      ) : (
        <>
          <p
            className={cn(
              'tnum mt-5 font-title text-[30px] font-semibold leading-none tracking-[-0.03em] sm:text-[38px]',
              loss ? 'text-danger-ink' : 'text-ink',
            )}
          >
            <Amount value={f.money(shown)} />
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-x-2.5 gap-y-1">
            <Delta value={delta} />
            {previous !== null ? (
              <span className="tnum text-xs text-muted">{tc('common.prevValue', { v: f.money(previous) })}</span>
            ) : null}
          </div>
          {/*
            Kunlik sof foyda — kartochka kengligida. Burchakdagi kichik chiziq
            o'rniga: bosh raqam qanday kunlardan yig'ilgani (bir kunlik keskin
            tushish yoki tekis o'sish) shu yerda o'qiladi.
          */}
          {spark.length > 1 ? (
            <div className="mt-4" ref={sparkRef}>
              <p className="eyebrow mb-1">{t('hero.daily')}</p>
              {/*
                Kenglik o'lchab beriladi, balandlik doim 56 px: SVG'ni CSS bilan
                cho'zsak, keng ekranda (kartochka butun qatorni olganda) chiziq
                150 px balandlikka "shishib" ketardi.
              */}
              {sparkWidth > 0 ? (
                <Sparkline data={spark} width={sparkWidth} height={56} tone={loss ? 'danger' : 'brand'} />
              ) : (
                <div className="h-14" />
              )}
            </div>
          ) : null}
        </>
      )}

      <div className="mt-auto grid grid-cols-2 gap-2.5 pt-5">
        <div className="well min-w-0 p-3">
          <p className="eyebrow">{t('hero.margin')}</p>
          {loading ? (
            <Skeleton className="mt-2 h-6 w-20" />
          ) : (
            <>
              <p className={cn('tnum mt-1 font-display text-lg font-bold leading-6', margin < 0 ? 'text-danger' : 'text-ink')}>
                {f.pct(margin)}
              </p>
              <div className="mt-1.5 flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1">
                <Delta value={marginDelta} unit="pp" />
                {marginPrevious !== null ? (
                  <span className="tnum truncate text-2xs text-muted">
                    {tc('common.prevValue', { v: f.pct(marginPrevious) })}
                  </span>
                ) : null}
              </div>
            </>
          )}
        </div>
        <div className="well min-w-0 p-3">
          <p className="eyebrow">{t('hero.periodCosts')}</p>
          {loading ? (
            <Skeleton className="mt-2 h-6 w-28" />
          ) : (
            <>
              <p className="tnum mt-1 truncate font-display text-lg font-bold leading-6 text-ink" title={f.money(periodExpenses)}>
                <Amount value={f.money(periodExpenses)} />
              </p>
              <p className="mt-1.5 line-clamp-2 text-2xs leading-snug text-muted">{t('hero.periodHint')}</p>
            </>
          )}
        </div>
      </div>
    </HeroCard>
  );
}
