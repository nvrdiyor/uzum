import { useSyncExternalStore } from 'react';

/**
 * CSS media query hozir mos keladimi — ekran o'lchami o'zgarsa qayta chiziladi.
 * Server tomonda (prerender) `fallback` qaytariladi.
 */
export function useMediaQuery(query: string, fallback = true): boolean {
  return useSyncExternalStore(
    (onChange) => {
      if (typeof window === 'undefined' || !window.matchMedia) return () => undefined;
      const mql = window.matchMedia(query);
      mql.addEventListener('change', onChange);
      return () => mql.removeEventListener('change', onChange);
    },
    () => (typeof window === 'undefined' || !window.matchMedia ? fallback : window.matchMedia(query).matches),
    () => fallback,
  );
}

/** Tailwind `md` (768 px) va undan keng — jadval jadval bo'lib chiziladi */
export const useIsDesktop = (): boolean => useMediaQuery('(min-width: 768px)');
