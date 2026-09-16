/**
 * Bildirishnomalar xizmati.
 *
 * — ilova ichida `Notification` yozuvi yaratiladi (qo'ng'iroqcha ro'yxati uchun);
 * — foydalanuvchining Telegram chatiga xabar yuboriladi (agar o'chirilmagan bo'lsa).
 *
 * DIQQAT: bu fayldagi eksport nomlari boshqa modullarda ishlatiladi — o'zgartirmang.
 */
import { prisma } from '@savdoiq/db';
import { env } from '../env.js';

const TELEGRAM_API = 'https://api.telegram.org';
/** Bot API so'rovi uchun maksimal kutish vaqti */
const SEND_TIMEOUT_MS = 10_000;

/** Ruxsat etilgan bildirishnoma turlari (Notification.type) */
const NOTIFY_TYPES = ['info', 'success', 'warning', 'danger'] as const;
type NotifyType = (typeof NOTIFY_TYPES)[number];

export interface NotifyInput {
  /** 'info' | 'success' | 'warning' | 'danger' — noto'g'ri qiymat 'info' ga aylanadi */
  type?: string;
  title: string;
  body?: string;
  /** Ichki havola ('/dashboard') yoki to'liq URL */
  link?: string;
  /** false bo'lsa faqat ilova ichida ko'rinadi, Telegramga yuborilmaydi */
  telegram?: boolean;
  /**
   * Telegram xabari ostidagi tugma yozuvi. Berilsa `link` matn havolasi
   * o'rniga inline tugma bo'lib chiqadi ("Buyurtmani ko'rish" kabi).
   */
  buttonText?: string;
  /**
   * Foydalanuvchining shu sozlamasi o'chirilgan bo'lsa — xabar umuman
   * yaratilmaydi. Sozlamalar sahifasidagi tugmachalar shu maydonlar.
   */
  requireFlag?: 'notifyDaily' | 'notifyOrders' | 'notifyStock';
}

function normalizeType(type?: string): NotifyType {
  return NOTIFY_TYPES.includes((type ?? 'info') as NotifyType) ? ((type ?? 'info') as NotifyType) : 'info';
}

/** HTML parse_mode uchun maxsus belgilarni himoyalash */
function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Nisbiy havolani sayt manziliga nisbatan to'liq URL'ga aylantiradi */
function absoluteLink(link?: string | null): string | null {
  if (!link) return null;
  if (/^https?:\/\//i.test(link)) return link;
  const base = env.webUrl.replace(/\/+$/, '');
  return `${base}${link.startsWith('/') ? link : `/${link}`}`;
}

/** Telegram xabari matni: sarlavha + tavsif + havola */
function buildMessage(n: NotifyInput): string {
  const parts: string[] = [`<b>${escapeHtml(n.title)}</b>`];
  if (n.body) parts.push(escapeHtml(n.body));
  const url = absoluteLink(n.link);
  // Tugma bo'lsa matn havolasi takrorlanmaydi
  if (url && !n.buttonText) parts.push(`<a href="${escapeHtml(url)}">Ochish →</a>`);
  return parts.join('\n\n');
}

/** Havola va tugma yozuvi bo'lsa — xabar ostidagi bitta inline tugma */
function buildMarkup(n: NotifyInput): unknown | undefined {
  const url = absoluteLink(n.link);
  if (!url || !n.buttonText) return undefined;
  return { inline_keyboard: [[{ text: n.buttonText, url }]] };
}

/**
 * Telegram Bot API orqali xabar yuboradi (HTML rejimi).
 * Token yoki chat bo'lmasa — `false`, xatolik yuz bersa ham `false` (jarayon to'xtamaydi).
 */
export async function sendTelegramMessage(
  chatId: string,
  text: string,
  opts?: { markup?: unknown },
): Promise<boolean> {
  const token = env.telegram.botToken;
  if (!token || !chatId || !text) return false;

  const payload: Record<string, unknown> = {
    chat_id: chatId,
    text,
    parse_mode: 'HTML',
    disable_web_page_preview: true,
  };
  if (opts?.markup !== undefined) payload.reply_markup = opts.markup;

  try {
    const res = await fetch(`${TELEGRAM_API}/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
    });
    if (!res.ok) {
      /*
       * Sababni ham yozamiz. Ilgari faqat holat kodi chiqardi va "400" nima
       * uchun ekanini bilish uchun har safar qo'lda tekshirish kerak bo'lardi —
       * holbuki Telegram sababni javob tanasida aniq aytadi
       * ("chat not found", "bot was blocked by the user" va hokazo).
       */
      const detail = await res
        .json()
        .then((d) => (d as { description?: string }).description ?? '')
        .catch(() => '');
      // eslint-disable-next-line no-console
      console.warn(`[notify] telegram javobi: ${res.status}${detail ? ` — ${detail}` : ''}`);
      return false;
    }
    const data = (await res.json()) as { ok?: boolean; description?: string };
    if (data.ok !== true) {
      // eslint-disable-next-line no-console
      console.warn('[notify] telegram xatosi:', data.description ?? 'noma’lum');
      return false;
    }
    return true;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[notify] telegramga yuborib bo‘lmadi:', err instanceof Error ? err.message : err);
    return false;
  }
}

/**
 * Foydalanuvchiga bildirishnoma: bazaga yoziladi va (agar `telegram !== false`)
 * botChatId / telegramId ga Telegram xabari yuboriladi.
 */
export async function notifyUser(userId: string, n: NotifyInput): Promise<void> {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        botChatId: true,
        telegramId: true,
        notifyDaily: true,
        notifyOrders: true,
        notifyStock: true,
      },
    });
    if (!user) return;

    /**
     * Foydalanuvchi bu turdagi xabarni o'chirgan bo'lsa — hech narsa
     * yaratilmaydi. Yozuv qoldirilsa, bot kuzatuvchisi (watcher) uni
     * baribir Telegramga jo'natardi: u sozlamani tekshirmaydi.
     */
    if (n.requireFlag && user[n.requireFlag] === false) return;

    const wantsTelegram = n.telegram !== false;

    const created = await prisma.notification.create({
      data: {
        userId: user.id,
        type: normalizeType(n.type),
        channel: wantsTelegram ? 'telegram' : 'app',
        title: n.title.slice(0, 200),
        body: n.body ? n.body.slice(0, 2000) : null,
        link: n.link ?? null,
      },
      select: { id: true },
    });

    if (!wantsTelegram) return;

    const chatId = user.botChatId ?? user.telegramId;
    if (!chatId) return;

    const sent = await sendTelegramMessage(chatId, buildMessage(n), { markup: buildMarkup(n) });
    if (sent) {
      await prisma.notification.update({ where: { id: created.id }, data: { sentAt: new Date() } });
    }
  } catch (err) {
    // Bildirishnoma asosiy jarayonni hech qachon to'xtatmasligi kerak
    // eslint-disable-next-line no-console
    console.warn('[notify] notifyUser xatosi:', err instanceof Error ? err.message : err);
  }
}

/** Kompaniyaning barcha egalariga (owner) bildirishnoma yuboradi */
export async function notifyCompanyOwners(companyId: string, n: NotifyInput): Promise<void> {
  try {
    const owners = await prisma.membership.findMany({
      where: { companyId, role: 'owner' },
      select: { userId: true },
    });
    for (const owner of owners) {
      await notifyUser(owner.userId, n);
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[notify] notifyCompanyOwners xatosi:', err instanceof Error ? err.message : err);
  }
}
