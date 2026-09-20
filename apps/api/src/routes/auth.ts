/**
 * Autentifikatsiya moduli — /api/v1/auth
 *
 *  POST /telegram    → Telegram Login Widget imzosi bilan kirish
 *  POST /bot-code    → botdan olingan bir martalik kod bilan kirish
 *  POST /miniapp     → Telegram Mini App (initData) orqali kirish
 *  POST /demo        → demo kirish (bot tokeni sozlanmaganda saytni sinash uchun)
 *  GET  /otl/:token  → bir martalik havola, saytning /auth/callback sahifasiga qaytaradi
 *  GET  /me          → joriy sessiya konteksti (MeResponse)
 *  POST /logout      → sessiyani bekor qilish
 *
 * Sessiya tokeni ikki yo'l bilan beriladi: javobdagi `token` (Bearer sarlavhasi uchun)
 * va `sq_session` httpOnly cookie'si. Kirish marshrutlariga qat'iyroq rate limit qo'llanadi.
 *
 * Bu fayldagi `toAuthUser` / `toCompanySummary` / `toSubscriptionSummary` / `ensureSubscription`
 * yordamchilari boshqa modullarda (company.ts) ham ishlatiladi.
 */
import { Router, type Request, type Response } from 'express';
import rateLimit from 'express-rate-limit';
import { prisma } from '@savdoiq/db';
import type { Company, Subscription, User } from '@savdoiq/db';
import {
  FEATURE_IDS,
  PLAN_ORDER,
  TRIAL_DAYS,
  adminLoginSchema,
  botCodeSchema,
  featureAccess,
  getPlan,
  telegramAuthSchema,
  type AuthUser,
  type CompanySummary,
  type FeatureAccess,
  type FeatureId,
  type Lang,
  type LoginResponse,
  type MeResponse,
  type PlanId,
  type StoreSummary,
  type SubscriptionSummary,
  type SyncStatus,
} from '@savdoiq/shared';
import { AppError, ah } from '../lib/errors.js';
import { SESSION_COOKIE, createSession, ctx, requireAuth, revokeSession } from '../lib/auth.js';
import {
  hashPassword,
  randomReferralCode,
  verifyPassword,
  verifyTelegramInitData,
  verifyTelegramLogin,
} from '../lib/crypto.js';
import { getSyncStatus } from '../services/sync.js';
import { env } from '../env.js';

const router = Router();

/** Seed yaratadigan demo foydalanuvchi (telegramId) */
const DEMO_TELEGRAM_ID = '100000001';

/**
 * Kirish marshrutlari uchun qat'iyroq chegara: bitta IP'dan daqiqasiga 20 urinish.
 * Umumiy chegara `app.ts` da (300/daqiqa) alohida qo'llanadi.
 */
const loginLimiter = rateLimit({
  windowMs: 60_000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: {
      code: 'too_many_requests',
      message: 'Kirishga urinishlar juda ko‘p — bir daqiqadan so‘ng qayta urinib ko‘ring',
    },
  },
});

// ─────────────────────────── Umumiy yordamchilar ───────────────────────────

const LANGS: Lang[] = ['uz', 'ru', 'en'];
const ONBOARD_STEPS: CompanySummary['onboardStep'][] = ['company', 'tax', 'api_key', 'syncing', 'done'];
const MEMBER_ROLES: CompanySummary['role'][] = ['owner', 'manager', 'viewer'];
const SUB_STATUSES: SubscriptionSummary['status'][] = ['active', 'expired', 'canceled', 'pending'];

/** Bazadagi til kodini `Lang` ga keltiradi (notanish qiymat → 'uz') */
export function asLang(value: string | null | undefined): Lang {
  return LANGS.includes(value as Lang) ? (value as Lang) : 'uz';
}

/** Onboarding bosqichini xavfsiz o'qish */
function asOnboardStep(value: string | null | undefined): CompanySummary['onboardStep'] {
  return ONBOARD_STEPS.includes(value as CompanySummary['onboardStep'])
    ? (value as CompanySummary['onboardStep'])
    : 'company';
}

/** A'zolik rolini xavfsiz o'qish (notanish qiymat → eng cheklangan rol) */
export function asMemberRole(value: string | null | undefined): CompanySummary['role'] {
  return MEMBER_ROLES.includes(value as CompanySummary['role'])
    ? (value as CompanySummary['role'])
    : 'viewer';
}

/** Prisma `User` → API `AuthUser` */
export function toAuthUser(u: User): AuthUser {
  return {
    id: u.id,
    telegramId: u.telegramId,
    username: u.username,
    firstName: u.firstName,
    lastName: u.lastName,
    photoUrl: u.photoUrl,
    phone: u.phone,
    language: asLang(u.languageCode),
    role: u.role === 'admin' ? 'admin' : 'user',
    referralCode: u.referralCode,
    createdAt: u.createdAt.toISOString(),
  };
}

/** Prisma `Company` + rol → API `CompanySummary` */
export function toCompanySummary(c: Company, role: string): CompanySummary {
  return {
    id: c.id,
    name: c.name,
    taxRate: c.taxRate,
    currency: c.currency,
    onboarded: c.onboarded,
    onboardStep: asOnboardStep(c.onboardStep),
    role: asMemberRole(role),
  };
}

/** Prisma `Subscription` → API `SubscriptionSummary` (daysLeft bilan) */
export function toSubscriptionSummary(s: Subscription | null): SubscriptionSummary | null {
  if (!s) return null;
  const expired = s.expiresAt.getTime() <= Date.now();
  const raw = s.status as SubscriptionSummary['status'];
  const status: SubscriptionSummary['status'] = s.canceledAt
    ? 'canceled'
    : expired
      ? 'expired'
      : SUB_STATUSES.includes(raw)
        ? raw
        : 'active';

  return {
    plan: getPlan(s.plan).id,
    status,
    startedAt: s.startedAt.toISOString(),
    expiresAt: s.expiresAt.toISOString(),
    daysLeft: Math.max(0, Math.ceil((s.expiresAt.getTime() - Date.now()) / 86_400_000)),
    autoRenew: s.autoRenew,
    isTrial: getPlan(s.plan).id === 'trial',
  };
}

/** Aktiv tarif: muddati o'tgan yoki bekor qilingan obuna → 'trial' */
export function activePlan(s: Subscription | null): PlanId {
  // Obuna yozuvi yo'q — hali ochilmagan, sinov beriladi
  if (!s) return 'trial';
  const active = s.status === 'active' && !s.canceledAt && s.expiresAt.getTime() > Date.now();
  if (active) return getPlan(s.plan).id;
  /*
   * Muddati tugagan yoki bekor qilingan obuna 'expired' bo'ladi — ilgari
   * 'trial' ga qaytarilardi va sinovda deyarli hamma narsa ochiq bo'lgani
   * uchun to'lovni to'xtatgan mijoz bemalol ishlab yuraverardi.
   */
  return 'expired';
}

/**
 * Kompaniyaning obunasi: yo'q bo'lsa avtomatik 7 kunlik sinov ochiladi.
 * Parallel so'rovlarda unique konflikt bo'lsa — mavjud yozuv qaytariladi.
 */
export async function ensureSubscription(companyId: string): Promise<Subscription> {
  const existing = await prisma.subscription.findUnique({ where: { companyId } });
  if (existing) return existing;

  const startedAt = new Date();
  try {
    return await prisma.subscription.create({
      data: {
        companyId,
        plan: 'trial',
        status: 'active',
        startedAt,
        expiresAt: new Date(startedAt.getTime() + TRIAL_DAYS * 86_400_000),
        autoRenew: false,
        trialUsed: true,
      },
    });
  } catch {
    const again = await prisma.subscription.findUnique({ where: { companyId } });
    if (again) return again;
    throw AppError.internal('Sinov obunasini ochib bo‘lmadi');
  }
}

/** Tarif bo'yicha funksiyalar xaritasi (MeResponse.features) */
export function featureMap(plan: PlanId): Record<FeatureId, FeatureAccess> {
  return FEATURE_IDS.reduce(
    (acc, f) => {
      acc[f] = featureAccess(plan, f);
      return acc;
    },
    {} as Record<FeatureId, FeatureAccess>,
  );
}

/** Sayt manzili (oxiridagi '/' olib tashlanadi) */
function webBase(): string {
  return env.webUrl.replace(/\/+$/, '');
}

/** Sessiya cookie'si — httpOnly, sameSite 'lax', HTTPS faqat prodda */
function setSessionCookie(res: Response, token: string, expiresAt: Date): void {
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: env.isProd,
    expires: expiresAt,
    path: '/',
  });
}

function clearSessionCookie(res: Response): void {
  res.clearCookie(SESSION_COOKIE, {
    httpOnly: true,
    sameSite: 'lax',
    secure: env.isProd,
    path: '/',
  });
}

/** Sarlavha yoki cookie'dan sessiya tokenini oladi */
function readToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) return header.slice(7).trim();
  const cookies = (req as Request & { cookies?: Record<string, string> }).cookies;
  return cookies?.[SESSION_COOKIE] ?? null;
}

/** Audit yozuvi — asosiy oqimni hech qachon to'xtatmaydi */
async function audit(userId: string, action: string, req: Request, meta?: string): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        userId,
        action,
        entity: 'session',
        meta: meta ?? null,
        ip: req.ip?.slice(0, 60) ?? null,
      },
    });
  } catch {
    /* audit muhim emas — jimgina o'tkazib yuboramiz */
  }
}

// ─────────────────────────── Foydalanuvchi yaratish ───────────────────────────

interface TelegramProfile {
  telegramId: string;
  username?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  photoUrl?: string | null;
  language?: string | null;
  /** Bot chat id (odatda telegramId bilan bir xil) */
  chatId?: string | null;
}

/** Takrorlanmas referal kodi */
async function uniqueReferralCode(): Promise<string> {
  for (let i = 0; i < 10; i += 1) {
    const code = randomReferralCode();
    const busy = await prisma.user.findUnique({ where: { referralCode: code }, select: { id: true } });
    if (!busy) return code;
  }
  // Nazariy jihatdan yetib kelmaydi — baribir noyob qiymat qaytaramiz
  return `${randomReferralCode()}${Date.now().toString(36).slice(-3).toUpperCase()}`;
}

/** Referal kodi bo'yicha taklif qilgan foydalanuvchini topadi (o'zini o'zi taklif qila olmaydi) */
async function resolveReferrer(ref: string | null | undefined, selfId?: string): Promise<string | null> {
  const code = ref?.trim().toUpperCase();
  if (!code) return null;
  const referrer = await prisma.user.findFirst({ where: { referralCode: code }, select: { id: true } });
  if (!referrer || referrer.id === selfId) return null;
  return referrer.id;
}

/**
 * Telegram profili bo'yicha foydalanuvchini topadi yoki yaratadi.
 * Mavjud foydalanuvchining ismi/avatari har kirishda yangilanadi,
 * referal esa faqat bir marta — birinchi ro'yxatdan o'tishda biriktiriladi.
 */
async function findOrCreateUser(
  profile: TelegramProfile,
  ref?: string | null,
): Promise<{ user: User; isNew: boolean }> {
  const existing = await prisma.user.findUnique({ where: { telegramId: profile.telegramId } });

  if (existing) {
    if (existing.status === 'blocked') {
      throw AppError.forbidden('Hisobingiz bloklangan — qo‘llab-quvvatlash xizmatiga murojaat qiling');
    }
    const referredById = existing.referredById ? null : await resolveReferrer(ref, existing.id);
    const user = await prisma.user.update({
      where: { id: existing.id },
      data: {
        username: profile.username ?? existing.username,
        firstName: profile.firstName ?? existing.firstName,
        lastName: profile.lastName ?? existing.lastName,
        photoUrl: profile.photoUrl ?? existing.photoUrl,
        botChatId: existing.botChatId ?? profile.chatId ?? profile.telegramId,
        ...(referredById ? { referredById } : {}),
      },
    });
    return { user, isNew: false };
  }

  const referredById = await resolveReferrer(ref);
  const user = await prisma.user.create({
    data: {
      telegramId: profile.telegramId,
      username: profile.username ?? null,
      firstName: profile.firstName ?? null,
      lastName: profile.lastName ?? null,
      photoUrl: profile.photoUrl ?? null,
      languageCode: asLang(profile.language),
      referralCode: await uniqueReferralCode(),
      referredById,
      botChatId: profile.chatId ?? profile.telegramId,
    },
  });
  return { user, isNew: true };
}

/** Sessiya ochib, `LoginResponse` qaytaradi (+ cookie) */
async function issueLogin(req: Request, res: Response, user: User, isNewUser: boolean): Promise<void> {
  const { token, expiresAt } = await createSession(user.id, {
    ip: req.ip,
    userAgent: req.headers['user-agent'],
  });
  setSessionCookie(res, token, expiresAt);
  await audit(user.id, 'login', req, isNewUser ? 'signup' : undefined);

  const payload: LoginResponse = {
    token,
    expiresAt: expiresAt.toISOString(),
    user: toAuthUser(user),
    isNewUser,
  };
  res.json(payload);
}

// ─────────────────────────── POST /telegram ───────────────────────────

/** Imzo xatolari uchun o'zbekcha izohlar */
const VERIFY_ERRORS: Record<string, string> = {
  bot_token_missing: 'Telegram login vaqtincha ishlamayapti — bot tokeni sozlanmagan',
  hash_missing: 'Telegram ma’lumotlari to‘liq emas',
  bad_hash: 'Telegram imzosi noto‘g‘ri — sahifani yangilab, qaytadan urinib ko‘ring',
  bad_auth_date: 'Telegram ma’lumotlari noto‘g‘ri',
  expired: 'Kirish ma’lumotlari eskirgan — qaytadan urinib ko‘ring',
};

const verifyMessage = (reason?: string): string =>
  VERIFY_ERRORS[reason ?? ''] ?? 'Telegram orqali kirishni tasdiqlab bo‘lmadi';

/**
 * Telegram Login Widget shu domen uchun ishlaydimi?
 *
 * Widget faqat @BotFather'da `/setdomain` orqali botga biriktirilgan domenda
 * ishlaydi. Boshqa domenda Telegram foydalanuvchini tasdiqlaydi-yu, ma'lumotni
 * saytga QAYTARMAYDI: oynacha chiqib yo'qoladi va hech narsa bo'lmaydi.
 * Sabab brauzerga ko'rinmaydi (iframe boshqa domenda), shuning uchun
 * tekshiruvni server bajaradi va sayt tushunarli xabar ko'rsatadi.
 */
const WIDGET_CACHE_MS = 10 * 60_000;
const widgetCache = new Map<string, { ok: boolean; at: number }>();

async function widgetOriginAllowed(origin: string): Promise<boolean> {
  const cached = widgetCache.get(origin);
  if (cached && Date.now() - cached.at < WIDGET_CACHE_MS) return cached.ok;

  let ok = false;
  try {
    const url =
      `https://oauth.telegram.org/embed/${encodeURIComponent(env.telegram.botUsername)}` +
      `?origin=${encodeURIComponent(origin)}&size=large&request_access=write`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    const html = await res.text();
    // Ruxsat berilmagan domenda Telegram shu matnni qaytaradi
    ok = res.ok && !/bot domain invalid/i.test(html);
  } catch {
    /*
     * Telegramga chiqib bo'lmadi — domenni ayblamaymiz. Widget ko'rsatiladi;
     * ishlamasa foydalanuvchi bot kodi bilan kira oladi.
     */
    ok = true;
  }

  widgetCache.set(origin, { ok, at: Date.now() });
  return ok;
}

/** GET /telegram/widget — widget shu domenda ishlaydimi */
router.get(
  '/telegram/widget',
  ah(async (req, res) => {
    /*
     * Demo kirish ochiqmi — kirish sahifasi shu bo'yicha tugmani
     * ko'rsatadi yoki yashiradi. Ilgari tugma har doim chizilardi va
     * ishlab chiqarishda bosilganda `POST /auth/demo` 404 qaytarardi:
     * tashrif buyuruvchi bosardi-yu, hech narsa bo'lmasdi.
     */
    const demo = demoLoginEnabled();

    if (!env.telegram.botToken || !env.telegram.botUsername) {
      res.json({ ok: false, reason: 'bot_missing', demo });
      return;
    }
    const origin = String((req.query as Record<string, unknown>).origin ?? '').trim();
    if (!/^https?:\/\/[a-z0-9.-]+(?::\d+)?$/i.test(origin)) {
      res.json({ ok: false, reason: 'bad_origin', demo });
      return;
    }
    const allowed = await widgetOriginAllowed(origin);
    res.json({ ok: allowed, reason: allowed ? undefined : 'domain_not_set', demo });
  }),
);

router.post(
  '/telegram',
  loginLimiter,
  ah(async (req, res) => {
    const raw = (req.body ?? {}) as Record<string, unknown>;
    const input = telegramAuthSchema.parse(raw);

    if (!env.telegram.botToken) {
      throw new AppError(503, 'telegram_disabled', VERIFY_ERRORS.bot_token_missing);
    }

    // Imzo aynan Telegram yuborgan xom maydonlar bo'yicha tekshiriladi
    const check = verifyTelegramLogin(raw, env.telegram.botToken);
    if (!check.ok) throw AppError.unauthorized(verifyMessage(check.reason));

    const { user, isNew } = await findOrCreateUser(
      {
        telegramId: String(input.id),
        username: input.username ?? null,
        firstName: input.first_name ?? null,
        lastName: input.last_name ?? null,
        photoUrl: input.photo_url ?? null,
      },
      input.ref,
    );

    await issueLogin(req, res, user, isNew);
  }),
);

// ─────────────────────────── POST /bot-code ───────────────────────────

/**
 * Botdagi bir martalik kodni "ishlatilgan" deb belgilaydi.
 * `updateMany` + `consumedAt: null` sharti bir kodni ikki marta ishlatishdan himoya qiladi.
 */
async function consumeLoginCode(id: string, req: Request): Promise<boolean> {
  const result = await prisma.loginCode.updateMany({
    where: { id, consumedAt: null },
    data: { status: 'used', consumedAt: new Date(), ip: req.ip?.slice(0, 60) ?? null },
  });
  return result.count > 0;
}

/** Kodga bog'langan foydalanuvchini topadi (yoki telegramId bo'yicha yaratadi) */
async function userFromLoginCode(
  record: { userId: string | null; telegramId: string | null },
  ref?: string | null,
): Promise<{ user: User; isNew: boolean } | null> {
  if (record.userId) {
    const user = await prisma.user.findUnique({ where: { id: record.userId } });
    if (user) {
      if (user.status === 'blocked') {
        throw AppError.forbidden('Hisobingiz bloklangan — qo‘llab-quvvatlash xizmatiga murojaat qiling');
      }
      return { user, isNew: false };
    }
  }
  if (record.telegramId) {
    return findOrCreateUser({ telegramId: record.telegramId, chatId: record.telegramId }, ref);
  }
  return null;
}

router.post(
  '/bot-code',
  loginLimiter,
  ah(async (req, res) => {
    const input = botCodeSchema.parse(req.body ?? {});
    const code = input.code.trim();

    const record = await prisma.loginCode.findUnique({ where: { code } });
    if (!record || record.consumedAt || record.status !== 'pending') {
      throw AppError.badRequest('Kod topilmadi yoki allaqachon ishlatilgan — botdan yangi kod oling');
    }
    if (record.expiresAt.getTime() < Date.now()) {
      throw AppError.badRequest('Kod muddati tugagan — botdan yangi kod oling');
    }

    const found = await userFromLoginCode(record, input.ref);
    if (!found) throw AppError.badRequest('Kodga bog‘langan foydalanuvchi topilmadi');

    if (!(await consumeLoginCode(record.id, req))) {
      throw AppError.badRequest('Kod allaqachon ishlatilgan — botdan yangi kod oling');
    }

    await issueLogin(req, res, found.user, found.isNew);
  }),
);

// ─────────────────────────── GET /otl/:token ───────────────────────────

/**
 * Bir martalik havola: bot yuborgan `token` tekshiriladi, sessiya ochiladi va
 * foydalanuvchi saytga qaytariladi. Token URL fragmentida (`#token=`) uzatiladi —
 * shunda u server loglariga tushmaydi.
 */
router.get(
  '/otl/:token',
  loginLimiter,
  ah(async (req, res) => {
    const raw = String(req.params.token ?? '').trim();
    const fail = (reason: string): void => {
      res.redirect(`${webBase()}/login?error=${reason}`);
    };

    if (!raw) return fail('link_invalid');

    const record = await prisma.loginCode.findUnique({ where: { code: raw } });
    if (!record || record.consumedAt || record.status !== 'pending') return fail('link_invalid');
    if (record.expiresAt.getTime() < Date.now()) return fail('link_expired');

    const found = await userFromLoginCode(record, (req.query.ref as string | undefined) ?? null);
    if (!found) return fail('link_invalid');

    if (!(await consumeLoginCode(record.id, req))) return fail('link_used');

    const { token, expiresAt } = await createSession(found.user.id, {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
    setSessionCookie(res, token, expiresAt);
    await audit(found.user.id, 'login_link', req);

    res.redirect(`${webBase()}/auth/callback#token=${encodeURIComponent(token)}`);
  }),
);

// ─────────────────────────── POST /miniapp ───────────────────────────

/** `initData` ichidagi user obyektidan matnli maydonni xavfsiz o'qish */
function pickString(source: Record<string, unknown>, key: string): string | null {
  const value = source[key];
  if (typeof value === 'string') return value.trim() || null;
  if (typeof value === 'number') return String(value);
  return null;
}

router.post(
  '/miniapp',
  loginLimiter,
  ah(async (req, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const initData = typeof body.initData === 'string' ? body.initData : '';
    if (!initData) throw AppError.badRequest('initData yuborilmadi');

    if (!env.telegram.botToken) {
      throw new AppError(503, 'telegram_disabled', VERIFY_ERRORS.bot_token_missing);
    }

    const check = verifyTelegramInitData(initData, env.telegram.botToken);
    if (!check.ok || !check.user) throw AppError.unauthorized(verifyMessage(check.reason));

    const tg = check.user;
    const telegramId = pickString(tg, 'id');
    if (!telegramId) throw AppError.badRequest('Telegram foydalanuvchisi aniqlanmadi');

    const { user, isNew } = await findOrCreateUser(
      {
        telegramId,
        username: pickString(tg, 'username'),
        firstName: pickString(tg, 'first_name'),
        lastName: pickString(tg, 'last_name'),
        photoUrl: pickString(tg, 'photo_url'),
        language: pickString(tg, 'language_code'),
      },
      typeof body.ref === 'string' ? body.ref : null,
    );

    await issueLogin(req, res, user, isNew);
  }),
);

// ─────────────────────────── POST /demo ───────────────────────────

/** Demo kirish faqat demo rejimida yoki ishlab chiqish muhitida ochiq */
const demoLoginEnabled = (): boolean => env.uzum.mode === 'demo' || !env.isProd;

/** Demo foydalanuvchi uchun kompaniya + sinov obunasi (a'zolik bo'lmasa) */
async function ensureDemoCompany(userId: string): Promise<void> {
  const membership = await prisma.membership.findFirst({
    where: { userId },
    orderBy: { createdAt: 'asc' },
    select: { companyId: true },
  });
  if (membership) {
    await ensureSubscription(membership.companyId);
    return;
  }

  const company = await prisma.company.create({
    data: { name: 'DEMO kompaniya', taxRate: 1, currency: 'UZS', onboarded: false, onboardStep: 'company' },
  });
  await prisma.membership.create({ data: { userId, companyId: company.id, role: 'owner' } });
  await ensureSubscription(company.id);
}

/**
 * Demo kirish — bot tokeni bo'lmaganda ham saytni to'liq sinab ko'rish uchun.
 * Avval seed yaratgan demo foydalanuvchi (telegramId `100000001`) qidiriladi; u
 * kompaniya egasi bo'lmasa (owner'ga tegishli amallar yopiq qolmasligi uchun) egalik
 * huquqiga ega birinchi hisob olinadi. Hech kim topilmasa yangi DEMO hisob ochiladi.
 */
router.post(
  '/demo',
  loginLimiter,
  ah(async (req, res) => {
    if (!demoLoginEnabled()) throw AppError.notFound();

    let user = await prisma.user.findUnique({ where: { telegramId: DEMO_TELEGRAM_ID } });
    let isNewUser = false;

    const owns = user
      ? await prisma.membership.count({ where: { userId: user.id, role: 'owner' } })
      : 0;

    if (owns === 0) {
      const ownerships = await prisma.membership.findMany({
        where: { role: 'owner', user: { status: 'active' } },
        include: { user: true, company: { include: { subscription: true } } },
        orderBy: { createdAt: 'asc' },
        take: 50,
      });
      // Demo'da barcha bo'limlar ochiq bo'lishi uchun eng yuqori aktiv tarifli hisob tanlanadi
      const rank = (m: (typeof ownerships)[number]): number =>
        PLAN_ORDER.indexOf(activePlan(m.company.subscription));
      const best = ownerships.reduce<(typeof ownerships)[number] | null>(
        (acc, m) => (acc === null || rank(m) > rank(acc) ? m : acc),
        null,
      );
      user = best?.user ?? user ?? (await prisma.user.findFirst({ orderBy: { createdAt: 'asc' } }));
    }

    if (!user) {
      user = await prisma.user.create({
        data: {
          telegramId: DEMO_TELEGRAM_ID,
          username: 'demo_seller',
          firstName: 'Demo',
          lastName: 'Foydalanuvchi',
          languageCode: 'uz',
          referralCode: await uniqueReferralCode(),
          botChatId: DEMO_TELEGRAM_ID,
        },
      });
      isNewUser = true;
    }

    if (user.status === 'blocked') {
      throw AppError.forbidden('Demo hisob bloklangan');
    }

    await ensureDemoCompany(user.id);
    await issueLogin(req, res, user, isNewUser);
  }),
);

// ─────────────────────────── GET /me ───────────────────────────

router.get(
  '/me',
  requireAuth,
  ah(async (req, res) => {
    const { user } = ctx(req);

    const memberships = await prisma.membership.findMany({
      where: { userId: user.id },
      include: { company: true },
      orderBy: { createdAt: 'asc' },
    });

    // Aktiv kompaniya: x-company-id sarlavhasi (yoki ?companyId), aks holda birinchisi
    const requested =
      (req.headers['x-company-id'] as string | undefined) ?? (req.query.companyId as string | undefined);
    const chosen =
      (requested ? memberships.find((m) => m.companyId === requested) : undefined) ?? memberships.at(0) ?? null;

    const companies = memberships.map((m) => toCompanySummary(m.company, m.role));
    const company = chosen ? toCompanySummary(chosen.company, chosen.role) : null;

    // Obuna yo'q bo'lsa — 7 kunlik sinov avtomatik ochiladi
    const subscription = chosen ? await ensureSubscription(chosen.companyId) : null;
    const planId = activePlan(subscription);
    const limits = getPlan(planId).limits;

    const storeRows = chosen
      ? await prisma.store.findMany({
          where: { companyId: chosen.companyId },
          include: { _count: { select: { products: true } } },
          orderBy: { createdAt: 'asc' },
        })
      : [];

    const [cabinetsUsed, membersUsed, unreadNotifications, sync] = await Promise.all([
      chosen ? prisma.uzumAccount.count({ where: { companyId: chosen.companyId } }) : 0,
      chosen ? prisma.membership.count({ where: { companyId: chosen.companyId } }) : 0,
      prisma.notification.count({ where: { userId: user.id, readAt: null } }),
      chosen
        ? getSyncStatus(chosen.companyId).catch(() => null)
        : Promise.resolve<SyncStatus | null>(null),
    ]);

    const stores: StoreSummary[] = storeRows.map((s) => ({
      id: s.id,
      title: s.title,
      uzumShopId: s.uzumShopId,
      status: s.status,
      productsCount: s._count.products,
    }));

    const payload: MeResponse = {
      user: toAuthUser(user),
      company,
      companies,
      subscription: toSubscriptionSummary(subscription),
      stores,
      features: featureMap(planId),
      limits: {
        stores: limits.stores,
        cabinets: limits.cabinets,
        members: limits.members,
        historyDays: limits.historyDays,
        used: { stores: stores.length, cabinets: cabinetsUsed, members: membersUsed },
      },
      sync: sync ?? null,
      unreadNotifications,
    };

    res.json(payload);
  }),
);

// ─────────────────────────── POST /logout ───────────────────────────

/**
 * POST /admin-login — administrator login va parol bilan kiradi (Telegramsiz).
 *
 * Login va parol xeshi `.env` da: `ADMIN_USERNAME` va `ADMIN_PASSWORD_HASH`
 * (yoki qulaylik uchun `ADMIN_PASSWORD`). Parolning o'zi bazada saqlanmaydi.
 * Muvaffaqiyatli kirishda admin hisobi yaratiladi/yangilanadi va sessiya beriladi.
 */
router.post(
  '/admin-login',
  loginLimiter,
  ah(async (req, res) => {
    const { username, password } = adminLoginSchema.parse(req.body);

    const expectedUser = env.admin.username;
    const storedHash = env.admin.passwordHash || (env.admin.password ? hashPassword(env.admin.password) : '');

    if (!expectedUser || !storedHash) {
      throw new AppError(503, 'admin_disabled', 'Administrator kirishi sozlanmagan');
    }

    // Login ham, parol ham noto'g'ri bo'lsa bir xil xabar — qaysi biri xato ekani bildirilmaydi
    const userOk = username.toLowerCase() === expectedUser.toLowerCase();
    const passOk = verifyPassword(password, storedHash);
    if (!userOk || !passOk) {
      throw AppError.unauthorized('Login yoki parol noto‘g‘ri');
    }

    const telegramId = env.admin.telegramId;
    const existing = await prisma.user.findUnique({ where: { telegramId } });

    const user = existing
      ? await prisma.user.update({
          where: { id: existing.id },
          data: { role: 'admin', status: 'active', username: expectedUser },
        })
      : await prisma.user.create({
          data: {
            telegramId,
            username: expectedUser,
            firstName: 'Administrator',
            role: 'admin',
            languageCode: 'uz',
            referralCode: randomReferralCode(),
          },
        });

    const { token, expiresAt } = await createSession(user.id, {
      ip: req.ip,
      userAgent: req.get('user-agent') ?? undefined,
    });
    setSessionCookie(res, token, expiresAt);

    const payload: LoginResponse = {
      token,
      expiresAt: expiresAt.toISOString(),
      user: toAuthUser(user),
      isNewUser: !existing,
    };
    res.json(payload);
  }),
);

/** Chiqish — token bo'lmasa ham 200 (idempotent) */
router.post(
  '/logout',
  ah(async (req, res) => {
    const token = readToken(req);
    if (token) await revokeSession(token);
    clearSessionCookie(res);
    res.json({ ok: true });
  }),
);

export default router;
