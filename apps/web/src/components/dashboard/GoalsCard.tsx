/**
 * Oylik maqsadlar — joriy oy natijasi maqsad, sur'at belgisi va prognoz bilan.
 *
 * Xom foiz bilan bo'yalgan chiziqlar oy boshida hammasi qizil bo'lib turadi
 * va hech narsa aytmaydi (5-kuni maqsadning 15% i — reja bo'yicha yurish).
 * Shuning uchun bu yerda:
 *  - rang SUR'AT bo'yicha (prognoz ÷ maqsad), chiziqda bugungi sur'at belgisi;
 *  - har qatorda oy oxiri prognozi va kuniga qancha kerakligi;
 *  - marja — chegara: farq foiz punktida, to'ldiriladigan chiziq emas;
 *  - maqsad saqlanmagan bo'lsa o'tgan oy +10% taklif (bir bosishda saqlanadi),
 *    kartochka hech qachon bo'sh turmaydi.
 * Raqamlar Boshqaruv paneli bilan aynan bir xil (server: routes/goals.ts).
 * Davr tanlagichiga bog'liq emas — har doim joriy kalendar oy.
 */
import { useState } from 'react';
import { Building2, Pencil, Target } from '@/components/icons';
import { Button, Card, CardBody, CardHeader, IconButton, Skeleton } from '@/components/ui';
import { useFormat, useT } from '@/i18n';
import { useSession } from '@/store/session';
import { cn } from '@/lib/utils';
import { useSeesMoney } from '@/lib/view';
import { GOALS_NS } from './goals/i18n';
import { GoalsEditModal, useSubmitGoals } from './goals/GoalsEditModal';
import { MarginGoalRow, PacedGoalRow } from './goals/GoalRows';
import { effectiveTargets, isLastDay, marginRow, overallTone, pacedRows, paceMarker } from './goals/model';
import { useGoals } from './goals/useGoals';

export function GoalsCard({ className }: { className?: string }) {
  const t = useT(GOALS_NS);
  const f = useFormat();
  /*
   * Pulsiz ko'rinish shablonida (Marketolog) sof foyda va marja maqsadi null
   * keladi: o'sha qatorlar chizilmaydi, maqsadni esa (u foyda maqsadini ham
   * o'z ichiga oladi) server qabul qilmaydi — tahrirlash tugmasi yo'q.
   */
  const money = useSeesMoney();
  // Batches/Payout'dagi kabi: kuzatuvchi faqat o'qiydi (server ham PUT'ni 403 qiladi)
  const canEdit = useSession((st) => st.me?.company?.role !== 'viewer') && money;
  const { data, isLoading, isError, refetch, storeFiltered } = useGoals();
  const { submit, pending } = useSubmitGoals();
  const [editing, setEditing] = useState(false);

  if (isLoading) return <GoalsSkeleton className={className} />;

  if (isError || !data) {
    return (
      <Card className={cn('flex flex-col', className)}>
        <CardHeader icon={<Target />} title={t('title')} />
        <CardBody className="flex flex-1 flex-col items-start justify-center gap-3">
          <p className="text-sm text-muted">{t('error')}</p>
          <Button size="sm" variant="outline" onClick={() => void refetch()}>
            {t('btn.retry')}
          </Button>
        </CardBody>
      </Card>
    );
  }

  const monthLabel = `${t(`month.${Number(data.month.slice(5, 7))}`)} ${data.month.slice(0, 4)}`;
  const rows = pacedRows(data).filter((r) => money || r.key !== 'netProfit');
  const margin = marginRow(data);
  const { values, isSuggestion } = effectiveTargets(data);
  const marker = paceMarker(data);
  const markerLabel = t('pace', { p: f.pct(marker, 0) });
  const lastDay = isLastDay(data);
  const hasBars = rows.some((r) => r.target !== null);
  // Taklif hali sotuvchining maqsadi emas — kartochka chizig'i faqat saqlangan maqsadda bo'yaladi
  const tone = isSuggestion ? undefined : overallTone(rows);

  const saveSuggested = () => {
    if (!data.suggested) return;
    const { revenue, netProfit, units, marginPct } = data.suggested;
    submit({ month: data.month, revenue, netProfit, units, marginPct });
  };

  return (
    <Card tone={tone} className={cn('flex flex-col', className)}>
      <CardHeader
        icon={<Target />}
        title={t('title')}
        subtitle={
          /*
            Kun yonidagi tik — chiziqlardagi sur'at belgisining o'zi: "bugun
            shu yerdamiz" alohida izoh qatorisiz o'qiladi (tor kartochkada joy tejaladi).
          */
          <span className="inline-flex flex-wrap items-center gap-x-1.5" title={markerLabel}>
            <span>{monthLabel}</span>
            <span aria-hidden>·</span>
            <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
              {hasBars ? <span className="inline-block h-3 w-0.5 rounded-full bg-ink/70" aria-hidden /> : null}
              {t('day', { d: data.dayOfMonth, n: data.daysInMonth })}
            </span>
          </span>
        }
        actions={
          canEdit && data.target ? (
            <IconButton label={t('editGoals')} onClick={() => setEditing(true)}>
              <Pencil className="h-4 w-4" />
            </IconButton>
          ) : undefined
        }
      />
      <CardBody className="flex flex-1 flex-col gap-3.5">
        {/*
          Panel bitta do'konga filtrlangan, maqsad esa kompaniyaniki — raqamlar
          qolgan kartochkalardan farq qilishi shu yerda aytiladi.
        */}
        {storeFiltered && data.scope === 'company' ? (
          <span className="chip self-start bg-surface-3 py-0.5 text-2xs text-muted" title={t('allStoresHint')}>
            <Building2 className="h-3 w-3" />
            {t('allStores')}
          </span>
        ) : null}

        {rows.map((r) => (
          <PacedGoalRow
            key={r.key}
            row={r}
            isSuggestion={isSuggestion}
            marker={marker}
            markerLabel={markerLabel}
            lastDay={lastDay}
          />
        ))}

        {money ? <MarginGoalRow row={margin} isSuggestion={isSuggestion} /> : null}

        {isSuggestion ? (
          <div className="well mt-auto flex flex-wrap items-center justify-between gap-x-3 gap-y-2 px-3 py-2.5">
            <p className="flex min-w-0 flex-wrap items-center gap-x-1.5 text-xs leading-5 text-muted">
              <span className="rounded border border-dashed border-line-strong px-1.5 text-2xs font-semibold uppercase tracking-[0.04em] text-ink-soft">
                {t('suggested')}
              </span>
              {canEdit ? t('suggest.hint') : t('suggest.viewer')}
            </p>
            {canEdit ? (
              <div className="flex shrink-0 gap-2">
                <Button size="sm" loading={pending} onClick={saveSuggested}>
                  {t('btn.save')}
                </Button>
                <Button size="sm" variant="outline" icon={<Pencil className="h-3.5 w-3.5" />} onClick={() => setEditing(true)}>
                  {t('btn.edit')}
                </Button>
              </div>
            ) : null}
          </div>
        ) : !values ? (
          // O'tgan oy ma'lumoti yo'q (yangi do'kon) — taklif yo'q, maqsadni o'zi qo'yadi
          <div className="well mt-auto flex flex-wrap items-center justify-between gap-x-3 gap-y-2 px-3 py-2.5">
            <p className="min-w-0 text-xs leading-5 text-muted">{t('empty.hint')}</p>
            {canEdit ? (
              <Button size="sm" icon={<Target className="h-3.5 w-3.5" />} onClick={() => setEditing(true)}>
                {t('setGoals')}
              </Button>
            ) : null}
          </div>
        ) : null}
      </CardBody>

      {canEdit ? (
        <GoalsEditModal open={editing} onClose={() => setEditing(false)} data={data} monthLabel={monthLabel} />
      ) : null}
    </Card>
  );
}

/** Tayyor kartochka bilan bir xil tartib — ma'lumot kelganda qator sakramasin */
function GoalsSkeleton({ className }: { className?: string }) {
  return (
    <Card className={cn('flex flex-col', className)}>
      <div className="flex items-start gap-3 px-5 pt-5">
        <Skeleton className="h-9 w-9 rounded-[10px]" />
        <div className="space-y-2 pt-0.5">
          <Skeleton className="h-4 w-36" />
          <Skeleton className="h-3 w-28" />
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-3.5 p-5 pt-4">
        {[0, 1, 2].map((i) => (
          <div key={i} className="space-y-1.5">
            <div className="flex justify-between gap-3">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-28" />
            </div>
            <Skeleton className="h-2 w-full rounded-full" />
            <Skeleton className="h-3 w-40" />
          </div>
        ))}
        <Skeleton className="h-[60px] w-full rounded-xl" />
      </div>
    </Card>
  );
}
