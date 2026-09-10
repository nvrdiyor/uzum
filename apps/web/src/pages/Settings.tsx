import { useCallback, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Settings as SettingsIcon, Sparkles } from 'lucide-react';
import { Badge, Button, PageHeader } from '@/components/ui';
import { SectionNav } from '@/components/settings/SectionNav';
import { ProfileSection } from '@/components/settings/ProfileSection';
import { CompanySection } from '@/components/settings/CompanySection';
import { UzumSection } from '@/components/settings/UzumSection';
import { NotificationsSection } from '@/components/settings/NotificationsSection';
import { TeamSection } from '@/components/settings/TeamSection';
import { AppearanceSection } from '@/components/settings/AppearanceSection';
import { SETTINGS_I18N } from '@/components/settings/i18n';
import { SECTION_IDS, type SectionId } from '@/components/settings/types';
import { useSession } from '@/store/session';
import { registerNamespace, useT } from '@/i18n';

registerNamespace('settings', SETTINGS_I18N);

function sectionFromHash(hash: string): SectionId {
  const id = hash.replace(/^#/, '') as SectionId;
  return SECTION_IDS.includes(id) ? id : 'profile';
}

/**
 * Sozlamalar — chapda bo'limlar navigatsiyasi, o'ngda mazmun.
 * Aktiv bo'lim URL hash'ida saqlanadi: #profile, #company, #uzum, #notifications, #team, #appearance
 */
export default function Settings() {
  const t = useT('settings');
  const location = useLocation();
  const navigate = useNavigate();
  const me = useSession((s) => s.me);

  const section = sectionFromHash(location.hash);

  const select = useCallback(
    (id: SectionId) => {
      navigate(`${location.pathname}#${id}`, { replace: true });
    },
    [navigate, location.pathname],
  );

  // Bo'lim almashganda yuqoriga qaytamiz (mobil uchun muhim)
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [section]);

  const plan = me?.subscription?.plan ?? 'trial';
  const daysLeft = me?.subscription?.daysLeft ?? null;
  const unread = me?.unreadNotifications ?? 0;

  return (
    <>
      <PageHeader
        icon={<SettingsIcon className="h-5 w-5" />}
        title={t('title')}
        description={t('subtitle')}
        badge={<Badge tone="brand">{t(`plan.${plan}`)}</Badge>}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {daysLeft !== null ? (
              <span className="chip bg-surface-2 text-muted">{t('plan.daysLeft', { days: daysLeft })}</span>
            ) : null}
            <Link to="/pricing">
              <Button size="sm" variant="outline" icon={<Sparkles className="h-3.5 w-3.5" />}>
                {t('btn.upgrade')}
              </Button>
            </Link>
          </div>
        }
      />

      <div className="grid gap-5 lg:grid-cols-[248px_minmax(0,1fr)]">
        <div className="min-w-0">
          <SectionNav
            active={section}
            onSelect={select}
            badges={{
              notifications: unread > 0 ? <Badge tone="danger">{unread > 99 ? '99+' : unread}</Badge> : null,
            }}
          />
        </div>

        <div className="min-w-0">
          <AnimatePresence mode="wait">
            <motion.div
              key={section}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            >
              {section === 'profile' ? <ProfileSection /> : null}
              {section === 'company' ? <CompanySection /> : null}
              {section === 'uzum' ? <UzumSection /> : null}
              {section === 'notifications' ? <NotificationsSection /> : null}
              {section === 'team' ? <TeamSection /> : null}
              {section === 'appearance' ? <AppearanceSection /> : null}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </>
  );
}
