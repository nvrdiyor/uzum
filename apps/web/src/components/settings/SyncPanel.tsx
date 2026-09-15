import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { History, Loader2, PlayCircle, RefreshCw } from 'lucide-react';
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
import { useFormat, useLang, useT } from '@/i18n';
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

  const status = useQuery({
    queryKey: ['sync-status'],
    queryFn: () => api.get<SyncStatus>('/sync/status'),
    refetchInterval: (q) => {
      const s = q.state.data as SyncStatus | undefined;
      return s && (s.status === 'running' || s.status === 'queued') ? 5000 : 60_000;
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

  const s = status.data;
  const active = Boolean(s && (s.status === 'running' || s.status === 'queued'));
  const rows = (history.data ?? []).slice(0, 10);

  const columns: Column<SyncHistoryRow>[] = [
    {
      key: 'type',
      header: t('sync.col.type'),
      render: (r) => (
        <span className="text-sm font-medium text-ink">
          {r.type === 'full' ? t('sync.type.full') : r.type === 'incremental' ? t('sync.type.incremental') : (r.type ?? '—')}
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
          <div className="rounded-2xl border border-brand/25 bg-brand/[0.07] p-4">
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
              <span className="tnum">{t('sync.eta', { v: formatDuration(s.etaSeconds, lang) })}</span>
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
