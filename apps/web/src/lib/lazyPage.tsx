import { lazy, type ComponentType, type LazyExoticComponent } from 'react';

/**
 * Sahifani kechiktirilgan (lazy) yuklash — yangilanishdan keyin ham ishonchli.
 *
 * MUAMMO. Har chiqarilishda (deploy) Vite fayl nomlariga yangi xesh beradi va
 * eski fayllar o'chib ketadi. Foydalanuvchining brauzerida ochiq turgan sahifa
 * esa eski xeshlarni eslab qoladi. Yon menyudagi tugma bosilganda brauzer
 * `Products-ESKIXESH.js` ni so'raydi, server 404 qaytaradi, `import()` rad
 * etiladi. React marshrutni `startTransition` ichida bajargani uchun xato
 * ko'rinmaydi — manzil o'zgaradi, sahifa esa eskiligicha qoladi. Foydalanuvchi
 * uchun bu "tugmalar ishlamayapti, refresh qilsa ochiladi" bo'lib ko'rinadi.
 *
 * YECHIM. Yuklash xato bo'lsa bir marta qayta urinamiz (tarmoqdagi tasodifiy
 * uzilish uchun), u ham yordam bermasa — sahifani yangilaymiz. Yangilashdan
 * keyin brauzer yangi `index.html` ni oladi va to'g'ri fayllarni yuklaydi.
 * Cheksiz aylanishning oldini olish uchun bitta sessiyada faqat bir marta.
 */
const RELOAD_KEY = 'sq-chunk-reloaded';

function markReloaded(): boolean {
  try {
    if (sessionStorage.getItem(RELOAD_KEY)) return false;
    sessionStorage.setItem(RELOAD_KEY, '1');
    return true;
  } catch {
    // sessionStorage yopiq bo'lsa (maxfiy rejim) — bir marta yangilashga ruxsat
    return true;
  }
}

/** Muvaffaqiyatli yuklangach belgini tozalaymiz — keyingi deploy ham ishlasin */
function clearReloaded(): void {
  try {
    sessionStorage.removeItem(RELOAD_KEY);
  } catch {
    /* noop */
  }
}

export function lazyPage<T extends ComponentType<unknown>>(
  load: () => Promise<{ default: T }>,
): LazyExoticComponent<T> {
  return lazy(async () => {
    try {
      const mod = await load();
      clearReloaded();
      return mod;
    } catch (first) {
      // Tarmoq tasodifan uzilgan bo'lishi mumkin — bir marta qayta urinamiz
      try {
        const mod = await load();
        clearReloaded();
        return mod;
      } catch (second) {
        if (markReloaded()) {
          // Eski fayl serverda yo'q — yangi `index.html` bilan qayta yuklaymiz
          window.location.reload();
          // Sahifa yangilanguncha "to'xtab" turamiz, xato ekranini ko'rsatmaymiz
          await new Promise(() => {});
        }
        throw second instanceof Error ? second : new Error(String(first));
      }
    }
  });
}
