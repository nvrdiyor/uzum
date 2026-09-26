/**
 * Xaridor qaytarishlari va bekor qilishlari — buyurtma pozitsiyalaridan.
 *
 * Ilgari "Qaytarishlar" sahifasi `ReturnRecord` jadvalidan o'qirdi. Uni esa
 * Uzum `/v1/shop/{id}/return` to'ldiradi — bu Uzum omboridan SOTUVCHIGA
 * qaytarish nakladnoylari, xaridor qaytarishi emas. Natijada jonli do'konda
 * 13 ta bekor qilingan/qaytarilgan pozitsiya bo'la turib sahifa 0 ko'rsatardi.
 *
 * Xaridorga tegishli ikki holat (sotuvchi tilida):
 *  • bekor qilish (`canceled`) — xaridor buyurtma berib, tovarni olmasdan bekor qildi;
 *  • qaytarish   (`returned`) — tovar topshirish punktiga keldi: xaridor olmadi
 *    yoki oldi-yu qaytardi.
 * Ajratish `OrderItem.status` da (importer `returnCause` bo'yicha belgilaydi).
 */
import { prisma } from '@savdoiq/db';
import { round } from '@savdoiq/shared';
import { getSkuCatalog } from './common.js';

export type ReturnKind = 'returned' | 'canceled';

export interface ReturnLine {
  id: string;
  kind: ReturnKind;
  skuId: string | null;
  sku: string | null;
  title: string | null;
  imageUrl: string | null;
  orderCode: string | null;
  qty: number;
  amount: number;
  /** Uzum bergan asl sabab matni */
  reason: string | null;
  /** Qaytarish sanasi (bo'lmasa — buyurtma sanasi) */
  date: Date;
}

/**
 * Davrdagi qaytarish va bekor qilishlar. Qaytarish o'z sanasi bilan, bekor
 * qilish buyurtma sanasi bilan davrga tushadi.
 */
export async function loadReturnLines(storeIds: string[], from: Date, toExclusive: Date): Promise<ReturnLine[]> {
  if (storeIds.length === 0) return [];

  const [items, catalog] = await Promise.all([
    prisma.orderItem.findMany({
      where: {
        order: { storeId: { in: storeIds } },
        status: { in: ['returned', 'canceled'] },
        OR: [
          { returnedAt: { gte: from, lt: toExclusive } },
          { returnedAt: null, orderedAt: { gte: from, lt: toExclusive } },
        ],
      },
      select: {
        id: true,
        skuId: true,
        skuCode: true,
        title: true,
        qty: true,
        returnedQty: true,
        sellPrice: true,
        status: true,
        returnCause: true,
        returnedAt: true,
        orderedAt: true,
        order: { select: { uzumOrderId: true } },
      },
      orderBy: { orderedAt: 'desc' },
    }),
    getSkuCatalog(storeIds, true),
  ]);

  return items.map((it) => {
    const info = it.skuId ? catalog.get(it.skuId) : undefined;
    // Uzum sotilmagan pozitsiyada amount = 0 va amountReturns = N yuboradi
    const qty = it.returnedQty > 0 ? it.returnedQty : Math.max(it.qty, 1);
    return {
      id: it.id,
      kind: it.status === 'returned' ? 'returned' : 'canceled',
      skuId: it.skuId,
      sku: info?.sku ?? it.skuCode ?? null,
      title: info?.title ?? it.title ?? null,
      imageUrl: info?.imageUrl ?? null,
      orderCode: it.order.uzumOrderId,
      qty,
      amount: round(it.sellPrice * qty),
      reason: it.returnCause?.trim() || null,
      date: it.returnedAt ?? it.orderedAt,
    };
  });
}
