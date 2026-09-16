/**
 * Kompaniya moduli — /api/v1/company
 *
 *  GET    /              → kompaniya + obuna + do'konlar + tarif limitlari
 *  PATCH  /              → kompaniya ma'lumotlarini tahrirlash (faqat owner)
 *  POST   /              → yangi kompaniya ochish (tarif bo'yicha cheklangan)
 *  GET    /members       → jamoa a'zolari
 *  POST   /members       → telegram username bo'yicha taklif qilish
 *  PATCH  /members/:id   → a'zoning rolini o'zgartirish
 *  DELETE /members/:id   → a'zoni jamoadan chiqarish
 *  GET    /settings      → kompaniya sozlamalari (kalit-qiymat)
 *  PUT    /settings      → sozlamalarni saqlash
 *
 * Ma'lumot bo'lmasa ham marshrutlar 200 va bo'sh ro'yxat qaytaradi.
 */
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '@savdoiq/db';
import type { User } from '@savdoiq/db';
import {
  PLAN_ORDER,
  companySchema,
  getPlan,
  type CompanySummary,
  type PlanId,
  type StoreSummary,
  type SubscriptionSummary,
} from '@savdoiq/shared';
import { AppError, ah } from '../lib/errors.js';
import { companyCtx, ctx, requireAuth, requireCompany, requireRole } from '../lib/auth.js';
import { notifyUser } from '../services/notify.js';
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

interface MemberRow {
  /** A'zolik yozuvining id'si (rolni o'zgartirish/chiqarish uchun) */
  id: string;
  userId: string;
  name: string;
  username: string | null;
  photoUrl: string | null;
  role: CompanySummary['role'];
  /** So'rov yuborgan foydalanuvchining o'zimi */
  isSelf: boolean;
  createdAt: string;
}

interface MembersResponse {
  members: MemberRow[];
  limit: number;
  used: number;
  /** Joriy foydalanuvchi a'zolarni boshqara oladimi */
  canManage: boolean;
}

interface SettingsResponse {
  settings: Record<string, string>;
}

// ─────────────────────────── Sxemalar ───────────────────────────

const roleSchema = z.enum(['owner', 'manager', 'viewer']);

const memberInviteSchema = z.object({
  /** @username yoki username */
  username: z.string().trim().min(2).max(64),
  role: roleSchema.default('manager'),
});

const memberRoleSchema = z.object({ role: roleSchema });

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
const COMPANY_LIMIT: Record<PlanId, number> = { trial: 1, standard: 2, vip: 20 };

// ─────────────────────────── Yordamchilar ───────────────────────────

/** Foydalanuvchining ko'rinadigan ismi */
function displayName(u: Pick<User, 'firstName' | 'lastName' | 'username' | 'telegramId'>): string {
  const full = [u.firstName, u.lastName].filter(Boolean).join(' ').trim();
  return full || u.username || `ID ${u.telegramId}`;
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
      company: toCompanySummary(company, membership?.role ?? 'viewer'),
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

    res.json(toCompanySummary(updated, membership?.role ?? 'owner'));
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

    const members: MemberRow[] = rows.map((m) => ({
      id: m.id,
      userId: m.userId,
      name: displayName(m.user),
      username: m.user.username,
      photoUrl: m.user.photoUrl,
      role: asMemberRole(m.role),
      isSelf: m.userId === user.id,
      createdAt: m.createdAt.toISOString(),
    }));

    const payload: MembersResponse = {
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
    const { company } = companyCtx(req);
    const input = memberInviteSchema.parse(req.body ?? {});

    const subscription = await ensureSubscription(company.id);
    const plan = activePlan(subscription);
    const limit = getPlan(plan).limits.members;

    const used = await prisma.membership.count({ where: { companyId: company.id } });
    if (used >= limit) {
      throw AppError.limit(`Tarifingizda ${limit} tagacha jamoa a'zosi mumkin — tarifni yangilang`, {
        limit,
        used,
        plan,
        planName: getPlan(plan).name,
      });
    }

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
      data: { userId: invitee.id, companyId: company.id, role: input.role },
      include: { user: true },
    });

    await notifyUser(invitee.id, {
      type: 'info',
      title: `“${company.name}” jamoasiga qo‘shildingiz`,
      body: `Sizga “${input.role}” roli berildi. Hisobotlarni saytda ko‘rishingiz mumkin.`,
      link: '/dashboard',
    });

    const row: MemberRow = {
      id: created.id,
      userId: created.userId,
      name: displayName(created.user),
      username: created.user.username,
      photoUrl: created.user.photoUrl,
      role: asMemberRole(created.role),
      isSelf: false,
      createdAt: created.createdAt.toISOString(),
    };

    res.status(201).json(row);
  }),
);

// ─────────────────────────── PATCH /members/:id ───────────────────────────

router.patch(
  '/members/:id',
  requireCompany,
  requireRole('owner'),
  ah(async (req, res) => {
    const { user, company } = companyCtx(req);
    const input = memberRoleSchema.parse(req.body ?? {});
    const id = String(req.params.id);

    const target = await prisma.membership.findFirst({
      where: { id, companyId: company.id },
      include: { user: true },
    });
    if (!target) throw AppError.notFound('Jamoa a’zosi topilmadi');
    if (target.role === input.role) {
      throw AppError.badRequest('Bu a’zoda allaqachon shu rol mavjud');
    }

    // Oxirgi egani rolsiz qoldirmaymiz
    if (target.role === 'owner' && input.role !== 'owner' && (await countOwners(company.id)) <= 1) {
      throw AppError.badRequest('Kompaniyada kamida bitta egasi (owner) qolishi kerak');
    }

    const updated = await prisma.membership.update({
      where: { id: target.id },
      data: { role: input.role },
      include: { user: true },
    });

    await notifyUser(updated.userId, {
      type: 'info',
      title: `“${company.name}” kompaniyasida rolingiz o‘zgardi`,
      body: `Yangi rol: ${input.role}`,
      link: '/settings',
    });

    const row: MemberRow = {
      id: updated.id,
      userId: updated.userId,
      name: displayName(updated.user),
      username: updated.user.username,
      photoUrl: updated.user.photoUrl,
      role: asMemberRole(updated.role),
      isSelf: updated.userId === user.id,
      createdAt: updated.createdAt.toISOString(),
    };

    res.json(row);
  }),
);

// ─────────────────────────── DELETE /members/:id ───────────────────────────

router.delete(
  '/members/:id',
  requireCompany,
  requireRole('owner'),
  ah(async (req, res) => {
    const { company } = companyCtx(req);
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

    res.json({
      ok: true,
      id: target.id,
      message: `${displayName(target.user)} jamoadan chiqarildi`,
    });
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
