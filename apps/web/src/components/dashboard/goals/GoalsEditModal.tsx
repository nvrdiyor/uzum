import { useEffect, useId, useState } from 'react';
import type { GoalTargets, GoalsResponse, GoalsUpdateRequest } from '@savdoiq/shared';
import { RotateCcw, Wand2 } from '@/components/icons';
import { Button, Modal, toast } from '@/components/ui';
import { NumberField } from '@/components/unit/NumberField';
import { useFormat, useT } from '@/i18n';
import { ApiError } from '@/lib/api';
import { GOALS_NS } from './i18n';
import { useSaveGoals } from './useGoals';

type GoalKey = keyof GoalTargets;
type Draft = Record<GoalKey, number>;

const toDraft = (v: GoalTargets | null): Draft => ({
  revenue: v?.revenue ?? 0,
  netProfit: v?.netProfit ?? 0,
  units: v?.units ?? 0,
  marginPct: v?.marginPct ?? 0,
});

/*
 * 0 — "kuzatilmaydi" (null). NumberField bo'sh maydonni saqlamaydi (blur'da
 * eski qiymatga qaytaradi), shuning uchun maqsadni olib tashlashning tabiiy
 * yo'li — 0. Avval yaxlitlanadi: 0,4 dona → 0 → null (server 0 ni rad etadi).
 */
const orNull = (v: number, digits = 0): number | null => {
  if (!Number.isFinite(v)) return null;
  const p = 10 ** digits;
  const r = Math.round(v * p) / p;
  return r > 0 ? r : null;
};

/** Maqsadni saqlash — yagona yo'l (kartochkadagi "Saqlash" ham shu) */
export function useSubmitGoals() {
  const t = useT(GOALS_NS);
  const m = useSaveGoals();
  const submit = (body: GoalsUpdateRequest, onDone?: () => void) =>
    m.mutate(body, {
      onSuccess: (res) => {
        toast.success(res.target ? t('toast.saved') : t('toast.cleared'));
        onDone?.();
      },
      onError: (err) => toast.error(t('toast.error'), err instanceof ApiError ? err.message : undefined),
    });
  return { submit, pending: m.isPending };
}

export function GoalsEditModal({
  open,
  onClose,
  data,
  monthLabel,
}: {
  open: boolean;
  onClose: () => void;
  data: GoalsResponse;
  monthLabel: string;
}) {
  const t = useT(GOALS_NS);
  const tc = useT('common');
  const f = useFormat();
  const formId = useId();
  const { submit, pending } = useSubmitGoals();
  const [draft, setDraft] = useState<Draft>(() => toDraft(data.target ?? data.suggested));

  // Har ochilishda saqlangan maqsaddan (bo'lmasa taklifdan) boshlanadi — yopilgan oynaning qoralamasi qolmasin
  useEffect(() => {
    if (open) setDraft(toDraft(data.target ?? data.suggested));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const set = (key: GoalKey) => (v: number) => setDraft((d) => ({ ...d, [key]: v }));

  const save = () =>
    submit(
      {
        month: data.month,
        revenue: orNull(draft.revenue),
        netProfit: orNull(draft.netProfit),
        units: orNull(draft.units),
        marginPct: orNull(draft.marginPct, 2),
      },
      onClose,
    );

  const last = data.lastMonth;
  // Katta summani raqamlar qatoridan o'qish qiyin ("371000000") — yonida ixcham ko'rinishi
  const preview = (v: number) => (v > 0 ? <span className="tnum text-xs font-medium text-ink-soft">{f.compact(v)}</span> : null);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('modal.title', { month: monthLabel })}
      description={t('modal.desc')}
      footer={
        <div className="flex flex-wrap items-center justify-between gap-2">
          {data.target ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              icon={<RotateCcw className="h-3.5 w-3.5" />}
              title={t('modal.clearHint')}
              disabled={pending}
              onClick={() => submit({ month: data.month }, onClose)}
            >
              {t('modal.clear')}
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              {tc('btn.cancel')}
            </Button>
            <Button type="submit" form={formId} loading={pending}>
              {tc('btn.save')}
            </Button>
          </div>
        </div>
      }
    >
      <form
        id={formId}
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
        className="space-y-4"
      >
        {data.suggested ? (
          <Button
            type="button"
            variant="soft"
            size="sm"
            icon={<Wand2 className="h-3.5 w-3.5" />}
            title={t('suggest.hint')}
            onClick={() => setDraft(toDraft(data.suggested))}
          >
            {t('modal.useSuggested')}
          </Button>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2">
          <NumberField
            label={t('row.revenue')}
            value={draft.revenue}
            onChange={set('revenue')}
            suffix={t('unit.money')}
            step={100_000}
            max={1e13}
            badge={preview(draft.revenue)}
            hint={last ? t('modal.last', { v: f.compact(last.revenue) }) : undefined}
          />
          <NumberField
            label={t('row.netProfit')}
            value={draft.netProfit}
            onChange={set('netProfit')}
            suffix={t('unit.money')}
            step={100_000}
            max={1e13}
            badge={preview(draft.netProfit)}
            hint={last ? t('modal.last', { v: f.compact(last.netProfit) }) : undefined}
          />
          <NumberField
            label={t('row.units')}
            value={draft.units}
            onChange={set('units')}
            suffix={t('unit.units')}
            step={1}
            max={1e9}
            hint={last ? t('modal.last', { v: f.num(last.units) }) : undefined}
          />
          <NumberField
            label={t('row.margin')}
            value={draft.marginPct}
            onChange={set('marginPct')}
            suffix="%"
            step={0.5}
            max={100}
            hint={last ? t('modal.last', { v: f.pct(last.marginPct) }) : undefined}
          />
        </div>
      </form>
    </Modal>
  );
}
