/**
 * Uzum kabinetidagi "Umumiy balans" va hozir yechib olish mumkin bo'lgan pul.
 *
 * Ilgari balans uch joyda (Moliya, Boshqaruv paneli, Pul kalendari)
 * alohida hisoblanardi va sotuvchi yechib olgan pulni hech biri bilmasdi:
 * 136 000 so'm yechilgandan keyin ham sayt balansni o'zgarmagan ko'rsatardi.
 *
 * Uzum har bir moliyaviy pozitsiyada `withdrawnProfit` ni yuboradi — shu
 * pozitsiyadan sotuvchiga yechib berilgan summa. Jonli do'konda tekshirildi:
 * 136 000 erta yechilganda pozitsiyada 132 600 turdi, qolgan 3 400 (2,5%)
 * esa "Shoshilinch yechib olish" xarajati bo'lib keldi. Ya'ni:
 *
 *     balans = sotuv − komissiya − xizmat to'lovlari − saqlash − yechib olingan
 *
 * Yechib olish mumkin bo'lgan pul — balansning hali OCHILMAGAN (10 kunlik
 * kutish tugamagan) buyurtmalarga tegishli bo'lmagan qismi. Xizmat to'lovlari
 * (logistika, reklama) balansdan darhol ayriladi, shuning uchun ular ham
 * aynan shu ochilgan puldan ushlanadi — Uzum ham shunday qiladi.
 */
import { prisma } from '@savdoiq/db';
import type { Prisma } from '@savdoiq/db';
import { round } from '@savdoiq/shared';

export interface UzumBalance {
  /** Umumiy balans — Uzum kabinetidagi raqam */
  total: number;
  /** Hisob boshidan beri sotuvchiga yechib berilgan (withdrawnProfit) */
  withdrawn: number;
  /** Hali ochilmagan buyurtmalarga tegishli qism (sotuv − komissiya) */
  locked: number;
  /** Hozir yechib olish mumkin: balans − ochilmagan qism, 0 dan kam emas */
  available: number;
}

/** Bekor qilingan va qaytgan pozitsiyalar balansga kirmaydi */
const LIVE_ITEM: Prisma.OrderItemWhereInput = { status: { notIn: ['canceled', 'returned'] } };

export async function getUzumBalance(companyId: string, storeIds: string[], storeId?: string | null): Promise<UzumBalance> {
  if (storeIds.length === 0) return { total: 0, withdrawn: 0, locked: 0, available: 0 };

  const [sales, fees, storage, locked] = await Promise.all([
    prisma.orderItem.aggregate({
      _sum: { revenue: true, commission: true, withdrawn: true },
      where: { ...LIVE_ITEM, order: { storeId: { in: storeIds } } },
    }),
    prisma.expense.aggregate({
      _sum: { amount: true },
      where: {
        companyId,
        // Uzum ushlagan barcha to'lovlar: omborga logistika, reklama, buyurtma
        // yetkazish (`uzum-payout`), erta yechib olish haqi — qaytarilganlari manfiy
        source: { in: ['uzum', 'uzum-payout'] },
        // Do'kon tanlangan bo'lsa faqat o'shaniki
        ...(storeId ? { storeId } : {}),
      },
    }),
    prisma.storageFee.aggregate({ _sum: { amount: true }, where: { storeId: { in: storeIds } } }),
    // Uzum hali ochmagan (PROCESSING) buyurtmalar — pozitsiyasi `delivered` bo'lsa ham
    prisma.orderItem.aggregate({
      _sum: { revenue: true, commission: true },
      where: { ...LIVE_ITEM, order: { storeId: { in: storeIds }, status: { in: ['new', 'processing'] } } },
    }),
  ]);

  const withdrawn = round(sales._sum.withdrawn ?? 0);
  const total = round(
    (sales._sum.revenue ?? 0) -
      (sales._sum.commission ?? 0) -
      (fees._sum.amount ?? 0) -
      (storage._sum.amount ?? 0) -
      withdrawn,
  );
  const lockedAmount = round((locked._sum.revenue ?? 0) - (locked._sum.commission ?? 0));

  return { total, withdrawn, locked: lockedAmount, available: Math.max(0, round(total - lockedAmount)) };
}
