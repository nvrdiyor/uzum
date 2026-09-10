/**
 * Barcha handler'larni botga ulash.
 *
 * Tartib muhim:
 *   1) kontekst middleware (foydalanuvchi + kompaniya yuklanadi),
 *   2) buyruqlar,
 *   3) inline tugmalar (callback),
 *   4) kontakt (telefon),
 *   5) matn — menyu tugmasi yoki ro'yxatdan o'tish javobi.
 */
import type { Bot } from 'grammy';
import { loadState, clearFlow, t, type BotContext } from './context.js';
import { matchButton } from '../i18n.js';
import { currentStep, onCancel, onContact, onLangChosen, onOnboardingText, onStart, promptStep } from './start.js';
import { onMenuButton, showHelp, showId, showSupport } from './menu.js';
import { onSettingsAction } from './settings.js';
import { onBroadcast, onGrant, onStats } from './admin.js';

/** Regex bilan mos kelgan guruhni xavfsiz olish */
function group(match: string | RegExpMatchArray | undefined, index = 1): string {
  if (typeof match === 'string') return match;
  if (Array.isArray(match)) return match[index] ?? '';
  return '';
}

export function registerHandlers(bot: Bot<BotContext>): void {
  // ── 1. Kontekst ────────────────────────────────────────────
  bot.use(async (ctx, next) => {
    // Bot faqat shaxsiy chatda ishlaydi (guruhda klaviatura va hisobotlar mantiqsiz)
    if (ctx.chat && ctx.chat.type !== 'private') return;

    const telegramId = ctx.from ? String(ctx.from.id) : null;
    ctx.sp = telegramId ? await loadState(telegramId) : { lang: 'uz', user: null, company: null };
    await next();
  });

  // ── 2. Buyruqlar ───────────────────────────────────────────
  bot.command('start', async (ctx) => {
    await onStart(ctx, ctx.match);
  });
  bot.command(['help', 'menu'], async (ctx) => {
    await showHelp(ctx);
  });
  bot.command('id', async (ctx) => {
    await showId(ctx);
  });
  bot.command('support', async (ctx) => {
    await showSupport(ctx);
  });
  bot.command('cancel', async (ctx) => {
    await onCancel(ctx);
  });

  // Admin buyruqlari
  bot.command('stats', async (ctx) => {
    await onStats(ctx);
  });
  bot.command('broadcast', async (ctx) => {
    await onBroadcast(ctx, ctx.match);
  });
  bot.command('grant', async (ctx) => {
    await onGrant(ctx, ctx.match);
  });

  // ── 3. Inline tugmalar ─────────────────────────────────────
  bot.callbackQuery(/^lang:(uz|ru)$/, async (ctx) => {
    await onLangChosen(ctx, group(ctx.match) === 'ru' ? 'ru' : 'uz');
  });
  bot.callbackQuery(/^set:(\w+)$/, async (ctx) => {
    await onSettingsAction(ctx, group(ctx.match));
  });
  // Boshqa tugmalar — «soat» belgisi osilib qolmasin
  bot.on('callback_query:data', async (ctx) => {
    await ctx.answerCallbackQuery();
  });

  // ── 4. Telefon raqami ──────────────────────────────────────
  bot.on('message:contact', async (ctx) => {
    await onContact(ctx, ctx.message.contact);
  });

  // ── 5. Matn ────────────────────────────────────────────────
  bot.on('message:text', async (ctx) => {
    const text = ctx.message.text;

    // Ro'yxatga olinmagan buyruq — yordam ko'rsatamiz
    if (text.startsWith('/')) {
      await showHelp(ctx);
      return;
    }

    const button = matchButton(text);
    const step = currentStep(ctx);

    if (button) {
      // Menyu tugmasi kalitni yangilash oqimini bekor qiladi
      if (step === 'api_key_update') {
        clearFlow(ctx.from ? String(ctx.from.id) : '');
        await onMenuButton(ctx, button);
        return;
      }
      if (step === 'idle') {
        await onMenuButton(ctx, button);
        return;
      }
      // Ro'yxatdan o'tish tugallanmagan — joriy savolni takrorlaymiz
      await ctx.reply(t(ctx, 'onb_resume'));
      await promptStep(ctx, step);
      return;
    }

    // `idle` bo'lsa — tushunarsiz matn, qolgan holatlarda ro'yxatdan o'tish javobi
    await onOnboardingText(ctx, text, step);
  });
}
