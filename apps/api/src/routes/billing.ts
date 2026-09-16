/**
 * Tarif va to'lovlar moduli — /api/v1/billing
 *
 *  POST /webhook/payme        → to'lov tizimi chaqiruvi (AVTORIZATSIYASIZ)
 *  POST /webhook/click        → to'lov tizimi chaqiruvi (AVTORIZATSIYASIZ)
 *  GET  /plans                → PlanPublic[] (kompaniya shart emas)
 *  GET  /subscription         → joriy obuna + limitlardan foydalanish
 *  POST /subscribe            → hisob-faktura yaratish (payme/click/manual)
 *  GET  /invoices             → hisob-fakturalar ro'yxati
 *  POST /invoices/:id/cancel  → kutilayotgan hisobni bekor qilish
 *
 * Eksport: `activatePlan()` va `markInvoicePaid()` — admin paneli va bot ham ishlatadi.
 *
 * DIQQAT: webhook marshrutlari `requireAuth` dan OLDIN ro'yxatdan o'tkazilgan.
 * Payme/Click bilan integratsiya soddalashtirilgan shaklda: kalitlar `.env` da
 * bo'lmasa ham modul xatosiz ishlaydi (to'lov havolasi o'rniga izoh qaytariladi).
 */
import { Router } from 'express';
import crypto from 'node:crypto';
import { prisma } from '@savdoiq/db';
import type { Prisma } from '@savdoiq/db';
import {
  FEATURE_IDS,
  PLANS,
  PLAN_ORDER,
  formatMoney,
  getPlan,
  planPrice,
  round,
  subscribeSchema,
  type FeatureId,
  type InvoiceRow,
  type Paginated,
  type PlanId,
  type PlanPublic,
  type SubscriptionSummary,
} from '@savdoiq/shared';
import { AppError, ah } from '../lib/errors.js';
import { companyCtx, ctx, requireAuth, requireCompany, requireRole } from '../lib/auth.js';
import { env } from '../env.js';
import { notifyCompanyOwners } from '../services/notify.js';
import { notifyAdmins } from './notifications.js';
import { accrueReferralBonus, getBonusStats, releaseInvoiceBonus, spendBonus } from './referral.js';

const router = Router();

// ─────────────────────────── Umumiy yordamchilar ───────────────────────────

/** Tarif imkoniyatlarining o'zbekcha yorliqlari (PlanPublic.features uchun) */
const FEATURE_LABELS: Record<FeatureId, string> = {
  dashboard_realtime: 'Real vaqtdagi dashboard',
  sales_analytics: 'Sotuv tahlili',
  revenue_roi: 'Tushum va ROI',
  products_assortment: 'Mahsulotlar va assortiment',
  stocks_fbo_fbs: 'Qoldiqlar (FBO/FBS)',
  abc_analysis: 'ABC tahlil',
  illiquid: 'Nolikvid tovarlar',
  losses_report: 'Yo‘qotishlar hisoboti',
  returns_report: 'Qaytarishlar hisoboti',
  paid_storage: 'Pullik saqlash',
  vgh_report: 'Vazn-gabarit (VGH) hisoboti',
  warehouse: 'Ombor boshqaruvi',
  shipments: 'Yetkazmalar',
  planner: 'Yetkazib berish rejalashtiruvchisi',
  monthly_reports: 'Oylik hisobotlar',
  unit_economics: 'Unit-iqtisod',
  unit_calculator: 'Unit-kalkulyator',
  cost_price: 'Tannarx boshqaruvi',
  expenses: 'Xarajatlar hisobi',
  promos: 'Aksiyalar va ularning foydasi',
  sku_health: 'SKU holati (blok, brak, qaytarishlar)',
  reviews_autoreply: 'Sharhlarga avto-javob',
  telegram_notifications: 'Telegram bildirishnomalar',
  referral: 'Referal dasturi',
  export_excel: 'Excel’ga eksport',
  api_access: 'Ochiq API',
  priority_support: 'Ustuvor qo‘llab-quvvatlash',
};

/** Hisob-faktura holatlari (bazadagi matnni xavfsiz keltirish uchun) */
const INVOICE_STATUSES = ['pending', 'paid', 'failed', 'canceled'] as const;
type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

const asInvoiceStatus = (value: string): InvoiceStatus =>
  (INVOICE_STATUSES as readonly string[]).includes(value) ? (value as InvoiceStatus) : 'pending';

/** Bazadagi hisob-faktura yozuvi (javobga aylantirish uchun kerakli maydonlar) */
interface DbInvoice {
  id: string;
  plan: string;
  months: number;
  amount: number;
  currency: string;
  provider: string;
  status: string;
  payUrl: string | null;
  paidAt: Date | null;
  createdAt: Date;
}

const toInvoiceRow = (inv: DbInvoice): InvoiceRow => ({
  id: inv.id,
  plan: getPlan(inv.plan).id,
  months: inv.months,
  amount: round(inv.amount),
  currency: inv.currency,
  provider: inv.provider,
  status: asInvoiceStatus(inv.status),
  payUrl: inv.payUrl,
  paidAt: inv.paidAt ? inv.paidAt.toISOString() : null,
  createdAt: inv.createdAt.toISOString(),
});

/** Obuna tugashiga qolgan kunlar (o'tib ketgan bo'lsa 0) */
const daysLeftOf = (expiresAt: Date): number =>
  Math.max(0, Math.ceil((expiresAt.getTime() - Date.now()) / 86_400_000));

/** Kompaniyaning joriy tarifi (obuna muddati o'tgan bo'lsa — trial) */
async function currentPlanOf(companyId: string): Promise<PlanId> {
  const sub = await prisma.subscription.findUnique({
    where: { companyId },
    select: { plan: true, status: true, expiresAt: true },
  });
  if (!sub) return 'trial';
  const active = sub.status === 'active' && sub.expiresAt.getTime() > Date.now();
  return active ? getPlan(sub.plan).id : 'trial';
}

/** Tarifni ommaviy ko'rinishga aylantiradi */
function toPlanPublic(id: PlanId, current: PlanId | null): PlanPublic {
  const p = PLANS[id];
  return {
    id: p.id,
    name: p.name,
    price: p.price,
    ...(p.trialDays === undefined ? {} : { trialDays: p.trialDays }),
    ...(p.badge === undefined ? {} : { badge: p.badge }),
    tagline: p.tagline.uz,
    limits: {
      stores: p.limits.stores,
      cabinets: p.limits.cabinets,
      members: p.limits.members,
      historyDays: p.limits.historyDays,
      syncIntervalMinutes: p.limits.syncIntervalMinutes,
    },
    features: FEATURE_IDS.map((f) => ({ id: f, label: FEATURE_LABELS[f], access: p.features[f] })),
    yearlyDiscount: p.yearlyDiscount,
    current: current === p.id,
  };
}

// ─────────────────────────── Tarifni faollashtirish ───────────────────────────

/**
 * Kompaniya tarifini faollashtiradi yoki uzaytiradi.
 * Nomi shartnoma bo'yicha o'zgarmaydi — admin paneli va bot ham shu funksiyani chaqiradi.
 *
 * Agar joriy obuna aktiv va aynan shu tarif bo'lsa — muddat tugash sanasidan uzaytiriladi,
 * aks holda bugundan boshlanadi.
 */
/**
 * Kalendar oy qo'shish — oy oxiri "toshib ketmaydi".
 *
 * `setUTCMonth(+1)` 31-yanvarga qo'llanilsa 31-fevral bo'lmagani uchun 3-martga
 * o'tib ketadi va sotuvchi 28 kun o'rniga 31 kun oladi (yoki aksincha, sana
 * kutilmaganda siljiydi). Bu yerda kun oy oxiriga QISQARTIRILADI:
 * 31-yanvar + 1 oy = 28-fevral (kabisa yilida 29-fevral).
 */
function addMonthsExact(base: Date, months: number): Date {
  const day = base.getUTCDate();
  const d = new Date(base.getTime());
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  // Yangi oydagi oxirgi kun
  const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, lastDay));
  return d;
}

/**
 * Obunani faollashtirish yoki uzaytirish.
 *
 * Muddat ikki xil berilishi mumkin:
 *   • `{ months: N }` — kalendar oy (tarif sotuvi shunday: 16-sentabrda olingan
 *     bir oylik obuna 16-oktabrda tugaydi);
 *   • `{ days: N }`   — ANIQ kun soni. 365 berilsa aniq 365 kun bo'ladi,
 *     kabisa yiliga ham, oy uzunligiga ham bog'liq emas.
 *
 * Aynan shu tarif hali amal qilsa — muddat tugash sanasidan uzaytiriladi,
 * aks holda bugundan boshlanadi (sotuvchi qolgan kunlarini yo'qotmaydi).
 */
export async function activatePlan(
  companyId: string,
  plan: string,
  period: number | { months?: number; days?: number },
): Promise<void> {
  const target = getPlan(plan);
  const raw = typeof period === 'number' ? { months: period } : period;
  const months = raw.months === undefined ? undefined : Math.min(36, Math.max(1, Math.round(raw.months) || 1));
  const days = raw.days === undefined ? undefined : Math.min(3650, Math.max(1, Math.round(raw.days) || 1));
  const now = new Date();

  const existing = await prisma.subscription.findUnique({ where: { companyId } });
  const stillActive = Boolean(existing && existing.expiresAt.getTime() > now.getTime() && existing.status === 'active');

  /**
   * Qolgan to'langan kunlar YO'QOLMAYDI — tariflar sahifasidagi savol-javobda
   * aynan shunday va'da qilingan.
   *
   *  • Aynan shu tarif uzaytirilsa — mavjud muddat oxiridan davom etadi.
   *  • Boshqa tarifga o'tilsa — qolgan kunlarning PUL QIYMATI yangi tarifning
   *    kunlik narxiga o'tkaziladi. Masalan standartda (200 000/oy) 30 kuni
   *    qolgan sotuvchi biznesga (400 000/oy) o'tsa, o'sha 30 kun 15 kunga
   *    aylanadi — puli kuymaydi, lekin qimmatroq tarifda kamroq kunga yetadi.
   *
   * Ilgari tarif o'zgarganda hisob bugundan boshlanardi va to'langan kunlar
   * butunlay kuyib ketardi.
   */
  const samePlan = existing?.plan === target.id;
  let carriedDays = 0;
  if (stillActive && !samePlan && existing) {
    const remainingMs = existing.expiresAt.getTime() - now.getTime();
    const remainingDays = Math.max(0, remainingMs / 86_400_000);
    const oldDaily = getPlan(existing.plan).price / 30;
    const newDaily = target.price / 30;
    // Bepul tarifdan (narxi 0) o'tishda hisoblash ma'nosiz — kunlar shunchaki qo'shiladi
    carriedDays = newDaily > 0 ? (remainingDays * oldDaily) / newDaily : remainingDays;
  }

  const base = stillActive && samePlan ? existing!.expiresAt : now;
  const expiresAt =
    days !== undefined
      ? new Date(base.getTime() + days * 86_400_000)
      : addMonthsExact(base, months ?? 1);
  // Oldingi tarifdan ko'chgan kunlar qo'shiladi (yaxlitlash sotuvchi foydasiga)
  if (carriedDays > 0) expiresAt.setTime(expiresAt.getTime() + Math.ceil(carriedDays) * 86_400_000);

  await prisma.subscription.upsert({
    where: { companyId },
    create: {
      companyId,
      plan: target.id,
      status: 'active',
      startedAt: now,
      expiresAt,
      trialUsed: true,
    },
    update: {
      plan: target.id,
      status: 'active',
      startedAt: stillActive && samePlan ? (existing?.startedAt ?? now) : now,
      expiresAt,
      canceledAt: null,
      trialUsed: true,
    },
  });

  // Sinxronizatsiya oralig'i tarifga bog'liq
  await prisma.uzumAccount.updateMany({
    where: { companyId },
    data: { syncIntervalM: target.limits.syncIntervalMinutes },
  });

  await prisma.auditLog.create({
    data: {
      action: 'subscription.activate',
      entity: 'subscription',
      entityId: companyId,
      meta: JSON.stringify({ plan: target.id, months, days, expiresAt: expiresAt.toISOString() }),
    },
  });

  await notifyCompanyOwners(companyId, {
    type: 'success',
    title: `“${target.name}” tarifi faollashtirildi`,
    body: `Obuna ${days !== undefined ? `${days} kunga` : `${months ?? 1} oyga`} uzaytirildi. Amal qilish muddati: ${expiresAt.toISOString().slice(0, 10)}.`,
    link: '/settings/billing',
  });
}

/**
 * Hisob-fakturani to'langan deb belgilaydi va barcha yon ta'sirlarni bajaradi:
 * tarifni faollashtirish, referal bonusi, bildirishnoma, audit.
 * Idempotent — ikkinchi chaqiruvda hech narsa o'zgarmaydi.
 */
export async function markInvoicePaid(
  invoiceId: string,
  opts: { externalId?: string | null; source?: string } = {},
): Promise<{ invoice: InvoiceRow; alreadyPaid: boolean }> {
  const invoice = await prisma.invoice.findUnique({ where: { id: invoiceId } });
  if (!invoice) throw AppError.notFound('Hisob-faktura topilmadi');

  if (invoice.status === 'paid') {
    return { invoice: toInvoiceRow(invoice), alreadyPaid: true };
  }

  /**
   * Bekor qilingan hisob-fakturani "to'langan" qilib bo'lmaydi.
   * Ilgari mumkin edi: bekor qilingan hisob qayta tasdiqlansa, obuna yana bir
   * marta uzayardi va referal bonusi ikkinchi marta hisoblanardi.
   */
  if (invoice.status === 'canceled' || invoice.status === 'expired') {
    throw AppError.badRequest('Bekor qilingan hisob-fakturani to‘langan deb belgilab bo‘lmaydi');
  }

  const updated = await prisma.invoice.update({
    where: { id: invoice.id },
    data: {
      status: 'paid',
      paidAt: new Date(),
      ...(opts.externalId ? { externalId: opts.externalId } : {}),
    },
  });

  await activatePlan(invoice.companyId, invoice.plan, invoice.months);
  await accrueReferralBonus({
    invoiceId: invoice.id,
    companyId: invoice.companyId,
    amount: invoice.amount,
  });

  await prisma.auditLog.create({
    data: {
      action: 'invoice.paid',
      entity: 'invoice',
      entityId: invoice.id,
      meta: JSON.stringify({
        provider: invoice.provider,
        amount: invoice.amount,
        source: opts.source ?? 'webhook',
      }),
    },
  });

  await notifyCompanyOwners(invoice.companyId, {
    type: 'success',
    title: 'To‘lov qabul qilindi',
    body: `${formatMoney(invoice.amount, 'uz')} to‘lovingiz tasdiqlandi. “${getPlan(invoice.plan).name}” tarifi ${invoice.months} oyga faollashdi.`,
    link: '/settings/billing',
  });

  return { invoice: toInvoiceRow(updated), alreadyPaid: false };
}

// ─────────────────────────── To'lov havolalari ───────────────────────────

interface PayLink {
  payUrl: string | null;
  /** Foydalanuvchiga ko'rsatiladigan ko'rsatma (o'zbekcha) */
  instruction: string;
  /** To'lov tizimi sozlanganmi */
  configured: boolean;
}

/** Qo'lda (karta orqali) to'lash ko'rsatmasi */
function manualInstruction(amount: number): PayLink {
  const card = env.billing.manualCard.trim();
  const owner = env.billing.manualCardOwner.trim();
  if (!card) {
    return {
      payUrl: null,
      configured: false,
      instruction:
        'To‘lov tizimi sozlanmagan. Iltimos, administrator bilan bog‘laning — hisob qo‘lda tasdiqlanadi.',
    };
  }
  return {
    payUrl: null,
    configured: true,
    instruction:
      `${formatMoney(amount, 'uz')} ni ${card}${owner ? ` (${owner})` : ''} kartasiga o‘tkazing va chek rasmini botga yuboring. ` +
      'Administrator tasdiqlagach tarif avtomatik faollashadi.',
  };
}

/** Payme checkout havolasi (kalit bo'lmasa — qo'lda to'lash izohi) */
function paymeLink(invoiceId: string, amount: number): PayLink {
  const merchant = env.billing.paymeMerchantId.trim();
  if (!merchant) {
    return {
      payUrl: null,
      configured: false,
      instruction: 'Payme to‘lov tizimi sozlanmagan. Karta orqali to‘lash yoki administratorga murojaat qiling.',
    };
  }
  // Payme summani tiyinda kutadi
  const params = `m=${merchant};ac.invoice_id=${invoiceId};a=${Math.round(amount * 100)}`;
  return {
    payUrl: `https://checkout.paycom.uz/${Buffer.from(params, 'utf8').toString('base64')}`,
    configured: true,
    instruction: 'Payme sahifasida to‘lovni yakunlang — tarif bir necha soniyada faollashadi.',
  };
}

/** Click to'lov havolasi (kalit bo'lmasa — qo'lda to'lash izohi) */
function clickLink(invoiceId: string, amount: number): PayLink {
  const merchant = env.billing.clickMerchantId.trim();
  const service = env.billing.clickServiceId.trim();
  if (!merchant || !service) {
    return {
      payUrl: null,
      configured: false,
      instruction: 'Click to‘lov tizimi sozlanmagan. Karta orqali to‘lash yoki administratorga murojaat qiling.',
    };
  }
  const query = new URLSearchParams({
    service_id: service,
    merchant_id: merchant,
    amount: String(Math.round(amount)),
    transaction_param: invoiceId,
    return_url: `${env.webUrl.replace(/\/+$/, '')}/settings/billing`,
  });
  return {
    payUrl: `https://my.click.uz/services/pay?${query.toString()}`,
    configured: true,
    instruction: 'Click sahifasida to‘lovni yakunlang — tarif bir necha soniyada faollashadi.',
  };
}

function buildPayLink(provider: string, invoiceId: string, amount: number): PayLink {
  if (amount <= 0) {
    return {
      payUrl: null,
      configured: true,
      instruction: 'Summa bonus hisobidan to‘liq qoplandi — qo‘shimcha to‘lov talab qilinmaydi.',
    };
  }
  if (provider === 'payme') return paymeLink(invoiceId, amount);
  if (provider === 'click') return clickLink(invoiceId, amount);
  return manualInstruction(amount);
}

// ─────────────────────────── Webhooklar (avtorizatsiyasiz) ───────────────────────────

const asRecord = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const asText = (value: unknown): string | null => {
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return null;
};

const asNumber = (value: unknown): number | null => {
  const n = typeof value === 'string' ? Number(value) : typeof value === 'number' ? value : NaN;
  return Number.isFinite(n) ? n : null;
};

/** So'rov tanasidan hisob-faktura id'sini topadi (turli formatlarga chidamli) */
function extractInvoiceId(body: Record<string, unknown>): string | null {
  const params = asRecord(body.params);
  const account = { ...asRecord(body.account), ...asRecord(params.account) };
  const candidates = [
    account.invoice_id,
    account.invoiceId,
    account.order_id,
    body.invoice_id,
    body.invoiceId,
    body.merchant_trans_id,
    body.transaction_param,
    params.invoice_id,
    params.invoiceId,
  ];
  for (const c of candidates) {
    const v = asText(c);
    if (v) return v;
  }
  return null;
}

/**
 * Payme chaqiruvining haqiqiyligini tekshiradi.
 *
 * Payme har so'rovda `Authorization: Basic base64("Paycom:" + PAYME_KEY)`
 * yuboradi. Ilgari bu UMUMAN tekshirilmasdi: hisob-faktura id'sini bilgan
 * (yoki o'zi yaratgan) istalgan odam webhook'ga so'rov yuborib, bir tiyin
 * to'lamasdan VIP tarifni ochib olishi mumkin edi.
 *
 * Kalit sozlanmagan bo'lsa webhook ishlamaydi — "kalitsiz ham o'tkazib
 * yuborish" ishlab chiqarishda xavfli.
 */
function verifyPaymeAuth(header: string | undefined): boolean {
  const key = env.billing.paymeKey.trim();
  if (!key) return false;

  const raw = (header ?? '').trim();
  if (!raw.toLowerCase().startsWith('basic ')) return false;

  const expected = Buffer.from(`Paycom:${key}`, 'utf8').toString('base64');
  const got = raw.slice(6).trim();
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(got, 'utf8');
  // Uzunlik farq qilsa timingSafeEqual xato tashlaydi — oldindan tekshiramiz
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** To'lov tasdiqlanganini bildiruvchi hodisami? */
function isPaidEvent(body: Record<string, unknown>): boolean {
  const method = asText(body.method)?.toLowerCase() ?? '';
  if (method) return method === 'performtransaction';
  const state = asNumber(body.state) ?? asNumber(asRecord(body.params).state);
  if (state === 2) return true;
  const status = asText(body.status)?.toLowerCase() ?? '';
  return ['paid', 'success', 'succeeded', 'confirmed', 'completed'].includes(status);
}

/** Bekor qilish hodisasimi? */
function isCancelEvent(body: Record<string, unknown>): boolean {
  const method = asText(body.method)?.toLowerCase() ?? '';
  if (method === 'canceltransaction') return true;
  const status = asText(body.status)?.toLowerCase() ?? '';
  return ['canceled', 'cancelled', 'failed', 'rejected'].includes(status);
}

/** Hisob-fakturani id bo'yicha topadi, bo'lmasa 404 */
async function requireInvoice(invoiceId: string | null) {
  if (!invoiceId) throw AppError.notFound('Hisob-faktura ko‘rsatilmagan');
  const invoice = await prisma.invoice.findUnique({ where: { id: invoiceId } });
  if (!invoice) throw AppError.notFound('Hisob-faktura topilmadi');
  return invoice;
}

/**
 * POST /webhook/payme — Payme chaqiruvi.
 * Soddalashtirilgan: `method` (PerformTransaction / CancelTransaction) yoki
 * `state`/`status` maydonlariga qarab ishlaydi. Noma'lum hisob → 404.
 */
router.post(
  '/webhook/payme',
  ah(async (req, res) => {
    if (!verifyPaymeAuth(req.header('authorization') ?? undefined)) {
      throw AppError.forbidden('Payme imzosi tekshiruvidan o‘tmadi');
    }

    const body = asRecord(req.body);
    const invoice = await requireInvoice(extractInvoiceId(body));

    // Summa MAJBURIY tekshiriladi (Payme tiyinda yuboradi).
    // Ilgari summa yuborilmasa tekshiruv butunlay o'tkazib yuborilardi.
    const params = asRecord(body.params);
    const rawAmount = asNumber(body.amount) ?? asNumber(params.amount);
    if (isPaidEvent(body) && rawAmount === null) {
      throw AppError.badRequest('To‘lov summasi ko‘rsatilmagan');
    }
    if (rawAmount !== null && Math.round(invoice.amount * 100) !== Math.round(rawAmount)) {
      throw AppError.badRequest('To‘lov summasi hisob-fakturaga mos kelmadi', {
        expected: Math.round(invoice.amount * 100),
        received: Math.round(rawAmount),
      });
    }

    const externalId = asText(body.id) ?? asText(params.id) ?? null;

    if (isCancelEvent(body)) {
      if (invoice.status === 'pending') {
        await prisma.invoice.update({
          where: { id: invoice.id },
          data: { status: 'canceled', ...(externalId ? { externalId } : {}) },
        });
        await releaseInvoiceBonus(invoice.id);
      }
      res.json({ ok: true, invoiceId: invoice.id, status: 'canceled', result: { state: -1 } });
      return;
    }

    if (!isPaidEvent(body)) {
      // CheckPerformTransaction / CreateTransaction — hisob mavjudligini tasdiqlaymiz
      res.json({
        ok: true,
        invoiceId: invoice.id,
        status: asInvoiceStatus(invoice.status),
        result: { allow: invoice.status === 'pending', state: invoice.status === 'paid' ? 2 : 1 },
      });
      return;
    }

    const result = await markInvoicePaid(invoice.id, { externalId, source: 'payme' });
    res.json({
      ok: true,
      invoiceId: invoice.id,
      status: 'paid',
      alreadyPaid: result.alreadyPaid,
      result: { state: 2, transaction: invoice.id, perform_time: Date.now() },
    });
  }),
);

/** Click imzosini tekshirish (CLICK_SECRET bo'lmasa tekshiruv o'tkazib yuboriladi) */
function verifyClickSign(body: Record<string, unknown>): boolean {
  const secret = env.billing.clickSecret.trim();
  // Kalit sozlanmagan bo'lsa webhook ishlamaydi — ilgari hamma so'rov o'tib ketardi
  if (!secret) return false;
  const sign = asText(body.sign_string);
  if (!sign) return false;
  // Click formulasi: click_trans_id + service_id + SECRET + merchant_trans_id
  // [+ merchant_prepare_id — faqat Complete bosqichida] + amount + action + sign_time
  const prepareId = asText(body.merchant_prepare_id);
  const raw = [
    asText(body.click_trans_id) ?? '',
    asText(body.service_id) ?? '',
    secret,
    asText(body.merchant_trans_id) ?? '',
    ...(prepareId ? [prepareId] : []),
    asText(body.amount) ?? '',
    asText(body.action) ?? '',
    asText(body.sign_time) ?? '',
  ].join('');
  const expected = crypto.createHash('md5').update(raw).digest('hex');
  return expected === sign.toLowerCase();
}

/**
 * POST /webhook/click — Click chaqiruvi.
 * `action=0` (Prepare) — hisobni tasdiqlaydi, `action=1` (Complete) — to'lovni yakunlaydi.
 * Javob Click formatiga yaqin: `error: 0` — muvaffaqiyat. Noma'lum hisob → 404.
 */
router.post(
  '/webhook/click',
  ah(async (req, res) => {
    const body = asRecord(req.body);

    // Imzo AVVAL tekshiriladi — imzosiz so'rov bazaga umuman yetib bormasin
    if (!verifyClickSign(body)) throw AppError.forbidden('Imzo tekshiruvidan o‘tmadi');

    const invoice = await requireInvoice(extractInvoiceId(body));

    // To'langan summa hisob-fakturaga mos kelishi shart
    const clickAmount = asNumber(body.amount);
    if (clickAmount !== null && Math.round(invoice.amount) !== Math.round(clickAmount)) {
      throw AppError.badRequest('To‘lov summasi hisob-fakturaga mos kelmadi', {
        expected: Math.round(invoice.amount),
        received: Math.round(clickAmount),
      });
    }

    const action = asNumber(body.action);
    const externalId = asText(body.click_trans_id);
    const error = asNumber(body.error) ?? 0;

    const base = {
      click_trans_id: externalId,
      merchant_trans_id: invoice.id,
      merchant_prepare_id: invoice.id,
      error: 0,
      error_note: 'Success',
    };

    // Click xatolik bilan chaqirsa yoki bekor qilinsa
    if (error < 0 || isCancelEvent(body)) {
      if (invoice.status === 'pending') {
        await prisma.invoice.update({
          where: { id: invoice.id },
          data: { status: 'canceled', ...(externalId ? { externalId } : {}) },
        });
        await releaseInvoiceBonus(invoice.id);
      }
      res.json({ ...base, ok: true, status: 'canceled' });
      return;
    }

    // Prepare bosqichi — faqat hisob mavjudligini tasdiqlaymiz
    if (action === 0) {
      res.json({ ...base, ok: true, status: asInvoiceStatus(invoice.status) });
      return;
    }

    const result = await markInvoicePaid(invoice.id, { externalId, source: 'click' });
    res.json({
      ...base,
      merchant_confirm_id: invoice.id,
      ok: true,
      status: 'paid',
      alreadyPaid: result.alreadyPaid,
    });
  }),
);

// ─────────────────────────── Avtorizatsiya talab qiladigan qism ───────────────────────────

router.use(requireAuth);

/** GET /plans — barcha tariflar (kompaniya bo'lmasa ham ochiq) */
router.get(
  '/plans',
  ah(async (req, res) => {
    const { user } = ctx(req);
    const membership = await prisma.membership.findFirst({
      where: { userId: user.id },
      orderBy: { createdAt: 'asc' },
      select: { companyId: true },
    });
    const current = membership ? await currentPlanOf(membership.companyId) : null;

    const payload: PlanPublic[] = PLAN_ORDER.map((id) => toPlanPublic(id, current));
    res.json(payload);
  }),
);

router.use(requireCompany);

// ─────────────────────────── GET /subscription ───────────────────────────

interface SubscriptionResponse extends SubscriptionSummary {
  planName: string;
  price: number;
  limits: {
    stores: number;
    cabinets: number;
    members: number;
    historyDays: number;
    syncIntervalMinutes: number;
    autoReplyPerDay: number;
    used: { stores: number; cabinets: number; members: number };
  };
  /** Referal bonus qoldig'i (obuna to'lovida ishlatish mumkin) */
  bonusBalance: number;
  /** Kutilayotgan (to'lanmagan) hisob-faktura */
  pendingInvoice: InvoiceRow | null;
  /** Muddati tugashiga 5 kundan kam qolganda ogohlantirish */
  expiringSoon: boolean;
}

router.get(
  '/subscription',
  ah(async (req, res) => {
    const { user, company } = companyCtx(req);

    const [sub, storesUsed, cabinetsUsed, membersUsed, pending, bonus] = await Promise.all([
      prisma.subscription.findUnique({ where: { companyId: company.id } }),
      prisma.store.count({ where: { companyId: company.id } }),
      prisma.uzumAccount.count({ where: { companyId: company.id } }),
      prisma.membership.count({ where: { companyId: company.id } }),
      prisma.invoice.findFirst({
        where: { companyId: company.id, status: 'pending' },
        orderBy: { createdAt: 'desc' },
      }),
      getBonusStats(user.id),
    ]);

    const now = new Date();
    const active = Boolean(sub && sub.status === 'active' && sub.expiresAt.getTime() > now.getTime());
    const planId: PlanId = sub ? getPlan(sub.plan).id : 'trial';
    const plan = PLANS[active ? planId : 'trial'];
    const daysLeft = sub ? daysLeftOf(sub.expiresAt) : 0;

    // Obuna yozuvi bo'lmasa — 200 va bo'sh (nol) qiymatlar
    const status: SubscriptionSummary['status'] = !sub
      ? 'pending'
      : sub.canceledAt
        ? 'canceled'
        : active
          ? 'active'
          : 'expired';

    const payload: SubscriptionResponse = {
      plan: planId,
      status,
      startedAt: (sub?.startedAt ?? now).toISOString(),
      expiresAt: (sub?.expiresAt ?? now).toISOString(),
      daysLeft,
      autoRenew: sub?.autoRenew ?? false,
      isTrial: planId === 'trial',
      planName: plan.name,
      price: plan.price,
      limits: {
        stores: plan.limits.stores,
        cabinets: plan.limits.cabinets,
        members: plan.limits.members,
        historyDays: plan.limits.historyDays,
        syncIntervalMinutes: plan.limits.syncIntervalMinutes,
        autoReplyPerDay: plan.limits.autoReplyPerDay,
        used: { stores: storesUsed, cabinets: cabinetsUsed, members: membersUsed },
      },
      bonusBalance: bonus.balance,
      pendingInvoice: pending ? toInvoiceRow(pending) : null,
      expiringSoon: active && daysLeft <= 5,
    };

    res.json(payload);
  }),
);

// ─────────────────────────── POST /subscribe ───────────────────────────

interface SubscribeResponse extends InvoiceRow {
  /** To'lovni qanday amalga oshirish kerakligi (o'zbekcha ko'rsatma) */
  instruction: string;
  /** To'lov tizimi sozlanganmi (yo'q bo'lsa qo'lda tasdiqlanadi) */
  providerConfigured: boolean;
  /** Bonusdan yechilgan summa */
  bonusUsed: number;
  /** Bonusdan keyingi qoldiq */
  bonusBalance: number;
  /** Chegirmasiz summa (yillik chegirmani ko'rsatish uchun) */
  grossAmount: number;
  message: string;
}

router.post(
  '/subscribe',
  requireRole('owner'),
  ah(async (req, res) => {
    const { user, company } = companyCtx(req);
    const input = subscribeSchema.parse(req.body ?? {});
    const plan = PLANS[input.plan];

    // Chegirmali narx (12 oydan boshlab yillik chegirma qo'llanadi)
    const gross = plan.price * input.months;
    const price = planPrice(plan.id, input.months);
    if (price <= 0) throw AppError.badRequest('Bu tarif uchun to‘lov talab qilinmaydi');

    // Kutilayotgan eski hisoblar bekor qilinadi — bir vaqtda bitta ochiq hisob
    const stale = await prisma.invoice.findMany({
      where: { companyId: company.id, status: 'pending' },
      select: { id: true },
    });
    for (const s of stale) {
      await prisma.invoice.update({ where: { id: s.id }, data: { status: 'canceled' } });
      await releaseInvoiceBonus(s.id);
    }

    const invoice = await prisma.invoice.create({
      data: {
        companyId: company.id,
        plan: plan.id,
        months: input.months,
        amount: price,
        currency: company.currency,
        provider: input.provider,
        status: 'pending',
        comment: `${plan.name} tarifi — ${input.months} oy`,
      },
    });

    // Referal bonusidan foydalanish (so'ralgan bo'lsa)
    let bonusUsed = 0;
    if (input.useBonus) {
      bonusUsed = await spendBonus({
        userId: user.id,
        companyId: company.id,
        invoiceId: invoice.id,
        amount: price,
      });
    }

    const payable = round(Math.max(0, price - bonusUsed));
    const link = buildPayLink(input.provider, invoice.id, payable);

    const updated = await prisma.invoice.update({
      where: { id: invoice.id },
      data: { amount: payable, bonusUsed, payUrl: link.payUrl },
    });

    // Bonus summani to'liq qoplasa — darhol faollashtiramiz
    let invoiceRow = toInvoiceRow(updated);
    if (payable <= 0) {
      const paid = await markInvoicePaid(invoice.id, { source: 'bonus' });
      invoiceRow = paid.invoice;
    } else if (input.provider === 'manual' || !link.configured) {
      // Qo'lda to'lov — administrator tasdiqlaydi
      await notifyAdmins({
        type: 'info',
        title: 'Yangi to‘lov kutilmoqda',
        body: `${company.name} — “${plan.name}” (${input.months} oy), ${formatMoney(payable, 'uz')}. Tasdiqlash: admin panel.`,
        link: '/admin',
      });
    }

    const bonus = await getBonusStats(user.id);

    const payload: SubscribeResponse = {
      ...invoiceRow,
      instruction: link.instruction,
      providerConfigured: link.configured,
      bonusUsed: round(bonusUsed),
      bonusBalance: bonus.balance,
      grossAmount: round(gross),
      message:
        payable <= 0
          ? `“${plan.name}” tarifi bonus hisobidan faollashtirildi`
          : `${formatMoney(payable, 'uz')} to‘lov uchun hisob yaratildi`,
    };

    res.status(201).json(payload);
  }),
);

// ─────────────────────────── GET /invoices ───────────────────────────

router.get(
  '/invoices',
  ah(async (req, res) => {
    const { company } = companyCtx(req);
    const q = req.query as Record<string, string | undefined>;
    const page = Math.max(1, Number(q.page ?? 1) || 1);
    const pageSize = Math.min(200, Math.max(1, Number(q.pageSize ?? 30) || 30));
    const status = q.status && (INVOICE_STATUSES as readonly string[]).includes(q.status) ? q.status : undefined;

    const where: Prisma.InvoiceWhereInput = { companyId: company.id, ...(status ? { status } : {}) };

    const [total, rows] = await Promise.all([
      prisma.invoice.count({ where }),
      prisma.invoice.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    const payload: Paginated<InvoiceRow> = {
      items: rows.map(toInvoiceRow),
      total,
      page,
      pageSize,
      pages: Math.max(1, Math.ceil(total / pageSize)),
    };
    res.json(payload);
  }),
);

// ─────────────────────────── POST /invoices/:id/cancel ───────────────────────────

router.post(
  '/invoices/:id/cancel',
  requireRole('owner'),
  ah(async (req, res) => {
    const { company } = companyCtx(req);
    const id = String(req.params.id);

    const invoice = await prisma.invoice.findFirst({ where: { id, companyId: company.id } });
    if (!invoice) throw AppError.notFound('Hisob-faktura topilmadi');
    if (invoice.status === 'paid') throw AppError.conflict('To‘langan hisobni bekor qilib bo‘lmaydi');

    // Idempotent: allaqachon bekor qilingan bo'lsa shunchaki qaytaramiz
    if (invoice.status === 'canceled') {
      res.json({ ...toInvoiceRow(invoice), message: 'Hisob allaqachon bekor qilingan' });
      return;
    }

    const updated = await prisma.invoice.update({ where: { id: invoice.id }, data: { status: 'canceled' } });
    const released = await releaseInvoiceBonus(invoice.id);

    res.json({
      ...toInvoiceRow(updated),
      message:
        released > 0
          ? `Hisob bekor qilindi, ${formatMoney(invoice.bonusUsed, 'uz')} bonus balansga qaytarildi`
          : 'Hisob bekor qilindi',
    });
  }),
);

export default router;
