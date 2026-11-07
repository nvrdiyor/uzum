/**
 * Qarzlar sahifasining bosh bloki (sahifadagi yagona HeroCard, PayoutHero
 * namunasida): jami qarz qoldig'i so'mda, eng shoshilinch to'lov va to'rt izoh.
 *
 * Ranglar ma'no bo'yicha: to'lash kerak va foiz — za'faron, sotuvchining
 * ishlatilmagan puli — brend, bo'sh limit — ko'k, qizil — FAQAT kechikkanda.
 * Binafsha ishlatilmaydi (u Uzum ulushi).
 *
 * Dollar qarzi so'mga faqat Markaziy bankning jonli kursi bilan qo'shiladi;
 * kurs olinmasa (zaxira 12 600 — eskirgan) dollar alohida ko'rsatiladi.
 */
import { useNavigate } from 'react-router-dom';
import { formatDebtMoney, type DebtListResponse } from '@savdoiq/shared';
import { Banknote, CalendarClock, Info } from '@/components/icons';
import { Amount, Badge, HeroCard } from '@/components/ui';
import { useCountUp } from '@/hooks/useCountUp';
import { useFormat, useT } from '@/i18n';
import { cn } from '@/lib/utils';
import { InfoPopover } from './InfoPopover';
import { dueText, liveRate, sumToUzs, uzsSumText } from './format';

/** Tailwind klasslari to'liq yozilgan — shablon qatoridan yasalsa CSS'ga chiqmaydi */
const XL_COLS: Record<number, string> = {
  1: 'xl:grid-cols-1',
  2: 'xl:grid-cols-2',
  3: 'xl:grid-cols-3',
  4: 'xl:grid-cols-4',
  5: 'xl:grid-cols-5',
};

/** "Qanday hisoblanadi" — usul, taxminiylik va tuzatish yo'li */
export function MethodNote() {
  const t = useT('debts');
  return (
    <div className="space-y-1.5">
      <p className="font-semibold text-ink">{t('method.title')}</p>
      <p>{t('method.daily')}</p>
      <p>{t('method.monthly')}</p>
      <p>{t('method.order')}</p>
      <p>{t('method.estimate')}</p>
      <p className="text-ink">{t('method.adjust')}</p>
    </div>
  );
}

export function DebtsHero({ data }: { data: DebtListResponse }) {
  const t = useT('debts');
  const f = useFormat();
  const navigate = useNavigate();
  const { totals } = data;

  const principal = sumToUzs(data, (x) => x.principal);
  const interest = sumToUzs(data, (x) => x.accruedInterest);
  const soon = sumToUzs(data, (x) => x.dueSoon);
  const monthly = sumToUzs(data, (x) => x.monthlyInterest);
  const unused = sumToUzs(data, (x) => x.unused);
  const free = sumToUzs(data, (x) => x.freeLimit);
  const overdue = sumToUzs(data, (x) => x.overdue);
  const soonCount = totals.byCurrency.reduce((a, x) => a + x.dueSoonCount, 0);
  const overdueCount = totals.byCurrency.reduce((a, x) => a + x.overdueCount, 0);

  const active = data.items.filter((i) => i.calc.state === 'active');
  const hasCards = active.some((i) => i.kind === 'card');
  // Avvaldan bor kreditda ishlatish yozilmaguncha "ishlatilmagan" hisoblanmaydi (null)
  const hasCash = active.some((i) => i.kind !== 'card' && i.calc.unused != null);

  // Asosiy raqam so'mda; so'm qarzi yo'q va dollar kursi olinmagan bo'lsa — dollarning o'zi
  const inUzs = principal.parts > 0 || principal.rest.length === 0;
  const headline = inUzs
    ? { value: principal.uzs, currency: 'UZS' as const }
    : { value: principal.rest[0].amount, currency: principal.rest[0].currency };
  const separate = inUzs ? principal.rest : principal.rest.slice(1);
  const shown = useCountUp(headline.value);

  const usdRate = liveRate(data.rates, 'USD');
  const usdIncluded = usdRate !== null && totals.byCurrency.some((x) => x.currency === 'USD' && x.principal > 0);
  const usdUpdated = data.rates.USD?.updatedAt ?? null;

  const next = totals.next;
  const late = overdueCount > 0;

  const wells = [
    {
      key: 'soon',
      dot: 'bg-warn',
      label: t('hero.soon'),
      value: uzsSumText(soon, f.lang),
      hint: t('hero.soonHint', { n: soonCount }),
    },
    {
      key: 'monthly',
      dot: 'bg-warn',
      label: t('hero.monthly'),
      value: uzsSumText(monthly, f.lang),
      hint: t('hero.monthlyHint'),
    },
    hasCash
      ? {
          key: 'unused',
          dot: 'bg-brand',
          label: t('hero.unused'),
          value: uzsSumText(unused, f.lang),
          hint: t('hero.unusedHint'),
        }
      : null,
    hasCards
      ? {
          key: 'free',
          dot: 'bg-info',
          label: t('hero.freeLimit'),
          value: uzsSumText(free, f.lang),
          hint: t('hero.freeLimitHint'),
        }
      : null,
    late
      ? {
          key: 'overdue',
          dot: 'bg-danger',
          label: t('hero.overdue'),
          value: uzsSumText(overdue, f.lang),
          hint: t('hero.overdueHint', { n: overdueCount }),
        }
      : null,
  ].filter((w): w is NonNullable<typeof w> => w !== null);

  return (
    <HeroCard tone={late ? 'danger' : 'warn'} className="flex flex-col p-5 sm:p-7">
      <div className="flex flex-wrap items-start justify-between gap-x-8 gap-y-5">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="icon-tile h-9 w-9 rounded-[10px] [&_svg]:h-[18px] [&_svg]:w-[18px]" aria-hidden>
              <Banknote />
            </span>
            <p className="font-display text-[15px] font-semibold text-ink">{t('hero.total')}</p>
            <InfoPopover
              title={t('hero.estimate')}
              label={
                <>
                  <Info className="h-3.5 w-3.5" />
                  {t('hero.estimate')}
                </>
              }
              className="chip focusable bg-surface-3 text-muted transition-colors hover:text-ink"
            >
              <MethodNote />
            </InfoPopover>
          </div>
          <p className="tnum mt-4 font-title text-[32px] font-semibold leading-none tracking-[-0.03em] text-ink sm:text-[44px]">
            <Amount value={formatDebtMoney(shown, headline.currency, f.lang)} />
          </p>
          <div className="mt-2.5 space-y-0.5 text-xs text-muted">
            {usdIncluded ? (
              <p className="tnum">
                {usdUpdated
                  ? t('hero.rate', { rate: f.num(usdRate ?? 0, 2), date: f.dateShort(usdUpdated) })
                  : t('hero.rateNoDate', { rate: f.num(usdRate ?? 0, 2) })}
              </p>
            ) : null}
            {separate.map((r) => (
              <p key={r.currency} className="tnum font-medium text-ink-soft">
                {t('hero.noRate', { amount: formatDebtMoney(r.amount, r.currency, f.lang) })}
              </p>
            ))}
            {interest.uzs > 0 || interest.rest.length ? (
              <p className="tnum">{t('hero.interest', { sum: uzsSumText(interest, f.lang) })}</p>
            ) : null}
          </div>
        </div>

        {/* Eng shoshilinch to'lov — bosilsa o'sha qarz ochiladi */}
        {next ? (
          <button
            type="button"
            onClick={() => navigate(`/debts/${next.debtId}`)}
            className="well focusable flex w-full min-w-0 items-start gap-3 p-3.5 text-left transition-colors hover:border-line-strong sm:w-auto sm:min-w-[16rem]"
          >
            <span
              className={cn(
                'icon-tile h-9 w-9 rounded-[10px] [&_svg]:h-[18px] [&_svg]:w-[18px]',
                next.due.status === 'overdue' ? 'tone-danger' : 'tone-warn',
              )}
              aria-hidden
            >
              <CalendarClock />
            </span>
            <span className="min-w-0">
              <span className="eyebrow-lg block">{t('hero.next')}</span>
              <span className="tnum mt-0.5 block font-display text-xl font-bold leading-snug tracking-[-0.01em] text-ink">
                {/* Tayyor karta: ko'chirma hali chiqmagan — minimal taxminiy (kartochka va qarz sahifasidagidek "≈") */}
                {next.due.card?.estimate ? '≈ ' : ''}
                <Amount value={formatDebtMoney(next.due.remaining, next.currency, f.lang)} />
              </span>
              <span className="tnum mt-0.5 block max-w-[18rem] truncate text-xs text-muted">
                {f.date(next.due.date)} · {next.lender}
              </span>
              <Badge tone={next.due.status === 'overdue' ? 'danger' : 'warn'} className="mt-2">
                {dueText(next.due, t)}
              </Badge>
            </span>
          </button>
        ) : (
          <div className="well flex w-full min-w-0 items-start gap-3 p-3.5 sm:w-auto sm:min-w-[16rem]">
            <span className="icon-tile tone-muted h-9 w-9 rounded-[10px] [&_svg]:h-[18px] [&_svg]:w-[18px]" aria-hidden>
              <CalendarClock />
            </span>
            <div className="min-w-0">
              <p className="eyebrow-lg">{t('hero.next')}</p>
              <p className="mt-0.5 max-w-[16rem] text-sm text-muted">{t('hero.noNext')}</p>
            </div>
          </div>
        )}
      </div>

      <ul
        className={cn(
          'mt-6 grid grid-cols-2 gap-2.5 max-sm:[&>*:last-child:nth-child(odd)]:col-span-2',
          XL_COLS[wells.length] ?? 'xl:grid-cols-4',
        )}
      >
        {wells.map((w) => (
          <li key={w.key} className="well min-w-0 p-3.5">
            <div className="flex items-center gap-2 text-[13px] font-medium text-ink-soft">
              <span className={cn('h-2 w-2 shrink-0 rounded-full', w.dot)} />
              {/* Telefonda ikki ustunli blokda yorliq qisqarmasin ("30 kunda to'la…") — ikki qatorga o'tadi */}
              <span className="min-w-0 leading-snug sm:truncate" title={w.label}>
                {w.label}
              </span>
            </div>
            <p className="tnum mt-1.5 text-[17px] font-semibold leading-6 text-ink">
              <Amount value={w.value} />
            </p>
            <p className="mt-0.5 text-xs leading-snug text-muted">{w.hint}</p>
          </li>
        ))}
      </ul>
    </HeroCard>
  );
}
