import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { LossRow } from '@savdoiq/shared';
import { api, ApiError } from '@/lib/api';
import { useFormat, useT } from '@/i18n';
import { useSession } from '@/store/session';
import { Badge, Button, Input, Modal, toast, type Tone } from '@/components/ui';
import { BalanceEvidence, CompensationBreakdown } from './BalanceEvidence';
import './texts';

export const LOSS_STATUS_TONE: Record<LossRow['status'], Tone> = {
  open: 'warn',
  claimed: 'info',
  compensated: 'brand',
  rejected: 'danger',
};

export const LOSS_KIND_TONE: Record<NonNullable<LossRow['kind']>, Tone> = {
  balance: 'danger',
  counter: 'danger',
  defect: 'warn',
  shortage: 'info',
};

/**
 * Yo'qotish yozuvi: raqam qayerdan chiqqani va da'vo holati.
 *
 * Uzum da'voga javobni API orqali bermaydi — natijani sotuvchi o'zi belgilaydi
 * (da'vo yuborildi → kompensatsiya olindi yoki rad etildi).
 */
export function LossDetailModal({ row: active, onClose }: { row: LossRow | null; onClose: () => void }) {
  const t = useT('losses');
  // Yopilish animatsiyasi paytida ichi bo'shab qolmasin — oxirgi yozuv ushlab turiladi
  const [last, setLast] = useState<LossRow | null>(null);
  useEffect(() => {
    if (active) setLast(active);
  }, [active]);
  const row = active ?? last;
  const f = useFormat();
  const qc = useQueryClient();
  const canEdit = useSession((st) => st.me?.company?.role !== 'viewer');
  const [amount, setAmount] = useState('');

  useEffect(() => {
    if (row) setAmount(String(row.compensated > 0 ? row.compensated : row.amount));
  }, [row]);

  const save = useMutation({
    mutationFn: (body: { status: LossRow['status']; compensated?: number }) =>
      api.patch<LossRow>(`/warehouse/losses/${row?.id ?? ''}`, body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['warehouse-losses'] });
      toast.success(t('act.saved'));
      onClose();
    },
    onError: (err) => toast.error(t('act.failed'), err instanceof ApiError ? err.message : undefined),
  });

  const e = row?.evidence;
  const paid = Number(amount.replace(/[^\d.]/g, ''));

  return (
    <Modal
      open={active !== null}
      onClose={onClose}
      size="md"
      title={row?.title ?? row?.sku ?? '—'}
      description={row?.title ? row.sku : undefined}
      footer={
        row && canEdit ? (
          <div className="space-y-3">
            {row.status === 'claimed' ? (
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-muted">{t('act.amount')}</span>
                <Input inputMode="numeric" value={amount} onChange={(ev) => setAmount(ev.target.value)} className="tnum" />
              </label>
            ) : null}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="min-w-0 flex-1 text-xs text-muted">
                {row.status === 'open' ? t('act.hint.open') : row.status === 'claimed' ? t('act.hint.claimed') : ''}
              </p>
              <div className="flex flex-wrap items-center gap-2">
                {row.status === 'open' ? (
                  <Button loading={save.isPending} onClick={() => save.mutate({ status: 'claimed' })}>
                    {t('act.claim')}
                  </Button>
                ) : row.status === 'claimed' ? (
                  <>
                    <Button variant="outline" disabled={save.isPending} onClick={() => save.mutate({ status: 'rejected' })}>
                      {t('act.rejected')}
                    </Button>
                    <Button
                      loading={save.isPending}
                      disabled={!(paid > 0)}
                      onClick={() => save.mutate({ status: 'compensated', compensated: paid })}
                    >
                      {t('act.compensated')}
                    </Button>
                  </>
                ) : (
                  <Button variant="outline" loading={save.isPending} onClick={() => save.mutate({ status: 'open' })}>
                    {t('act.reopen')}
                  </Button>
                )}
              </div>
            </div>
          </div>
        ) : undefined
      }
    >
      {row ? (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={row.kind ? LOSS_KIND_TONE[row.kind] : 'muted'}>
              {row.kind ? t(`kind.${row.kind}`) : t(`type.${row.type}`)}
            </Badge>
            <Badge tone={LOSS_STATUS_TONE[row.status]} dot>
              {t(`status.${row.status}`)}
            </Badge>
          </div>

          <dl className="grid grid-cols-3 gap-3">
            <Fact label={t('det.qty')} value={f.num(row.qty)} />
            <Fact label={t('det.amount')} value={f.money(row.amount)} />
            <Fact label={t('det.since')} value={f.date(row.happenedAt)} />
          </dl>

          {row.kind === 'balance' && e ? (
            <BalanceEvidence
              data={{
                accepted: e.accepted ?? 0,
                sold: e.sold ?? 0,
                returnedToSeller: e.returnedToSeller ?? 0,
                onHand: e.onHand ?? 0,
                held: e.held ?? 0,
                inReturn: e.inReturn ?? 0,
                unaccounted: Math.max(
                  0,
                  (e.accepted ?? 0) - (e.sold ?? 0) - (e.returnedToSeller ?? 0) - (e.onHand ?? 0) - (e.held ?? 0) - (e.inReturn ?? 0),
                ),
                suspects: e.suspects ?? [],
                removals: e.removals ?? [],
              }}
            />
          ) : row.kind === 'shortage' && e ? (
            <p className="text-sm text-ink-soft">
              {t('ev.shortage', { invoice: e.invoice ?? '—', sent: f.num(e.sent ?? 0), accepted: f.num(e.accepted ?? 0) })}
            </p>
          ) : row.kind === 'counter' || row.kind === 'defect' ? (
            <p className="text-sm text-ink-soft">{t(`ev.${row.kind}`)}</p>
          ) : null}

          {e?.comp ? <CompensationBreakdown comp={e.comp} qty={row.qty} cost={e.cost} /> : null}

          {row.compensated > 0 ? (
            <p className="text-sm text-ink-soft">
              {t('col.compensated')}: <span className="tnum font-semibold text-brand-ink">{f.money(row.compensated)}</span>
            </p>
          ) : null}
        </div>
      ) : null}
    </Modal>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="eyebrow truncate">{label}</dt>
      <dd className="tnum mt-1 truncate font-display text-base font-bold text-ink">{value}</dd>
    </div>
  );
}
