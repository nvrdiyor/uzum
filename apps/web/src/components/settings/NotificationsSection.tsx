import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  Bell,
  BellRing,
  CheckCircle2,
  ExternalLink,
  Info,
  Inbox,
  PackageCheck,
  Send,
  XCircle,
} from 'lucide-react';
import type { NotificationRow } from '@savdoiq/shared';
import { APP } from '@savdoiq/shared';
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  Divider,
  EmptyState,
  ErrorState,
  Skeleton,
  Toggle,
  toast,
} from '@/components/ui';
import { BOT_URL as BOT_URL_SHARED } from '@/lib/bot';
import { api } from '@/lib/api';
import { useSession } from '@/store/session';
import { useFormat, useT } from '@/i18n';
import { cn } from '@/lib/utils';
import { asItems, errText, type NotificationSettings } from './types';

const BOT_URL = BOT_URL_SHARED;

const LEVEL_ICON = {
  info: Info,
  success: CheckCircle2,
  warning: AlertTriangle,
  danger: XCircle,
} as const;

const LEVEL_STYLE = {
  info: 'bg-info/12 text-info',
  success: 'bg-brand/12 text-brand',
  warning: 'bg-warn/14 text-warn',
  danger: 'bg-danger/12 text-danger',
} as const;

type ToggleKey = 'notifyDaily' | 'notifyOrders' | 'notifyStock';

const TOGGLES: { key: ToggleKey; label: string; hint: string; icon: typeof Bell }[] = [
  { key: 'notifyDaily', label: 'notif.daily', hint: 'notif.dailyHint', icon: BellRing },
  { key: 'notifyOrders', label: 'notif.orders', hint: 'notif.ordersHint', icon: Send },
  { key: 'notifyStock', label: 'notif.stock', hint: 'notif.stockHint', icon: PackageCheck },
];

/** 4-bo'lim: bildirishnomalar — Telegram sozlamalari va xabarlar tarixi */
export function NotificationsSection() {
  const t = useT('settings');
  const f = useFormat();
  const qc = useQueryClient();
  const reloadSession = useSession((s) => s.load);

  const settings = useQuery({
    queryKey: ['notification-settings'],
    queryFn: () => api.get<NotificationSettings>('/notifications/settings'),
  });

  const save = useMutation({
    mutationFn: (body: NotificationSettings) => api.put<NotificationSettings>('/notifications/settings', body),
    onMutate: (body) => {
      qc.setQueryData<NotificationSettings>(['notification-settings'], (prev) => ({ ...(prev ?? {}), ...body }));
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['notification-settings'] });
      toast.success(t('notif.saved'));
    },
    onError: (err) => {
      void qc.invalidateQueries({ queryKey: ['notification-settings'] });
      toast.error(t('notif.saveErr'), errText(err));
    },
  });

  const list = useQuery({
    queryKey: ['notifications'],
    queryFn: async () => asItems<NotificationRow>(await api.get<NotificationRow[]>('/notifications')),
  });

  const markRead = useMutation({
    mutationFn: (id: string) => api.post<unknown>(`/notifications/${id}/read`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['notifications'] });
      void reloadSession();
      toast.success(t('notif.marked'));
    },
    onError: (err) => toast.error(t('common.error'), errText(err)),
  });

  const data = settings.data;
  const botOn = data?.telegramConnected ?? false;
  const botLink = data?.botLink || BOT_URL;
  const rows = (list.data ?? []).slice(0, 12);

  return (
    <div className="space-y-4">
      {/* ── Sozlamalar ── */}
      <Card>
        <CardHeader icon={<Bell className="h-4 w-4" />} title={t('notif.title')} subtitle={t('notif.subtitle')} />
        <CardBody className="space-y-5">
          {settings.isError ? (
            <ErrorState message={errText(settings.error)} onRetry={() => void settings.refetch()} />
          ) : settings.isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-14 w-full" />
              <Skeleton className="h-14 w-full" />
              <Skeleton className="h-14 w-full" />
            </div>
          ) : (
            <div className="space-y-1">
              {TOGGLES.map((row) => {
                const Icon = row.icon;
                const checked = data?.[row.key] ?? true;
                return (
                  <div
                    key={row.key}
                    className="flex items-center gap-3 rounded-xl px-1 py-3 transition-colors hover:bg-surface-2/60"
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand/10 text-brand">
                      <Icon className="h-4 w-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <Toggle
                        checked={checked}
                        onChange={(v) => {
                          const patch: NotificationSettings = {};
                          patch[row.key] = v;
                          save.mutate(patch);
                        }}
                        label={t(row.label)}
                        hint={t(row.hint)}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <Divider />

          {/* ── Telegram bot holati ── */}
          <div
            className={cn(
              'flex flex-wrap items-center justify-between gap-3 rounded-2xl border p-4',
              botOn ? 'border-brand/25 bg-brand/[0.07]' : 'border-warn/25 bg-warn/10',
            )}
          >
            <div className="flex min-w-0 items-start gap-3">
              <span
                className={cn(
                  'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl',
                  botOn ? 'bg-brand/15 text-brand' : 'bg-warn/15 text-warn',
                )}
              >
                <Send className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-ink">
                  {t('notif.bot')}
                  <Badge tone={botOn ? 'brand' : 'warn'} dot>
                    {botOn ? t('notif.botOn') : t('notif.botOff')}
                  </Badge>
                </p>
                <p className="mt-0.5 text-xs text-muted">{botOn ? t('notif.botOnHint') : t('notif.botOffHint')}</p>
              </div>
            </div>
            <a href={botLink} target="_blank" rel="noreferrer">
              <Button size="sm" variant={botOn ? 'outline' : 'primary'} iconRight={<ExternalLink className="h-3.5 w-3.5" />}>
                {t('notif.openBot')}
              </Button>
            </a>
          </div>
        </CardBody>
      </Card>

      {/* ── Xabarlar tarixi ── */}
      <Card>
        <CardHeader icon={<Inbox className="h-4 w-4" />} title={t('notif.list')} subtitle={t('notif.listHint')} />
        <CardBody>
          {list.isError ? (
            <ErrorState message={errText(list.error)} onRetry={() => void list.refetch()} />
          ) : list.isLoading ? (
            <div className="space-y-2.5">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : rows.length === 0 ? (
            <EmptyState icon={<Inbox className="h-6 w-6" />} title={t('notif.listEmpty')} hint={t('notif.listEmptyHint')} />
          ) : (
            <ul className="space-y-2">
              {rows.map((n) => {
                const Icon = LEVEL_ICON[n.type] ?? Info;
                return (
                  <li
                    key={n.id}
                    className={cn(
                      'flex flex-wrap items-start gap-3 rounded-2xl border p-3.5 transition-colors sm:flex-nowrap',
                      n.read ? 'border-line bg-surface' : 'border-brand/25 bg-brand/[0.05]',
                    )}
                  >
                    <span
                      className={cn(
                        'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl',
                        LEVEL_STYLE[n.type] ?? LEVEL_STYLE.info,
                      )}
                    >
                      <Icon className="h-4 w-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-ink">
                        {n.title}
                        {!n.read ? <Badge tone="brand">{t('notif.unread')}</Badge> : null}
                      </p>
                      {n.body ? <p className="mt-0.5 text-sm text-ink-soft">{n.body}</p> : null}
                      <p className="tnum mt-1 text-xs text-muted">{f.dateTime(n.createdAt)}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {n.link ? (
                        <a href={n.link}>
                          <Button size="sm" variant="ghost">
                            {t('notif.open')}
                          </Button>
                        </a>
                      ) : null}
                      {!n.read ? (
                        <Button
                          size="sm"
                          variant="outline"
                          loading={markRead.isPending && markRead.variables === n.id}
                          onClick={() => markRead.mutate(n.id)}
                        >
                          {t('notif.markRead')}
                        </Button>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
