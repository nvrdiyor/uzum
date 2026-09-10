import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { prisma } from '@savdoiq/db';
import type { Company, Membership, Subscription, User } from '@savdoiq/db';
import { SESSION_DAYS, featureAccess, getPlan, type FeatureId, type PlanId } from '@savdoiq/shared';
import { AppError } from './errors.js';
import { hashToken, randomToken } from './crypto.js';

export interface RequestContext {
  user: User;
  company?: Company;
  membership?: Membership;
  subscription?: Subscription | null;
  plan: PlanId;
  sessionId: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      ctx?: RequestContext;
    }
  }
}

export const SESSION_COOKIE = 'sq_session';

export async function createSession(
  userId: string,
  meta: { ip?: string; userAgent?: string } = {},
): Promise<{ token: string; expiresAt: Date }> {
  const token = randomToken(32);
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  await prisma.session.create({
    data: {
      userId,
      tokenHash: hashToken(token),
      expiresAt,
      ip: meta.ip?.slice(0, 60),
      userAgent: meta.userAgent?.slice(0, 300),
    },
  });
  await prisma.user.update({ where: { id: userId }, data: { lastLoginAt: new Date() } });
  return { token, expiresAt };
}

export async function revokeSession(token: string): Promise<void> {
  await prisma.session.updateMany({
    where: { tokenHash: hashToken(token) },
    data: { revokedAt: new Date() },
  });
}

function extractToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) return header.slice(7).trim();
  const cookie = (req as Request & { cookies?: Record<string, string> }).cookies?.[SESSION_COOKIE];
  return cookie ?? null;
}

/** Sessiyani o'qiydi, lekin majburlamaydi */
export const attachUser: RequestHandler = (req, _res, next) => {
  void (async () => {
    try {
      const token = extractToken(req);
      if (!token) return next();
      const session = await prisma.session.findUnique({
        where: { tokenHash: hashToken(token) },
        include: { user: true },
      });
      if (!session || session.revokedAt || session.expiresAt.getTime() < Date.now()) return next();
      if (session.user.status !== 'active') return next();
      req.ctx = { user: session.user, plan: 'trial', sessionId: session.id };
      next();
    } catch (err) {
      next(err);
    }
  })();
};

export const requireAuth: RequestHandler = (req, _res, next) => {
  if (!req.ctx?.user) return next(AppError.unauthorized());
  next();
};

export const requireAdmin: RequestHandler = (req, _res, next) => {
  if (!req.ctx?.user) return next(AppError.unauthorized());
  if (req.ctx.user.role !== 'admin') return next(AppError.forbidden('Faqat administrator uchun'));
  next();
};

/** Aktiv kompaniyani aniqlaydi: x-company-id sarlavhasi yoki birinchi a'zolik */
export const requireCompany: RequestHandler = (req, _res, next) => {
  void (async () => {
    try {
      const user = req.ctx?.user;
      if (!user) return next(AppError.unauthorized());

      const requested = (req.headers['x-company-id'] as string | undefined) ?? (req.query.companyId as string | undefined);
      const memberships = await prisma.membership.findMany({
        where: { userId: user.id },
        include: { company: { include: { subscription: true } } },
        orderBy: { createdAt: 'asc' },
      });
      if (memberships.length === 0)
        return next(new AppError(409, 'no_company', 'Avval kompaniya yarating (botda ro‘yxatdan o‘ting)'));

      const chosen = requested ? memberships.find((m) => m.companyId === requested) : memberships[0];
      if (!chosen) return next(AppError.forbidden('Bu kompaniyaga ruxsatingiz yo‘q'));

      const subscription = chosen.company.subscription ?? null;
      const active = subscription && subscription.expiresAt.getTime() > Date.now() && subscription.status === 'active';

      req.ctx = {
        ...req.ctx!,
        company: chosen.company,
        membership: chosen,
        subscription,
        plan: active ? (subscription!.plan as PlanId) : 'trial',
      };
      next();
    } catch (err) {
      next(err);
    }
  })();
};

/** Tarif bo'yicha funksiya ochiqmi? 'preview' → 402 (ko'rish uchun demo ma'lumot) */
export function requireFeature(feature: FeatureId): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    const plan = req.ctx?.plan ?? 'trial';
    const access = featureAccess(plan, feature);
    if (access === 'full') return next();
    return next(
      AppError.limit(
        access === 'preview'
          ? 'Bu bo‘lim sizning tarifingizda faqat ko‘rish uchun ochiq'
          : 'Bu bo‘lim pullik tarifda mavjud',
        { feature, plan, access, planName: getPlan(plan).name },
      ),
    );
  };
}

/** Rolga qarab yozish huquqini tekshirish */
export function requireRole(...roles: ('owner' | 'manager' | 'viewer')[]): RequestHandler {
  return (req, _res, next) => {
    const role = req.ctx?.membership?.role as 'owner' | 'manager' | 'viewer' | undefined;
    if (!role) return next(AppError.forbidden());
    if (!roles.includes(role)) return next(AppError.forbidden('Bu amal uchun huquqingiz yetarli emas'));
    next();
  };
}

export function ctx(req: Request): RequestContext {
  if (!req.ctx) throw AppError.unauthorized();
  return req.ctx;
}

export function companyCtx(req: Request): RequestContext & { company: Company } {
  const c = ctx(req);
  if (!c.company) throw new AppError(409, 'no_company', 'Kompaniya tanlanmagan');
  return c as RequestContext & { company: Company };
}
