import type { ReactNode } from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import { viewAllowsPage, viewHomePath, type MemberView } from '@savdoiq/shared';
import { ArrowRight, Lock } from '@/components/icons';
import { Button, Card } from '@/components/ui';
import { useT } from '@/i18n';
import { useView } from '@/lib/view';
import './i18n';

/**
 * Sahifa qo'riqchisi — ko'rinish shablonidan tashqaridagi sahifa o'rniga
 * tushunarli holat (2026-10-24). Server baribir 403 beradi; qo'riqchi bo'lmasa
 * sahifa ochilib, har bir karta alohida "Xatolik" ko'rsatardi.
 *
 * Boshqaruv paneli — kirish va kompaniya almashtirishdan keyingi standart
 * manzil: shablonda yopiq bo'lsa (Omborchi) o'z bosh sahifasiga o'tkaziladi.
 */
export function ViewGate({ children }: { children: ReactNode }) {
  const view = useView();
  const { pathname } = useLocation();

  if (!view || viewAllowsPage(view, pathname)) return <>{children}</>;
  // Administrator bo'limini server o'zi tekshiradi (requireAdmin) — shablonga bog'liq emas
  if (pathname === '/admin' || pathname.startsWith('/admin/')) return <>{children}</>;
  if (pathname === '/dashboard') return <Navigate to={viewHomePath(view)} replace />;
  return <ClosedSection view={view} />;
}

function ClosedSection({ view }: { view: MemberView }) {
  const t = useT('team');
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <Card className="w-full max-w-md p-7 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-surface-2 text-muted">
          <Lock className="h-5 w-5" />
        </div>
        <h1 className="font-display text-lg font-bold text-ink">{t('closed.title')}</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted">{t('closed.hint', { view: t(`view.${view}`) })}</p>
        <Link to={viewHomePath(view)} className="mt-6 inline-block">
          <Button iconRight={<ArrowRight className="h-4 w-4" />}>{t('closed.home')}</Button>
        </Link>
      </Card>
    </div>
  );
}
