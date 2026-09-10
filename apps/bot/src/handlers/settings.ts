/**
 * ⚙️ Sozlamalar: til, bildirishnomalar (kunlik hisobot / buyurtmalar / qoldiqlar)
 * va Uzum API kalitini yangilash.
 *
 * Tugmalar inline klaviaturada, holat esa bazadagi `User.notify*` maydonlarida saqlanadi.
 */
import { refreshState, t, type BotContext } from './context.js';
import { langKeyboard, settingsKeyboard } from './keyboards.js';
import { toggleNotify, type NotifyField } from './data.js';
import { askApiKeyUpdate } from './start.js';

/** Sozlamalar oynasi */
export async function showSettings(ctx: BotContext): Promise<void> {
  const user = ctx.sp.user;
  if (!user) {
    await ctx.reply(t(ctx, 'need_start'));
    return;
  }

  await ctx.reply(t(ctx, 'set_title'), {
    parse_mode: 'HTML',
    reply_markup: settingsKeyboard(ctx.sp.lang, {
      daily: user.notifyDaily,
      orders: user.notifyOrders,
      stock: user.notifyStock,
    }),
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
        reply_markup: settingsKeyboard(ctx.sp.lang, {
          daily: fresh.notifyDaily,
          orders: fresh.notifyOrders,
          stock: fresh.notifyStock,
        }),
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
