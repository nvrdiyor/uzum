/**
 * Kuzatuvchi — har 30 soniyada (BOT_WATCHER_MS) ikki narsani tekshiradi:
 *
 *  1) tugallangan to'liq sinxronizatsiyalar (SyncJob) — kompaniya egalariga
 *     «ma'lumotlar tayyor» xabari yuboriladi. Takrorlanmasligi uchun oxirgi
 *     xabar berilgan job identifikatori `CompanySetting` da saqlanadi;
 *  2) yuborilmagan bildirishnomalar (Notification.sentAt = null) — Telegramga
 *     jo'natiladi va `sentAt` bilan belgilanadi.
 *
 * Har qanday xato jarayonni to'xtatmaydi — keyingi tsiklda qayta urinadi.
 */
import { InlineKeyboard, type Bot } from 'grammy';
import { prisma } from '../lib/db.js';
import { env } from '../lib/env.js';
import { toBotLang, tr, type BotLang } from '../i18n.js';
import { clampMessage, escapeHtml, loadCompany, sleep, webLink, type BotContext } from '../handlers/context.js';
import { siteKeyboard, syncRetryKeyboard } from '../handlers/keyboards.js';
import { followsJob, keyFailText, loadKeyFailInfo, type KeyFailInfo } from '../handlers/sync.js';

/** Oxirgi xabar berilgan sinxronizatsiya id'si shu kalit ostida saqlanadi */
const SYNC_SETTING_KEY = 'bot:lastSyncNotifiedJobId';
/** Qancha vaqt ichida tugagan sinxronlar hisobga olinadi */
const SYNC_LOOKBACK_MS = 24 * 60 * 60 * 1000;
/** Bir tsiklda nechta bildirishnoma yuboriladi */
const NOTIFY_BATCH = 30;
/** Bildirishnomalar eskirish muddati (bundan oldingilari yuborilmaydi) */
const NOTIFY_MAX_AGE_MS = 3 * 24 * 60 * 60 * 1000;
const SEND_DELAY_MS = 60;

const TYPE_ICON: Record<string, string> = {
  info: 'ℹ️',
  success: '✅',
  warning: '⚠️',
  danger: '🔴',
};

// ─────────────────────────── 1. Tugagan sinxronizatsiyalar ───────────────────────────

async function notifyFinishedSyncs(bot: Bot<BotContext>): Promise<void> {
  const jobs = await prisma.syncJob.findMany({
    where: {
      type: 'full',
      status: { in: ['done', 'failed'] },
      finishedAt: { gte: new Date(Date.now() - SYNC_LOOKBACK_MS) },
    },
    orderBy: { finishedAt: 'desc' },
    take: 50,
    select: { id: true, companyId: true, status: true, uzumAccountId: true },
  });

  const handled = new Set<string>();

  for (const job of jobs) {
    if (handled.has(job.companyId)) continue; // kompaniya bo'yicha faqat eng oxirgisi
    handled.add(job.companyId);

    const marker = await prisma.companySetting.findUnique({
      where: { companyId_key: { companyId: job.companyId, key: SYNC_SETTING_KEY } },
      select: { value: true },
    });
    if (marker?.value === job.id) continue;

    /*
     * Xabar uchun kerakli hamma narsa belgidan OLDIN o'qiladi: baza xatosi
     * bo'lsa job belgilanmaydi va keyingi tsiklda yana urinadi (ilgari belgi
     * birinchi qo'yilib, keyingi so'rov yiqilsa xabar butunlay yo'qolardi).
     *
     * Yiqilgan birinchi yig'ish: kalit rad etilgan bo'lsa (api failJob kabinetni
     * 'invalid' qiladi) — kalitni yangilash (kabinet bir nechta bo'lsa — saytda,
     * handlers/sync.ts keyFailText); boshqa sabab (Uzum javob bermadi) —
     * vaqtinchalik, «🔄 Qayta urinish» bilan. Ilgari har qanday xatoda "kalitni
     * qayta ulang" deyilardi va sotuvchi yaroqli kalitni bekorga almashtirardi,
     * qo'lda sinxron xabari esa xuddi shu paytda "vaqtinchalik" der edi (2026-11-12).
     */
    const keyRejected =
      job.status === 'failed' && job.uzumAccountId
        ? (await prisma.uzumAccount.findUnique({ where: { id: job.uzumAccountId }, select: { status: true } }))
            ?.status === 'invalid'
        : false;
    const keyInfo = keyRejected ? await loadKeyFailInfo(job.companyId, job.uzumAccountId) : null;
    const owners = await prisma.membership.findMany({
      where: { companyId: job.companyId, role: 'owner' },
      select: { user: { select: { id: true, botChatId: true, languageCode: true } } },
    });

    // Takror yuborilmasligi uchun xabarlardan oldin belgilaymiz
    await prisma.companySetting.upsert({
      where: { companyId_key: { companyId: job.companyId, key: SYNC_SETTING_KEY } },
      create: { companyId: job.companyId, key: SYNC_SETTING_KEY, value: job.id },
      update: { value: job.id },
    });

    if (job.status === 'done') {
      await prisma.company.update({
        where: { id: job.companyId },
        data: { onboardStep: 'done', onboarded: true },
      });
    }

    for (const owner of owners) {
      const chatId = owner.user.botChatId;
      if (!chatId) continue;
      // Sinxronni botdan o'zi boshlagan ega natijani o'sha xabarda oladi — ikkinchi marta yuborilmaydi
      if (followsJob(job.id, chatId)) continue;
      const lang = toBotLang(owner.user.languageCode);
      try {
        const view = await finishedView(lang, job, keyInfo, owner.user.id);
        await bot.api.sendMessage(chatId, view.text, { parse_mode: 'HTML', reply_markup: view.markup });
      } catch {
        // Chat yopilgan bo'lishi mumkin — e'tiborsiz qoldiramiz
      }
      await sleep(SEND_DELAY_MS);
    }
  }
}

/** Birinchi yig'ish natijasi haqidagi xabar (egaga) */
async function finishedView(
  lang: BotLang,
  job: { companyId: string; status: string },
  keyInfo: KeyFailInfo | null,
  userId: string,
): Promise<{ text: string; markup: InlineKeyboard }> {
  if (job.status === 'done') return { text: tr(lang, 'sync_done'), markup: siteKeyboard(lang) };
  if (keyInfo) {
    const view = keyFailText(lang, 'owner', keyInfo);
    return { text: view.text, markup: view.markup ?? siteKeyboard(lang) };
  }
  /*
   * «🔄 Qayta urinish» (sync:menu) foydalanuvchining BIRINCHI kompaniyasini
   * sinxronlaydi — bot bir vaqtda bitta kompaniya bilan ishlaydi (context.ts
   * loadCompany). Yiqilgan kompaniya boshqasi bo'lsa, tugma noto'g'ri
   * kompaniyani sinxronlab yuborardi — shunda saytga yuboramiz.
   */
  const first = await loadCompany(userId).catch(() => null);
  return {
    text: tr(lang, 'sync_fail_temp'),
    markup: first?.id === job.companyId ? syncRetryKeyboard(lang) : siteKeyboard(lang),
  };
}

// ─────────────────────────── 2. Yuborilmagan bildirishnomalar ───────────────────────────

/** Bildirishnoma matni: turi, sarlavha va tavsif */
function buildNotificationText(type: string, title: string, body: string | null): string {
  const icon = TYPE_ICON[type] ?? TYPE_ICON.info;
  const parts = [`${icon} <b>${escapeHtml(title)}</b>`];
  if (body) parts.push(escapeHtml(body));
  return clampMessage(parts.join('\n\n'));
}

async function deliverNotifications(bot: Bot<BotContext>): Promise<void> {
  const rows = await prisma.notification.findMany({
    where: {
      sentAt: null,
      readAt: null,
      createdAt: { gte: new Date(Date.now() - NOTIFY_MAX_AGE_MS) },
    },
    orderBy: { createdAt: 'asc' },
    take: NOTIFY_BATCH,
    select: {
      id: true,
      type: true,
      title: true,
      body: true,
      link: true,
      user: { select: { botChatId: true, telegramId: true, languageCode: true } },
    },
  });

  for (const n of rows) {
    const chatId = n.user.botChatId ?? n.user.telegramId;

    if (chatId) {
      const lang = toBotLang(n.user.languageCode);
      const url = n.link ? (/^https?:\/\//i.test(n.link) ? n.link : webLink(n.link)) : null;
      const markup = url ? new InlineKeyboard().url(tr(lang, 'btn_open_site'), url) : undefined;
      try {
        await bot.api.sendMessage(chatId, buildNotificationText(n.type, n.title, n.body), {
          parse_mode: 'HTML',
          link_preview_options: { is_disabled: true },
          reply_markup: markup,
        });
      } catch {
        // Yuborib bo'lmadi — baribir belgilaymiz, aks holda navbat tiqilib qoladi
      }
    }

    await prisma.notification.update({ where: { id: n.id }, data: { sentAt: new Date() } });
    await sleep(SEND_DELAY_MS);
  }
}

// ─────────────────────────── Tsikl ───────────────────────────

/** Bir tsiklni qo'lda bajarish (test va boshqaruv uchun) */
export async function runWatcherOnce(bot: Bot<BotContext>): Promise<void> {
  await notifyFinishedSyncs(bot);
  await deliverNotifications(bot);
}

/** Kuzatuvchini ishga tushiradi (setInterval — tashqi paketsiz) */
export function startWatcherJob(bot: Bot<BotContext>): NodeJS.Timeout {
  const timer = setInterval(() => {
    void runWatcherOnce(bot).catch((err: unknown) => {
      // eslint-disable-next-line no-console
      console.warn('[bot] kuzatuvchi xatosi:', err instanceof Error ? err.message : err);
    });
  }, env.watcherIntervalMs);
  timer.unref();
  return timer;
}
