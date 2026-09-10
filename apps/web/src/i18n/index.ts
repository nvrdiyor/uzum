import { useCallback } from 'react';
import { create } from 'zustand';
import {
  formatCompact,
  formatDecimal,
  formatDate,
  formatDateTime,
  formatMoney,
  formatNumber,
  formatPercent,
  type Lang,
} from '@savdoiq/shared';

export type { Lang };

type Dict = Record<string, string>;
type NsDicts = Partial<Record<Lang, Dict>>;

const registry: Record<string, NsDicts> = {};

/**
 * Har bir sahifa/komponent o'z tarjimalarini ro'yxatdan o'tkazadi —
 * bitta katta fayl bo'lmagani uchun konfliktsiz kengaytiriladi.
 */
export function registerNamespace(ns: string, dicts: NsDicts): void {
  const cur = registry[ns] ?? {};
  registry[ns] = {
    uz: { ...(cur.uz ?? {}), ...(dicts.uz ?? {}) },
    ru: { ...(cur.ru ?? {}), ...(dicts.ru ?? {}) },
    en: { ...(cur.en ?? {}), ...(dicts.en ?? {}) },
  };
}

const LANG_KEY = 'sq-lang';

function detectLang(): Lang {
  // Asosiy auditoriya — O'zbekiston sotuvchilari, shuning uchun standart til o'zbekcha.
  // Brauzer tili faqat ruscha bo'lsa hisobga olinadi; boshqa hollarda uz qoladi.
  try {
    const saved = localStorage.getItem(LANG_KEY) as Lang | null;
    if (saved && ['uz', 'ru', 'en'].includes(saved)) return saved;
    if (navigator.language.slice(0, 2).toLowerCase() === 'ru') return 'ru';
  } catch {
    /* noop */
  }
  return 'uz';
}

interface LangState {
  lang: Lang;
  setLang: (lang: Lang) => void;
}

export const useLangStore = create<LangState>((set) => ({
  lang: detectLang(),
  setLang: (lang) => {
    try {
      localStorage.setItem(LANG_KEY, lang);
      document.documentElement.lang = lang;
    } catch {
      /* noop */
    }
    set({ lang });
  },
}));

export function translate(ns: string, key: string, lang: Lang, vars?: Record<string, string | number>): string {
  const fromNs = registry[ns]?.[lang]?.[key];
  const fromNsUz = registry[ns]?.uz?.[key];
  const fromCommon = registry.common?.[lang]?.[key] ?? registry.common?.uz?.[key];
  let out = fromNs ?? fromCommon ?? fromNsUz ?? key;
  if (vars) {
    Object.entries(vars).forEach(([k, v]) => {
      out = out.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
    });
  }
  return out;
}

export type TFunc = (key: string, vars?: Record<string, string | number>) => string;

export function useT(ns = 'common'): TFunc {
  const lang = useLangStore((s) => s.lang);
  return useCallback((key: string, vars?: Record<string, string | number>) => translate(ns, key, lang, vars), [ns, lang]);
}

export function useLang(): Lang {
  return useLangStore((s) => s.lang);
}

/** Tilga bog'langan formatlash yordamchilari */
export function useFormat() {
  const lang = useLangStore((s) => s.lang);
  return {
    lang,
    money: (v: number, currency = 'UZS') => formatMoney(v, lang, currency),
    num: (v: number, digits = 0) => formatNumber(v, lang, digits),
    dec: (v: number, maxDigits = 3) => formatDecimal(v, lang, maxDigits),
    compact: (v: number) => formatCompact(v, lang),
    pct: (v: number, digits = 1) => formatPercent(v, lang, digits),
    date: (v: string | Date) => formatDate(v, lang),
    dateTime: (v: string | Date) => formatDateTime(v, lang),
    /** Grafik o'qlari uchun qisqa pul formati */
    axisMoney: (v: number) => formatCompact(v, lang),
  };
}

export function pickLocalized<T extends { uz: string; ru: string; en: string }>(obj: T, lang: Lang): string {
  return obj[lang] ?? obj.uz;
}
