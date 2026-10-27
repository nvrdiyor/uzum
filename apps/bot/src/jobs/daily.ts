/**
 * Kunlik hisobot — har kuni soat 09:00 (Asia/Tashkent) `notifyDaily` yoqilgan
 * foydalanuvchilarga kechagi natijalarni yuboradi.
 *
 * `cron` paketi yo'q, shuning uchun oddiy `setInterval` bilan har daqiqada tekshiramiz.
 * Takroran yuborilmasligi uchun yuborilgan kun `AuditLog` da belgilanadi — bot qayta
 * ishga tushsa ham xabar ikki marta ketmaydi.
 */
import type { Bot } from 'grammy';
import { asMemberView, hasFeature, resolvePlan, viewSeesMoney } from '@savdoiq/shared';
import { prisma } from '../lib/db.js';
import { env } from '../lib/env.js';
import { toBotLang, tr } from '../i18n.js';
import { clampMessage, sleep, type BotContext } from '../handlers/context.js';
import { pricingKeyboard, siteKeyboard } from '../handlers/keyboards.js';
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

/**
 * Obunasi tugagan kompaniyaga hisobot o'rniga tarifni yangilash taklifi
 * shu kunlarda boradi (tugagan kundan keyingi N-kun, Toshkent kuni bo'yicha),
 * 30-kundan keyin — jim. Har kuni emas: to'lamagan mijozga har ertalab
 * "to'lang" deyish spam bo'lardi. 0-kunda taklif yo'q: API
 * (subscription-alerts) "tarif muddati tugadi" xabarini tugashdan oldingi
 * oxirgi sutkada alohida yuboradi.
 */
const LOCKED_OFFER_DAYS = new Set([1, 3, 7, 14, 30]);

/** Xotiradagi belgi — bazaga ortiqcha so'rov bo'lmasligi uchun */
let lastRunDay: string | null = null;

interface DailyStats {
  sent: number;
  /** Hisobot o'rniga yuborilgan tarif taklifi */
  offers: number;
  failed: number;
  skipped: number;
}

type SubRow = { plan: string; status: string; expiresAt: Date; canceledAt: Date | null };

/** Obuna qaysi kundan beri yopiq: bekor qilingan bo'lsa — o'sha kundan, aks holda tugash kunidan */
function lockedSinceKey(sub: SubRow): string {
  const since = sub.canceledAt && sub.canceledAt < sub.expiresAt ? sub.canceledAt : sub.expiresAt;
  return localDateKey(since);
}

/** Ikki 'YYYY-MM-DD' kalit orasidagi kunlar (b − a) */
function daysBetweenKeys(a: string, b: string): number {
  return Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);
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
  const stats: DailyStats = { sent: 0, offers: 0, failed: 0, skipped: 0 };
  const range = yesterdayRange(now);

  const users = await prisma.user.findMany({
    where: { notifyDaily: true, status: 'active', botChatId: { not: null } },
    select: {
      id: true,
      botChatId: true,
      languageCode: true,
      memberships: { select: { companyId: true, role: true, view: true }, orderBy: { createdAt: 'asc' }, take: 1 },
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

  // Tarif — sayt va API bilan bir xil qoida (`resolvePlan`)
  const subs = await prisma.subscription.findMany({
    where: { companyId: { in: companyIds } },
    select: { companyId: true, plan: true, status: true, expiresAt: true, canceledAt: true },
  });
  const subByCompany = new Map<string, SubRow>(subs.map((s) => [s.companyId, s]));
  const todayKey = localDateKey(now);

  const cache = new Map<string, { report: DayReport; alert: StockAlert }>();

  for (const user of users) {
    const companyId = user.memberships[0]?.companyId;
    const chatId = user.botChatId;
    if (!companyId || !chatId || !connected.has(companyId)) {
      stats.skipped += 1;
      continue;
    }

    /*
     * Obuna tugagan — raqamlar yuborilmaydi. Ilgari bot tarifni tekshirmasdi:
     * sayt va API yopilgan bo'lsa ham kechagi tushum va foyda har ertalab
     * Telegramga kelaverardi.
     */
    const sub = subByCompany.get(companyId) ?? null;
    if (!hasFeature(resolvePlan(sub, now.getTime()), 'telegram_notifications')) {
      const lang = toBotLang(user.languageCode);
      if (!sub || !LOCKED_OFFER_DAYS.has(daysBetweenKeys(lockedSinceKey(sub), todayKey))) {
        stats.skipped += 1;
        continue;
      }
      try {
        await bot.api.sendMessage(chatId, tr(lang, 'plan_locked_digest'), {
          parse_mode: 'HTML',
          reply_markup: pricingKeyboard(lang),
        });
        stats.offers += 1;
      } catch {
        stats.failed += 1;
      }
      await sleep(SEND_DELAY_MS);
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
    /*
     * Foyda — faqat pulni ko'radigan a'zoga (saytdagi ko'rinish shabloni, shared
     * views.ts). Ilgari kunlik xabar omborchiga ham kechagi sof foydani yuborardi.
     */
    const member = user.memberships[0];
    const seesMoney = member?.role === 'owner' || viewSeesMoney(asMemberView(member?.view));
    const text = clampMessage(dailyDigestText(lang, range.key, data.report, data.alert, seesMoney));

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
  console.log(
    `[bot] kunlik hisobot ${dayKey}: yuborildi ${stats.sent}, tarif taklifi ${stats.offers}, xato ${stats.failed}`,
  );
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
