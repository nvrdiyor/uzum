/**
 * "Pul qayerga ketdi" — boshqaruv panelining bosh bloki.
 *
 * Sotuvchi har kuni bitta savolga javob izlaydi: shuncha sotdim, qo'limda
 * qancha qoldi? Tushum bitta lentada uchga bo'linadi:
 *
 *   Uzum oldi        = komissiya, mijozga yetkazish VA Uzum ushlagan davr
 *                      to'lovlari (omborga logistika, reklama, saqlash)
 *   Tannarx va soliq = tovar narxi, qo'shimcha xarajat, soliq (va sotuvchining
 *                      o'zi kiritgan xarajatlar)
 *   Sizga qoldi      = sof foyda — hamma xarajatdan keyin
 *
 * Uchala raqam serverdagi tayyor ko'rsatkichlarning ayirmasi — yangi hisob
 * yo'q, shuning uchun ular boshqa kartochkalar bilan doim mos keladi.
 * Rang ma'no bildiradi: binafsha — Uzum'niki, firuza — sizniki.
 *
 * Sahifaning YAGONA HeroCard'i: sof foyda — sotuvchi birinchi qaraydigan
 * raqam. Zarar davrida yorug'lik qizil bo'ladi (qizil faqat zarar uchun).
 */
import type { ReactNode } from 'react';
import type { DashboardResponse } from '@savdoiq/shared';
import { PiggyBank } from '@/components/icons';
import { Amount, Delta, HeroCard } from '@/components/ui';
import { useCountUp } from '@/hooks/useCountUp';
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
    uzumHint: 'komissiya, yetkazish, omborga logistika, reklama',
    cost: 'Tannarx va soliq',
    costHint: 'tovar narxi, qo‘shimcha xarajat, soliq',
    mine: 'Sizga qoldi',
    mineHint: 'sof foyda',
    bar: 'Tushum taqsimoti',
    payout: 'To‘lovga',
    payoutHint: 'Uzum hisobingizga o‘tkazadigan summa: tushum − komissiya va yetkazish',
    units: 'Sotilgan dona',
    buyout: 'Sotib olish foizi',
  },
  ru: {
    profit: 'Чистая прибыль',
    loss: 'Убыток',
    revenue: 'Выручка',
    kept: 'У вас осталось {pct} выручки',
    lost: 'За период расходы превысили выручку',
    uzum: 'Взял Uzum',
    uzumHint: 'комиссия, доставка, логистика на склад, реклама',
    cost: 'Себестоимость и налог',
    costHint: 'закупка, доп. расходы, налог',
    mine: 'Осталось вам',
    mineHint: 'чистая прибыль',
    bar: 'Распределение выручки',
    payout: 'К выплате',
    payoutHint: 'Сумма, которую Uzum переведёт на ваш счёт: выручка − комиссия и доставка',
    units: 'Продано, шт.',
    buyout: 'Процент выкупа',
  },
  en: {
    profit: 'Net profit',
    loss: 'Loss',
    revenue: 'Revenue',
    kept: 'You kept {pct} of revenue',
    lost: 'Costs exceeded revenue this period',
    uzum: 'Uzum took',
    uzumHint: 'commission, delivery, inbound logistics, ads',
    cost: 'Cost and tax',
    costHint: 'purchase, extra costs, tax',
    mine: 'You kept',
    mineHint: 'net profit',
    bar: 'Where revenue went',
    payout: 'Payout',
    payoutHint: 'What Uzum transfers to your account: revenue − commission and delivery',
    units: 'Units sold',
    buyout: 'Buyout rate',
  },
});

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
  money = true,
}: {
  data: DashboardResponse;
  /** Kartochka ostidagi qo'shimcha izoh (masalan, davr xarajatlaridan keyingi foyda) */
  footer?: ReactNode;
  className?: string;
  /**
   * false — pulsiz ko'rinish shabloni (Marketolog): server foyda va to'lovni
   * null qilib yuboradi, bosh raqam — tushum, taqsimot lentasi chizilmaydi.
   */
  money?: boolean;
}) {
  const t = useT('moneyFlow');
  const f = useFormat();

  const revenue = Math.max(0, data.revenue.value);
  const payout = Math.min(revenue, Math.max(0, data.payout.value ?? 0));
  const profit = data.netProfit.value ?? 0;
  const loss = profit < 0;

  /*
   * Davr xarajatlarining Uzum ushlagan qismi "Uzum oldi"ga qo'shiladi;
   * sotuvchining o'z xarajatlari (ish haqi, boshqa) tannarx tomonida qoladi.
   * Uch bo'lak yig'indisi doim tushumga teng.
   */
  const periodOnly = Math.max(0, data.expenses.periodOnly ?? 0);
  const ownExpenses = Math.min(periodOnly, Math.max(0, data.expenses.other ?? 0));
  const uzum = Math.min(revenue, revenue - payout + (periodOnly - ownExpenses));
  const mine = Math.max(0, profit);
  const cost = Math.max(0, revenue - uzum - mine);
  const base = uzum + cost + mine;

  const segments: Segment[] = (
    [
      { key: 'uzum', amount: uzum, fill: 'bg-violet', label: t('uzum'), hint: t('uzumHint') },
      { key: 'cost', amount: cost, fill: 'bg-[rgb(var(--c-slate))]', label: t('cost'), hint: t('costHint') },
      { key: 'mine', amount: mine, fill: 'bg-brand', label: t('mine'), hint: t('mineHint') },
    ] as const
  ).map((s) => ({ ...s, share: base > 0 ? s.amount / base : 0 }));

  const shownProfit = useCountUp(money ? profit : revenue);
  const keptPct = revenue > 0 ? f.pct((mine / revenue) * 100, 1) : f.pct(0, 1);

  if (!money) {
    return (
      <HeroCard tone="brand" className={cn('flex flex-col p-5 sm:p-7', className)} role="region" aria-label={t('revenue')}>
        <div className="flex items-center gap-2.5">
          <span className="icon-tile h-8 w-8 rounded-[10px] [&_svg]:h-4 [&_svg]:w-4" aria-hidden>
            <PiggyBank />
          </span>
          <p className="eyebrow-lg">{t('revenue')}</p>
        </div>
        <p className="tnum mt-3 font-title text-[32px] font-semibold leading-none tracking-[-0.03em] text-ink sm:text-[44px]">
          <Amount value={f.money(shownProfit, data.currency)} />
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2.5 text-sm text-muted">
          <Delta value={data.revenue.deltaPct} />
        </div>
        {/*
          Foyda lentasi o'rnida — pulsiz, lekin sotuv uchun asosiy ko'rsatkichlar.
          Qaytarish ulushi ATAYLAB yo'q: u "Qaytarish va bekor qilish" kartasida
          boshqa (yagona) ta'rif bilan turadi — ikki xil foiz chiqmasin.
        */}
        <ul className="mt-7 grid grid-cols-2 gap-3 sm:mt-auto sm:pt-8">
          {(
            [
              { key: 'units', label: t('units'), value: f.num(data.unitsSold.value) },
              { key: 'buyout', label: t('buyout'), value: f.pct(data.buyoutRate.value) },
            ] as const
          ).map((s) => (
            <li key={s.key} className="well min-w-0 p-3">
              <p className="truncate text-xs text-muted" title={s.label}>
                {s.label}
              </p>
              <p className="tnum mt-1 text-[17px] font-semibold leading-6 text-ink">{s.value}</p>
            </li>
          ))}
        </ul>
        {footer ? <div className="mt-6 border-t border-line pt-4 text-xs text-muted">{footer}</div> : null}
      </HeroCard>
    );
  }

  return (
    <HeroCard
      tone={loss ? 'danger' : 'brand'}
      className={cn('flex flex-col overflow-hidden p-5 sm:p-7', className)}
      role="region"
      aria-label={loss ? t('loss') : t('profit')}
    >
      <div className="flex flex-wrap items-start justify-between gap-x-8 gap-y-5">
        <div className="min-w-0">
          {/* Yonidagi KPI kartochkalari bilan bir xil: ohang plitkasi + nom */}
          <div className="flex items-center gap-2.5">
            <span className="icon-tile h-8 w-8 rounded-[10px] [&_svg]:h-4 [&_svg]:w-4" aria-hidden>
              <PiggyBank />
            </span>
            <p className="eyebrow-lg">{loss ? t('loss') : t('profit')}</p>
          </div>
          <p
            className={cn(
              'tnum mt-3 font-title text-[32px] font-semibold leading-none tracking-[-0.03em] sm:text-[44px]',
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

        {/* ml-auto: tor kartada keyingi qatorga tushsa ham o'ng chetda turadi — matni o'ngga tekislangan */}
        <div className="min-w-0 sm:ml-auto sm:text-right">
          <p className="eyebrow-lg sm:leading-8">{t('revenue')}</p>
          <p className="tnum mt-3 font-display text-[22px] font-bold leading-none tracking-[-0.02em] text-ink sm:text-2xl">
            <Amount value={f.money(revenue, data.currency)} />
          </p>
          <div className="mt-3 flex sm:justify-end">
            <Delta value={data.revenue.deltaPct} />
          </div>
          {/*
            Tushum → to'lovga → sof foyda: pul hikoyasining o'rta bo'g'ini.
            Ilgari `data.payout` kelardi-yu, hech qayerda ko'rsatilmasdi.
          */}
          <p className="mt-3 text-[13px] text-muted" title={t('payoutHint')}>
            {t('payout')}:{' '}
            <span className="tnum whitespace-nowrap font-semibold text-ink-soft">
              <Amount value={f.money(data.payout.value, data.currency)} />
            </span>
          </p>
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
              {/*
                Uch ustunda ulush summa yonida: nom yonida turganda ruschada
                "Себестоимость и налог" sig'masdan kesilardi. Telefonda (bir
                ustun) ulush nom qatorining o'ng chetida.
              */}
              <div className="flex items-center gap-2 text-[13px] font-medium text-ink-soft">
                <span className={cn('h-2 w-2 shrink-0 rounded-full', s.fill)} />
                <span className="truncate" title={s.label}>
                  {s.label}
                </span>
                <span className="tnum ml-auto shrink-0 text-muted sm:hidden">{f.pct(s.share * 100, 0)}</span>
              </div>
              <p className="tnum mt-1.5 flex flex-wrap items-baseline gap-x-2 text-[17px] font-semibold leading-6 text-ink">
                <Amount value={f.money(s.amount, data.currency)} />
                <span className="hidden text-xs font-medium text-muted sm:inline">{f.pct(s.share * 100, 0)}</span>
              </p>
              <p className="line-clamp-2 text-xs text-muted">{s.hint}</p>
            </li>
          ))}
        </ul>
      </div>

      {footer ? <div className="mt-6 border-t border-line pt-4 text-xs text-muted">{footer}</div> : null}
    </HeroCard>
  );
}
