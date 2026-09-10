/**
 * Referal dasturi — /api/v1/referral
 *
 *  GET  /          → ReferralResponse (kod, havolalar, statistika, bonus tarixi)
 *  POST /withdraw  → bonusni yechish so'rovi (administrator tasdiqlaydi)
 *
 * ── Bonus daftari (ReferralBonus) ──────────────────────────────────────────────
 * Bitta jadval ikki yo'nalishda ishlaydi:
 *   musbat `amount`  — hisoblangan bonus (do'stingiz to'lov qilganda);
 *   manfiy `amount`  — sarflangan yoki yechib olingan mablag'.
 *
 * Holatlar (`status`):
 *   'pending'   — hisoblangan, hali tasdiqlanmagan (musbat)  → balansga kiradi
 *   'approved'  — admin tasdiqlagan (musbat)                 → balansga kiradi
 *   'spent'     — obuna to'lovida ishlatilgan (manfiy)       → balansdan chiqadi
 *   'requested' — yechish so'rovi berilgan (manfiy)          → balansdan chiqadi
 *   'paid'      — pul yechib berilgan (manfiy)               → balansdan chiqadi
 *   'canceled'  — bekor qilingan                             → umuman hisobga olinmaydi
 *
 * Shu sababli balans = 'canceled' bo'lmagan barcha yozuvlar yig'indisi.
 * Javobdagi `earnedTotal = pending + paid` tengligi doimo saqlanadi:
 *   earnedTotal — jami ishlangan bonus, `pending` — mavjud (ishlatilmagan) qoldiq,
 *   `paid` — yechib olingan yoki obunaga sarflangan qism.
 *
 * Ma'lumot bo'lmasa marshrutlar 200 va nol qiymatlar qaytaradi.
 */
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '@savdoiq/db';
import { REFERRAL_PERCENT, formatMoney, round, type ReferralResponse } from '@savdoiq/shared';
import { AppError, ah } from '../lib/errors.js';
import { ctx, requireAuth } from '../lib/auth.js';
import { env } from '../env.js';
import { notifyAdmins } from './notifications.js';
import { notifyUser } from '../services/notify.js';

const router = Router();

// ─────────────────────────── Bonus daftari (umumiy yordamchilar) ───────────────────────────

/** Bekor qilingan yozuv — hech qayerda hisobga olinmaydi */
const STATUS_CANCELED = 'canceled';
/** Yechish so'rovi — admin tasdiqini kutmoqda */
const STATUS_REQUESTED = 'requested';
/** Obuna to'loviga sarflangan bonus */
const STATUS_SPENT = 'spent';

/** Bonusni yechish uchun minimal summa (UZS) */
export const BONUS_MIN_WITHDRAW = 50_000;

export interface BonusStats {
  /** Jami hisoblangan bonus */
  earnedTotal: number;
  /** Yechib berilgan + obunaga sarflangan */
  paidOut: number;
  /** Yechish so'rovi berilgan, lekin hali to'lanmagan */
  pendingWithdraw: number;
  /** Hozir ishlatish mumkin bo'lgan qoldiq */
  balance: number;
}

const emptyStats = (): BonusStats => ({ earnedTotal: 0, paidOut: 0, pendingWithdraw: 0, balance: 0 });

/** Foydalanuvchining bonus daftari bo'yicha jamlanma */
export async function getBonusStats(userId: string): Promise<BonusStats> {
  const rows = await prisma.referralBonus.findMany({
    where: { referrerId: userId, status: { not: STATUS_CANCELED } },
    select: { amount: true, status: true },
  });

  const stats = emptyStats();
  for (const r of rows) {
    stats.balance += r.amount;
    if (r.amount > 0) {
      stats.earnedTotal += r.amount;
    } else if (r.status === STATUS_REQUESTED) {
      stats.pendingWithdraw += -r.amount;
    } else {
      stats.paidOut += -r.amount;
    }
  }

  return {
    earnedTotal: round(stats.earnedTotal),
    paidOut: round(stats.paidOut),
    pendingWithdraw: round(stats.pendingWithdraw),
    // Salbiy balans mantiqan bo'lmasligi kerak — himoya sifatida 0 ga qisqartiramiz
    balance: round(Math.max(0, stats.balance)),
  };
}

/** Ishlatish mumkin bo'lgan bonus qoldig'i */
export async function getBonusBalance(userId: string): Promise<number> {
  const stats = await getBonusStats(userId);
  return stats.balance;
}

/**
 * To'langan hisob-faktura uchun referal bonusini hisoblaydi.
 * Kompaniya egasini taklif qilgan foydalanuvchi topilmasa — `null`.
 * Idempotent: bitta hisob-faktura uchun ikkinchi marta bonus yozilmaydi.
 */
export async function accrueReferralBonus(params: {
  invoiceId: string;
  companyId: string;
  amount: number;
}): Promise<{ referrerId: string; amount: number } | null> {
  if (params.amount <= 0) return null;

  // Bu hisob-faktura bo'yicha bonus allaqachon yozilganmi?
  const existing = await prisma.referralBonus.findFirst({
    where: { invoiceId: params.invoiceId, amount: { gt: 0 } },
    select: { id: true },
  });
  if (existing) return null;

  // Kompaniya egasi → uni kim taklif qilgan?
  const owner = await prisma.membership.findFirst({
    where: { companyId: params.companyId, role: 'owner' },
    orderBy: { createdAt: 'asc' },
    select: { user: { select: { id: true, referredById: true } } },
  });
  const referrerId = owner?.user.referredById ?? null;
  if (!referrerId) return null;
  // O'ziga o'zi bonus yozmasin
  if (referrerId === owner?.user.id) return null;

  const amount = round((params.amount * REFERRAL_PERCENT) / 100);
  if (amount <= 0) return null;

  await prisma.referralBonus.create({
    data: {
      referrerId,
      companyId: params.companyId,
      invoiceId: params.invoiceId,
      amount,
      percent: REFERRAL_PERCENT,
      status: 'pending',
    },
  });

  await notifyUser(referrerId, {
    type: 'success',
    title: 'Referal bonusi hisoblandi',
    body: `Siz taklif qilgan kompaniya to‘lov qildi. Bonusingiz: ${formatMoney(amount, 'uz')} (${REFERRAL_PERCENT}%).`,
    link: '/referral',
  });

  return { referrerId, amount };
}

/**
 * Obuna to'lovida bonusni ishlatish — daftarga manfiy yozuv qo'shadi.
 * Qaytaradi: haqiqatda sarflangan summa (balansdan oshib ketmaydi).
 */
export async function spendBonus(params: {
  userId: string;
  companyId: string;
  invoiceId: string;
  amount: number;
}): Promise<number> {
  const balance = await getBonusBalance(params.userId);
  const amount = round(Math.min(Math.max(0, params.amount), balance));
  if (amount <= 0) return 0;

  await prisma.referralBonus.create({
    data: {
      referrerId: params.userId,
      companyId: params.companyId,
      invoiceId: params.invoiceId,
      amount: -amount,
      percent: 0,
      status: STATUS_SPENT,
    },
  });
  return amount;
}

/**
 * Hisob-faktura bekor qilinganda sarflangan bonusni balansga qaytaradi.
 * Qaytaradi: qaytarilgan yozuvlar soni.
 */
export async function releaseInvoiceBonus(invoiceId: string): Promise<number> {
  const result = await prisma.referralBonus.updateMany({
    where: { invoiceId, status: STATUS_SPENT, amount: { lt: 0 } },
    data: { status: STATUS_CANCELED },
  });
  return result.count;
}

// ─────────────────────────── Marshrutlar ───────────────────────────

router.use(requireAuth);

/** Bot foydalanuvchi nomi (@ belgisisiz) */
const botUsername = (): string => env.telegram.botUsername.replace(/^@/, '');

/** GET / — referal kabinet */
router.get(
  '/',
  ah(async (req, res) => {
    const { user } = ctx(req);

    const [invitedUsers, bonusRows, stats] = await Promise.all([
      prisma.user.findMany({ where: { referredById: user.id }, select: { id: true } }),
      prisma.referralBonus.findMany({
        where: { referrerId: user.id },
        orderBy: { createdAt: 'desc' },
        take: 100,
        select: {
          id: true,
          amount: true,
          status: true,
          createdAt: true,
          company: { select: { name: true } },
        },
      }),
      getBonusStats(user.id),
    ]);

    // Taklif qilinganlar orasida pullik tarifda turgan kompaniyalar
    let activePaying = 0;
    if (invitedUsers.length > 0) {
      const memberships = await prisma.membership.findMany({
        where: { userId: { in: invitedUsers.map((u) => u.id) } },
        select: { companyId: true },
      });
      const companyIds = [...new Set(memberships.map((m) => m.companyId))];
      if (companyIds.length > 0) {
        activePaying = await prisma.subscription.count({
          where: {
            companyId: { in: companyIds },
            status: 'active',
            plan: { not: 'trial' },
            expiresAt: { gt: new Date() },
          },
        });
      }
    }

    const webBase = env.webUrl.replace(/\/+$/, '');

    const payload: ReferralResponse = {
      code: user.referralCode,
      link: `${webBase}/?ref=${user.referralCode}`,
      botLink: `https://t.me/${botUsername()}?start=ref_${user.referralCode}`,
      percent: REFERRAL_PERCENT,
      invited: invitedUsers.length,
      activePaying,
      earnedTotal: stats.earnedTotal,
      // `pending` — ishlatish mumkin bo'lgan qoldiq (hali yechilmagan/sarflanmagan)
      pending: stats.balance,
      paid: stats.paidOut,
      history: bonusRows.map((b) => ({
        id: b.id,
        company: b.company?.name ?? '—',
        amount: round(b.amount),
        status: b.status,
        createdAt: b.createdAt.toISOString(),
      })),
    };

    res.json(payload);
  }),
);

const withdrawSchema = z.object({
  /** Bo'sh qoldirilsa — butun qoldiq so'raladi */
  amount: z.coerce.number().min(0).optional(),
  note: z.string().trim().max(300).optional(),
});

interface WithdrawResponse {
  ok: boolean;
  requested: number;
  balance: number;
  pendingWithdraw: number;
  minAmount: number;
  message: string;
}

/** POST /withdraw — bonusni yechish so'rovi */
router.post(
  '/withdraw',
  ah(async (req, res) => {
    const { user } = ctx(req);
    const input = withdrawSchema.parse(req.body ?? {});
    const stats = await getBonusStats(user.id);

    if (stats.balance < BONUS_MIN_WITHDRAW) {
      throw AppError.badRequest(
        `Yechish uchun kamida ${formatMoney(BONUS_MIN_WITHDRAW, 'uz')} bonus kerak. Hozirgi qoldiq: ${formatMoney(stats.balance, 'uz')}.`,
        { balance: stats.balance, minAmount: BONUS_MIN_WITHDRAW },
      );
    }

    const amount = round(input.amount && input.amount > 0 ? Math.min(input.amount, stats.balance) : stats.balance);
    if (amount < BONUS_MIN_WITHDRAW) {
      throw AppError.badRequest(`Minimal summa — ${formatMoney(BONUS_MIN_WITHDRAW, 'uz')}`, {
        minAmount: BONUS_MIN_WITHDRAW,
      });
    }

    // Bir vaqtning o'zida faqat bitta ochiq so'rov
    const openRequest = await prisma.referralBonus.findFirst({
      where: { referrerId: user.id, status: STATUS_REQUESTED },
      select: { id: true, amount: true },
    });
    if (openRequest) {
      throw AppError.conflict(
        `Sizda ko‘rib chiqilayotgan so‘rov bor (${formatMoney(-openRequest.amount, 'uz')}). Administrator javobini kuting.`,
      );
    }

    // ReferralBonus.companyId majburiy — o'z kompaniyamiz, bo'lmasa bonus kelgan kompaniya
    const membership = await prisma.membership.findFirst({
      where: { userId: user.id },
      orderBy: { createdAt: 'asc' },
      select: { companyId: true },
    });
    const fallback = membership
      ? null
      : await prisma.referralBonus.findFirst({
          where: { referrerId: user.id, amount: { gt: 0 } },
          orderBy: { createdAt: 'desc' },
          select: { companyId: true },
        });
    const companyId = membership?.companyId ?? fallback?.companyId ?? null;
    if (!companyId) throw AppError.badRequest('So‘rov yuborish uchun kompaniya topilmadi');

    await prisma.referralBonus.create({
      data: {
        referrerId: user.id,
        companyId,
        amount: -amount,
        percent: 0,
        status: STATUS_REQUESTED,
      },
    });

    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: 'referral.withdraw_request',
        entity: 'referral_bonus',
        entityId: user.id,
        meta: JSON.stringify({ amount, note: input.note ?? null }),
      },
    });

    const who = [user.firstName, user.lastName].filter(Boolean).join(' ') || user.username || user.telegramId;
    await notifyAdmins({
      type: 'warning',
      title: 'Referal bonusini yechish so‘rovi',
      body: `${who} ${formatMoney(amount, 'uz')} yechishni so‘radi.${input.note ? ` Izoh: ${input.note}` : ''}`,
      link: '/admin',
    });

    await notifyUser(user.id, {
      type: 'info',
      title: 'So‘rovingiz qabul qilindi',
      body: `${formatMoney(amount, 'uz')} yechish so‘rovi administratorga yuborildi. Odatda 1–2 ish kunida ko‘rib chiqiladi.`,
      link: '/referral',
    });

    const after = await getBonusStats(user.id);
    const payload: WithdrawResponse = {
      ok: true,
      requested: amount,
      balance: after.balance,
      pendingWithdraw: after.pendingWithdraw,
      minAmount: BONUS_MIN_WITHDRAW,
      message: `${formatMoney(amount, 'uz')} yechish so‘rovi qabul qilindi`,
    };
    res.json(payload);
  }),
);

export default router;
