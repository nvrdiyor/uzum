import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { History, Loader2, PlayCircle, RefreshCw } from '@/components/icons';
import type { SyncStatus } from '@savdoiq/shared';
import { SYNC_STEPS, formatDuration } from '@savdoiq/shared';
import {
  Badge,
  Card,
  CardBody,
  CardHeader,
  Button,
  DataTable,
  EmptyState,
  ErrorState,
  ProgressBar,
  Skeleton,
  toast,
  type Column,
  type Tone,
} from '@/components/ui';
import { api } from '@/lib/api';
import { useSession } from '@/store/session';
import { useFormat, useLang, useT } from '@/i18n';
import { HistoryCoverageBlock } from './HistoryCoverage';
import { asItems, errText, jobDuration, type SyncHistoryRow } from './types';

const JOB_TONE: Record<string, Tone> = {
  queued: 'info',
  running: 'brand',
  done: 'brand',
  failed: 'danger',
  idle: 'muted',
};

function stepLabel(step: string, lang: 'uz' | 'ru' | 'en'): string | null {
  const def = SYNC_STEPS.find((s) => s.id === step);
  return def ? def.label[lang] : null;
}

/** Sinxronizatsiya holati (jonli) va oxirgi 10 ta jarayon */
export function SyncPanel({ hasAccounts }: { hasAccounts: boolean }) {
  const t = useT('settings');
  const f = useFormat();
  const lang = useLang();
  const qc = useQueryClient();
  // Tarix yuklash — server ham faqat owner/manager'ga ruxsat beradi (requireRole)
  const role = useSession((st) => st.me?.company?.role ?? null);
  const canManage = role === 'owner' || role === 'manager';

  const status = useQuery({
    queryKey: ['sync-status'],
    queryFn: () => api.get<SyncStatus>('/sync/status'),
    refetchInterval: (q) => {
      const s = q.state.data as SyncStatus | undefined;
      const busy = (x: string | undefined) => x === 'running' || x === 'queued';
      return s && (busy(s.status) || busy(s.history?.status)) ? 5000 : 60_000;
    },
  });

  const history = useQuery({
    queryKey: ['sync-history'],
    queryFn: async () => asItems<SyncHistoryRow>(await api.get<SyncHistoryRow[]>('/sync/history')),
  });

  const start = useMutation({
    mutationFn: () => api.post<unknown>('/sync/start'),
    onSuccess: () => {
      toast.success(t('sync.started'));
      void qc.invalidateQueries({ queryKey: ['sync-status'] });
      void qc.invalidateQueries({ queryKey: ['sync-history'] });
    },
    onError: (err) => toast.error(t('sync.startErr'), errText(err)),
  });

  const backfill = useMutation({
    mutationFn: (rescan: boolean) => api.post<SyncStatus>('/sync/backfill', { rescan }),
    onSuccess: (res, rescan) => {
      const h = res?.history;
      if (h && (h.status === 'queued' || h.status === 'running')) {
        toast.success(rescan ? t('cov.rescanStarted') : t('cov.started'), t('cov.startedBody'));
      } else if (h && h.missingDays === 0 && !rescan) toast.info(t('cov.upToDate'));
      if (res) qc.setQueryData(['sync-status'], res);
      void qc.invalidateQueries({ queryKey: ['sync-history'] });
    },
    onError: (err) => toast.error(t('cov.startErr'), errText(err)),
  });

  const s = status.data;
  const active = Boolean(s && (s.status === 'running' || s.status === 'queued'));
  const rows = (history.data ?? []).slice(0, 10);

  const columns: Column<SyncHistoryRow>[] = [
    {
      key: 'type',
      header: t('sync.col.type'),
      render: (r) => (
        <span className="text-sm font-medium text-ink">
          {r.type === 'full' || r.type === 'incremental' || r.type === 'backfill' ? t(`sync.type.${r.type}`) : (r.type ?? '—')}
        </span>
      ),
    },
    {
      key: 'status',
      header: t('sync.col.status'),
      render: (r) => (
        <Badge tone={JOB_TONE[r.status ?? 'idle'] ?? 'muted'} dot>
          {t(`sync.status.${r.status ?? 'idle'}`)}
        </Badge>
      ),
    },
    {
      key: 'startedAt',
      header: t('sync.col.started'),
      align: 'right',
      hideOnMobile: true,
      render: (r) => {
        const at = r.startedAt ?? r.createdAt;
        return at ? <span className="tnum text-sm text-ink-soft">{f.dateTime(at)}</span> : <span className="text-muted">—</span>;
      },
    },
    {
      key: 'duration',
      header: t('sync.col.duration'),
      align: 'right',
      render: (r) => {
        const d = jobDuration(r);
        return d === null ? <span className="text-muted">—</span> : <span className="tnum">{formatDuration(d, lang)}</span>;
      },
    },
    {
      key: 'error',
      header: t('sync.col.error'),
      hideOnMobile: true,
      render: (r) =>
        r.error ? (
          <span className="line-clamp-2 max-w-[240px] text-xs text-danger">{r.error}</span>
        ) : (
          <span className="text-muted">—</span>
        ),
    },
  ];

  return (
    <Card>
      <CardHeader
        icon={<RefreshCw className={`h-4 w-4 ${active ? 'animate-spin' : ''}`} />}
        title={t('sync.title')}
        subtitle={t('sync.subtitle')}
        actions={
          <Button
            size="sm"
            variant="outline"
            icon={<PlayCircle className="h-3.5 w-3.5" />}
            loading={start.isPending}
            disabled={active || !hasAccounts}
            onClick={() => start.mutate()}
          >
            {t('sync.start')}
          </Button>
        }
      />

      <CardBody className="space-y-5">
        {/* ── Jonli holat ── */}
        {status.isError ? (
          <ErrorState message={errText(status.error)} onRetry={() => void status.refetch()} />
        ) : status.isLoading ? (
          <Skeleton className="h-20 w-full" />
        ) : active && s ? (
          <div className="rounded-2xl border border-brand/25 bg-brand/5 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="flex items-center gap-2 text-sm font-semibold text-ink">
                <Loader2 className="h-4 w-4 animate-spin text-brand" />
                {t('sync.running')}
              </p>
              <span className="tnum font-display text-lg font-extrabold text-brand-ink">{s.progress}%</span>
            </div>
            <ProgressBar value={s.progress} className="mt-3" />
            <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
              <span>
                {t('sync.step', { i: Math.max(1, s.stepIndex), n: s.totalSteps })}
                <span className="mx-1.5">·</span>
                {stepLabel(s.step, lang) ?? s.message ?? ''}
              </span>
              <span className="tnum">
                {s.etaSeconds > 0 ? t('sync.eta', { v: formatDuration(s.etaSeconds, lang) }) : t('sync.etaUnknown')}
              </span>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-surface-2/50 p-4">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-ink">{t('sync.idle')}</p>
              <p className="mt-0.5 text-xs text-muted">{t('sync.idleHint')}</p>
            </div>
            {s?.finishedAt ? (
              <span className="tnum text-xs text-muted">
                {t('uzum.lastSync')}: {f.dateTime(s.finishedAt)}
              </span>
            ) : null}
          </div>
        )}

        {/* ── Tarix chuqurligi (backfill) ── */}
        {hasAccounts && !status.isError ? (
          <HistoryCoverageBlock
            history={s?.history}
            canManage={canManage}
            loading={backfill.isPending}
            onLoad={() => backfill.mutate(false)}
            onRescan={() => backfill.mutate(true)}
          />
        ) : null}

        {/* ── Tarix ── */}
        <div>
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <h4 className="font-display text-sm font-bold text-ink">{t('sync.history')}</h4>
            <span className="text-xs text-muted">{t('sync.historyHint')}</span>
          </div>
          <div className="-mx-5 overflow-x-auto sm:mx-0">
            {history.isError ? (
              <ErrorState message={errText(history.error)} onRetry={() => void history.refetch()} />
            ) : (
              <DataTable
                columns={columns}
                rows={rows}
                rowKey={(r) => r.id}
                loading={history.isLoading}
                density="compact"
                localSort={false}
                empty={<EmptyState icon={<History className="h-6 w-6" />} title={t('sync.historyEmpty')} />}
              />
            )}
          </div>
        </div>
      </CardBody>
    </Card>
  );
}
