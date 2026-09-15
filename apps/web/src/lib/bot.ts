/**
 * Telegram bot manzili — butun sayt bo'ylab bitta manba.
 *
 * Bot username'i serverdagi `VITE_BOT_USERNAME` dan olinadi; ko'rsatilmagan
 * bo'lsa `APP.supportBot` ishlatiladi. Ilgari har bir sahifa havolani o'zi
 * yasagani uchun bot nomi o'zgarganda ba'zi havolalar eskirib qolardi.
 */
import { APP } from '@savdoiq/shared';

const raw = String(import.meta.env.VITE_BOT_USERNAME ?? APP.supportBot).trim();

/** `@` belgisiz username */
export const BOT_USERNAME: string = raw.replace(/^@/, '');

/** Ko'rsatish uchun: `@savdoiqbot` */
export const BOT_HANDLE = `@${BOT_USERNAME}`;

/** Ochish uchun havola */
export const BOT_URL = `https://t.me/${BOT_USERNAME}`;

/** Botga tayyor matn bilan o'tish: `https://t.me/bot?start=...` */
export function botStartUrl(payload: string): string {
  return `${BOT_URL}?start=${encodeURIComponent(payload)}`;
}
