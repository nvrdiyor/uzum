/**
 * Ombor / qoldiq / yetkazma bo'limlari uchun mahalliy API shakllari.
 * `packages/shared/src/types.ts` da hali tip berilmagan javoblar shu yerda qat'iylashtirilgan
 * (StockRow, StocksResponse, ShipmentRow — umumiy paketdan olinadi).
 */

import type { Paginated } from '@savdoiq/shared';

/** GET /stocks/history?skuId= — 60 kunlik qoldiq tarixi */
export type StockHistoryPoint = {
  date: string;
  fbo: number;
  fbs: number;
  own: number;
};

/** GET /stocks/warehouse — "o'z ombori" kesimidagi bitta SKU */
export interface WarehouseRow {
  skuId: string;
  sku: string;
  title: string;
  imageUrl?: string | null;
  storeId?: string | null;
  storeTitle?: string | null;
  /** o'z omboridagi qoldiq (dona) */
  own: number;
  /** buyurtmalarga band qilingan */
  reserved: number;
  /** yo'lda (yetkazmalarda) */
  inTransit: number;
  /** tannarx bo'yicha qiymat */
  costValue: number;
  retailValue?: number;
  /** bitta donaning hajmi × qoldiq (litr) */
  volumeL?: number;
}

export interface SchemeTotal {
  units: number;
  amount: number;
}

export interface WarehouseTotals {
  units?: number;
  costValue?: number;
  reserved?: number;
  inTransit?: number;
  /** umumiy hajm (litr) */
  volumeL?: number;
  /** oylik saqlash xarajati bahosi (UZS) */
  storagePerMonth?: number;
  fbo?: SchemeTotal;
  fbs?: SchemeTotal;
  own?: SchemeTotal;
  /** Server costValue qaytaradi; eski javoblarda amount bo'lishi mumkin */
  byStore?: { storeId?: string | null; title: string; units: number; costValue?: number; amount?: number }[];
}

export interface WarehouseResponse {
  rows: WarehouseRow[] | Paginated<WarehouseRow>;
  totals: WarehouseTotals;
}

/** Yetkazma qoralamasidagi pozitsiya (faqat brauzerda) */
export interface ShipmentDraftItem {
  skuId: string;
  sku: string;
  title: string;
  imageUrl?: string | null;
  qty: number;
  boxes: number;
  /** bitta donaning tannarxi — jami qiymatni hisoblash uchun */
  unitCost: number;
}

/** POST /warehouse/shipments tanasi */
export interface ShipmentCreateBody {
  storeId?: string;
  destination: string;
  plannedAt: string;
  note?: string;
  items: { skuId: string; qty: number; boxes: number }[];
}

/** Javob paginatsiyalangan yoki oddiy massiv bo'lishi mumkin */
export function rowsOf<T>(rows: T[] | Paginated<T> | undefined | null): T[] {
  if (!rows) return [];
  return Array.isArray(rows) ? rows : rows.items;
}
