import { useMemo, useState } from 'react';
import type { FunnelReason, FunnelResponse } from '@savdoiq/shared';
import { MessageSquare } from '@/components/icons';
import { Amount, Card, CardBody, CardHeader, Segmented } from '@/components/ui';
import { useFormat, useT } from '@/i18n';
import { useReturnReasonLabel } from '@/lib/returnReasons';
import { cn } from '@/lib/utils';
import { FUNNEL_LOSS_NS } from './i18n';
import { tokenColor } from './LossFunnel';

type Kind = 'returned' | 'canceled';

/** Shuncha haqiqiy sabab alohida qatorda; qolgani "Boshqa sabablar" ga yig'iladi */
const TOP = 5;

interface ReasonRow {
  key: string;
  label: string;
  /** Asl matn — izohda (Uzum ko'pincha ruscha beradi) */
  raw: string | null;
  units: number;
  amount: number;
  share: number;
  /** Sababsiz yoki yig'ma qator — xira rangda */
  muted: boolean;
}

/**
 * "Yo'qotish sabablari" — bekor qilingan va qaytgan donalar sabab bo'yicha,
 * DONA va SO'MDA. Panel kartasidagi "asosiy sabab" faqat donani ko'rsatardi:
 * arzon tovar ko'p qaytsa, eng qimmat yo'qotish ikkinchi o'rinda yashirinib
 * qolardi. Tartib — summa bo'yicha (server: funnel.ts reasonList).
 *
 * Sabab matni "Qaytarishlar" sahifasi va panel kartasi bilan bitta
 * tarjimadan (lib/returnReasons.ts). Sababsizlari ("Клиент не указал
 * причину" ham) bitta qatorda va oxirida, lekin ulushga kiradi — yig'indi
 * 100%, kichik sabab yo'qotishning asosiy qismidek ko'rinmaydi.
 */
export function LossReasonsCard({ data, className }: { data: FunnelResponse; className?: string }) {
  const t = useT(FUNNEL_LOSS_NS);
  const f = useFormat();
  const reasonLabel = useReturnReasonLabel();
  const { totals, reasons } = data;

  // Foydalanuvchi tanlamaguncha — ko'proq pul ketgan tur (davr almashsa ham shu qoida)
  const [picked, setPicked] = useState<Kind | null>(null);
  const kind: Kind = picked ?? (totals.canceledAmount > totals.returnedAmount ? 'canceled' : 'returned');
  const list = reasons[kind];

  const rows = useMemo<ReasonRow[]>(() => {
    const real = list.filter((r) => r.raw !== null);
    const none = list.find((r) => r.raw === null);
    // Bitta ortiqcha sababni "Boshqa (1 ta)" ga yig'ishdan ma'no yo'q — o'zi ko'rsatiladi
    const head = real.length > TOP + 1 ? real.slice(0, TOP) : real;
    const rest = real.length > TOP + 1 ? real.slice(TOP) : [];
    const toRow = (r: FunnelReason): ReasonRow => ({
      key: r.raw ?? '∅',
      label: reasonLabel(r.raw),
      raw: r.raw,
      units: r.units,
      amount: r.amount,
      share: r.share,
      muted: r.raw === null,
    });
    const out = head.map(toRow);
    if (rest.length > 0) {
      out.push({
        key: '__other',
        label: t('reasons.other', { n: rest.length }),
        raw: null,
        units: rest.reduce((s, r) => s + r.units, 0),
        amount: rest.reduce((s, r) => s + r.amount, 0),
        share: rest.reduce((s, r) => s + r.share, 0),
        muted: true,
      });
    }
    if (none) out.push(toRow(none));
    return out;
  }, [list, reasonLabel, t]);

  const barColor = kind === 'returned' ? tokenColor('danger') : tokenColor('warn');

  return (
    <Card className={cn('flex flex-col', className)}>
      <CardHeader
        icon={<MessageSquare />}
        title={t('reasons.title')}
        subtitle={t('reasons.subtitle')}
        actions={
          <Segmented
            size="sm"
            value={kind}
            onChange={setPicked}
            options={[
              { value: 'returned', label: t('reasons.returned'), count: totals.returned },
              { value: 'canceled', label: t('reasons.canceled'), count: totals.canceled },
            ]}
          />
        }
      />
      <CardBody className="flex flex-1 flex-col gap-4">
        {rows.length === 0 ? (
          <div className="well px-3.5 py-3">
            <p className="text-sm text-muted">{t(`reasons.empty.${kind}`)}</p>
          </div>
        ) : (
          <ul className="space-y-3.5">
            {rows.map((r) => (
              <li key={r.key}>
                <div className="flex items-start justify-between gap-3">
                  {/* Sabab kesilmaydi, kerak bo'lsa ikki qatorga o'tadi; asl matn izohda */}
                  <span
                    className={cn(
                      'min-w-0 line-clamp-2 break-words text-sm leading-5',
                      r.muted ? 'text-muted' : 'font-medium text-ink',
                    )}
                    title={r.raw ?? undefined}
                  >
                    {r.label}
                  </span>
                  <Amount
                    value={f.money(r.amount, data.currency)}
                    nowrap
                    className="tnum shrink-0 text-sm font-semibold leading-5 text-ink"
                  />
                </div>
                <div className="mt-1.5 flex items-center gap-3">
                  <span aria-hidden className="block h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-surface-3">
                    <span
                      className="block h-full rounded-full"
                      style={{
                        width: `${Math.min(100, Math.max(0, r.share))}%`,
                        background: r.muted ? tokenColor('slate', 0.7) : barColor,
                      }}
                    />
                  </span>
                  <span className="tnum shrink-0 text-2xs text-muted" title={t(`reasons.shareHint.${kind}`)}>
                    {t('units', { n: f.num(r.units) })} · {f.pct(r.share)}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
        {list.some((r) => r.raw === null) ? (
          <p className="mt-auto text-2xs leading-4 text-muted">{t('reasons.note')}</p>
        ) : null}
      </CardBody>
    </Card>
  );
}
