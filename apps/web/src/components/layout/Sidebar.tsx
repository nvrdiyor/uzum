import { NavLink, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ChevronLeft, Lock, Rocket, ShieldCheck } from 'lucide-react';
import { NAV } from '@/lib/nav';
import { useT } from '@/i18n';
import { useUi } from '@/store/ui';
import { useSession } from '@/store/session';
import { cn } from '@/lib/utils';
import { getPlan } from '@savdoiq/shared';

export function Logo({ compact }: { compact?: boolean }) {
  return (
    <Link to="/dashboard" className="flex items-center gap-2.5 outline-none">
      <span className="relative flex h-9 w-9 items-center justify-center rounded-xl bg-brand-grad text-white shadow-[0_8px_20px_-8px_rgb(var(--c-brand)/0.9)]">
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
          <path d="M2 15h3.5L8 7l3.5 11L14 12h2" />
          <circle cx="19.5" cy="12" r="2" fill="currentColor" stroke="none" />
        </svg>
      </span>
      {!compact ? (
        <span className="font-display text-[17px] font-extrabold tracking-tight text-ink">
          Savdo<span className="text-brand">IQ</span>
        </span>
      ) : null}
    </Link>
  );
}

function PlanCard() {
  const t = useT('common');
  const sub = useSession((s) => s.me?.subscription);
  if (!sub) return null;
  const plan = getPlan(sub.plan);
  const low = sub.daysLeft <= 3;

  return (
    <div className="mx-3 mb-3 rounded-2xl border border-line bg-surface-2 p-3.5">
      <div className="flex items-center justify-between gap-2">
        <span className="chip bg-brand/[0.12] text-brand-ink">
          <ShieldCheck className="h-3 w-3" />
          {plan.name}
        </span>
        <span className={cn('tnum text-xs font-semibold', low ? 'text-danger' : 'text-muted')}>
          {sub.daysLeft > 0 ? t('plan.daysLeft', { days: sub.daysLeft }) : t('plan.expired')}
        </span>
      </div>
      <Link
        to="/pricing"
        className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-brand-grad px-3 py-2 text-xs font-bold text-white transition-transform duration-200 hover:scale-[1.02]"
      >
        <Rocket className="h-3.5 w-3.5" />
        {t('btn.upgrade')}
      </Link>
    </div>
  );
}

export function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const t = useT('common');
  const rail = useUi((s) => s.rail);
  const toggleRail = useUi((s) => s.toggleRail);
  const features = useSession((s) => s.me?.features);

  return (
    <div className="flex h-full flex-col">
      <div className={cn('flex h-16 shrink-0 items-center justify-between px-4', rail && 'justify-center px-2')}>
        <Logo compact={rail} />
        <button
          onClick={toggleRail}
          className={cn(
            'hidden h-7 w-7 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-ink lg:flex',
            rail && 'absolute right-2',
          )}
          aria-label="Menyuni yig‘ish"
        >
          <ChevronLeft className={cn('h-4 w-4 transition-transform duration-300', rail && 'rotate-180')} />
        </button>
      </div>

      <nav className="no-scrollbar flex-1 overflow-y-auto px-3 pb-4">
        {NAV.map((group) => (
          <div key={group.titleKey} className="mb-5">
            {!rail ? (
              <p className="mb-2 px-3 text-2xs font-bold uppercase tracking-[0.12em] text-muted/70">
                {t(group.titleKey)}
              </p>
            ) : (
              <div className="mx-auto mb-2 h-px w-6 bg-line" />
            )}
            <ul className="space-y-0.5">
              {group.items.map((item) => {
                const access = item.feature ? (features?.[item.feature] ?? 'off') : 'full';
                const locked = access !== 'full';
                return (
                  <li key={item.to}>
                    <NavLink
                      to={item.to}
                      onClick={onNavigate}
                      title={rail ? t(item.labelKey) : undefined}
                      className={({ isActive }) =>
                        cn(
                          'group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200',
                          rail && 'justify-center px-0',
                          isActive
                            ? 'bg-brand/10 text-brand-ink'
                            : 'text-ink-soft hover:bg-surface-2 hover:text-ink',
                        )
                      }
                    >
                      {({ isActive }) => (
                        <>
                          {isActive ? (
                            /*
                              layoutId ATAYLAB ishlatilmaydi.

                              U framer-motion'ning "layout" mexanizmini yoqadi va
                              element o'zini AnimatePresence oldida "hali tugamadim"
                              deb ro'yxatga oladi. Mobil menyu yopilganda esa u
                              hech qachon "tugadim" demaydi — natijada butun ekranni
                              qoplaydigan ko'rinmas qatlam (fixed inset-0 z-50)
                              o'chmay qoladi va saytdagi HECH BIR tugma bosilmaydi.
                              Oddiy span bir xil ko'rinishni beradi, muammosiz.
                            */
                            <span className="absolute left-0 top-1/2 h-6 w-[3px] -translate-y-1/2 rounded-r-full bg-brand" />
                          ) : null}
                          <item.icon className={cn('h-[18px] w-[18px] shrink-0', isActive && 'text-brand')} />
                          {!rail ? (
                            <>
                              <span className="flex-1 truncate">{t(item.labelKey)}</span>
                              {item.badge ? (
                                <span className="rounded-md bg-brand/15 px-1.5 py-0.5 text-2xs font-bold uppercase text-brand-ink">
                                  {item.badge}
                                </span>
                              ) : null}
                              {locked ? <Lock className="h-3 w-3 text-muted" /> : null}
                            </>
                          ) : null}
                        </>
                      )}
                    </NavLink>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}

        {/*
          Administrator bo'limi yon menyuda ATAYLAB ko'rsatilmaydi.
          Unga faqat manzilni bilgan odam kiradi: /admin
          (marshrutning o'zi va serverdagi huquq tekshiruvi joyida qoladi).
        */}
      </nav>

      {!rail ? <PlanCard /> : null}
    </div>
  );
}

export function Sidebar() {
  const rail = useUi((s) => s.rail);
  return (
    <aside
      className="fixed inset-y-0 left-0 z-40 hidden shrink-0 border-r border-line bg-surface transition-[width] duration-300 ease-spring lg:block"
      style={{ width: rail ? 'var(--sq-rail)' : 'var(--sq-sidebar)' }}
    >
      <SidebarContent />
    </aside>
  );
}
