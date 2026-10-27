import { Boxes, Gauge, Wallet } from '@/components/icons';
import type { DashboardResponse } from '@savdoiq/shared';
import { Amount, Card, CardBody, CardHeader, Delta, ProgressBar, ProgressRing, type Tone } from '@/components/ui';
import { useFormat, useT } from '@/i18n';
import { clamp, cn } from '@/lib/utils';
import { useSeesMoney } from '@/lib/view';
import { buyoutTone, marginTone, ppDelta, rateBases, roiTone } from './rates';

const DOT: Record<Tone, string> = {
  brand: 'bg-brand',
  info: 'bg-info',
  warn: 'bg-warn',
  danger: 'bg-danger',
  violet: 'bg-violet',
  muted: 'bg-muted',
};

const INK: Record<Tone, string> = {
  brand: 'text-brand-ink',
  info: 'text-info-ink',
  warn: 'text-warn-ink',
  danger: 'text-danger-ink',
  violet: 'text-violet-ink',
  muted: 'text-ink',
};

/**
 * "To'lovlar" — Uzum'dan keladigan pul.
 *
 * Rang ma'nosi: kecha to'langani — sizniki (brend), bugun kutilayotgani —
 * hali kelmagan pul (sariq). Ilgari "kutilmoqda" ko'k edi va qoldiq/logistika
 * bilan bir xil o'qilardi.
 */
export function PayoutsCard({ data }: { data: DashboardResponse }) {
  const t = useT('dashboard');
  const f = useFormat();

  const rows = [
    {
      key: 'yesterday',
      label: t('payouts.yesterday'),
      amount: data.paidYesterday,
      orders: data.paidOrdersYesterday,
      tone: 'brand' as const,
    },
    {
      key: 'today',
      label: t('payouts.today'),
      amount: data.expectedToday,
      orders: data.expectedOrdersToday,
      tone: 'warn' as const,
    },
  ];
  const max = Math.max(data.paidYesterday, data.expectedToday, 1);

  return (
    <Card tone="brand" className="flex flex-col">
      <CardHeader icon={<Wallet />} title={t('payouts.title')} subtitle={t('payouts.subtitle')} />
      <CardBody className="flex flex-1 flex-col gap-3">
        {/*
          Uzum kabinetidagi "Umumiy balans" bilan AYNAN bir xil raqam.
          Sotuvchi pulini shu qator bo'yicha solishtiradi — foyda
          ko'rsatkichlari bilan emas (ular tannarxni ham ayiradi).
        */}
        <div className="well p-3.5">
          <p className="eyebrow">{t('payouts.balance')}</p>
          <p className="tnum mt-1.5 font-display text-2xl font-bold leading-none tracking-[-0.02em] text-ink">
            <Amount value={f.money(data.uzumBalance, data.currency)} />
          </p>
          <p className="mt-2 text-xs leading-snug text-muted">{t('payouts.balanceHint')}</p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {rows.map((r) => (
            <div key={r.key} className="well flex min-w-0 flex-col p-3">
              {/* Nom kesilmaydi, kerak bo'lsa ikki qatorga o'tadi ("Ожидается сегодня" tor plitkaga sig'masdi) */}
              <p className="flex min-w-0 items-start gap-1.5 text-xs font-medium leading-4 text-ink-soft">
                <span className={cn('mt-1 h-2 w-2 shrink-0 rounded-full', DOT[r.tone])} />
                <span className="min-w-0">{r.label}</span>
              </p>
              <p className={cn('tnum mt-1.5 font-display text-[17px] font-bold leading-6 tracking-[-0.02em]', INK[r.tone])}>
                <Amount value={f.money(r.amount, data.currency)} />
              </p>
              <p className="tnum text-2xs text-muted">{t('payouts.orders', { n: f.num(r.orders) })}</p>
              <ProgressBar className="mt-auto pt-2.5" tone={r.tone} value={(r.amount / max) * 100} />
            </div>
          ))}
        </div>

        <p className="mt-auto border-t border-line pt-3 text-xs leading-snug text-muted">{t('payouts.hint')}</p>
      </CardBody>
    </Card>
  );
}

/**
 * "Marja va ROI" — ikki halqa va sotib olish darajasi plitkasi.
 *
 * Halqa rangi qiymatdan (rates.ts): 0,8% marja endi "yashil to'liq emas
 * halqa" emas, aniq sariq ogohlantirish. O'zgarish — foiz PUNKTIDA.
 * Kartochka chizig'i marja holatini takrorlaydi: qator ko'zdan
 * kechirilganda muammo shu yerdaligi darhol ko'rinadi.
 *
 * Qaytarish ulushi plitkasi bu yerdan ATAYLAB olib tashlandi (2026-10-24):
 * u endi "Qaytarish va bekor qilish" kartasida (ReturnsCard) yagona ta'rif
 * bilan. Ikkalasi bir panelda tursa, bir davr uchun ikki xil foiz chiqadi
 * (demo, joriy oy: 7,4% va 7,8%). Yolg'iz qolgan sotib olish plitkasi butun
 * qatorni oladi — 2 ustunli to'rda uning yonida yarim qator bo'sh turardi.
 */
export function MarginRoiCard({ data }: { data: DashboardResponse }) {
  const t = useT('dashboard');
  const tc = useT('common');
  const f = useFormat();
  const base = rateBases(data);

  const gauges = [
    {
      key: 'margin',
      label: t('margin.margin'),
      value: data.margin.value,
      tone: marginTone(data.margin.value),
      delta: ppDelta(data.margin, base.margin),
      prev: base.margin ? data.margin.previous : null,
    },
    {
      key: 'roi',
      label: t('margin.roi'),
      value: data.roi.value,
      tone: roiTone(data.roi.value),
      delta: ppDelta(data.roi, base.roi),
      prev: base.roi ? data.roi.previous : null,
    },
  ];

  const buyout = {
    value: data.buyoutRate.value,
    tone: buyoutTone(data.buyoutRate.value),
    delta: ppDelta(data.buyoutRate, base.buyout),
  };

  return (
    <Card tone={gauges[0]?.tone ?? 'brand'} className="flex flex-col">
      <CardHeader icon={<Gauge />} title={t('margin.title')} subtitle={t('margin.subtitle')} />
      <CardBody className="flex flex-1 flex-col gap-3">
        <div className="grid grid-cols-2 gap-3">
          {gauges.map((g) => (
            <div key={g.key} className="well flex min-w-0 flex-col items-center px-2 pb-3 pt-3.5 text-center">
              <ProgressRing value={clamp(g.value, 0, 100)} size={92} stroke={8} tone={g.tone}>
                <span className={cn('tnum font-display text-base font-bold leading-tight', INK[g.tone])}>
                  {f.pct(g.value)}
                </span>
                <span className="eyebrow mt-0.5">{g.label}</span>
              </ProgressRing>
              <div className="mt-2.5 flex flex-col items-center gap-1">
                <Delta value={g.delta} unit="pp" />
                {g.prev !== null ? (
                  <span className="tnum text-2xs text-muted">{tc('common.prevValue', { v: f.pct(g.prev) })}</span>
                ) : null}
              </div>
            </div>
          ))}
        </div>

        <div className="well flex min-w-0 flex-col p-3">
          <p className="text-xs leading-4 text-muted">{t('margin.buyout')}</p>
          <div className="mt-1 flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
            <span className="tnum font-display text-[17px] font-bold leading-6 text-ink">{f.pct(buyout.value)}</span>
            <Delta value={buyout.delta} unit="pp" className="px-2 py-0.5 text-2xs" />
          </div>
          <ProgressBar className="mt-auto pt-2" tone={buyout.tone} value={buyout.value} />
        </div>
      </CardBody>
    </Card>
  );
}

/**
 * "Qoldiq qiymati" — tannarx bo'yicha muzlagan kapital va FBO/FBS bo'linishi.
 * Binafsha — Uzum ombori (Uzum'niki), firuza — o'z omboringiz.
 */
export function StockValueCard({ data, className }: { data: DashboardResponse; className?: string }) {
  const t = useT('dashboard');
  const f = useFormat();
  const tc = useT('common');
  // Pulsiz ko'rinish shablonida tannarx qiymati null — bosh raqam dona bo'ladi
  const money = useSeesMoney();

  const { units, amount, fbo, fbs } = data.stockValue;
  const total = fbo + fbs;
  const fboPct = total > 0 ? (fbo / total) * 100 : 0;

  const split = [
    { key: 'fbo', name: 'FBO', where: t('stock.fbo'), units: fbo, pct: fboPct, dot: 'bg-violet' },
    { key: 'fbs', name: 'FBS', where: t('stock.fbs'), units: fbs, pct: total > 0 ? 100 - fboPct : 0, dot: 'bg-brand' },
  ];

  return (
    <Card tone="info" className={cn('flex flex-col', className)}>
      <CardHeader icon={<Boxes />} title={money ? t('stock.title') : tc('common.stock')} subtitle={t('stock.subtitle')} />
      <CardBody className="flex flex-1 flex-col">
        {money ? (
          <>
            <p className="tnum font-display text-2xl font-bold leading-none tracking-[-0.02em] text-ink">
              <Amount value={f.money(amount, data.currency)} />
            </p>
            <p className="mt-2 text-xs text-muted">{t('stock.units', { n: f.num(units) })}</p>
          </>
        ) : (
          <p className="tnum font-display text-2xl font-bold leading-none tracking-[-0.02em] text-ink">
            {f.num(units)} <span className="font-sans text-sm font-medium text-muted">{t('stock.pcs')}</span>
          </p>
        )}

        {/*
          mt-auto: qo'shni kartochkalar balandroq bo'lsa, bo'sh joy katta raqam
          ostida qoladi, tafsilot esa pastki chetda (pul oqimi lentasi kabi) —
          ilgari izoh ustida 70px bo'shliq "uzilib qolgan"dek turardi.
        */}
        <div className="mt-auto pt-5">
          {/* Qoldiq 0 bo'lganda rangli bo'lak umuman chizilmaydi — ilgari bo'sh
              ombor to'laligicha binafsha ko'rinib, to'la deb tushunilardi */}
          <div className="flex h-2.5 w-full gap-1" aria-hidden>
            {total > 0 ? (
              split
                .filter((s) => s.units > 0)
                .map((s) => (
                  <div
                    key={s.key}
                    className={cn('h-full min-w-[6px] rounded-full transition-[flex-grow] duration-700 ease-spring', s.dot)}
                    style={{ flex: `${s.pct} 1 0%` }}
                  />
                ))
            ) : (
              <div className="h-full flex-1 rounded-full bg-surface-3" />
            )}
          </div>

          {/* fbo/fbs — DONA miqdori (summa emas) */}
          <div className="mt-3 grid grid-cols-2 gap-3">
            {split.map((s) => (
              <div key={s.key} className="well min-w-0 p-3">
                <p className="flex items-center gap-1.5 text-xs font-semibold text-ink-soft">
                  <span className={cn('h-2 w-2 shrink-0 rounded-full', s.dot)} />
                  {s.name}
                  <span className="tnum ml-auto font-medium text-muted">{f.pct(s.pct, 0)}</span>
                </p>
                <p className="tnum mt-1.5 font-display text-[17px] font-bold leading-6 text-ink">
                  {f.num(s.units)} <span className="font-sans text-xs font-medium text-muted">{t('stock.pcs')}</span>
                </p>
                <p className="truncate text-2xs text-muted" title={s.where}>
                  {s.where}
                </p>
              </div>
            ))}
          </div>

          {money ? <p className="mt-4 border-t border-line pt-3 text-xs leading-snug text-muted">{t('stock.hint')}</p> : null}
        </div>
      </CardBody>
    </Card>
  );
}
