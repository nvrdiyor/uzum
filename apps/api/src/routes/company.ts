/**
 * Kompaniya moduli — /api/v1/company
 *
 *  GET    /              → kompaniya + obuna + do'konlar + tarif limitlari
 *  PATCH  /              → kompaniya ma'lumotlarini tahrirlash (faqat owner)
 *  POST   /              → yangi kompaniya ochish (tarif bo'yicha cheklangan)
 *  GET    /members       → jamoa a'zolari (rol va ko'rinish shabloni bilan)
 *  POST   /members       → telegram username bo'yicha taklif qilish
 *  PATCH  /members/:id   → a'zoning roli va/yoki ko'rinish shabloni
 *  DELETE /members/:id   → a'zoni jamoadan chiqarish
 *  POST   /invites       → taklif havolasi (havola faqat shu javobda, bir marta)
 *  GET    /invites       → faol takliflar (havolasiz)
 *  DELETE /invites/:id   → taklifni bekor qilish
 *  GET    /settings      → kompaniya sozlamalari (kalit-qiymat)
 *  PUT    /settings      → sozlamalarni saqlash
 *
 * Havolani ochish va qabul qilish — routes/invites.ts (/api/v1/invites).
 *
 * Ma'lumot bo'lmasa ham marshrutlar 200 va bo'sh ro'yxat qaytaradi.
 */
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '@savdoiq/db';
import type { Invite, Membership, User } from '@savdoiq/db';
import {
  MEMBER_VIEWS,
  PLAN_ORDER,
  asMemberView,
  companySchema,
  getPlan,
  type CompanySummary,
  type PlanId,
  type StoreSummary,
  type SubscriptionSummary,
  type TeamInviteCreated,
  type TeamInviteRow,
  type TeamInvitesResponse,
  type TeamMemberRow,
  type TeamMembersResponse,
} from '@savdoiq/shared';
import { AppError, ah } from '../lib/errors.js';
import { companyCtx, ctx, requireAuth, requireCompany, requireRole } from '../lib/auth.js';
import { hashToken, randomToken } from '../lib/crypto.js';
import { notifyUser } from '../services/notify.js';
import {
  INVITE_TTL_DAYS,
  displayName,
  inviteUrl,
  memberLimit,
  memberLimitError,
  teamAudit,
  teamText,
} from '../services/team.js';
import {
  activePlan,
  asMemberRole,
  ensureSubscription,
  toCompanySummary,
  toSubscriptionSummary,
} from './auth.js';

const router = Router();
router.use(requireAuth);

// ─────────────────────────── Tiplar ───────────────────────────

interface PlanLimitsPayload {
  stores: number;
  cabinets: number;
  members: number;
  historyDays: number;
  used: { stores: number; cabinets: number; members: number };
}

interface CompanyDetailResponse {
  company: CompanySummary;
  subscription: SubscriptionSummary | null;
  stores: StoreSummary[];
  limits: PlanLimitsPayload;
}

interface SettingsResponse {
  settings: Record<string, string>;
}

// ─────────────────────────── Sxemalar ───────────────────────────

const roleSchema = z.enum(['owner', 'manager', 'viewer']);
/** Ko'rinish shabloni; null — rol ruxsat bergan hamma narsa (views.ts) */
const viewSchema = z.enum(MEMBER_VIEWS).nullable();

const memberInviteSchema = z.object({
  /** @username yoki username */
  username: z.string().trim().min(2).max(64),
  role: roleSchema.default('manager'),
  view: viewSchema.optional(),
});

const memberPatchSchema = z
  .object({ role: roleSchema.optional(), view: viewSchema.optional() })
  .refine((v) => v.role !== undefined || v.view !== undefined, {
    message: 'O‘zgartirish uchun rol yoki ko‘rinish yuboring',
  });

/**
 * Havola bilan EGA qilib bo'lmaydi: havola uzatilishi mumkin, egalik esa
 * kompaniyaning hamma narsasini (to'lov, kalit, jamoa) beradi. Kerak bo'lsa
 * a'zo qo'shilgach rolini PATCH bilan o'zgartirish mumkin.
 */
const inviteCreateSchema = z.object({
  role: z.enum(['manager', 'viewer']).default('manager'),
  view: viewSchema.optional(),
});

const settingValueSchema = z.union([z.string().max(2000), z.number(), z.boolean(), z.null()]);
const settingsMapSchema = z.record(settingValueSchema);
/** Tana `{ settings: {...} }` yoki to'g'ridan-to'g'ri `{ kalit: qiymat }` bo'lishi mumkin */
const settingsBodySchema = z.union([z.object({ settings: settingsMapSchema }), settingsMapSchema]);

const SETTING_KEY_RE = /^[A-Za-z0-9_.:-]{1,60}$/;
const MAX_SETTINGS = 60;

/**
 * Bir foydalanuvchi nechta kompaniya ocha oladi — egasi bo'lgan kompaniyalari orasidagi
 * eng yuqori aktiv tarif bo'yicha. Tariflarda alohida "kompaniya" limiti yo'q, shuning
 * uchun chegara shu yerda belgilangan.
 */
const COMPANY_LIMIT: Record<PlanId, number> = { trial: 1, standard: 2, vip: 20, expired: 1 };

// ─────────────────────────── Yordamchilar ───────────────────────────

/** Prisma a'zolik (+ foydalanuvchi) → API qatori. Egasida shablon doim null */
function toMemberRow(m: Membership & { user: User }, selfId: string): TeamMemberRow {
  const role = asMemberRole(m.role);
  return {
    id: m.id,
    userId: m.userId,
    name: displayName(m.user),
    username: m.user.username,
    photoUrl: m.user.photoUrl,
    role,
    view: role === 'owner' ? null : asMemberView(m.view),
    isSelf: m.userId === selfId,
    createdAt: m.createdAt.toISOString(),
  };
}

/** Prisma taklif → API qatori (havola/xesh hech qachon chiqmaydi) */
function toInviteRow(i: Invite, creators: Map<string, string>): TeamInviteRow {
  return {
    id: i.id,
    role: i.role === 'viewer' ? 'viewer' : 'manager',
    view: asMemberView(i.view),
    createdAt: i.createdAt.toISOString(),
    expiresAt: i.expiresAt.toISOString(),
    createdBy: i.createdById ? (creators.get(i.createdById) ?? null) : null,
  };
}

/** Taklif yaratganlarning ismlari (bitta so'rov bilan) */
async function inviteCreators(invites: Invite[]): Promise<Map<string, string>> {
  const ids = [...new Set(invites.map((i) => i.createdById).filter((v): v is string => Boolean(v)))];
  if (ids.length === 0) return new Map();
  const users = await prisma.user.findMany({ where: { id: { in: ids } } });
  return new Map(users.map((u) => [u.id, displayName(u)]));
}

/** Kompaniya bo'yicha tarif limitlari va haqiqiy foydalanish */
async function planLimits(companyId: string, plan: PlanId): Promise<PlanLimitsPayload> {
  const limits = getPlan(plan).limits;
  const [stores, cabinets, members] = await Promise.all([
    prisma.store.count({ where: { companyId } }),
    prisma.uzumAccount.count({ where: { companyId } }),
    prisma.membership.count({ where: { companyId } }),
  ]);
  return {
    stores: limits.stores,
    cabinets: limits.cabinets,
    members: limits.members,
    historyDays: limits.historyDays,
    used: { stores, cabinets, members },
  };
}

/** Kompaniya do'konlari (mahsulotlar soni bilan) */
async function companyStores(companyId: string): Promise<StoreSummary[]> {
  const rows = await prisma.store.findMany({
    where: { companyId },
    include: { _count: { select: { products: true } } },
    orderBy: { createdAt: 'asc' },
  });
  return rows.map((s) => ({
    id: s.id,
    title: s.title,
    uzumShopId: s.uzumShopId,
    status: s.status,
    productsCount: s._count.products,
  }));
}

/**
 * Telegram username bo'yicha foydalanuvchini topadi.
 * Avval aynan mos keluvchi qidiriladi; topilmasa `contains` (SQLite'da LIKE ASCII uchun
 * registrni farqlamaydi) va natija JS tomonda aniq solishtiriladi.
 */
async function findUserByUsername(raw: string): Promise<User | null> {
  const uname = raw.trim().replace(/^@+/, '');
  if (!uname) return null;

  const exact = await prisma.user.findFirst({ where: { username: uname } });
  if (exact) return exact;

  const candidates = await prisma.user.findMany({ where: { username: { contains: uname } }, take: 25 });
  const lower = uname.toLowerCase();
  return candidates.find((c) => (c.username ?? '').toLowerCase() === lower) ?? null;
}

/** Kompaniyadagi egalar (owner) soni — oxirgi egani yo'qotib qo'ymaslik uchun */
function countOwners(companyId: string): Promise<number> {
  return prisma.membership.count({ where: { companyId, role: 'owner' } });
}

/** Sozlamalar tanasini yagona kalit-qiymat xaritasiga keltiradi */
function normalizeSettings(body: unknown): Record<string, string | null> {
  const parsed = settingsBodySchema.parse(body ?? {});
  const raw =
    'settings' in parsed && typeof parsed.settings === 'object' && parsed.settings !== null
      ? (parsed.settings as Record<string, string | number | boolean | null>)
      : (parsed as Record<string, string | number | boolean | null>);

  const entries = Object.entries(raw);
  if (entries.length > MAX_SETTINGS) {
    throw AppError.badRequest(`Bir so‘rovda ${MAX_SETTINGS} tadan ko‘p sozlama yuborib bo‘lmaydi`);
  }

  const out: Record<string, string | null> = {};
  for (const [key, value] of entries) {
    if (!SETTING_KEY_RE.test(key)) {
      throw AppError.badRequest(`Sozlama kaliti noto‘g‘ri: “${key.slice(0, 40)}”`);
    }
    out[key] = value === null ? null : String(value).slice(0, 2000);
  }
  return out;
}

// ─────────────────────────── GET / ───────────────────────────

router.get(
  '/',
  requireCompany,
  ah(async (req, res) => {
    const { company, membership } = companyCtx(req);

    const subscription = await ensureSubscription(company.id);
    const plan = activePlan(subscription);

    const [stores, limits] = await Promise.all([companyStores(company.id), planLimits(company.id, plan)]);

    const payload: CompanyDetailResponse = {
      company: toCompanySummary(company, membership?.role ?? 'viewer', membership?.view),
      subscription: toSubscriptionSummary(subscription),
      stores,
      limits,
    };

    res.json(payload);
  }),
);

// ─────────────────────────── PATCH / ───────────────────────────

/**
 * Kompaniya ma'lumotlari (nomi, soliq stavkasi, valyuta).
 * Onboarding'ning birinchi qadami shu yerda yakunlanadi — keyingi qadam API kalit.
 */
router.patch(
  '/',
  requireCompany,
  requireRole('owner'),
  ah(async (req, res) => {
    const { company, membership } = companyCtx(req);
    const input = companySchema.partial().parse(req.body ?? {});

    if (input.name === undefined && input.taxRate === undefined && input.currency === undefined) {
      throw AppError.badRequest('O‘zgartirish uchun hech qanday maydon yuborilmadi');
    }

    // Kompaniya ma'lumotlari to'ldirilgach onboarding API kalit bosqichiga o'tadi
    const nextStep =
      company.onboardStep === 'company' || company.onboardStep === 'tax' ? 'api_key' : company.onboardStep;

    const updated = await prisma.company.update({
      where: { id: company.id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.taxRate !== undefined ? { taxRate: input.taxRate } : {}),
        ...(input.currency !== undefined ? { currency: input.currency.slice(0, 10) } : {}),
        onboardStep: nextStep,
      },
    });

    res.json(toCompanySummary(updated, membership?.role ?? 'owner', membership?.view));
  }),
);

// ─────────────────────────── POST / ───────────────────────────

/** Yangi kompaniya: yaratuvchi avtomatik owner bo'ladi va 7 kunlik sinov ochiladi */
router.post(
  '/',
  ah(async (req, res) => {
    const { user } = ctx(req);
    const input = companySchema.parse(req.body ?? {});

    const owned = await prisma.membership.findMany({
      where: { userId: user.id, role: 'owner' },
      include: { company: { include: { subscription: true } } },
    });

    // Limit — egasi bo'lgan kompaniyalar orasidagi eng yuqori aktiv tarif bo'yicha
    let best: PlanId = 'trial';
    for (const m of owned) {
      const p = activePlan(m.company.subscription);
      if (PLAN_ORDER.indexOf(p) > PLAN_ORDER.indexOf(best)) best = p;
    }
    const limit = COMPANY_LIMIT[best];

    if (owned.length >= limit) {
      throw AppError.limit(
        `Sizning tarifingizda ${limit} tagacha kompaniya ochish mumkin — tarifni yangilang`,
        { limit, used: owned.length, plan: best, planName: getPlan(best).name },
      );
    }

    const company = await prisma.company.create({
      data: {
        name: input.name,
        taxRate: input.taxRate,
        currency: input.currency.slice(0, 10),
        onboarded: false,
        onboardStep: 'api_key',
      },
    });
    await prisma.membership.create({ data: { userId: user.id, companyId: company.id, role: 'owner' } });
    await ensureSubscription(company.id);

    res.status(201).json(toCompanySummary(company, 'owner'));
  }),
);

// ─────────────────────────── GET /members ───────────────────────────

router.get(
  '/members',
  requireCompany,
  ah(async (req, res) => {
    const { user, company, membership } = companyCtx(req);
    const subscription = await ensureSubscription(company.id);
    const plan = activePlan(subscription);

    const rows = await prisma.membership.findMany({
      where: { companyId: company.id },
      include: { user: true },
      orderBy: { createdAt: 'asc' },
    });

    const members = rows.map((m) => toMemberRow(m, user.id));

    const payload: TeamMembersResponse = {
      members,
      limit: getPlan(plan).limits.members,
      used: members.length,
      canManage: membership?.role === 'owner',
    };

    res.json(payload);
  }),
);

// ─────────────────────────── POST /members ───────────────────────────

/**
 * Jamoaga a'zo qo'shish — Telegram username bo'yicha.
 * Foydalanuvchi avval botga (yoki saytga) kirgan bo'lishi kerak, aks holda topilmaydi.
 */
router.post(
  '/members',
  requireCompany,
  requireRole('owner'),
  ah(async (req, res) => {
    const { user, company } = companyCtx(req);
    const input = memberInviteSchema.parse(req.body ?? {});
    // Egaga shablon qo'yilmaydi (views.ts)
    const view = input.role === 'owner' ? null : (input.view ?? null);
    if (input.role === 'owner' && input.view) {
      throw AppError.badRequest('Kompaniya egasiga ko‘rinish shablonini qo‘yib bo‘lmaydi — u hamma narsani ko‘radi');
    }

    const limit = await memberLimit(company.id);
    if (limit.used >= limit.limit) throw memberLimitError(limit);

    const invitee = await findUserByUsername(input.username);
    if (!invitee) {
      throw AppError.notFound(
        'Bunday foydalanuvchi topilmadi — u avval botga /start yuborib ro‘yxatdan o‘tsin',
      );
    }

    const existing = await prisma.membership.findUnique({
      where: { userId_companyId: { userId: invitee.id, companyId: company.id } },
    });
    if (existing) throw AppError.conflict('Bu foydalanuvchi allaqachon jamoada');

    const created = await prisma.membership.create({
      data: { userId: invitee.id, companyId: company.id, role: input.role, view },
      include: { user: true },
    });

    const added = teamText(invitee.languageCode, input.role, view);
    await notifyUser(invitee.id, {
      type: 'info',
      title: added.text.addedTitle(company.name),
      body: view ? `${added.text.addedBody(added.roleName)} ${added.text.viewBody(added.viewName)}` : added.text.addedBody(added.roleName),
      link: '/dashboard',
    });

    await teamAudit(req, user.id, 'member.add', 'membership', created.id, {
      companyId: company.id,
      userId: invitee.id,
      role: input.role,
      view,
      via: 'username',
    });

    res.status(201).json(toMemberRow(created, user.id));
  }),
);

// ─────────────────────────── PATCH /members/:id ───────────────────────────

/**
 * Rol va/yoki ko'rinish shabloni. Egaga shablon qo'yilmaydi: egaga aylantirilgan
 * a'zoning shabloni o'zi tozalanadi, egaga shablon yuborilsa — 400.
 */
router.patch(
  '/members/:id',
  requireCompany,
  requireRole('owner'),
  ah(async (req, res) => {
    const { user, company } = companyCtx(req);
    const input = memberPatchSchema.parse(req.body ?? {});
    const id = String(req.params.id);

    const target = await prisma.membership.findFirst({
      where: { id, companyId: company.id },
      include: { user: true },
    });
    if (!target) throw AppError.notFound('Jamoa a’zosi topilmadi');

    const nextRole = input.role ?? asMemberRole(target.role);
    if (nextRole === 'owner' && input.view) {
      throw AppError.badRequest('Kompaniya egasiga ko‘rinish shablonini qo‘yib bo‘lmaydi — u hamma narsani ko‘radi');
    }
    const prevView = target.role === 'owner' ? null : asMemberView(target.view);
    const nextView = nextRole === 'owner' ? null : input.view !== undefined ? input.view : prevView;

    const roleChanged = nextRole !== target.role;
    const viewChanged = nextView !== prevView;
    if (!roleChanged && !viewChanged) {
      throw AppError.badRequest(
        input.role !== undefined && input.view === undefined
          ? 'Bu a’zoda allaqachon shu rol mavjud'
          : 'Bu a’zoda allaqachon shu rol va ko‘rinish mavjud',
      );
    }

    // Oxirgi egani rolsiz qoldirmaymiz
    if (target.role === 'owner' && nextRole !== 'owner' && (await countOwners(company.id)) <= 1) {
      throw AppError.badRequest('Kompaniyada kamida bitta egasi (owner) qolishi kerak');
    }

    const updated = await prisma.membership.update({
      where: { id: target.id },
      data: { role: nextRole, view: nextView },
      include: { user: true },
    });

    const changed = teamText(updated.user.languageCode, nextRole, nextView);
    const body = [
      roleChanged ? changed.text.roleBody(changed.roleName) : null,
      viewChanged ? changed.text.viewBody(changed.viewName) : null,
    ]
      .filter(Boolean)
      .join('. ');
    await notifyUser(updated.userId, {
      type: 'info',
      title: changed.text.roleTitle(company.name),
      body,
      link: '/settings',
    });

    if (roleChanged) {
      await teamAudit(req, user.id, 'member.role', 'membership', updated.id, {
        companyId: company.id,
        userId: updated.userId,
        from: target.role,
        to: nextRole,
      });
    }
    if (viewChanged) {
      await teamAudit(req, user.id, 'member.view', 'membership', updated.id, {
        companyId: company.id,
        userId: updated.userId,
        from: prevView,
        to: nextView,
      });
    }

    res.json(toMemberRow(updated, user.id));
  }),
);

// ─────────────────────────── DELETE /members/:id ───────────────────────────

router.delete(
  '/members/:id',
  requireCompany,
  requireRole('owner'),
  ah(async (req, res) => {
    const { user, company } = companyCtx(req);
    const id = String(req.params.id);

    const target = await prisma.membership.findFirst({
      where: { id, companyId: company.id },
      include: { user: true },
    });
    if (!target) throw AppError.notFound('Jamoa a’zosi topilmadi');

    if (target.role === 'owner' && (await countOwners(company.id)) <= 1) {
      throw AppError.badRequest('Kompaniyaning yagona egasini chiqarib bo‘lmaydi');
    }

    await prisma.membership.delete({ where: { id: target.id } });
    await teamAudit(req, user.id, 'member.remove', 'membership', target.id, {
      companyId: company.id,
      userId: target.userId,
      role: target.role,
      view: target.view ?? null,
    });

    res.json({
      ok: true,
      id: target.id,
      message: `${displayName(target.user)} jamoadan chiqarildi`,
    });
  }),
);

// ─────────────────────────── Taklif havolalari ───────────────────────────

/** Faol taklif: ishlatilmagan, bekor qilinmagan va muddati o'tmagan */
const activeInviteWhere = (companyId: string) => ({
  companyId,
  usedAt: null,
  revokedAt: null,
  expiresAt: { gt: new Date() },
});

/**
 * POST /invites — taklif havolasi. Havolaning o'zi (32 bayt, base64url) faqat
 * shu javobda qaytadi; bazada uning xeshi (Session.tokenHash kabi), shuning
 * uchun keyin uni hech kim — egasi ham — qayta ko'ra olmaydi.
 * Limit POST /members bilan bir xil: a'zolar soni tarif chegarasida bo'lsa —
 * 402 (qabul qilishda ham yana tekshiriladi).
 */
router.post(
  '/invites',
  requireCompany,
  requireRole('owner'),
  ah(async (req, res) => {
    const { user, company } = companyCtx(req);
    const input = inviteCreateSchema.parse(req.body ?? {});
    const view = input.view ?? null;

    const limit = await memberLimit(company.id);
    if (limit.used >= limit.limit) throw memberLimitError(limit);

    const token = randomToken(32);
    const invite = await prisma.invite.create({
      data: {
        companyId: company.id,
        tokenHash: hashToken(token),
        role: input.role,
        view,
        createdById: user.id,
        expiresAt: new Date(Date.now() + INVITE_TTL_DAYS * 86_400_000),
      },
    });

    await teamAudit(req, user.id, 'invite.create', 'invite', invite.id, {
      companyId: company.id,
      role: input.role,
      view,
      expiresAt: invite.expiresAt.toISOString(),
    });

    const payload: TeamInviteCreated = {
      invite: toInviteRow(invite, new Map([[user.id, displayName(user)]])),
      url: inviteUrl(token),
    };
    res.status(201).json(payload);
  }),
);

/** GET /invites — faol takliflar; havola va xesh qaytarilmaydi */
router.get(
  '/invites',
  requireCompany,
  requireRole('owner'),
  ah(async (req, res) => {
    const { company } = companyCtx(req);
    const rows = await prisma.invite.findMany({
      where: activeInviteWhere(company.id),
      orderBy: { createdAt: 'desc' },
    });
    const creators = await inviteCreators(rows);
    const payload: TeamInvitesResponse = { invites: rows.map((i) => toInviteRow(i, creators)) };
    res.json(payload);
  }),
);

/** DELETE /invites/:id — bekor qilish. Ishlatilgan taklifni bekor qilib bo'lmaydi (a'zoni o'chiring) */
router.delete(
  '/invites/:id',
  requireCompany,
  requireRole('owner'),
  ah(async (req, res) => {
    const { user, company } = companyCtx(req);
    const id = String(req.params.id);

    const invite = await prisma.invite.findFirst({ where: { id, companyId: company.id } });
    if (!invite) throw AppError.notFound('Taklif topilmadi');
    if (invite.usedAt) {
      throw new AppError(409, 'invite_used', 'Bu taklif allaqachon ishlatilgan — kerak bo‘lsa a’zoni jamoadan chiqaring');
    }

    // Atomar: shu payt kimdir qabul qilayotgan bo'lsa, ikkalasidan bittasi yutadi
    const revoked = await prisma.invite.updateMany({
      where: { id: invite.id, usedAt: null, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (revoked.count > 0) {
      await teamAudit(req, user.id, 'invite.revoke', 'invite', invite.id, { companyId: company.id });
    } else {
      const again = await prisma.invite.findUnique({ where: { id: invite.id } });
      if (again?.usedAt) {
        throw new AppError(409, 'invite_used', 'Bu taklif allaqachon ishlatilgan — kerak bo‘lsa a’zoni jamoadan chiqaring');
      }
    }

    res.json({ ok: true, id: invite.id });
  }),
);

// ─────────────────────────── GET /settings ───────────────────────────

router.get(
  '/settings',
  requireCompany,
  ah(async (req, res) => {
    const { company } = companyCtx(req);
    const rows = await prisma.companySetting.findMany({
      where: { companyId: company.id },
      orderBy: { key: 'asc' },
    });

    const payload: SettingsResponse = {
      settings: rows.reduce<Record<string, string>>((acc, r) => {
        acc[r.key] = r.value;
        return acc;
      }, {}),
    };

    res.json(payload);
  }),
);

// ─────────────────────────── PUT /settings ───────────────────────────

/** Sozlamalarni saqlaydi: `null` qiymat kalitni o'chiradi, qolganlari upsert qilinadi */
router.put(
  '/settings',
  requireCompany,
  requireRole('owner', 'manager'),
  ah(async (req, res) => {
    const { company } = companyCtx(req);
    const incoming = normalizeSettings(req.body);

    for (const [key, value] of Object.entries(incoming)) {
      if (value === null) {
        await prisma.companySetting.deleteMany({ where: { companyId: company.id, key } });
        continue;
      }
      await prisma.companySetting.upsert({
        where: { companyId_key: { companyId: company.id, key } },
        create: { companyId: company.id, key, value },
        update: { value },
      });
    }

    const rows = await prisma.companySetting.findMany({
      where: { companyId: company.id },
      orderBy: { key: 'asc' },
    });

    const payload: SettingsResponse = {
      settings: rows.reduce<Record<string, string>>((acc, r) => {
        acc[r.key] = r.value;
        return acc;
      }, {}),
    };

    res.json(payload);
  }),
);

export default router;
