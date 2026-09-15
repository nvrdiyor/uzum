/**
 * Tannarx sahifasi uchun yordamchi tiplar va hisob-kitoblar.
 * Marja/ROI jonli hisoblanadi — API'ga so'rov yubormasdan.
 */
import { calcUnitEconomics, DEFAULTS } from '@savdoiq/shared';
import type { ProductCard, ProductCardSku, UnitCalcResult } from '@savdoiq/shared';

/** Jadvaldagi bitta qator — mahsulot kartochkasidan yoyilgan SKU */
export interface CostRow {
  skuId: string;
  sku: string;
  title: string;
  productTitle: string;
  imageUrl: string | null;
  price: number;
  purchasePrice: number;
  extraCost: number;
  sold: number;
}

/** Bitta SKU bo'yicha saqlanmagan o'zgarish */
export interface CostEdit {
  purchasePrice: number;
  extraCost: number;
}

export type CostEdits = Record<string, CostEdit>;

/** Eski javoblarda `extraCost` bo'lmasligi mumkin — xavfsiz o'qish */
function skuExtraCost(sku: ProductCardSku): number {
  const value = sku.extraCost;
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

/** Mahsulot kartochkalarini SKU qatorlariga yoyish */
export function flattenSkuRows(products: ProductCard[]): CostRow[] {
  const rows: CostRow[] = [];
  for (const product of products) {
    for (const sku of product.skus ?? []) {
      rows.push({
        skuId: sku.id,
        sku: sku.sku,
        title: sku.title || product.title,
        productTitle: product.title,
        imageUrl: product.imageUrl,
        price: sku.price,
        purchasePrice: sku.purchasePrice,
        extraCost: skuExtraCost(sku),
        sold: sku.sold,
      });
    }
  }
  return rows;
}

/** Tahrirni hisobga olgan joriy tannarx */
export function effectiveCost(row: CostRow, edits: CostEdits): number {
  const edit = edits[row.skuId];
  return edit ? edit.purchasePrice : row.purchasePrice;
}

/** Tahrirni hisobga olgan joriy qo'shimcha xarajat */
export function effectiveExtra(row: CostRow, edits: CostEdits): number {
  const edit = edits[row.skuId];
  return edit ? edit.extraCost : row.extraCost;
}

/** Qator saqlanmagan o'zgarishga egami */
export function isRowDirty(row: CostRow, edits: CostEdits): boolean {
  const edit = edits[row.skuId];
  if (!edit) return false;
  return edit.purchasePrice !== row.purchasePrice || edit.extraCost !== row.extraCost;
}

/** Hisob uchun taxminiy stavkalar */
export interface CostAssumptions {
  commissionPct: number;
  logistics: number;
  taxPct: number;
}

export const BASE_ASSUMPTIONS: CostAssumptions = {
  commissionPct: DEFAULTS.commissionPct,
  logistics: DEFAULTS.logisticsPerUnit,
  taxPct: DEFAULTS.taxPct,
};

/**
 * Bitta dona uchun taxminiy unit-iqtisod.
 * Tannarx yoki narx bo'lmasa — hisoblab bo'lmaydi (null).
 */
export function rowEconomics(
  price: number,
  cost: number,
  extra: number,
  assumptions: CostAssumptions,
): UnitCalcResult | null {
  if (price <= 0 || cost <= 0) return null;
  return calcUnitEconomics({
    price,
    purchasePrice: cost,
    commissionPct: assumptions.commissionPct,
    logistics: assumptions.logistics,
    storagePerDay: 0,
    storageDays: 0,
    packaging: 0,
    otherCost: extra,
    taxPct: assumptions.taxPct,
    buyoutPct: 100,
    returnLogistics: 0,
    qty: 1,
  });
}

/** Marja/ROI qiymati uchun rang */
export function valueTone(value: number): string {
  if (value >= 20) return 'text-brand-ink';
  if (value >= 0) return 'text-warn-ink';
  return 'text-danger';
}
