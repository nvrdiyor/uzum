/**
 * Jamoaga taklif havolasi — /api/v1/invites (2026-10-24)
 *
 *  GET  /:token         → ochiq oldindan ko'rish: kompaniya, rol, ko'rinish, muddat, kim taklif qilgan
 *  POST /:token/accept  → kirgan foydalanuvchi jamoaga qo'shiladi
 *
 * Havola egasi (owner) yaratadi: POST /company/invites. Bazada faqat havolaning
 * xeshi turadi, shuning uchun bu yerda ham xesh bo'yicha qidiriladi.
 *
 * Bu marshrutlar `requireCompany` dan O'TMAYDI: yangi foydalanuvchining hali
 * hech qanday kompaniyasi bo'lmaydi — u aynan shu havola bilan birinchi
 * jamoasiga qo'shiladi.
 */
import { Router, type Request } from 'express';
import rateLimit from 'express-rate-limit';
import { prisma } from '@savdoiq/db';
import type { Invite } from '@savdoiq/db';
import { asMemberView, type InviteAcceptResponse, type InvitePreviewResponse } from '@savdoiq/shared';
import { AppError, ah } from '../lib/errors.js';
import { ctx, requireAuth } from '../lib/auth.js';
import { hashToken } from '../lib/crypto.js';
import { notifyUser } from '../services/notify.js';
import { displayName, memberLimit, memberLimitError, teamAudit, teamText } from '../services/team.js';

const router = Router();

/**
 * Havola 32 baytli tasodifiy qator — taxmin qilib topib bo'lmaydi, lekin ochiq
 * marshrutni baribir cheklaymiz (kirish marshrutlaridagi kabi).
 */
const inviteLimiter = rateLimit({
  windowMs: 60_000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: { code: 'too_many_requests', message: 'So‘rovlar juda ko‘p — bir daqiqadan so‘ng qayta urinib ko‘ring' },
  },
});
router.use(inviteLimiter);

/** base64url — 32 bayt 43 belgi; boshqa narsani bazaga so'ramaymiz ham */
function tokenFrom(req: Request): string {
  const raw = String(req.params.token ?? '').trim();
  return /^[A-Za-z0-9_-]{20,128}$/.test(raw) ? raw : '';
}

type InviteState = 'ok' | 'expired' | 'used' | 'revoked';

function inviteState(i: Invite, now = Date.now()): InviteState {
  if (i.revokedAt) return 'revoked';
  if (i.usedAt) return 'used';
  if (i.expiresAt.getTime() <= now) return 'expired';
  return 'ok';
}

const STATE_ERRORS: Record<Exclude<InviteState, 'ok'>, { code: string; message: string }> = {
  expired: { code: 'invite_expired', message: 'Taklif havolasining muddati tugagan — egasidan yangisini so‘rang' },
  used: { code: 'invite_used', message: 'Bu havola allaqachon ishlatilgan — egasidan yangisini so‘rang' },
  revoked: { code: 'invite_revoked', message: 'Bu taklif bekor qilingan' },
};

/** Oldindan ko'rish: hammasi 404 (kod sababni aytadi — sayt tushunarli matn chiqaradi) */
function previewError(state: Exclude<InviteState, 'ok'> | 'not_found'): AppError {
  if (state === 'not_found') return new AppError(404, 'invite_not_found', 'Taklif topilmadi — havola noto‘g‘ri');
  return new AppError(404, STATE_ERRORS[state].code, STATE_ERRORS[state].message);
}

/** Qabul qilishda: muddati o'tgan / bekor — 410, ishlatilgan — 409 */
function acceptError(state: Exclude<InviteState, 'ok'>): AppError {
  return new AppError(state === 'used' ? 409 : 410, STATE_ERRORS[state].code, STATE_ERRORS[state].message);
}

async function findInvite(req: Request) {
  const token = tokenFrom(req);
  if (!token) return null;
  return prisma.invite.findUnique({ where: { tokenHash: hashToken(token) }, include: { company: true } });
}

const inviteRole = (role: string): 'manager' | 'viewer' => (role === 'viewer' ? 'viewer' : 'manager');

// ─────────────────────────── GET /:token ───────────────────────────

router.get(
  '/:token',
  ah(async (req, res) => {
    const invite = await findInvite(req);
    if (!invite) throw previewError('not_found');
    const state = inviteState(invite);
    if (state !== 'ok') throw previewError(state);

    const inviter = invite.createdById
      ? await prisma.user.findUnique({ where: { id: invite.createdById } })
      : null;

    const payload: InvitePreviewResponse = {
      companyName: invite.company.name,
      role: inviteRole(invite.role),
      view: asMemberView(invite.view),
      expiresAt: invite.expiresAt.toISOString(),
      inviterName: inviter ? displayName(inviter) : null,
    };

    // Kirgan foydalanuvchi allaqachon a'zo bo'lsa — sayt "qo'shilish" o'rniga "o'tish" ko'rsatadi
    const user = req.ctx?.user;
    if (user) {
      const member = await prisma.membership.findUnique({
        where: { userId_companyId: { userId: user.id, companyId: invite.companyId } },
        select: { id: true },
      });
      payload.alreadyMember = Boolean(member);
      if (member) payload.companyId = invite.companyId;
    }

    res.json(payload);
  }),
);

// ─────────────────────────── POST /:token/accept ───────────────────────────

/**
 * Qabul qilish. Xatolar: topilmadi (404), muddati o'tgan / bekor (410),
 * ishlatilgan (409), allaqachon a'zo (409 — taklif SARFLANMAYDI), limit (402).
 *
 * Poyga: bitta havolani ikki kishi bir vaqtda ochsa, faqat bittasi yutadi —
 * taklif `usedAt: null` sharti bilan atomar `updateMany` orqali egallanadi va
 * a'zolik shu tranzaksiyada yaratiladi. Kompaniya qatoriga yozish tranzaksiya
 * boshida qulf vazifasini bajaradi: ikki xil havola bir vaqtda qabul qilinsa
 * ham a'zolar soni limitdan oshmaydi (PostgreSQL'da qator qulfi, SQLite'da
 * baza yozuv qulfi). Tranzaksiya ichida faqat `tx` ishlatiladi.
 */
router.post(
  '/:token/accept',
  requireAuth,
  ah(async (req, res) => {
    const { user } = ctx(req);
    const invite = await findInvite(req);
    if (!invite) throw previewError('not_found');
    const state = inviteState(invite);
    if (state !== 'ok') throw acceptError(state);

    const existing = await prisma.membership.findUnique({
      where: { userId_companyId: { userId: user.id, companyId: invite.companyId } },
      select: { id: true },
    });
    if (existing) {
      throw new AppError(409, 'already_member', 'Siz allaqachon shu jamoadasiz — taklif boshqa odam uchun saqlanib qoldi', {
        companyId: invite.companyId,
      });
    }

    // Tarif tranzaksiyadan oldin (obuna yo'q bo'lsa yaratiladi) — ichida faqat a'zolar sanaladi
    const limit = await memberLimit(invite.companyId);
    if (limit.used >= limit.limit) throw memberLimitError(limit);

    const role = inviteRole(invite.role);
    const view = asMemberView(invite.view);
    const now = new Date();

    const membership = await prisma.$transaction(async (tx) => {
      await tx.company.update({ where: { id: invite.companyId }, data: { updatedAt: now } });

      const used = await tx.membership.count({ where: { companyId: invite.companyId } });
      if (used >= limit.limit) throw memberLimitError({ ...limit, used });

      const already = await tx.membership.findUnique({
        where: { userId_companyId: { userId: user.id, companyId: invite.companyId } },
        select: { id: true },
      });
      if (already) {
        throw new AppError(409, 'already_member', 'Siz allaqachon shu jamoadasiz', { companyId: invite.companyId });
      }

      const claimed = await tx.invite.updateMany({
        where: { id: invite.id, usedAt: null, revokedAt: null, expiresAt: { gt: now } },
        data: { usedAt: now, usedById: user.id },
      });
      if (claimed.count === 0) {
        const fresh = await tx.invite.findUnique({ where: { id: invite.id } });
        const why = fresh ? inviteState(fresh, now.getTime()) : 'revoked';
        throw acceptError(why === 'ok' ? 'used' : why);
      }

      return tx.membership.create({
        data: { userId: user.id, companyId: invite.companyId, role, view },
      });
    });

    await teamAudit(req, user.id, 'invite.accept', 'invite', invite.id, {
      companyId: invite.companyId,
      membershipId: membership.id,
      role,
      view,
    });

    // Egalarga — har biriga o'z tilida (notifyCompanyOwners bitta matnni hammaga yuborardi)
    const owners = await prisma.membership.findMany({
      where: { companyId: invite.companyId, role: 'owner' },
      include: { user: true },
    });
    const name = displayName(user);
    for (const o of owners) {
      const txt = teamText(o.user.languageCode, role, view);
      await notifyUser(o.userId, {
        type: 'success',
        title: txt.text.joinedTitle(name),
        body: txt.text.joinedBody(txt.roleName, txt.viewName),
        link: '/team',
      });
    }

    const payload: InviteAcceptResponse = {
      companyId: invite.companyId,
      companyName: invite.company.name,
      role,
      view,
    };
    res.status(201).json(payload);
  }),
);

export default router;
