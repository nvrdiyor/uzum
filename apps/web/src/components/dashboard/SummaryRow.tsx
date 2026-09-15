import { Banknote, Boxes, Gauge } from 'lucide-react';
import type { DashboardResponse } from '@savdoiq/shared';
import { Card, CardBody, CardHeader, Delta, ProgressBar, ProgressRing } from '@/components/ui';
import { useFormat, useT } from '@/i18n';
import { clamp } from '@/lib/utils';

/** "To'lovlar" — kecha to'langan va bugun kutilayotgan summa */
export function PayoutsCard({ data }: { data: DashboardResponse }) {
  const t = useT('dashboard');
  const f = useFormat();

  const rows = [
    {
      key: 'yesterday',
      label: t('payouts.yesterday'),
      amount: data.paidYesterday,
      orders: data.paidOrdersYesterday,
      accent: 'text-brand',
      bar: 'brand' as const,
    },
    {
      key: 'today',
      label: t('payouts.today'),
      amount: data.expectedToday,
      orders: data.expectedOrdersToday,
      accent: 'text-info',
      bar: 'info' as const,
    },
  ];
  const max = Math.max(data.paidYesterday, data.expectedToday, 1);

  return (
    <Card className="flex flex-col">
      <CardHeader
        icon={<Banknote className="h-4 w-4" />}
        title={t('payouts.title')}
        subtitle={t('payouts.subtitle')}
      />
      <CardBody className="flex-1 space-y-4 pt-4">
        {/*
          Uzum kabinetidagi "Umumiy balans" bilan AYNAN bir xil raqam.
          Sotuvchi pulini shu qator bo'yicha solishtiradi — foyda
          ko'rsatkichlari bilan emas (ular tannarxni ham ayiradi).
        */}
        <div className="rounded-2xl border border-brand/25 bg-brand/[0.08] p-3.5">
          <div className="flex items-end justify-between gap-3">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted">
              {t('payouts.balance')}
            </span>
          </div>
          <p className="tnum mt-1 font-display text-2xl font-extrabold tracking-tight text-brand">
            {f.money(data.uzumBalance, data.currency)}
          </p>
          <p className="mt-1 text-xs text-muted">{t('payouts.balanceHint')}</p>
        </div>

        {rows.map((r) => (
          <div key={r.key}>
            <div className="flex items-end justify-between gap-3">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted">{r.label}</span>
              <span className="tnum text-xs text-muted">{t('payouts.orders', { n: f.num(r.orders) })}</span>
            </div>
            <p className={`tnum mt-1 font-display text-xl font-extrabold tracking-tight ${r.accent}`}>
              {f.money(r.amount, data.currency)}
            </p>
            <ProgressBar className="mt-2" tone={r.bar} value={(r.amount / max) * 100} />
          </div>
        ))}
        <p className="border-t border-line pt-3 text-xs text-muted">{t('payouts.hint')}</p>
      </CardBody>
    </Card>
  );
}

/** "Marja va ROI" — ikkita halqa ko'rsatkich */
export function MarginRoiCard({ data }: { data: DashboardResponse }) {
  const t = useT('dashboard');
  const f = useFormat();

  const gauges = [
    { key: 'margin', label: t('margin.margin'), value: data.margin.value, delta: data.margin.deltaPct },
    { key: 'roi', label: t('margin.roi'), value: data.roi.value, delta: data.roi.deltaPct },
  ];

  return (
    <Card className="flex flex-col">
      <CardHeader icon={<Gauge className="h-4 w-4" />} title={t('margin.title')} subtitle={t('margin.subtitle')} />
      <CardBody className="flex-1 pt-4">
        <div className="grid grid-cols-2 gap-3">
          {gauges.map((g) => (
            <div key={g.key} className="flex flex-col items-center gap-2 rounded-2xl bg-surface-2 py-4">
              <ProgressRing value={clamp(g.value, 0, 100)} size={100} stroke={9}>
                <span className="tnum font-display text-lg font-extrabold text-ink">{f.pct(g.value)}</span>
                <span className="mt-0.5 text-2xs uppercase tracking-wider text-muted">{g.label}</span>
              </ProgressRing>
              <Delta value={g.delta} />
            </div>
          ))}
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 border-t border-line pt-3 text-xs">
          <div>
            <p className="text-muted">{t('margin.buyout')}</p>
            <p className="tnum mt-0.5 font-semibold text-ink">{f.pct(data.buyoutRate.value)}</p>
          </div>
          <div>
            <p className="text-muted">{t('margin.returns')}</p>
            <p className="tnum mt-0.5 font-semibold text-ink">{f.pct(data.returnsRate.value)}</p>
          </div>
        </div>
      </CardBody>
    </Card>
  );
}

/** "Qoldiq qiymati" — dona, summa va FBO/FBS ajratmasi */
export function StockValueCard({ data }: { data: DashboardResponse }) {
  const t = useT('dashboard');
  const f = useFormat();

  const { units, amount, fbo, fbs } = data.stockValue;
  const total = fbo + fbs;
  const fboPct = total > 0 ? (fbo / total) * 100 : 0;

  return (
    <Card className="flex flex-col">
      <CardHeader icon={<Boxes className="h-4 w-4" />} title={t('stock.title')} subtitle={t('stock.subtitle')} />
      <CardBody className="flex-1 pt-4">
        <p className="tnum font-display text-2xl font-extrabold tracking-tight text-ink">
          {f.money(amount, data.currency)}
        </p>
        <p className="mt-1 text-xs text-muted">{t('stock.units', { n: f.num(units) })}</p>

        <div className="mt-4 h-2.5 w-full overflow-hidden rounded-full bg-surface-3">
          <div className="flex h-full w-full">
            <div className="h-full bg-brand transition-[width] duration-700 ease-spring" style={{ width: `${fboPct}%` }} />
            <div className="h-full bg-violet transition-[width] duration-700 ease-spring" style={{ width: `${100 - fboPct}%` }} />
          </div>
        </div>

        <div className="mt-3 space-y-2.5">
          {/* fbo/fbs — DONA miqdori (summa emas) */}
          <SplitRow color="bg-brand" label={t('stock.fbo')} value={t('stock.units', { n: f.num(fbo) })} />
          <SplitRow color="bg-violet" label={t('stock.fbs')} value={t('stock.units', { n: f.num(fbs) })} />
        </div>

        <p className="mt-4 border-t border-line pt-3 text-xs text-muted">{t('stock.hint')}</p>
      </CardBody>
    </Card>
  );
}

function SplitRow({ color, label, value }: { color: string; label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className="flex items-center gap-2 text-muted">
        <span className={`h-2.5 w-2.5 rounded-full ${color}`} />
        {label}
      </span>
      <span className="tnum font-semibold text-ink">{value}</span>
    </div>
  );
}
