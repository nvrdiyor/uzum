import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  Bell,
  BellRing,
  CalendarDays,
  CheckCircle2,
  ExternalLink,
  FileBarChart,
  Info,
  Inbox,
  PackageCheck,
  Send,
  CheckCheck,
  XCircle,
} from '@/components/icons';
import type { NotificationRow, Paginated } from '@savdoiq/shared';
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
  info: 'bg-info/10 text-info-ink',
  success: 'bg-brand/10 text-brand-ink',
  warning: 'bg-warn/10 text-warn-ink',
  danger: 'bg-danger/10 text-danger-ink',
} as const;

type ToggleKey = 'notifyDaily' | 'notifyOrders' | 'notifyStock' | 'notifyWeekly' | 'notifyMonthly';

/*
 * Haftalik va oylik hisobotni API ishchisi yuboradi (apps/api services/digest.ts):
 * raqamlar Boshqaruv paneli «O‘tgan hafta» va Oylik hisobot «O‘tgan oy» bilan
 * bir xil. Izohda QACHON va NIMA kelishi aytiladi — sotuvchi o'chirishdan oldin
 * nimadan voz kechayotganini bilsin.
 */
const TOGGLES: { key: ToggleKey; label: string; hint: string; icon: typeof Bell }[] = [
  { key: 'notifyDaily', label: 'notif.daily', hint: 'notif.dailyHint', icon: BellRing },
  { key: 'notifyWeekly', label: 'notif.weekly', hint: 'notif.weeklyHint', icon: CalendarDays },
  { key: 'notifyMonthly', label: 'notif.monthly', hint: 'notif.monthlyHint', icon: FileBarChart },
  { key: 'notifyOrders', label: 'notif.orders', hint: 'notif.ordersHint', icon: Send },
  { key: 'notifyStock', label: 'notif.stock', hint: 'notif.stockHint', icon: PackageCheck },
];

/** Ro'yxat: dastlab shuncha o'qilgan xabar, "Yana ko'rsatish" — yana shuncha */
const PAGE = 12;
const MORE = 20;

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

  /*
   * Tepadagi qo'ng'iroqchadagi son — serverdagi BARCHA o'qilmaganlar. Ilgari ro'yxat faqat eng yangi 30 tasidan 12 tasini
   * ko'rsatardi va "Hammasini o'qildi" shu 30 ta ichida o'qilmagan bo'lsagina chiqardi: eskiroq o'qilmagan xabarlar
   * ko'rinmas, belgilab ham bo'lmasdi, son esa turaverardi. Endi o'qilmaganlar alohida yuklanadi va tepada turadi
   */
  const sessionUnread = useSession((s) => s.me?.unreadNotifications ?? 0);
  const [limit, setLimit] = useState(PAGE);
  const unreadList = useQuery({
    queryKey: ['notifications', 'unread'],
    queryFn: async () => asItems<NotificationRow>(await api.get<Paginated<NotificationRow>>('/notifications?unread=1&pageSize=200')),
  });
  const list = useQuery({
    queryKey: ['notifications', 'recent', limit],
    queryFn: () => api.get<Paginated<NotificationRow>>(`/notifications?pageSize=${limit}`),
    placeholderData: keepPreviousData,
  });

  /** Barcha o'qilmagan xabarlarni birdaniga o'qilgan deb belgilash */
  const markAllRead = useMutation({
    mutationFn: () => api.post<{ count?: number }>('/notifications/read-all'),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['notifications'] });
      void reloadSession();
      toast.success(t('notif.allMarked'));
    },
    onError: (err) => toast.error(t('common.error'), errText(err)),
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

  // "Ochish" — xabar o'qilgan bo'ladi (ochib ko'rilgan xabar qo'ng'iroqchada sanalib qolmasin), keyin o'tiladi
  const navigate = useNavigate();
  const openNotification = async (n: NotificationRow) => {
    if (!n.read) {
      try {
        await api.post<unknown>(`/notifications/${n.id}/read`);
        void qc.invalidateQueries({ queryKey: ['notifications'] });
        void reloadSession();
      } catch {
        // O'qilgan deb belgilanmasa ham xabar ochilaversin
      }
    }
    if (!n.link) return;
    if (n.link.startsWith('/')) navigate(n.link);
    else window.location.assign(n.link);
  };

  const data = settings.data;
  const botOn = data?.telegramConnected ?? false;
  const botLink = data?.botLink || BOT_URL;
  const unreadRows = unreadList.data ?? [];
  const unreadIds = new Set(unreadRows.map((n) => n.id));
  const recent = asItems<NotificationRow>(list.data);
  // O'qilmaganlar (eskisi ham) tepada, keyin oxirgi o'qilganlar
  const rows = [...unreadRows, ...recent.filter((n) => !unreadIds.has(n.id) && n.read)];
  const recentTotal = list.data?.total ?? 0;
  const unread = Math.max(unreadRows.length, sessionUnread);
  const loading = list.isLoading || unreadList.isLoading;
  const failed = list.isError ? list.error : unreadList.isError ? unreadList.error : null;

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
              {TOGGLES.map((row) => (
                <Skeleton key={row.key} className="h-14 w-full" />
              ))}
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
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand/10 text-brand-ink">
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
              botOn ? 'border-brand/25 bg-brand/5' : 'border-warn/25 bg-warn/10',
            )}
          >
            <div className="flex min-w-0 items-start gap-3">
              <span
                className={cn(
                  'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl',
                  botOn ? 'bg-brand/10 text-brand-ink' : 'bg-warn/10 text-warn-ink',
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
        <CardHeader
          icon={<Inbox className="h-4 w-4" />}
          title={t('notif.list')}
          subtitle={t('notif.listHint')}
          actions={
            unread > 0 ? (
              <Button
                size="sm"
                variant="outline"
                icon={<CheckCheck className="h-3.5 w-3.5" />}
                loading={markAllRead.isPending}
                onClick={() => markAllRead.mutate()}
              >
                {t('notif.markAll', { n: unread })}
              </Button>
            ) : undefined
          }
        />
        <CardBody>
          {failed ? (
            <ErrorState
              message={errText(failed)}
              onRetry={() => {
                void list.refetch();
                void unreadList.refetch();
              }}
            />
          ) : loading ? (
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
                      n.read ? 'border-line bg-surface' : 'border-brand/25 bg-brand/5',
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
                        <Button size="sm" variant="ghost" onClick={() => void openNotification(n)}>
                          {t('notif.open')}
                        </Button>
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
          {/* Eski xabarlar ham ko'rinsin: yana 20 tadan */}
          {!failed && !loading && recentTotal > limit ? (
            <div className="mt-3 flex justify-center">
              <Button size="sm" variant="outline" loading={list.isFetching} onClick={() => setLimit((v) => v + MORE)}>
                {t('notif.more')}
              </Button>
            </div>
          ) : null}
        </CardBody>
      </Card>
    </div>
  );
}
