import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  ArrowRight,
  Bell,
  Check,
  CheckCircle2,
  Clock3,
  LifeBuoy,
  Loader2,
  PartyPopper,
  Play,
  RefreshCw,
} from 'lucide-react';
import { APP, SYNC_STEPS, formatDuration, type SyncStatus } from '@savdoiq/shared';
import { Button, ErrorState, ProgressRing, Skeleton } from '@/components/ui';
import { BOT_URL as BOT_URL_SHARED } from '@/lib/bot';
import { api, ApiError } from '@/lib/api';
import { useLang, useT } from '@/i18n';
import { cn } from '@/lib/utils';

const SUPPORT_URL = BOT_URL_SHARED;
const POLL_MS = 4000;

/**
 * 4-qadam: dastlabki to'liq sinxronizatsiya (~30 daqiqa).
 * Har 4 soniyada `/sync/status` so'raladi, ETA jonli sanaladi.
 */
export function SyncStep({
  onOpenDashboard,
  onFinished,
}: {
  onOpenDashboard: () => void;
  onFinished: () => void;
}) {
  const t = useT('onboarding');
  const lang = useLang();

  const status = useQuery({
    queryKey: ['onboarding', 'sync-status'],
    queryFn: () => api.get<SyncStatus>('/sync/status'),
    staleTime: 0,
    refetchInterval: (query) => {
      const s = query.state.data;
      if (s && (s.status === 'done' || s.status === 'failed')) return false;
      return POLL_MS;
    },
  });

  const sync = status.data ?? null;

  const start = useMutation({
    mutationFn: () => api.post<SyncStatus>('/sync/start'),
    onSuccess: () => {
      void status.refetch();
    },
  });

  // ── ETA jonli sanoq ────────────────────────────────────────────
  const [eta, setEta] = useState(0);
  useEffect(() => {
    if (sync) setEta(Math.max(0, sync.etaSeconds));
  }, [sync?.etaSeconds, sync?.stepIndex, sync?.status]);

  useEffect(() => {
    if (!sync || (sync.status !== 'running' && sync.status !== 'queued')) return;
    const id = window.setInterval(() => setEta((v) => (v > 1 ? v - 1 : 0)), 1000);
    return () => window.clearInterval(id);
  }, [sync?.status]);

  // ── Tugaganda dashboard'ga o'tish ──────────────────────────────
  useEffect(() => {
    if (sync?.status !== 'done') return;
    const id = window.setTimeout(() => onFinished(), 3000);
    return () => window.clearTimeout(id);
  }, [sync?.status, onFinished]);

  if (status.isLoading) {
    return (
      <div className="card space-y-4 p-6">
        <div className="flex flex-col items-center gap-4 py-6">
          <Skeleton className="h-[188px] w-[188px] rounded-full" />
          <Skeleton className="h-4 w-48" />
        </div>
        <div className="space-y-2.5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      </div>
    );
  }

  if (status.isError || !sync) {
    return (
      <div className="card">
        <ErrorState
          message={status.error instanceof ApiError ? status.error.message : t('sync.errStatus')}
          onRetry={() => void status.refetch()}
          retryLabel={t('sync.retry')}
        />
      </div>
    );
  }

  const done = sync.status === 'done';
  const failed = sync.status === 'failed';
  const idle = sync.status === 'idle' && !sync.jobId;
  const currentIdx = done ? SYNC_STEPS.length : SYNC_STEPS.findIndex((s) => s.id === sync.step);
  const progress = done ? 100 : Math.max(0, Math.min(100, sync.progress));

  return (
    <div className="space-y-4">
      {/* ── Asosiy holat kartochkasi ───────────────────────────── */}
      <div className="card overflow-hidden bg-aurora">
        <div className="flex flex-col items-center px-6 py-8 text-center">
          <AnimatePresence mode="wait" initial={false}>
            {done ? (
              <motion.div
                key="done"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                className="flex flex-col items-center"
              >
                <span className="relative flex h-24 w-24 items-center justify-center rounded-full bg-brand/[0.12] text-brand-ink">
                  <span className="absolute inset-0 animate-pulse-ring rounded-full bg-brand/30" />
                  <PartyPopper className="h-10 w-10" />
                </span>
                <h2 className="mt-5 font-display text-2xl font-extrabold tracking-tight text-ink">
                  {t('sync.done.title')}
                </h2>
                <p className="mt-1.5 max-w-sm text-sm text-muted">{t('sync.done.body')}</p>
                <Button className="mt-5" onClick={onFinished} iconRight={<ArrowRight className="h-4 w-4" />}>
                  {t('sync.done.btn')}
                </Button>
              </motion.div>
            ) : failed ? (
              <motion.div
                key="failed"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
                className="flex flex-col items-center"
              >
                <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-danger/[0.12] text-danger-ink">
                  <AlertTriangle className="h-7 w-7" />
                </span>
                <h2 className="mt-4 font-display text-xl font-extrabold tracking-tight text-ink">
                  {t('sync.failed.title')}
                </h2>
                <p className="mt-1.5 max-w-md text-sm text-muted">{sync.error ?? t('sync.failed.body')}</p>
                <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
                  <Button
                    loading={start.isPending}
                    onClick={() => start.mutate()}
                    icon={<RefreshCw className="h-4 w-4" />}
                  >
                    {t('sync.retry')}
                  </Button>
                  <a href={SUPPORT_URL} target="_blank" rel="noreferrer">
                    <Button variant="outline" icon={<LifeBuoy className="h-4 w-4" />}>
                      {t('sync.support')}
                    </Button>
                  </a>
                </div>
                {start.isError ? (
                  <p className="mt-3 text-xs text-danger">
                    {start.error instanceof ApiError ? start.error.message : t('sync.errStart')}
                  </p>
                ) : null}
              </motion.div>
            ) : (
              <motion.div
                key="running"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
                className="flex flex-col items-center"
              >
                <ProgressRing value={progress} size={188} stroke={14}>
                  <span className="tnum font-display text-4xl font-extrabold tracking-tight text-ink">
                    {Math.round(progress)}
                    <span className="text-2xl text-muted">%</span>
                  </span>
                  <span className="mt-1 max-w-[8rem] text-2xs font-semibold uppercase tracking-wide text-muted">
                    {t('sync.ring')}
                  </span>
                </ProgressRing>

                <h2 className="mt-5 font-display text-xl font-extrabold tracking-tight text-ink">
                  {t('sync.title')}
                </h2>
                <p className="mt-1.5 max-w-md text-sm text-muted">{sync.message ?? t('sync.subtitle')}</p>

                <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                  <span className="chip bg-surface-2 text-ink-soft">
                    <Clock3 className="h-3.5 w-3.5 text-brand" />
                    <span className="tnum">
                      {eta > 0 ? t('sync.eta', { time: formatDuration(eta, lang) }) : t('sync.etaSoon')}
                    </span>
                  </span>
                  {idle ? null : (
                    <span className="chip bg-brand/[0.12] text-brand-ink">
                      <span className="tnum">
                        {t('sync.stepOf', {
                          n: Math.min(SYNC_STEPS.length, Math.max(1, currentIdx + 1)),
                          total: SYNC_STEPS.length,
                        })}
                      </span>
                    </span>
                  )}
                </div>

                {idle ? (
                  <Button
                    className="mt-5"
                    loading={start.isPending}
                    onClick={() => start.mutate()}
                    icon={<Play className="h-4 w-4" />}
                  >
                    {t('sync.idleBtn')}
                  </Button>
                ) : null}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* ── Bosqichlar ro'yxati ────────────────────────────────── */}
      <div className="card overflow-hidden">
        <div className="border-b border-line px-5 py-4">
          <h3 className="section-title text-base">{t('sync.stepsTitle')}</h3>
        </div>
        <ul className="divide-y divide-line">
          {SYNC_STEPS.map((step, i) => {
            const isDone = failed ? i < currentIdx : i < currentIdx || done;
            const isCurrent = !done && !failed && i === currentIdx;
            const isFailedHere = failed && i === currentIdx;
            return (
              <li
                key={step.id}
                className={cn(
                  'flex items-start gap-3 px-5 py-3 transition-colors',
                  isCurrent && 'bg-brand/5',
                  isFailedHere && 'bg-danger/5',
                )}
              >
                <span
                  className={cn(
                    'mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full',
                    isDone && 'bg-brand/15 text-brand-ink',
                    isCurrent && 'bg-brand/15 text-brand-ink',
                    isFailedHere && 'bg-danger/15 text-danger-ink',
                    !isDone && !isCurrent && !isFailedHere && 'bg-surface-3 text-muted',
                  )}
                >
                  {isDone ? (
                    <Check className="h-3.5 w-3.5" />
                  ) : isCurrent ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : isFailedHere ? (
                    <AlertTriangle className="h-3.5 w-3.5" />
                  ) : (
                    <span className="tnum text-2xs font-bold">{i + 1}</span>
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <p
                    className={cn(
                      'text-sm font-semibold',
                      isCurrent ? 'text-ink' : isDone ? 'text-ink-soft' : 'text-muted',
                    )}
                  >
                    {step.label[lang] ?? step.label.uz}
                  </p>
                  {isCurrent || isFailedHere ? (
                    <p className="mt-0.5 text-xs leading-relaxed text-muted">{step.hint[lang] ?? step.hint.uz}</p>
                  ) : null}
                </div>
                {isDone ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-brand" /> : null}
              </li>
            );
          })}
        </ul>
      </div>

      {/* ── Shu vaqtda nima qilish mumkin ──────────────────────── */}
      {done ? null : (
        <div className="card p-5">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-info/10 text-info-ink">
              <Bell className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="font-display text-base font-bold text-ink">{t('sync.meanwhile.title')}</h3>
              <ul className="mt-2.5 space-y-1.5">
                {['b1', 'b2', 'b3'].map((k) => (
                  <li key={k} className="flex items-start gap-2 text-sm text-ink-soft">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand" />
                    <span className="leading-relaxed">{t(`sync.meanwhile.${k}`)}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <Button variant="outline" onClick={onOpenDashboard} iconRight={<ArrowRight className="h-4 w-4" />}>
                  {t('sync.openDashboard')}
                </Button>
                <span className="text-xs text-muted">{t('sync.partial')}</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
