import { Search } from '@/components/icons';
import { registerNamespace, useT } from '@/i18n';
import { useUi } from '@/store/ui';
import { cn } from '@/lib/utils';
import { preloadPalette } from './PaletteHost';

/*
 * Faqat tugma matnlari shu yerda — oynaning qolgan matnlari palette/i18n.ts da
 * va oyna bilan birga kechiktirib yuklanadi (asosiy fayl og‘irlashmasin).
 */
registerNamespace('palette', {
  uz: { 'trigger.label': 'Sahifaga o‘tish', 'trigger.search': 'Qidirish…' },
  ru: { 'trigger.label': 'Переход к странице', 'trigger.search': 'Поиск…' },
  en: { 'trigger.label': 'Go to page', 'trigger.search': 'Search…' },
});

/** Mac va iPad'da tezkor tugma ⌘K, qolganlarida Ctrl K */
export function isMacLike(): boolean {
  if (typeof navigator === 'undefined') return false;
  const uaData = (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData;
  return /mac|iphone|ipad|ipod/i.test(uaData?.platform || navigator.platform || navigator.userAgent);
}

export function shortcutText(): string {
  return isMacLike() ? '⌘K' : 'Ctrl K';
}

function warmUp() {
  preloadPalette().catch(() => {
    /* bosilganda qayta uriniladi */
  });
}

/**
 * Qidiruv ("Sahifaga o‘tish") tugmasi.
 *
 * `bar` — yuqori panel qatori uchun, JOYGA QARAB o‘zgaradi (2026-10-24):
 * 640–690, 768–840 va 1024–1070 px kengliklarda panel allaqachon to‘la
 * (do‘kon, davr, til, mavzu, qo‘ng‘iroq, profil) — qat’iy 36 px li tugma
 * qatorni ekrandan chiqarib, sahifani gorizontal aylantirardi. Shuning uchun
 * tugma o‘ramining kengligi "so‘raladi" (basis), lekin qator torayganda
 * BIRINCHI bo‘lib u qisqaradi; container query esa sig‘adigan ko‘rinishni
 * tanlaydi: ≥200 px — "Qidirish… Ctrl K", ≥100 px — "Ctrl K" ishorasi bilan,
 * ≥44 px — faqat belgi, undan kam — umuman ko‘rinmaydi (yo‘l-yo‘lakay
 * qirqilgan tugma chiqmaydi). Yashiringan holatda qatorning `gap-2` oralig‘i
 * ham `-ml-2` bilan qoplanadi — qator kengligi o‘zgarmaydi.
 *
 * `drawer` — mobil menyu varag‘ining sarlavhasida: panelda joy bo‘lmagan
 * kengliklarda ham qidiruv bir bosishda topiladi.
 */
export function PaletteTrigger({ variant = 'bar', className }: { variant?: 'bar' | 'drawer'; className?: string }) {
  const t = useT('palette');
  const setOpen = useUi((s) => s.setCommandOpen);
  const setMobileNav = useUi((s) => s.setMobileNav);
  const keys = shortcutText();
  const label = t('trigger.label');

  const props = {
    type: 'button' as const,
    onClick: () => {
      setMobileNav(false);
      setOpen(true);
    },
    onPointerEnter: warmUp,
    onFocus: warmUp,
    'aria-haspopup': 'dialog' as const,
    'aria-keyshortcuts': isMacLike() ? 'Meta+K' : 'Control+K',
    'aria-label': label,
    title: `${label} (${keys})`,
  };

  if (variant === 'drawer') {
    return (
      <button
        {...props}
        className={cn(
          'flex h-9 w-9 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/60',
          className,
        )}
      >
        <Search className="h-[18px] w-[18px]" />
      </button>
    );
  }

  return (
    <div
      data-palette-trigger=""
      className={cn(
        '-ml-2 flex min-w-0 shrink basis-11 justify-end [container-type:inline-size] xl:basis-[6.5rem] 2xl:basis-[12.5rem]',
        className,
      )}
    >
      <button
        {...props}
        className={cn(
          'ml-2 hidden h-9 w-9 shrink-0 items-center justify-center gap-2 rounded-lg text-sm text-muted transition-colors hover:bg-surface-2 hover:text-ink',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/60',
          '[@container(min-width:44px)]:flex',
          '[@container(min-width:100px)]:w-auto [@container(min-width:100px)]:justify-start [@container(min-width:100px)]:border [@container(min-width:100px)]:border-line [@container(min-width:100px)]:bg-surface [@container(min-width:100px)]:pl-2.5 [@container(min-width:100px)]:pr-1.5 [@container(min-width:100px)]:hover:border-line-strong',
        )}
      >
        <Search className="h-4 w-4 shrink-0" />
        <span className="hidden truncate pr-8 [@container(min-width:196px)]:inline">{t('trigger.search')}</span>
        <kbd className="hidden h-6 shrink-0 items-center rounded-md border border-line bg-surface-2 px-1.5 font-sans text-2xs font-semibold text-ink-soft [@container(min-width:100px)]:inline-flex">
          {keys}
        </kbd>
      </button>
    </div>
  );
}
