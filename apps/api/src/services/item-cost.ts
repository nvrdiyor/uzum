/**
 * Buyurtma pozitsiyasining tannarx maydonlari — YAGONA formula.
 *
 *     cogs      = qty * sku.purchasePrice   (pozitsiyadagi `purchasePrice` — bir dona tannarxi)
 *     otherCost = qty * sku.extraCost
 *     netProfit = payout - cogs - otherCost - revenue * taxRate / 100
 *
 * Sinxron (`sync.ts` → recalcOrderItems) ham, tannarx saqlash (`products.ts`)
 * ham shu funksiyalarni ishlatadi: bitta pozitsiya qaysi yo'l bilan qayta
 * hisoblanmasin, natija bir xil chiqishi shart.
 *
 * Ilgari tannarx saqlanganda faqat `Sku` yozilardi. O'tgan pozitsiyalar
 * keyingi sinxronni kutardi, oraliq sinxron esa faqat oxirgi ~14 kunni qayta
 * hisoblaydi — undan eski sotuvlar to'liq sinxrongacha cogs = 0 bilan qolib,
 * sotuvchi tannarxni kiritgandan keyin ham o'tgan davrlar foydasi oshirib
 * ko'rsatilardi va "Tannarx: N% sotuvda" chipi 100% ga chiqmasdi (2026-10-24).
 */
import { prisma } from '@savdoiq/db';
import type { Prisma } from '@savdoiq/db';
import { round } from '@savdoiq/shared';

export interface SkuCost {
  purchasePrice: number;
  extraCost: number;
}

export interface ItemCostFields {
  purchasePrice: number;
  otherCost: number;
  netProfit: number;
}

/** Pozitsiyaning tannarx maydonlari SKU'ning joriy tannarxi bilan */
export function itemCostFields(
  it: { qty: number; revenue: number; payout: number },
  cost: SkuCost,
  taxRate: number,
): ItemCostFields {
  const purchasePrice = round(cost.purchasePrice);
  const otherCost = round(cost.extraCost * it.qty);
  const netProfit = round(it.payout - purchasePrice * it.qty - otherCost - (it.revenue * taxRate) / 100);
  return { purchasePrice, otherCost, netProfit };
}

/**
 * Pozitsiyani qayta yozish kerakmi: faqat tannarx yoki qo'shimcha xarajat
 * farq qilsa. Soliq stavkasi o'zgargani o'zi sabab emas — sinxron ham shunday.
 */
export function itemCostChanged(
  it: { purchasePrice: number; otherCost: number },
  next: ItemCostFields,
): boolean {
  return next.purchasePrice !== round(it.purchasePrice) || next.otherCost !== round(it.otherCost);
}

/** Bir o'qishdagi pozitsiyalar — katta tarixda xotirani cheklaydi */
const READ_PAGE = 5_000;
/** Bitta so'rovdagi id'lar — SQLite parametr chegarasi (999) ichida, PostgreSQL uchun ham xavfsiz */
const ID_CHUNK = 500;

function chunked<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

interface UpdateGroup {
  /** O'qilgan paytdagi qiymatlar — `where` sharti */
  fromPurchasePrice: number;
  fromOtherCost: number;
  next: Omit<ItemCostFields, 'netProfit'>;
  /** netProfit farqi (yangi − eski) */
  delta: number;
  ids: string[];
}

/**
 * Berilgan SKU'larning BARCHA buyurtma pozitsiyalarini joriy tannarx bilan
 * qayta hisoblaydi (sana chegarasisiz) va yozilgan pozitsiyalar sonini qaytaradi.
 *
 * Har pozitsiyani alohida `update` qilish katta tarixda minglab so'rov
 * bo'lardi. Shuning uchun yangi qiymat har pozitsiya uchun sinxron formulasi
 * bilan hisoblanadi, yozish esa guruhlab bajariladi: eski tannarxi, yangi
 * tannarxi va foyda farqi bir xil pozitsiyalar bitta `updateMany` da, foyda
 * `increment` bilan o'zgaradi. Bitta SKU uchun bu odatda bir necha so'rov
 * (dona soni × eski tannarx kombinatsiyalari), natija esa har pozitsiyani
 * alohida hisoblagandek. Xom SQL yo'q — SQLite va PostgreSQL'da bir xil ishlaydi.
 *
 * `where` da eski tannarx ham tekshiriladi: o'qish va yozish orasida sinxron
 * pozitsiyani qayta yozgan bo'lsa (import pozitsiyani o'sha id bilan qaytadan
 * yaratadi), foyda farqi ikki marta qo'shilmaydi — bu qator o'tkazib
 * yuboriladi va keyingi hisoblashda tuzaladi.
 */
export async function recalcSkuOrderItems(skuIds: readonly string[], taxRate: number): Promise<number> {
  const unique = [...new Set(skuIds)];
  if (unique.length === 0) return 0;

  // Tannarx so'rov tanasidan emas, bazadan olinadi: ikki parallel saqlashda oxirgisi qo'llansin
  const skus = await prisma.sku.findMany({
    where: { id: { in: unique } },
    select: { id: true, purchasePrice: true, extraCost: true },
  });

  // Tannarxi bir xil SKU'lar birga o'qiladi ("hammasiga qo'llash" — bitta guruh)
  const byCost = new Map<string, { cost: SkuCost; skuIds: string[] }>();
  for (const s of skus) {
    const key = `${s.purchasePrice}|${s.extraCost}`;
    const entry = byCost.get(key) ?? { cost: { purchasePrice: s.purchasePrice, extraCost: s.extraCost }, skuIds: [] };
    entry.skuIds.push(s.id);
    byCost.set(key, entry);
  }

  let updated = 0;
  for (const { cost, skuIds: costSkuIds } of byCost.values()) {
    /*
     * Allaqachon to'g'ri pozitsiyalar bazaning o'zida chiqarib tashlanadi —
     * qiymati o'zgarmagan qayta saqlash katta tarixda ham qator tashimaydi.
     * Qo'shimcha xarajat 0 bo'lsa otherCost har qanday donada 0; aks holda u
     * dona soniga bog'liq — ko'p uchraydigan 1–5 dona shu yerda, qolganini
     * pastdagi `itemCostChanged` hal qiladi (natija bir xil, faqat tezroq).
     */
    const purchasePrice = round(cost.purchasePrice);
    const settled: Prisma.OrderItemWhereInput[] =
      cost.extraCost === 0
        ? [{ purchasePrice, otherCost: 0 }]
        : [1, 2, 3, 4, 5].map((qty) => ({ qty, purchasePrice, otherCost: round(cost.extraCost * qty) }));

    for (const ids of chunked(costSkuIds, ID_CHUNK)) {
      // Kalit bo'yicha sahifalash (id > oxirgisi): o'qish orasida qator o'chsa ham to'xtab qolmaydi
      let lastId: string | null = null;
      for (;;) {
        const rows: {
          id: string;
          qty: number;
          revenue: number;
          payout: number;
          purchasePrice: number;
          otherCost: number;
          netProfit: number;
        }[] = await prisma.orderItem.findMany({
          where: { skuId: { in: ids }, NOT: { OR: settled }, ...(lastId ? { id: { gt: lastId } } : {}) },
          select: {
            id: true,
            qty: true,
            revenue: true,
            payout: true,
            purchasePrice: true,
            otherCost: true,
            netProfit: true,
          },
          orderBy: { id: 'asc' },
          take: READ_PAGE,
        });
        if (rows.length === 0) break;
        lastId = rows[rows.length - 1].id;

        const groups = new Map<string, UpdateGroup>();
        for (const it of rows) {
          const next = itemCostFields(it, cost, taxRate);
          if (!itemCostChanged(it, next)) continue;
          const delta = next.netProfit - it.netProfit;
          const key = `${it.purchasePrice}|${it.otherCost}|${next.purchasePrice}|${next.otherCost}|${delta}`;
          const group = groups.get(key) ?? {
            fromPurchasePrice: it.purchasePrice,
            fromOtherCost: it.otherCost,
            next: { purchasePrice: next.purchasePrice, otherCost: next.otherCost },
            delta,
            ids: [],
          };
          group.ids.push(it.id);
          groups.set(key, group);
        }

        const ops: Prisma.PrismaPromise<Prisma.BatchPayload>[] = [];
        for (const g of groups.values()) {
          for (const part of chunked(g.ids, ID_CHUNK)) {
            ops.push(
              prisma.orderItem.updateMany({
                where: { id: { in: part }, purchasePrice: g.fromPurchasePrice, otherCost: g.fromOtherCost },
                data: { ...g.next, netProfit: { increment: g.delta } },
              }),
            );
          }
        }
        if (ops.length > 0) {
          // Bir sahifa — bitta tranzaksiya: foyda yarim yangilangan holatda qolmaydi
          const results = await prisma.$transaction(ops);
          for (const r of results) updated += r.count;
        }

        if (rows.length < READ_PAGE) break;
      }
    }
  }

  return updated;
}
