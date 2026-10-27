/**
 * Klaviaturalar — doimiy menyu (reply) va inline tugmalar.
 * Barcha matnlar i18n dan olinadi, shuning uchun til o'zgarganda tugmalar ham o'zgaradi.
 */
import { InlineKeyboard, Keyboard } from 'grammy';
import { tr, type BotLang, type TKey } from '../i18n.js';
import { webLink } from './context.js';
import type { ReportPeriod } from '../lib/dashboard-kpi.js';

/** Callback ma'lumot prefikslari (bitta joyda — xatoga yo'l qo'ymaslik uchun) */
export const CB = {
  lang: 'lang:', // lang:uz | lang:ru | lang:en
  settings: 'set:', // set:daily | set:orders | set:stock | set:weekly | set:monthly | set:lang | set:api
  settingsHome: 'set:home',
  support: 'sup:', // sup:more | sup:close:<id> | sup:to:<id> | sup:cancel
  report: 'rep:', // rep:today | rep:yesterday | rep:month | rep:year
} as const;

/**
 * Doimiy menyu (7 ta tugma).
 *
 * «Yordam» oxirgi qatorda yolg'iz va butun kenglikda: bu favqulodda tugma,
 * u boshqa oltitasiga o'xshab ketmasligi kerak. Mavjud oltita yorliqning
 * matni HECH QACHON o'zgartirilmaydi — reply-klaviatura klientda saqlanadi
 * va `matchButton` qat'iy tenglik bilan solishtiradi, ya'ni nomni o'zgartirish
 * eski klaviaturaga ega barcha foydalanuvchini buzardi.
 */
export function mainMenu(lang: BotLang): Keyboard {
  return new Keyboard()
    .text(tr(lang, 'btn_today'))
    .text(tr(lang, 'btn_stocks'))
    .row()
    .text(tr(lang, 'btn_login'))
    .text(tr(lang, 'btn_billing'))
    .row()
    .text(tr(lang, 'btn_referral'))
    .text(tr(lang, 'btn_settings'))
    .row()
    .text(tr(lang, 'btn_support'))
    .resized();
}

/** Telefon raqamini so'rash */
export function phoneKeyboard(lang: BotLang): Keyboard {
  return new Keyboard().requestContact(tr(lang, 'btn_share_phone')).resized().oneTime();
}

/** Til tanlash */
export function langKeyboard(lang: BotLang): InlineKeyboard {
  return new InlineKeyboard()
    .text(tr(lang, 'lang_uz'), `${CB.lang}uz`)
    .text(tr(lang, 'lang_ru'), `${CB.lang}ru`)
    .text(tr(lang, 'lang_en'), `${CB.lang}en`);
}

/** Tilning o'z nomi (sozlamalar tugmasida) */
const LANG_NAME: Record<BotLang, TKey> = { uz: 'lang_uz', ru: 'lang_ru', en: 'lang_en' };

/** Saytga o'tish tugmasi */
export function siteKeyboard(lang: BotLang, path = '/dashboard'): InlineKeyboard {
  return new InlineKeyboard().url(tr(lang, 'btn_open_site'), webLink(path));
}

const REPORT_BUTTON: Record<ReportPeriod, TKey> = {
  today: 'btn_rep_today',
  yesterday: 'btn_rep_yesterday',
  month: 'btn_rep_month',
  year: 'btn_rep_year',
};

/**
 * Hisobot ostidagi davr tugmalari (2×2) va saytga o'tish.
 *
 * Davrlar asosiy (reply) menyuga qo'shilmadi: u yerda yettita tugma bor va
 * yorliqlar o'zgarmasligi kerak (mainMenu izohi). Hisobot xabarining
 * o'zida almashtirish — bitta xabar, chat to'lib ketmaydi (2026-10-27).
 * Tanlangan davr «✓» bilan; uni qayta bossa — raqamlar yangilanadi.
 */
export function reportKeyboard(lang: BotLang, active: ReportPeriod): InlineKeyboard {
  const btn = (p: ReportPeriod): [string, string] => {
    const label = tr(lang, REPORT_BUTTON[p]);
    return [p === active ? `✓ ${label}` : label, `${CB.report}${p}`];
  };
  return new InlineKeyboard()
    .text(...btn('today'))
    .text(...btn('yesterday'))
    .row()
    .text(...btn('month'))
    .text(...btn('year'))
    .row()
    .url(tr(lang, 'btn_open_site'), webLink('/dashboard'));
}

/** Kirish havolasi (bir martalik kod bilan) */
export function loginKeyboard(lang: BotLang, url: string): InlineKeyboard {
  return new InlineKeyboard().url(tr(lang, 'btn_login_link'), url);
}

/** Tariflar sahifasi */
export function pricingKeyboard(lang: BotLang): InlineKeyboard {
  return new InlineKeyboard().url(tr(lang, 'btn_pricing'), webLink('/pricing'));
}

export interface NotifyFlags {
  daily: boolean;
  orders: boolean;
  stock: boolean;
  weekly: boolean;
  monthly: boolean;
}

/** Sozlamalar: bildirishnoma tugmalari + til + API kalit */
export function settingsKeyboard(lang: BotLang, flags: NotifyFlags): InlineKeyboard {
  const state = (on: boolean): string => tr(lang, on ? 'on' : 'off');
  return new InlineKeyboard()
    .text(tr(lang, 'set_notify_daily', { value: state(flags.daily) }), `${CB.settings}daily`)
    .row()
    .text(tr(lang, 'set_notify_orders', { value: state(flags.orders) }), `${CB.settings}orders`)
    .row()
    .text(tr(lang, 'set_notify_stock', { value: state(flags.stock) }), `${CB.settings}stock`)
    .row()
    .text(tr(lang, 'set_notify_weekly', { value: state(flags.weekly) }), `${CB.settings}weekly`)
    .row()
    .text(tr(lang, 'set_notify_monthly', { value: state(flags.monthly) }), `${CB.settings}monthly`)
    .row()
    .text(tr(lang, 'set_lang', { value: tr(lang, LANG_NAME[lang]) }), `${CB.settings}lang`)
    .row()
    .text(tr(lang, 'set_api'), `${CB.settings}api`);
}

// ─────────────────────────── Qo'llab-quvvatlash ───────────────────────────

/**
 * Yordam kartochkasi ostidagi tez-javob tugmalari.
 *
 * Eng ko'p beriladigan uchta savol shu yerda darhol javob oladi — sotuvchi
 * kutmaydi, operatorga esa faqat haqiqiy muammolar qoladi.
 */
export function supportCardKeyboard(lang: BotLang): InlineKeyboard {
  return new InlineKeyboard()
    .text(tr(lang, 'btn_faq_key'), `${CB.support}faq:key`)
    .row()
    .text(tr(lang, 'btn_faq_sync'), `${CB.support}faq:sync`)
    .row()
    .text(tr(lang, 'btn_faq_billing'), `${CB.support}faq:billing`)
    .row()
    .text(tr(lang, 'btn_faq_ask'), `${CB.support}faq:ask`);
}

/** Operator javobi ostida: yana savol yozishni taklif qiladi */
export function supportMoreKeyboard(lang: BotLang): InlineKeyboard {
  return new InlineKeyboard().text(tr(lang, 'btn_support_more'), `${CB.support}more`);
}

/** Operator kartochkasi ostida: murojaatni bir bosishda yopish */
export function ticketCardKeyboard(lang: BotLang, ticketId: string): InlineKeyboard {
  return new InlineKeyboard().text(tr(lang, 'btn_sup_close'), `${CB.support}close:${ticketId}`);
}

/**
 * Operator reply qilmasdan yozganda: «bu matn kimga?».
 * Bot o'zi hech qachon tanlamaydi — noto'g'ri odamga ketish ehtimoli nolga tushadi.
 */
export function whichTicketKeyboard(
  lang: BotLang,
  tickets: Array<{ id: string; code: string; name: string }>,
): InlineKeyboard {
  const kb = new InlineKeyboard();
  for (const t of tickets) {
    kb.text(`${t.code} · ${t.name}`, `${CB.support}to:${t.id}`).row();
  }
  return kb.text(tr(lang, 'btn_sup_cancel'), `${CB.support}cancel`);
}
