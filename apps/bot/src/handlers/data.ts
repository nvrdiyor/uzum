/**
 * Bot uchun ma'lumot qatlami — barcha so'rovlar shu yerda.
 *
 * Handler'lar bazaga to'g'ridan-to'g'ri murojaat qilmaydi: shunda hisob-kitob mantiqi
 * bitta joyda bo'ladi va kunlik hisobot (jobs/daily.ts) bilan «📊 Bugungi hisobot»
 * bir xil formuladan foydalanadi.
 *
 * Ma'lumot bo'lmasa xato emas — nol qiymatlar va bo'sh ro'yxat qaytadi.
 */
import {
  FIRST_SYNC_SECONDS,
  LOGIN_CODE_TTL_MINUTES,
  REFERRAL_PERCENT,
  STOCK_THRESHOLDS,
  SYNC_STEPS,
  TRIAL_DAYS,
  getPlan,
  type PlanId,
} from '@savdoiq/shared';
import { prisma } from '../lib/db.js';
import { env } from '../lib/env.js';
import { encryptSecret, randomCode } from '../crypto.js';
import type { BotLang } from '../i18n.js';

const DAY_MS = 86_400_000;
/** O'rtacha kunlik sotuvni hisoblash oynasi (kun) */
const AVG_WINDOW_DAYS = 30;
/** Qoldiq snapshot'ini qidirish chuqurligi (kun) */
const STOCK_LOOKBACK_DAYS = 30;

// ─────────────────────────── Mahalliy vaqt (Asia/Tashkent) ───────────────────────────

const OFFSET_MS = env.timezoneOffsetMinutes * 60_000;

/** Mahalliy kun boshi (UTC Date ko'rinishida). `shiftDays: -1` → kecha. */
export function localDayStart(now: Date, shiftDays = 0): Date {
  const shifted = new Date(now.getTime() + OFFSET_MS);
  const start = Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate() + shiftDays);
  return new Date(start - OFFSET_MS);
}

/** Mahalliy sana kaliti: 2026-09-04 */
export function localDateKey(now: Date, shiftDays = 0): string {
  const shifted = new Date(now.getTime() + OFFSET_MS + shiftDays * DAY_MS);
  const y = shifted.getUTCFullYear();
  const m = String(shifted.getUTCMonth() + 1).padStart(2, '0');
  const d = String(shifted.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Mahalliy soat (0..23) */
export function localHour(now: Date): number {
  return new Date(now.getTime() + OFFSET_MS).getUTCHours();
}

/** Ko'rsatish uchun sana: 04.09.2026 */
export function displayDate(key: string): string {
  const [y, m, d] = key.split('-');
  return d && m && y ? `${d}.${m}.${y}` : key;
}

// ─────────────────────────── Do'konlar ───────────────────────────

export async function getStoreIds(companyId: string): Promise<string[]> {
  const stores = await prisma.store.findMany({ where: { companyId }, select: { id: true } });
  return stores.map((s) => s.id);
}

// ─────────────────────────── Kunlik hisobot ───────────────────────────

export interface TopProduct {
  title: string;
  revenue: number;
  units: number;
}

export interface DayReport {
  revenue: number;
  orders: number;
  units: number;
  netProfit: number;
  avgCheck: number;
  top: TopProduct[];
}

const EMPTY_REPORT: DayReport = { revenue: 0, orders: 0, units: 0, netProfit: 0, avgCheck: 0, top: [] };

/**
 * Bir kunlik (yoki ixtiyoriy davr) natijalari: tushum, buyurtma, sof foyda,
 * o'rtacha chek va top mahsulotlar. Bekor qilingan/qaytarilgan pozitsiyalar hisobga olinmaydi.
 */
export async function buildDayReport(
  companyId: string,
  from: Date,
  toExclusive: Date,
  topLimit = 3,
): Promise<DayReport> {
  const storeIds = await getStoreIds(companyId);
  if (storeIds.length === 0) return { ...EMPTY_REPORT, top: [] };

  const items = await prisma.orderItem.findMany({
    where: { orderedAt: { gte: from, lt: toExclusive }, order: { storeId: { in: storeIds } } },
    select: {
      orderId: true,
      skuId: true,
      skuCode: true,
      title: true,
      qty: true,
      revenue: true,
      netProfit: true,
      status: true,
      returnedAt: true,
    },
  });

  let revenue = 0;
  let netProfit = 0;
  let units = 0;
  const orderIds = new Set<string>();
  const byProduct = new Map<string, { title: string | null; skuId: string | null; revenue: number; units: number }>();

  for (const it of items) {
    const returned = it.status === 'returned' || Boolean(it.returnedAt);
    if (returned || it.status === 'canceled') continue;

    revenue += it.revenue;
    netProfit += it.netProfit;
    units += it.qty;
    orderIds.add(it.orderId);

    // Variantlar bitta mahsulot ostida jamlanadi (nom bo'yicha), nom bo'lmasa SKU bo'yicha
    const key = it.title ?? it.skuId ?? it.skuCode ?? 'unknown';
    const row = byProduct.get(key) ?? { title: it.title, skuId: it.skuId, revenue: 0, units: 0 };
    row.revenue += it.revenue;
    row.units += it.qty;
    if (!row.title && it.title) row.title = it.title;
    byProduct.set(key, row);
  }

  const orders = orderIds.size;
  const topRows = [...byProduct.values()].sort((a, b) => b.revenue - a.revenue).slice(0, topLimit);

  // Nomi yo'q pozitsiyalar uchun SKU katalogidan nom olamiz
  const missingIds = topRows.filter((r) => !r.title && r.skuId).map((r) => r.skuId as string);
  const titles = new Map<string, string>();
  if (missingIds.length > 0) {
    const skus = await prisma.sku.findMany({
      where: { id: { in: missingIds } },
      select: { id: true, title: true, sku: true },
    });
    for (const s of skus) titles.set(s.id, s.title || s.sku);
  }

  return {
    revenue: Math.round(revenue),
    orders,
    units,
    netProfit: Math.round(netProfit),
    avgCheck: orders > 0 ? Math.round(revenue / orders) : 0,
    top: topRows.map((r) => ({
      title: r.title ?? (r.skuId ? (titles.get(r.skuId) ?? '—') : '—'),
      revenue: Math.round(r.revenue),
      units: r.units,
    })),
  };
}

/** Bugungi hisobot (mahalliy kun bo'yicha) */
export function todayRange(now = new Date()): { from: Date; to: Date; key: string } {
  return { from: localDayStart(now), to: localDayStart(now, 1), key: localDateKey(now) };
}

/** Kechagi hisobot (kunlik yuborish uchun) */
export function yesterdayRange(now = new Date()): { from: Date; to: Date; key: string } {
  return { from: localDayStart(now, -1), to: localDayStart(now), key: localDateKey(now, -1) };
}

// ─────────────────────────── Kritik qoldiqlar ───────────────────────────

export interface StockAlertRow {
  title: string;
  stock: number;
  daysLeft: number;
}

export interface StockAlert {
  rows: StockAlertRow[];
  total: number;
}

/**
 * Qoldig'i `STOCK_THRESHOLDS.critical` (7) kundan kam qolgan SKU'lar.
 * Faqat sotuvi bor tovarlar tekshiriladi — harakatsiz tovarlar bu ro'yxatga tushmaydi.
 */
export async function buildCriticalStocks(companyId: string, limit = 10): Promise<StockAlert> {
  const storeIds = await getStoreIds(companyId);
  if (storeIds.length === 0) return { rows: [], total: 0 };

  const now = Date.now();

  const [sales, snapshots] = await Promise.all([
    prisma.orderItem.findMany({
      where: {
        orderedAt: { gte: new Date(now - AVG_WINDOW_DAYS * DAY_MS) },
        order: { storeId: { in: storeIds } },
        status: { notIn: ['canceled', 'returned'] },
      },
      select: { skuId: true, qty: true },
    }),
    prisma.stockSnapshot.findMany({
      where: { storeId: { in: storeIds }, date: { gte: new Date(now - STOCK_LOOKBACK_DAYS * DAY_MS) } },
      orderBy: { date: 'desc' },
      select: { skuId: true, fbo: true, fbs: true, own: true },
    }),
  ]);

  const soldBySku = new Map<string, number>();
  for (const s of sales) {
    if (!s.skuId) continue;
    soldBySku.set(s.skuId, (soldBySku.get(s.skuId) ?? 0) + s.qty);
  }

  const stockBySku = new Map<string, number>();
  for (const snap of snapshots) {
    if (stockBySku.has(snap.skuId)) continue; // eng yangi snapshot birinchi keladi
    stockBySku.set(snap.skuId, snap.fbo + snap.fbs + snap.own);
  }

  interface Candidate {
    skuId: string;
    stock: number;
    daysLeft: number;
  }
  const candidates: Candidate[] = [];

  for (const [skuId, sold] of soldBySku) {
    const avgDaily = sold / AVG_WINDOW_DAYS;
    if (avgDaily <= 0) continue;
    const stock = stockBySku.get(skuId);
    if (stock === undefined) continue; // qoldiq ma'lumoti yo'q — ogohlantirmaymiz
    const daysLeft = Math.floor(stock / avgDaily);
    if (daysLeft <= STOCK_THRESHOLDS.critical) candidates.push({ skuId, stock, daysLeft });
  }

  candidates.sort((a, b) => a.daysLeft - b.daysLeft || a.stock - b.stock);
  const visible = candidates.slice(0, limit);

  const skus = await prisma.sku.findMany({
    where: { id: { in: visible.map((c) => c.skuId) } },
    select: { id: true, title: true, sku: true, product: { select: { title: true } } },
  });
  const titles = new Map(skus.map((s) => [s.id, s.title || s.product.title || s.sku]));

  return {
    total: candidates.length,
    rows: visible.map((c) => ({
      title: titles.get(c.skuId) ?? '—',
      stock: c.stock,
      daysLeft: c.daysLeft,
    })),
  };
}

// ─────────────────────────── Saytga kirish kodi ───────────────────────────

export interface LoginTicket {
  code: string;
  url: string;
  minutes: number;
}

/** Bir martalik kod (10 daqiqa) va kirish havolasi */
export async function createLoginCode(userId: string, telegramId: string): Promise<LoginTicket> {
  // Eskirgan kodlarni tozalaymiz va oldingi kutilayotganlarini bekor qilamiz
  await prisma.loginCode.deleteMany({ where: { expiresAt: { lt: new Date() } } });
  await prisma.loginCode.updateMany({
    where: { userId, status: 'pending' },
    data: { status: 'canceled', consumedAt: new Date() },
  });

  let code = randomCode(6);
  for (let i = 0; i < 10; i += 1) {
    const busy = await prisma.loginCode.findUnique({ where: { code }, select: { id: true } });
    if (!busy) break;
    code = randomCode(6);
  }

  await prisma.loginCode.create({
    data: {
      code,
      userId,
      telegramId,
      purpose: 'login',
      status: 'pending',
      expiresAt: new Date(Date.now() + LOGIN_CODE_TTL_MINUTES * 60_000),
    },
  });

  return {
    code,
    url: `${env.webUrl}/login?code=${code}`,
    minutes: LOGIN_CODE_TTL_MINUTES,
  };
}

// ─────────────────────────── Tarif ───────────────────────────

export interface BillingInfo {
  plan: PlanId;
  planName: string;
  status: string;
  expiresAt: Date;
  daysLeft: number;
  expired: boolean;
}

export async function loadBilling(companyId: string): Promise<BillingInfo | null> {
  const sub = await prisma.subscription.findUnique({ where: { companyId } });
  if (!sub) return null;

  const plan = getPlan(sub.plan);
  const msLeft = sub.expiresAt.getTime() - Date.now();
  const expired = msLeft <= 0 || sub.status !== 'active';

  return {
    plan: plan.id,
    planName: plan.name,
    status: sub.status,
    expiresAt: sub.expiresAt,
    daysLeft: Math.max(0, Math.ceil(msLeft / DAY_MS)),
    expired,
  };
}

// ─────────────────────────── Referal ───────────────────────────

export interface ReferralInfo {
  code: string;
  link: string;
  botLink: string;
  percent: number;
  invited: number;
  paying: number;
  earned: number;
  pending: number;
  paid: number;
}

export async function loadReferral(userId: string, code: string): Promise<ReferralInfo> {
  const [invited, bonuses] = await Promise.all([
    prisma.user.count({ where: { referredById: userId } }),
    prisma.referralBonus.findMany({
      where: { referrerId: userId },
      select: { amount: true, status: true, companyId: true },
    }),
  ]);

  let earned = 0;
  let pending = 0;
  let paid = 0;
  const payingCompanies = new Set<string>();

  for (const b of bonuses) {
    earned += b.amount;
    if (b.status === 'paid') paid += b.amount;
    else pending += b.amount;
    payingCompanies.add(b.companyId);
  }

  return {
    code,
    link: `${env.webUrl}/?ref=${code}`,
    botLink: `https://t.me/${env.telegram.botUsername}?start=ref_${code}`,
    percent: REFERRAL_PERCENT,
    invited,
    paying: payingCompanies.size,
    earned: Math.round(earned),
    pending: Math.round(pending),
    paid: Math.round(paid),
  };
}

/** Referal kod bo'yicha taklif qilgan foydalanuvchi */
export async function findReferrer(code: string): Promise<string | null> {
  const clean = code.trim().toUpperCase();
  if (!clean) return null;
  const user = await prisma.user.findUnique({ where: { referralCode: clean }, select: { id: true } });
  return user?.id ?? null;
}

// ─────────────────────────── Ro'yxatdan o'tish qadamlari ───────────────────────────

/** Telefon raqamini saqlash */
export async function savePhone(userId: string, phone: string): Promise<void> {
  await prisma.user.update({ where: { id: userId }, data: { phone: phone.slice(0, 32) } });
}

/** Kompaniya + a'zolik (owner) + 7 kunlik sinov obunasi */
export async function createCompany(userId: string, name: string): Promise<string> {
  const now = new Date();
  return prisma.$transaction(async (tx) => {
    const company = await tx.company.create({
      data: { name: name.slice(0, 60), onboardStep: 'tax', onboarded: false },
      select: { id: true },
    });
    await tx.membership.create({ data: { userId, companyId: company.id, role: 'owner' } });
    await tx.subscription.create({
      data: {
        companyId: company.id,
        plan: 'trial',
        status: 'active',
        startedAt: now,
        expiresAt: new Date(now.getTime() + TRIAL_DAYS * DAY_MS),
        autoRenew: false,
        trialUsed: true,
      },
    });
    return company.id;
  });
}

/** Soliq stavkasi (%) — keyingi qadam API kalit */
export async function saveTaxRate(companyId: string, taxRate: number): Promise<void> {
  await prisma.company.update({ where: { id: companyId }, data: { taxRate, onboardStep: 'api_key' } });
}

/**
 * Uzum API kalitini ulash: kalit shifrlanadi, kabinet yaratiladi (yoki yangilanadi)
 * va to'liq sinxronizatsiya navbatga qo'yiladi.
 */
export async function connectApiKey(companyId: string, apiKey: string): Promise<{ accountId: string }> {
  const key = apiKey.trim();
  const existing = await prisma.uzumAccount.findFirst({
    where: { companyId },
    orderBy: { createdAt: 'asc' },
    select: { id: true },
  });

  const data = {
    apiKeyEnc: encryptSecret(key),
    keyHint: key.slice(-4),
    status: 'pending',
    lastError: null,
  };

  const account = existing
    ? await prisma.uzumAccount.update({ where: { id: existing.id }, data, select: { id: true } })
    : await prisma.uzumAccount.create({
        data: { companyId, label: 'Uzum kabinet', ...data },
        select: { id: true },
      });

  await prisma.syncJob.create({
    data: {
      companyId,
      uzumAccountId: account.id,
      type: 'full',
      status: 'queued',
      progress: 0,
      step: 'queued',
      stepIndex: 0,
      totalSteps: SYNC_STEPS.length,
      etaSeconds: FIRST_SYNC_SECONDS,
      scheduledAt: new Date(),
    },
  });

  await prisma.company.update({
    where: { id: companyId },
    data: { onboardStep: 'syncing', onboarded: true },
  });

  return { accountId: account.id };
}

// ─────────────────────────── Sozlamalar ───────────────────────────

export type NotifyField = 'notifyDaily' | 'notifyOrders' | 'notifyStock';

/** Bildirishnoma sozlamasini teskarisiga o'zgartiradi va yangi qiymatni qaytaradi */
export async function toggleNotify(userId: string, field: NotifyField): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { notifyDaily: true, notifyOrders: true, notifyStock: true },
  });
  if (!user) return false;
  const next = !user[field];
  await prisma.user.update({
    where: { id: userId },
    data:
      field === 'notifyDaily'
        ? { notifyDaily: next }
        : field === 'notifyOrders'
          ? { notifyOrders: next }
          : { notifyStock: next },
  });
  return next;
}

export async function setLanguage(userId: string, lang: BotLang): Promise<void> {
  await prisma.user.update({ where: { id: userId }, data: { languageCode: lang } });
}
