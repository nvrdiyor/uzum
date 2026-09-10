import type { ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AtSign, Clock3, Globe, Lock, Phone, ShieldCheck, UserRound } from 'lucide-react';
import type { Lang } from '@savdoiq/shared';
import {
  Avatar,
  Badge,
  Card,
  CardBody,
  CardHeader,
  Divider,
  ErrorState,
  Select,
  Skeleton,
  toast,
} from '@/components/ui';
import { api } from '@/lib/api';
import { useSession } from '@/store/session';
import { useFormat, useLangStore, useT } from '@/i18n';
import { errText, TIMEZONES, type NotificationSettings } from './types';

/** Til tanlash uchun (Topbar bilan bir xil) */
const LANGS: { id: Lang; label: string; flag: string }[] = [
  { id: 'uz', label: "O'zbek", flag: '🇺🇿' },
  { id: 'ru', label: 'Русский', flag: '🇷🇺' },
  { id: 'en', label: 'English', flag: '🇬🇧' },
];

function ReadonlyField({ label, value, icon }: { label: string; value: ReactNode; icon: ReactNode }) {
  return (
    <div>
      <span className="label">{label}</span>
      <div className="flex items-center gap-2.5 rounded-xl border border-line bg-surface-2/60 px-3.5 py-2.5">
        <span className="text-muted">{icon}</span>
        <span className="min-w-0 flex-1 truncate text-sm text-ink">{value}</span>
        <Lock className="h-3.5 w-3.5 shrink-0 text-muted" />
      </div>
    </div>
  );
}

/** 1-bo'lim: profil — ma'lumot Telegram'dan, til va vaqt mintaqasi darhol saqlanadi */
export function ProfileSection() {
  const t = useT('settings');
  const f = useFormat();
  const qc = useQueryClient();
  const me = useSession((s) => s.me);
  const lang = useLangStore((s) => s.lang);
  const setLang = useLangStore((s) => s.setLang);

  const settings = useQuery({
    queryKey: ['notification-settings'],
    queryFn: () => api.get<NotificationSettings>('/notifications/settings'),
  });

  const save = useMutation({
    mutationFn: (body: NotificationSettings) => api.put<NotificationSettings>('/notifications/settings', body),
    onSuccess: (_res, body) => {
      qc.setQueryData<NotificationSettings>(['notification-settings'], (prev) => ({ ...(prev ?? {}), ...body }));
      void qc.invalidateQueries({ queryKey: ['notification-settings'] });
      toast.success(t('profile.saved'), t('profile.savedBody'));
    },
    onError: (err) => toast.error(t('profile.saveErr'), errText(err)),
  });

  const user = me?.user;
  const fullName = [user?.firstName, user?.lastName].filter(Boolean).join(' ').trim();
  const timezone = settings.data?.timezone ?? 'Asia/Tashkent';
  const tzOptions = TIMEZONES.includes(timezone) ? TIMEZONES : [timezone, ...TIMEZONES];

  const onLang = (next: Lang) => {
    setLang(next);
    save.mutate({ language: next });
  };

  return (
    <Card>
      <CardHeader
        icon={<UserRound className="h-4 w-4" />}
        title={t('profile.title')}
        subtitle={t('profile.subtitle')}
      />
      <CardBody className="space-y-5">
        {/* ── Shaxs kartochkasi ── */}
        <div className="flex flex-wrap items-center gap-4 rounded-2xl border border-line bg-surface-2/50 p-4">
          <Avatar src={user?.photoUrl} name={fullName || user?.username} size={64} />
          <div className="min-w-0 flex-1">
            <p className="truncate font-display text-lg font-extrabold text-ink">
              {fullName || user?.username || t('profile.none')}
            </p>
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              {user?.username ? <Badge tone="muted">@{user.username}</Badge> : null}
              <Badge tone={user?.role === 'admin' ? 'violet' : 'brand'} dot>
                {user?.role === 'admin' ? t('profile.role.admin') : t('profile.role.user')}
              </Badge>
              {user?.createdAt ? (
                <span className="text-xs text-muted">
                  {t('profile.joined')}: <span className="tnum">{f.date(user.createdAt)}</span>
                </span>
              ) : null}
            </div>
          </div>
        </div>

        {/* ── Faqat o'qish uchun maydonlar ── */}
        <div className="grid gap-4 sm:grid-cols-3">
          <ReadonlyField
            label={t('profile.name')}
            value={fullName || t('profile.none')}
            icon={<UserRound className="h-4 w-4" />}
          />
          <ReadonlyField
            label={t('profile.username')}
            value={user?.username ? `@${user.username}` : t('profile.none')}
            icon={<AtSign className="h-4 w-4" />}
          />
          <ReadonlyField
            label={t('profile.phone')}
            value={user?.phone || t('profile.none')}
            icon={<Phone className="h-4 w-4" />}
          />
        </div>
        <p className="flex items-start gap-2 text-xs text-muted">
          <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand" />
          {t('profile.readonlyHint')}
        </p>

        <Divider />

        {/* ── Til va vaqt mintaqasi ── */}
        {settings.isError ? (
          <ErrorState message={errText(settings.error)} onRetry={() => void settings.refetch()} />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <span className="label flex items-center gap-1.5">
                <Globe className="h-3.5 w-3.5" />
                {t('profile.lang')}
              </span>
              <Select value={lang} onChange={(e) => onLang(e.target.value as Lang)} disabled={save.isPending}>
                {LANGS.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.flag} {l.label}
                  </option>
                ))}
              </Select>
              <p className="mt-1.5 text-xs text-muted">{t('profile.langHint')}</p>
            </div>

            <div>
              <span className="label flex items-center gap-1.5">
                <Clock3 className="h-3.5 w-3.5" />
                {t('profile.tz')}
              </span>
              {settings.isLoading ? (
                <Skeleton className="h-[42px] w-full" />
              ) : (
                <Select
                  value={timezone}
                  onChange={(e) => save.mutate({ timezone: e.target.value })}
                  disabled={save.isPending}
                >
                  {tzOptions.map((tz) => (
                    <option key={tz} value={tz}>
                      {tz}
                    </option>
                  ))}
                </Select>
              )}
              <p className="mt-1.5 text-xs text-muted">{t('profile.tzHint')}</p>
            </div>
          </div>
        )}
      </CardBody>
    </Card>
  );
}
