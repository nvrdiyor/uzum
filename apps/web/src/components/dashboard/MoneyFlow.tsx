/**
 * "Pul qayerga ketdi" — boshqaruv panelining bosh bloki.
 *
 * Sotuvchi har kuni bitta savolga javob izlaydi: shuncha sotdim, qo'limda
 * qancha qoldi? Tushum bitta lentada uchga bo'linadi:
 *
 *   Uzum oldi        = tushum − Uzum to'lovi (komissiya va yetkazish)
 *   Tannarx va soliq = Uzum to'lovi − sof foyda (tovar narxi, qo'shimcha, soliq)
 *   Sizga qoldi      = sof foyda
 *
 * Uchala raqam serverdagi tayyor ko'rsatkichlarning ayirmasi — yangi hisob
 * yo'q, shuning uchun ular boshqa kartochkalar bilan doim mos keladi.
 * Rang ma'no bildiradi: binafsha — Uzum'niki, firuza — sizniki.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { DashboardResponse } from '@savdoiq/shared';
import { Amount, Delta } from '@/components/ui';
import { registerNamespace, useFormat, useT } from '@/i18n';
import { cn } from '@/lib/utils';

registerNamespace('moneyFlow', {
  uz: {
    profit: 'Sof foyda',
    loss: 'Zarar',
    revenue: 'Tushum',
    kept: 'Tushumning {pct} i sizda qoldi',
    lost: 'Bu davrda xarajat tushumdan oshdi',
    uzum: 'Uzum oldi',
    uzumHint: 'komissiya va yetkazish',
    cost: 'Tannarx va soliq',
    costHint: 'tovar narxi, qo‘shimcha xarajat, soliq',
    mine: 'Sizga qoldi',
    mineHint: 'sof foyda',
    bar: 'Tushum taqsimoti',
  },
  ru: {
    profit: 'Чистая прибыль',
    loss: 'Убыток',
    revenue: 'Выручка',
    kept: 'У вас осталось {pct} выручки',
    lost: 'За период расходы превысили выручку',
    uzum: 'Взял Uzum',
    uzumHint: 'комиссия и доставка',
    cost: 'Себестоимость и налог',
    costHint: 'закупка, доп. расходы, налог',
    mine: 'Осталось вам',
    mineHint: 'чистая прибыль',
    bar: 'Распределение выручки',
  },
  en: {
    profit: 'Net profit',
    loss: 'Loss',
    revenue: 'Revenue',
    kept: 'You kept {pct} of revenue',
    lost: 'Costs exceeded revenue this period',
    uzum: 'Uzum took',
    uzumHint: 'commission and delivery',
    cost: 'Cost and tax',
    costHint: 'purchase, extra costs, tax',
    mine: 'You kept',
    mineHint: 'net profit',
    bar: 'Where revenue went',
  },
});

const reducedMotion = () =>
  typeof window !== 'undefined' && Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);

/**
 * Raqamni oldingi qiymatidan yangisiga 0,9 soniyada "sanab" o'tkazadi.
 * Faqat shu blok qayta chiziladi; harakat kamaytirilgan bo'lsa darhol yozadi.
 */
function useCountUp(target: number, ms = 900): number {
  const [value, setValue] = useState(() => (reducedMotion() ? target : 0));
  const shown = useRef(value);

  useEffect(() => {
    if (reducedMotion()) {
      shown.current = target;
      setValue(target);
      return;
    }
    const from = shown.current;
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / ms);
      const eased = 1 - (1 - p) ** 3;
      shown.current = from + (target - from) * eased;
      setValue(shown.current);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);

  return value;
}

interface Segment {
  key: 'uzum' | 'cost' | 'mine';
  amount: number;
  share: number;
  fill: string;
  label: string;
  hint: string;
}

export function MoneyFlow({
  data,
  footer,
  className,
}: {
  data: DashboardResponse;
  /** Kartochka ostidagi qo'shimcha izoh (masalan, davr xarajatlaridan keyingi foyda) */
  footer?: ReactNode;
  className?: string;
}) {
  const t = useT('moneyFlow');
  const f = useFormat();

  const revenue = Math.max(0, data.revenue.value);
  const payout = Math.min(revenue, Math.max(0, data.payout.value));
  const profit = data.netProfit.value;
  const loss = profit < 0;

  const uzum = revenue - payout;
  const mine = Math.max(0, profit);
  const cost = Math.max(0, payout - mine);
  const base = uzum + cost + mine;

  const segments: Segment[] = (
    [
      { key: 'uzum', amount: uzum, fill: 'bg-violet', label: t('uzum'), hint: t('uzumHint') },
      { key: 'cost', amount: cost, fill: 'bg-[rgb(var(--c-slate))]', label: t('cost'), hint: t('costHint') },
      { key: 'mine', amount: mine, fill: 'bg-brand', label: t('mine'), hint: t('mineHint') },
    ] as const
  ).map((s) => ({ ...s, share: base > 0 ? s.amount / base : 0 }));

  const shownProfit = useCountUp(profit);
  const keptPct = revenue > 0 ? f.pct((mine / revenue) * 100, 1) : f.pct(0, 1);

  return (
    <section className={cn('card relative flex flex-col overflow-hidden p-5 sm:p-7', className)}>
      <div className="flex flex-wrap items-start justify-between gap-x-8 gap-y-5">
        <div className="min-w-0">
          <p className="eyebrow-lg">{loss ? t('loss') : t('profit')}</p>
          <p
            className={cn(
              'tnum mt-2 font-title text-[32px] font-semibold leading-none tracking-[-0.03em] sm:text-[44px]',
              loss ? 'text-danger-ink' : 'text-ink',
            )}
          >
            <Amount value={f.money(shownProfit, data.currency)} />
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2.5 text-sm text-muted">
            <Delta value={data.netProfit.deltaPct} />
            <span>{loss ? t('lost') : t('kept', { pct: keptPct })}</span>
          </div>
        </div>

        <div className="min-w-0 sm:text-right">
          <p className="eyebrow-lg">{t('revenue')}</p>
          <p className="tnum mt-2 font-display text-[22px] font-bold leading-none tracking-[-0.02em] text-ink sm:text-2xl">
            <Amount value={f.money(revenue, data.currency)} />
          </p>
          <div className="mt-3 flex sm:justify-end">
            <Delta value={data.revenue.deltaPct} />
          </div>
        </div>
      </div>

      {/* Lenta: segmentlar chapdan ketma-ket o'sadi (faqat transform — qotmaydi) */}
      {/* mt-auto: yonidagi ustun balandroq bo'lsa ham lenta pastki chetda turadi */}
      <div className="mt-7 sm:mt-auto sm:pt-8">
        <div
          role="img"
          aria-label={`${t('bar')}: ${segments.map((s) => `${s.label} ${f.pct(s.share * 100, 0)}`).join(', ')}`}
          className="flex h-3.5 w-full gap-1"
        >
          {segments
            .filter((s) => s.share > 0)
            .map((s, i) => (
              <div
                key={s.key}
                className={cn('h-full min-w-[6px] origin-left animate-grow-x rounded-full', s.fill)}
                style={{ flex: `${s.share} 1 0%`, animationDelay: `${120 + i * 140}ms` }}
              />
            ))}
          {base <= 0 ? <div className="h-full flex-1 rounded-full bg-surface-3" /> : null}
        </div>

        <ul className="mt-5 grid gap-x-6 gap-y-4 sm:grid-cols-3">
          {segments.map((s) => (
            <li key={s.key} className="min-w-0">
              <div className="flex items-center gap-2 text-[13px] font-medium text-ink-soft">
                <span className={cn('h-2 w-2 shrink-0 rounded-full', s.fill)} />
                <span className="truncate">{s.label}</span>
                <span className="tnum ml-auto text-muted sm:ml-0">{f.pct(s.share * 100, 0)}</span>
              </div>
              <p className="tnum mt-1.5 text-[17px] font-semibold leading-6 text-ink">
                <Amount value={f.money(s.amount, data.currency)} />
              </p>
              <p className="truncate text-xs text-muted">{s.hint}</p>
            </li>
          ))}
        </ul>
      </div>

      {footer ? <div className="mt-6 border-t border-line pt-4 text-xs text-muted">{footer}</div> : null}
    </section>
  );
}
