import { useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { TeamInvitesResponse, TeamMembersResponse } from '@savdoiq/shared';
import { Lock, UserPlus } from '@/components/icons';
import { Badge, PageHeader } from '@/components/ui';
import {
  AddByUsernameCard,
  InviteLinkCard,
  InvitesCard,
  LimitCard,
  MembersCard,
  ViewsLegend,
} from '@/components/team/TeamCards';
import { api } from '@/lib/api';
import { useSession } from '@/store/session';
import { useT } from '@/i18n';
import '@/components/team/i18n';

/**
 * Jamoa (2026-10-24): a'zolar, ularning roli va ko'rinish shabloni, plan
 * limiti, username yoki havola bilan taklif va faol takliflar.
 *
 * Boshqarish faqat egaga (server ham requireRole('owner')); boshqa a'zo
 * ro'yxatni faqat ko'radi. Sozlamalar > Jamoa — shu sahifaning qisqa ko'rinishi.
 */
export default function Team() {
  const t = useT('team');
  const me = useSession((s) => s.me);
  const patchMe = useSession((s) => s.patchMe);
  const companyId = me?.company?.id ?? null;

  const members = useQuery({
    queryKey: ['company-members', companyId],
    queryFn: () => api.get<TeamMembersResponse>('/company/members'),
  });
  const isOwner = members.data?.canManage ?? me?.company?.role === 'owner';

  const invites = useQuery({
    queryKey: ['company-invites', companyId],
    queryFn: () => api.get<TeamInvitesResponse>('/company/invites'),
    enabled: isOwner,
  });

  const rows = useMemo(() => members.data?.members ?? [], [members.data]);
  const max = members.data?.limit ?? me?.limits.members ?? 1;
  const used = members.data?.used ?? me?.limits.used.members ?? rows.length;
  const full = used >= max;

  // Tariflar sahifasi va yon menyu sessiyadagi sondan o'qiydi — qo'shish/chiqarishdan keyin eskirmasin
  const serverUsed = members.data?.used;
  useEffect(() => {
    if (serverUsed == null || !me || me.limits.used.members === serverUsed) return;
    patchMe({ limits: { ...me.limits, used: { ...me.limits.used, members: serverUsed } } });
  }, [serverUsed, me, patchMe]);

  return (
    <>
      <PageHeader
        icon={<UserPlus className="h-5 w-5" />}
        title={t('title')}
        description={t('subtitle')}
        meta={<Badge tone={full ? 'warn' : 'muted'}>{t('limit', { used, max })}</Badge>}
      />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0 space-y-5">
          <MembersCard
            rows={rows}
            isOwner={isOwner}
            loading={members.isLoading}
            error={members.isError ? members.error : null}
            onRetry={() => void members.refetch()}
          />
          {isOwner ? (
            <InvitesCard
              rows={invites.data?.invites ?? []}
              loading={invites.isLoading}
              error={invites.isError ? invites.error : null}
              onRetry={() => void invites.refetch()}
            />
          ) : null}
        </div>

        <div className="min-w-0 space-y-5">
          <LimitCard used={used} max={max} isOwner={isOwner} />
          {isOwner ? (
            <>
              <InviteLinkCard full={full} />
              <AddByUsernameCard full={full} />
            </>
          ) : (
            <div className="flex items-start gap-3 rounded-2xl border border-line bg-surface-2/60 p-4">
              <Lock className="mt-0.5 h-4 w-4 shrink-0 text-muted" />
              <p className="text-sm text-muted">{t('ownerOnly')}</p>
            </div>
          )}
          <ViewsLegend />
        </div>
      </div>
    </>
  );
}
