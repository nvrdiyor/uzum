/**
 * Pul kalendarining bosh bloki: "qancha pul tayyor, qanchasi hali qulfda".
 *
 * Ilgari to'rtta bir xil kartochka edi (ochilgan, kutilmoqda, eng yaqin
 * ochilish, xizmat to'lovlari) — sotuvchi asosiy raqamni qidirib o'qirdi.
 * Endi yechib olish mumkin bo'lgan summa yirik, yonida eng yaqin ochilish,
 * ostida esa ochilgan va kutilayotgan pul bitta lentada — boshqaruv
 * panelidagi "Pul qayerga ketdi" bilan bir xil tilda.
 *
 * 2026-10-24: sahifaning yagona HeroCard'i. To'rt izoh bir xil `.well`
 * plitkalarga o'tdi va har biri ma'no rangida: ochilgan — brend (sizniki),
 * kutilayotgan — za'faron, yo'ldagi — kulrang, xizmat to'lovlari — binafsha
 * (Uzum ushlagani). Ilgari xizmat to'lovlari qizil nuqta bilan "zarar"dek
 * ko'rinardi.
 */
import type { PayoutCalendarResponse } from '@savdoiq/shared';
import { CalendarClock, Wallet } from '@/components/icons';
import { Amount, HeroCard, Skeleton } from '@/components/ui';
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
  const inTransit = Math.max(0, totals?.inTransit ?? 0);
  const withdrawn = totals?.withdrawn ?? 0;
  const base = unlocked + pending + inTransit;
  const shown = useCountUp(unlocked);

  if (loading || !totals) {
    return (
      <HeroCard className="p-5 sm:p-7">
        <Skeleton className="h-4 w-36" />
        <Skeleton className="mt-3 h-11 w-72 max-w-full" />
        <Skeleton className="mt-10 h-3.5 w-full" />
        <div className="mt-5 grid gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      </HeroCard>
    );
  }

  const segments = [
    { key: 'unlocked', amount: unlocked, fill: 'bg-brand' },
    { key: 'pending', amount: pending, fill: 'bg-warn' },
    // Yo'ldagilar ham balansda bor — uchalasi qo'shilsa kabinetdagi "Umumiy balans" chiqadi
    { key: 'transit', amount: inTransit, fill: 'bg-[rgb(var(--c-slate))]' },
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
    {
      key: 'transit',
      dot: 'bg-[rgb(var(--c-slate))]',
      label: t('kpi.transit'),
      amount: inTransit,
      hint: t('kpi.transitHint'),
    },
    // Binafsha — Uzum ushlab qoladigan qism (Moliya va boshqaruv panelidagi kabi)
    { key: 'charges', dot: 'bg-violet', label: t('kpi.charges'), amount: charges, hint: t('kpi.chargesHint') },
  ];

  return (
    <HeroCard tone="brand" className="flex flex-col p-5 sm:p-7">
      <div className="flex flex-wrap items-start justify-between gap-x-8 gap-y-5">
        <div className="min-w-0">
          <div className="flex items-center gap-2.5">
            <span className="icon-tile h-9 w-9 rounded-[10px] [&_svg]:h-[18px] [&_svg]:w-[18px]" aria-hidden>
              <Wallet />
            </span>
            <p className="font-display text-[15px] font-semibold text-ink">{t('hero.available')}</p>
          </div>
          <p className="tnum mt-4 font-title text-[32px] font-semibold leading-none tracking-[-0.03em] text-ink sm:text-[44px]">
            <Amount value={f.money(shown)} />
          </p>
        </div>

        {/* Eng yaqin ochilish — hali qulfdagi pulning birinchi bo'lagi, shuning uchun za'faron */}
        <div className="well flex w-full min-w-0 items-start gap-3 p-3.5 sm:w-auto sm:min-w-[15rem]">
          <span
            className="icon-tile tone-warn h-9 w-9 rounded-[10px] [&_svg]:h-[18px] [&_svg]:w-[18px]"
            aria-hidden
          >
            <CalendarClock />
          </span>
          <div className="min-w-0">
            <p className="eyebrow-lg">{t('kpi.next')}</p>
            {totals.nextDate ? (
              <>
                <p className="tnum mt-0.5 font-display text-xl font-bold leading-snug tracking-[-0.01em] text-ink">
                  <Amount value={f.money(totals.nextAmount)} />
                </p>
                <p className="tnum text-xs text-muted">
                  {totals.nextAt ? f.dateTime(totals.nextAt) : f.date(totals.nextDate)}
                </p>
              </>
            ) : (
              <p className="mt-0.5 max-w-[16rem] text-sm text-muted">{t('hero.noNext')}</p>
            )}
          </div>
        </div>
      </div>

      <div className="mt-7">
        <div
          role="img"
          aria-label={`${t('kpi.unlocked')} ${f.money(unlocked)}, ${t('kpi.pending')} ${f.money(pending)}, ${t('kpi.transit')} ${f.money(inTransit)}`}
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

        <ul className="mt-5 grid gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
          {legend.map((l) => (
            <li key={l.key} className="well min-w-0 p-3.5">
              <div className="flex items-center gap-2 text-[13px] font-medium text-ink-soft">
                <span className={cn('h-2 w-2 shrink-0 rounded-full', l.dot)} />
                <span className="truncate">{l.label}</span>
              </div>
              <p className="tnum mt-1.5 text-[17px] font-semibold leading-6 text-ink">
                <Amount value={f.money(l.amount)} />
              </p>
              <p className="mt-0.5 text-xs leading-snug text-muted">{l.hint}</p>
            </li>
          ))}
        </ul>
      </div>
    </HeroCard>
  );
}
