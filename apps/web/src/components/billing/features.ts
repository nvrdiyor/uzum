/**
 * Tarif imkoniyatlarining ko'rinadigan nomlari (uz/ru/en) va taqqoslash jadvali guruhlari.
 * API `PlanPublic.features[].label` ni ham qaytaradi — bu yerdagi nom tarjima uchun ustun turadi.
 */

import type { FeatureId } from '@savdoiq/shared';

export interface L10nText {
  uz: string;
  ru: string;
  en: string;
}

export const FEATURE_LABELS: Record<FeatureId, L10nText> = {
  dashboard_realtime: {
    uz: 'Jonli boshqaruv paneli',
    ru: 'Дашборд в реальном времени',
    en: 'Real-time dashboard',
  },
  sales_analytics: { uz: 'Sotuv tahlili', ru: 'Аналитика продаж', en: 'Sales analytics' },
  revenue_roi: { uz: 'Tushum va ROI', ru: 'Выручка и ROI', en: 'Revenue and ROI' },
  products_assortment: { uz: 'Mahsulotlar va assortiment', ru: 'Товары и ассортимент', en: 'Products and assortment' },
  stocks_fbo_fbs: { uz: 'FBO/FBS qoldiqlari', ru: 'Остатки FBO/FBS', en: 'FBO/FBS stock levels' },
  abc_analysis: { uz: 'ABC tahlil', ru: 'ABC-анализ', en: 'ABC analysis' },
  illiquid: { uz: 'Nolikvid tovarlar', ru: 'Неликвиды', en: 'Dead stock' },
  losses_report: { uz: 'Yo‘qotishlar hisoboti', ru: 'Отчёт по потерям', en: 'Losses report' },
  returns_report: { uz: 'Qaytarishlar hisoboti', ru: 'Отчёт по возвратам', en: 'Returns report' },
  paid_storage: { uz: 'Pullik saqlash tahlili', ru: 'Анализ платного хранения', en: 'Paid storage analysis' },
  vgh_report: { uz: 'Vazn va o‘lcham hisoboti', ru: 'Отчёт по ВГХ', en: 'Weight and dimensions report' },
  warehouse: { uz: 'Ombor boshqaruvi', ru: 'Управление складом', en: 'Warehouse management' },
  shipments: { uz: 'Yetkazmalar', ru: 'Поставки', en: 'Shipments' },
  planner: { uz: 'Xarid rejalashtiruvchisi', ru: 'Планировщик закупок', en: 'Purchase planner' },
  monthly_reports: { uz: 'Oylik hisobotlar', ru: 'Месячные отчёты', en: 'Monthly reports' },
  unit_economics: { uz: 'Unit-iqtisod', ru: 'Юнит-экономика', en: 'Unit economics' },
  unit_calculator: { uz: 'Unit kalkulyator', ru: 'Юнит-калькулятор', en: 'Unit calculator' },
  cost_price: { uz: 'Tannarx boshqaruvi', ru: 'Управление себестоимостью', en: 'Cost price management' },
  expenses: { uz: 'Qo‘shimcha xarajatlar', ru: 'Дополнительные расходы', en: 'Extra expenses' },
  promos: {
    uz: 'Aksiyalar va ularning foydasi',
    ru: 'Акции и их прибыльность',
    en: 'Promotions and their profitability',
  },
  sku_health: {
    uz: 'SKU holati: blok, brak, qaytarishlar',
    ru: 'Состояние SKU: блок, брак, возвраты',
    en: 'SKU health: blocks, defects, returns',
  },
  reviews_autoreply: { uz: 'Sharhlarga avto-javob', ru: 'Автоответы на отзывы', en: 'Review auto-replies' },
  telegram_notifications: { uz: 'Telegram bildirishnomalari', ru: 'Уведомления в Telegram', en: 'Telegram notifications' },
  referral: { uz: 'Hamkorlik dasturi', ru: 'Партнёрская программа', en: 'Referral program' },
  export_excel: { uz: 'Excel’ga eksport', ru: 'Экспорт в Excel', en: 'Excel export' },
  api_access: { uz: 'API orqali kirish', ru: 'Доступ по API', en: 'API access' },
  priority_support: { uz: 'Ustuvor qo‘llab-quvvatlash', ru: 'Приоритетная поддержка', en: 'Priority support' },
};

export interface FeatureGroup {
  id: string;
  label: L10nText;
  items: FeatureId[];
}

/** Taqqoslash jadvali uchun mantiqiy guruhlar — barcha 25 imkoniyat bir marta uchraydi */
export const FEATURE_GROUPS: FeatureGroup[] = [
  {
    id: 'analytics',
    label: { uz: 'Analitika', ru: 'Аналитика', en: 'Analytics' },
    items: [
      'dashboard_realtime',
      'sales_analytics',
      'revenue_roi',
      'products_assortment',
      'abc_analysis',
      'monthly_reports',
    ],
  },
  {
    id: 'warehouse',
    label: { uz: 'Ombor va logistika', ru: 'Склад и логистика', en: 'Warehouse and logistics' },
    items: ['stocks_fbo_fbs', 'warehouse', 'shipments', 'planner', 'illiquid', 'paid_storage', 'vgh_report'],
  },
  {
    id: 'finance',
    label: { uz: 'Moliya', ru: 'Финансы', en: 'Finance' },
    items: ['unit_economics', 'unit_calculator', 'cost_price', 'expenses', 'losses_report', 'returns_report'],
  },
  {
    id: 'services',
    label: { uz: 'Xizmatlar', ru: 'Сервисы', en: 'Services' },
    items: ['reviews_autoreply', 'telegram_notifications', 'referral', 'export_excel', 'api_access', 'priority_support'],
  },
];

/** Kartada ko'rsatiladigan asosiy imkoniyatlar (uzun ro'yxatni qisqartirish uchun) */
export const CARD_FEATURES: FeatureId[] = [
  'dashboard_realtime',
  'sales_analytics',
  'unit_economics',
  'abc_analysis',
  'planner',
  'illiquid',
  'losses_report',
  'reviews_autoreply',
  'export_excel',
  'api_access',
  'priority_support',
];
