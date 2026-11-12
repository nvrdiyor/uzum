/**
 * Doimiy menyu tugmalari: hisobot (bugun / kecha / shu oy / shu yil), sinxron,
 * qoldiqlar, saytga kirish, tarif, referal. Sozlamalar alohida faylda
 * (handlers/settings.ts), qo'lda sinxron — handlers/sync.ts, hisobot ko'rinishi
 * va kirish sharti — handlers/report-view.ts.
 */
import { GrammyError } from 'grammy';
import { formatDate, formatMoney, formatNumber } from '@savdoiq/shared';
import { escapeHtml, t, type BotContext } from './context.js';
import { loginKeyboard, mainMenu, pricingKeyboard, reportKeyboard, siteKeyboard } from './keyboards.js';
import { buildCriticalStocks, createLoginCode, loadBilling, loadReferral } from './data.js';
import { stocksText } from './reports.js';
import { isReportPeriod, type ReportPeriod } from '../lib/dashboard-kpi.js';
import { buildReportView, canStartSync, requireCompany } from './report-view.js';
import { isSyncWaiting, noteReportPeriod, onSyncCommand } from './sync.js';
import { showSettings } from './settings.js';
// Yordam kartochkasi endi support.ts da — u yerda ro'yxatdan o'tish bosqichini
// ham hisobga oladi. Menyu tugmasi shu yerdan chaqiradi.
import { showSupport } from './support.js';
import { env } from '../lib/env.js';
import type { TKey } from '../i18n.js';

// ─────────────────────────── 📊 Hisobot (bugun / kecha / shu oy / shu yil) ───────────────────────────

/** «📊 Bugungi hisobot» tugmasi — bugungi hisobot, ostida boshqa davrlar va «🔄 Sinxronlash» */
export async function showReport(ctx: BotContext, kind: ReportPeriod = 'today'): Promise<void> {
  const companyId = await requireCompany(ctx);
  const company = ctx.sp.company;
  if (!companyId || !company) return;

  const view = await buildReportView(ctx.sp.lang, company, kind);
  if (!view) {
    await ctx.reply(t(ctx, 'sync_running'), { parse_mode: 'HTML' });
    return;
  }
  await ctx.reply(view.text, { parse_mode: 'HTML', reply_markup: view.markup });
}

/** Telegram: matn ham, tugmalar ham avvalgisi bilan bir xil — xato emas */
function isNotModified(err: unknown): boolean {
  return err instanceof GrammyError && /message is not modified/i.test(err.description);
}

/**
 * `rep:<davr>` tugmasi — o'sha xabar tanlangan davrga almashtiriladi.
 *
 * Tarif va kalit tekshiruvi har bosishda qayta o'tadi: xabar kechagi bo'lishi
 * mumkin, obuna esa o'rtada tugagan bo'lishi mumkin. Javob (`answerCallbackQuery`)
 * oxirida — "Shu yil" hisoblanayotganda tugmadagi soat belgisi turadi, va
 * xato bo'lsa ham tugma osilib qolmaydi.
 */
export async function onReportAction(ctx: BotContext, value: string): Promise<void> {
  try {
    if (!isReportPeriod(value)) return;
    const companyId = await requireCompany(ctx);
    const company = ctx.sp.company;
    if (!companyId || !company) return;

    // Shu xabar sinxronni kutayotgan bo'lsa — tugma o'rnida foiz qoladi, tugagach yangi davr chiziladi
    const message = ctx.callbackQuery?.message;
    const syncProgress = message ? noteReportPeriod(message.chat.id, message.message_id, value) : null;

    const view = await buildReportView(ctx.sp.lang, company, value, { syncProgress });
    if (!view) {
      await ctx.reply(t(ctx, 'sync_running'), { parse_mode: 'HTML' });
      return;
    }
    /*
     * Hisob paytida (yil hisoboti sekin) sinxron tugagan bo'lishi mumkin. Unda
     * xabarni kuzatuvchi yakunlaydi — yangi tanlangan davr bilan (noteReportPeriod
     * uni yozib qo'ygan) va «✅» qatori bilan; bu yerdagi sinxrondan oldingi
     * raqamlar uni bosib ketmasin (2026-11-12 tekshiruvi).
     */
    if (syncProgress !== null && message && !isSyncWaiting(message.chat.id, message.message_id)) return;
    const plain = reportKeyboard(ctx.sp.lang, value, { canSync: canStartSync(company) });
    try {
      await ctx.editMessageText(view.text, { parse_mode: 'HTML', reply_markup: view.markup });
    } catch (err) {
      // O'sha davr qayta bosildi va raqamlar o'zgarmagan
      if (isNotModified(err)) return;
      // Xabarni tahrirlab bo'lmadi (o'chirilgan va h.k.) — yangisi yuboriladi; uni hech kim
      // kuzatmaydi, shuning uchun foiz tugmasisiz
      await ctx.reply(view.text, { parse_mode: 'HTML', reply_markup: plain });
    }
  } finally {
    await ctx.answerCallbackQuery().catch(() => undefined);
  }
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

export async function showMenu(ctx: BotContext): Promise<void> {
  await ctx.reply(t(ctx, 'menu_title'), { reply_markup: mainMenu(ctx.sp.lang) });
}

// ─────────────────────────── Tugma → amal ───────────────────────────

/** Menyu tugmasi bosilganda mos amalni chaqiradi */
export async function onMenuButton(ctx: BotContext, key: TKey): Promise<void> {
  switch (key) {
    case 'btn_today':
      await showReport(ctx, 'today');
      return;
    case 'btn_sync':
      await onSyncCommand(ctx);
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
    case 'btn_support':
      await showSupport(ctx);
      return;
    default:
      await showMenu(ctx);
  }
}
