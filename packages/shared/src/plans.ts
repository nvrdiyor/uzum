/**
 * Tariflar — SavdoIQ
 * Narxlar UZS/oy. Sinov muddati: 7 kun, bepul.
 */

/**
 * 'business' 2026-09-16 da olib tashlandi — uchta tarif tanlovni osonlashtiradi.
 * Uning imkoniyatlari va narxi VIP ga o'tdi, mavjud obunachilar VIP ga ko'chirildi.
 * Tip'da qoldirilmadi: bazada bu qiymat qolmagan (migratsiya skripti bajarilgan).
 */
/**
 * 'expired' — TARIF EMAS, holat. Obuna muddati tugaganda shu holat qo'yiladi.
 * Ilgari tugagan obuna 'trial' ga qaytarilardi, sinovda esa deyarli hamma
 * narsa ochiq — ya'ni to'lovni to'xtatgan mijoz ishlashda davom etaverardi
 * va qaytish uchun sabab qolmasdi.
 *
 * U PLAN_ORDER da YO'Q, shuning uchun narxlar sahifasida kartochka bo'lib
 * chiqmaydi va `hasMinPlan` tekshiruvida indeksi -1 bo'lib, hech qanday
 * talabni qanoatlantirmaydi.
 */
export const PLAN_IDS = ['trial', 'standard', 'vip', 'expired'] as const;
export type PlanId = (typeof PLAN_IDS)[number];

export const FEATURE_IDS = [
  'dashboard_realtime',
  'sales_analytics',
  'revenue_roi',
  'products_assortment',
  'stocks_fbo_fbs',
  'abc_analysis',
  'illiquid',
  'losses_report',
  'returns_report',
  'paid_storage',
  'vgh_report',
  'warehouse',
  'shipments',
  'planner',
  'monthly_reports',
  'unit_economics',
  'unit_calculator',
  'cost_price',
  'expenses',
  'promos',
  'sku_health',
  /** Kartochka SEO: audit bali, kalit so'zlar, bepul AI chatbot uchun so'rov */
  'card_seo',
  /**
   * "Mening radarim" (/radar) va "Narxlar xaritasi" (/price-map + mahsulot
   * sahifasidagi "Raqobatchilar narxi" kartasi) — faqat pullik tarifda
   * (egasining qarori, 2026-10-27). Ilgari ular sales_analytics va
   * products_assortment bilan ochilardi, ya'ni sinovda ham to'liq edi.
   */
  'growth_radar',
  'price_map',
  'reviews_autoreply',
  'telegram_notifications',
  'referral',
  'export_excel',
  'api_access',
  'priority_support',
] as const;
export type FeatureId = (typeof FEATURE_IDS)[number];

/** 'full' — to'liq ishlaydi, 'preview' — faqat ko'rish (demo/blur), 'off' — yo'q */
export type FeatureAccess = 'full' | 'preview' | 'off';

export interface PlanLimits {
  /** Nechta do'kon (magazin) ulash mumkin */
  stores: number;
  /** Nechta Uzum kabinet (API kalit) ulash mumkin */
  cabinets: number;
  /** Nechta jamoa a'zosi */
  members: number;
  /** Tarix chuqurligi (kun) */
  historyDays: number;
  /** Avtomatik sinxronizatsiya oralig'i (daqiqa) */
  syncIntervalMinutes: number;
  /** Kuniga nechta sharhga avto-javob */
  autoReplyPerDay: number;
}

export interface Plan {
  id: PlanId;
  /** Marketing nomi */
  name: string;
  badge?: 'popular' | 'best';
  /** UZS / oy */
  price: number;
  /** Sinov uchun kun soni (faqat trial) */
  trialDays?: number;
  tagline: { uz: string; ru: string; en: string };
  limits: PlanLimits;
  features: Record<FeatureId, FeatureAccess>;
  /** Yillik to'lovda chegirma (%) */
  yearlyDiscount: number;
}

const ALL_FULL = (): Record<FeatureId, FeatureAccess> =>
  FEATURE_IDS.reduce((acc, f) => {
    acc[f] = 'full';
    return acc;
  }, {} as Record<FeatureId, FeatureAccess>);

const trialFeatures = (): Record<FeatureId, FeatureAccess> => {
  const f = ALL_FULL();
  // Sinovda ilg'or bo'limlar faqat ko'rish uchun ochiq
  f.abc_analysis = 'preview';
  f.illiquid = 'preview';
  f.losses_report = 'preview';
  f.reviews_autoreply = 'preview';
  f.planner = 'preview';
  f.promos = 'preview';
  f.vgh_report = 'preview';
  // Radar va narxlar xaritasi — pullik tarif ustunligi: sinovda namuna (2026-10-27)
  f.growth_radar = 'preview';
  f.price_map = 'preview';
  f.api_access = 'off';
  f.priority_support = 'off';
  return f;
};

/**
 * Muddati tugagan obuna: ma'lumot joyida turganini ko'rsatamiz, lekin
 * kundalik ish uchun ishlatib bo'lmaydi. Boshqaruv paneli 'preview' —
 * sotuvchi raqamlari saqlanib qolganini ko'radi va qaytishga undaladi.
 */
const expiredFeatures = (): Record<FeatureId, FeatureAccess> =>
  FEATURE_IDS.reduce((acc, f) => {
    acc[f] = f === 'dashboard_realtime' ? 'preview' : 'off';
    return acc;
  }, {} as Record<FeatureId, FeatureAccess>);

const standardFeatures = (): Record<FeatureId, FeatureAccess> => {
  const f = ALL_FULL();
  f.api_access = 'off';
  f.priority_support = 'off';
  return f;
};

export const PLANS: Record<PlanId, Plan> = {
  trial: {
    id: 'trial',
    name: 'Sinov',
    price: 0,
    trialDays: 7,
    yearlyDiscount: 0,
    tagline: {
      uz: '7 kun bepul — hamma narsani sinab ko‘ring',
      ru: '7 дней бесплатно — попробуйте всё',
      en: '7 days free — try everything',
    },
    limits: {
      stores: 1,
      cabinets: 1,
      members: 1,
      historyDays: 60,
      syncIntervalMinutes: 60,
      autoReplyPerDay: 0,
    },
    features: trialFeatures(),
  },
  standard: {
    id: 'standard',
    name: 'Standart',
    badge: 'popular',
    price: 200_000,
    yearlyDiscount: 15,
    tagline: {
      uz: 'Yakka sotuvchi va kichik jamoalar uchun',
      ru: 'Для селлеров и небольших команд',
      en: 'For solo sellers and small teams',
    },
    limits: {
      stores: 3,
      cabinets: 3,
      members: 3,
      historyDays: 365,
      syncIntervalMinutes: 30,
      autoReplyPerDay: 50,
    },
    features: standardFeatures(),
  },
  vip: {
    id: 'vip',
    name: 'VIP',
    badge: 'best',
    price: 400_000,
    yearlyDiscount: 20,
    tagline: {
      uz: 'Cheksiz kabinet, API va shaxsiy menejer',
      ru: 'Безлимит кабинетов, API и личный менеджер',
      en: 'Unlimited cabinets, API and a personal manager',
    },
    limits: {
      stores: 10,
      cabinets: 999,
      members: 50,
      /**
       * Vaqtincha 365 — orqaga yig'ish (backfill) tayyor bo'lguncha.
       * Ilgari 1825 (5 yil) edi va saytda "5 yillik tarix" deb sotilardi, lekin
       * sinxron baribir 365 kundan oshmaydi (`MAX_HISTORY_DAYS`, apps/api
       * services/sync.ts): VIP mijoz 5 yillik davrni tanlab, bo'sh hisobot
       * ko'rardi. Davr tanlagich va server ham shu qiymat bilan cheklaydi.
       * Backfill chiqqanda sinxron chegarasi bilan birga oshiriladi (2026-10-24).
       */
      historyDays: 365,
      syncIntervalMinutes: 30,
      autoReplyPerDay: 2000,
    },
    features: ALL_FULL(),
  },
  expired: {
    id: 'expired',
    name: 'Muddati tugagan',
    price: 0,
    yearlyDiscount: 0,
    tagline: {
      uz: 'Obuna muddati tugadi — ma’lumotlaringiz saqlanib turibdi',
      ru: 'Подписка истекла — ваши данные сохранены',
      en: 'Your subscription has ended — your data is kept',
    },
    limits: {
      stores: 1,
      cabinets: 1,
      members: 1,
      historyDays: 30,
      syncIntervalMinutes: 1440,
      autoReplyPerDay: 0,
    },
    features: expiredFeatures(),
  },
};

/** Narxlar sahifasida va taqqoslashda ko'rinadigan tariflar ('expired' — holat, tarif emas) */
export const PLAN_ORDER: PlanId[] = ['trial', 'standard', 'vip'];

export const TRIAL_DAYS = 7;

/** Referal dasturida hamkorga beriladigan ulush (%) */
export const REFERRAL_PERCENT = 20;

export function getPlan(plan: string | null | undefined): Plan {
  const id = (plan ?? 'trial') as PlanId;
  return PLANS[id] ?? PLANS.trial;
}

export function planPrice(plan: PlanId, months = 1): number {
  const p = PLANS[plan];
  const gross = p.price * months;
  if (months >= 12 && p.yearlyDiscount > 0) {
    return Math.round((gross * (100 - p.yearlyDiscount)) / 100);
  }
  return gross;
}

export function featureAccess(plan: string | null | undefined, feature: FeatureId): FeatureAccess {
  return getPlan(plan).features[feature] ?? 'off';
}

export function hasFeature(plan: string | null | undefined, feature: FeatureId): boolean {
  return featureAccess(plan, feature) === 'full';
}

/** Tarifni aniqlash uchun obunaning kerakli maydonlari (bazadagi yozuv ham, API javobi ham mos) */
export interface PlanSubscription {
  plan: string;
  status: string;
  expiresAt: Date | string;
  canceledAt?: Date | string | null;
}

/**
 * Obunaning AMALDAGI tarifi — server, sinxron ishchisi va sayt uchun yagona qoida.
 *
 * Ilgari har joy o'zicha hisoblardi: `/auth/me` muddati tugaganni 'expired'
 * derdi, so'rovlarni tekshiruvchi `requireCompany` esa 'trial' — sinovda
 * deyarli hamma narsa ochiq. Natijada sayt bo'limlarni yopib ko'rsatardi,
 * API esa to'lovni to'xtatgan mijozga ma'lumotni berishda davom etardi.
 *
 * Obuna yozuvi umuman yo'q — hali ochilmagan: sinov beriladi. Muddati
 * tugagan yoki bekor qilingan obuna — 'expired'.
 */
export function resolvePlan(sub: PlanSubscription | null | undefined, now: number = Date.now()): PlanId {
  if (!sub) return 'trial';
  const expiresAt = new Date(sub.expiresAt).getTime();
  const alive = sub.status === 'active' && !sub.canceledAt && expiresAt > now;
  return alive ? getPlan(sub.plan).id : 'expired';
}

export function isPlanAtLeast(plan: string | null | undefined, min: PlanId): boolean {
  return PLAN_ORDER.indexOf(getPlan(plan).id) >= PLAN_ORDER.indexOf(min);
}
