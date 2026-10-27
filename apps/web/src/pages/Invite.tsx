import { useEffect } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { InviteAcceptResponse, InvitePreviewResponse } from '@savdoiq/shared';
import { ArrowLeft, ArrowRight, Building2, Clock, LogIn, ShieldAlert, UserPlus } from '@/components/icons';
import { Badge, Button, Card, toast } from '@/components/ui';
import { AuthShell, PulseLogo } from '@/components/auth/primitives';
import { EASE } from '@/components/landing/primitives';
import { forgetInvite, rememberInvite } from '@/components/team/pendingInvite';
import { ApiError, api } from '@/lib/api';
import { useSession } from '@/store/session';
import { useUi } from '@/store/ui';
import { useFormat, useT } from '@/i18n';
import '@/components/team/i18n';

const KNOWN_ERRORS = new Set(['invite_not_found', 'invite_expired', 'invite_used', 'invite_revoked', 'plan_limit']);

function errorCode(err: unknown): string {
  return err instanceof ApiError && KNOWN_ERRORS.has(err.code) ? err.code : 'generic';
}

/**
 * /invite/:token — jamoaga taklif havolasi (ilova qobig'idan TASHQARIDA, kirish
 * sahifasi kabi): yangi foydalanuvchining hali kompaniyasi yo'q, Protected esa
 * uni onboarding'ga yuborardi.
 *
 *  • kirmagan — taklifni ko'radi va Telegram orqali kiradi; Login `?next=`
 *    bilan shu sahifaga qaytaradi (zaxira — sessionStorage, pendingInvite.ts);
 *  • kirgan — "Qo'shilish" → kompaniya almashtiriladi, kesh tozalanadi va
 *    Boshqaruv paneliga o'tiladi (shablonda yopiq bo'lsa qo'riqchi bosh
 *    sahifaga o'tkazadi);
 *  • allaqachon a'zo — "Kompaniyaga o'tish", taklif sarflanmaydi.
 */
export default function Invite() {
  const { token = '' } = useParams();
  const t = useT('team');
  const f = useFormat();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const me = useSession((s) => s.me);
  const ready = useSession((s) => s.ready);
  const logout = useSession((s) => s.logout);
  const switchCompany = useSession((s) => s.switchCompany);
  const setStoreId = useUi((s) => s.setStoreId);

  const preview = useQuery({
    // Kirgan foydalanuvchi o'zgarsa "allaqachon a'zo" ham o'zgaradi
    queryKey: ['invite-preview', token, me?.user.id ?? null],
    queryFn: () => api.get<InvitePreviewResponse>(`/invites/${encodeURIComponent(token)}`),
    enabled: ready && token.length > 0,
    retry: false,
    staleTime: 0,
  });

  // Ishlatib bo'lmaydigan havola eslab qolinmasin (kirishdan keyin yana shu xatoga qaytarmaslik uchun)
  useEffect(() => {
    if (preview.isError) forgetInvite();
  }, [preview.isError]);

  /** Kompaniyaga o'tish: sessiya → kesh → bosh sahifa (CompanySwitcher bilan bir xil tartib) */
  const openCompany = async (companyId: string) => {
    forgetInvite();
    await switchCompany(companyId);
    setStoreId('all');
    qc.clear();
    navigate('/dashboard', { replace: true });
  };

  const accept = useMutation({
    mutationFn: () => api.post<InviteAcceptResponse>(`/invites/${encodeURIComponent(token)}/accept`),
    onSuccess: async (res) => {
      toast.success(t('inv.joined'), res.companyName);
      await openCompany(res.companyId);
    },
    onError: (err) => {
      if (err instanceof ApiError && err.code === 'already_member') {
        void preview.refetch();
        return;
      }
      toast.error(t('inv.err.title'), t(`inv.err.${errorCode(err)}`));
      void preview.refetch();
    },
  });

  const login = () => {
    rememberInvite(token);
    navigate(`/login?next=${encodeURIComponent(`/invite/${token}`)}`);
  };

  const userName =
    [me?.user.firstName, me?.user.lastName].filter(Boolean).join(' ') || (me?.user.username ? `@${me.user.username}` : '');

  const data = preview.data;
  const loading = !ready || preview.isLoading;

  return (
    <AuthShell className="justify-center">
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: EASE }}
        className="mx-auto w-full max-w-[460px]"
      >
        {loading ? (
          <div className="flex justify-center py-16">
            <PulseLogo size={64} />
          </div>
        ) : preview.isError || !data ? (
          <Card className="p-6 text-center sm:p-8">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-danger/10 text-danger-ink">
              <ShieldAlert className="h-6 w-6" />
            </div>
            <h1 className="mt-5 font-display text-xl font-bold tracking-tight text-ink">{t('inv.err.title')}</h1>
            <p className="mt-2.5 text-sm leading-relaxed text-muted">{t(`inv.err.${errorCode(preview.error)}`)}</p>
            <Link to={me ? '/dashboard' : '/'} className="mt-7 inline-block">
              <Button variant="outline" icon={<ArrowLeft className="h-4 w-4" />}>
                {t('inv.home')}
              </Button>
            </Link>
          </Card>
        ) : (
          <Card className="p-6 sm:p-8">
            <span className="chip bg-brand/10 text-brand-ink ring-1 ring-inset ring-brand/20">
              <UserPlus className="h-3.5 w-3.5" />
              {t('inv.eyebrow')}
            </span>

            <div className="mt-5 flex items-start gap-3.5">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-surface-2 text-ink-soft">
                <Building2 className="h-6 w-6" />
              </span>
              <div className="min-w-0">
                <h1 className="text-balance font-display text-xl font-bold leading-snug tracking-tight text-ink sm:text-2xl">
                  {t('inv.title', { company: data.companyName })}
                </h1>
                {data.inviterName ? (
                  <p className="mt-1 text-sm text-muted">{t('inv.by', { name: data.inviterName })}</p>
                ) : null}
              </div>
            </div>

            <div className="mt-6 space-y-3 rounded-2xl border border-line bg-surface-2/50 p-4">
              {/* Yorliq va nishon juft-juft — tor ekranda juftlik bo'linib ketmasin */}
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                <span className="inline-flex items-center gap-2">
                  <span className="text-xs font-semibold uppercase tracking-wide text-muted">{t('role.label')}</span>
                  <Badge tone="info">{t(`role.${data.role}`)}</Badge>
                </span>
                <span className="inline-flex items-center gap-2">
                  <span className="text-xs font-semibold uppercase tracking-wide text-muted">{t('view.label')}</span>
                  <Badge tone="violet">{t(`view.${data.view ?? 'full'}`)}</Badge>
                </span>
              </div>
              <p className="text-sm leading-relaxed text-ink-soft">{t(`viewHint.${data.view ?? 'full'}`)}</p>
              <p className="flex items-center gap-1.5 text-xs text-muted">
                <Clock className="h-3.5 w-3.5" />
                <span className="tnum">{t('inv.expires', { date: f.date(data.expiresAt) })}</span>
              </p>
            </div>

            {!me ? (
              <div className="mt-6 space-y-3">
                <Button className="w-full" icon={<LogIn className="h-4 w-4" />} onClick={login}>
                  {t('inv.login')}
                </Button>
                <p className="text-center text-xs leading-relaxed text-muted">{t('inv.loginHint')}</p>
              </div>
            ) : data.alreadyMember ? (
              <div className="mt-6 space-y-3">
                <div className="rounded-xl border border-brand/25 bg-brand/5 p-3 text-sm">
                  <p className="font-semibold text-ink">{t('inv.already')}</p>
                  <p className="mt-0.5 text-xs text-muted">{t('inv.alreadyHint')}</p>
                </div>
                {data.companyId ? (
                  <Button
                    className="w-full"
                    iconRight={<ArrowRight className="h-4 w-4" />}
                    onClick={() => data.companyId && void openCompany(data.companyId)}
                  >
                    {t('inv.open')}
                  </Button>
                ) : null}
              </div>
            ) : (
              <div className="mt-6 space-y-3">
                {userName ? <p className="text-center text-xs text-muted">{t('inv.as', { name: userName })}</p> : null}
                <Button
                  className="w-full"
                  icon={<UserPlus className="h-4 w-4" />}
                  loading={accept.isPending}
                  onClick={() => accept.mutate()}
                >
                  {t('inv.join')}
                </Button>
                <Button
                  variant="ghost"
                  className="w-full"
                  disabled={accept.isPending}
                  onClick={() => {
                    rememberInvite(token);
                    void logout();
                  }}
                >
                  {t('inv.otherAccount')}
                </Button>
              </div>
            )}
          </Card>
        )}
      </motion.div>
    </AuthShell>
  );
}
