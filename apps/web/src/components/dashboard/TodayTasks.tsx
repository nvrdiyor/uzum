/**
 * "Bugun nima qilish kerak" — bugungi ishlar, xavf ostidagi pul bo'yicha saralangan.
 *
 * Har bir signal o'z sahifasida bor edi (da'vo kutayotgan yo'qotish, javobsiz
 * sharh, tannarxsiz sotuv...), lekin sotuvchi ularni bir joyda va "qaysi biri
 * ko'proq pul" tartibida ko'rmasdi. Server (routes/today.ts) ularni yig'adi,
 * bir turdagi obyektlarni bitta qatorga jamlaydi va summa bo'yicha saralaydi.
 * Bu yerda:
 *  - matn uch tilda `kind` + `params` dan yasaladi (today/text.ts);
 *  - "Bajarildi" / "Keyinroq" qatorni darhol yashiradi, oxirgi amal bir
 *    bosishda qaytariladi — adashib bosilgan vazifa yo'qolib ketmasin;
 *  - ro'yxat bo'sh bo'lsa "Hammasi nazoratda" — qaysi tekshiruvlar o'tgani
 *    bilan: bo'sh kartochka "ishlamayapti" deb o'qilardi.
 * Davr tanlagichiga bog'liq emas — "bugun" doim joriy Toshkent savdo kuni.
 */
import { useEffect, useState } from 'react';
import type { TodayResponse, TodayTask } from '@savdoiq/shared';
import { CalendarClock, Check, CheckCircle2, ChevronDown, EyeOff, Wallet } from '@/components/icons';
import { Button, Card, CardBody, CardHeader, CheckItem, Skeleton, toast, type Tone } from '@/components/ui';
import { useFormat, useT } from '@/i18n';
import { ApiError } from '@/lib/api';
import { useSession } from '@/store/session';
import { cn } from '@/lib/utils';
import { TODAY_NS } from './today/i18n';
import { useTaskText } from './today/text';
import { LEVEL_TONE, TaskRow } from './today/TaskRow';
import { useToday, useTodayAction } from './today/useToday';

/** Shundan ko'pi "Yana N ta" ortida — kartochka maqsadlar bilan bir qatorda, bo'yi cho'zilib ketmasin */
const VISIBLE = 5;
/** "Qaytarish" yozuvi shuncha turadi */
const UNDO_MS = 8000;

type HideAction = 'done' | 'snooze';

export function TodayTasks({ className }: { className?: string }) {
  const t = useT(TODAY_NS);
  const tc = useT('common');
  // Kuzatuvchi faqat ko'radi — server ham PATCH'ni 403 qiladi
  const canEdit = useSession((st) => st.me?.company?.role !== 'viewer');
  const { data, isLoading, isError, refetch } = useToday();
  const action = useTodayAction();
  const textOf = useTaskText();
  const [expanded, setExpanded] = useState(false);
  const [last, setLast] = useState<{ task: TodayTask; action: HideAction; title: string } | null>(null);

  useEffect(() => {
    if (!last) return;
    const id = window.setTimeout(() => setLast(null), UNDO_MS);
    return () => window.clearTimeout(id);
  }, [last]);

  if (isLoading) return <TodaySkeleton className={className} />;

  if (isError || !data) {
    return (
      <Card className={cn('flex flex-col', className)}>
        <CardHeader icon={<CalendarClock />} title={t('title')} />
        <CardBody className="flex flex-1 flex-col items-start justify-center gap-3">
          <p className="text-sm text-muted">{t('error')}</p>
          <Button size="sm" variant="outline" onClick={() => void refetch()}>
            {tc('btn.retry')}
          </Button>
        </CardBody>
      </Card>
    );
  }

  const onError = (err: unknown) => toast.error(t('toast.error'), err instanceof ApiError ? err.message : undefined);

  const hideTask = (task: TodayTask, kind: HideAction) => {
    const title = textOf(task).title;
    action.mutate({ task, action: kind }, { onError });
    setLast({ task, action: kind, title });
  };

  const undo = () => {
    if (!last) return;
    action.mutate({ task: last.task, action: 'reset' }, { onError });
    setLast(null);
  };

  const items = data.items;
  const shown = expanded ? items : items.slice(0, VISIBLE);
  const rest = items.length - shown.length;
  // Kartochka chizig'i eng shoshilinch vazifa rangida; hammasi toza bo'lsa — brend
  const tone: Tone | undefined =
    items.length === 0
      ? 'brand'
      : items.some((it) => it.level === 'danger')
        ? LEVEL_TONE.danger
        : items.some((it) => it.level === 'warn')
          ? LEVEL_TONE.warn
          : undefined;

  return (
    <Card tone={tone} className={cn('flex flex-col', className)}>
      <CardHeader
        icon={<CalendarClock />}
        title={t('title')}
        subtitle={<TodaySubtitle date={data.date} count={items.length} />}
        actions={<HeaderChips data={data} />}
      />
      {/* Qatorlarning o'z ichki bo'shlig'i bor — ro'yxat sarlavhaga yaqinroq turadi */}
      <CardBody className={cn('flex flex-1 flex-col gap-3', items.length > 0 && '!pt-2')}>
        {items.length === 0 ? (
          <AllClear data={data} />
        ) : (
          <>
            {/* Ustunlar shu yerda — qatorlar subgrid: summa va tugmalar hamma qatorda bir chiziqda */}
            <ul className="grid grid-cols-[2.25rem_minmax(0,1fr)] gap-x-3 divide-y divide-line/70 sm:grid-cols-[2.25rem_minmax(0,1fr)_auto_auto]">
              {shown.map((task) => (
                <TaskRow
                  key={task.key}
                  task={task}
                  text={textOf(task)}
                  canEdit={canEdit}
                  onAction={(kind) => hideTask(task, kind)}
                />
              ))}
            </ul>
            {items.length > VISIBLE ? (
              <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                className="inline-flex items-center gap-1 self-start rounded-lg px-1 text-xs font-semibold text-brand-ink hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50"
                aria-expanded={expanded}
              >
                {expanded ? t('less') : t('more', { n: rest })}
                <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', expanded && 'rotate-180')} />
              </button>
            ) : null}
          </>
        )}

        {last ? (
          <div className="well flex items-center justify-between gap-3 px-3 py-2" role="status">
            <p className="flex min-w-0 items-center gap-1.5 text-xs text-muted">
              <Check className="h-3.5 w-3.5 shrink-0 text-brand-ink" />
              <span className="shrink-0">{t(`undo.${last.action}`)}:</span>
              <span className="truncate font-medium text-ink-soft">{last.title}</span>
            </p>
            <button
              type="button"
              onClick={undo}
              className="shrink-0 rounded-md px-1 text-xs font-semibold text-brand-ink hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50"
            >
              {t('undo')}
            </button>
          </div>
        ) : null}

        {items.length > 0 && data.cleared.length > 0 ? (
          // Toza tekshiruvlar ham ko'rinsin: "sharhlar tekshirilmadi" emas, "sharhlarda muammo yo'q"
          <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-line/70 pt-3 text-2xs text-muted">
            <span>{t('checked')}</span>
            {data.cleared.map((c) => (
              <span key={c.kind} className="inline-flex items-center gap-1" title={t(`cleared.${c.kind}`)}>
                <Check className="h-3 w-3 text-brand-ink" />
                {t(`kind.${c.kind}`)}
              </span>
            ))}
          </div>
        ) : null}
      </CardBody>
    </Card>
  );
}

/** "Juma, 24 okt · 4 ta vazifa" */
function TodaySubtitle({ date, count }: { date: string; count: number }) {
  const t = useT(TODAY_NS);
  const f = useFormat();
  const [y, m, d] = date.split('-').map(Number);
  const weekday = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1)).getUTCDay() || 7;
  return (
    <span className="inline-flex flex-wrap items-center gap-x-1.5">
      <span>{t('date', { wd: t(`wd.${weekday}`), d: d ?? '', m: f.monthShort(date) })}</span>
      {count > 0 ? (
        <>
          <span aria-hidden>·</span>
          <span className="tnum">{t('count', { n: f.num(count) })}</span>
        </>
      ) : null}
    </span>
  );
}

/** Bugungi to'lov (kontekst, vazifa emas) va yashirilganlar soni */
function HeaderChips({ data }: { data: TodayResponse }) {
  const t = useT(TODAY_NS);
  const f = useFormat();
  if (data.payoutToday === null && data.hidden === 0) return null;
  return (
    <>
      {data.payoutToday !== null ? (
        <span className="meta-chip tnum" title={t('payoutHint')}>
          <Wallet className="h-3.5 w-3.5 text-brand-ink" />
          {t('payout', { v: t('money', { v: f.compact(data.payoutToday) }) })}
        </span>
      ) : null}
      {data.hidden > 0 ? (
        <span className="meta-chip tnum" title={t('hiddenHint')}>
          <EyeOff className="h-3.5 w-3.5" />
          {t('hidden', { n: f.num(data.hidden) })}
        </span>
      ) : null}
    </>
  );
}

/** Bo'sh holat: nima tekshirilgani bilan — "hech narsa yo'q" emas, "hammasi tekshirildi" */
function AllClear({ data }: { data: TodayResponse }) {
  const t = useT(TODAY_NS);
  return (
    <div className="flex flex-1 flex-col gap-3.5">
      <div className="flex items-start gap-3">
        <span className="icon-tile tone-brand h-10 w-10 rounded-xl [&_svg]:h-5 [&_svg]:w-5" aria-hidden>
          <CheckCircle2 />
        </span>
        <div className="min-w-0">
          <p className="font-display text-sm font-bold text-ink">{t('empty.title')}</p>
          <p className="mt-0.5 text-sm text-muted">{data.cleared.length > 0 ? t('empty.hint') : t('empty.none')}</p>
        </div>
      </div>
      {/* Yashirilganlar soni sarlavhadagi chipda — bu yerda takrorlanmaydi */}
      {data.cleared.length > 0 ? (
        <ul className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
          {data.cleared.map((c) => (
            <CheckItem key={c.kind}>{t(`cleared.${c.kind}`)}</CheckItem>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/** Tayyor kartochka bilan bir xil tartib — ma'lumot kelganda qator sakramasin */
function TodaySkeleton({ className }: { className?: string }) {
  return (
    <Card className={cn('flex flex-col', className)}>
      <div className="flex items-start gap-3 px-5 pt-5">
        <Skeleton className="h-9 w-9 rounded-[10px]" />
        <div className="space-y-2 pt-0.5">
          <Skeleton className="h-4 w-44" />
          <Skeleton className="h-3 w-32" />
        </div>
      </div>
      <div className="divide-y divide-line/70 p-5 pt-2">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex items-center gap-3 py-2.5">
            <Skeleton className="h-9 w-9 shrink-0 rounded-[10px]" />
            <div className="min-w-0 flex-1 space-y-1.5">
              <Skeleton className="h-4 w-3/5" />
              <Skeleton className="h-3 w-2/5" />
            </div>
            <Skeleton className="hidden h-8 w-24 rounded-lg sm:block" />
            <Skeleton className="hidden h-8 w-28 rounded-lg sm:block" />
          </div>
        ))}
      </div>
    </Card>
  );
}
