/**
 * Jamoa: a'zolar limiti, taklif havolasi, bildirishnoma matnlari va audit
 * (routes/company.ts va routes/invites.ts ikkalasi ham shu yerdan).
 */
import type { Request } from 'express';
import { prisma } from '@savdoiq/db';
import type { User } from '@savdoiq/db';
import { getPlan, type CompanySummary, type Lang, type MemberView, type PlanId } from '@savdoiq/shared';
import { env } from '../env.js';
import { AppError } from '../lib/errors.js';
import { activePlan, asLang, asMemberRole, ensureSubscription } from '../routes/auth.js';

/** Taklif havolasi shuncha kun amal qiladi */
export const INVITE_TTL_DAYS = 7;

// ─────────────────────────── Matnlar ───────────────────────────

/**
 * Jamoa bildirishnomalari — qabul qiluvchining tilida (bot xabarlari ham `languageCode`
 * bo'yicha). Ilgari matnga xom rol kodi tushardi: “Sizga “manager” roli berildi” (2026-10-24).
 * Rol va shablon nomlari saytdagi `team.role.*` / `team.view.*` bilan bir xil.
 */
export const ROLE_NAMES: Record<Lang, Record<CompanySummary['role'], string>> = {
  uz: { owner: 'Egasi', manager: 'Menejer', viewer: 'Kuzatuvchi' },
  ru: { owner: 'Владелец', manager: 'Менеджер', viewer: 'Наблюдатель' },
  en: { owner: 'Owner', manager: 'Manager', viewer: 'Viewer' },
};

/** `null` — shablonsiz: rol ruxsat bergan hamma bo'lim */
const VIEW_NAMES: Record<Lang, Record<MemberView | 'full', string>> = {
  uz: { full: 'To‘liq', warehouse: 'Omborchi', accountant: 'Buxgalter', marketer: 'Marketolog' },
  ru: { full: 'Полный', warehouse: 'Кладовщик', accountant: 'Бухгалтер', marketer: 'Маркетолог' },
  en: { full: 'Full access', warehouse: 'Warehouse', accountant: 'Accountant', marketer: 'Marketer' },
};

interface TeamTexts {
  addedTitle: (company: string) => string;
  addedBody: (role: string) => string;
  roleTitle: (company: string) => string;
  roleBody: (role: string) => string;
  viewBody: (view: string) => string;
  /** Egaga: havola orqali kimdir qo'shildi */
  joinedTitle: (name: string) => string;
  joinedBody: (role: string, view: string) => string;
}

const TEAM_TEXT: Record<Lang, TeamTexts> = {
  uz: {
    addedTitle: (c) => `“${c}” jamoasiga qo‘shildingiz`,
    addedBody: (r) => `Sizga “${r}” roli berildi. Hisobotlarni saytda ko‘rishingiz mumkin.`,
    roleTitle: (c) => `“${c}” kompaniyasida rolingiz o‘zgardi`,
    roleBody: (r) => `Yangi rol: ${r}`,
    viewBody: (v) => `Ko‘rinish: ${v}`,
    joinedTitle: (n) => `${n} jamoaga qo‘shildi`,
    joinedBody: (r, v) => `Taklif havolasi orqali. Rol: ${r}, ko‘rinish: ${v}.`,
  },
  ru: {
    addedTitle: (c) => `Вас добавили в команду «${c}»`,
    addedBody: (r) => `Вам назначена роль «${r}». Отчёты доступны на сайте.`,
    roleTitle: (c) => `Ваша роль в компании «${c}» изменена`,
    roleBody: (r) => `Новая роль: ${r}`,
    viewBody: (v) => `Доступ: ${v}`,
    joinedTitle: (n) => `${n} присоединился к команде`,
    joinedBody: (r, v) => `По ссылке-приглашению. Роль: ${r}, доступ: ${v}.`,
  },
  en: {
    addedTitle: (c) => `You were added to the “${c}” team`,
    addedBody: (r) => `You have the “${r}” role. Reports are available on the website.`,
    roleTitle: (c) => `Your role in “${c}” has changed`,
    roleBody: (r) => `New role: ${r}`,
    viewBody: (v) => `Access: ${v}`,
    joinedTitle: (n) => `${n} joined the team`,
    joinedBody: (r, v) => `Via an invite link. Role: ${r}, access: ${v}.`,
  },
};

/** Qabul qiluvchi tilidagi matnlar, rol va shablon nomi */
export function teamText(languageCode: string | null | undefined, role: string, view?: MemberView | null) {
  const lang = asLang(languageCode);
  return {
    text: TEAM_TEXT[lang],
    roleName: ROLE_NAMES[lang][asMemberRole(role)],
    viewName: VIEW_NAMES[lang][view ?? 'full'],
  };
}

/** Foydalanuvchining ko'rinadigan ismi */
export function displayName(u: Pick<User, 'firstName' | 'lastName' | 'username' | 'telegramId'>): string {
  const full = [u.firstName, u.lastName].filter(Boolean).join(' ').trim();
  return full || u.username || `ID ${u.telegramId}`;
}

// ─────────────────────────── Limit ───────────────────────────

export interface MemberLimit {
  limit: number;
  used: number;
  plan: PlanId;
}

/** Kompaniyaning a'zolar limiti va hozirgi soni (tarif — aktiv obuna bo'yicha) */
export async function memberLimit(companyId: string): Promise<MemberLimit> {
  const subscription = await ensureSubscription(companyId);
  const plan = activePlan(subscription);
  const used = await prisma.membership.count({ where: { companyId } });
  return { limit: getPlan(plan).limits.members, used, plan };
}

/** POST /company/members bilan AYNAN bir xil xato — sayt uni bir xil ko'rsatadi */
export function memberLimitError(l: MemberLimit): AppError {
  return AppError.limit(`Tarifingizda ${l.limit} tagacha jamoa a'zosi mumkin — tarifni yangilang`, {
    limit: l.limit,
    used: l.used,
    plan: l.plan,
    planName: getPlan(l.plan).name,
  });
}

// ─────────────────────────── Havola va audit ───────────────────────────

/** Taklif havolasi — boshqa havolalar kabi sayt manzilidan (env.webUrl) */
export function inviteUrl(token: string): string {
  return `${env.webUrl.replace(/\/+$/, '')}/invite/${encodeURIComponent(token)}`;
}

/**
 * Audit yozuvi — asosiy oqimni hech qachon to'xtatmaydi. AuditLog'da
 * kompaniya ustuni yo'q, shuning uchun u `meta` ichida (JSON).
 */
export async function teamAudit(
  req: Request,
  userId: string,
  action: string,
  entity: string,
  entityId: string,
  meta: Record<string, unknown>,
): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        userId,
        action,
        entity,
        entityId,
        meta: JSON.stringify(meta).slice(0, 2000),
        ip: req.ip?.slice(0, 60) ?? null,
      },
    });
  } catch {
    /* audit muhim emas — jimgina o'tkazib yuboramiz */
  }
}
