/**
 * Kunlik hisobot — har kuni soat 09:00 (Asia/Tashkent) `notifyDaily` yoqilgan
 * foydalanuvchilarga kechagi natijalarni yuboradi.
 *
 * `cron` paketi yo'q, shuning uchun oddiy `setInterval` bilan har daqiqada tekshiramiz.
 * Takroran yuborilmasligi uchun yuborilgan kun `AuditLog` da belgilanadi — bot qayta
 * ishga tushsa ham xabar ikki marta ketmaydi.
 */
import type { Bot } from 'grammy';
import { prisma } from '../lib/db.js';
import { env } from '../lib/env.js';
import { toBotLang } from '../i18n.js';
import { clampMessage, sleep, type BotContext } from '../handlers/context.js';
import { siteKeyboard } from '../handlers/keyboards.js';
import {
  buildCriticalStocks,
  buildDayReport,
  localDateKey,
  localHour,
  yesterdayRange,
  type DayReport,
  type StockAlert,
} from '../handlers/data.js';
import { dailyDigestText } from '../handlers/reports.js';

/** Har daqiqada tekshiramiz — kerakli soat kelganida bir marta ishlaydi */
const CHECK_INTERVAL_MS = 60_000;
/** Yuborishlar orasidagi pauza (Telegram limiti) */
const SEND_DELAY_MS = 60;
/** Takrorlanishni oldini oluvchi belgi */
const AUDIT_ACTION = 'bot.daily_report';

/** Xotiradagi belgi — bazaga ortiqcha so'rov bo'lmasligi uchun */
let lastRunDay: string | null = null;

interface DailyStats {
  sent: number;
  failed: number;
  skipped: number;
}

/** Shu kun uchun hisobot allaqachon yuborilganmi */
async function alreadySent(dayKey: string): Promise<boolean> {
  const row = await prisma.auditLog.findFirst({
    where: { action: AUDIT_ACTION, entityId: dayKey },
    select: { id: true },
  });
  return Boolean(row);
}

/**
 * Kechagi hisobotni barcha mos foydalanuvchilarga yuboradi.
 * Bir kompaniya uchun hisob faqat bir marta hisoblanadi (keshlanadi).
 */
export async function runDailyReports(bot: Bot<BotContext>, now = new Date()): Promise<DailyStats> {
  const stats: DailyStats = { sent: 0, failed: 0, skipped: 0 };
  const range = yesterdayRange(now);

  const users = await prisma.user.findMany({
    where: { notifyDaily: true, status: 'active', botChatId: { not: null } },
    select: {
      id: true,
      botChatId: true,
      languageCode: true,
      memberships: { select: { companyId: true }, orderBy: { createdAt: 'asc' }, take: 1 },
    },
  });
  if (users.length === 0) return stats;

  const companyIds = [...new Set(users.flatMap((u) => u.memberships.map((m) => m.companyId)))];
  if (companyIds.length === 0) return stats;

  // Faqat Uzum kabineti ulangan kompaniyalar uchun hisobot yuboriladi
  const accounts = await prisma.uzumAccount.findMany({
    where: { companyId: { in: companyIds } },
    select: { companyId: true },
  });
  const connected = new Set(accounts.map((a) => a.companyId));

  const cache = new Map<string, { report: DayReport; alert: StockAlert }>();

  for (const user of users) {
    const companyId = user.memberships[0]?.companyId;
    const chatId = user.botChatId;
    if (!companyId || !chatId || !connected.has(companyId)) {
      stats.skipped += 1;
      continue;
    }

    let data = cache.get(companyId);
    if (!data) {
      const [report, alert] = await Promise.all([
        buildDayReport(companyId, range.from, range.to),
        buildCriticalStocks(companyId, 5),
      ]);
      data = { report, alert };
      cache.set(companyId, data);
    }

    const lang = toBotLang(user.languageCode);
    const text = clampMessage(dailyDigestText(lang, range.key, data.report, data.alert));

    try {
      await bot.api.sendMessage(chatId, text, {
        parse_mode: 'HTML',
        link_preview_options: { is_disabled: true },
        reply_markup: siteKeyboard(lang),
      });
      stats.sent += 1;
    } catch {
      // Foydalanuvchi botni bloklagan bo'lishi mumkin — jarayon to'xtamaydi
      stats.failed += 1;
    }
    await sleep(SEND_DELAY_MS);
  }

  return stats;
}

/** Har daqiqalik tekshiruv */
async function tick(bot: Bot<BotContext>): Promise<void> {
  const now = new Date();
  if (localHour(now) < env.dailyReportHour) return;

  const dayKey = localDateKey(now);
  if (lastRunDay === dayKey) return;

  if (await alreadySent(dayKey)) {
    lastRunDay = dayKey;
    return;
  }

  const stats = await runDailyReports(bot, now);
  lastRunDay = dayKey;

  await prisma.auditLog.create({
    data: {
      action: AUDIT_ACTION,
      entity: 'bot',
      entityId: dayKey,
      meta: JSON.stringify(stats),
    },
  });

  // eslint-disable-next-line no-console
  console.log(`[bot] kunlik hisobot ${dayKey}: yuborildi ${stats.sent}, xato ${stats.failed}`);
}

/** Kunlik hisobot jarayonini ishga tushiradi */
export function startDailyJob(bot: Bot<BotContext>): NodeJS.Timeout {
  const timer = setInterval(() => {
    void tick(bot).catch((err: unknown) => {
      // eslint-disable-next-line no-console
      console.warn('[bot] kunlik hisobot xatosi:', err instanceof Error ? err.message : err);
    });
  }, CHECK_INTERVAL_MS);
  timer.unref();
  return timer;
}
