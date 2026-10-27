import { useMemo, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  MEMBER_VIEWS,
  asMemberView,
  viewSeesMoney,
  type MemberView,
  type TeamInviteCreated,
  type TeamInviteRow,
  type TeamMemberRow,
} from '@savdoiq/shared';
import {
  AlertTriangle,
  AtSign,
  Ban,
  Copy,
  Crown,
  Eye,
  EyeOff,
  Link2,
  Send,
  Sparkles,
  Trash2,
  UserPlus,
  Users,
} from '@/components/icons';
import {
  Avatar,
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  ErrorState,
  Input,
  Modal,
  ProgressBar,
  Select,
  Skeleton,
  toast,
} from '@/components/ui';
import { api } from '@/lib/api';
import { copyToClipboard, cn } from '@/lib/utils';
import { useFormat, useT } from '@/i18n';
import { ROLE_TONE } from './CompanySwitcher';
import './i18n';

type InviteRole = 'manager' | 'viewer';
/** Select qiymati: 'full' — shablonsiz (null) */
type ViewChoice = MemberView | 'full';

const VIEW_CHOICES: ViewChoice[] = ['full', ...MEMBER_VIEWS];
const INVITE_ROLES: InviteRole[] = ['manager', 'viewer'];

const toChoice = (v: MemberView | null | undefined): ViewChoice => v ?? 'full';
const fromChoice = (v: ViewChoice): MemberView | null => (v === 'full' ? null : v);

export function errText(err: unknown): string | undefined {
  return err instanceof Error ? err.message : undefined;
}

/** A'zolar va takliflar keshini birga yangilash (sessiyadagi limit soni ham shu ro'yxatdan) */
function useTeamRefresh() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: ['company-members'] });
    void qc.invalidateQueries({ queryKey: ['company-invites'] });
  };
}

// ─────────────────────────── Rol + ko'rinish maydonlari ───────────────────────────

function RoleViewFields({
  role,
  view,
  onRole,
  onView,
}: {
  role: InviteRole;
  view: ViewChoice;
  onRole: (r: InviteRole) => void;
  onView: (v: ViewChoice) => void;
}) {
  const t = useT('team');
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="min-w-0">
        <span className="label">{t('role.label')}</span>
        <Select value={role} onChange={(e) => onRole(e.target.value as InviteRole)}>
          {INVITE_ROLES.map((r) => (
            <option key={r} value={r}>
              {t(`role.${r}`)}
            </option>
          ))}
        </Select>
        <p className="mt-1.5 text-xs text-muted">{t(`roleHint.${role}`)}</p>
      </div>
      <div className="min-w-0">
        <span className="label">{t('view.label')}</span>
        <Select value={view} onChange={(e) => onView(e.target.value as ViewChoice)}>
          {VIEW_CHOICES.map((v) => (
            <option key={v} value={v}>
              {t(`view.${v}`)}
            </option>
          ))}
        </Select>
        <p className="mt-1.5 text-xs text-muted">{t(`viewHint.${view}`)}</p>
      </div>
    </div>
  );
}

// ─────────────────────────── Limit ───────────────────────────

export function LimitCard({ used, max, isOwner }: { used: number; max: number; isOwner: boolean }) {
  const t = useT('team');
  const tc = useT('common');
  const full = used >= max;
  return (
    <Card tone={full ? 'warn' : undefined}>
      <CardBody className="space-y-3">
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-sm font-semibold text-ink">{t('limit.title')}</p>
          <p className="tnum text-sm font-bold text-ink">{t('limit', { used, max })}</p>
        </div>
        <ProgressBar value={max > 0 ? (used / max) * 100 : 100} tone={full ? 'warn' : 'brand'} />
        <p className={cn('text-xs', full ? 'text-warn-ink' : 'text-muted')}>
          {full ? t('limit.full') : t('limit.free', { n: Math.max(0, max - used) })}
        </p>
        {full && isOwner ? (
          <Link to="/pricing" className="inline-block">
            <Button size="sm" variant="outline" icon={<Sparkles className="h-3.5 w-3.5" />}>
              {tc('btn.upgrade')}
            </Button>
          </Link>
        ) : null}
      </CardBody>
    </Card>
  );
}

// ─────────────────────────── A'zolar ───────────────────────────

export function MembersCard({
  rows,
  isOwner,
  loading,
  error,
  onRetry,
}: {
  rows: TeamMemberRow[];
  isOwner: boolean;
  loading: boolean;
  error: unknown;
  onRetry: () => void;
}) {
  const t = useT('team');
  const tc = useT('common');
  const f = useFormat();
  const refresh = useTeamRefresh();
  const [removeTarget, setRemoveTarget] = useState<TeamMemberRow | null>(null);

  // Rol yoki ko'rinish — darhol saqlanadi (Sozlamalardagi eski ro'yxatdagi kabi)
  const patch = useMutation({
    mutationFn: (vars: { id: string; body: { role?: InviteRole; view?: MemberView | null } }) =>
      api.patch<TeamMemberRow>(`/company/members/${vars.id}`, vars.body),
    onSuccess: () => {
      toast.success(t('saved'));
      refresh();
    },
    onError: (err) => toast.error(t('save.err'), errText(err)),
  });

  const remove = useMutation({
    mutationFn: (m: TeamMemberRow) => api.del<unknown>(`/company/members/${m.id}`),
    onSuccess: () => {
      toast.success(t('remove.done'));
      setRemoveTarget(null);
      refresh();
    },
    onError: (err) => toast.error(t('remove.err'), errText(err)),
  });

  return (
    <Card>
      <CardHeader icon={<Users className="h-4 w-4" />} title={t('members.title')} subtitle={isOwner ? t('members.subtitle') : t('ownerOnly')} />
      <CardBody>
        {error ? (
          <ErrorState message={errText(error)} onRetry={onRetry} />
        ) : loading ? (
          <div className="space-y-2.5">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        ) : (
          <ul className="space-y-2">
            {rows.map((m) => {
              const isRowOwner = m.role === 'owner';
              const editable = isOwner && !isRowOwner;
              const view = isRowOwner ? null : asMemberView(m.view);
              const busy = patch.isPending && patch.variables?.id === m.id;
              return (
                <li key={m.id} className="flex flex-wrap items-center gap-3 rounded-2xl border border-line bg-surface-2/40 p-3.5">
                  <Avatar src={m.photoUrl} name={m.name} size={40} />
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-ink">
                      <span className="truncate">{m.name}</span>
                      {isRowOwner ? <Crown className="h-3.5 w-3.5 text-warn" /> : null}
                      {m.isSelf ? <Badge tone="brand">{t('you')}</Badge> : null}
                    </p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted">
                      {m.username ? <span>@{m.username}</span> : null}
                      <span className="tnum">
                        {t('joined')}: {f.date(m.createdAt)}
                      </span>
                    </p>
                  </div>

                  {editable ? (
                    // Telefonda ikkala ro'yxat butun qatorda (nomi kesilmasin), "Chiqarish" — keyingi qatorda o'ngda
                    <div className="flex w-full flex-wrap items-center justify-end gap-2 sm:w-auto sm:flex-nowrap">
                      <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto">
                        <Select
                          value={m.role}
                          aria-label={t('role.label')}
                          className="h-9 py-1.5 text-xs sm:w-[130px]"
                          disabled={busy}
                          onChange={(e) => patch.mutate({ id: m.id, body: { role: e.target.value as InviteRole } })}
                        >
                          {INVITE_ROLES.map((r) => (
                            <option key={r} value={r}>
                              {t(`role.${r}`)}
                            </option>
                          ))}
                        </Select>
                        <Select
                          value={toChoice(view)}
                          aria-label={t('view.label')}
                          title={t(`viewHint.${toChoice(view)}`)}
                          className="h-9 py-1.5 text-xs sm:w-[140px]"
                          disabled={busy}
                          onChange={(e) =>
                            patch.mutate({ id: m.id, body: { view: fromChoice(e.target.value as ViewChoice) } })
                          }
                        >
                          {VIEW_CHOICES.map((v) => (
                            <option key={v} value={v}>
                              {t(`view.${v}`)}
                            </option>
                          ))}
                        </Select>
                      </div>
                      {!m.isSelf ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-danger-ink hover:bg-danger/10"
                          icon={<Trash2 className="h-3.5 w-3.5" />}
                          onClick={() => setRemoveTarget(m)}
                        >
                          {t('remove')}
                        </Button>
                      ) : null}
                    </div>
                  ) : (
                    <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                      {view ? <Badge tone="violet">{t(`view.${view}`)}</Badge> : null}
                      <Badge tone={ROLE_TONE[m.role] ?? 'muted'} dot>
                        {t(`role.${m.role}`)}
                      </Badge>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </CardBody>

      <Modal open={Boolean(removeTarget)} onClose={() => setRemoveTarget(null)} title={t('remove.title')} size="sm">
        <p className="text-sm text-ink-soft">{t('remove.desc', { name: removeTarget?.name ?? '' })}</p>
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <Button variant="ghost" onClick={() => setRemoveTarget(null)}>
            {tc('btn.cancel')}
          </Button>
          <Button
            variant="danger"
            icon={<Trash2 className="h-4 w-4" />}
            loading={remove.isPending}
            onClick={() => removeTarget && remove.mutate(removeTarget)}
          >
            {t('remove')}
          </Button>
        </div>
      </Modal>
    </Card>
  );
}

// ─────────────────────────── Taklif havolasi ───────────────────────────

/**
 * Havola faqat yaratilgan javobda keladi (server xeshini saqlaydi) — shu
 * komponent holatida turadi va sahifadan chiqilganda yo'qoladi. Shuning uchun
 * "faqat hozir ko'rsatiladi" ogohlantirishi va nusxa olish tugmasi yonma-yon.
 */
export function InviteLinkCard({ full }: { full: boolean }) {
  const t = useT('team');
  const refresh = useTeamRefresh();
  const inputRef = useRef<HTMLInputElement>(null);
  const [role, setRole] = useState<InviteRole>('manager');
  const [view, setView] = useState<ViewChoice>('full');
  const [created, setCreated] = useState<TeamInviteCreated | null>(null);
  const [copied, setCopied] = useState(false);

  const create = useMutation({
    mutationFn: () => api.post<TeamInviteCreated>('/company/invites', { role, view: fromChoice(view) }),
    onSuccess: (data) => {
      setCreated(data);
      setCopied(false);
      refresh();
    },
    onError: (err) => toast.error(t('link.createErr'), errText(err)),
  });

  const shareUrl = useMemo(
    () => (created ? `https://t.me/share/url?url=${encodeURIComponent(created.url)}` : ''),
    [created],
  );

  const copy = () => {
    if (!created) return;
    copyToClipboard(created.url)
      .then(() => {
        setCopied(true);
        toast.success(t('link.copied'));
      })
      .catch(() => {
        inputRef.current?.select();
        toast.error(t('link.copyErr'));
      });
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    create.mutate();
  };

  return (
    <Card tone="brand">
      <CardHeader icon={<Link2 className="h-4 w-4" />} title={t('link.title')} subtitle={t('link.subtitle')} />
      <CardBody className="space-y-4">
        {created ? (
          <div className="space-y-3">
            <div className="rounded-xl border border-brand/30 bg-brand/5 p-3">
              <p className="text-xs font-semibold text-brand-ink">{t('link.ready')}</p>
              <div className="mt-2 flex gap-2">
                <Input
                  ref={inputRef}
                  readOnly
                  value={created.url}
                  aria-label={t('link.title')}
                  onFocus={(e) => e.currentTarget.select()}
                  className="min-w-0 flex-1 font-mono text-xs"
                />
                <Button type="button" onClick={copy} icon={<Copy className="h-4 w-4" />} className="shrink-0">
                  <span className="hidden sm:inline">{copied ? t('link.copied') : t('link.copy')}</span>
                </Button>
              </div>
              <div className="mt-2.5 flex flex-wrap gap-1.5">
                <Badge tone="info">{t(`role.${created.invite.role}`)}</Badge>
                <Badge tone="violet">{t(`view.${toChoice(created.invite.view)}`)}</Badge>
              </div>
            </div>
            <p className="flex items-start gap-2 text-xs leading-relaxed text-warn-ink">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {t('link.once')}
            </p>
            <div className="flex flex-wrap gap-2">
              <a href={shareUrl} target="_blank" rel="noreferrer">
                <Button type="button" size="sm" variant="outline" icon={<Send className="h-3.5 w-3.5" />}>
                  {t('link.share')}
                </Button>
              </a>
              <Button type="button" size="sm" variant="ghost" onClick={() => setCreated(null)}>
                {t('link.another')}
              </Button>
            </div>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <RoleViewFields role={role} view={view} onRole={setRole} onView={setView} />
            <Button type="submit" loading={create.isPending} disabled={full} icon={<Link2 className="h-4 w-4" />}>
              {t('link.create')}
            </Button>
          </form>
        )}
      </CardBody>
    </Card>
  );
}

// ─────────────────────────── Username bo'yicha ───────────────────────────

export function AddByUsernameCard({ full }: { full: boolean }) {
  const t = useT('team');
  const refresh = useTeamRefresh();
  const [username, setUsername] = useState('');
  const [touched, setTouched] = useState(false);
  const [role, setRole] = useState<InviteRole>('manager');
  const [view, setView] = useState<ViewChoice>('full');

  const add = useMutation({
    mutationFn: (body: { username: string; role: InviteRole; view: MemberView | null }) =>
      api.post<TeamMemberRow>('/company/members', body),
    onSuccess: () => {
      toast.success(t('user.added'));
      setUsername('');
      setTouched(false);
      refresh();
    },
    onError: (err) => toast.error(t('user.addErr'), errText(err)),
  });

  const clean = username.trim().replace(/^@/, '');
  const invalid = touched && clean.length < 2;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (clean.length < 2) return;
    add.mutate({ username: clean, role, view: fromChoice(view) });
  };

  return (
    <Card>
      <CardHeader icon={<UserPlus className="h-4 w-4" />} title={t('user.title')} subtitle={t('user.subtitle')} />
      <CardBody>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <span className="label">{t('user.label')}</span>
            <div className="relative">
              <AtSign className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
              <Input
                value={username}
                className="pl-9"
                autoComplete="off"
                placeholder={t('user.ph')}
                onChange={(e) => setUsername(e.target.value)}
                onBlur={() => setTouched(true)}
              />
            </div>
            {invalid ? <p className="mt-1.5 text-xs text-danger">{t('user.err')}</p> : null}
          </div>
          <RoleViewFields role={role} view={view} onRole={setRole} onView={setView} />
          <Button type="submit" variant="outline" loading={add.isPending} disabled={full} icon={<UserPlus className="h-4 w-4" />}>
            {t('user.add')}
          </Button>
        </form>
      </CardBody>
    </Card>
  );
}

// ─────────────────────────── Faol takliflar ───────────────────────────

export function InvitesCard({
  rows,
  loading,
  error,
  onRetry,
}: {
  rows: TeamInviteRow[];
  loading: boolean;
  error: unknown;
  onRetry: () => void;
}) {
  const t = useT('team');
  const tc = useT('common');
  const f = useFormat();
  const refresh = useTeamRefresh();
  const [target, setTarget] = useState<TeamInviteRow | null>(null);

  const revoke = useMutation({
    mutationFn: (row: TeamInviteRow) => api.del<unknown>(`/company/invites/${row.id}`),
    onSuccess: () => {
      toast.success(t('invites.revoked'));
      setTarget(null);
      refresh();
    },
    onError: (err) => toast.error(t('invites.revokeErr'), errText(err)),
  });

  return (
    <Card>
      <CardHeader icon={<Link2 className="h-4 w-4" />} title={t('invites.title')} subtitle={t('invites.subtitle')} />
      <CardBody>
        {error ? (
          <ErrorState message={errText(error)} onRetry={onRetry} />
        ) : loading ? (
          <Skeleton className="h-14 w-full" />
        ) : rows.length === 0 ? (
          <EmptyState className="py-6" icon={<Link2 className="h-6 w-6" />} title={t('invites.empty')} />
        ) : (
          <ul className="space-y-2">
            {rows.map((row) => (
              <li key={row.id} className="flex flex-wrap items-center gap-2.5 rounded-xl border border-line bg-surface-2/40 px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge tone="info">{t(`role.${row.role}`)}</Badge>
                    <Badge tone="violet">{t(`view.${toChoice(row.view)}`)}</Badge>
                  </div>
                  <p className="tnum mt-1 text-xs text-muted">
                    {t('invites.expires', { date: f.date(row.expiresAt) })}
                    {row.createdBy ? ` · ${t('invites.by', { name: row.createdBy })}` : ''}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-danger-ink hover:bg-danger/10"
                  icon={<Ban className="h-3.5 w-3.5" />}
                  onClick={() => setTarget(row)}
                >
                  {t('invites.revoke')}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardBody>

      <Modal open={Boolean(target)} onClose={() => setTarget(null)} title={t('invites.revokeTitle')} size="sm">
        <p className="text-sm text-ink-soft">{t('invites.revokeDesc')}</p>
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <Button variant="ghost" onClick={() => setTarget(null)}>
            {tc('btn.cancel')}
          </Button>
          <Button
            variant="danger"
            icon={<Ban className="h-4 w-4" />}
            loading={revoke.isPending}
            onClick={() => target && revoke.mutate(target)}
          >
            {t('invites.revoke')}
          </Button>
        </div>
      </Modal>
    </Card>
  );
}

// ─────────────────────────── Shablonlar izohi ───────────────────────────

export function ViewsLegend() {
  const t = useT('team');
  return (
    <Card>
      <CardHeader icon={<Eye className="h-4 w-4" />} title={t('views.title')} subtitle={t('views.subtitle')} />
      <CardBody>
        <ul className="space-y-3">
          {VIEW_CHOICES.map((v) => {
            const money = viewSeesMoney(fromChoice(v));
            return (
              <li key={v} className="flex gap-3">
                <span
                  className={cn(
                    'mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg',
                    money ? 'bg-brand/10 text-brand-ink' : 'bg-surface-3 text-muted',
                  )}
                  title={money ? t('views.money') : t('views.noMoney')}
                >
                  {money ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                </span>
                <span className="min-w-0">
                  <span className="flex flex-wrap items-center gap-1.5 text-sm font-semibold text-ink">
                    {t(`view.${v}`)}
                    <span className={cn('chip', money ? 'bg-brand/10 text-brand-ink' : 'bg-surface-3 text-muted')}>
                      {money ? t('views.money') : t('views.noMoney')}
                    </span>
                  </span>
                  <span className="mt-0.5 block text-xs leading-relaxed text-muted">{t(`viewHint.${v}`)}</span>
                </span>
              </li>
            );
          })}
        </ul>
      </CardBody>
    </Card>
  );
}
