import { z } from 'zod';
import { UNIT_PLAN_MAX_ROWS } from './unit-plan.js';
import {
  DEBT_CARD_PRODUCTS,
  DEBT_CATEGORIES,
  DEBT_CHANNELS,
  DEBT_CURRENCIES,
  DEBT_DAY_COUNTS,
  DEBT_ENTRY_KINDS,
  DEBT_KIND_DEFAULTS,
  DEBT_KINDS,
  DEBT_LIMITS,
  DEBT_MIN_BASES,
  DEBT_REPAYMENTS,
} from './debts.js';

/** Umumiy davr/filtr query */
export const rangeQuerySchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}/).optional(),
  storeId: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(500).default(50),
  search: z.string().trim().max(200).optional(),
  sort: z.string().max(50).optional(),
  order: z.enum(['asc', 'desc']).default('desc'),
});

export const telegramAuthSchema = z.object({
  id: z.union([z.string(), z.number()]),
  first_name: z.string().optional(),
  last_name: z.string().optional(),
  username: z.string().optional(),
  photo_url: z.string().optional(),
  auth_date: z.union([z.string(), z.number()]),
  hash: z.string(),
  ref: z.string().optional(),
});

export const botCodeSchema = z.object({
  code: z.string().trim().min(4).max(12),
  ref: z.string().optional(),
});

/** Administrator login/parol bilan kirishi */
export const adminLoginSchema = z.object({
  username: z.string().trim().min(3).max(64),
  password: z.string().min(6).max(200),
});

export const companySchema = z.object({
  name: z.string().trim().min(2).max(120),
  taxRate: z.coerce.number().min(0).max(50).default(1),
  currency: z.string().default('UZS'),
});

export const uzumAccountSchema = z.object({
  label: z.string().trim().max(80).optional(),
  apiKey: z.string().trim().min(8, 'API kalit juda qisqa').max(4000),
  apiSecret: z.string().trim().max(4000).optional(),
});

export const costPriceSchema = z.object({
  skuId: z.string(),
  purchasePrice: z.coerce.number().min(0),
  extraCost: z.coerce.number().min(0).default(0),
  note: z.string().max(200).optional(),
});

export const costPriceBulkSchema = z.object({
  items: z.array(costPriceSchema).min(1).max(1000),
});

export const expenseSchema = z.object({
  date: z.string(),
  category: z.enum(['commission', 'logistics', 'marketing', 'storage', 'tax', 'salary', 'other']),
  amount: z.coerce.number().min(0),
  storeId: z.string().optional(),
  note: z.string().max(300).optional(),
});

export const unitCalcSchema = z.object({
  price: z.coerce.number().min(0),
  purchasePrice: z.coerce.number().min(0),
  commissionPct: z.coerce.number().min(0).max(100).default(12),
  logistics: z.coerce.number().min(0).default(0),
  storagePerDay: z.coerce.number().min(0).default(0),
  storageDays: z.coerce.number().min(0).default(0),
  packaging: z.coerce.number().min(0).default(0),
  otherCost: z.coerce.number().min(0).default(0),
  taxPct: z.coerce.number().min(0).max(50).default(1),
  buyoutPct: z.coerce.number().min(1).max(100).default(92),
  returnLogistics: z.coerce.number().min(0).default(0),
  qty: z.coerce.number().int().min(1).default(1),
});

/** Xitoydan import (PDD) kalkulyatori */
export const importCalcSchema = z.object({
  pddPrice: z.coerce.number().min(0).max(1_000_000),
  weightGr: z.coerce.number().min(0).max(1_000_000).default(0),
  rate: z.coerce.number().min(0).max(1_000_000),
  cargoPerKg: z.coerce.number().min(0).max(10_000_000).default(0),
  commissionPct: z.coerce.number().min(0).max(95).default(30),
  adsPct: z.coerce.number().min(0).max(95).default(10),
  deliveryFee: z.coerce.number().min(0).max(10_000_000).default(0),
  profitMultiplier: z.coerce.number().min(0).max(50).default(2),
  roundStep: z.coerce.number().min(0).max(1_000_000).default(1000),
});

export const subscribeSchema = z.object({
  plan: z.enum(['standard', 'vip']),
  months: z.coerce.number().int().min(1).max(12).default(1),
  provider: z.enum(['payme', 'click', 'uzum', 'manual']).default('manual'),
  useBonus: z.coerce.boolean().default(false),
});

export const reviewReplySchema = z.object({
  text: z.string().trim().min(2).max(2000),
});

export const shipmentSchema = z.object({
  code: z.string().trim().min(1).max(60).optional(),
  storeId: z.string().optional(),
  destination: z.string().max(120).optional(),
  plannedAt: z.string().optional(),
  note: z.string().max(500).optional(),
  items: z
    .array(
      z.object({
        skuId: z.string(),
        qty: z.coerce.number().int().min(0),
        boxes: z.coerce.number().int().min(0).default(0),
      }),
    )
    .default([]),
});

/** Bitta partiyadagi qatorlar chegarasi */
export const BATCH_MAX_ITEMS = 500;

export const batchItemSchema = z.object({
  name: z.string().trim().max(200).default(''),
  trackCode: z.string().trim().max(64).default(''),
  qty: z.coerce.number().int().min(0).max(10_000_000).default(0),
  priceCny: z.coerce.number().min(0).max(10_000_000).default(0),
  cargoName: z.string().trim().max(60).default(''),
  delivery: z.enum(['avia', 'avto']).default('avto'),
  trip: z.string().trim().max(30).default(''),
  weightKg: z.coerce.number().min(0).max(1_000_000).default(0),
  cargoCost: z.coerce.number().min(0).max(10_000_000_000).default(0),
  extraExcluded: z.boolean().default(false),
  /** Cargo puli to'langan. Berilmasa (eski sahifa versiyasi) — qatorning oldingi belgisi saqlanadi */
  cargoPaid: z.boolean().optional(),
});

/** Qo'shimcha xarajat tafsilotidagi qatorlar chegarasi */
export const BATCH_MAX_EXTRAS = 50;

export const batchExtraSchema = z.object({
  name: z.string().trim().max(120).default(''),
  amount: z.coerce.number().min(0).max(10_000_000_000).default(0),
  kind: z.enum(['road', 'other']).optional(),
});

export const batchCreateSchema = z.object({
  name: z.string().trim().min(1).max(80),
  /** Berilmasa — Markaziy bank kursi */
  rate: z.coerce.number().positive().max(1_000_000).optional(),
});

const isoDay = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Sana YYYY-MM-DD ko‘rinishida bo‘lsin');

/** Kalendarda bor kun: 2026-02-30 ham Date.parse dan o'tib 2026-03-02 bo'lib qolardi — kun aynan o'zi bo'lishi shart */
export const strictIsoDay = isoDay.refine((v) => {
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}, 'Sana noto‘g‘ri');

/** Jo'natma holati va sanalari (kargo + yetkazish turi bo'yicha) */
export const batchShipmentSchema = z.object({
  cargoName: z.string().trim().max(60).default(''),
  delivery: z.enum(['avia', 'avto']),
  trip: z.string().trim().max(30).default(''),
  status: z.enum(['warehouse', 'shipped', 'arrived']),
  shippedAt: isoDay.nullable().optional(),
  arrivedAt: isoDay.nullable().optional(),
});

/** Cargo to'lovlari chegarasi */
export const BATCH_MAX_PAYMENTS = 50;

export const batchPaymentSchema = z.object({
  date: strictIsoDay.nullable().default(null),
  amount: z.coerce.number().min(0).max(10_000_000_000).default(0),
  cargoName: z.string().trim().max(60).default(''),
  note: z.string().trim().max(120).default(''),
});

/** Partiyalar ro'yxatining yangi tartibi — yuqoridan pastga id'lar */
export const batchOrderSchema = z.object({
  ids: z.array(z.string().min(1).max(64)).min(1).max(500),
});

export const batchUpdateSchema = z.object({
  name: z.string().trim().min(1).max(80),
  rate: z.coerce.number().positive().max(1_000_000),
  extra: z.coerce.number().min(0).max(10_000_000_000).default(0),
  items: z.array(batchItemSchema).max(BATCH_MAX_ITEMS),
  /**
   * Qo'shimcha xarajat tafsiloti. Berilsa to'liq almashtiriladi va bo'sh
   * bo'lmasa `extra` shu qatorlar yig'indisidan olinadi; berilmasa tegilmaydi.
   */
  extras: z.array(batchExtraSchema).max(BATCH_MAX_EXTRAS).optional(),
  /**
   * Cargo to'lovlari. Berilsa to'liq almashtiriladi, berilmasa tegilmaydi —
   * eski sahifa versiyasi saqlaganda yozilgan to'lovlar o'chib ketmaydi.
   */
  payments: z.array(batchPaymentSchema).max(BATCH_MAX_PAYMENTS).optional(),
  /**
   * Sahifa yuklagan versiya (`updatedAt`). Partiya o'shandan beri boshqa
   * joyda o'zgargan bo'lsa saqlash rad etiladi — eski oyna yangi holatni
   * ustidan yozib, qatorlarni o'chirib yubormasin. Bo'lmasa ham rad etiladi
   * (eski sayt versiyasi yuborgan so'rov).
   */
  expectedUpdatedAt: z.string().optional(),
});

export const settingsSchema = z.object({
  language: z.enum(['uz', 'ru', 'en']).optional(),
  notifyDaily: z.boolean().optional(),
  notifyOrders: z.boolean().optional(),
  notifyStock: z.boolean().optional(),
  /** Haftalik (dushanba 09:00) va oylik (1-sana 09:00) Telegram hisoboti — apps/api services/digest.ts */
  notifyWeekly: z.boolean().optional(),
  notifyMonthly: z.boolean().optional(),
  timezone: z.string().optional(),
});

export type RangeQueryInput = z.infer<typeof rangeQuerySchema>;
export type UzumAccountInput = z.infer<typeof uzumAccountSchema>;
export type UnitCalcInputSchema = z.infer<typeof unitCalcSchema>;

// ─────────────────────────── Tovarlar jadvali (Unit kalkulyator) ───────────────────────────

const planMoney = z.coerce.number().min(0).max(100_000_000_000).nullable().default(null);

export const unitPlanRatesSchema = z.object({
  taxPct: z.coerce.number().min(0).max(100),
  withdrawPct: z.coerce.number().min(0).max(100),
  adsPct: z.coerce.number().min(0).max(100),
});

export const unitPlanRowSchema = z.object({
  id: z.string().trim().min(1).max(64),
  name: z.string().trim().max(200).default(''),
  categoryId: z.string().trim().max(64).nullable().default(null),
  categoryName: z.string().trim().max(300).nullable().default(null),
  commissionPct: z.coerce.number().min(0).max(100).nullable().default(null),
  liters: z.coerce.number().min(0).max(100_000).nullable().default(null),
  purchasePrice: planMoney,
  packaging: planMoney,
  price: planMoney,
  monthlyUnits: z.coerce.number().int().min(0).max(100_000_000).nullable().default(null),
  goalProfit: planMoney,
});

export const unitPlanSaveSchema = z.object({
  rates: unitPlanRatesSchema,
  // Qator kaliti takrorlansa, sahifada bitta katak ikkala qatorni o'zgartirardi
  rows: z
    .array(unitPlanRowSchema)
    .max(UNIT_PLAN_MAX_ROWS)
    .refine((rows) => new Set(rows.map((r) => r.id)).size === rows.length, 'Qator kalitlari takrorlanmasligi kerak'),
  /** Tahrir boshlangan paytdagi `updatedAt` — boshqa oyna ustidan yozib yubormaslik uchun */
  expectedUpdatedAt: z.string().datetime().nullable().optional(),
});

export type UnitPlanSaveInput = z.infer<typeof unitPlanSaveSchema>;

// ─────────────────────────── Qarzlar va kreditlar (2026-11-07) ───────────────────────────

const debtAmount = z.coerce.number().min(0).max(DEBT_LIMITS.amountMax);

/** Qarz shartlari maydonlari — yaratishda to'liq, tahrirda qisman */
const debtFields = {
  kind: z.enum(DEBT_KINDS),
  lender: z.string().trim().min(1, 'Kimdan olinganini yozing').max(DEBT_LIMITS.lenderMax),
  title: z.string().trim().max(DEBT_LIMITS.titleMax).default(''),
  currency: z.enum(DEBT_CURRENCIES).default('UZS'),
  /** Olingan summa; kartada — limit */
  amount: debtAmount,
  annualRate: z.coerce.number().min(0).max(DEBT_LIMITS.rateMax).default(0),
  dayCount: z.enum(DEBT_DAY_COUNTS).optional(),
  repayment: z.enum(DEBT_REPAYMENTS).optional(),
  termMonths: z.coerce.number().int().min(1).max(DEBT_LIMITS.termMax).nullable().optional(),
  graceMonths: z.coerce.number().int().min(0).max(DEBT_LIMITS.graceMax).default(0),
  startedOn: strictIsoDay,
  firstDueOn: strictIsoDay.nullable().optional(),
  /** Har oy to'lov kuni (1–31); qisqa oyda oy oxiri. Berilmasa — firstDueOn kuni */
  payDay: z.coerce.number().int().min(1).max(31).nullable().optional(),
  dueOn: strictIsoDay.nullable().optional(),
  minPct: z.coerce.number().min(0).max(100).optional(),
  minBase: z.enum(DEBT_MIN_BASES).optional(),
  monthlyPayment: debtAmount.nullable().optional(),
  openingBalance: debtAmount.nullable().optional(),
  ownerOnly: z.boolean().optional(),
  note: z.string().trim().max(DEBT_LIMITS.noteMax).default(''),
  /** Tayyor karta (TBC Osmon, Infin Black) — bank shartlari bilan hisob; null — boshqa karta */
  cardProduct: z.enum(DEBT_CARD_PRODUCTS).nullable().optional(),
  /** Tayyor karta: har oy hisobot kuni (TBC — mijozniki; Infin — 1) */
  statementDay: z.coerce.number().int().min(1).max(31).nullable().optional(),
  /** Tayyor karta: naqd va o'tkazma foizi (null — xaridlar foizi bilan bir xil) */
  cashRate: z.coerce.number().min(0).max(DEBT_LIMITS.rateMax).nullable().optional(),
  /** Tayyor karta: oxirgi hisobot bo'yicha to'lov kunigacha to'lash kerak qolgani (null — butun qarz) */
  openingBilled: debtAmount.nullable().optional(),
  /** Tayyor karta: ochiq hisobotning to'lanmagan minimal to'lovi (bank ilovasidan) */
  openingMin: debtAmount.nullable().optional(),
  /** Tayyor karta: qarz oyma-oy to'liq yopilmaydi (foizli aylanadi) */
  openingRevolving: z.boolean().nullable().optional(),
  /** Tayyor karta: muddati o'tgan summa (bank ilovasidan) */
  openingOverdue: debtAmount.nullable().optional(),
};

/**
 * Yaratish. Tahrirda server mavjud qarz bilan birlashtirib, natijani shu sxema bilan
 * qayta tekshiradi — maydonlar orasidagi qoidalar bitta joyda.
 */
export const debtCreateSchema = z.object(debtFields).superRefine((v, ctx) => {
  const repayment = v.repayment ?? DEBT_KIND_DEFAULTS[v.kind].repayment;
  const issue = (path: string, message: string) => ctx.addIssue({ code: z.ZodIssueCode.custom, path: [path], message });
  if (!(v.amount > 0)) issue('amount', v.kind === 'card' ? 'Limitni kiriting' : 'Summani kiriting');
  if (v.kind === 'card' && repayment !== 'interest') issue('repayment', 'Kartada minimal to‘lov — foiz va qarzning ulushi');
  if (repayment === 'equal' && v.termMonths == null && !(v.monthlyPayment && v.monthlyPayment > 0))
    issue('termMonths', 'Necha oyga yoki oylik to‘lovni kiriting');
  if (repayment === 'decreasing' && v.termMonths == null) issue('termMonths', 'Necha oyga olinganini kiriting');
  if (v.termMonths != null && v.graceMonths >= v.termMonths) issue('graceMonths', 'Imtiyozli oylar muddatdan kam bo‘lsin');
  if (repayment !== 'lump' && !v.firstDueOn) issue('firstDueOn', 'Birinchi to‘lov sanasini kiriting');
  if (v.firstDueOn && v.firstDueOn < v.startedOn) issue('firstDueOn', 'To‘lov sanasi qarz olingan kundan oldin bo‘lmaydi');
  if (v.payDay != null && v.firstDueOn) {
    // Birinchi sana shu kunda bo'lsin; qisqa oyda — oy oxiri (31 → 30.11)
    const d = new Date(`${v.firstDueOn}T00:00:00Z`);
    const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
    if (d.getUTCDate() !== Math.min(v.payDay, last)) issue('payDay', 'To‘lov kuni birinchi to‘lov sanasiga mos emas');
  }
  if (v.dueOn && v.dueOn <= v.startedOn) issue('dueOn', 'Qaytarish sanasi qarz olingan kundan keyin bo‘lsin');
  // Tayyor kartada qarz limitdan katta bo'lishi mumkin (texnik overdraft: komissiya limitdan oshadi; bank limitni
  // kamaytirgan) — bo'sh limit 0. Tahrirda ham shu sxema: boshlang'ich qarzdan kam limit rad etilmaydi (API-1)
  if (v.kind === 'card' && v.cardProduct == null && v.openingBalance != null && v.openingBalance > v.amount)
    issue('openingBalance', 'Hozirgi qarz limitdan katta');
  if (v.cardProduct != null) {
    if (v.kind !== 'card') issue('cardProduct', 'Tayyor karta faqat kredit karta uchun');
    if (v.currency !== 'UZS') issue('currency', 'Bu karta faqat so‘mda');
    if (v.cardProduct === 'tbc-osmon' && v.statementDay == null) issue('statementDay', 'Keyingi to‘lov sanasini kiriting');
    if (v.openingBilled != null && v.openingBilled > (v.openingBalance ?? 0))
      issue('openingBilled', 'To‘lash kerak summa hozirgi qarzdan katta bo‘lmaydi');
    if (v.openingMin != null && v.openingMin > (v.openingBilled ?? v.openingBalance ?? 0))
      issue('openingMin', 'Minimal to‘lov to‘lash kerak summadan katta bo‘lmaydi');
    if (v.openingOverdue != null && v.openingOverdue > (v.openingBalance ?? 0))
      issue('openingOverdue', 'Muddati o‘tgan summa hozirgi qarzdan katta bo‘lmaydi');
  }
});

/** Tahrir: berilgan maydonlar almashadi (berilmagani — o'zgarmaydi; standart qiymat qo'yilmaydi) */
export const debtUpdateSchema = z
  .object(debtFields)
  .partial()
  .extend({
    /** Tahrir boshlangan paytdagi `updatedAt` — boshqa oyna ustidan yozib yubormasin */
    expectedUpdatedAt: z.string().min(1),
    archived: z.boolean().optional(),
  });
export type DebtUpdateInput = z.infer<typeof debtUpdateSchema>;

export const debtEntrySchema = z
  .object({
    kind: z.enum(DEBT_ENTRY_KINDS),
    date: strictIsoDay,
    amount: debtAmount,
    category: z.union([z.enum(DEBT_CATEGORIES), z.literal('')]).default(''),
    note: z.string().trim().max(DEBT_LIMITS.noteMax).default(''),
    /** To'lovda: shundan foiz (bank SMS'idan) */
    interest: debtAmount.nullable().optional(),
    /** Tayyor kartadan ishlatish: xarid · o'tkazma · naqd */
    channel: z.enum(DEBT_CHANNELS).nullable().optional(),
    /** Tayyor karta: bank komissiyasi (qarzga qo'shiladi) */
    fee: debtAmount.nullable().optional(),
  })
  .superRefine((v, ctx) => {
    if (v.kind !== 'adjust' && !(v.amount > 0))
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['amount'], message: 'Summani kiriting' });
    if (v.interest != null && v.interest > v.amount)
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['interest'], message: 'Foiz to‘lov summasidan katta bo‘lmaydi' });
    // Komissiya summadan katta bo'lishi mumkin: TBC naqd — kamida 90 000 so'm (50 000 yechilsa ham)
  });

export type DebtCreateInput = z.infer<typeof debtCreateSchema>;
export type DebtEntryInput = z.infer<typeof debtEntrySchema>;
