/**
 * Bot muhit sozlamalari.
 * Monorepo ildizidagi `.env` fayldan o'qiladi — apps/api/src/env.ts bilan bir xil mantiq
 * (ayniqsa SESSION_SECRET va ENCRYPTION_KEY: shifrlash natijasi bir xil bo'lishi shart).
 */
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
// monorepo ildizidagi .env (apps/bot/src/lib → ../../../../.env)
dotenv.config({ path: path.resolve(here, '../../../../.env') });
dotenv.config();

const num = (v: string | undefined, def: number): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
};

export const env = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  isProd: process.env.NODE_ENV === 'production',

  /** Sayt manzili — botdagi havolalar shundan quriladi */
  webUrl: (process.env.WEB_URL ?? 'http://localhost:5173').replace(/\/+$/, ''),
  apiUrl: (process.env.API_URL ?? 'http://localhost:4000').replace(/\/+$/, ''),

  /** apps/api/src/env.ts dagi standart qiymat bilan AYNAN bir xil bo'lishi shart */
  sessionSecret: process.env.SESSION_SECRET ?? 'dev-session-secret-change-me-please-32ch',
  /** 32 bayt hex (64 belgi) — Uzum API kalitlarini AES-256-GCM bilan shifrlash uchun */
  encryptionKey: process.env.ENCRYPTION_KEY ?? '',

  telegram: {
    botToken: process.env.TELEGRAM_BOT_TOKEN ?? '',
    botUsername: (process.env.TELEGRAM_BOT_USERNAME ?? 'savdoiq_bot').replace(/^@/, ''),
    adminIds: (process.env.TELEGRAM_ADMIN_IDS ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    /** Bo'sh bo'lsa long polling ishlatiladi */
    webhookUrl: process.env.TELEGRAM_WEBHOOK_URL ?? '',
    webhookSecret: process.env.TELEGRAM_WEBHOOK_SECRET ?? '',
    webhookPort: num(process.env.BOT_PORT ?? process.env.TELEGRAM_WEBHOOK_PORT, 4100),
  },

  billing: {
    /** Qo'lda to'lov uchun karta (tarif bo'limida ko'rsatiladi) */
    manualCard: process.env.MANUAL_CARD ?? '',
    manualCardOwner: process.env.MANUAL_CARD_OWNER ?? '',
  },

  /** Doimiy vaqt mintaqasi — kunlik hisobot shu bo'yicha yuboriladi */
  timezoneOffsetMinutes: num(process.env.BOT_TZ_OFFSET_MINUTES, 300), // Asia/Tashkent = UTC+5
  /** Kunlik hisobot vaqti (mahalliy soat) */
  dailyReportHour: num(process.env.BOT_DAILY_HOUR, 9),
  /** Tugagan sinxronlarni tekshirish oralig'i (ms) */
  watcherIntervalMs: num(process.env.BOT_WATCHER_MS, 30_000),
} as const;

/** Adminmi? */
export function isAdmin(telegramId: string | number | undefined | null): boolean {
  if (telegramId === undefined || telegramId === null) return false;
  return env.telegram.adminIds.includes(String(telegramId));
}
