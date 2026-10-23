import type { QueryClient } from '@tanstack/react-query';

/**
 * Tannarxga bog'liq barcha so'rovlar. Tannarx saqlanganda server o'sha SKU'ning
 * O'TGAN buyurtmalarini ham darhol qayta hisoblaydi (services/item-cost.ts) —
 * shuning uchun foyda ko'rsatadigan har bir sahifa yangilanishi kerak.
 * 2026-10-24 gacha faqat ['cost-price'] va ['products'] yangilanardi:
 * Boshqaruv paneli, Moliya va tannarx qamrovi chipi 60 soniyagacha eski
 * foydani ko'rsatib turardi.
 */
const COST_DEPENDENT = [
  'cost-price',
  'products',
  'product',
  'cost-coverage',
  'dashboard',
  'finance',
  'finance-pnl',
  'product-profit',
  'unit',
  'reports-monthly',
  'sales-stock',
  'stocks',
  'planner',
] as const;

export function invalidateCostDependent(qc: QueryClient): void {
  for (const key of COST_DEPENDENT) void qc.invalidateQueries({ queryKey: [key] });
}
