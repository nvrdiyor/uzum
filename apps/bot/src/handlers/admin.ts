/**
 * Administrator buyruqlari (TELEGRAM_ADMIN_IDS ro'yxatidagilar uchun):
 *   /stats                              — platforma statistikasi
 *   /broadcast <matn>                   — barcha foydalanuvchilarga xabar
 *   /grant <telegramId> <plan> <oy>     — qo'lda tarif berish
 */
import { PLAN_IDS, formatDate, getPlan, type PlanId } from '@savdoiq/shared';
import { prisma } from '../lib/db.js';
import { isAdmin } from '../lib/env.js';
import { clampMessage, sleep, t, type BotContext } from './context.js';
import { localDayStart } from './data.js';

/** Ketma-ket yuborishda Telegram limitiga urilmaslik uchun pauza (ms) */
const BROADCAST_DELAY_MS = 60;

/** Buyruq adminmi? Bo'lmasa javob beriladi va `false` qaytadi. */
async function ensureAdmin(ctx: BotContext): Promise<boolean> {
  if (isAdmin(ctx.from?.id)) return true;
  await ctx.reply(t(ctx, 'admin_only'));
  return false;
}

// ─────────────────────────── /stats ───────────────────────────

export async function onStats(ctx: BotContext): Promise<void> {
  if (!(await ensureAdmin(ctx))) return;

  const now = new Date();
  const dayStart = localDayStart(now);

  const [users, usersToday, companies, accounts, subs, queued, chats] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { createdAt: { gte: dayStart } } }),
    prisma.company.count(),
    prisma.uzumAccount.count(),
    prisma.subscription.findMany({
      where: { status: 'active', expiresAt: { gt: now } },
      select: { plan: true },
    }),
    prisma.syncJob.count({ where: { status: { in: ['queued', 'running'] } } }),
    prisma.user.count({ where: { botChatId: { not: null } } }),
  ]);

  const trial = subs.filter((s) => s.plan === 'trial').length;

  await ctx.reply(
    t(ctx, 'admin_stats', {
      users,
      usersToday,
      companies,
      accounts,
      active: subs.length,
      trial,
      paid: subs.length - trial,
      queued,
      chats,
    }),
    { parse_mode: 'HTML' },
  );
}

// ─────────────────────────── /broadcast ───────────────────────────

export async function onBroadcast(ctx: BotContext, payload: string): Promise<void> {
  if (!(await ensureAdmin(ctx))) return;

  const text = payload.trim();
  if (!text) {
    await ctx.reply(t(ctx, 'admin_broadcast_usage'), { parse_mode: 'HTML' });
    return;
  }

  const recipients = await prisma.user.findMany({
    where: { botChatId: { not: null }, status: 'active' },
    select: { botChatId: true },
  });

  let sent = 0;
  let failed = 0;

  for (const r of recipients) {
    if (!r.botChatId) continue;
    try {
      await ctx.api.sendMessage(r.botChatId, clampMessage(text), {
        parse_mode: 'HTML',
        link_preview_options: { is_disabled: true },
      });
      sent += 1;
    } catch {
      failed += 1;
    }
    await sleep(BROADCAST_DELAY_MS);
  }

  await ctx.reply(t(ctx, 'admin_broadcast_done', { sent, failed }), { parse_mode: 'HTML' });
}

// ─────────────────────────── /grant ───────────────────────────

function addMonths(base: Date, months: number): Date {
  const d = new Date(base.getTime());
  d.setUTCMonth(d.getUTCMonth() + months);
  return d;
}

export async function onGrant(ctx: BotContext, payload: string): Promise<void> {
  if (!(await ensureAdmin(ctx))) return;

  const parts = payload.trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2) {
    await ctx.reply(t(ctx, 'admin_grant_usage'), { parse_mode: 'HTML' });
    return;
  }

  const [telegramId, planRaw, monthsRaw] = parts;
  const plan = (planRaw ?? '').toLowerCase() as PlanId;
  if (!(PLAN_IDS as readonly string[]).includes(plan)) {
    await ctx.reply(t(ctx, 'admin_grant_badplan'));
    return;
  }

  const monthsValue = Number(monthsRaw ?? '1');
  const months = Number.isFinite(monthsValue) ? Math.min(36, Math.max(1, Math.round(monthsValue))) : 1;

  const user = await prisma.user.findUnique({
    where: { telegramId: String(telegramId) },
    select: { id: true, botChatId: true, languageCode: true },
  });
  if (!user) {
    await ctx.reply(t(ctx, 'admin_grant_nouser'));
    return;
  }

  const membership = await prisma.membership.findFirst({
    where: { userId: user.id },
    orderBy: { createdAt: 'asc' },
    select: { companyId: true },
  });
  if (!membership) {
    await ctx.reply(t(ctx, 'admin_grant_nocompany'));
    return;
  }

  const now = new Date();
  const existing = await prisma.subscription.findUnique({
    where: { companyId: membership.companyId },
    select: { expiresAt: true, plan: true },
  });

  // Amaldagi obuna tugamagan bo'lsa — muddat ustiga qo'shiladi
  const base = existing && existing.expiresAt > now && existing.plan === plan ? existing.expiresAt : now;
  const expiresAt = addMonths(base, months);

  await prisma.subscription.upsert({
    where: { companyId: membership.companyId },
    create: {
      companyId: membership.companyId,
      plan,
      status: 'active',
      startedAt: now,
      expiresAt,
      autoRenew: false,
      trialUsed: true,
    },
    update: { plan, status: 'active', expiresAt, canceledAt: null },
  });

  const planName = getPlan(plan).name;

  await ctx.reply(
    t(ctx, 'admin_grant_done', {
      telegramId: String(telegramId),
      plan: planName,
      months,
      date: formatDate(expiresAt, ctx.sp.lang),
    }),
    { parse_mode: 'HTML' },
  );

  // Foydalanuvchiga ham xabar beramiz (chat ulangan bo'lsa)
  if (user.botChatId) {
    const lang = user.languageCode === 'ru' ? 'ru' : 'uz';
    const text =
      lang === 'ru'
        ? `💎 Ваш тариф обновлён: <b>${planName}</b> до ${formatDate(expiresAt, lang)}.`
        : `💎 Tarifingiz yangilandi: <b>${planName}</b> — ${formatDate(expiresAt, lang)} gacha.`;
    try {
      await ctx.api.sendMessage(user.botChatId, text, { parse_mode: 'HTML' });
    } catch {
      // Foydalanuvchi botni bloklagan bo'lishi mumkin — e'tiborsiz qoldiramiz
    }
  }
}
