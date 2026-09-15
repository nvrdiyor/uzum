/**
 * Bildirishnomalar moduli.
 *
 * Ikki vazifani bajaradi:
 *  1) `/api/v1/notifications` marshrutlari (ro'yxat, o'qilgan belgilash, sozlamalar);
 *  2) boshqa modullar (billing, referral, admin) uchun umumiy bildirishnoma yuborish
 *     yordamchilari — bazaga yozadi va (bot tokeni bo'lsa) Telegramga jo'natadi.
 */
import { Router } from 'express';
import { prisma } from '@savdoiq/db';
import { settingsSchema, type Lang, type NotificationRow, type Paginated } from '@savdoiq/shared';
import { ah, AppError } from '../lib/errors.js';
import { ctx, requireAuth } from '../lib/auth.js';
import { env } from '../env.js';

const router = Router();

// ─────────────────────────── Umumiy yordamchilar ───────────────────────────

export type NotifyType = 'info' | 'success' | 'warning' | 'danger';

export interface NotifyPayload {
  type?: NotifyType;
  title: string;
  body?: string | null;
  link?: string | null;
  /** Telegramga ham yuborilsinmi (standart: ha) */
  telegram?: boolean;
}

const NOTIFY_TYPES: NotifyType[] = ['info', 'success', 'warning', 'danger'];

/** Bazadagi matnni xavfsiz `NotifyType` ga keltiradi */
export function asNotifyType(value: string | null | undefined): NotifyType {
  const v = (value ?? 'info') as NotifyType;
  return NOTIFY_TYPES.includes(v) ? v : 'info';
}

/** HTML uchun xavfsiz matn (Telegram parse_mode=HTML) */
function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Telegram Bot API orqali xabar yuborish.
 * Token yoki chat topilmasa — jimgina `false` qaytaradi (marshrut xato bermaydi).
 */
export async function sendTelegram(chatId: string | null | undefined, text: string): Promise<boolean> {
  const token = env.telegram.botToken;
  if (!token || !chatId) return false;
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** Bildirishnoma matnini Telegram uchun yig'adi */
function telegramText(payload: NotifyPayload): string {
  const parts = [`<b>${escapeHtml(payload.title)}</b>`];
  if (payload.body) parts.push(escapeHtml(payload.body));
  if (payload.link) parts.push(`${env.webUrl}${payload.link.startsWith('/') ? payload.link : `/${payload.link}`}`);
  return parts.join('\n\n');
}

/** Berilgan foydalanuvchilarga bildirishnoma yozadi (+ Telegram) */
export async function notifyUsers(userIds: string[], payload: NotifyPayload): Promise<number> {
  const ids = [...new Set(userIds.filter(Boolean))];
  if (ids.length === 0) return 0;

  const users = await prisma.user.findMany({
    where: { id: { in: ids } },
    select: { id: true, botChatId: true },
  });

  const text = telegramText(payload);
  let sent = 0;

  for (const u of users) {
    const created = await prisma.notification.create({
      data: {
        userId: u.id,
        type: payload.type ?? 'info',
        channel: 'app',
        title: payload.title.slice(0, 200),
        body: payload.body ? payload.body.slice(0, 2000) : null,
        link: payload.link ?? null,
      },
      select: { id: true },
    });
    if (payload.telegram !== false) {
      const ok = await sendTelegram(u.botChatId, text);
      if (ok) {
        sent += 1;
        /**
         * `sentAt` yozilmasa, navbatchi ishchi bu xabarni "hali yuborilmagan"
         * deb topib, Telegramga IKKINCHI marta jo'natadi.
         */
        await prisma.notification.update({ where: { id: created.id }, data: { sentAt: new Date() } });
      }
    }
  }
  return sent;
}

/** Kompaniya egalariga (owner) xabar */
export async function notifyCompanyOwners(companyId: string, payload: NotifyPayload): Promise<number> {
  const members = await prisma.membership.findMany({
    where: { companyId, role: 'owner' },
    select: { userId: true },
  });
  const ids = members.map((m) => m.userId);
  if (ids.length === 0) {
    // Egasi topilmasa — kompaniyaning istalgan a'zosiga yuboramiz
    const any = await prisma.membership.findMany({ where: { companyId }, select: { userId: true } });
    return notifyUsers(any.map((m) => m.userId), payload);
  }
  return notifyUsers(ids, payload);
}

/** Platforma administratorlariga xabar */
export async function notifyAdmins(payload: NotifyPayload): Promise<number> {
  const admins = await prisma.user.findMany({ where: { role: 'admin' }, select: { id: true } });
  return notifyUsers(admins.map((a) => a.id), payload);
}

// ─────────────────────────── Marshrutlar ───────────────────────────

router.use(requireAuth);

const toRow = (n: {
  id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  readAt: Date | null;
  createdAt: Date;
}): NotificationRow => ({
  id: n.id,
  type: asNotifyType(n.type),
  title: n.title,
  body: n.body,
  link: n.link,
  read: n.readAt !== null,
  createdAt: n.createdAt.toISOString(),
});

/** GET / — sahifalangan ro'yxat (?unread=1 bilan faqat o'qilmaganlar) */
router.get(
  '/',
  ah(async (req, res) => {
    const { user } = ctx(req);
    const q = req.query as Record<string, string | undefined>;
    const page = Math.max(1, Number(q.page ?? 1) || 1);
    const pageSize = Math.min(200, Math.max(1, Number(q.pageSize ?? 30) || 30));
    const onlyUnread = q.unread === '1' || q.unread === 'true';

    const where = { userId: user.id, ...(onlyUnread ? { readAt: null } : {}) };

    const [total, rows] = await Promise.all([
      prisma.notification.count({ where }),
      prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    const payload: Paginated<NotificationRow> = {
      items: rows.map(toRow),
      total,
      page,
      pageSize,
      pages: Math.max(1, Math.ceil(total / pageSize)),
    };
    res.json(payload);
  }),
);

/** GET /unread-count — o'qilmaganlar soni */
router.get(
  '/unread-count',
  ah(async (req, res) => {
    const { user } = ctx(req);
    const count = await prisma.notification.count({ where: { userId: user.id, readAt: null } });
    res.json({ count });
  }),
);

/** GET /settings — bildirishnoma sozlamalari */
router.get(
  '/settings',
  ah(async (req, res) => {
    const { user } = ctx(req);
    const fresh = await prisma.user.findUnique({ where: { id: user.id } });
    const u = fresh ?? user;
    res.json({
      language: (u.languageCode as Lang) ?? 'uz',
      notifyDaily: u.notifyDaily,
      notifyOrders: u.notifyOrders,
      notifyStock: u.notifyStock,
      timezone: u.timezone,
      telegramConnected: Boolean(u.botChatId),
    });
  }),
);

/** PUT /settings — sozlamalarni saqlash */
router.put(
  '/settings',
  ah(async (req, res) => {
    const { user } = ctx(req);
    const input = settingsSchema.parse(req.body ?? {});

    const updated = await prisma.user.update({
      where: { id: user.id },
      data: {
        ...(input.language ? { languageCode: input.language } : {}),
        ...(input.notifyDaily === undefined ? {} : { notifyDaily: input.notifyDaily }),
        ...(input.notifyOrders === undefined ? {} : { notifyOrders: input.notifyOrders }),
        ...(input.notifyStock === undefined ? {} : { notifyStock: input.notifyStock }),
        ...(input.timezone ? { timezone: input.timezone.slice(0, 60) } : {}),
      },
    });

    res.json({
      language: (updated.languageCode as Lang) ?? 'uz',
      notifyDaily: updated.notifyDaily,
      notifyOrders: updated.notifyOrders,
      notifyStock: updated.notifyStock,
      timezone: updated.timezone,
      telegramConnected: Boolean(updated.botChatId),
    });
  }),
);

/** POST /read-all — barchasini o'qilgan deb belgilash */
router.post(
  '/read-all',
  ah(async (req, res) => {
    const { user } = ctx(req);
    const result = await prisma.notification.updateMany({
      where: { userId: user.id, readAt: null },
      data: { readAt: new Date() },
    });
    res.json({ ok: true, count: result.count });
  }),
);

/** POST /:id/read — bittasini o'qilgan deb belgilash */
router.post(
  '/:id/read',
  ah(async (req, res) => {
    const { user } = ctx(req);
    const id = String(req.params.id);
    const found = await prisma.notification.findFirst({ where: { id, userId: user.id } });
    if (!found) throw AppError.notFound('Bildirishnoma topilmadi');
    if (!found.readAt) {
      await prisma.notification.update({ where: { id }, data: { readAt: new Date() } });
    }
    res.json({ ok: true });
  }),
);

/** DELETE /:id — o'chirish */
router.delete(
  '/:id',
  ah(async (req, res) => {
    const { user } = ctx(req);
    const id = String(req.params.id);
    const result = await prisma.notification.deleteMany({ where: { id, userId: user.id } });
    if (result.count === 0) throw AppError.notFound('Bildirishnoma topilmadi');
    res.json({ ok: true });
  }),
);

export default router;
