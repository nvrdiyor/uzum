import { z } from 'zod';

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
  plan: z.enum(['standard', 'business', 'vip']),
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

export const settingsSchema = z.object({
  language: z.enum(['uz', 'ru', 'en']).optional(),
  notifyDaily: z.boolean().optional(),
  notifyOrders: z.boolean().optional(),
  notifyStock: z.boolean().optional(),
  timezone: z.string().optional(),
});

export type RangeQueryInput = z.infer<typeof rangeQuerySchema>;
export type UzumAccountInput = z.infer<typeof uzumAccountSchema>;
export type UnitCalcInputSchema = z.infer<typeof unitCalcSchema>;
