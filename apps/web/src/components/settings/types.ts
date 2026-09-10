/**
 * Sozlamalar bo'limi uchun mahalliy tiplar va yordamchilar.
 * Umumiy DTO'lar `@savdoiq/shared` da; bu yerda faqat shu sahifaga tegishlilari.
 */

import type { Lang } from '@savdoiq/shared';

export type SectionId = 'profile' | 'company' | 'uzum' | 'notifications' | 'team' | 'appearance';

export const SECTION_IDS: SectionId[] = [
  'profile',
  'company',
  'uzum',
  'notifications',
  'team',
  'appearance',
];

/** PUT /notifications/settings — tana va javob shakli */
export interface NotificationSettings {
  language?: Lang;
  timezone?: string;
  notifyDaily?: boolean;
  notifyOrders?: boolean;
  notifyStock?: boolean;
  /** Telegram bot bilan bog'langanmi (botChatId mavjudmi) */
  telegramConnected?: boolean;
  botLink?: string;
}

/** GET /sync/history — bitta yozuv */
export interface SyncHistoryRow {
  id: string;
  type?: string;
  status?: string;
  progress?: number;
  message?: string | null;
  error?: string | null;
  startedAt?: string | null;
  finishedAt?: string | null;
  createdAt?: string | null;
  durationSeconds?: number | null;
}

/** GET /company/members — jamoa a'zosi */
export interface MemberRow {
  id: string;
  userId?: string;
  role: string;
  name?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  username?: string | null;
  photoUrl?: string | null;
  phone?: string | null;
  createdAt?: string | null;
}

export const MEMBER_ROLES = ['owner', 'manager', 'viewer'] as const;
export type MemberRole = (typeof MEMBER_ROLES)[number];

/** Ko'p ishlatiladigan vaqt mintaqalari */
export const TIMEZONES = [
  'Asia/Tashkent',
  'Asia/Almaty',
  'Asia/Dubai',
  'Europe/Moscow',
  'Europe/Istanbul',
  'Europe/London',
  'UTC',
];

/** API ba'zan massiv, ba'zan `{ items: [] }` qaytaradi — ikkalasini ham qabul qilamiz */
export function asItems<T>(res: unknown): T[] {
  if (Array.isArray(res)) return res as T[];
  if (res && typeof res === 'object') {
    const items = (res as { items?: unknown }).items;
    if (Array.isArray(items)) return items as T[];
    const rows = (res as { rows?: unknown }).rows;
    if (Array.isArray(rows)) return rows as T[];
  }
  return [];
}

export function memberName(m: MemberRow): string {
  const full = [m.firstName, m.lastName].filter(Boolean).join(' ').trim();
  if (m.name && m.name.trim()) return m.name.trim();
  if (full) return full;
  if (m.username) return `@${m.username}`;
  return '—';
}

/** Sinxron yozuvining davomiyligi (sekund) */
export function jobDuration(row: {
  startedAt?: string | null;
  finishedAt?: string | null;
  durationSeconds?: number | null;
}): number | null {
  if (typeof row.durationSeconds === 'number' && Number.isFinite(row.durationSeconds)) {
    return row.durationSeconds;
  }
  if (row.startedAt && row.finishedAt) {
    const ms = new Date(row.finishedAt).getTime() - new Date(row.startedAt).getTime();
    if (Number.isFinite(ms) && ms >= 0) return Math.round(ms / 1000);
  }
  return null;
}

/** Xato xabarini matnga aylantirish */
export function errText(err: unknown): string | undefined {
  return err instanceof Error ? err.message : undefined;
}

/** API kalit maskasi: ••••1234 */
export function maskKey(hint: string | null | undefined): string {
  if (!hint) return '••••••••';
  const clean = hint.replace(/[•*\s]/g, '');
  return clean ? `••••${clean.slice(-4)}` : '••••••••';
}
