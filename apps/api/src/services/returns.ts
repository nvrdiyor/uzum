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
 * Ajratish `OrderItem.status` da — importer uni `returnCause` bo'yicha
 * belgilaydi (uzum/live.ts classifyReturn), bu yerda qayta tasniflanmaydi.
 *
 * YAGONA TA'RIF (2026-10-24). Ilgari bir davr uchun uch sahifa uch xil son
 * ko'rsatardi (demo): Boshqaruv paneli 7,6%, Sotuv voronkasi 86 dona / 7,4%,
 * "Qaytarishlar" sahifasi 69 ta / 6,2%. Sahifa qaytarishni o'zining taxminiy
 * sanasi bilan, qolganlari buyurtma sanasi bilan davrga solardi; sahifa ulush
 * asosiga yo'ldagi donani ham qo'shardi; tirik satrdagi qisman qaytishlar esa
 * sahifada umuman yo'q edi. Endi panel kartasi, sahifa jamlari va voronka shu
 * fayldagi qoidadan:
 *
 *  • davr — BUYURTMA sanasi bo'yicha (panel, voronka va savdo bilan bir xil).
 *    Uzum qaytarish sanasini bermaydi: `returnedAt` — topshirilgan sana, taxmin;
 *  • tur va dona — `splitLine` (voronkadagi `collect` bilan aynan bir xil);
 *  • summa — sotuv narxi × dona: Uzum bunday satrda amount = 0 beradi;
 *  • qaytarish ulushi = qaytgan ÷ (xaridor qabul qilgan + qaytgan). Yo'ldagi
 *    dona asosga kirmaydi — u hali qaytishi ham mumkin (analytics.ts bilan bir xil);
 *  • bekor qilish ulushi = bekor qilingan ÷ buyurtma qilingan barcha dona
 *    (voronkadagi "Bekor qilindi" bosqichining ulushi).
 */
import { prisma } from '@savdoiq/db';
import type { Prisma } from '@savdoiq/db';
import { pct, round, type ReturnsSummary } from '@savdoiq/shared';
import { getSkuCatalog, type SkuInfo } from './common.js';

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
  /** Buyurtma sanasi — davr va kunlik dinamika shu bo'yicha */
  orderedAt: Date;
}

// ─────────────────────────── Pozitsiyani ajratish ───────────────────────────

/** `splitLine` uchun kerakli maydonlar */
interface LineFields {
  qty: number;
  returnedQty: number;
  sellPrice: number;
  revenue: number;
  status: string;
  returnedAt: Date | null;
}

interface LineSplit {
  /** Yo'qotilgan donaning turi; null — satrda qaytish ham, bekor qilish ham yo'q */
  kind: ReturnKind | null;
  /** Qaytgan yoki bekor qilingan dona */
  lost: number;
  /** Tirik dona: xaridor qabul qilgan yoki hali yo'lda */
  live: number;
  /** Bir dona narxi — yo'qotilgan summa shu bilan hisoblanadi */
  unitPrice: number;
}

/**
 * Bitta pozitsiyani yo'qotilgan va tirik donaga ajratadi — Sotuv voronkasi
 * (routes/funnel.ts `collect`) bilan AYNAN bir xil qoida, aks holda voronka
 * va panel yana turli son ko'rsatadi:
 *  • holat 'returned' yoki `returnedAt` bor — qaytarish; 'canceled' — bekor
 *    qilish. Dona `returnedQty` da (Uzum amount = 0, amountReturns = N
 *    yuboradi), u bo'lmasa `qty` (kamida 1);
 *  • tirik satrdagi `returnedQty` — qisman qaytarish (xaridor bir nechta
 *    donadan birini qaytargan). Ilgari "Qaytarishlar" sahifasi ularni
 *    ko'rmasdi, voronka va panel esa sanardi.
 */
export function splitLine(it: LineFields): LineSplit {
  const unitPrice = it.sellPrice > 0 ? it.sellPrice : it.qty > 0 ? it.revenue / it.qty : 0;
  const returned = it.status === 'returned' || Boolean(it.returnedAt);
  if (returned || it.status === 'canceled') {
    return {
      kind: returned ? 'returned' : 'canceled',
      lost: it.returnedQty > 0 ? it.returnedQty : Math.max(it.qty, 1),
      live: 0,
      unitPrice,
    };
  }
  const partial = Math.max(0, it.returnedQty);
  return { kind: partial > 0 ? 'returned' : null, lost: partial, live: it.qty, unitPrice };
}

/**
 * Sababsiz qaytarish "eng ko'p sabab" bo'lib chiqmasin: jonli do'konda eng
 * ko'p uchraydigani aynan "Клиент не указал причину" (docs/UZUM-API.md 7.5),
 * u bilan karta hech narsa aytmasdi. Naqsh sayt tarjimasidagi `noReason`
 * qoidasining aynan nusxasi (apps/web/src/lib/returnReasons.ts) — o'zgarsa
 * ikkalasi birga o'zgartiriladi.
 */
const NO_REASON_TEXT = /не\s+указал\s+причин/i;

// Eksport: Sotuv voronkasidagi sabablar ham aynan shu qoida bilan (routes/funnel.ts)
export function realReason(raw: string | null): string | null {
  const value = raw?.trim();
  return value && !NO_REASON_TEXT.test(value) ? value : null;
}

/**
 * Ulush — yagona ta'rif bo'yicha. `qty` — tanlangan qism (sahifada qidiruv yoki
 * sabab filtri bo'lsa, faqat mos qatorlar), asos esa davrniki:
 *  • qaytarish — qaytgan ÷ (xaridor qabul qilgan + qaytgan);
 *  • bekor qilish va ikkalasi birga — buyurtma qilingan barcha donadan.
 */
export function returnsRate(
  kind: ReturnKind | 'all',
  qty: number,
  base: Pick<ReturnsSummary, 'soldUnits' | 'orderedUnits'>,
): number {
  return kind === 'returned' ? pct(qty, base.soldUnits + qty) : pct(qty, base.orderedUnits);
}

// ─────────────────────────── O'qish ───────────────────────────

const ITEM_SELECT = {
  id: true,
  skuId: true,
  skuCode: true,
  title: true,
  qty: true,
  returnedQty: true,
  sellPrice: true,
  revenue: true,
  status: true,
  returnCause: true,
  returnedAt: true,
  orderedAt: true,
  // Topshirilgan sana — "xaridor qabul qilgan" shu bilan (voronkadagi "Sotildi")
  order: { select: { uzumOrderId: true, deliveredAt: true } },
} as const satisfies Prisma.OrderItemSelect;

type Item = Prisma.OrderItemGetPayload<{ select: typeof ITEM_SELECT }>;

/** Davrda BUYURTMA qilingan pozitsiyalar; `lostOnly` — faqat qaytgan yoki bekor qilinganlari */
function loadItems(storeIds: string[], from: Date, toExclusive: Date, lostOnly: boolean): Promise<Item[]> {
  return prisma.orderItem.findMany({
    where: {
      order: { storeId: { in: storeIds } },
      orderedAt: { gte: from, lt: toExclusive },
      ...(lostOnly
        ? { OR: [{ status: { in: ['returned', 'canceled'] } }, { returnedAt: { not: null } }, { returnedQty: { gt: 0 } }] }
        : {}),
    },
    select: ITEM_SELECT,
    // id — bir xil vaqtli satrlar sahifalar orasida o'rin almashmasin
    orderBy: [{ orderedAt: 'desc' }, { id: 'asc' }],
  });
}

function toLines(items: Item[], catalog: Map<string, SkuInfo>): ReturnLine[] {
  const out: ReturnLine[] = [];
  for (const it of items) {
    const s = splitLine(it);
    if (!s.kind || s.lost <= 0) continue;
    const info = it.skuId ? catalog.get(it.skuId) : undefined;
    out.push({
      id: it.id,
      kind: s.kind,
      skuId: it.skuId,
      sku: info?.sku ?? it.skuCode ?? null,
      title: info?.title ?? it.title ?? null,
      imageUrl: info?.imageUrl ?? null,
      orderCode: it.order.uzumOrderId,
      qty: s.lost,
      amount: round(s.unitPrice * s.lost),
      reason: it.returnCause?.trim() || null,
      date: it.returnedAt ?? it.orderedAt,
      orderedAt: it.orderedAt,
    });
  }
  return out;
}

/**
 * Xulosa. `asOf` — "xaridor qabul qilgan" qaysi paytdagi holat bo'yicha
 * olinadi: kelajakdagi `deliveredAt` (demo ma'lumotda bor) hali yo'lda
 * sanaladi — voronka bilan bir xil. Qaytgan va bekor qilingan dona esa
 * yakuniy holati bilan: Uzum ularning sanasini bermaydi.
 */
function buildSummary(items: Item[], catalog: Map<string, SkuInfo>, asOf: Date): ReturnsSummary {
  let soldUnits = 0;
  let orderedUnits = 0;
  const parts = { returned: { qty: 0, amount: 0 }, canceled: { qty: 0, amount: 0 } };
  const reasons = new Map<string, number>();
  const bySku = new Map<string, { returned: number; amount: number; sold: number }>();

  for (const it of items) {
    const s = splitLine(it);
    orderedUnits += s.live + s.lost;

    const deliveredAt = it.order.deliveredAt;
    const handed = deliveredAt !== null && deliveredAt.getTime() <= asOf.getTime() ? s.live : 0;
    soldUnits += handed;

    const lostAmount = s.unitPrice * s.lost;
    if (s.kind && s.lost > 0) {
      parts[s.kind].qty += s.lost;
      parts[s.kind].amount += lostAmount;
    }

    if (s.kind === 'returned' && s.lost > 0) {
      const reason = realReason(it.returnCause);
      if (reason) reasons.set(reason, (reasons.get(reason) ?? 0) + s.lost);
    }

    // SKU kesimi — eng ko'p qaytgan tovar va uning o'z ulushi uchun
    if (it.skuId && (handed > 0 || (s.kind === 'returned' && s.lost > 0))) {
      const k = bySku.get(it.skuId) ?? { returned: 0, amount: 0, sold: 0 };
      k.sold += handed;
      if (s.kind === 'returned') {
        k.returned += s.lost;
        k.amount += lostAmount;
      }
      bySku.set(it.skuId, k);
    }
  }

  const base = { soldUnits, orderedUnits };

  let topReason: ReturnsSummary['topReason'] = null;
  for (const [raw, qty] of reasons) {
    // Teng bo'lsa alifbo bo'yicha — har so'rovda bir xil sabab chiqsin
    if (!topReason || qty > topReason.qty || (qty === topReason.qty && raw < topReason.raw)) {
      topReason = { raw, qty, share: 0 };
    }
  }
  if (topReason) topReason.share = pct(topReason.qty, parts.returned.qty);

  /*
   * Katalogda yo'q SKU (sotuvchi SavdoIQ'da yashirgan mahsulot) reytinglarga
   * aralashmaydi (services/common.ts getSkuCatalog) — keyingisi olinadi.
   * Jami qaytgan dona va summada esa u qoladi: bu haqiqiy yo'qotish.
   */
  let topSku: ReturnsSummary['topSku'] = null;
  const ranked = [...bySku.entries()]
    .filter(([, v]) => v.returned > 0)
    .sort((a, b) => b[1].returned - a[1].returned || b[1].amount - a[1].amount || a[0].localeCompare(b[0]));
  for (const [skuId, v] of ranked) {
    const info = catalog.get(skuId);
    if (!info) continue;
    topSku = {
      skuId,
      productId: info.productId,
      sku: info.sku,
      title: info.title,
      productTitle: info.productTitle,
      imageUrl: info.imageUrl,
      qty: v.returned,
      amount: round(v.amount),
      rate: returnsRate('returned', v.returned, { soldUnits: v.sold, orderedUnits: 0 }),
    };
    break;
  }

  return {
    soldUnits,
    orderedUnits,
    returned: {
      qty: parts.returned.qty,
      amount: round(parts.returned.amount),
      rate: returnsRate('returned', parts.returned.qty, base),
    },
    canceled: {
      qty: parts.canceled.qty,
      amount: round(parts.canceled.amount),
      rate: returnsRate('canceled', parts.canceled.qty, base),
    },
    topReason,
    topSku,
  };
}

// ─────────────────────────── Tashqi funksiyalar ───────────────────────────

/**
 * Davr xulosasi — Boshqaruv paneli kartasi (routes/returnsSummary.ts) va
 * "Qaytarishlar" sahifasi jamlari shu bilan. `toExclusive` — davrdan keyingi
 * kun boshi (lib/period.ts resolveRange).
 */
export async function summarizeReturns(
  storeIds: string[],
  from: Date,
  toExclusive: Date,
  asOf: Date = new Date(),
): Promise<ReturnsSummary> {
  if (storeIds.length === 0) return buildSummary([], new Map(), asOf);
  const [items, catalog] = await Promise.all([
    loadItems(storeIds, from, toExclusive, false),
    getSkuCatalog(storeIds, true),
  ]);
  return buildSummary(items, catalog, asOf);
}

/**
 * "Qaytarishlar" sahifasi: xulosa va qatorlar BITTA o'qishdan — sahifadagi
 * jamlar qatorlar yig'indisiga va panel kartasiga teng bo'lsin.
 */
export async function loadReturns(
  storeIds: string[],
  from: Date,
  toExclusive: Date,
  asOf: Date = new Date(),
): Promise<{ summary: ReturnsSummary; lines: ReturnLine[] }> {
  if (storeIds.length === 0) return { summary: buildSummary([], new Map(), asOf), lines: [] };
  const [items, catalog] = await Promise.all([
    loadItems(storeIds, from, toExclusive, false),
    getSkuCatalog(storeIds, true),
  ]);
  return { summary: buildSummary(items, catalog, asOf), lines: toLines(items, catalog) };
}

/** Davrdagi qaytarish va bekor qilish qatorlari (Excel eksporti) — buyurtma sanasi bo'yicha */
export async function loadReturnLines(storeIds: string[], from: Date, toExclusive: Date): Promise<ReturnLine[]> {
  if (storeIds.length === 0) return [];
  const [items, catalog] = await Promise.all([
    loadItems(storeIds, from, toExclusive, true),
    getSkuCatalog(storeIds, true),
  ]);
  return toLines(items, catalog);
}
