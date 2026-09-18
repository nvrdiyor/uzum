/**
 * Barcha handler'larni botga ulash.
 *
 * Tartib muhim:
 *   1) kontekst middleware (foydalanuvchi + kompaniya yuklanadi),
 *   2) buyruqlar,
 *   3) inline tugmalar (callback),
 *   4) kontakt (telefon),
 *   5) operator javobi (reply) — oddiy foydalanuvchiga tegmaydi,
 *   6) kontakt (telefon),
 *   7) matn — menyu tugmasi, ro'yxatdan o'tish javobi yoki operatorga savol,
 *   8) matnsiz xabar (skrinshot, hujjat) — operatorga uzatiladi.
 */
import type { Bot } from 'grammy';
import { loadState, clearFlow, t, type BotContext } from './context.js';
import { matchButton } from '../i18n.js';
import { currentStep, onCancel, onContact, onLangChosen, onOnboardingText, onStart, promptStep } from './start.js';
import { onMenuButton, showHelp, showId } from './menu.js';
import {
  askWhichTicket,
  onAdminReply,
  onCloseCmd,
  onReplyCmd,
  onSupportAction,
  onSupportCommand,
  onSupportMedia,
  onSupportText,
  onTickets,
} from './support.js';
import { onSettingsAction } from './settings.js';
import { onBroadcast, onGrant, onStats } from './admin.js';
import { isAdmin } from '../lib/env.js';

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
  // /support savol — ro'yxatdan o'tish o'rtasida ham darhol operatorga ketadi
  bot.command('support', async (ctx) => {
    await onSupportCommand(ctx, group(ctx.match));
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

  // Murojaatlar (operator uchun; /stats kabi yashirin buyruqlar)
  bot.command('tickets', async (ctx) => {
    await onTickets(ctx);
  });
  bot.command('reply', async (ctx) => {
    await onReplyCmd(ctx, group(ctx.match));
  });
  bot.command('close', async (ctx) => {
    await onCloseCmd(ctx, group(ctx.match));
  });

  // ── 3. Inline tugmalar ─────────────────────────────────────
  bot.callbackQuery(/^lang:(uz|ru)$/, async (ctx) => {
    await onLangChosen(ctx, group(ctx.match) === 'ru' ? 'ru' : 'uz');
  });
  bot.callbackQuery(/^set:(\w+)$/, async (ctx) => {
    await onSettingsAction(ctx, group(ctx.match));
  });
  // Qo'llab-quvvatlash tugmalari. Pastdagi catch-all `next()` chaqirmaydi,
  // shuning uchun bu ro'yxat undan OLDIN turishi shart — aks holda o'lik kod.
  bot.callbackQuery(/^sup:([a-z]+)(?::([A-Za-z0-9_-]+))?$/, async (ctx) => {
    await onSupportAction(ctx, group(ctx.match), group(ctx.match, 2));
  });
  // Boshqa tugmalar — «soat» belgisi osilib qolmasin
  bot.on('callback_query:data', async (ctx) => {
    await ctx.answerCallbackQuery();
  });

  // ── 4. Operator javobi ─────────────────────────────────────
  // `message:text` emas, `message`: operator skrinshot bilan ham javob bera oladi.
  // Birinchi qatori adminni tekshiradi, ya'ni oddiy foydalanuvchiga narxi nol.
  bot.on('message', onAdminReply);

  // ── 5. Telefon raqami ──────────────────────────────────────
  bot.on('message:contact', async (ctx) => {
    await onContact(ctx, ctx.message.contact);
  });

  // ── 6. Matn ────────────────────────────────────────────────
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
      // Menyu tugmasi kalitni yangilash oqimini bekor qiladi. «Yordam» ham
      // shu qoidaga bo'ysunadi: aks holda sotuvchi yordam matnini o'qib savol
      // yozganda, o'sha savol kutilayotgan API KALIT deb tekshirilardi.
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

    // Menyu bosqichidagi erkin matn — bu operatorga savol.
    // Ilgari bu yerda «Tushunmadim 🤔» turardi, /support esa «shu yerga yozing»
    // deb va'da qilardi — ikkisi bir-biriga zid edi.
    if (step === 'idle') {
      if (isAdmin(ctx.from?.id)) {
        // Operator ham oddiy foydalanuvchi: uning matni o'ziga qaytib ketmasin
        await askWhichTicket(ctx, text, () => onOnboardingText(ctx, text, step));
        return;
      }
      await onSupportText(ctx, text);
      return;
    }

    await onOnboardingText(ctx, text, step);
  });

  // ── 7. Matnsiz xabar ───────────────────────────────────────
  // `message:text` va `message:contact` terminal bo'lgani uchun bu yerga
  // faqat skrinshot, hujjat, ovozli xabar va shunga o'xshashlar keladi.
  // Bugungacha ular umuman handler ko'rmasdi va jimgina yo'qolardi.
  bot.on('message', onSupportMedia);
}
