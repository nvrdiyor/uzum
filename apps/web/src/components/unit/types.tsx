/**
 * Unit-iqtisod va kalkulyator uchun umumiy tiplar, standart qiymatlar va yordamchilar.
 * Faqat `UnitEconomics.tsx` va `Calculator.tsx` sahifalari ishlatadi.
 */
import { DEFAULTS, type UnitCalcInput, type UnitEconomicsRow } from '@savdoiq/shared';
import { CHART_COLORS } from '@/lib/theme';

// ─────────────────────────── Kirish maydonlari ───────────────────────────

export const INPUT_KEYS: (keyof UnitCalcInput)[] = [
  'price',
  'purchasePrice',
  'commissionPct',
  'logistics',
  'storagePerDay',
  'storageDays',
  'packaging',
  'otherCost',
  'taxPct',
  'buyoutPct',
  'returnLogistics',
  'qty',
];

/** Kalkulyator ochilganda ko'rinadigan namunaviy qiymatlar */
export const DEFAULT_INPUT: UnitCalcInput = {
  price: 150_000,
  purchasePrice: 70_000,
  commissionPct: DEFAULTS.commissionPct,
  logistics: DEFAULTS.logisticsPerUnit,
  storagePerDay: 300,
  storageDays: 30,
  packaging: 2_000,
  otherCost: 0,
  taxPct: DEFAULTS.taxPct,
  buyoutPct: DEFAULTS.buyoutPct,
  returnLogistics: 10_000,
  qty: 100,
};

/** `GET /unit/defaults?skuId=` javobi — maydonlarning bir qismi kelishi mumkin */
export interface UnitDefaultsResponse extends Partial<UnitCalcInput> {
  skuId?: string;
  sku?: string;
  title?: string;
  imageUrl?: string | null;
}

export interface UnitScenarioRow {
  id: string;
  name: string;
  input: UnitCalcInput;
  createdAt: string;
}

function toNum(value: unknown, fallback: number): number {
  const n = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  return Number.isFinite(n) ? n : fallback;
}

/** Tashqi (API) obyektdan faqat kerakli raqamli maydonlarni olib, kirishni yangilash */
export function mergeInput(base: UnitCalcInput, patch: unknown): UnitCalcInput {
  if (!patch || typeof patch !== 'object') return base;
  const src = patch as Record<string, unknown>;
  const out: UnitCalcInput = { ...base };
  INPUT_KEYS.forEach((key) => {
    const raw = src[key];
    if (raw === undefined || raw === null || raw === '') return;
    out[key] = toNum(raw, base[key]);
  });
  return out;
}

/** Ssenariylar javobi turlicha kelishi mumkin (massiv / {items} / data JSON string) */
export function normalizeScenarios(raw: unknown): UnitScenarioRow[] {
  const list: unknown[] = Array.isArray(raw)
    ? raw
    : Array.isArray((raw as { items?: unknown[] })?.items)
      ? ((raw as { items: unknown[] }).items)
      : [];

  return list.flatMap((item, i) => {
    if (!item || typeof item !== 'object') return [];
    const rec = item as Record<string, unknown>;
    let payload: unknown = rec.input ?? rec.data ?? rec;
    if (typeof payload === 'string') {
      try {
        payload = JSON.parse(payload) as unknown;
      } catch {
        payload = null;
      }
    }
    return [
      {
        id: String(rec.id ?? `scenario-${i}`),
        name: String(rec.name ?? '—'),
        createdAt: typeof rec.createdAt === 'string' ? rec.createdAt : new Date().toISOString(),
        input: mergeInput(DEFAULT_INPUT, payload),
      },
    ];
  });
}

// ─────────────────────────── Xarajat taqsimoti ───────────────────────────

export type PartKey = 'cogs' | 'commission' | 'logistics' | 'storage' | 'other' | 'tax' | 'profit';

export const PART_ORDER: PartKey[] = ['cogs', 'commission', 'logistics', 'storage', 'other', 'tax', 'profit'];

export const PART_COLOR: Record<PartKey, string> = {
  cogs: CHART_COLORS.slate,
  commission: CHART_COLORS.danger,
  logistics: CHART_COLORS.warn,
  storage: CHART_COLORS.violet,
  other: CHART_COLORS.info,
  tax: CHART_COLORS.teal,
  profit: CHART_COLORS.brand,
};

/** Bitta dona narxi qayerga ketishi (jadval qatoridan) */
export function rowParts(row: UnitEconomicsRow): { key: PartKey; value: number }[] {
  return [
    { key: 'cogs', value: row.purchasePrice },
    { key: 'commission', value: row.commission },
    { key: 'logistics', value: row.logistics },
    { key: 'storage', value: row.storage },
    { key: 'other', value: row.otherCost },
    { key: 'tax', value: row.tax },
    { key: 'profit', value: row.netProfit },
  ];
}

/** Narx sezgirligi qadamlari (%) */
export const PRICE_STEPS = [-20, -15, -10, -5, 0, 5, 10, 15, 20];
