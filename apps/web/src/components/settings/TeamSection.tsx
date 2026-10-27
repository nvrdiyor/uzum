import { useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { asMemberView, type TeamMembersResponse } from '@savdoiq/shared';
import { ArrowRight, Crown, Users } from '@/components/icons';
import { Avatar, Badge, Button, Card, CardBody, CardHeader, ErrorState, Skeleton } from '@/components/ui';
import { ROLE_TONE } from '@/components/team/CompanySwitcher';
import { api } from '@/lib/api';
import { useSession } from '@/store/session';
import { useT } from '@/i18n';
import { errText } from './types';
import '@/components/team/i18n';

/** Shuncha a'zo ko'rsatiladi — to'liq ro'yxat, rol va takliflar /team sahifasida */
const PREVIEW = 4;

/**
 * 5-bo'lim: jamoa — QISQA ko'rinish. A'zolar, rol va ko'rinish shablonlari,
 * taklif havolalari /team sahifasida (2026-10-24); bu yerda ikkinchi nusxasi
 * bo'lsa, ikki joyda ikki xil holat ko'rinib qolardi.
 */
export function TeamSection() {
  const t = useT('settings');
  const tt = useT('team');
  const me = useSession((s) => s.me);
  const patchMe = useSession((s) => s.patchMe);

  const members = useQuery({
    // Kompaniya almashtirilganda boshqa kompaniyaning ro'yxati (va soni) keshdan chiqmasin
    queryKey: ['company-members', me?.company?.id ?? null],
    queryFn: () => api.get<TeamMembersResponse>('/company/members'),
  });

  const rows = useMemo(() => members.data?.members ?? [], [members.data]);
  const isOwner = members.data?.canManage ?? me?.company?.role === 'owner';
  const max = members.data?.limit ?? me?.limits.members ?? 1;
  const used = members.data?.used ?? me?.limits.used.members ?? rows.length;

  // Tariflar sahifasidagi "a'zolar" qatori sessiyadan o'qiydi — eskirib qolmasin
  const serverUsed = members.data?.used;
  useEffect(() => {
    if (serverUsed == null || !me || me.limits.used.members === serverUsed) return;
    patchMe({ limits: { ...me.limits, used: { ...me.limits.used, members: serverUsed } } });
  }, [serverUsed, me, patchMe]);

  return (
    <Card>
      <CardHeader
        icon={<Users className="h-4 w-4" />}
        title={t('team.title')}
        subtitle={t('team.subtitle')}
        actions={<Badge tone={used >= max ? 'warn' : 'muted'}>{t('team.limit', { used, max })}</Badge>}
      />
      <CardBody className="space-y-4">
        {members.isError ? (
          <ErrorState message={errText(members.error)} onRetry={() => void members.refetch()} />
        ) : members.isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : (
          <ul className="space-y-1.5">
            {rows.slice(0, PREVIEW).map((m) => {
              const view = m.role === 'owner' ? null : asMemberView(m.view);
              return (
                <li key={m.id} className="flex items-center gap-3 rounded-xl px-1 py-1.5">
                  <Avatar src={m.photoUrl} name={m.name} size={34} />
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1.5 truncate text-sm font-semibold text-ink">
                      <span className="truncate">{m.name}</span>
                      {m.role === 'owner' ? <Crown className="h-3.5 w-3.5 shrink-0 text-warn" /> : null}
                      {m.isSelf ? <Badge tone="brand">{t('team.you')}</Badge> : null}
                    </p>
                    {view ? <p className="truncate text-xs text-muted">{tt(`view.${view}`)}</p> : null}
                  </div>
                  <Badge tone={ROLE_TONE[m.role] ?? 'muted'} dot>
                    {tt(`role.${m.role}`)}
                  </Badge>
                </li>
              );
            })}
            {rows.length > PREVIEW ? (
              <li className="px-1 text-xs text-muted">{tt('summary.more', { n: rows.length - PREVIEW })}</li>
            ) : null}
          </ul>
        )}

        <Link to="/team" className="inline-block">
          <Button variant={isOwner ? 'primary' : 'outline'} iconRight={<ArrowRight className="h-4 w-4" />}>
            {isOwner ? tt('summary.manage') : tt('summary.open')}
          </Button>
        </Link>
      </CardBody>
    </Card>
  );
}
