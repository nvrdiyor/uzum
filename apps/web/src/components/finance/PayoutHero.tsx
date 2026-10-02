/**
 * Pul kalendarining bosh bloki: "qancha pul tayyor, qanchasi hali qulfda".
 *
 * Ilgari to'rtta bir xil kartochka edi (ochilgan, kutilmoqda, eng yaqin
 * ochilish, xizmat to'lovlari) — sotuvchi asosiy raqamni qidirib o'qirdi.
 * Endi yechib olish mumkin bo'lgan summa yirik, yonida eng yaqin ochilish,
 * ostida esa ochilgan va kutilayotgan pul bitta lentada — boshqaruv
 * panelidagi "Pul qayerga ketdi" bilan bir xil tilda.
 */
import type { PayoutCalendarResponse } from '@savdoiq/shared';
import { Amount, Skeleton } from '@/components/ui';
import { useCountUp } from '@/hooks/useCountUp';
import { useFormat, useT } from '@/i18n';
import { cn } from '@/lib/utils';

type Totals = PayoutCalendarResponse['totals'];

export function PayoutHero({ totals, hold, loading }: { totals?: Totals; hold: number; loading?: boolean }) {
  const t = useT('payout');
  const f = useFormat();

  const unlocked = Math.max(0, totals?.unlocked ?? 0);
  const pending = Math.max(0, totals?.pending ?? 0);
  const charges = Math.max(0, totals?.charges ?? 0);
  const withdrawn = totals?.withdrawn ?? 0;
  const base = unlocked + pending;
  const shown = useCountUp(unlocked);

  if (loading || !totals) {
    return (
      <div className="card p-5 sm:p-7">
        <Skeleton className="h-4 w-36" />
        <Skeleton className="mt-3 h-11 w-72 max-w-full" />
        <Skeleton className="mt-10 h-3.5 w-full" />
        <div className="mt-5 grid gap-4 sm:grid-cols-3">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      </div>
    );
  }

  const segments = [
    { key: 'unlocked', amount: unlocked, fill: 'bg-brand' },
    { key: 'pending', amount: pending, fill: 'bg-warn' },
  ].filter((s) => s.amount > 0);

  const legend = [
    {
      key: 'unlocked',
      dot: 'bg-brand',
      label: t('kpi.unlocked'),
      amount: unlocked,
      hint: withdrawn > 0 ? t('kpi.unlockedHintWithdrawn', { amount: f.money(withdrawn) }) : t('kpi.unlockedHint'),
    },
    { key: 'pending', dot: 'bg-warn', label: t('kpi.pending'), amount: pending, hint: t('kpi.pendingHint', { n: hold }) },
    { key: 'charges', dot: 'bg-danger', label: t('kpi.charges'), amount: charges, hint: t('kpi.chargesHint') },
  ];

  return (
    <section className="card flex flex-col p-5 sm:p-7">
      <div className="flex flex-wrap items-start justify-between gap-x-8 gap-y-5">
        <div className="min-w-0">
          <p className="eyebrow-lg">{t('hero.available')}</p>
          <p className="tnum mt-2 font-title text-[32px] font-semibold leading-none tracking-[-0.03em] text-ink sm:text-[44px]">
            <Amount value={f.money(shown)} />
          </p>
        </div>

        <div className="min-w-0 sm:text-right">
          <p className="eyebrow-lg">{t('kpi.next')}</p>
          {totals.nextDate ? (
            <>
              <p className="tnum mt-2 font-display text-[22px] font-bold leading-none tracking-[-0.02em] text-ink sm:text-2xl">
                <Amount value={f.money(totals.nextAmount)} />
              </p>
              <p className="tnum mt-2.5 text-sm text-muted">
                {totals.nextAt ? f.dateTime(totals.nextAt) : f.date(totals.nextDate)}
              </p>
            </>
          ) : (
            <p className="mt-2 max-w-[16rem] text-sm text-muted">{t('hero.noNext')}</p>
          )}
        </div>
      </div>

      <div className="mt-8">
        <div
          role="img"
          aria-label={`${t('kpi.unlocked')} ${f.money(unlocked)}, ${t('kpi.pending')} ${f.money(pending)}`}
          className="flex h-3.5 w-full gap-1"
        >
          {segments.map((s, i) => (
            <div
              key={s.key}
              className={cn('h-full min-w-[6px] origin-left animate-grow-x rounded-full', s.fill)}
              style={{ flex: `${s.amount / base} 1 0%`, animationDelay: `${120 + i * 140}ms` }}
            />
          ))}
          {base <= 0 ? <div className="h-full flex-1 rounded-full bg-surface-3" /> : null}
        </div>

        <ul className="mt-5 grid gap-x-6 gap-y-4 sm:grid-cols-3">
          {legend.map((l) => (
            <li key={l.key} className="min-w-0">
              <div className="flex items-center gap-2 text-[13px] font-medium text-ink-soft">
                <span className={cn('h-2 w-2 shrink-0 rounded-full', l.dot)} />
                <span className="truncate">{l.label}</span>
              </div>
              <p className="tnum mt-1.5 text-[17px] font-semibold leading-6 text-ink">
                <Amount value={f.money(l.amount)} />
              </p>
              <p className="text-xs leading-snug text-muted">{l.hint}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
