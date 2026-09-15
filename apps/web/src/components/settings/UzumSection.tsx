import { useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  ExternalLink,
  Eye,
  EyeOff,
  KeyRound,
  Lock,
  PlusCircle,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Store,
  Trash2,
  UserRound,
} from 'lucide-react';
import type { UzumAccountSummary } from '@savdoiq/shared';
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  ErrorState,
  Input,
  Modal,
  Skeleton,
  toast,
  type Tone,
} from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { useSession } from '@/store/session';
import { useFormat, useT } from '@/i18n';
import { cn } from '@/lib/utils';
import { asItems, errText, maskKey } from './types';
import { SyncPanel } from './SyncPanel';

const SELLER_URL = 'https://seller.uzum.uz';

const STATUS_TONE: Record<UzumAccountSummary['status'], Tone> = {
  active: 'brand',
  pending: 'warn',
  invalid: 'danger',
  disabled: 'muted',
};

const GUIDE_STEPS = [
  { key: 's1', icon: ExternalLink },
  { key: 's2', icon: UserRound },
  { key: 's3', icon: KeyRound },
  { key: 's4', icon: PlusCircle },
  { key: 's5', icon: Copy },
] as const;

/** 3-bo'lim: Uzum kabinetlari — eng muhim sozlama */
export function UzumSection() {
  const t = useT('settings');
  const f = useFormat();
  const qc = useQueryClient();
  const limits = useSession((s) => s.me?.limits ?? null);

  const [addOpen, setAddOpen] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<UzumAccountSummary | null>(null);
  const [label, setLabel] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [touched, setTouched] = useState(false);
  const [limitHit, setLimitHit] = useState(false);

  const accounts = useQuery({
    queryKey: ['uzum-accounts'],
    queryFn: async () => asItems<UzumAccountSummary>(await api.get<UzumAccountSummary[]>('/uzum')),
  });

  const rows = useMemo(() => accounts.data ?? [], [accounts.data]);
  const max = limits?.cabinets ?? 1;
  const used = limits?.used.cabinets ?? rows.length;
  const unlimited = max >= 999;
  const full = !unlimited && used >= max;

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['uzum-accounts'] });
    void qc.invalidateQueries({ queryKey: ['sync-status'] });
    void qc.invalidateQueries({ queryKey: ['sync-history'] });
  };

  const connect = useMutation({
    mutationFn: (body: { label: string; apiKey: string }) => api.post<UzumAccountSummary>('/uzum', body),
    onSuccess: () => {
      toast.success(t('uzum.connected'), t('uzum.connectedBody'));
      setAddOpen(false);
      setLabel('');
      setApiKey('');
      setTouched(false);
      setShowKey(false);
      refresh();
    },
    onError: (err) => {
      if (err instanceof ApiError && err.isPlanLimit) setLimitHit(true);
      toast.error(t('uzum.connectErr'), errText(err));
    },
  });

  const test = useMutation({
    mutationFn: (id: string) => api.post<unknown>(`/uzum/${id}/test`),
    onSuccess: () => {
      toast.success(t('uzum.tested'));
      refresh();
    },
    onError: (err) => toast.error(t('uzum.testErr'), errText(err)),
  });

  const resync = useMutation({
    mutationFn: (id: string) => api.post<unknown>(`/uzum/${id}/resync`),
    onSuccess: () => {
      toast.success(t('uzum.resynced'));
      refresh();
    },
    onError: (err) => toast.error(t('uzum.resyncErr'), errText(err)),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.del<unknown>(`/uzum/${id}`),
    onSuccess: () => {
      toast.success(t('uzum.deleted'));
      setRemoveTarget(null);
      refresh();
    },
    onError: (err) => toast.error(t('uzum.deleteErr'), errText(err)),
  });

  const keyError = touched && apiKey.trim().length < 8 ? t('uzum.keyErr') : null;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (apiKey.trim().length < 8) return;
    connect.mutate({ label: label.trim() || t('uzum.labelDefault'), apiKey: apiKey.trim() });
  };

  return (
    <div className="grid gap-4 xl:grid-cols-3">
      {/* ── Chap: kabinetlar va sinxronizatsiya ── */}
      <div className="space-y-4 xl:col-span-2">
        <Card>
          <CardHeader
            icon={<KeyRound className="h-4 w-4" />}
            title={t('uzum.title')}
            subtitle={t('uzum.subtitle')}
            actions={
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={full ? 'warn' : 'muted'}>
                  {unlimited ? t('uzum.unlimited') : t('uzum.limit', { used, max })}
                </Badge>
                <Button
                  size="sm"
                  icon={<PlusCircle className="h-4 w-4" />}
                  disabled={full}
                  onClick={() => setAddOpen(true)}
                >
                  {t('uzum.add')}
                </Button>
              </div>
            }
          />

          <CardBody className="space-y-3">
            {full || limitHit ? (
              <div className="flex flex-wrap items-start gap-3 rounded-2xl border border-warn/25 bg-warn/10 p-4">
                <Lock className="mt-0.5 h-5 w-5 shrink-0 text-warn" />
                <div className="min-w-0 flex-1">
                  <p className="font-display text-sm font-bold text-ink">{t('uzum.limitFullTitle')}</p>
                  <p className="mt-1 text-sm text-ink-soft">{t('uzum.limitFullBody', { max })}</p>
                </div>
                <Link to="/pricing">
                  <Button size="sm" variant="outline" icon={<Sparkles className="h-3.5 w-3.5" />}>
                    {t('btn.upgrade')}
                  </Button>
                </Link>
              </div>
            ) : null}

            {accounts.isError ? (
              <ErrorState message={errText(accounts.error)} onRetry={() => void accounts.refetch()} />
            ) : accounts.isLoading ? (
              <div className="space-y-3">
                <Skeleton className="h-40 w-full" />
                <Skeleton className="h-40 w-full" />
              </div>
            ) : rows.length === 0 ? (
              <EmptyState
                icon={<KeyRound className="h-6 w-6" />}
                title={t('uzum.empty')}
                hint={t('uzum.emptyHint')}
                action={
                  <Button icon={<PlusCircle className="h-4 w-4" />} onClick={() => setAddOpen(true)}>
                    {t('uzum.add')}
                  </Button>
                }
              />
            ) : (
              rows.map((a) => (
                <div key={a.id} className="rounded-2xl border border-line bg-surface-2/40 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex min-w-0 items-start gap-3">
                      <div
                        className={cn(
                          'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl',
                          a.status === 'invalid' ? 'bg-danger/[0.12] text-danger' : 'bg-brand/[0.12] text-brand',
                        )}
                      >
                        <KeyRound className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <p className="truncate font-display text-base font-bold text-ink">{a.label}</p>
                        <p className="tnum mt-0.5 text-xs text-muted">{maskKey(a.keyHint)}</p>
                      </div>
                    </div>
                    <Badge tone={STATUS_TONE[a.status]} dot>
                      {t(`uzum.status.${a.status}`)}
                    </Badge>
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
                    <Meta
                      label={t('uzum.lastSync')}
                      value={a.lastSyncAt ? f.dateTime(a.lastSyncAt) : t('uzum.never')}
                    />
                    <Meta
                      label={t('uzum.nextSync')}
                      value={a.nextSyncAt ? f.dateTime(a.nextSyncAt) : '—'}
                    />
                    <Meta
                      label={t('uzum.stores')}
                      value={
                        <span className="inline-flex items-center gap-1.5">
                          <Store className="h-3.5 w-3.5 text-muted" />
                          {f.num(a.storesCount)}
                        </span>
                      }
                    />
                  </div>

                  {a.lastError ? (
                    <div className="mt-3 flex items-start gap-2.5 rounded-xl border border-danger/25 bg-danger/10 p-3">
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-danger" />
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-danger">{t('uzum.errorTitle')}</p>
                        <p className="mt-0.5 break-words text-xs text-ink-soft">{a.lastError}</p>
                      </div>
                    </div>
                  ) : null}

                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      icon={<CheckCircle2 className="h-3.5 w-3.5" />}
                      loading={test.isPending && test.variables === a.id}
                      onClick={() => test.mutate(a.id)}
                    >
                      {t('uzum.test')}
                    </Button>
                    <Button
                      size="sm"
                      variant="soft"
                      icon={<RefreshCw className="h-3.5 w-3.5" />}
                      loading={resync.isPending && resync.variables === a.id}
                      onClick={() => resync.mutate(a.id)}
                    >
                      {t('uzum.resync')}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-danger hover:bg-danger/10"
                      icon={<Trash2 className="h-3.5 w-3.5" />}
                      onClick={() => setRemoveTarget(a)}
                    >
                      {t('uzum.delete')}
                    </Button>
                  </div>
                </div>
              ))
            )}
          </CardBody>
        </Card>

        <SyncPanel hasAccounts={rows.length > 0} />
      </div>

      {/* ── O'ng: yo'riqnoma va xavfsizlik ── */}
      <div className="space-y-4">
        <Card>
          <CardHeader
            icon={<Sparkles className="h-4 w-4" />}
            title={t('guide.title')}
            subtitle={t('guide.subtitle')}
          />
          <CardBody className="space-y-3">
            <ol className="space-y-3">
              {GUIDE_STEPS.map((s, i) => {
                const Icon = s.icon;
                return (
                  <li key={s.key} className="flex gap-3">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-brand/[0.12] font-display text-xs font-extrabold text-brand">
                      {i + 1}
                    </span>
                    <div className="min-w-0">
                      <p className="flex items-center gap-1.5 text-sm font-semibold text-ink">
                        <Icon className="h-3.5 w-3.5 text-muted" />
                        {t(`guide.${s.key}`)}
                      </p>
                      <p className="mt-0.5 text-xs text-muted">{t(`guide.${s.key}d`)}</p>
                    </div>
                  </li>
                );
              })}
            </ol>
            <a href={SELLER_URL} target="_blank" rel="noreferrer" className="block">
              <Button variant="outline" className="w-full" iconRight={<ExternalLink className="h-3.5 w-3.5" />}>
                {t('guide.open')}
              </Button>
            </a>
          </CardBody>
        </Card>

        <Card className="overflow-hidden bg-aurora">
          <CardHeader icon={<ShieldCheck className="h-4 w-4" />} title={t('sec.title')} />
          <CardBody className="space-y-3">
            <p className="text-sm text-ink-soft">{t('sec.body')}</p>
            <ul className="space-y-2">
              {(['p1', 'p2', 'p3'] as const).map((k) => (
                <li key={k} className="flex items-center gap-2 text-sm text-ink-soft">
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-brand" />
                  {t(`sec.${k}`)}
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      </div>

      {/* ── Kabinet qo'shish ── */}
      <Modal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title={t('uzum.addTitle')}
        description={t('uzum.addDesc')}
      >
        <form id="uzum-add-form" onSubmit={submit} className="space-y-4">
          <div>
            <span className="label">{t('uzum.label')}</span>
            <Input value={label} placeholder={t('uzum.labelPh')} onChange={(e) => setLabel(e.target.value)} />
          </div>

          <div>
            <span className="label">{t('uzum.key')}</span>
            <div className="relative">
              <Input
                type={showKey ? 'text' : 'password'}
                value={apiKey}
                autoComplete="off"
                spellCheck={false}
                placeholder={t('uzum.keyPh')}
                className="pr-11 font-mono"
                onChange={(e) => setApiKey(e.target.value)}
                onBlur={() => setTouched(true)}
              />
              <button
                type="button"
                aria-label={showKey ? t('uzum.hide') : t('uzum.show')}
                title={showKey ? t('uzum.hide') : t('uzum.show')}
                onClick={() => setShowKey((v) => !v)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-muted transition-colors hover:text-ink"
              >
                {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {keyError ? <p className="mt-1.5 text-xs text-danger">{keyError}</p> : null}
          </div>

          <div className="flex items-start gap-2.5 rounded-xl border border-line bg-surface-2/60 p-3">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
            <p className="text-xs text-muted">{t('sec.body')}</p>
          </div>
        </form>
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <Button variant="ghost" type="button" onClick={() => setAddOpen(false)}>
            {t('btn.cancel')}
          </Button>
          <Button
            type="submit"
            form="uzum-add-form"
            loading={connect.isPending}
            icon={<KeyRound className="h-4 w-4" />}
          >
            {t('uzum.connect')}
          </Button>
        </div>
      </Modal>

      {/* ── O'chirishni tasdiqlash ── */}
      <Modal
        open={Boolean(removeTarget)}
        onClose={() => setRemoveTarget(null)}
        title={t('uzum.deleteTitle')}
        size="sm"
      >
        <p className="text-sm text-ink-soft">{t('uzum.deleteDesc', { label: removeTarget?.label ?? '' })}</p>
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <Button variant="ghost" onClick={() => setRemoveTarget(null)}>
            {t('btn.cancel')}
          </Button>
          <Button
            variant="danger"
            icon={<Trash2 className="h-4 w-4" />}
            loading={remove.isPending}
            onClick={() => removeTarget && remove.mutate(removeTarget.id)}
          >
            {t('uzum.delete')}
          </Button>
        </div>
      </Modal>
    </div>
  );
}

function Meta({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="truncate text-2xs font-semibold uppercase tracking-wider text-muted">{label}</p>
      <p className="tnum mt-0.5 truncate text-sm font-medium text-ink">{value}</p>
    </div>
  );
}
