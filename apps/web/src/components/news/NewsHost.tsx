import { useEffect, useState, type ComponentType } from 'react';
import { useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import type { SyncStatus } from '@savdoiq/shared';
import { api } from '@/lib/api';
import { useUi } from '@/store/ui';
import { useNeedsOnboarding, useSession } from '@/store/session';
import { markNewsSeen, newsSeen } from './release';
import { useNews } from './store';
import type { NewsDialogProps } from './NewsDialog';

/*
 * "Yangiliklar" oynasining ULAGICHI — faqat ilova qobig'ida (AppLayout),
 * shuning uchun bosh sahifa, kirish va onboarding'da umuman yo'q (2026-10-27).
 *
 * Bu fayl ATAYLAB kichik: oynaning o'zi (uch tildagi matn, ro'yxat) alohida
 * bo'lak bo'lib, faqat ochilishi kerak bo'lganda yuklanadi — asosiy faylga,
 * demak bosh sahifaga ham qo'shilmaydi. React.lazy ishlatilmadi (PaletteHost
 * bilan bir xil sabab): bo'lak yuklanmasa xato sahifaning RouteError
 * chegarasiga chiqib, butun ekranni "Xatolik" bilan almashtirardi.
 */

type NewsModule = typeof import('./NewsDialog');
let loading: Promise<NewsModule> | null = null;

function loadNews(): Promise<NewsModule> {
  if (!loading) {
    loading = import('./NewsDialog').catch((err: unknown) => {
      loading = null;
      throw err;
    });
  }
  return loading;
}

/** Sahifa chizilib olsin — oyna sahifa bilan bir vaqtda "sakrab" chiqmasin */
const AUTO_DELAY_MS = 1500;
/** Boshqa oyna ochiq bo'lsa, shu oraliqda qayta tekshiriladi */
const RETRY_MS = 2000;

/**
 * Shu yuklanishda oyna kimga ko'rsatildi. localStorage yozilmasa (maxfiy oyna)
 * ham, yopilgandan keyin har sahifa almashganda qayta chiqib ketmasin.
 */
const shownTo = new Set<string>();

/**
 * Boshqa oyna (Modal, Drawer, Ctrl+K), mobil menyu yoki yangiliklarning
 * o'zi ochiq bo'lsa, ustiga chiqmaydi: ikkalasi ham Escape va Tab ni
 * hujjat darajasida ushlaydi va bitta Escape ikkalasini yopib yuborardi.
 */
function blockingUiOpen(): boolean {
  const ui = useUi.getState();
  if (ui.commandOpen || ui.mobileNav || useNews.getState().open) return true;
  return Boolean(document.querySelector('[aria-modal="true"]'));
}

export function NewsHost() {
  const open = useNews((s) => s.open);
  const setOpen = useNews((s) => s.setOpen);
  const userId = useSession((s) => s.me?.user.id ?? null);
  const hasCompany = useSession((s) => Boolean(s.me?.company));
  const meSync = useSession((s) => s.me?.sync ?? null);
  const needsOnboarding = useNeedsOnboarding();
  const { pathname } = useLocation();
  const [Dialog, setDialog] = useState<ComponentType<NewsDialogProps> | null>(null);

  /*
   * Birinchi sinxron ketayotganda chiqmaydi: sotuvchi hali bo'sh sahifalarni
   * ko'rib turibdi va "Ma'lumotlar yig'ilmoqda" qatori bor — yangiliklar u
   * yerda faqat xalaqit beradi. Kalit SyncBanner bilan bir xil: so'rov bitta,
   * yangilanib turishi ham o'sha yerdan.
   */
  const syncQ = useQuery({
    queryKey: ['sync-status'],
    queryFn: () => api.get<SyncStatus>('/sync/status'),
    enabled: hasCompany,
    staleTime: 3000,
  });
  const sync = syncQ.data ?? meSync;
  const syncKnown = Boolean(sync) || syncQ.isError;
  const firstSync = Boolean(sync?.firstRun && (sync.status === 'running' || sync.status === 'queued'));
  // Administrator bo'limi sotuvchi qobig'ining ichida, lekin u sotuvchi ishi emas
  const adminArea = pathname === '/admin' || pathname.startsWith('/admin/');
  const eligible = Boolean(userId) && hasCompany && !needsOnboarding && syncKnown && !firstSync && !adminArea;

  // ─────────── Kirgandan keyin bir marta o'zi chiqadi ───────────
  useEffect(() => {
    if (!eligible || !userId || shownTo.has(userId) || newsSeen(userId)) return undefined;
    // Bo'lak oldindan kelib tursin — ochilishda kutish bo'lmasin
    void loadNews().catch(() => undefined);
    let timer = 0;
    const tick = () => {
      if (shownTo.has(userId) || newsSeen(userId)) return;
      if (blockingUiOpen()) {
        timer = window.setTimeout(tick, RETRY_MS);
        return;
      }
      setOpen(true);
    };
    timer = window.setTimeout(tick, AUTO_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [eligible, userId, setOpen]);

  // ─────────── Oyna kodi — faqat ochilganda ───────────
  useEffect(() => {
    if (!open || Dialog) return undefined;
    let alive = true;
    loadNews().then(
      (m) => {
        if (alive) setDialog(() => m.NewsDialog);
      },
      () => {
        // Bo'lak yuklanmadi — "ochiq" holat osilib qolmasin; keyingi ochishda qayta uriniladi
        if (alive) setOpen(false);
      },
    );
    return () => {
      alive = false;
    };
  }, [open, Dialog, setOpen]);

  // Ko'rindi — "ko'rildi" deb yoziladi (o'zi chiqqanda ham, menyudan ochilganda ham)
  useEffect(() => {
    if (!open || !Dialog || !userId) return;
    shownTo.add(userId);
    markNewsSeen(userId);
  }, [open, Dialog, userId]);

  // Brauzerning "orqaga" tugmasi bilan sahifa almashsa, oyna eski sahifa ustida qolib ketmasin
  useEffect(() => {
    if (useNews.getState().open) setOpen(false);
  }, [pathname, setOpen]);

  if (!Dialog) return null;
  return <Dialog open={open} onClose={() => setOpen(false)} />;
}
