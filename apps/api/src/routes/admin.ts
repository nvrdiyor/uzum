/**
 * Administrator paneli — /api/v1/admin
 *
 *  GET   /stats                 → platforma bo'yicha umumiy ko'rsatkichlar (MRR, sinxron holati)
 *  GET   /users                 → foydalanuvchilar (qidiruv + sahifalash)
 *  PATCH /users/:id             → rol va holatni o'zgartirish
 *  GET   /companies             → kompaniyalar (tarif, do'konlar, egasi)
 *  GET   /invoices              → barcha hisob-fakturalar
 *  POST  /invoices/:id/approve  → qo'lda to'lovni tasdiqlash (tarif faollashadi)
 *  POST  /companies/:id/grant   → tarifni qo'lda berish (plan, months)
 *  PATCH /bonuses/:id           → referal bonusini to'lash / bekor qilish
 *  GET   /jobs                  → oxirgi sinxronizatsiya joblari
 *  POST  /broadcast             → ommaviy bildirishnoma
 *
 * Barcha marshrutlar `requireAuth` + `requireAdmin` ostida.
 * Ma'lumot bo'lmasa 200 va bo'sh ro'yxat / nol qiymatlar qaytariladi.
 */
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '@savdoiq/db';
import type { Prisma } from '@savdoiq/db';
import {
  PLANS,
  PLAN_IDS,
  PLAN_ORDER,
  formatMoney,
  getPlan,
  round,
  type InvoiceRow,
  type Paginated,
  type PlanId,
} from '@savdoiq/shared';
import { AppError, ah } from '../lib/errors.js';
import { ctx, requireAdmin, requireAuth } from '../lib/auth.js';
import { notifyUser } from '../services/notify.js';
import { activatePlan, markInvoicePaid } from './billing.js';

const router = Router();
router.use(requireAuth, requireAdmin);

// ─────────────────────────── Umumiy yordamchilar ───────────────────────────

/** Sahifalash parametrlari (barcha ro'yxatlar uchun bir xil) */
function pageParams(req: { query: Record<string, unknown> }): { page: number; pageSize: number; search?: string } {
  const q = req.query as Record<string, string | undefined>;
  const page = Math.max(1, Number(q.page ?? 1) || 1);
  const pageSize = Math.min(200, Math.max(1, Number(q.pageSize ?? 30) || 30));
  const search = q.search?.trim() || undefined;
  return { page, pageSize, ...(search ? { search } : {}) };
}

const fullName = (u: { firstName: string | null; lastName: string | null; username: string | null; telegramId: string }): string =>
  [u.firstName, u.lastName].filter(Boolean).join(' ') || u.username || `ID ${u.telegramId}`;

const iso = (d: Date | null | undefined): string | null => (d ? d.toISOString() : null);

/** Obuna aktivmi va joriy tarif qaysi */
function planOf(sub: { plan: string; status: string; expiresAt: Date } | null | undefined): {
  plan: PlanId;
  active: boolean;
  daysLeft: number;
} {
  if (!sub) return { plan: 'trial', active: false, daysLeft: 0 };
  const active = sub.status === 'active' && sub.expiresAt.getTime() > Date.now();
  return {
    plan: getPlan(sub.plan).id,
    active,
    daysLeft: Math.max(0, Math.ceil((sub.expiresAt.getTime() - Date.now()) / 86_400_000)),
  };
}

const daysAgo = (days: number): Date => new Date(Date.now() - days * 86_400_000);

// ─────────────────────────── GET /stats ───────────────────────────

interface AdminStatsResponse {
  users: { total: number; active: number; blocked: number; admins: number; new7d: number; new30d: number };
  companies: { total: number; onboarded: number; withCabinet: number };
  subscriptions: {
    active: number;
    trial: number;
    expiringSoon: number;
    byPlan: { plan: PlanId; name: string; count: number; mrr: number }[];
  };
  revenue: { mrr: number; paid30d: number; paidTotal: number; pendingCount: number; pendingAmount: number };
  sync: {
    queued: number;
    running: number;
    failed24h: number;
    done24h: number;
    invalidAccounts: number;
    lastFinishedAt: string | null;
  };
  referral: { bonusEarned: number; withdrawRequested: number };
  generatedAt: string;
}

router.get(
  '/stats',
  ah(async (_req, res) => {
    const now = new Date();
    const week = daysAgo(7);
    const month = daysAgo(30);
    const day = daysAgo(1);

    const [
      usersTotal,
      usersActive,
      usersBlocked,
      admins,
      new7d,
      new30d,
      companiesTotal,
      companiesOnboarded,
      cabinets,
      subs,
      paidInvoices,
      pendingInvoices,
      queued,
      running,
      failed24h,
      done24h,
      invalidAccounts,
      lastJob,
      bonuses,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { status: 'active' } }),
      prisma.user.count({ where: { status: { not: 'active' } } }),
      prisma.user.count({ where: { role: 'admin' } }),
      prisma.user.count({ where: { createdAt: { gte: week } } }),
      prisma.user.count({ where: { createdAt: { gte: month } } }),
      prisma.company.count(),
      prisma.company.count({ where: { onboarded: true } }),
      prisma.uzumAccount.findMany({ select: { companyId: true, status: true } }),
      prisma.subscription.findMany({ select: { plan: true, status: true, expiresAt: true } }),
      prisma.invoice.findMany({ where: { status: 'paid' }, select: { amount: true, paidAt: true } }),
      prisma.invoice.findMany({ where: { status: 'pending' }, select: { amount: true } }),
      prisma.syncJob.count({ where: { status: 'queued' } }),
      prisma.syncJob.count({ where: { status: 'running' } }),
      prisma.syncJob.count({ where: { status: 'failed', updatedAt: { gte: day } } }),
      prisma.syncJob.count({ where: { status: 'done', finishedAt: { gte: day } } }),
      prisma.uzumAccount.count({ where: { status: 'invalid' } }),
      prisma.syncJob.findFirst({
        where: { finishedAt: { not: null } },
        orderBy: { finishedAt: 'desc' },
        select: { finishedAt: true },
      }),
      prisma.referralBonus.findMany({
        where: { status: { not: 'canceled' } },
        select: { amount: true, status: true },
      }),
    ]);

    // Tariflar kesimi va MRR (faqat aktiv, pullik obunalar)
    const counts = new Map<PlanId, number>();
    let activeSubs = 0;
    let trialSubs = 0;
    let expiringSoon = 0;
    for (const s of subs) {
      const info = planOf(s);
      if (!info.active) continue;
      activeSubs += 1;
      if (info.plan === 'trial') trialSubs += 1;
      if (info.daysLeft <= 5) expiringSoon += 1;
      counts.set(info.plan, (counts.get(info.plan) ?? 0) + 1);
    }

    const byPlan = PLAN_ORDER.map((plan) => {
      const count = counts.get(plan) ?? 0;
      return { plan, name: PLANS[plan].name, count, mrr: PLANS[plan].price * count };
    });
    const mrr = byPlan.reduce((s, p) => s + p.mrr, 0);

    let paidTotal = 0;
    let paid30d = 0;
    for (const inv of paidInvoices) {
      paidTotal += inv.amount;
      if (inv.paidAt && inv.paidAt.getTime() >= month.getTime()) paid30d += inv.amount;
    }

    let bonusEarned = 0;
    let withdrawRequested = 0;
    for (const b of bonuses) {
      if (b.amount > 0) bonusEarned += b.amount;
      else if (b.status === 'requested') withdrawRequested += -b.amount;
    }

    const payload: AdminStatsResponse = {
      users: { total: usersTotal, active: usersActive, blocked: usersBlocked, admins, new7d, new30d },
      companies: {
        total: companiesTotal,
        onboarded: companiesOnboarded,
        withCabinet: new Set(cabinets.map((c) => c.companyId)).size,
      },
      subscriptions: { active: activeSubs, trial: trialSubs, expiringSoon, byPlan },
      revenue: {
        mrr: round(mrr),
        paid30d: round(paid30d),
        paidTotal: round(paidTotal),
        pendingCount: pendingInvoices.length,
        pendingAmount: round(pendingInvoices.reduce((s, i) => s + i.amount, 0)),
      },
      sync: {
        queued,
        running,
        failed24h,
        done24h,
        invalidAccounts,
        lastFinishedAt: iso(lastJob?.finishedAt),
      },
      referral: { bonusEarned: round(bonusEarned), withdrawRequested: round(withdrawRequested) },
      generatedAt: now.toISOString(),
    };

    res.json(payload);
  }),
);

// ─────────────────────────── GET /users ───────────────────────────

interface AdminUserRow {
  id: string;
  telegramId: string;
  name: string;
  username: string | null;
  phone: string | null;
  role: string;
  status: string;
  language: string;
  referralCode: string;
  companiesCount: number;
  companyName: string | null;
  plan: PlanId;
  telegramConnected: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

router.get(
  '/users',
  ah(async (req, res) => {
    const { page, pageSize, search } = pageParams(req);

    const where: Prisma.UserWhereInput = search
      ? {
          OR: [
            { telegramId: { contains: search } },
            { username: { contains: search } },
            { firstName: { contains: search } },
            { lastName: { contains: search } },
            { phone: { contains: search } },
            { referralCode: { contains: search.toUpperCase() } },
          ],
        }
      : {};

    const [total, rows] = await Promise.all([
      prisma.user.count({ where }),
      prisma.user.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          memberships: {
            orderBy: { createdAt: 'asc' },
            include: { company: { include: { subscription: true } } },
          },
        },
      }),
    ]);

    const items: AdminUserRow[] = rows.map((u) => {
      const first = u.memberships[0];
      return {
        id: u.id,
        telegramId: u.telegramId,
        name: fullName(u),
        username: u.username,
        phone: u.phone,
        role: u.role,
        status: u.status,
        language: u.languageCode,
        referralCode: u.referralCode,
        companiesCount: u.memberships.length,
        companyName: first?.company.name ?? null,
        plan: planOf(first?.company.subscription).plan,
        telegramConnected: Boolean(u.botChatId),
        lastLoginAt: iso(u.lastLoginAt),
        createdAt: u.createdAt.toISOString(),
      };
    });

    const payload: Paginated<AdminUserRow> = {
      items,
      total,
      page,
      pageSize,
      pages: Math.max(1, Math.ceil(total / pageSize)),
    };
    res.json(payload);
  }),
);

// ─────────────────────────── PATCH /users/:id ───────────────────────────

const userPatchSchema = z.object({
  role: z.enum(['user', 'admin']).optional(),
  status: z.enum(['active', 'blocked']).optional(),
});

router.patch(
  '/users/:id',
  ah(async (req, res) => {
    const { user: admin } = ctx(req);
    const id = String(req.params.id);
    const input = userPatchSchema.parse(req.body ?? {});
    if (input.role === undefined && input.status === undefined)
      throw AppError.badRequest('O‘zgartirish uchun `role` yoki `status` yuboring');

    const target = await prisma.user.findUnique({ where: { id } });
    if (!target) throw AppError.notFound('Foydalanuvchi topilmadi');

    // O'zini bloklash yoki adminlikdan mahrum qilish taqiqlanadi
    if (target.id === admin.id && (input.role === 'user' || input.status === 'blocked'))
      throw AppError.badRequest('O‘z huquqlaringizni o‘zgartira olmaysiz');

    const updated = await prisma.user.update({
      where: { id: target.id },
      data: {
        ...(input.role ? { role: input.role } : {}),
        ...(input.status ? { status: input.status } : {}),
      },
    });

    // Bloklangan foydalanuvchining sessiyalari bekor qilinadi
    if (input.status === 'blocked') {
      await prisma.session.updateMany({
        where: { userId: target.id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }

    await prisma.auditLog.create({
      data: {
        userId: admin.id,
        action: 'admin.user_update',
        entity: 'user',
        entityId: target.id,
        meta: JSON.stringify(input),
      },
    });

    if (input.status && input.status !== target.status) {
      await notifyUser(target.id, {
        type: input.status === 'active' ? 'success' : 'warning',
        title: input.status === 'active' ? 'Hisobingiz faollashtirildi' : 'Hisobingiz bloklandi',
        body:
          input.status === 'active'
            ? 'Platformadan yana to‘liq foydalanishingiz mumkin.'
            : 'Savollar bo‘lsa administrator bilan bog‘laning.',
      });
    }

    res.json({
      ok: true,
      id: updated.id,
      role: updated.role,
      status: updated.status,
      message: `${fullName(updated)} yangilandi`,
    });
  }),
);

// ─────────────────────────── GET /companies ───────────────────────────

interface AdminCompanyRow {
  id: string;
  name: string;
  taxRate: number;
  currency: string;
  onboarded: boolean;
  onboardStep: string;
  plan: PlanId;
  planActive: boolean;
  daysLeft: number;
  expiresAt: string | null;
  owner: { id: string; name: string; telegramId: string } | null;
  storesCount: number;
  cabinetsCount: number;
  membersCount: number;
  lastSyncAt: string | null;
  createdAt: string;
}

router.get(
  '/companies',
  ah(async (req, res) => {
    const { page, pageSize, search } = pageParams(req);

    const where: Prisma.CompanyWhereInput = search ? { name: { contains: search } } : {};

    const [total, rows] = await Promise.all([
      prisma.company.count({ where }),
      prisma.company.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          subscription: true,
          memberships: { orderBy: { createdAt: 'asc' }, include: { user: true } },
          uzumAccounts: { select: { id: true, lastSyncAt: true } },
          stores: { select: { id: true } },
        },
      }),
    ]);

    const items: AdminCompanyRow[] = rows.map((c) => {
      const info = planOf(c.subscription);
      const owner = c.memberships.find((m) => m.role === 'owner') ?? c.memberships[0];
      const lastSync = c.uzumAccounts
        .map((a) => a.lastSyncAt?.getTime() ?? 0)
        .reduce((a, b) => Math.max(a, b), 0);

      return {
        id: c.id,
        name: c.name,
        taxRate: c.taxRate,
        currency: c.currency,
        onboarded: c.onboarded,
        onboardStep: c.onboardStep,
        plan: info.plan,
        planActive: info.active,
        daysLeft: info.daysLeft,
        expiresAt: iso(c.subscription?.expiresAt),
        owner: owner
          ? { id: owner.user.id, name: fullName(owner.user), telegramId: owner.user.telegramId }
          : null,
        storesCount: c.stores.length,
        cabinetsCount: c.uzumAccounts.length,
        membersCount: c.memberships.length,
        lastSyncAt: lastSync > 0 ? new Date(lastSync).toISOString() : null,
        createdAt: c.createdAt.toISOString(),
      };
    });

    const payload: Paginated<AdminCompanyRow> = {
      items,
      total,
      page,
      pageSize,
      pages: Math.max(1, Math.ceil(total / pageSize)),
    };
    res.json(payload);
  }),
);

// ─────────────────────────── GET /invoices ───────────────────────────

interface AdminInvoiceRow extends InvoiceRow {
  companyId: string;
  companyName: string;
  bonusUsed: number;
  externalId: string | null;
  comment: string | null;
}

const INVOICE_STATUSES = ['pending', 'paid', 'failed', 'canceled'] as const;

router.get(
  '/invoices',
  ah(async (req, res) => {
    const { page, pageSize, search } = pageParams(req);
    const q = req.query as Record<string, string | undefined>;
    const status = q.status && (INVOICE_STATUSES as readonly string[]).includes(q.status) ? q.status : undefined;

    const where: Prisma.InvoiceWhereInput = {
      ...(status ? { status } : {}),
      ...(q.companyId ? { companyId: q.companyId } : {}),
      ...(search ? { company: { name: { contains: search } } } : {}),
    };

    const [total, rows] = await Promise.all([
      prisma.invoice.count({ where }),
      prisma.invoice.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { company: { select: { name: true } } },
      }),
    ]);

    const items: AdminInvoiceRow[] = rows.map((inv) => ({
      id: inv.id,
      plan: getPlan(inv.plan).id,
      months: inv.months,
      amount: round(inv.amount),
      currency: inv.currency,
      provider: inv.provider,
      status: ((INVOICE_STATUSES as readonly string[]).includes(inv.status)
        ? inv.status
        : 'pending') as InvoiceRow['status'],
      payUrl: inv.payUrl,
      paidAt: iso(inv.paidAt),
      createdAt: inv.createdAt.toISOString(),
      companyId: inv.companyId,
      companyName: inv.company.name,
      bonusUsed: round(inv.bonusUsed),
      externalId: inv.externalId,
      comment: inv.comment,
    }));

    const payload: Paginated<AdminInvoiceRow> = {
      items,
      total,
      page,
      pageSize,
      pages: Math.max(1, Math.ceil(total / pageSize)),
    };
    res.json(payload);
  }),
);

// ─────────────────────────── POST /invoices/:id/approve ───────────────────────────

router.post(
  '/invoices/:id/approve',
  ah(async (req, res) => {
    const { user: admin } = ctx(req);
    const id = String(req.params.id);

    // markInvoicePaid: to'lash + tarifni faollashtirish + referal bonusi + bildirishnoma
    const result = await markInvoicePaid(id, { source: `admin:${admin.id}` });

    await prisma.auditLog.create({
      data: {
        userId: admin.id,
        action: 'admin.invoice_approve',
        entity: 'invoice',
        entityId: id,
        meta: JSON.stringify({ alreadyPaid: result.alreadyPaid, amount: result.invoice.amount }),
      },
    });

    res.json({
      ok: true,
      alreadyPaid: result.alreadyPaid,
      invoice: result.invoice,
      message: result.alreadyPaid
        ? 'Bu hisob allaqachon to‘langan'
        : `${formatMoney(result.invoice.amount, 'uz')} to‘lov tasdiqlandi, tarif faollashtirildi`,
    });
  }),
);

// ─────────────────────────── POST /companies/:id/grant ───────────────────────────

const grantSchema = z.object({
  plan: z.enum(PLAN_IDS),
  months: z.coerce.number().int().min(1).max(36).default(1),
  comment: z.string().trim().max(200).optional(),
});

router.post(
  '/companies/:id/grant',
  ah(async (req, res) => {
    const { user: admin } = ctx(req);
    const id = String(req.params.id);
    const input = grantSchema.parse(req.body ?? {});

    const company = await prisma.company.findUnique({ where: { id }, select: { id: true, name: true, currency: true } });
    if (!company) throw AppError.notFound('Kompaniya topilmadi');

    // Tarixda ko'rinishi uchun 0 so'mlik "to'langan" hisob yaratamiz (referal bonusi hisoblanmaydi)
    await prisma.invoice.create({
      data: {
        companyId: company.id,
        plan: input.plan,
        months: input.months,
        amount: 0,
        currency: company.currency,
        provider: 'manual',
        status: 'paid',
        paidAt: new Date(),
        comment: input.comment ?? `Administrator tomonidan berildi (${PLANS[input.plan].name})`,
      },
    });

    await activatePlan(company.id, input.plan, input.months);

    await prisma.auditLog.create({
      data: {
        userId: admin.id,
        action: 'admin.plan_grant',
        entity: 'company',
        entityId: company.id,
        meta: JSON.stringify({ plan: input.plan, months: input.months }),
      },
    });

    const sub = await prisma.subscription.findUnique({ where: { companyId: company.id } });

    res.json({
      ok: true,
      companyId: company.id,
      plan: input.plan,
      months: input.months,
      expiresAt: iso(sub?.expiresAt),
      message: `${company.name}: “${PLANS[input.plan].name}” tarifi ${input.months} oyga berildi`,
    });
  }),
);

// ─────────────────────────── PATCH /bonuses/:id ───────────────────────────

const bonusPatchSchema = z.object({
  /** 'approved' — tasdiqlash, 'paid' — to'lab berildi, 'canceled' — bekor qilish */
  status: z.enum(['approved', 'paid', 'canceled']),
});

router.patch(
  '/bonuses/:id',
  ah(async (req, res) => {
    const { user: admin } = ctx(req);
    const id = String(req.params.id);
    const input = bonusPatchSchema.parse(req.body ?? {});

    const bonus = await prisma.referralBonus.findUnique({ where: { id } });
    if (!bonus) throw AppError.notFound('Bonus yozuvi topilmadi');

    const updated = await prisma.referralBonus.update({
      where: { id: bonus.id },
      data: { status: input.status },
    });

    await prisma.auditLog.create({
      data: {
        userId: admin.id,
        action: 'admin.bonus_update',
        entity: 'referral_bonus',
        entityId: bonus.id,
        meta: JSON.stringify({ status: input.status, amount: bonus.amount }),
      },
    });

    // Yechish so'rovi to'landi yoki rad etildi — foydalanuvchini xabardor qilamiz
    if (bonus.amount < 0) {
      const amount = Math.abs(bonus.amount);
      if (input.status === 'paid') {
        await notifyUser(bonus.referrerId, {
          type: 'success',
          title: 'Bonus to‘landi',
          body: `${formatMoney(amount, 'uz')} referal bonusi hisobingizga o‘tkazildi.`,
          link: '/referral',
        });
      } else if (input.status === 'canceled') {
        await notifyUser(bonus.referrerId, {
          type: 'warning',
          title: 'Yechish so‘rovi bekor qilindi',
          body: `${formatMoney(amount, 'uz')} so‘rovi bekor qilindi — summa balansingizga qaytarildi.`,
          link: '/referral',
        });
      }
    }

    res.json({ ok: true, id: updated.id, status: updated.status, amount: round(updated.amount) });
  }),
);

// ─────────────────────────── GET /jobs ───────────────────────────

interface AdminJobRow {
  id: string;
  companyId: string;
  companyName: string;
  accountLabel: string | null;
  type: string;
  status: string;
  progress: number;
  step: string;
  stepIndex: number;
  totalSteps: number;
  message: string | null;
  error: string | null;
  attempts: number;
  etaSeconds: number;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
}

router.get(
  '/jobs',
  ah(async (req, res) => {
    const { page, pageSize } = pageParams(req);
    const q = req.query as Record<string, string | undefined>;

    const where: Prisma.SyncJobWhereInput = {
      ...(q.status ? { status: q.status } : {}),
      ...(q.companyId ? { companyId: q.companyId } : {}),
    };

    const [total, rows] = await Promise.all([
      prisma.syncJob.count({ where }),
      prisma.syncJob.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          company: { select: { name: true } },
          uzumAccount: { select: { label: true } },
        },
      }),
    ]);

    const items: AdminJobRow[] = rows.map((j) => ({
      id: j.id,
      companyId: j.companyId,
      companyName: j.company.name,
      accountLabel: j.uzumAccount?.label ?? null,
      type: j.type,
      status: j.status,
      progress: j.progress,
      step: j.step,
      stepIndex: j.stepIndex,
      totalSteps: j.totalSteps,
      message: j.message,
      error: j.error,
      attempts: j.attempts,
      etaSeconds: j.etaSeconds,
      startedAt: iso(j.startedAt),
      finishedAt: iso(j.finishedAt),
      createdAt: j.createdAt.toISOString(),
    }));

    const payload: Paginated<AdminJobRow> = {
      items,
      total,
      page,
      pageSize,
      pages: Math.max(1, Math.ceil(total / pageSize)),
    };
    res.json(payload);
  }),
);

// ─────────────────────────── POST /broadcast ───────────────────────────

/** Bir chaqiruvda maksimal qabul qiluvchilar soni (Telegram limitlarini hisobga olib) */
const BROADCAST_LIMIT = 2000;

const broadcastSchema = z.object({
  title: z.string().trim().min(2).max(200),
  body: z.string().trim().max(2000).optional(),
  link: z.string().trim().max(300).optional(),
  type: z.enum(['info', 'success', 'warning', 'danger']).default('info'),
  /** Kimga: barchaga / faqat egalarga / pullik tarifdagilarga / sinovdagilarga / adminlarga */
  target: z.enum(['all', 'owners', 'paid', 'trial', 'admins']).default('all'),
  /** false bo'lsa faqat ilova ichida ko'rinadi (Telegramga yuborilmaydi) */
  telegram: z.coerce.boolean().default(true),
});

/** Nishonga qarab foydalanuvchi id'larini yig'adi */
async function resolveAudience(target: z.infer<typeof broadcastSchema>['target']): Promise<string[]> {
  if (target === 'admins') {
    const rows = await prisma.user.findMany({ where: { role: 'admin' }, select: { id: true } });
    return rows.map((r) => r.id);
  }

  if (target === 'all') {
    const rows = await prisma.user.findMany({ where: { status: 'active' }, select: { id: true } });
    return rows.map((r) => r.id);
  }

  if (target === 'owners') {
    const rows = await prisma.membership.findMany({
      where: { role: 'owner', user: { status: 'active' } },
      select: { userId: true },
    });
    return [...new Set(rows.map((r) => r.userId))];
  }

  // 'paid' | 'trial' — obuna holatiga qarab
  const subs = await prisma.subscription.findMany({ select: { companyId: true, plan: true, status: true, expiresAt: true } });
  const companyIds = subs
    .filter((s) => {
      const info = planOf(s);
      return target === 'paid' ? info.active && info.plan !== 'trial' : !info.active || info.plan === 'trial';
    })
    .map((s) => s.companyId);

  if (companyIds.length === 0) return [];
  const rows = await prisma.membership.findMany({
    where: { companyId: { in: companyIds }, user: { status: 'active' } },
    select: { userId: true },
  });
  return [...new Set(rows.map((r) => r.userId))];
}

router.post(
  '/broadcast',
  ah(async (req, res) => {
    const { user: admin } = ctx(req);
    const input = broadcastSchema.parse(req.body ?? {});

    const audience = (await resolveAudience(input.target)).slice(0, BROADCAST_LIMIT);

    let sent = 0;
    for (const userId of audience) {
      // notifyUser hech qachon throw qilmaydi — bitta xato butun yuborishni to'xtatmaydi
      await notifyUser(userId, {
        type: input.type,
        title: input.title,
        ...(input.body ? { body: input.body } : {}),
        ...(input.link ? { link: input.link } : {}),
        telegram: input.telegram,
      });
      sent += 1;
    }

    await prisma.auditLog.create({
      data: {
        userId: admin.id,
        action: 'admin.broadcast',
        entity: 'notification',
        meta: JSON.stringify({ target: input.target, count: sent, title: input.title }),
      },
    });

    res.json({
      ok: true,
      target: input.target,
      recipients: audience.length,
      sent,
      limited: audience.length >= BROADCAST_LIMIT,
      message: `${sent} ta foydalanuvchiga yuborildi`,
    });
  }),
);

export default router;
