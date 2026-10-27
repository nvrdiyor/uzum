import { useEffect, useState, type ComponentType } from 'react';
import { useLocation } from 'react-router-dom';
import { useUi } from '@/store/ui';
import { NAV } from '@/lib/nav';
import { SECTION_IDS, type SectionId } from '@/components/settings/types';
import { pushRecent } from './recent';
import type { CommandPaletteProps } from './CommandPalette';

/*
 * "Sahifaga o‘tish" oynasi (Ctrl K / ⌘K) — ilova qobig‘idagi ULAGICH.
 *
 * Bu fayl ATAYLAB kichik va har sahifada yuklanadi: tezkor tugmani tinglaydi,
 * so‘nggi sahifalarni yozadi va oynaning o‘zini (qidiruv, sinonimlar, ro‘yxat)
 * alohida bo‘lak sifatida yuklaydi. Oyna kodi asosiy faylga qo‘shilmaydi.
 *
 * React.lazy + Suspense ishlatilmadi: bo‘lak yuklanmasa (deploydan keyin eski
 * xesh) xato butun sahifaning RouteError chegarasiga chiqib, ekranni
 * "Xatolik yuz berdi" bilan almashtirardi. Oddiy import() da xato shu yerda
 * yutiladi — keyingi ochishda qayta uriniladi.
 */

type PaletteModule = typeof import('./CommandPalette');
let loading: Promise<PaletteModule> | null = null;

/** Oyna kodini oldindan yuklaydi (tugma ustiga kelinganda, bo‘sh vaqtda) — bosilganda kutilmasin */
export function preloadPalette(): Promise<PaletteModule> {
  if (!loading) {
    loading = import('./CommandPalette').catch((err: unknown) => {
      loading = null;
      throw err;
    });
  }
  return loading;
}

const PAGE_PATHS = new Set(NAV.flatMap((g) => g.items.map((i) => i.to)));

/** So‘nggilar ro‘yxati uchun kalit: faqat menyudagi sahifalar; Sozlamalar — bo‘limi bilan */
function visitKey(pathname: string, hash: string): string | null {
  if (!PAGE_PATHS.has(pathname)) return null;
  if (pathname === '/settings') {
    const id = hash.replace(/^#/, '');
    return SECTION_IDS.includes(id as SectionId) ? `/settings#${id}` : '/settings';
  }
  return pathname;
}

const NON_TEXT_INPUTS = new Set(['checkbox', 'radio', 'button', 'submit', 'reset', 'range', 'color', 'file', 'image']);

/** "/" yozuv maydonida oddiy belgi bo‘lib qolishi kerak — oyna faqat maydondan tashqarida ochiladi */
function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  if (target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return true;
  if (target instanceof HTMLInputElement) return !NON_TEXT_INPUTS.has(target.type);
  return false;
}

/**
 * Boshqa oyna (Modal, Drawer) ochiq bo‘lsa, ustiga ochilmaydi: ikkalasi ham
 * Escape va Tab ni hujjat darajasida ushlaydi — bitta Escape ikkalasini
 * yopib, kiritilgan forma yo‘qolardi.
 */
function otherDialogOpen(): boolean {
  return Boolean(document.querySelector('[aria-modal="true"]:not([data-palette])'));
}

export function PaletteHost() {
  const open = useUi((s) => s.commandOpen);
  const setOpen = useUi((s) => s.setCommandOpen);
  const { pathname, hash } = useLocation();
  const [Palette, setPalette] = useState<ComponentType<CommandPaletteProps> | null>(null);

  useEffect(() => {
    const key = visitKey(pathname, hash);
    if (key) pushRecent({ to: key });
  }, [pathname, hash]);

  // Brauzerning "orqaga" tugmasi bilan sahifa almashsa, oyna ochiq qolib ketmasin
  useEffect(() => {
    if (useUi.getState().commandOpen) setOpen(false);
  }, [pathname, setOpen]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.isComposing || e.repeat) return;
      const { commandOpen } = useUi.getState();
      /*
       * e.code === 'KeyK' — ruscha/o‘zbekcha kirill tartibida shu tugma "л"
       * yozadi va e.key "k" bo‘lmaydi. Sotuvchilar tartibni tez-tez almashtiradi,
       * tezkor tugma esa har ikkisida ishlashi kerak.
       */
      const isK = e.code === 'KeyK' || e.key.toLowerCase() === 'k';
      if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && isK) {
        if (!commandOpen && otherDialogOpen()) return;
        // Brauzerning o‘z Ctrl K si (manzil qatorida qidiruv) ishlamasin
        e.preventDefault();
        if (!commandOpen) useUi.getState().setMobileNav(false);
        setOpen(!commandOpen);
        return;
      }
      if (e.key === '/' && !e.ctrlKey && !e.metaKey && !e.altKey && !commandOpen) {
        if (isTypingTarget(e.target) || otherDialogOpen()) return;
        e.preventDefault();
        useUi.getState().setMobileNav(false);
        setOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setOpen]);

  useEffect(() => {
    if (Palette) return undefined;
    let alive = true;
    const load = () => {
      preloadPalette().then(
        (m) => {
          if (alive) setPalette(() => m.CommandPalette);
        },
        () => {
          // Bo‘lak yuklanmadi — "ochiq" holat osilib qolmasin; keyingi Ctrl K qayta urinadi
          if (alive && useUi.getState().commandOpen) setOpen(false);
        },
      );
    };
    if (open) {
      load();
      return () => {
        alive = false;
      };
    }
    // Sahifa o‘zi yuklanib bo‘lgach, bo‘sh vaqtda: birinchi bosishda ham oyna darhol chiqadi
    const timer = window.setTimeout(load, 2500);
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, [open, Palette, setOpen]);

  if (!open || !Palette) return null;
  return <Palette onClose={() => setOpen(false)} />;
}
