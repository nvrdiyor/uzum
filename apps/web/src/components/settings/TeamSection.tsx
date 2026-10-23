import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AtSign, Crown, Lock, Sparkles, Trash2, UserPlus, Users } from '@/components/icons';
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
  Select,
  Skeleton,
  toast,
  type Tone,
} from '@/components/ui';
import { api } from '@/lib/api';
import { useSession } from '@/store/session';
import { useFormat, useT } from '@/i18n';
import { asMembers, errText, memberName, MEMBER_ROLES, type MemberRole, type MemberRow } from './types';

const ROLE_TONE: Record<string, Tone> = {
  owner: 'brand',
  manager: 'info',
  viewer: 'muted',
};

/** 5-bo'lim: jamoa — a'zolar, rollar va tarif limiti */
export function TeamSection() {
  const t = useT('settings');
  const f = useFormat();
  const qc = useQueryClient();
  const me = useSession((s) => s.me);
  const patchMe = useSession((s) => s.patchMe);

  const [inviteOpen, setInviteOpen] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<MemberRow | null>(null);
  const [username, setUsername] = useState('');
  const [role, setRole] = useState<MemberRole>('manager');
  const [touched, setTouched] = useState(false);

  const members = useQuery({
    // Kompaniya almashtirilganda boshqa kompaniyaning ro'yxati (va soni) keshdan chiqmasin
    queryKey: ['company-members', me?.company?.id ?? null],
    queryFn: async () => asMembers(await api.get<unknown>('/company/members')),
  });

  const rows = useMemo(() => members.data?.members ?? [], [members.data]);
  // Server javobi ustun: limit, son va boshqarish huquqi aynan shu kompaniya uchun hisoblangan.
  // Sessiyadagi qiymatlar faqat javob kelguncha zaxira.
  const isOwner = members.data?.canManage ?? (me?.company?.role === 'owner');
  const max = members.data?.limit ?? me?.limits.members ?? 1;
  const used = members.data?.used ?? me?.limits.used.members ?? rows.length;
  const full = used >= max;

  // Tariflar sahifasidagi "a'zolar" qatori sessiyadan o'qiydi — taklif yoki chiqarishdan
  // keyin u eskirib qolmasin, serverning yangi sonini sessiyaga ham yozamiz
  const serverUsed = members.data?.used;
  useEffect(() => {
    if (serverUsed == null || !me || me.limits.used.members === serverUsed) return;
    patchMe({ limits: { ...me.limits, used: { ...me.limits.used, members: serverUsed } } });
  }, [serverUsed, me, patchMe]);

  const refresh = () => void qc.invalidateQueries({ queryKey: ['company-members'] });

  const invite = useMutation({
    mutationFn: (body: { username: string; role: MemberRole }) => api.post<MemberRow>('/company/members', body),
    onSuccess: () => {
      toast.success(t('team.added'));
      setInviteOpen(false);
      setUsername('');
      setTouched(false);
      refresh();
    },
    onError: (err) => toast.error(t('team.addErr'), errText(err)),
  });

  // Ilgari rol POST /company/members (taklif marshruti) ga yuborilardi va har doim
  // 409 "allaqachon jamoada" yoki 402 limit bilan qaytardi. Rol PATCH /members/:id da (2026-10-24)
  const changeRole = useMutation({
    mutationFn: (vars: { member: MemberRow; role: MemberRole }) =>
      api.patch<MemberRow>(`/company/members/${vars.member.id}`, { role: vars.role }),
    onSuccess: () => {
      toast.success(t('team.roleChanged'));
      refresh();
    },
    onError: (err) => toast.error(t('team.roleErr'), errText(err)),
  });

  const remove = useMutation({
    mutationFn: (member: MemberRow) => api.del<unknown>(`/company/members/${member.id}`),
    onSuccess: () => {
      toast.success(t('team.removed'));
      setRemoveTarget(null);
      refresh();
    },
    onError: (err) => toast.error(t('team.removeErr'), errText(err)),
  });

  const usernameError = touched && username.trim().length < 2 ? t('team.usernameErr') : null;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setTouched(true);
    const clean = username.trim().replace(/^@/, '');
    if (clean.length < 2) return;
    invite.mutate({ username: clean, role });
  };

  return (
    <Card>
      <CardHeader
        icon={<Users className="h-4 w-4" />}
        title={t('team.title')}
        subtitle={t('team.subtitle')}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={full ? 'warn' : 'muted'}>{t('team.limit', { used, max })}</Badge>
            {isOwner ? (
              <Button size="sm" icon={<UserPlus className="h-4 w-4" />} disabled={full} onClick={() => setInviteOpen(true)}>
                {t('team.invite')}
              </Button>
            ) : null}
          </div>
        }
      />

      <CardBody className="space-y-3">
        {!isOwner ? (
          <div className="flex items-start gap-3 rounded-2xl border border-line bg-surface-2/60 p-4">
            <Lock className="mt-0.5 h-4 w-4 shrink-0 text-muted" />
            <p className="text-sm text-muted">{t('team.ownerOnly')}</p>
          </div>
        ) : null}

        {full ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-warn/25 bg-warn/10 p-4">
            <p className="text-sm text-ink-soft">{t('team.limitFull')}</p>
            <Link to="/pricing">
              <Button size="sm" variant="outline" icon={<Sparkles className="h-3.5 w-3.5" />}>
                {t('btn.upgrade')}
              </Button>
            </Link>
          </div>
        ) : null}

        {members.isError ? (
          <ErrorState message={errText(members.error)} onRetry={() => void members.refetch()} />
        ) : members.isLoading ? (
          <div className="space-y-2.5">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <EmptyState
            icon={<Users className="h-6 w-6" />}
            title={t('team.empty')}
            hint={t('team.emptyHint')}
            action={
              isOwner ? (
                <Button icon={<UserPlus className="h-4 w-4" />} onClick={() => setInviteOpen(true)}>
                  {t('team.invite')}
                </Button>
              ) : undefined
            }
          />
        ) : (
          <ul className="space-y-2">
            {rows.map((m) => {
              const isSelf = m.isSelf ?? Boolean(me?.user.id && m.userId === me.user.id);
              const isRowOwner = m.role === 'owner';
              return (
                <li
                  key={m.id}
                  className="flex flex-wrap items-center gap-3 rounded-2xl border border-line bg-surface-2/40 p-3.5"
                >
                  <Avatar src={m.photoUrl} name={memberName(m)} size={40} />
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 truncate text-sm font-semibold text-ink">
                      {memberName(m)}
                      {isRowOwner ? <Crown className="h-3.5 w-3.5 text-warn" /> : null}
                      {isSelf ? <Badge tone="brand">{t('team.you')}</Badge> : null}
                    </p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted">
                      {m.username ? <span>@{m.username}</span> : null}
                      {m.createdAt ? (
                        <span className="tnum">
                          {t('team.joined')}: {f.date(m.createdAt)}
                        </span>
                      ) : null}
                    </p>
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    {isOwner && !isRowOwner ? (
                      <Select
                        value={m.role}
                        aria-label={t('team.role')}
                        className="h-9 w-[150px] py-1.5 text-xs"
                        disabled={changeRole.isPending}
                        onChange={(e) => changeRole.mutate({ member: m, role: e.target.value as MemberRole })}
                      >
                        {MEMBER_ROLES.filter((r) => r !== 'owner').map((r) => (
                          <option key={r} value={r}>
                            {t(`team.role.${r}`)}
                          </option>
                        ))}
                      </Select>
                    ) : (
                      <Badge tone={ROLE_TONE[m.role] ?? 'muted'} dot>
                        {t(`team.role.${m.role}`)}
                      </Badge>
                    )}

                    {isOwner && !isRowOwner && !isSelf ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-danger-ink hover:bg-danger/10"
                        icon={<Trash2 className="h-3.5 w-3.5" />}
                        onClick={() => setRemoveTarget(m)}
                      >
                        {t('btn.delete')}
                      </Button>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardBody>

      {/* ── Taklif qilish ── */}
      <Modal
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        title={t('team.inviteTitle')}
        description={t('team.inviteDesc')}
        size="sm"
      >
        <form id="team-invite-form" onSubmit={submit} className="space-y-4">
          <div>
            <span className="label">{t('team.username')}</span>
            <div className="relative">
              <AtSign className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
              <Input
                value={username}
                className="pl-9"
                autoComplete="off"
                placeholder={t('team.usernamePh')}
                onChange={(e) => setUsername(e.target.value)}
                onBlur={() => setTouched(true)}
              />
            </div>
            {usernameError ? <p className="mt-1.5 text-xs text-danger">{usernameError}</p> : null}
          </div>

          <div>
            <span className="label">{t('team.role')}</span>
            <Select value={role} onChange={(e) => setRole(e.target.value as MemberRole)}>
              {MEMBER_ROLES.filter((r) => r !== 'owner').map((r) => (
                <option key={r} value={r}>
                  {t(`team.role.${r}`)}
                </option>
              ))}
            </Select>
            <p className="mt-1.5 text-xs text-muted">{t(`team.roleHint.${role}`)}</p>
          </div>
        </form>
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <Button variant="ghost" type="button" onClick={() => setInviteOpen(false)}>
            {t('btn.cancel')}
          </Button>
          <Button type="submit" form="team-invite-form" loading={invite.isPending} icon={<UserPlus className="h-4 w-4" />}>
            {t('team.invite')}
          </Button>
        </div>
      </Modal>

      {/* ── O'chirishni tasdiqlash ── */}
      <Modal
        open={Boolean(removeTarget)}
        onClose={() => setRemoveTarget(null)}
        title={t('team.removeTitle')}
        size="sm"
      >
        <p className="text-sm text-ink-soft">
          {t('team.removeDesc', { name: removeTarget ? memberName(removeTarget) : '' })}
        </p>
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <Button variant="ghost" onClick={() => setRemoveTarget(null)}>
            {t('btn.cancel')}
          </Button>
          <Button
            variant="danger"
            icon={<Trash2 className="h-4 w-4" />}
            loading={remove.isPending}
            onClick={() => removeTarget && remove.mutate(removeTarget)}
          >
            {t('btn.delete')}
          </Button>
        </div>
      </Modal>
    </Card>
  );
}
