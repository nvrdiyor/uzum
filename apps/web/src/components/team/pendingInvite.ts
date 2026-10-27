/**
 * Kirmagan foydalanuvchi taklif havolasini ochib, "Kirish" ni bosganda havola
 * shu tabda eslab qolinadi (sessionStorage). Login `?next=` bilan qaytaradi;
 * bu esa zaxira: kirish boshqa yo'l bilan tugasa (AuthCallback, `next`siz
 * /login) ham foydalanuvchi taklifga qaytadi, onboarding'ga emas.
 *
 * sessionStorage ATAYLAB: havola — kompaniyaga kirish kaliti, u brauzerda
 * tab yopilgandan keyin qolmasin.
 */
const KEY = 'sq-invite';
/** base64url, 32 bayt — boshqa narsani yo'l sifatida ishlatmaymiz */
const TOKEN_RE = /^[A-Za-z0-9_-]{20,128}$/;

export function rememberInvite(token: string): void {
  if (!TOKEN_RE.test(token)) return;
  try {
    sessionStorage.setItem(KEY, token);
  } catch {
    /* noop */
  }
}

export function forgetInvite(): void {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* noop */
  }
}

/** Kutib turgan taklif sahifasi ("/invite/<token>") yoki null */
export function pendingInvitePath(): string | null {
  try {
    const token = sessionStorage.getItem(KEY);
    return token && TOKEN_RE.test(token) ? `/invite/${token}` : null;
  } catch {
    return null;
  }
}
