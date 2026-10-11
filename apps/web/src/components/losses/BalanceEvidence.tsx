import type { BalanceOrderRef } from '@savdoiq/shared';
import { useFormat, useT } from '@/i18n';
import { cn } from '@/lib/utils';
import './texts';

export interface BalanceEvidenceData {
  accepted: number;
  sold: number;
  returnedToSeller: number;
  onHand: number;
  held: number;
  inReturn: number;
  unaccounted: number;
  waitingUntil?: string | null;
  suspects: BalanceOrderRef[];
  removals: { date: string; qty: number }[];
}

/**
 * Bitta SKU balansining dalili: raqam qanday chiqqani (tenglama), qoldiq
 * buyurtmasiz kamaygan kunlar va omborga qaytmagan buyurtmalar. Sotuvchi
 * har bir hadni Uzum kabinetida tekshira oladi — shuning uchun hammasi ochiq.
 */
export function BalanceEvidence({ data }: { data: BalanceEvidenceData }) {
  const t = useT('losses');
  const f = useFormat();
  const diff = data.inReturn + data.unaccounted;

  return (
    <div className="space-y-5">
      <div>
        <p className="eyebrow mb-2">{t('ev.equation')}</p>
        <dl className="rounded-xl border border-line bg-surface-2/60 px-4 py-1.5">
          <Line label={t('bal.accepted')} value={f.num(data.accepted)} />
          <Line op="−" label={t('bal.sold')} value={f.num(data.sold)} />
          {data.returnedToSeller > 0 ? (
            <Line op="−" label={t('bal.returned')} value={f.num(data.returnedToSeller)} />
          ) : null}
          <Line op="−" label={t('bal.onHand')} value={f.num(data.onHand)} />
          {data.held > 0 ? <Line op="−" label={t('bal.held')} value={f.num(data.held)} /> : null}
          {/* Oraliq "farq" faqat undan qaytish yo'lidagilar ayirilganda kerak */}
          {data.inReturn > 0 ? (
            <>
              <Line op="=" label={t('ev.equals')} value={f.num(diff)} rule />
              <Line op="−" label={t('bal.inReturn')} value={f.num(data.inReturn)} className="text-warn-ink" />
            </>
          ) : null}
          <Line
            op="="
            label={t('bal.unaccounted')}
            value={f.num(data.unaccounted)}
            className={data.unaccounted > 0 ? 'font-semibold text-danger-ink' : 'font-semibold text-ink'}
            rule
          />
        </dl>
        {data.inReturn > 0 && data.waitingUntil ? (
          <p className="mt-2 text-xs text-muted">
            {t('ev.waiting', { n: f.num(data.inReturn), date: f.date(data.waitingUntil) })}
          </p>
        ) : null}
      </div>

      {data.removals.length ? (
        <div>
          <p className="eyebrow mb-2">{t('ev.removals')}</p>
          <ul className="space-y-1.5 text-sm text-ink-soft">
            {data.removals.map((r) => (
              <li key={r.date} className="tnum">
                {t('ev.removal', { date: f.date(r.date), n: f.num(r.qty) })}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {data.suspects.length ? (
        <div>
          <p className="eyebrow mb-2">{t('ev.suspects')}</p>
          <ul className="divide-y divide-line/70 rounded-xl border border-line">
            {data.suspects.map((s) => (
              <li key={s.orderId} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 px-4 py-2.5 text-sm">
                <span className="tnum font-medium text-ink">№{s.orderId}</span>
                <span className="tnum text-muted">{f.date(s.date)}</span>
                <span className="text-muted">{t(`ev.${s.kind}`)}</span>
                {s.cause ? <span className="w-full text-xs text-muted sm:w-auto">«{s.cause}»</span> : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function Line({
  op,
  label,
  value,
  rule,
  className,
}: {
  op?: string;
  label: string;
  value: string;
  /** Ustidan chiziq — yig'indi satri */
  rule?: boolean;
  className?: string;
}) {
  return (
    <div className={cn('flex items-baseline gap-3 py-2 text-sm', rule && 'border-t border-line', className)}>
      <span aria-hidden className="w-3 shrink-0 text-center text-muted">
        {op ?? ''}
      </span>
      <dt className={cn('min-w-0 flex-1 truncate', className ? '' : 'text-ink-soft')}>{label}</dt>
      <dd className="tnum shrink-0">{value}</dd>
    </div>
  );
}
