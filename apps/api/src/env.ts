import dotenv from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * `.env` ni yuqoriga qarab qidiradi — manba (`src`) va yig'ilgan (`dist`) holatda
 * bir xil ishlashi uchun (apps/bot/src/lib/env.ts bilan bir xil mantiq).
 */
function loadEnv(): void {
  let dir = path.dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 7; i += 1) {
    const candidate = path.join(dir, '.env');
    if (fs.existsSync(candidate)) {
      dotenv.config({ path: candidate });
      break;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  dotenv.config();
}

loadEnv();

const bool = (v: string | undefined, def = false): boolean => {
  if (v === undefined) return def;
  return ['1', 'true', 'yes', 'on'].includes(v.toLowerCase());
};

const num = (v: string | undefined, def: number): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
};

export const env = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  isProd: process.env.NODE_ENV === 'production',
  port: num(process.env.API_PORT ?? process.env.PORT, 4000),
  host: process.env.API_HOST ?? '0.0.0.0',

  /** Sayt manzili (CORS + Telegram login uchun domain) */
  webUrl: process.env.WEB_URL ?? 'http://localhost:5173',
  apiUrl: process.env.API_URL ?? 'http://localhost:4000',

  databaseUrl: process.env.DATABASE_URL ?? 'file:./prisma/dev.db',

  /** 32+ belgidan iborat maxfiy kalit — sessiya tokenlari uchun */
  sessionSecret: process.env.SESSION_SECRET ?? 'dev-session-secret-change-me-please-32ch',
  /** 32 bayt hex (64 belgi) — API kalitlarni AES-256-GCM bilan shifrlash uchun */
  encryptionKey: process.env.ENCRYPTION_KEY ?? '',

  telegram: {
    botToken: process.env.TELEGRAM_BOT_TOKEN ?? '',
    botUsername: process.env.TELEGRAM_BOT_USERNAME ?? 'savdoiq_bot',
    adminIds: (process.env.TELEGRAM_ADMIN_IDS ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  },

  uzum: {
    baseUrl: process.env.UZUM_API_BASE ?? 'https://api-seller.uzum.uz/api/seller-openapi',
    /** demo — real API'siz ishlash (namunaviy ma'lumot generatsiya qilinadi) */
    mode: (process.env.UZUM_MODE ?? 'demo') as 'demo' | 'live',
    timeoutMs: num(process.env.UZUM_TIMEOUT_MS, 30_000),
    maxRetries: num(process.env.UZUM_MAX_RETRIES, 3),
    rpsLimit: num(process.env.UZUM_RPS, 3),
  },

  sync: {
    /** Ishchi jarayon API bilan birga ishga tushsinmi */
    inProcessWorker: bool(process.env.SYNC_IN_PROCESS, true),
    pollMs: num(process.env.SYNC_POLL_MS, 3_000),
    /** Demo rejimida 30 daqiqalik jarayonni tezlashtirish (test uchun) */
    speedFactor: num(process.env.SYNC_SPEED_FACTOR, 1),
    concurrency: num(process.env.SYNC_CONCURRENCY, 2),
  },

  billing: {
    paymeMerchantId: process.env.PAYME_MERCHANT_ID ?? '',
    paymeKey: process.env.PAYME_KEY ?? '',
    clickMerchantId: process.env.CLICK_MERCHANT_ID ?? '',
    clickServiceId: process.env.CLICK_SERVICE_ID ?? '',
    clickSecret: process.env.CLICK_SECRET ?? '',
    /** Qo'lda to'lov uchun karta ma'lumotlari (botda ko'rsatiladi) */
    manualCard: process.env.MANUAL_CARD ?? '',
    manualCardOwner: process.env.MANUAL_CARD_OWNER ?? '',
  },

  rateLimit: {
    windowMs: num(process.env.RATE_WINDOW_MS, 60_000),
    max: num(process.env.RATE_MAX, 300),
  },

  logLevel: process.env.LOG_LEVEL ?? 'info',
  trustProxy: bool(process.env.TRUST_PROXY, false),
} as const;

export function assertProdConfig(): string[] {
  const problems: string[] = [];
  if (!env.isProd) return problems;
  if (env.sessionSecret.length < 32) problems.push('SESSION_SECRET kamida 32 belgi bo‘lishi kerak');
  if (!/^[0-9a-fA-F]{64}$/.test(env.encryptionKey))
    problems.push('ENCRYPTION_KEY 64 ta hex belgidan iborat bo‘lishi kerak (32 bayt)');
  if (!env.telegram.botToken) problems.push('TELEGRAM_BOT_TOKEN kiritilmagan');
  return problems;
}
