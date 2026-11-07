/**
 * Qarzlar ro'yxatidagi "To'lov tavsiyasi" (2026-11-08): tayyor kartalarda (TBC Osmon, Infin Black) foiz ishlamasligi
 * uchun qaysi kartaga qancha va qachongacha to'lash kerak. Egasining so'rovi: "tavsiya ham qo'shib ber — foiz
 * ishlamasligi uchun bunga buncha, bunga buncha to'lash kerak".
 *
 * Hisob — shared debtPaymentAdvice (keyin Telegram eslatmalari ham shuni ishlatadi); bu yerda faqat ko'rinish.
 * Ranglar ma'no bo'yicha (DebtsHero kabi): qizil — FAQAT kechikkanda, to'lash kerak — za'faron, to'langan — xira.
 * Har qatordagi karta nomi o'sha kartaning sahifasini ochadi.
 *
 * Telefonda (375) va 1920 da gorizontal aylantirish yo'q: matn qatorlarga bo'linadi, summalar `tnum`.
 */
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { formatDebtMoney, type DebtAdvice as AdviceData, type DebtAdviceRow } from '@savdoiq/shared';
import { Lightbulb } from '@/components/icons';
import { Card, CardHeader } from '@/components/ui';
import { useFormat, useT } from '@/i18n';
import { cn } from '@/lib/utils';
import './texts';

/** Qator nuqtasi — Tailwind klasslari to'liq yozilgan (shablondan yasalsa CSS'ga chiqmaydi) */
const DOT: Record<'danger' | 'warn' | 'muted', string> = {
  danger: 'bg-danger',
  warn: 'bg-warn',
  muted: 'bg-muted',
};

export function DebtAdvice({ advice }: { advice: AdviceData }) {
  const t = useT('debts');
  const f = useFormat();
  // Tayyor kartalar faqat so'mda
  const m = (v: number) => formatDebtMoney(v, 'UZS', f.lang);
  const days = (n: number) => (n > 0 ? t('advice.days', { n }) : t('due.todayInline'));
  const graceRows = advice.rows.filter((r) => r.kind === 'grace').length;
  const p = advice.priority;
  const first = p ? advice.rows.find((r) => r.id === p.order[0]) : undefined;

  const row = (r: DebtAdviceRow) => {
    const name = (
      <Link
        to={`/debts/${r.id}`}
        className="focusable rounded-sm font-semibold text-ink underline-offset-2 hover:underline"
      >
        {r.name}
      </Link>
    );
    let tone: keyof typeof DOT = 'warn';
    let main: ReactNode;
    let sub: string | null = null;
    switch (r.kind) {
      case 'overdue':
        tone = 'danger';
        main = (
          <>
            {name} — {t('advice.overdue', { sum: m(r.amount) })}
          </>
        );
        break;
      case 'grace':
        main = (
          <>
            {name}: {t('advice.grace', { sum: m(r.left), date: f.dateShort(r.due), left: days(r.daysLeft) })}
          </>
        );
        sub =
          r.min > 0 ? t('advice.graceSub', { min: m(r.min), risk: m(r.risk) }) : t('advice.graceSubPaid', { risk: m(r.risk) });
        break;
      case 'lost':
        // TBC 5.7.3: kechikish sababli bu oy foiz baribir — kamida minimal (to'langan bo'lsa — xira)
        if (!(r.min > 0)) tone = 'muted';
        main = (
          <>
            {name}: {r.min > 0 ? t('advice.lost', { sum: m(r.min), date: f.dateShort(r.due) }) : t('advice.lostPaid')}
          </>
        );
        break;
      case 'minOnly':
        main = (
          <>
            {name}: {t('advice.minOnly', { sum: m(r.min), date: f.dateShort(r.due) })}
          </>
        );
        break;
      default:
        tone = 'muted';
        main = (
          <>
            ✓ {name}: {t('advice.done')}
          </>
        );
    }
    return (
      <li key={r.id} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
        <span className={cn('mt-[7px] h-2 w-2 shrink-0 rounded-full', DOT[tone])} aria-hidden />
        <div className="min-w-0 flex-1 break-words">
          <p
            className={cn(
              'tnum text-sm leading-relaxed',
              tone === 'danger' ? 'font-medium text-danger-ink' : tone === 'muted' ? 'text-muted' : 'text-ink-soft',
            )}
          >
            {main}
          </p>
          {sub ? <p className="tnum mt-0.5 text-xs leading-relaxed text-muted">{sub}</p> : null}
        </div>
      </li>
    );
  };

  return (
    <Card>
      <CardHeader icon={<Lightbulb />} tone="warn" title={t('advice.title')} subtitle={t('advice.subtitle')} />
      <div className="px-5 pb-5 pt-4">
        <ul className="divide-y divide-line/70">{advice.rows.map(row)}</ul>

        {graceRows > 0 ? (
          <p className="tnum mt-4 border-t border-line/70 pt-3 text-sm font-semibold text-ink">
            {t('advice.total', { sum: m(advice.graceTotal) })}
            {advice.graceMin > 0 ? ` · ${t('advice.totalMin', { sum: m(advice.graceMin) })}` : ''}
          </p>
        ) : null}

        {/* Pul yetmasa: avval hamma minimal (kechiksa limit bloklanadi), keyin to'liq yopa oladigan karta */}
        {graceRows >= 2 ? (
          <p className="tnum mt-3 rounded-xl border border-warn/25 bg-warn/5 px-3.5 py-2.5 text-xs leading-relaxed text-ink-soft">
            <span className="font-semibold text-warn-ink">{t('advice.short')}:</span>{' '}
            {t('advice.shortText', { sum: m(advice.minTotal) })}
            {p && first
              ? ` ${
                  // 1 mln dan kam ortiqcha pulda "har 1 mln so'mga" o'rniga aniq summa — aks holda deyarli to'langan
                  // ko'chirmada "har 1 mln so'mga ≈ milliardlab" chiqardi
                  p.extra >= 1_000_000
                    ? t('advice.firstRate', { name: first.name, sum: m(p.perMillion) })
                    : t('advice.firstAbs', { name: first.name, extra: m(p.extra), sum: m(p.risk) })
                }`
              : ''}
          </p>
        ) : null}
      </div>
    </Card>
  );
}
