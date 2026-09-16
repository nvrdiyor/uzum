/**
 * Tariflar — SavdoIQ
 * Narxlar UZS/oy. Sinov muddati: 7 kun, bepul.
 */

/**
 * 'business' 2026-09-16 da olib tashlandi — uchta tarif tanlovni osonlashtiradi.
 * Uning imkoniyatlari va narxi VIP ga o'tdi, mavjud obunachilar VIP ga ko'chirildi.
 * Tip'da qoldirilmadi: bazada bu qiymat qolmagan (migratsiya skripti bajarilgan).
 */
export const PLAN_IDS = ['trial', 'standard', 'vip'] as const;
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
  f.api_access = 'off';
  f.priority_support = 'off';
  return f;
};

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
      uz: '7 kun bepul — hamma narsani sinab ko’ring',
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
      historyDays: 1825,
      syncIntervalMinutes: 10,
      autoReplyPerDay: 2000,
    },
    features: ALL_FULL(),
  },
};

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

export function isPlanAtLeast(plan: string | null | undefined, min: PlanId): boolean {
  return PLAN_ORDER.indexOf(getPlan(plan).id) >= PLAN_ORDER.indexOf(min);
}
