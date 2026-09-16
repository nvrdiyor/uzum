/**
 * Ro'yxatdan o'tish oqimi: /start → til → telefon → kompaniya → soliq → API kalit.
 *
 * Har bir qadam bazada belgilanadi (`User.phone`, `Company.onboardStep`), shuning uchun
 * bot qayta ishga tushsa ham foydalanuvchi to'xtagan joyidan davom etadi.
 */
import type { Contact } from 'grammy/types';
import {
  clearFlow,
  escapeHtml,
  loadCompany,
  refreshState,
  resolveStep,
  setFlow,
  t,
  upsertUser,
  type BotContext,
  type FlowStep,
} from './context.js';
import { langKeyboard, loginKeyboard, mainMenu, phoneKeyboard, siteKeyboard } from './keyboards.js';
import {
  connectApiKey,
  createCompany,
  createLoginCode,
  findReferrer,
  savePhone,
  saveTaxRate,
  setLanguage,
} from './data.js';
import type { BotLang } from '../i18n.js';
import { verifyUzumKey } from '../lib/verify-key.js';

/** API kalit kamida shuncha belgidan iborat bo'lsin */
const MIN_API_KEY_LEN = 16;

/** Joriy qadamni aniqlash (kontekst asosida) */
export function currentStep(ctx: BotContext): FlowStep {
  const telegramId = ctx.from ? String(ctx.from.id) : '';
  return resolveStep(ctx.sp, telegramId);
}

/** Klaviaturani olib tashlash (telefon tugmasidan keyin) */
const removeKeyboard = { remove_keyboard: true } as const;

/**
 * Joriy qadam bo'yicha savol yuborish.
 * Menyu bosqichida (idle) doimiy klaviatura ko'rsatiladi.
 */
export async function promptStep(ctx: BotContext, step = currentStep(ctx)): Promise<void> {
  switch (step) {
    case 'lang':
      await ctx.reply(t(ctx, 'lang_ask'), { reply_markup: langKeyboard(ctx.sp.lang) });
      return;
    case 'phone':
      await ctx.reply(t(ctx, 'onb_phone_ask'), {
        parse_mode: 'HTML',
        reply_markup: phoneKeyboard(ctx.sp.lang),
      });
      return;
    case 'company':
      await ctx.reply(t(ctx, 'onb_company_ask'), { parse_mode: 'HTML', reply_markup: removeKeyboard });
      return;
    case 'tax':
      await ctx.reply(t(ctx, 'onb_tax_ask'), { parse_mode: 'HTML' });
      return;
    case 'api_key':
      await ctx.reply(t(ctx, 'onb_api_ask'), { parse_mode: 'HTML', link_preview_options: { is_disabled: true } });
      return;
    case 'api_key_update':
      await ctx.reply(t(ctx, 'set_api_ask'), { parse_mode: 'HTML', link_preview_options: { is_disabled: true } });
      return;
    default:
      await ctx.reply(t(ctx, 'menu_title'), { reply_markup: mainMenu(ctx.sp.lang) });
  }
}

// ─────────────────────────── /start ───────────────────────────

/** `ref_ABCD1234` ko'rinishidagi payload'dan referal kodni ajratadi */
function parseRefCode(payload: string): string | null {
  const m = /^ref[_-]?([A-Za-z0-9]{4,24})$/.exec(payload.trim());
  return m ? (m[1] ?? null) : null;
}

export async function onStart(ctx: BotContext, payload: string): Promise<void> {
  const from = ctx.from;
  const chatId = ctx.chat?.id;
  if (!from || chatId === undefined) return;

  const telegramId = String(from.id);
  const existingUser = ctx.sp.user;

  // Referal: faqat yangi foydalanuvchi uchun va o'ziga o'zi bo'lmasin
  let referredById: string | null = null;
  const refCode = parseRefCode(payload);
  if (refCode && !existingUser) referredById = await findReferrer(refCode);

  const { user, isNew, refApplied } = await upsertUser({
    telegramId,
    username: from.username ?? null,
    firstName: from.first_name ?? null,
    lastName: from.last_name ?? null,
    chatId: String(chatId),
    referredById,
  });

  ctx.sp = { lang: user.lang, user, company: await loadCompany(user.id) };
  clearFlow(telegramId);

  const name = escapeHtml(user.firstName ?? from.first_name ?? '');
  const step = currentStep(ctx);

  if (step === 'idle' && !isNew) {
    await ctx.reply(t(ctx, 'start_welcome_back', { name }), {
      parse_mode: 'HTML',
      reply_markup: mainMenu(ctx.sp.lang),
    });
    return;
  }

  await ctx.reply(t(ctx, 'start_greet', { name }), { parse_mode: 'HTML' });
  if (refApplied) await ctx.reply(t(ctx, 'onb_ref_applied'));

  // Har doim tilni tanlashdan boshlaymiz
  await ctx.reply(t(ctx, 'lang_ask'), { reply_markup: langKeyboard(ctx.sp.lang) });
}

// ─────────────────────────── Til tanlash ───────────────────────────

export async function onLangChosen(ctx: BotContext, lang: BotLang): Promise<void> {
  await ctx.answerCallbackQuery();

  const user = ctx.sp.user;
  if (!user) {
    await ctx.reply(t(ctx, 'need_start'));
    return;
  }

  await setLanguage(user.id, lang);
  await refreshState(ctx);

  // Tugmalarni olib tashlab, tasdiqni ko'rsatamiz
  try {
    await ctx.editMessageText(t(ctx, 'lang_saved'));
  } catch {
    await ctx.reply(t(ctx, 'lang_saved'));
  }

  const step = currentStep(ctx);
  if (step !== 'idle') await ctx.reply(t(ctx, 'onb_resume'));
  await promptStep(ctx, step);
}

// ─────────────────────────── Telefon ───────────────────────────

export async function onContact(ctx: BotContext, contact: Contact): Promise<void> {
  const user = ctx.sp.user;
  if (!user) {
    await ctx.reply(t(ctx, 'need_start'));
    return;
  }

  // Faqat o'z raqami qabul qilinadi
  if (contact.user_id !== undefined && String(contact.user_id) !== user.telegramId) {
    await ctx.reply(t(ctx, 'onb_phone_need_button'), {
      parse_mode: 'HTML',
      reply_markup: phoneKeyboard(ctx.sp.lang),
    });
    return;
  }

  await savePhone(user.id, contact.phone_number);
  await refreshState(ctx);
  await promptStep(ctx);
}

// ─────────────────────────── Matnli qadamlar ───────────────────────────

/** Kompaniya nomi */
async function handleCompany(ctx: BotContext, text: string): Promise<void> {
  const user = ctx.sp.user;
  if (!user) return;

  const name = text.trim().replace(/\s+/g, ' ');
  if (name.length < 2 || name.length > 60) {
    await ctx.reply(t(ctx, 'onb_company_invalid'));
    return;
  }

  await createCompany(user.id, name);
  await refreshState(ctx);
  await promptStep(ctx, 'tax');
}

/** Soliq stavkasi (%) */
async function handleTax(ctx: BotContext, text: string): Promise<void> {
  const company = ctx.sp.company;
  if (!company) return;

  const value = Number(text.trim().replace(',', '.').replace('%', ''));
  if (!Number.isFinite(value) || value < 0 || value > 50) {
    await ctx.reply(t(ctx, 'onb_tax_invalid'));
    return;
  }

  await saveTaxRate(company.id, Math.round(value * 100) / 100);
  await refreshState(ctx);
  await promptStep(ctx, 'api_key');
}

/**
 * Uzum API kaliti.
 * Xavfsizlik: kalit yozilgan xabar chatdan o'chirishga harakat qilinadi.
 */
async function handleApiKey(ctx: BotContext, text: string, isUpdate: boolean): Promise<void> {
  const company = ctx.sp.company;
  if (!company) {
    await ctx.reply(t(ctx, 'need_company'));
    return;
  }

  const key = text.trim();
  if (key.length < MIN_API_KEY_LEN || /\s/.test(key)) {
    await ctx.reply(t(ctx, 'onb_api_invalid'), { parse_mode: 'HTML' });
    return;
  }

  /*
   * Kalitni SAQLASHDAN OLDIN tekshiramiz. Ilgari u shundayligicha yozilib,
   * to'liq sinxronizatsiya navbatga qo'yilardi — noto'g'ri kalit bo'lsa
   * sotuvchi buni o'n daqiqalardan keyin, sinxron yiqilganda bilardi.
   */
  await ctx.reply(t(ctx, 'onb_api_checking'));
  const check = await verifyUzumKey(key);
  if (!check.ok) {
    const reason =
      check.reason === 'no_shops' ? 'onb_api_no_shops' : check.reason === 'network' ? 'onb_api_network' : 'onb_api_rejected';
    await ctx.reply(t(ctx, reason), { parse_mode: 'HTML' });
    return;
  }

  await connectApiKey(company.id, key);

  // Kalit yozilgan xabarni o'chirishga harakat qilamiz (har doim ham ruxsat bo'lmaydi)
  let deleted = true;
  try {
    await ctx.deleteMessage();
  } catch {
    deleted = false;
  }

  clearFlow(ctx.sp.user ? ctx.sp.user.telegramId : '');
  await refreshState(ctx);

  const head = isUpdate ? t(ctx, 'set_api_done') : t(ctx, 'onb_syncing');
  const notice = deleted ? `\n\n${t(ctx, 'onb_api_deleted')}` : '';

  // Saytga kirish uchun bir martalik havola beramiz (bo'lmasa oddiy sayt tugmasi)
  const user = ctx.sp.user;
  const ticket = user ? await createLoginCode(user.id, user.telegramId) : null;

  await ctx.reply(`${head}${notice}`, {
    parse_mode: 'HTML',
    link_preview_options: { is_disabled: true },
    reply_markup: ticket ? loginKeyboard(ctx.sp.lang, ticket.url) : siteKeyboard(ctx.sp.lang),
  });
  await ctx.reply(t(ctx, 'menu_title'), { reply_markup: mainMenu(ctx.sp.lang) });
}

/**
 * Ro'yxatdan o'tish bosqichidagi matnlar.
 * Menyu tugmalari bu funksiyaga kelmaydi — ular handlers/menu.ts da ushlanadi.
 */
export async function onOnboardingText(ctx: BotContext, text: string, step: FlowStep): Promise<void> {
  switch (step) {
    case 'lang':
      await ctx.reply(t(ctx, 'need_start'));
      return;
    case 'phone':
      await ctx.reply(t(ctx, 'onb_phone_need_button'), {
        parse_mode: 'HTML',
        reply_markup: phoneKeyboard(ctx.sp.lang),
      });
      return;
    case 'company':
      await handleCompany(ctx, text);
      return;
    case 'tax':
      await handleTax(ctx, text);
      return;
    case 'api_key':
      await handleApiKey(ctx, text, false);
      return;
    case 'api_key_update':
      await handleApiKey(ctx, text, true);
      return;
    default:
      await ctx.reply(t(ctx, 'unknown_text'), { reply_markup: mainMenu(ctx.sp.lang) });
  }
}

/** /cancel — vaqtinchalik oqimni bekor qiladi */
export async function onCancel(ctx: BotContext): Promise<void> {
  const telegramId = ctx.from ? String(ctx.from.id) : '';
  if (telegramId) clearFlow(telegramId);
  await ctx.reply(t(ctx, 'canceled'), { reply_markup: mainMenu(ctx.sp.lang) });
}

/** Sozlamalardan «API kalitni yangilash» bosilganda */
export async function askApiKeyUpdate(ctx: BotContext): Promise<void> {
  const telegramId = ctx.from ? String(ctx.from.id) : '';
  if (telegramId) setFlow(telegramId, 'api_key_update');
  await promptStep(ctx, 'api_key_update');
}
