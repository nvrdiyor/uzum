/**
 * Qo'llab-quvvatlash: sotuvchi ↔ operator yozishmasi.
 *
 * Ilgari /support faqat «shu yerga yozing» deb matn chiqarardi, lekin yozilgan
 * xabarni qabul qiladigan handler yo'q edi — matn `onOnboardingText` ga tushib,
 * foydalanuvchi «Tushunmadim 🤔» javobini olardi. Va'da yolg'on edi.
 *
 * MUHIM DIZAYN QARORI: yangi `FlowStep` QO'SHILMAYDI, `resolveStep` va
 * `flowStore` ga umuman tegilmaydi. «Support rejimi» degan holat yo'q —
 * menyu bosqichidagi (`idle`) har qanday erkin matn savol deb qabul qilinadi.
 * Shu bitta qaror butun bir xatolar sinfini yo'q qiladi: savol hech qachon
 * kompaniya nomi bo'lib saqlanmaydi, hech qachon API kalit deb tekshirilmaydi
 * va kutilayotgan «kalitni yangilash» oqimini o'chirmaydi.
 *
 * Yo'naltirish (operator javobi kimga tegishli) BAZADA saqlanadi —
 * `SupportMessage.(adminChatId, adminMessageId)`. Bot har deployda qayta ishga
 * tushadi, shuning uchun xotiradagi jadval yaramaydi. Zaxira sifatida operator
 * xabarining sarlavhasida `#S-XXXX` kodi turadi.
 */
import type { Api } from 'grammy';
import { InlineKeyboard } from 'grammy';
import {
  SUPPORT_RATE_MAX,
  addSupportMessage,
  closeTicket,
  countInboundLastHour,
  findTicketByAdminMessage,
  findTicketByCode,
  findTicketById,
  listOpenTickets,
  localHour,
  markAnswered,
  markRelayed,
  openOrReuseTicket,
  type TicketRow,
} from './data.js';
import { clampMessage, cut, escapeHtml, sleep, t, webLink, type BotContext } from './context.js';
import {
  mainMenu,
  supportCardKeyboard,
  supportMoreKeyboard,
  ticketCardKeyboard,
  whichTicketKeyboard,
} from './keyboards.js';
import { currentStep } from './start.js';
import { env, isAdmin } from '../lib/env.js';
import { tr } from '../i18n.js';

/** Ketma-ket yuborishda Telegram limitiga urilmaslik uchun pauza (ms) — admin.ts bilan bir xil */
const PUSH_DELAY_MS = 60;
/** Telegram `caption` chegarasi 1024; sarlavha uchun joy qoldiramiz */
const CAPTION_MAX = 1000;
/** «Bu matn kimga?» ro'yxatida ko'rsatiladigan murojaatlar soni */
const WHICH_LIMIT = 6;
/** Operator ish vaqti (mahalliy soat) — tashqarisida kutish haqida ogohlantiramiz */
const WORK_FROM = 9;
const WORK_TO = 20;
/**
 * Operatorga ko'rinadigan matn tili.
 *
 * Ilgari kartochka SOTUVCHINING tilida chiqardi: rus sotuvchidan kelgan
 * murojaat ruscha, o'zbekdan kelgani o'zbekcha — bitta operator oynasida
 * ikki til aralashib ketardi.
 */
const OPERATOR_LANG: 'uz' | 'ru' = 'uz';
/**
 * API kalitga o'xshash matn: bo'shliqsiz va uzun.
 *
 * Savol har doim so'zlardan iborat, kalit esa bitta uzun tokendir. Bu
 * tekshiruv `start.ts` dagi `MIN_API_KEY_LEN` bilan bir xil chegarada.
 */
const KEY_MIN_LEN = 16;

/** Relay qilinadigan media turlari. Boshqasi (sticker, location…) aniq rad etiladi. */
const MEDIA_KINDS = ['photo', 'document', 'video', 'voice', 'audio', 'animation', 'sticker', 'video_note'] as const;
type MediaKind = (typeof MEDIA_KINDS)[number];

/**
 * Foydalanuvchi niyatini bildirmaydigan xabarlar — jim o'tiladi.
 * Bularga «bu turdagi faylni qabul qila olmayman» deb javob berish shovqin.
 */
const NO_INTENT_KINDS = ['pinned_message', 'story', 'dice', 'poll', 'location', 'venue', 'game'] as const;

/** Sarlavha (caption) ilib bo'lmaydigan turlar — ular uchun kartochka alohida ketadi */
const CAPTIONLESS: readonly string[] = ['sticker', 'video_note'];

// ─────────────────────────── Yordamchilar ───────────────────────────

function chatIdOf(ctx: BotContext): string {
  return ctx.chat ? String(ctx.chat.id) : '';
}

/** Operator kartochkasidagi ism — HTML ga tushishidan oldin tozalanadi */
function displayName(user: { firstName: string | null; lastName: string | null; telegramId: string }): string {
  const full = [user.firstName, user.lastName].filter(Boolean).join(' ').trim();
  return full || user.telegramId;
}

/**
 * Murojaat kodini FAQAT operator kartochkasidan ajratadi.
 *
 * Bu zaxira yo'l: baza yozuvi topilmaganda ishlaydi. Shuning uchun u juda
 * tor bo'lishi shart — aks holda operator `/tickets` RO'YXATIGA reply qilsa,
 * ro'yxatdagi BIRINCHI kod olinib, javob butunlay boshqa sotuvchiga ketardi.
 *
 * Ikkita shart: (1) butun matnda faqat BITTA kod bo'lishi kerak,
 * (2) kod birinchi qatorda, kartochka belgisi 🆘 dan keyin turishi kerak.
 * Ro'yxat ikkalasida ham yiqiladi va operator «bu matn kimga?» tugmalarini
 * oladi — bot hech qachon o'zi taxmin qilmaydi.
 */
export function parseTicketCode(text: string): string {
  const value = text ?? '';
  const unique = new Set((value.match(/#S-[A-Z0-9]{4,6}/g) ?? []).map((v) => v.slice(3)));
  if (unique.size !== 1) return '';

  const firstLine = value.split('\n', 1)[0] ?? '';
  const m = /^🆘\s+#S-([A-Z0-9]{4,6})\b/.exec(firstLine);
  return m ? (m[1] ?? '') : '';
}

/** Bo'shliqsiz uzun token — savol emas, kalit bo'lishi ehtimoli yuqori */
export function looksLikeApiKey(text: string): boolean {
  const value = text.trim();
  if (value.length < KEY_MIN_LEN || /s/.test(value)) return false;
  if (!/^[A-Za-z0-9._~+/=-]+$/.test(value)) return false;
  // Uzun qo'shma o'zbekcha so'z ham bo'shliqsiz bo'lishi mumkin — kalitda esa
  // deyarli har doim raqam yoki xizmat belgisi uchraydi
  return /[0-9._~+/=-]/.test(value);
}

/** Ish vaqti tashqarisida bo'lsa tasdiqqa qo'shiladigan qator */
function offHoursNote(ctx: BotContext): string {
  const hour = localHour(new Date());
  return hour >= WORK_FROM && hour < WORK_TO ? '' : t(ctx, 'support_offhours');
}

/** «3 soat oldin» ko'rinishidagi qisqa yosh — /tickets ro'yxati uchun */
function ageLabel(lang: 'uz' | 'ru', from: Date): string {
  // Pastga yaxlitlanadi: 90 daqiqa «2 soat» emas, «1 soat» bo'lishi kerak
  const mins = Math.max(0, Math.floor((Date.now() - from.getTime()) / 60_000));
  if (mins < 60) return tr(lang, 'age_min', { n: mins });
  const hours = Math.floor(mins / 60);
  if (hours < 24) return tr(lang, 'age_hour', { n: hours });
  return tr(lang, 'age_day', { n: Math.floor(hours / 24) });
}

/** Tugma javobi (toast) HTML ni tushunmaydi — teglar matn bo'lib ko'rinardi */
function stripTags(value: string): string {
  return value.replace(/<[^>]+>/g, '');
}

/** Buyruq adminmi? Bo'lmasa javob beriladi va `false` qaytadi (admin.ts naqshi) */
async function ensureAdmin(ctx: BotContext): Promise<boolean> {
  if (isAdmin(ctx.from?.id)) return true;
  await ctx.reply(t(ctx, 'admin_only'));
  return false;
}

// ─────────────────────────── Kartochka ───────────────────────────

export async function showSupport(ctx: BotContext): Promise<void> {
  const step = currentStep(ctx);
  // Ro'yxatdan o'tish davom etayotgan bo'lsa oddiy matn o'sha oqimga ketadi —
  // foydalanuvchini `/support savol` shakliga yo'naltiramiz
  const note = step === 'idle' ? '' : t(ctx, 'support_onb_note');

  await ctx.reply(clampMessage(t(ctx, 'support') + note), {
    parse_mode: 'HTML',
    link_preview_options: { is_disabled: true },
    reply_markup: supportCardKeyboard(ctx.sp.lang),
  });
}

// ─────────────────────────── Sotuvchi → operator ───────────────────────────

/**
 * Markaziy funksiya: savolni saqlaydi va operatorga uzatadi.
 *
 * `messageId` berilgan bo'lsa media `copyMessage` bilan nusxalanadi
 * (`forwardMessage` emas: sotuvchi maxfiylikni yopsa, forward manbasida uning
 * id'si bo'lmaydi va javobni qaytarib bo'lmasdi).
 */
async function relay(
  ctx: BotContext,
  body: string,
  kind: 'text' | MediaKind,
  messageId?: number,
): Promise<void> {
  const user = ctx.sp.user;
  if (!user) {
    await ctx.reply(t(ctx, 'need_start'));
    return;
  }

  /*
   * Uzum API kaliti operatorga ketib qolmasin.
   *
   * «Kalitni yangilash» oqimi faqat xotirada saqlanadi va bot qayta ishga
   * tushsa yo'qoladi — o'shanda yopishtirilgan kalit `idle` matn bo'lib,
   * shifrlanmagan holda bazaga yozilib, operator chatiga ketardi. Kalit
   * hech qachon shu yo'ldan o'tmasligi kerak.
   */
  if (looksLikeApiKey(body)) {
    await ctx.reply(t(ctx, 'support_looks_like_key'), { parse_mode: 'HTML' });
    await ctx.deleteMessage().catch(() => undefined);
    return;
  }

  // Xabar HAR DOIM saqlanadi; chegaradan oshganda faqat operatorga
  // bildirishnoma surilmaydi — aks holda sotuvchiga «qabul qilindi» deb
  // aytib, matnni jimgina tashlab yuborardik
  const throttled = (await countInboundLastHour(user.id)) >= SUPPORT_RATE_MAX;

  const subject = body.trim() || (kind === 'text' ? '' : `[${kind}]`);
  const { ticket, isNew } = await openOrReuseTicket({
    userId: user.id,
    lang: ctx.sp.lang,
    subject: cut(subject, 110),
  });

  const messageRowId = await addSupportMessage({
    ticketId: ticket.id,
    direction: 'in',
    kind,
    body,
    userChatId: chatIdOf(ctx),
    userMessageId: messageId ?? ctx.message?.message_id ?? null,
  });

  if (throttled) {
    await ctx.reply(t(ctx, 'support_throttled'));
    return;
  }

  const delivered = await pushToOperators(ctx, ticket, {
    rowId: messageRowId,
    body,
    kind,
    messageId,
  });

  if (!delivered) {
    await ctx.reply(t(ctx, 'support_failed', { code: `#S-${ticket.code}` }), { parse_mode: 'HTML' });
    return;
  }

  await ctx.reply(
    t(ctx, isNew ? 'support_sent' : 'support_added', {
      code: `#S-${ticket.code}`,
      note: offHoursNote(ctx),
    }),
    { parse_mode: 'HTML', reply_markup: mainMenu(ctx.sp.lang) },
  );
}

/**
 * Barcha operatorlarga yuboradi.
 *
 * Har biri alohida `try/catch` da: operator botni bloklagan yoki hech qachon
 * /start bosmagan bo'lsa ham qolganlariga xabar borishi kerak. Hech biriga
 * yetmasa `false` qaytadi — savol baribir bazada qoladi va `/tickets` da ko'rinadi.
 */
async function pushToOperators(
  ctx: BotContext,
  ticket: TicketRow,
  msg: { rowId: string; body: string; kind: 'text' | MediaKind; messageId?: number },
): Promise<boolean> {
  const lang = OPERATOR_LANG;
  const name = escapeHtml(displayName(ticket.user));
  const username = ticket.user.username ? escapeHtml(`@${ticket.user.username}`) : '';
  const company = escapeHtml(ctx.sp.company?.name ?? '—');

  // tr() HTML ni escape qilmaydi va hamma narsa parse_mode: HTML bilan ketadi,
  // shuning uchun har bir foydalanuvchi qiymati var sifatida escape qilinadi
  const vars = {
    code: `#S-${ticket.code}`,
    name,
    username,
    tid: ticket.user.telegramId,
    company,
    lang: ticket.lang,
    // Qirqish escape'dan OLDIN: tayyor HTML ni kesish mnemonikani yoki
    // teglarni yarmidan bo'lib, Telegram butun xabarni rad etardi
    body: escapeHtml(cut(msg.body, CAPTION_MAX - 240)),
  };

  const card = clampMessage(tr(lang, 'sup_card', vars));
  const caption = tr(lang, 'sup_card_media', vars);

  let ok = false;
  for (const adminId of env.telegram.adminIds) {
    try {
      let sent;
      if (msg.kind === 'text' || !msg.messageId) {
        sent = await ctx.api.sendMessage(adminId, card, {
          parse_mode: 'HTML',
          link_preview_options: { is_disabled: true },
          reply_markup: ticketCardKeyboard(lang, ticket.id),
        });
      } else if (CAPTIONLESS.includes(msg.kind)) {
        // Stikerga sarlavha ilib bo'lmaydi — avval kodli kartochka, keyin fayl.
        // Reply uchun langar kartochka bo'ladi, shunda kod har doim ko'rinadi.
        sent = await ctx.api.sendMessage(adminId, card, {
          parse_mode: 'HTML',
          link_preview_options: { is_disabled: true },
          reply_markup: ticketCardKeyboard(lang, ticket.id),
        });
        await ctx.api.copyMessage(adminId, chatIdOf(ctx), msg.messageId).catch(() => undefined);
      } else {
        sent = await ctx.api.copyMessage(adminId, chatIdOf(ctx), msg.messageId, {
          caption,
          parse_mode: 'HTML',
          reply_markup: ticketCardKeyboard(lang, ticket.id),
        });
      }

      // Faqat BIRINCHI muvaffaqiyatli yuborish yo'naltirish uchun yoziladi:
      // bitta xabar qatorida bitta juftlik saqlanadi
      if (!ok) await markRelayed(msg.rowId, adminId, sent.message_id);
      ok = true;
    } catch {
      // Operator botni bloklagan yoki /start bosmagan — qolganlariga urinamiz
    }
    await sleep(PUSH_DELAY_MS);
  }
  return ok;
}

/** `/support` — matnsiz bo'lsa kartochka, matn bilan bo'lsa darhol yuboradi */
export async function onSupportCommand(ctx: BotContext, payload: string | undefined): Promise<void> {
  const text = (payload ?? '').trim();
  if (!text) {
    await showSupport(ctx);
    return;
  }
  await relay(ctx, text, 'text');
}

/** Menyu bosqichidagi erkin matn — savol */
export async function onSupportText(ctx: BotContext, text: string): Promise<void> {
  await relay(ctx, text, 'text');
}

/**
 * Matnsiz xabarlar: skrinshot, hujjat, ovozli xabar.
 *
 * Bular bugungacha hech qanday handlerga tushmasdi va jimgina tashlanardi —
 * holbuki eng ehtimolli support yuki aynan skrinshot.
 */
export async function onSupportMedia(ctx: BotContext, next: () => Promise<void>): Promise<void> {
  const message = ctx.message;
  if (!message) {
    await next();
    return;
  }

  const kind = MEDIA_KINDS.find((k) => k in message);
  if (!kind) {
    // Xizmat xabarlari (pin, story, dice…) foydalanuvchi niyatini bildirmaydi
    if (NO_INTENT_KINDS.some((k) => k in message)) return;
    await ctx.reply(t(ctx, 'support_media_bad'));
    return;
  }

  // Operatorning o'z media'si murojaat bo'lib qolmasin: javob bermoqchi bo'lsa
  // u kartochkaga reply qiladi va bu yergacha yetib kelmaydi
  if (isAdmin(ctx.from?.id)) {
    await askWhichTicket(ctx, message.caption ?? '', async () => {
      await ctx.reply(t(ctx, 'sup_tickets_empty'), { parse_mode: 'HTML' });
    });
    return;
  }

  await relay(ctx, message.caption ?? '', kind, message.message_id);
}

// ─────────────────────────── Operator → sotuvchi ───────────────────────────

/** Javobni foydalanuvchiga yuborish (matn yoki media) */
async function deliverAnswer(
  api: Api,
  ticket: TicketRow,
  fromChatId: string,
  message: { text?: string; message_id: number; hasMedia: boolean; caption?: string },
): Promise<boolean> {
  const chatId = ticket.user.botChatId ?? ticket.user.telegramId;
  const head = tr(ticket.lang, 'support_reply_head', { code: `#S-${ticket.code}` });

  try {
    if (message.hasMedia) {
      await api.copyMessage(chatId, fromChatId, message.message_id, {
        caption: `${head}\n\n${escapeHtml(message.caption ?? '')}`.slice(0, CAPTION_MAX),
        parse_mode: 'HTML',
      });
    } else {
      await api.sendMessage(chatId, clampMessage(`${head}\n\n${escapeHtml(message.text ?? '')}`), {
        parse_mode: 'HTML',
        reply_markup: supportMoreKeyboard(ticket.lang),
      });
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Operator biror xabarga reply qilib javob berdi.
 *
 * Murojaat avval baza jadvali bo'yicha (`adminChatId` + `adminMessageId`),
 * topilmasa sarlavhadagi `#S-XXXX` kodi bo'yicha qidiriladi. Ikkalasi ham
 * bo'sh bo'lsa `next()` chaqiriladi — admin botni o'z kompaniyasi uchun
 * ishlatishi buzilmasligi kerak.
 */
export async function onAdminReply(ctx: BotContext, next: () => Promise<void>): Promise<void> {
  if (!isAdmin(ctx.from?.id)) {
    await next();
    return;
  }
  const message = ctx.message;
  const reply = message?.reply_to_message;
  if (!message || !reply) {
    await next();
    return;
  }

  const ticket =
    (await findTicketByAdminMessage(chatIdOf(ctx), reply.message_id)) ??
    (await findTicketByCode(parseTicketCode(reply.text ?? reply.caption ?? '')));
  if (!ticket) {
    await next();
    return;
  }

  const hasMedia = MEDIA_KINDS.some((k) => k in message);
  const body = message.text ?? message.caption ?? '';

  // Nusxalab bo'lmaydigan tur (joylashuv, so'rovnoma) — sotuvchiga bo'sh xabar
  // ketib, murojaat «javob berilgan» deb belgilanib qolardi
  if (!hasMedia && !body.trim()) {
    await ctx.reply(t(ctx, 'sup_reply_unsupported'));
    return;
  }

  const ok = await deliverAnswer(ctx.api, ticket, chatIdOf(ctx), {
    text: body,
    caption: message.caption,
    message_id: message.message_id,
    hasMedia,
  });

  const name = escapeHtml(displayName(ticket.user));
  if (!ok) {
    await ctx.reply(t(ctx, 'sup_reply_fail', { code: `#S-${ticket.code}` }), { parse_mode: 'HTML' });
    return;
  }

  await addSupportMessage({
    ticketId: ticket.id,
    direction: 'out',
    kind: hasMedia ? 'media' : 'text',
    body,
    authorId: ctx.from ? String(ctx.from.id) : null,
  });
  await markAnswered(ticket.id);
  await ctx.reply(t(ctx, 'sup_reply_ok', { code: `#S-${ticket.code}`, name }), { parse_mode: 'HTML' });
}

/**
 * Operator reply QILMASDAN yozdi.
 *
 * Xabar jimgina yo'qolmasligi ham, taxmin bilan noto'g'ri odamga ketishi ham
 * mumkin emas — bot ochiq murojaatlar ro'yxatini tugmalar bilan ko'rsatadi.
 * Matnning o'zi hech qayerda saqlanmaydi: so'rov operatorning O'Z xabariga
 * reply qilib yuboriladi, keyin callback'da o'sha yerdan o'qiladi. Ya'ni
 * saqlagich — Telegram, va bot restarti buni buzmaydi.
 */
export async function askWhichTicket(ctx: BotContext, text: string, fallback: () => Promise<void>): Promise<void> {
  const open = await listOpenTickets(WHICH_LIMIT);
  if (open.length === 0) {
    // Ochiq murojaat yo'q — eski xulq saqlanadi, regressiya bo'lmaydi
    await fallback();
    return;
  }

  // So'rov operatorning O'Z xabariga reply bo'lishi SHART: matn o'sha yerda
  // yotadi va tugma bosilganda o'sha yerdan o'qiladi. Reply qila olmasak
  // tugmalar matnsiz qolardi — shuning uchun xatolik yutilmaydi.
  try {
    await ctx.reply(t(ctx, 'sup_which'), {
      reply_parameters: { message_id: ctx.message?.message_id ?? 0, allow_sending_without_reply: false },
      reply_markup: whichTicketKeyboard(
        ctx.sp.lang,
        open.map((ticket) => ({
          id: ticket.id,
          code: `#S-${ticket.code}`,
          name: cut(displayName(ticket.user), 18),
        })),
      ),
    });
  } catch {
    await ctx.reply(t(ctx, 'sup_reply_usage'), { parse_mode: 'HTML' });
  }
  void text; // matn operatorning o'z xabarida qoladi — bu yerda saqlanmaydi
}

// ─────────────────────────── Inline tugmalar ───────────────────────────

export async function onSupportAction(ctx: BotContext, action: string, id: string): Promise<void> {
  if (action === 'more') {
    await ctx.answerCallbackQuery();
    await showSupport(ctx);
    return;
  }

  // Tez javob: operatorni kutmasdan
  if (action === 'faq') {
    await ctx.answerCallbackQuery();
    const key = id === 'sync' ? 'faq_sync' : id === 'billing' ? 'faq_billing' : id === 'ask' ? 'faq_ask' : 'faq_key';
    // «Shunchaki yozing» maslahati faqat menyu bosqichida to'g'ri: ro'yxatdan
    // o'tish davom etayotganda oddiy matn o'sha oqimga ketadi
    const note = key === 'faq_ask' && currentStep(ctx) !== 'idle' ? t(ctx, 'support_onb_note') : '';
    await ctx.reply(clampMessage(t(ctx, key, { link: webLink('/pricing') }) + note), {
      parse_mode: 'HTML',
      link_preview_options: { is_disabled: true },
    });
    return;
  }

  if (action === 'cancel') {
    await ctx.answerCallbackQuery();
    await ctx.editMessageText(t(ctx, 'canceled')).catch(() => undefined);
    return;
  }

  if (!isAdmin(ctx.from?.id)) {
    await ctx.answerCallbackQuery();
    return;
  }

  if (action === 'close') {
    const ticket = await findTicketById(id);
    if (!ticket) {
      await ctx.answerCallbackQuery({ text: t(ctx, 'sup_not_found') }).catch(() => undefined);
      return;
    }
    await closeTicket(ticket.id);
    // Eskirgan so'rov id'si xato beradi — u butun handler'ni to'xtatmasligi kerak
    await ctx
      .answerCallbackQuery({ text: stripTags(t(ctx, 'sup_closed', { code: `#S-${ticket.code}` })) })
      .catch(() => undefined);
    await ctx.editMessageReplyMarkup({ reply_markup: new InlineKeyboard() }).catch(() => undefined);
    return;
  }

  if (action === 'to') {
    await sendChosenTicket(ctx, id);
  }
}

/** «Bu matn kimga?» — tugma bosilgach matnni operator xabaridan o'qib yuboradi */
async function sendChosenTicket(ctx: BotContext, ticketId: string): Promise<void> {
  const ticket = await findTicketById(ticketId);
  if (!ticket) {
    await ctx.answerCallbackQuery({ text: t(ctx, 'sup_not_found') }).catch(() => undefined);
    return;
  }

  // `InaccessibleMessage` da `date === 0` bo'ladi va `reply_to_message` yo'q
  const prompt = ctx.callbackQuery?.message;
  const source = prompt && 'date' in prompt && prompt.date !== 0 ? prompt.reply_to_message : undefined;
  const body = source?.text ?? source?.caption ?? '';

  if (!body) {
    // Toast 200 belgiga sig'adi va HTML ni tushunmaydi; show_alert bilan
    // ko'rsatma ekranda qoladi
    await ctx
      .answerCallbackQuery({
        text: stripTags(t(ctx, 'sup_draft_expired', { code: `#S-${ticket.code}` })),
        show_alert: true,
      })
      .catch(() => undefined);
    return;
  }

  const ok = await deliverAnswer(ctx.api, ticket, chatIdOf(ctx), {
    text: body,
    message_id: source?.message_id ?? 0,
    hasMedia: false,
  });

  const name = escapeHtml(displayName(ticket.user));
  if (!ok) {
    await ctx.answerCallbackQuery();
    await ctx.editMessageText(t(ctx, 'sup_reply_fail', { code: `#S-${ticket.code}` }), {
      parse_mode: 'HTML',
    }).catch(() => undefined);
    return;
  }

  await addSupportMessage({
    ticketId: ticket.id,
    direction: 'out',
    kind: 'text',
    body,
    authorId: ctx.from ? String(ctx.from.id) : null,
  });
  await markAnswered(ticket.id);

  await ctx.answerCallbackQuery();
  await ctx.editMessageText(t(ctx, 'sup_sent_via_button', { code: `#S-${ticket.code}`, name }), {
    parse_mode: 'HTML',
  }).catch(() => undefined);
}

// ─────────────────────────── Operator buyruqlari ───────────────────────────

export async function onTickets(ctx: BotContext): Promise<void> {
  if (!(await ensureAdmin(ctx))) return;

  const open = await listOpenTickets(20);
  if (open.length === 0) {
    await ctx.reply(t(ctx, 'sup_tickets_empty'), { parse_mode: 'HTML' });
    return;
  }

  const lang = ctx.sp.lang;
  const rows = open.map((ticket) =>
    tr(lang, 'sup_tickets_row', {
      code: `#S-${ticket.code}`,
      name: escapeHtml(cut(displayName(ticket.user), 24)),
      age: ageLabel(lang, ticket.lastMessageAt),
      subject: escapeHtml(cut(ticket.subject || '—', 80)),
    }),
  );

  await ctx.reply(clampMessage([tr(lang, 'sup_tickets_title', { count: open.length }), '', ...rows].join('\n\n')), {
    parse_mode: 'HTML',
  });
}

/** `/reply KOD matn` — reply qilishning imkoni bo'lmagan holat uchun zaxira */
export async function onReplyCmd(ctx: BotContext, payload: string | undefined): Promise<void> {
  if (!(await ensureAdmin(ctx))) return;

  const raw = (payload ?? '').trim();
  const space = raw.indexOf(' ');
  if (space < 1) {
    await ctx.reply(t(ctx, 'sup_reply_usage'), { parse_mode: 'HTML' });
    return;
  }

  const code = raw.slice(0, space).replace(/^#?S-/i, '');
  const body = raw.slice(space + 1).trim();
  if (!body) {
    await ctx.reply(t(ctx, 'sup_reply_usage'), { parse_mode: 'HTML' });
    return;
  }

  const ticket = await findTicketByCode(code);
  if (!ticket) {
    await ctx.reply(t(ctx, 'sup_not_found'));
    return;
  }

  const ok = await deliverAnswer(ctx.api, ticket, chatIdOf(ctx), {
    text: body,
    message_id: ctx.message?.message_id ?? 0,
    hasMedia: false,
  });

  if (!ok) {
    await ctx.reply(t(ctx, 'sup_reply_fail', { code: `#S-${ticket.code}` }), { parse_mode: 'HTML' });
    return;
  }

  await addSupportMessage({
    ticketId: ticket.id,
    direction: 'out',
    kind: 'text',
    body,
    authorId: ctx.from ? String(ctx.from.id) : null,
  });
  await markAnswered(ticket.id);
  await ctx.reply(
    t(ctx, 'sup_reply_ok', { code: `#S-${ticket.code}`, name: escapeHtml(displayName(ticket.user)) }),
    { parse_mode: 'HTML' },
  );
}

export async function onCloseCmd(ctx: BotContext, payload: string | undefined): Promise<void> {
  if (!(await ensureAdmin(ctx))) return;

  const code = (payload ?? '').trim().replace(/^#?S-/i, '');
  if (!code) {
    await ctx.reply(t(ctx, 'sup_close_usage'), { parse_mode: 'HTML' });
    return;
  }

  const ticket = await findTicketByCode(code);
  if (!ticket) {
    await ctx.reply(t(ctx, 'sup_not_found'));
    return;
  }

  await closeTicket(ticket.id);
  await ctx.reply(t(ctx, 'sup_closed', { code: `#S-${ticket.code}` }), { parse_mode: 'HTML' });
}
