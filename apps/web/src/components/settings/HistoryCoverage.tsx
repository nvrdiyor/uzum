import { useState } from 'react';
import type { HistoryCoverage } from '@savdoiq/shared';
import { formatDuration } from '@savdoiq/shared';
import { AlertTriangle, CalendarRange, Download, History, RotateCcw } from '@/components/icons';
import { Badge, Button, Modal, ProgressBar, type Tone } from '@/components/ui';
import { useFormat, useLang, useT } from '@/i18n';

type BadgeKey = 'done' | 'partial' | 'queued' | 'running' | 'failed';

const BADGE_TONE: Record<BadgeKey, Tone> = {
  done: 'brand',
  partial: 'warn',
  queued: 'info',
  running: 'info',
  failed: 'danger',
};

/** "23-okt 2025" (uz) · "23 окт 2025" (ru) · "23 Oct 2025" (en); kirish — YYYY-MM-DD */
function dayLabel(iso: string, lang: 'uz' | 'ru' | 'en', monthShort: (v: string) => string): string {
  const day = Number(iso.slice(8, 10));
  const year = iso.slice(0, 4);
  const month = monthShort(iso);
  return lang === 'uz' ? `${day}-${month} ${year}` : `${day} ${month} ${year}`;
}

/**
 * Sozlamalar → Uzum → Sinxronizatsiya: saqlangan tarix qaysi kundan va tarif
 * qancha ruxsat beradi. Sinovdan 365 kunlik tarifga o'tilganda eski oylar
 * fonda yuklanadi (o'zi boshlanadi) — bu blok holatni ko'rsatadi, yiqilganda
 * yoki eski kabinetda qo'lda boshlash tugmasini beradi (2026-10-24).
 *
 * Yuklash Uzum'ni asrab, sekin ketadi: kechasi va soatlik so'rovlar chegarasida
 * to'xtaydi — sabab va davom etish vaqti shu yerda yoziladi. Eski kabinetning
 * birinchi sinxroni Uzum chegarasida kesilgan bo'lishi mumkin bo'lsa
 * (`suspectGap`), butun tarixni qayta o'qish taklif qilinadi.
 */
export function HistoryCoverageBlock({
  history,
  canManage,
  loading,
  onLoad,
  onRescan,
}: {
  history: HistoryCoverage | null | undefined;
  canManage: boolean;
  loading: boolean;
  onLoad: () => void;
  onRescan: () => void;
}) {
  const t = useT('settings');
  const f = useFormat();
  const lang = useLang();
  const [confirm, setConfirm] = useState(false);
  if (!history) return null;

  const active = history.status === 'queued' || history.status === 'running';
  const complete = history.missingDays === 0;
  const failed = history.status === 'failed' && !complete;
  const badge: BadgeKey = active
    ? (history.status === 'queued' ? 'queued' : 'running')
    : failed
      ? 'failed'
      : complete
        ? 'done'
        : 'partial';

  const paused = active && history.pauseReason && history.pausedUntil ? history.pauseReason : null;
  const hint = !history.from
    ? t('cov.noneHint')
    : paused && history.pausedUntil
      ? t(`cov.pause.${paused}`, { time: f.dateTime(history.pausedUntil) })
      : history.status === 'queued'
        ? t('cov.queued')
        : history.status === 'running'
          ? t('cov.running')
          : failed
            ? `${t('cov.failed')}${history.error ? `: ${history.error}` : ''}`
            : complete
              ? t('cov.full')
              : t('cov.missing', { days: history.missingDays });

  return (
    <div className="rounded-2xl border border-line bg-surface-2/50 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand/10 text-brand-ink">
            <CalendarRange className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-ink">
              {history.from ? t('cov.from', { date: dayLabel(history.from, lang, f.monthShort) }) : t('cov.none')}
              <span className="mx-1.5 text-muted">·</span>
              <span className="font-medium text-ink-soft">{t('cov.plan', { days: history.planDays })}</span>
            </p>
            <p className={`mt-0.5 text-xs ${failed ? 'text-danger' : 'text-muted'}`}>{hint}</p>
            {history.suspectGap && !active ? (
              <p className="mt-1 flex items-start gap-1.5 text-xs text-warn">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>{t('cov.suspect')}</span>
              </p>
            ) : null}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {history.from ? (
            <Badge tone={BADGE_TONE[badge]} dot>
              {t(`cov.badge.${badge}`)}
            </Badge>
          ) : null}
          {canManage && history.canBackfill ? (
            <Button
              size="sm"
              variant="outline"
              icon={failed ? <RotateCcw className="h-3.5 w-3.5" /> : <Download className="h-3.5 w-3.5" />}
              loading={loading}
              onClick={onLoad}
            >
              {failed ? t('cov.retry') : t('cov.load')}
            </Button>
          ) : null}
          {canManage && history.canRescan && !history.canBackfill ? (
            <Button
              size="sm"
              variant={history.suspectGap ? 'outline' : 'ghost'}
              icon={<History className="h-3.5 w-3.5" />}
              disabled={loading}
              onClick={() => setConfirm(true)}
            >
              {t('cov.rescan')}
            </Button>
          ) : null}
        </div>
      </div>

      {active ? (
        <div className="mt-3">
          <ProgressBar value={history.progress} />
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
            <span>{t('cov.runningHint')}</span>
            <span className="tnum">
              {history.progress}%
              <span className="mx-1.5">·</span>
              {history.etaSeconds > 0 ? t('sync.eta', { v: formatDuration(history.etaSeconds, lang) }) : t('sync.etaUnknown')}
            </span>
          </div>
        </div>
      ) : null}

      <Modal open={confirm} onClose={() => setConfirm(false)} title={t('cov.rescanTitle')} size="sm">
        <p className="text-sm text-ink-soft">{t('cov.rescanBody')}</p>
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <Button variant="ghost" onClick={() => setConfirm(false)}>
            {t('btn.cancel')}
          </Button>
          <Button
            icon={<History className="h-4 w-4" />}
            loading={loading}
            onClick={() => {
              setConfirm(false);
              onRescan();
            }}
          >
            {t('cov.rescan')}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
