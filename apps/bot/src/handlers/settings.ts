/**
 * ⚙️ Sozlamalar: til, bildirishnomalar (kunlik hisobot / buyurtmalar / qoldiqlar /
 * haftalik va oylik hisobot) va Uzum API kalitini yangilash.
 *
 * Tugmalar inline klaviaturada, holat esa bazadagi `User.notify*` maydonlarida saqlanadi.
 * Haftalik va oylik hisobotni API ishchisi yuboradi (apps/api services/digest.ts) —
 * u ham shu maydonlarni o'qiydi, saytdagi Sozlamalar tugmachalari bilan bir xil.
 */
import { refreshState, t, type BotContext, type BotUser } from './context.js';
import { langKeyboard, settingsKeyboard, type NotifyFlags } from './keyboards.js';
import { toggleNotify, type NotifyField } from './data.js';
import { askApiKeyUpdate } from './start.js';

/** Klaviaturadagi tugmalar holati — foydalanuvchining `notify*` maydonlaridan */
function flagsOf(user: BotUser): NotifyFlags {
  return {
    daily: user.notifyDaily,
    orders: user.notifyOrders,
    stock: user.notifyStock,
    weekly: user.notifyWeekly,
    monthly: user.notifyMonthly,
  };
}

/** Sozlamalar oynasi */
export async function showSettings(ctx: BotContext): Promise<void> {
  const user = ctx.sp.user;
  if (!user) {
    await ctx.reply(t(ctx, 'need_start'));
    return;
  }

  await ctx.reply(t(ctx, 'set_title'), {
    parse_mode: 'HTML',
    reply_markup: settingsKeyboard(ctx.sp.lang, flagsOf(user)),
  });
}

/** `set:` bilan boshlanadigan callback'lar */
export async function onSettingsAction(ctx: BotContext, action: string): Promise<void> {
  const user = ctx.sp.user;
  if (!user) {
    await ctx.answerCallbackQuery();
    await ctx.reply(t(ctx, 'need_start'));
    return;
  }

  const fields: Record<string, NotifyField> = {
    daily: 'notifyDaily',
    orders: 'notifyOrders',
    stock: 'notifyStock',
    weekly: 'notifyWeekly',
    monthly: 'notifyMonthly',
  };

  const field = fields[action];
  if (field) {
    await toggleNotify(user.id, field);
    await refreshState(ctx);
    const fresh = ctx.sp.user;
    await ctx.answerCallbackQuery({ text: t(ctx, 'set_saved') });
    if (!fresh) return;
    try {
      await ctx.editMessageReplyMarkup({
        reply_markup: settingsKeyboard(ctx.sp.lang, flagsOf(fresh)),
      });
    } catch {
      // Xabar o'zgarmagan bo'lsa Telegram xato beradi — bu muhim emas
    }
    return;
  }

  if (action === 'lang') {
    await ctx.answerCallbackQuery();
    await ctx.reply(t(ctx, 'set_lang_ask'), { reply_markup: langKeyboard(ctx.sp.lang) });
    return;
  }

  if (action === 'api') {
    await ctx.answerCallbackQuery();
    await askApiKeyUpdate(ctx);
    return;
  }

  await ctx.answerCallbackQuery();
}
