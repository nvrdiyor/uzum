/**
 * Doimiy menyu tugmalari: bugungi hisobot, qoldiqlar, saytga kirish, tarif, referal.
 * Sozlamalar alohida faylda (handlers/settings.ts).
 */
import { formatDate, formatMoney, formatNumber } from '@savdoiq/shared';
import { escapeHtml, t, type BotContext } from './context.js';
import { loginKeyboard, mainMenu, pricingKeyboard, siteKeyboard } from './keyboards.js';
import {
  buildCriticalStocks,
  buildDayReport,
  createLoginCode,
  loadBilling,
  loadReferral,
  todayRange,
} from './data.js';
import { stocksText, todayReportText } from './reports.js';
import { showSettings } from './settings.js';
import { env } from '../lib/env.js';
import type { TKey } from '../i18n.js';

/**
 * Kompaniya bor-yo'qligini tekshiradi. Bo'lmasa — foydalanuvchini ro'yxatdan o'tishga yo'naltiradi.
 * Ma'lumot hali yig'ilmagan bo'lsa ham xato emas: shunchaki holat haqida xabar beriladi.
 */
async function requireCompany(ctx: BotContext): Promise<string | null> {
  const { user, company } = ctx.sp;
  if (!user) {
    await ctx.reply(t(ctx, 'need_start'));
    return null;
  }
  if (!company) {
    await ctx.reply(t(ctx, 'need_company'), { reply_markup: mainMenu(ctx.sp.lang) });
    return null;
  }
  if (!company.hasApiKey) {
    await ctx.reply(t(ctx, 'need_api_key'));
    return null;
  }
  return company.id;
}

// ─────────────────────────── 📊 Bugungi hisobot ───────────────────────────

export async function showToday(ctx: BotContext): Promise<void> {
  const companyId = await requireCompany(ctx);
  if (!companyId) return;

  const range = todayRange();
  const report = await buildDayReport(companyId, range.from, range.to);

  // Sinxronizatsiya tugamagan bo'lsa — bo'sh hisobot sababini tushuntiramiz
  if (report.orders === 0 && ctx.sp.company?.onboardStep === 'syncing') {
    await ctx.reply(t(ctx, 'sync_running'), { parse_mode: 'HTML' });
    return;
  }

  await ctx.reply(todayReportText(ctx.sp.lang, range.key, report), {
    parse_mode: 'HTML',
    reply_markup: siteKeyboard(ctx.sp.lang),
  });
}

// ─────────────────────────── 📦 Qoldiqlar ───────────────────────────

export async function showStocks(ctx: BotContext): Promise<void> {
  const companyId = await requireCompany(ctx);
  if (!companyId) return;

  const alert = await buildCriticalStocks(companyId, 10);

  await ctx.reply(stocksText(ctx.sp.lang, alert), {
    parse_mode: 'HTML',
    reply_markup: siteKeyboard(ctx.sp.lang, '/stocks'),
  });
}

// ─────────────────────────── 🔑 Saytga kirish ───────────────────────────

export async function showLogin(ctx: BotContext): Promise<void> {
  const user = ctx.sp.user;
  if (!user) {
    await ctx.reply(t(ctx, 'need_start'));
    return;
  }

  const ticket = await createLoginCode(user.id, user.telegramId);

  const text = [
    t(ctx, 'login_title'),
    '',
    t(ctx, 'login_code', { code: ticket.code }),
    t(ctx, 'login_hint'),
  ].join('\n');

  await ctx.reply(text, {
    parse_mode: 'HTML',
    link_preview_options: { is_disabled: true },
    reply_markup: loginKeyboard(ctx.sp.lang, ticket.url),
  });
}

// ─────────────────────────── 💳 Tarif ───────────────────────────

/** Obuna holati uchun tarjima kaliti */
function statusKey(status: string, expired: boolean): TKey {
  if (expired) return 'sub_expired';
  if (status === 'canceled') return 'sub_canceled';
  if (status === 'pending') return 'sub_pending';
  return 'sub_active';
}

export async function showBilling(ctx: BotContext): Promise<void> {
  const company = ctx.sp.company;
  if (!company) {
    await ctx.reply(t(ctx, 'need_company'));
    return;
  }

  const billing = await loadBilling(company.id);
  const lines: string[] = [t(ctx, 'billing_title'), ''];

  if (!billing) {
    lines.push(t(ctx, 'billing_none'));
  } else {
    lines.push(t(ctx, 'billing_plan', { plan: billing.planName }));
    lines.push(t(ctx, 'billing_status', { status: t(ctx, statusKey(billing.status, billing.expired)) }));
    lines.push(t(ctx, 'billing_until', { date: formatDate(billing.expiresAt, ctx.sp.lang) }));
    lines.push(t(ctx, 'billing_days', { days: billing.daysLeft }));
    if (billing.expired) lines.push(`\n${t(ctx, 'billing_expired')}`);
  }

  if (env.billing.manualCard) {
    lines.push(
      t(ctx, 'billing_card', {
        card: env.billing.manualCard,
        owner: escapeHtml(env.billing.manualCardOwner || '—'),
      }),
    );
  }

  await ctx.reply(lines.join('\n'), {
    parse_mode: 'HTML',
    reply_markup: pricingKeyboard(ctx.sp.lang),
  });
}

// ─────────────────────────── 👥 Referal ───────────────────────────

export async function showReferral(ctx: BotContext): Promise<void> {
  const user = ctx.sp.user;
  if (!user) {
    await ctx.reply(t(ctx, 'need_start'));
    return;
  }

  const info = await loadReferral(user.id, user.referralCode);
  const lang = ctx.sp.lang;

  const text = [
    t(ctx, 'ref_title'),
    '',
    t(ctx, 'ref_percent', { percent: info.percent }),
    t(ctx, 'ref_code', { code: info.code }),
    t(ctx, 'ref_bot_link', { link: info.botLink }),
    t(ctx, 'ref_link', { link: info.link }),
    '',
    t(ctx, 'ref_invited', { count: formatNumber(info.invited, lang) }),
    t(ctx, 'ref_paying', { count: formatNumber(info.paying, lang) }),
    t(ctx, 'ref_earned', { amount: formatMoney(info.earned, lang) }),
    t(ctx, 'ref_pending', { amount: formatMoney(info.pending, lang) }),
    t(ctx, 'ref_paid', { amount: formatMoney(info.paid, lang) }),
  ].join('\n');

  await ctx.reply(text, { parse_mode: 'HTML', link_preview_options: { is_disabled: true } });
}

// ─────────────────────────── Xizmat buyruqlari ───────────────────────────

export async function showHelp(ctx: BotContext): Promise<void> {
  await ctx.reply(t(ctx, 'help'), { parse_mode: 'HTML', reply_markup: mainMenu(ctx.sp.lang) });
}

export async function showId(ctx: BotContext): Promise<void> {
  const id = ctx.from ? String(ctx.from.id) : '—';
  await ctx.reply(t(ctx, 'id_text', { id }), { parse_mode: 'HTML' });
}

export async function showSupport(ctx: BotContext): Promise<void> {
  await ctx.reply(t(ctx, 'support'), { parse_mode: 'HTML' });
}

export async function showMenu(ctx: BotContext): Promise<void> {
  await ctx.reply(t(ctx, 'menu_title'), { reply_markup: mainMenu(ctx.sp.lang) });
}

// ─────────────────────────── Tugma → amal ───────────────────────────

/** Menyu tugmasi bosilganda mos amalni chaqiradi */
export async function onMenuButton(ctx: BotContext, key: TKey): Promise<void> {
  switch (key) {
    case 'btn_today':
      await showToday(ctx);
      return;
    case 'btn_stocks':
      await showStocks(ctx);
      return;
    case 'btn_login':
      await showLogin(ctx);
      return;
    case 'btn_billing':
      await showBilling(ctx);
      return;
    case 'btn_referral':
      await showReferral(ctx);
      return;
    case 'btn_settings':
      await showSettings(ctx);
      return;
    default:
      await showMenu(ctx);
  }
}
