/**
 * SavdoIQ Telegram bot — kirish nuqtasi.
 *
 * Ishga tushirish:  npm run dev --workspace @savdoiq/bot
 *
 *  • TELEGRAM_BOT_TOKEN bo'lmasa — aniq xabar chiqarib, xatosiz tugaydi (exit 0).
 *  • TELEGRAM_WEBHOOK_URL berilgan bo'lsa webhook rejimi, aks holda long polling.
 *  • Fon jarayonlari: kunlik hisobot (09:00) va kuzatuvchi (har 30 soniya).
 */
import http from 'node:http';
import { Bot, GrammyError, HttpError, webhookCallback } from 'grammy';
import { env } from './lib/env.js';
import { disconnectDb } from './lib/db.js';
import { registerHandlers } from './handlers/index.js';
import { startDailyJob } from './jobs/daily.js';
import { startWatcherJob } from './jobs/watcher.js';
import type { BotContext } from './handlers/context.js';

/* eslint-disable no-console */

/** Menyudagi buyruqlar ro'yxati (admin buyruqlari yashirin) */
const COMMANDS_UZ = [
  { command: 'start', description: 'Boshlash / ro‘yxatdan o‘tish' },
  { command: 'help', description: 'Yordam va imkoniyatlar' },
  { command: 'id', description: 'Telegram ID' },
  { command: 'support', description: 'Qo‘llab-quvvatlash' },
  { command: 'cancel', description: 'Amaldagi amalni bekor qilish' },
];

const COMMANDS_RU = [
  { command: 'start', description: 'Начать / регистрация' },
  { command: 'help', description: 'Помощь и возможности' },
  { command: 'id', description: 'Telegram ID' },
  { command: 'support', description: 'Поддержка' },
  { command: 'cancel', description: 'Отменить текущее действие' },
];

function missingTokenNotice(): void {
  console.error(
    [
      '',
      '⚠️  TELEGRAM_BOT_TOKEN topilmadi — bot ishga tushmadi.',
      '',
      '   Nima qilish kerak:',
      '     1) Telegramda @BotFather ga /newbot yozib bot yarating;',
      '     2) olingan tokenni loyiha ildizidagi .env fayliga qo‘shing:',
      '          TELEGRAM_BOT_TOKEN=123456789:AA...',
      '          TELEGRAM_BOT_USERNAME=savdoiq_bot',
      '     3) botni qayta ishga tushiring: npm run dev:bot',
      '',
      '   API va sayt bu tokensiz ham ishlayveradi.',
      '',
    ].join('\n'),
  );
}

async function main(): Promise<void> {
  const token = env.telegram.botToken;
  if (!token) {
    missingTokenNotice();
    process.exit(0);
  }

  const bot = new Bot<BotContext>(token);
  registerHandlers(bot);

  // Har qanday xato botni to'xtatmasligi kerak
  bot.catch((err) => {
    const e = err.error;
    if (e instanceof GrammyError) {
      console.warn('[bot] Telegram xatosi:', e.description);
    } else if (e instanceof HttpError) {
      console.warn('[bot] tarmoq xatosi:', e.message);
    } else {
      console.error('[bot] kutilmagan xato:', e instanceof Error ? e.message : e);
    }
  });

  try {
    await bot.init();
  } catch (err) {
    console.error(
      '[bot] Telegram bilan bog‘lanib bo‘lmadi (token noto‘g‘ri yoki internet yo‘q):',
      err instanceof Error ? err.message : err,
    );
    process.exit(1);
  }

  try {
    await bot.api.setMyCommands(COMMANDS_UZ);
    await bot.api.setMyCommands(COMMANDS_RU, { language_code: 'ru' });
  } catch {
    // Buyruqlar ro'yxatini o'rnatib bo'lmasa ham bot ishlayveradi
  }

  const timers = [startDailyJob(bot), startWatcherJob(bot)];
  let server: http.Server | null = null;

  if (env.telegram.webhookUrl) {
    // ── Webhook rejimi ──────────────────────────────────────
    const handle = webhookCallback(bot, 'http', {
      secretToken: env.telegram.webhookSecret || undefined,
    });

    server = http.createServer((req, res) => {
      if (req.method === 'POST') {
        void handle(req, res);
        return;
      }
      res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('SavdoIQ bot ishlayapti');
    });

    server.listen(env.telegram.webhookPort, () => {
      console.log(`[bot] webhook rejimi, port ${env.telegram.webhookPort}`);
    });

    await bot.api.setWebhook(env.telegram.webhookUrl, {
      ...(env.telegram.webhookSecret ? { secret_token: env.telegram.webhookSecret } : {}),
      drop_pending_updates: false,
    });
    console.log(`[bot] @${bot.botInfo.username} webhook: ${env.telegram.webhookUrl}`);
  } else {
    // ── Long polling ────────────────────────────────────────
    void bot.start({
      drop_pending_updates: false,
      onStart: (info) => {
        console.log(`[bot] @${info.username} ishga tushdi (long polling)`);
      },
    });
  }

  console.log(`[bot] sayt: ${env.webUrl} · adminlar: ${env.telegram.adminIds.length}`);

  // ── To'xtatish ────────────────────────────────────────────
  let stopping = false;
  const shutdown = async (signal: string): Promise<void> => {
    if (stopping) return;
    stopping = true;
    console.log(`[bot] ${signal} — to‘xtatilmoqda…`);
    for (const timer of timers) clearInterval(timer);
    try {
      await bot.stop();
    } catch {
      // Webhook rejimida bot.stop() kerak emas
    }
    server?.close();
    await disconnectDb();
    process.exit(0);
  };

  process.once('SIGINT', () => void shutdown('SIGINT'));
  process.once('SIGTERM', () => void shutdown('SIGTERM'));
}

void main().catch((err: unknown) => {
  console.error('[bot] ishga tushirishda xato:', err instanceof Error ? err.message : err);
  process.exit(1);
});
