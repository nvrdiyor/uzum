/**
 * Klaviaturalar — doimiy menyu (reply) va inline tugmalar.
 * Barcha matnlar i18n dan olinadi, shuning uchun til o'zgarganda tugmalar ham o'zgaradi.
 */
import { InlineKeyboard, Keyboard } from 'grammy';
import { tr, type BotLang } from '../i18n.js';
import { webLink } from './context.js';

/** Callback ma'lumot prefikslari (bitta joyda — xatoga yo'l qo'ymaslik uchun) */
export const CB = {
  lang: 'lang:', // lang:uz | lang:ru
  settings: 'set:', // set:daily | set:orders | set:stock | set:lang | set:api
  settingsHome: 'set:home',
} as const;

/** Doimiy menyu (6 ta tugma) */
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
    .text(tr(lang, 'lang_ru'), `${CB.lang}ru`);
}

/** Saytga o'tish tugmasi */
export function siteKeyboard(lang: BotLang, path = '/dashboard'): InlineKeyboard {
  return new InlineKeyboard().url(tr(lang, 'btn_open_site'), webLink(path));
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
    .text(tr(lang, 'set_lang', { value: tr(lang, lang === 'ru' ? 'lang_ru' : 'lang_uz') }), `${CB.settings}lang`)
    .row()
    .text(tr(lang, 'set_api'), `${CB.settings}api`);
}
