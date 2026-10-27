/**
 * "Yangiliklar" oynasining relizi va "ko'rildi" belgisi (2026-10-27).
 *
 * Belgi foydalanuvchi bo'yicha: bitta brauzerda ikki kishi (masalan, ega va
 * buxgalter) navbat bilan kirsa, oyna har biriga bir martadan chiqadi.
 * Relizi o'zgarsa (yangi id), oyna hammaga yana bir marta chiqadi.
 *
 * localStorage har joyda try/catch ichida: maxfiy oyna yoki bloklangan
 * saytlar ma'lumotida u xato otadi — oyna shunda ham ishlashi kerak
 * (o'sha holatda "bir marta" NewsHost'dagi shu yuklanish xotirasi bilan).
 */

export const NEWS_RELEASE_ID = '2026-10-27';

const KEY_PREFIX = 'sq-news-seen:';

export function newsSeen(userId: string): boolean {
  try {
    return localStorage.getItem(`${KEY_PREFIX}${userId}`) === NEWS_RELEASE_ID;
  } catch {
    return false;
  }
}

export function markNewsSeen(userId: string): void {
  try {
    localStorage.setItem(`${KEY_PREFIX}${userId}`, NEWS_RELEASE_ID);
  } catch {
    /* noop — shu yuklanishda baribir qayta chiqmaydi (NewsHost) */
  }
}
