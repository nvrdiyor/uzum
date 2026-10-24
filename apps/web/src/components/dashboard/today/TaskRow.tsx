import { Link } from 'react-router-dom';
import type { TodayTask, TodayTaskKind, TodayTaskLevel } from '@savdoiq/shared';
import {
  ArrowRight,
  Check,
  CircleCheck,
  Clock3,
  Hourglass,
  Lock,
  MessageSquareReply,
  PackageOpen,
  PackageX,
  Tag,
  Warehouse,
  type AppIcon,
} from '@/components/icons';
import type { Tone } from '@/components/ui';
import { useFormat, useT } from '@/i18n';
import { cn } from '@/lib/utils';
import { TODAY_NS } from './i18n';
import type { TaskText } from './text';

/** Tur belgisi "nima haqida", rang esa "qanchalik shoshilinch" ekanini aytadi */
const KIND_ICON: Record<TodayTaskKind, AppIcon> = {
  loss: PackageX,
  review: MessageSquareReply,
  cost: Tag,
  fbs: PackageOpen,
  stock: Hourglass,
  storage: Warehouse,
};

/** Qizil faqat pul hozir yo'qotilayotganda (InsightsBlock bilan bir xil qoida) */
export const LEVEL_TONE: Record<TodayTaskLevel, Tone> = { danger: 'danger', warn: 'warn', info: 'info' };

const LINK_BTN = 'btn-outline group gap-1.5 whitespace-nowrap rounded-lg px-2.5 py-1.5 text-xs';

/*
 * Ikkinchi darajali amallar chegarasiz: har qatorda uchta ramkali tugma
 * ro'yxatni katakchalarga aylantirardi, ramkali galochka esa "allaqachon
 * bajarilgan" belgisidek o'qilardi.
 */
const GHOST_BTN =
  'inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50';

/**
 * Bitta vazifa qatori (~56 px): belgi, nima va nega, summa va uning
 * ma'nosi, bitta asosiy harakat. "Bajarildi" / "Keyinroq" ikkinchi darajali
 * — chegarasiz belgi tugmalar, kuzatuvchida umuman yo'q (server ham 403 qiladi).
 *
 * Ustunlar ro'yxatning o'zidan olinadi (subgrid, TodayTasks): summalar va
 * tugmalar hamma qatorda bir chiziqda turadi, tugma matni uzun-qisqa bo'lsa ham.
 * Telefonda bir qatorga sig'maydi (summa, tugma va ikki belgi ~320 px) —
 * summa va harakatlar matn ostiga, matn ustuniga tushadi.
 */
export function TaskRow({
  task,
  text,
  canEdit,
  onAction,
}: {
  task: TodayTask;
  text: TaskText;
  canEdit: boolean;
  onAction: (action: 'done' | 'snooze') => void;
}) {
  const t = useT(TODAY_NS);
  const tc = useT('common');
  const f = useFormat();
  const Icon = KIND_ICON[task.kind] ?? Check;
  const tone = LEVEL_TONE[task.level] ?? 'info';

  return (
    <li className="col-span-full grid grid-cols-subgrid items-center gap-y-1.5 py-2.5">
      <span
        className={cn(
          'icon-tile h-9 w-9 self-start rounded-[10px] sm:self-center [&_svg]:h-[18px] [&_svg]:w-[18px]',
          `tone-${tone}`,
        )}
        aria-hidden
      >
        <Icon />
      </span>

      <div className="min-w-0">
        <p className="truncate text-sm font-semibold leading-5 text-ink" title={text.title}>
          {text.title}
        </p>
        <p className="truncate text-xs leading-4 text-muted" title={text.body}>
          {text.body}
        </p>
      </div>

      {task.amount !== null ? (
        <div
          className="col-start-2 flex min-w-0 items-baseline gap-1.5 sm:col-start-auto sm:block sm:text-right"
          title={text.amountHint ?? undefined}
        >
          <p className="tnum whitespace-nowrap font-display text-sm font-bold leading-5 text-ink">
            {t('money', { v: f.compact(task.amount) })}
          </p>
          {text.amountLabel ? (
            <p className="truncate text-2xs leading-4 text-muted sm:whitespace-nowrap">{text.amountLabel}</p>
          ) : null}
        </div>
      ) : (
        // Summasiz qator (sharh) — katakcha bo'sh qoladi, telefonda esa joy olmaydi
        <span className="hidden sm:block" />
      )}

      <div className="col-start-2 flex items-center justify-between gap-1.5 sm:col-start-auto sm:justify-end">
        {/*
          Tarifda yopiq bo'lim: qulf faqat shu tugmada — sarlavha yonidagi
          alohida "yopiq" belgisi sarlavhani yarmigacha kesib qo'yardi.
        */}
        {task.locked ? (
          <Link to="/pricing" className={LINK_BTN} title={t('lockedHint')}>
            <Lock className="h-3.5 w-3.5" />
            {tc('btn.upgrade')}
          </Link>
        ) : (
          <Link to={task.link} className={LINK_BTN}>
            {text.cta}
            <ArrowRight className="h-3.5 w-3.5 transition-transform duration-200 group-hover:translate-x-0.5" />
          </Link>
        )}
        {canEdit ? (
          <span className="flex items-center">
            <button
              type="button"
              className={GHOST_BTN}
              title={t('done')}
              aria-label={t('done')}
              onClick={() => onAction('done')}
            >
              <CircleCheck className="h-[18px] w-[18px]" />
            </button>
            <button
              type="button"
              className={GHOST_BTN}
              title={`${t('snooze')} — ${t('snoozeHint')}`}
              aria-label={t('snooze')}
              onClick={() => onAction('snooze')}
            >
              <Clock3 className="h-[18px] w-[18px]" />
            </button>
          </span>
        ) : null}
      </div>
    </li>
  );
}
