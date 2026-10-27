/**
 * Ko'rinish shablonini (Membership.view) API'da qo'llash — `requireCompany`
 * a'zolikni aniqlagach shu yerga keladi (2026-10-24).
 *
 *  1) So'rov shablon hududidan tashqarida bo'lsa — 403 `view_forbidden`.
 *     Qoidalar `@savdoiq/shared` views.ts da: sayt menyusi ham, sahifa
 *     qo'riqchisi ham aynan o'sha ro'yxatni o'qiydi.
 *  2) Pulsiz shablonda (Omborchi, Marketolog) `res.json` javobidagi pul
 *     maydonlari `null` bo'ladi — kalitlar va qatorlar joyida qoladi.
 *
 * Shablon `requireCompany` ichida tekshiriladi, alohida marshrutlarda emas:
 * har bir kompaniya marshruti undan o'tadi, demak yangi bo'lim ham
 * (shablonga ataylab qo'shilmaguncha) avtomatik yopiq bo'ladi.
 */
import type { Request, Response } from 'express';
import type { Membership } from '@savdoiq/db';
import { asMemberView, redactMoney, viewAllowsApi, viewSeesMoney, type MemberView } from '@savdoiq/shared';
import { AppError } from './errors.js';

/** Egasiga shablon qo'llanmaydi — bazada tasodifan qolgan bo'lsa ham */
export function effectiveView(membership: Pick<Membership, 'role' | 'view'> | null | undefined): MemberView | null {
  if (!membership || membership.role === 'owner') return null;
  return asMemberView(membership.view);
}

/** API yo'li /api/v1 siz va so'rov qismisiz: "/products/abc" */
function apiPath(req: Request): string {
  const raw = (req.originalUrl || req.url || '/').split('?')[0] ?? '/';
  return raw.replace(/^\/api\/v1(?=\/|$)/, '') || '/';
}

const REDACT_FLAG = 'sqViewRedact';

/**
 * Shablonni qo'llaydi. Ruxsat bo'lmasa xato qaytaradi (chaqiruvchi `next(err)`
 * qiladi). Bir so'rovda `requireCompany` ikki marta ishlasa ham `res.json`
 * bir marta o'raladi.
 */
export function enforceView(req: Request, res: Response, membership: Pick<Membership, 'role' | 'view'>): AppError | null {
  const view = effectiveView(membership);
  if (!view) return null;

  if (!viewAllowsApi(view, req.method, apiPath(req))) {
    return new AppError(403, 'view_forbidden', 'Bu bo‘lim sizning ko‘rinishingizda yopiq', { view });
  }

  if (!viewSeesMoney(view) && !res.locals[REDACT_FLAG]) {
    res.locals[REDACT_FLAG] = true;
    const json = res.json.bind(res);
    res.json = ((body: unknown) => json(redactMoney(body))) as Response['json'];
  }
  return null;
}
