import { Suspense, useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Sidebar, SidebarContent } from './Sidebar';
import { Topbar } from './Topbar';
import { useUi } from '@/store/ui';
import { SkeletonRows } from '@/components/ui';
import { SyncBanner } from './SyncBanner';

function MobileNav() {
  const open = useUi((s) => s.mobileNav);
  const setOpen = useUi((s) => s.setMobileNav);

  return (
    <AnimatePresence>
      {open ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/55 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          />
          <motion.aside
            initial={{ x: '-100%' }}
            animate={{ x: 0 }}
            exit={{ x: '-100%' }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            className="absolute inset-y-0 left-0 w-[280px] border-r border-line bg-surface"
          >
            <SidebarContent onNavigate={() => setOpen(false)} />
          </motion.aside>
        </div>
      ) : null}
    </AnimatePresence>
  );
}

export function AppLayout() {
  const rail = useUi((s) => s.rail);
  const location = useLocation();

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
  }, [location.pathname]);

  return (
    <div className="min-h-screen bg-bg">
      <Sidebar />
      <MobileNav />

      <div
        className="transition-[padding] duration-300 ease-spring"
        style={{ paddingLeft: 0 }}
      >
        <div className="lg:pl-[var(--pl)]" style={{ ['--pl' as string]: rail ? 'var(--sq-rail)' : 'var(--sq-sidebar)' }}>
          <Topbar />
          <SyncBanner />
          <main className="mx-auto w-full max-w-[1600px] px-4 pb-16 pt-5 sm:px-6">
            {/*
              key AYNAN Suspense'da turishi shart.
              Ilgari u ichkaridagi motion.div da edi: chegara qayta yaratilmasdi,
              shuning uchun React "bu chegara allaqachon mazmun ko'rsatyapti" deb
              hisoblab, yangi sahifa yuklanguncha commit'ni kechiktirardi —
              skeleton chiqmasdi, ekran esa eskiligicha qolardi.
              Yangi key = yangi chegara = skeleton darhol ko'rinadi.
            */}
            <Suspense
              key={location.pathname}
              fallback={
                <div className="space-y-4">
                  <div className="skeleton h-24 w-full" />
                  <SkeletonRows rows={6} />
                </div>
              }
            >
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
              >
                <Outlet />
              </motion.div>
            </Suspense>
          </main>
        </div>
      </div>
    </div>
  );
}
