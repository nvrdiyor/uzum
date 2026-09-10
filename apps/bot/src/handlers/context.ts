/**
 * Bot konteksti va suhbat holati.
 *
 * — `BotContext` — grammY konteksti + shu foydalanuvchi uchun yuklangan ma'lumot (`sp`);
 * — bosqichli suhbat holati oddiy in-memory `Map` da saqlanadi, lekin asosiy bosqich
 *   bazadan (`User.phone`, `Company.onboardStep`) tiklanadi — bot qayta ishga tushsa ham
 *   oqim to'xtamaydi.
 *
 * Bu fayl faqat yordamchi: bu yerda hech qanday `bot.on(...)` ro'yxatga olinmaydi.
 */
import type { Context } from 'grammy';
import { prisma } from '../lib/db.js';
import { env, isAdmin } from '../lib/env.js';
import { randomReferralCode } from '../crypto.js';
import { toBotLang, tr, type BotLang, type TKey } from '../i18n.js';

// ─────────────────────────── Tiplar ───────────────────────────

/** Ro'yxatdan o'tish bosqichlari (Company.onboardStep bilan mos) */
export type OnboardStep = 'company' | 'tax' | 'api_key' | 'syncing' | 'done';

/** Suhbatning joriy qadami */
export type FlowStep =
  | 'lang' // til tanlanmagan / /start kutilmoqda
  | 'phone' // telefon so'ralmoqda
  | 'company' // kompaniya nomi
  | 'tax' // soliq stavkasi
  | 'api_key' // birinchi API kalit
  | 'api_key_update' // sozlamalar orqali kalitni yangilash
  | 'idle'; // ro'yxatdan o'tgan, menyu ishlaydi

export interface BotUser {
  id: string;
  telegramId: string;
  lang: BotLang;
  phone: string | null;
  firstName: string | null;
  referralCode: string;
  notifyDaily: boolean;
  notifyOrders: boolean;
  notifyStock: boolean;
  isAdmin: boolean;
}

export interface BotCompany {
  id: string;
  name: string;
  taxRate: number;
  onboardStep: OnboardStep;
  onboarded: boolean;
  role: string;
  hasApiKey: boolean;
}

export interface SpState {
  lang: BotLang;
  user: BotUser | null;
  company: BotCompany | null;
}

/** grammY konteksti + `sp` (bizning ma'lumotlarimiz) */
export type BotContext = Context & { sp: SpState };

// ─────────────────────────── Vaqtinchalik holat (in-memory) ───────────────────────────

interface FlowEntry {
  step: FlowStep;
  updatedAt: number;
}

/** telegramId → vaqtinchalik qadam. Faqat bazada saqlanmaydigan qadamlar uchun. */
const flowStore = new Map<string, FlowEntry>();

/** Eskirgan yozuvlar 2 soatdan keyin o'chiriladi (xotira o'smasligi uchun) */
const FLOW_TTL_MS = 2 * 60 * 60 * 1000;

export function setFlow(telegramId: string, step: FlowStep): void {
  flowStore.set(telegramId, { step, updatedAt: Date.now() });
}

export function clearFlow(telegramId: string): void {
  flowStore.delete(telegramId);
}

function readFlow(telegramId: string): FlowStep | null {
  const entry = flowStore.get(telegramId);
  if (!entry) return null;
  if (Date.now() - entry.updatedAt > FLOW_TTL_MS) {
    flowStore.delete(telegramId);
    return null;
  }
  return entry.step;
}

/**
 * Joriy qadam: avval vaqtinchalik holat (masalan «kalitni yangilash»),
 * so'ng bazadagi haqiqiy holat bo'yicha aniqlanadi.
 */
export function resolveStep(state: SpState, telegramId: string): FlowStep {
  const temp = readFlow(telegramId);
  if (temp === 'api_key_update') return temp;

  const { user, company } = state;
  if (!user) return 'lang';
  if (!user.phone) return 'phone';
  if (!company) return 'company';

  switch (company.onboardStep) {
    case 'company':
      return 'company';
    case 'tax':
      return 'tax';
    case 'api_key':
      return company.hasApiKey ? 'idle' : 'api_key';
    default:
      return 'idle';
  }
}

// ─────────────────────────── Foydalanuvchini yuklash ───────────────────────────

const USER_SELECT = {
  id: true,
  telegramId: true,
  phone: true,
  firstName: true,
  languageCode: true,
  referralCode: true,
  notifyDaily: true,
  notifyOrders: true,
  notifyStock: true,
} as const;

interface DbUserRow {
  id: string;
  telegramId: string;
  phone: string | null;
  firstName: string | null;
  languageCode: string;
  referralCode: string;
  notifyDaily: boolean;
  notifyOrders: boolean;
  notifyStock: boolean;
}

function toBotUser(row: DbUserRow): BotUser {
  return {
    id: row.id,
    telegramId: row.telegramId,
    lang: toBotLang(row.languageCode),
    phone: row.phone,
    firstName: row.firstName,
    referralCode: row.referralCode,
    notifyDaily: row.notifyDaily,
    notifyOrders: row.notifyOrders,
    notifyStock: row.notifyStock,
    isAdmin: isAdmin(row.telegramId),
  };
}

/** Foydalanuvchining birinchi kompaniyasi (a'zolik yaratilgan tartibda) */
export async function loadCompany(userId: string): Promise<BotCompany | null> {
  const membership = await prisma.membership.findFirst({
    where: { userId },
    orderBy: { createdAt: 'asc' },
    include: { company: { select: { id: true, name: true, taxRate: true, onboardStep: true, onboarded: true } } },
  });
  if (!membership) return null;

  const accounts = await prisma.uzumAccount.count({ where: { companyId: membership.companyId } });

  return {
    id: membership.company.id,
    name: membership.company.name,
    taxRate: membership.company.taxRate,
    onboardStep: (membership.company.onboardStep as OnboardStep) ?? 'company',
    onboarded: membership.company.onboarded,
    role: membership.role,
    hasApiKey: accounts > 0,
  };
}

/** telegramId bo'yicha foydalanuvchi + kompaniya (bo'lmasa null) */
export async function loadState(telegramId: string): Promise<SpState> {
  const row = await prisma.user.findUnique({ where: { telegramId }, select: USER_SELECT });
  if (!row) return { lang: 'uz', user: null, company: null };
  const user = toBotUser(row);
  const company = await loadCompany(user.id);
  return { lang: user.lang, user, company };
}

/** Kontekstdagi ma'lumotni bazadan qayta o'qish (o'zgarishdan keyin) */
export async function refreshState(ctx: BotContext): Promise<void> {
  const telegramId = ctx.from ? String(ctx.from.id) : null;
  if (!telegramId) return;
  ctx.sp = await loadState(telegramId);
}

/**
 * /start paytida foydalanuvchini yaratadi yoki yangilaydi.
 * `referralCode` faqat bir marta beriladi, `referredById` esa faqat yangi foydalanuvchiga.
 */
export async function upsertUser(input: {
  telegramId: string;
  username: string | null;
  firstName: string | null;
  lastName: string | null;
  chatId: string;
  languageCode?: BotLang;
  referredById?: string | null;
}): Promise<{ user: BotUser; isNew: boolean; refApplied: boolean }> {
  const existing = await prisma.user.findUnique({ where: { telegramId: input.telegramId }, select: USER_SELECT });

  if (existing) {
    const updated = await prisma.user.update({
      where: { id: existing.id },
      data: {
        username: input.username,
        firstName: input.firstName,
        lastName: input.lastName,
        botChatId: input.chatId,
        ...(input.languageCode ? { languageCode: input.languageCode } : {}),
      },
      select: USER_SELECT,
    });
    return { user: toBotUser(updated), isNew: false, refApplied: false };
  }

  const created = await prisma.user.create({
    data: {
      telegramId: input.telegramId,
      username: input.username,
      firstName: input.firstName,
      lastName: input.lastName,
      botChatId: input.chatId,
      languageCode: input.languageCode ?? 'uz',
      referralCode: await uniqueReferralCode(),
      referredById: input.referredById ?? null,
    },
    select: USER_SELECT,
  });

  return { user: toBotUser(created), isNew: true, refApplied: Boolean(input.referredById) };
}

/** Bazada takrorlanmaydigan referal kod */
async function uniqueReferralCode(): Promise<string> {
  for (let i = 0; i < 10; i += 1) {
    const code = randomReferralCode();
    const busy = await prisma.user.findUnique({ where: { referralCode: code }, select: { id: true } });
    if (!busy) return code;
  }
  // Juda kam ehtimol — vaqt qo'shib noyob qilamiz
  return `${randomReferralCode()}${Date.now().toString(36).slice(-3).toUpperCase()}`;
}

// ─────────────────────────── Matn yordamchilari ───────────────────────────

/** Kontekst tilida matn olish */
export function t(ctx: BotContext, key: TKey, vars?: Record<string, string | number>): string {
  return tr(ctx.sp?.lang ?? 'uz', key, vars);
}

/** Telegram HTML uchun xavfsiz matn */
export function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Matnni qisqartirish (uzun mahsulot nomlari uchun) */
export function cut(value: string, max = 42): string {
  const clean = value.trim();
  return clean.length <= max ? clean : `${clean.slice(0, max - 1)}…`;
}

/** Sayt havolasi (`/pricing` → `https://.../pricing`) */
export function webLink(path = ''): string {
  const suffix = path.startsWith('/') || path === '' ? path : `/${path}`;
  return `${env.webUrl}${suffix}`;
}

/** Botning referal havolasi */
export function botLink(referralCode: string): string {
  return `https://t.me/${env.telegram.botUsername}?start=ref_${referralCode}`;
}

/** Telegram cheklovlariga mos xabar (4096 belgidan uzun bo'lmasin) */
export function clampMessage(text: string): string {
  return text.length <= 4000 ? text : `${text.slice(0, 3990)}…`;
}

/** Xabarlarni ketma-ket yuborishda kichik pauza (Telegram rate-limit) */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
