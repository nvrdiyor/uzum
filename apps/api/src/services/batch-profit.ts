/**
 * Partiya foydasi — ma'lumotni yig'ish (hisobning o'zi toza: packages/shared
 * batch-profit.ts). Har so'rovda butun kompaniya bo'yicha qayta hisoblanadi:
 * FIFO hamma partiyalarga umumiy (bir partiyaning sanasi boshqasining sotuviga
 * ta'sir qiladi), buyurtma qatorlari esa har sinxronda qayta yoziladi —
 * saqlangan taqsimot eskirib qolardi.
 *
 * Qaysi sotuv: kompaniyaning barcha do'konlari (yuqoridagi do'kon tanlovi
 * ATAYLAB hisobga olinmaydi — partiya kompaniyaniki), FBO ham FBS ham, tirik
 * pozitsiyalar (bekor qilingan va qaytgan donasiz).
 *
 * Reklama: Uzum'dan import qilingan mahsulot reklamasi (Moliya va Mahsulot
 * foydasi bilan bir xil doira — `marketing`, `uzum-payout` emas, izohida
 * "tovar IDsi") kunlik to'lov bo'yicha o'sha kuni topshirilgan sotuvlarga
 * bo'linadi (shared `spreadAdFees`) va qaytgan puldan ayriladi.
 */
import { prisma } from '@savdoiq/db';
import {
  allocateBatchSales,
  matchBatchSuppliesDetailed,
  shiftIsoDay,
  SUPPLY_MATCH_DAYS,
  spreadAdFees,
  calcBatch,
  matchesSkuQuery,
  normalizeCardText,
  normSkuCode,
  parseSkuQuery,
  profitRow,
  parseSkuCodes,
  resolveRowLinks,
  summarizeBatchProfit,
  toBusinessDate,
  type AdBaseLine,
  type AdFeeInput,
  type BatchSkuOption,
  type BatchSkuSearchResponse,
  type BatchProfitDetail,
  type BatchProfitFix,
  type BatchProfitListResponse,
  type BatchProfitOrder,
  type BatchProfitRow,
  type BatchProfitSku,
  type BatchProfitSummary,
  type BatchProfitTotals,
  type BatchProfitUnattributed,
  type ProfitLineInput,
  type ProfitLotInput,
  type ProfitMoneyState,
  type ProfitOpeningInput,
  type ProfitRowInput,
  type ProfitTake,
  type BatchStage,
  type BatchSupplyInfo,
  type BatchSupplyRef,
  type BatchSupplyStatus,
  type ResolvedRowLink,
  type ShipmentStatus,
} from '@savdoiq/shared';
import { getStoreIds, getTaxRate } from './common.js';
import { shipKeyOf } from './batch-keys.js';
import { adProductId } from './pnl.js';

const MAX_BATCHES = 500;
/** Bitta `IN (...)` ro'yxatidagi qiymatlar — SQLite o'zgaruvchilar chegarasidan ancha past */
const IN_CHUNK = 500;
/** Qator bo'yicha qaytariladigan sotuvlar (tekshirish ro'yxati) */
const ORDERS_PER_ROW = 50;
/** Uzum'ning umrbod hisoblagichi bizdagidan shuncha ko'p bo'lsa — tarix to'liq emas */
const HISTORY_GAP_MIN = 1;
/** Kelgan sana taklifi: «Keldi» kunidan shuncha kun oldingacha bo'lgan Uzum qabuli */
const FIX_LOOKBACK_DAYS = 120;
/** Reklama qatorlari bazadan partiyadagi mahsulot ID'lari bo'yicha olinadi (undan ko'p bo'lsa — hammasi) */
const AD_NOTE_FILTER_MAX = 300;

const chunk = <T>(items: readonly T[], size = IN_CHUNK): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
};
const isoDay = (d: Date | null | undefined): string | null => (d ? d.toISOString().slice(0, 10) : null);
const toStatus = (v: string): ShipmentStatus => (v === 'shipped' || v === 'arrived' ? v : 'warehouse');
const toDelivery = (v: string): 'avia' | 'avto' => (v === 'avia' ? 'avia' : 'avto');

interface LoadedRow {
  name: string;
  qty: number;
  cost: number;
  extraExcluded: boolean;
  cargoName: string;
  delivery: 'avia' | 'avto';
  trip: string;
  noKg: boolean;
  legStatus: ShipmentStatus;
  shippedAt: string | null;
  arrivedAt: string | null;
  link: ResolvedRowLink;
  /** `lots` dagi o'rni; lot bo'lmasa -1 */
  lot: number;
}

interface LoadedBatch {
  id: string;
  name: string;
  createdAt: Date;
  undistributed: number;
  rows: LoadedRow[];
}

export interface BatchProfitBook {
  batches: LoadedBatch[];
  totals: Map<string, BatchProfitTotals>;
  rowsOf: Map<string, BatchProfitRow[]>;
  /** Partiya → uning Uzum ta'minlashlari */
  suppliesOf: Map<string, BatchSupplyInfo[]>;
  unattributed: BatchProfitUnattributed;
  skus: Map<string, BatchProfitSku>;
  taxRate: number;
  syncedAt: string | null;
  storeCount: number;
}

/**
 * Butun kompaniya bo'yicha partiya foydasi. `now` — testlar uchun (pul holati:
 * kelajakdagi yetkazish sanasi hali yo'lda).
 */
export async function loadBatchProfit(companyId: string, now: Date = new Date()): Promise<BatchProfitBook> {
  const [batchRecs, ships, storeIds, taxRate, stores, account] = await Promise.all([
    prisma.purchaseBatch.findMany({
      where: { companyId },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: MAX_BATCHES,
      select: {
        id: true,
        name: true,
        rate: true,
        extra: true,
        createdAt: true,
        items: {
          orderBy: { position: 'asc' },
          select: {
            name: true,
            qty: true,
            priceCny: true,
            cargoCost: true,
            weightKg: true,
            extraExcluded: true,
            cargoName: true,
            delivery: true,
            trip: true,
            skuCodes: true,
          },
        },
      },
    }),
    prisma.purchaseBatchShipment.findMany({ where: { batch: { companyId } } }),
    getStoreIds(companyId),
    getTaxRate(companyId),
    prisma.store.findMany({ where: { companyId }, select: { id: true, title: true } }),
    prisma.uzumAccount.findFirst({ where: { companyId, lastSyncAt: { not: null } }, orderBy: { lastSyncAt: 'desc' }, select: { lastSyncAt: true } }),
  ]);

  // ── Qatorlar: tannarx, jo'natma holati, bog'lanish ──
  const shipOf = new Map(ships.map((sh) => [`${sh.batchId}|${sh.cargoKey}|${sh.delivery}`, sh]));
  const links = resolveRowLinks(
    batchRecs.map((b) => ({
      id: b.id,
      name: b.name,
      createdAt: b.createdAt.toISOString(),
      items: b.items.map((it) => ({ name: it.name, skuCodes: parseSkuCodes(it.skuCodes), extraExcluded: it.extraExcluded })),
    })),
  );

  const lots: ProfitLotInput[] = [];
  const batches: LoadedBatch[] = batchRecs.map((b, bi) => {
    const calc = calcBatch(b.rate, b.extra, b.items);
    const rows = b.items.map<LoadedRow>((it, ri) => {
      const r = calc.rows[ri];
      const delivery = toDelivery(it.delivery);
      const leg = shipOf.get(`${b.id}|${shipKeyOf(it.cargoName, it.trip)}|${delivery}`);
      const legStatus = toStatus(leg?.status ?? 'warehouse');
      const link = links[bi][ri];
      const qty = Math.max(0, Math.floor(it.qty || 0));
      const row: LoadedRow = {
        name: it.name,
        qty,
        cost: r.total + r.extraShare,
        extraExcluded: it.extraExcluded,
        cargoName: it.cargoName,
        delivery,
        trip: it.trip,
        noKg: qty > 0 && r.unitCostFull === null,
        legStatus,
        shippedAt: isoDay(leg?.shippedAt),
        arrivedAt: legStatus === 'arrived' ? isoDay(leg?.arrivedAt) : null,
        link,
        lot: -1,
      };
      if ((link.link === 'explicit' || link.link === 'name') && qty > 0 && link.codes.length > 0) {
        row.lot = lots.length;
        lots.push({
          batchId: b.id,
          batchCreatedAt: b.createdAt.toISOString(),
          position: ri,
          qty,
          codes: [...new Set(link.codes.map(normSkuCode))],
          // «Keldi», lekin sanasiz (eski yozuv) — darvozasiz
          availableFrom: legStatus === 'arrived' ? (row.arrivedAt ?? '0000-01-01') : null,
          // Hali kelmagan lotga undan oldingi sotuv ayblanmaydi: u jo'natilmagan (yoki partiya hali yo'q) edi
          notBefore: row.shippedAt ?? toBusinessDate(b.createdAt),
        });
      }
      return row;
    });
    const undistributed = calc.totals.extra - calc.rows.reduce((a, r) => a + r.extraShare, 0);
    return { id: b.id, name: b.name, createdAt: b.createdAt, undistributed, rows };
  });

  // ── Katalog: kod → SKU'lar ──
  /** Sotuvi o'qiladigan kodlar — lotlarniki (soni bor bog'langan qatorlar) */
  const codes = new Set(lots.flatMap((l) => l.codes));
  /** Ko'rsatish uchun — barcha bog'lanishlardagi kodlar (soni hali yozilmagan qatorniki ham) */
  const shownCodes = new Set([...codes, ...links.flat().flatMap((l) => l.codes.map(normSkuCode))]);
  const skuRecs = storeIds.length
    ? await prisma.sku.findMany({
        where: { storeId: { in: storeIds } },
        select: {
          id: true,
          sku: true,
          title: true,
          imageUrl: true,
          storeId: true,
          uzumSold: true,
          uzumReturned: true,
          product: { select: { title: true, uzumProductId: true } },
        },
      })
    : [];
  const storeTitle = new Map(stores.map((s) => [s.id, s.title]));
  const codeOfSku = new Map<string, string>();
  const skus = new Map<string, BatchProfitSku>();
  const skuIdsOfCode = new Map<string, string[]>();
  for (const s of skuRecs) {
    const code = normSkuCode(s.sku);
    codeOfSku.set(s.id, code);
    if (!shownCodes.has(code)) continue;
    if (codes.has(code)) {
      const ids = skuIdsOfCode.get(code);
      if (ids) ids.push(s.id);
      else skuIdsOfCode.set(code, [s.id]);
    }
    const cur = skus.get(code);
    const store = storeTitle.get(s.storeId) ?? '';
    if (cur) {
      if (store && !cur.stores.includes(store)) cur.stores.push(store);
      if (!cur.imageUrl && s.imageUrl) cur.imageUrl = s.imageUrl;
    } else {
      skus.set(code, { code: s.sku, title: s.title || s.product.title, imageUrl: s.imageUrl, stores: store ? [store] : [] });
    }
  }
  const relevantSkuIds = [...skuIdsOfCode.values()].flat();
  // Katalogsiz (SKU'si o'chgan) pozitsiyalar kodi bo'yicha: bog'lanishdagi va katalogdagi yozilishlar
  const rawCodes = [
    ...new Set([
      ...batches.flatMap((b) => b.rows.filter((r) => r.lot >= 0).flatMap((r) => r.link.codes.map((c) => c.trim()))),
      ...skuRecs.filter((s) => codes.has(normSkuCode(s.sku))).map((s) => s.sku),
    ]),
  ];

  // ── Sotuvlar ──
  const lineRecs: {
    id: string;
    skuId: string | null;
    skuCode: string | null;
    qty: number;
    payout: number;
    revenue: number;
    orderedAt: Date;
    order: { status: string; deliveredAt: Date | null; uzumOrderId: string | null };
  }[] = [];
  const lineSelect = {
    id: true,
    skuId: true,
    skuCode: true,
    qty: true,
    payout: true,
    revenue: true,
    orderedAt: true,
    order: { select: { status: true, deliveredAt: true, uzumOrderId: true } },
  } as const;
  const liveWhere = {
    order: { storeId: { in: storeIds } },
    status: { notIn: ['canceled', 'returned'] },
    returnedAt: null,
    qty: { gt: 0 },
  };
  if (storeIds.length && codes.size) {
    // push(...rows) EMAS: ~125 mingdan ko'p argument V8 stekini to'ldiradi
    for (const part of chunk(relevantSkuIds)) {
      for (const l of await prisma.orderItem.findMany({ where: { ...liveWhere, skuId: { in: part } }, select: lineSelect })) lineRecs.push(l);
    }
    for (const part of chunk(rawCodes)) {
      for (const l of await prisma.orderItem.findMany({ where: { ...liveWhere, skuId: null, skuCode: { in: part } }, select: lineSelect })) lineRecs.push(l);
    }
  }
  const nowMs = now.getTime();
  const stateOf = (o: { status: string; deliveredAt: Date | null }): ProfitMoneyState =>
    !o.deliveredAt || o.deliveredAt.getTime() > nowMs ? 'transit' : o.status === 'new' || o.status === 'processing' ? 'held' : 'unlocked';
  const lines: ProfitLineInput[] = [];
  const lineOrderNo: (string | null)[] = [];
  /** `lines` bilan bir xil tartibda: reklama ulushi uchun */
  const lineSku: (string | null)[] = [];
  const lineDelivered: (Date | null)[] = [];
  for (const l of lineRecs) {
    // Katalogdagi kod ustun: pozitsiyadagi kod eski bo'lishi mumkin
    const code = (l.skuId ? codeOfSku.get(l.skuId) : undefined) ?? normSkuCode(l.skuCode ?? '');
    if (!codes.has(code)) continue;
    lines.push({
      id: l.id,
      code,
      day: toBusinessDate(l.orderedAt),
      at: l.orderedAt.getTime(),
      units: l.qty,
      payout: l.payout,
      revenue: l.revenue,
      tax: Math.round((l.revenue * taxRate) / 100),
      state: stateOf(l.order),
    });
    lineOrderNo.push(l.order.uzumOrderId);
    lineSku.push(l.skuId);
    lineDelivered.push(l.order.deliveredAt);
  }

  /*
   * ── Uzum reklamasi ──
   * Mahsulotning kunlik to'lovi o'sha kuni xaridorga topshirilgan shu mahsulot
   * sotuvlariga bo'linadi. Bo'linish asosida mahsulotning BARCHA SKU'lari —
   * partiyaga bog'lanmagan ranglari ham: aks holda reklama faqat bog'langan
   * rangga yig'ilib, partiya foydasi kam chiqardi. Ularning ulushi partiyalarga
   * kirmaydi. Hali topshirilmagan (yo'ldagi) sotuvdan reklama yechilmagan.
   */
  const productOfSku = new Map<string, string>();
  const productsOfCode = new Map<string, Set<string>>();
  for (const s of skuRecs) {
    const pid = s.product.uzumProductId;
    if (!pid) continue;
    productOfSku.set(s.id, pid);
    const code = normSkuCode(s.sku);
    const set = productsOfCode.get(code);
    if (set) set.add(pid);
    else productsOfCode.set(code, new Set([pid]));
  }
  /** Katalogsiz pozitsiya — kodi faqat bitta mahsulotda bo'lsa o'sha */
  const productOfCode = (code: string): string | undefined => {
    const set = productsOfCode.get(code);
    return set && set.size === 1 ? [...set][0] : undefined;
  };
  /*
   * Faqat partiyadagi mahsulotlar reklamasi: boshqa mahsulot reklamasi partiyalarga
   * tushmaydi, uning sotuvlarini o'qish esa katta do'konda hisobni o'n barobar
   * sekinlashtirardi (300 ta reklamali mahsulot: 0,15 s → 4 s).
   */
  const batchProducts = new Set<string>();
  lines.forEach((ln, k) => {
    const sku = lineSku[k];
    const pid = sku ? productOfSku.get(sku) : productOfCode(ln.code);
    if (pid) batchProducts.add(pid);
  });
  for (const id of relevantSkuIds) {
    const pid = productOfSku.get(id);
    if (pid) batchProducts.add(pid);
  }
  let adUnplaced = 0;
  const batchPids = [...batchProducts];
  const adRecs =
    storeIds.length && batchPids.length
      ? await prisma.expense.findMany({
          // Doira — Mahsulot foydasidagi getAdFeesBySku (pnl.ts) bilan bir xil; izohida partiyadagi mahsulot ID'si
          where: {
            companyId,
            category: 'marketing',
            source: { not: 'uzum-payout' },
            AND: [
              { OR: [{ storeId: { in: storeIds } }, { storeId: null }] },
              ...(batchPids.length <= AD_NOTE_FILTER_MAX ? [{ OR: batchPids.map((pid) => ({ note: { contains: pid } })) }] : []),
            ],
          },
          select: { date: true, amount: true, note: true },
        })
      : [];
  const adFees: AdFeeInput[] = [];
  for (const r of adRecs) {
    const product = adProductId(r.note);
    // Xarajat kuni bazada "kun 00:00Z" bo'lib yozilgan (importer.ts dayStart) — sana qismi o'sha kun
    if (product && r.amount && batchProducts.has(product)) adFees.push({ product, day: r.date.toISOString().slice(0, 10), amount: r.amount });
  }
  if (adFees.length) {
    const adProducts = new Set(adFees.map((f) => f.product));
    /*
     * Topshirilgan kun — reklama yozuvi bilan BIR XIL hisobda: Uzum to'lov vaqtini
     * (dateService) bazaga UTC sanasi bilan yozadi (importer.ts dayStart). Toshkent kuni
     * olinsa, kechasi (00:00–05:00) topshirilgan sotuv boshqa kunga o'tib, o'sha kungi
     * reklama boshqa sotuvga tushardi.
     */
    const deliveredDay = (d: Date | null): string | null => (d && d.getTime() <= nowMs ? isoDay(d) : null);

    const base: AdBaseLine[] = [];
    const baseRef: number[] = [];
    lines.forEach((ln, k) => {
      const sku = lineSku[k];
      const product = sku ? productOfSku.get(sku) : productOfCode(ln.code);
      const day = deliveredDay(lineDelivered[k]);
      if (!product || !day || !adProducts.has(product)) return;
      base.push({ product, day, revenue: ln.revenue });
      baseRef.push(k);
    });
    const extraSkuIds = skuRecs
      .filter((s) => !codes.has(normSkuCode(s.sku)) && s.product.uzumProductId !== null && adProducts.has(s.product.uzumProductId))
      .map((s) => s.id);
    for (const part of chunk(extraSkuIds)) {
      const recs = await prisma.orderItem.findMany({
        where: { ...liveWhere, skuId: { in: part }, order: { storeId: { in: storeIds }, deliveredAt: { lte: now } } },
        select: { skuId: true, revenue: true, order: { select: { deliveredAt: true } } },
      });
      for (const l of recs) {
        const product = l.skuId ? productOfSku.get(l.skuId) : undefined;
        const day = deliveredDay(l.order.deliveredAt);
        if (!product || !day) continue;
        base.push({ product, day, revenue: l.revenue });
        baseRef.push(-1);
      }
    }

    const spread = spreadAdFees(adFees, base);
    spread.perLine.forEach((v, i) => {
      const k = baseRef[i];
      if (k >= 0 && v !== 0) lines[k].adFee = (lines[k].adFee ?? 0) + v;
    });
    for (const v of spread.unplaced.values()) adUnplaced += v;
  }

  /*
   * ── Uzum ta'minlashlari (FBO nakladnoylar) ──
   * Partiya tovari Uzum ombori QABUL QILGAN kundan sotuvda (2026-11-12, egasi:
   * "3-partiya hali yetib bormagan, qabul jarayonida — lekin sotildi turibdi").
   * «Keldi» — tovar sotuvchiga kelgani: undan keyin Uzum ta'minlashi yaratiladi,
   * omborga topshiriladi va qabul qilinadi. Qaysi ta'minlash qaysi partiyaniki —
   * kodlar va sanalar bo'yicha (shared `matchBatchSupplies`). Bekor qilingan va
   * qoralama ta'minlash hisobga olinmaydi.
   */
  const supplyRecs =
    storeIds.length && codes.size
      ? await prisma.shipment.findMany({
          where: { companyId, source: 'uzum', status: { notIn: ['canceled', 'draft'] } },
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          select: {
            id: true,
            code: true,
            status: true,
            acceptedAt: true,
            plannedAt: true,
            createdAt: true,
            items: { select: { skuId: true, qty: true, accepted: true } },
          },
        })
      : [];
  interface LoadedSupply {
    code: string;
    status: BatchSupplyStatus;
    /** Qabul qilingan kun; kutilayotgani — yaratilgan kun */
    day: string;
    codes: Set<string>;
    /** Kod → Uzum qabul qilgan dona */
    acceptedBy: Map<string, number>;
    /** Kod → rejadagi dona */
    plannedBy: Map<string, number>;
    planned: number;
    accepted: number;
  }
  const supplies: LoadedSupply[] = [];
  for (const s of supplyRecs) {
    const status: BatchSupplyStatus =
      s.status === 'accepted' ? 'accepted' : s.status === 'accepting' ? 'accepting' : s.status === 'in_transit' ? 'in_transit' : 'planned';
    const sup: LoadedSupply = {
      code: s.code,
      status,
      // Tovar balansi bilan bir xil qoida (stock-balance.ts): qabul payti, bo'lmasa reja, bo'lmasa yaratilgan
      day: toBusinessDate(status === 'accepted' ? (s.acceptedAt ?? s.plannedAt ?? s.createdAt) : s.createdAt),
      codes: new Set(),
      acceptedBy: new Map(),
      plannedBy: new Map(),
      planned: 0,
      accepted: 0,
    };
    for (const it of s.items) {
      sup.planned += it.qty;
      sup.accepted += it.accepted;
      const code = codeOfSku.get(it.skuId);
      if (!code) continue;
      sup.codes.add(code);
      sup.plannedBy.set(code, (sup.plannedBy.get(code) ?? 0) + it.qty);
      if (it.accepted > 0) sup.acceptedBy.set(code, (sup.acceptedBy.get(code) ?? 0) + it.accepted);
    }
    if (sup.codes.size) supplies.push(sup);
  }

  /*
   * Tarix to'liqmi: Uzum'ning umrbod hisoblagichi (sotilgan + qaytgan) bizdagi
   * barcha pozitsiyalardan ko'p bo'lsa — buyurtmalarning bir qismi SavdoIQ
   * tarixidan oldin. Tovar balansi bilan bir xil o'lchov (stock-balance.ts).
   */
  const dbUnits = new Map<string, number>();
  for (const part of chunk(relevantSkuIds)) {
    const sums = await prisma.orderItem.groupBy({ by: ['skuId'], where: { skuId: { in: part } }, _sum: { qty: true, returnedQty: true } });
    for (const s of sums) if (s.skuId) dbUnits.set(s.skuId, (s._sum.qty ?? 0) + (s._sum.returnedQty ?? 0));
  }
  const historyGap = new Map<string, number>();
  for (const s of skuRecs) {
    const code = codeOfSku.get(s.id);
    if (!code || !codes.has(code)) continue;
    const uzumUnits = s.uzumSold + s.uzumReturned;
    if (uzumUnits <= 0) continue;
    const gap = uzumUnits - (dbUnits.get(s.id) ?? 0);
    if (gap >= HISTORY_GAP_MIN) historyGap.set(code, (historyGap.get(code) ?? 0) + gap);
  }

  // ── Ta'minlash ↔ partiya ──
  const minDay = (days: readonly (string | null)[]): string | null => days.filter((d): d is string => Boolean(d)).sort()[0] ?? null;
  const batchCodes = batches.map((b) => new Set(b.rows.filter((r) => r.lot >= 0).flatMap((r) => lots[r.lot].codes)));
  const batchShipped = batches.map((b) => minDay(b.rows.filter((r) => r.qty > 0).map((r) => r.shippedAt)));
  const { owner, extra } = matchBatchSuppliesDetailed(
    batches.map((b, bi) => ({
      codes: batchCodes[bi],
      anchor:
        minDay(b.rows.filter((r) => r.qty > 0 && r.legStatus === 'arrived').map((r) => r.arrivedAt)) ??
        batchShipped[bi] ??
        toBusinessDate(b.createdAt),
      shippedFrom: batchShipped[bi],
      canBeAtUzum: b.rows.some((r) => r.qty > 0 && r.legStatus === 'arrived'),
      capacity: b.rows.reduce((a, r) => a + (r.lot >= 0 ? r.qty : 0), 0),
    })),
    supplies.map((s) => ({
      day: s.day,
      accepted: s.status === 'accepted',
      codes: s.codes,
      units: s.status === 'accepted' ? s.acceptedBy : s.plannedBy,
    })),
  );
  /** Partiya → uning ta'minlashlari (kun tartibida): asosiylari va kodi bo'yicha qo'shilganlari */
  const suppliesOfBatch: LoadedSupply[][] = batches.map(() => []);
  /** Ta'minlash ↔ partiya bog'langanmi (asosiy yoki kodi bo'yicha) */
  const claimed = supplies.map((_, si) => owner[si] !== null || extra[si].size > 0);
  supplies.forEach((sup, si) => {
    const bis = new Set<number>();
    if (owner[si] !== null) bis.add(owner[si] as number);
    for (const bi of extra[si].values()) bis.add(bi);
    for (const bi of bis) suppliesOfBatch[bi].push(sup);
  });
  for (const list of suppliesOfBatch) list.sort((a, b) => a.day.localeCompare(b.day) || a.code.localeCompare(b.code));
  /*
   * Rejim: partiya tovari Uzum ta'minlashlarida uchrasa — "ta'minlash" (sotuv Uzum
   * qabul qilgan kundan). Hech birida uchramasa (FBS/DBS sotuvchi, nakladnoy yo'q) —
   * avvalgidek «Keldi» kunidan.
   */
  const supplyCodes = new Set(supplies.flatMap((s) => [...s.codes]));
  const supplyMode = batchCodes.map((set) => [...set].some((c) => supplyCodes.has(c)));
  /*
   * Qator sotuvga chiqqan kun — partiya ta'minlashlaridan: o'z tovari bor, o'z jo'natmasi
   * kelgandan keyingi (bir-ikki kun oldin ham) eng erta qabul; bunday bo'lmasa — o'z tovari
   * bor eng erta qabul («Keldi» sanasi kech yozilgan); o'z kodi ta'minlashda bo'lmasa —
   * partiyaning qabuli. Jo'natmasi hali «Keldi» bo'lmagan qator sotuvda emas: avia kelib
   * sotilayotganda avto yo'lda bo'lishi mumkin.
   */
  const firstAfter = (list: readonly LoadedSupply[], arrivedAt: string | null): LoadedSupply | undefined =>
    (arrivedAt ? list.find((s) => s.day >= shiftIsoDay(arrivedAt, -SUPPLY_MATCH_DAYS)) : undefined) ?? list[0];
  /*
   * Qator kodi qatnashgan partiya ta'minlashlari: qabul qilinganlari va hali kutilayotganlari.
   * O'z tovari kutilayotgan ta'minlashda bo'lsa — qator o'shani kutadi (avia qabul qilingan,
   * avto hali qabulda; yoki bir qator qabul qilingan, boshqasi hali qabulda).
   */
  const ownSupplies = (bi: number, lot: ProfitLotInput) => {
    const mine = suppliesOfBatch[bi].filter((s) => lot.codes.some((c) => s.codes.has(c)));
    return { acc: mine.filter((s) => s.status === 'accepted'), pend: mine.filter((s) => s.status !== 'accepted') };
  };
  const availableOf = (bi: number, r: LoadedRow): string | null => {
    if (r.lot < 0 || r.legStatus !== 'arrived') return null;
    const { acc, pend } = ownSupplies(bi, lots[r.lot]);
    const after = r.arrivedAt ? acc.find((s) => s.day >= shiftIsoDay(r.arrivedAt as string, -SUPPLY_MATCH_DAYS)) : acc[0];
    if (after) return after.day;
    if (pend.length) return null;
    if (acc.length) return acc[0].day;
    // Kodi partiyaning hech bir ta'minlashida yo'q: partiyaning qabuli, partiyada kutilayotgani bo'lmasa
    const batchAcc = suppliesOfBatch[bi].filter((s) => s.status === 'accepted');
    if (suppliesOfBatch[bi].some((s) => s.status !== 'accepted')) return null;
    return firstAfter(batchAcc, r.arrivedAt)?.day ?? null;
  };
  batches.forEach((b, bi) => {
    for (const r of b.rows) {
      if (r.lot < 0) continue;
      const lot = lots[r.lot];
      if (!supplyMode[bi]) {
        // Nakladnoysiz: Xitoy omboridagi tovarga sotuv "ayblanmaydi" — u hali yo'lga ham chiqmagan
        if (r.legStatus === 'warehouse') lot.blame = false;
        continue;
      }
      lot.availableFrom = availableOf(bi, r);
      // Qabul kuni aniq: undan oldingi sotuv bu partiyadan bo'lolmaydi — "ayblanmaydi"
      lot.blame = false;
      lot.notBefore = null;
    }
  });

  /*
   * Eski qoldiq: Uzum qabul qilgan, lekin hech qaysi partiyaga tegishli bo'lmagan
   * dona (partiyalar kiritilishidan oldingi xarid yoki partiyasi kiritilmagan
   * ta'minlash). Ular qabul kunidan sotuvda, birinchi sotiladi va hech qaysi
   * partiyaga yozilmaydi. Uzum hisoblagichi SavdoIQ tarixidan ko'p sotuv
   * ko'rsatsa, o'sha farq eng eski qoldiqdan ayriladi: u tarixdan oldin sotilgan.
   */
  const openings: ProfitOpeningInput[] = [];
  const openRaw = new Map<string, { day: string; units: number }[]>();
  supplies.forEach((s, si) => {
    if (s.status !== 'accepted') return;
    const bi = owner[si];
    for (const [code, units] of s.acceptedBy) {
      if (!codes.has(code)) continue;
      if ((bi !== null && batchCodes[bi].has(code)) || extra[si].has(code)) continue;
      const list = openRaw.get(code);
      if (list) list.push({ day: s.day, units });
      else openRaw.set(code, [{ day: s.day, units }]);
    }
  });
  for (const [code, list] of openRaw) {
    list.sort((a, b) => a.day.localeCompare(b.day));
    let skip = historyGap.get(code) ?? 0;
    for (const r of list) {
      const units = Math.max(0, r.units - skip);
      skip = Math.max(0, skip - r.units);
      if (units > 0) openings.push({ code, day: r.day, units });
    }
  }

  // ── Taqsimlash ──
  const alloc = allocateBatchSales(lots, openings, lines);

  /*
   * Ta'minlash rejimida sana taklifi: qator hali sotuvda emas, lekin Uzum uning tovarini
   * qabul qilgan va o'sha qabul hech qaysi partiyaga tegishli bo'lmay qolgan (eski qoldiq
   * deb hisoblangan) — «Keldi» belgilanmagan yoki kelgan sana juda kech yozilgan
   * (eski partiya keyin kiritilgan). Taklif — o'sha qabul kuni; bosilsa partiya o'z
   * ta'minlashini oladi.
   */
  const supplyFixOf = (r: LoadedRow): BatchProfitFix | null => {
    if (r.lot < 0) return null;
    const lot = lots[r.lot];
    const days = supplies
      .filter(
        (s, si) =>
          s.status === 'accepted' &&
          !claimed[si] &&
          lot.codes.some((c) => s.codes.has(c)) &&
          (!r.shippedAt || s.day >= r.shippedAt),
      )
      .map((s) => s.day)
      .sort();
    const leg = { cargoName: r.cargoName, delivery: r.delivery, trip: r.trip, shippedAt: r.shippedAt };
    if (r.legStatus === 'arrived' && r.arrivedAt) {
      /*
       * Kelgan kundan oldingi, sotuvga chiqqan kundan ham oldingi qabul (to'rt oydan uzog'i —
       * boshqa, eski tovar). Kelgan kunga eng yaqini: sana kech yozilgan bo'lsa ham shu.
       */
      const from = shiftIsoDay(r.arrivedAt, -FIX_LOOKBACK_DAYS);
      const until = lot.availableFrom && lot.availableFrom < r.arrivedAt ? lot.availableFrom : r.arrivedAt;
      const before = days.filter((d) => d < until && d >= from);
      const date = before[before.length - 1];
      return date ? { kind: 'earlier', date, basis: 'invoice', ...leg } : null;
    }
    // Yo'lda deb turibdi, lekin jo'natilgandan keyin Uzum qabul qilgan
    if (r.legStatus === 'shipped' && r.shippedAt && !lot.availableFrom && days.length) {
      return { kind: 'arrive', date: days[0], basis: 'invoice', ...leg };
    }
    return null;
  };

  // ── Partiyalar va qatorlar ──
  const totals = new Map<string, BatchProfitTotals>();
  const rowsOf = new Map<string, BatchProfitRow[]>();
  const suppliesOf = new Map<string, BatchSupplyInfo[]>();
  batches.forEach((b, bi) => {
    const own = suppliesOfBatch[bi];
    suppliesOf.set(
      b.id,
      own.map((s) => ({ code: s.code, status: s.status, day: s.day, planned: s.planned, accepted: s.accepted })),
    );
    const acceptedOwn = own.filter((s) => s.status === 'accepted');
    const pendingOwn = own.filter((s) => s.status !== 'accepted');
    // Partiya Uzumga topshirilgan, hali qabul qilinmagan: qabul boshlangan bo'lsa — "qabul qilinmoqda"
    const pendingStage: BatchStage | null = pendingOwn.some((s) => s.status === 'accepting')
      ? 'accepting'
      : pendingOwn.length
        ? 'toUzum'
        : null;
    const refOf = (s: LoadedSupply | undefined): BatchSupplyRef | null => (s ? { code: s.code, status: s.status, day: s.day } : null);

    /** Qator sotuvdami, qachondan va qaysi ta'minlash bilan */
    const sale = b.rows.map((r) => {
      const lot = r.lot >= 0 ? lots[r.lot] : null;
      if (!supplyMode[bi]) {
        // «Keldi» kunidan (nakladnoysiz sotuvchi); sanasiz eski «Keldi» — sana noma'lum
        const onSale = r.legStatus === 'arrived';
        return { onSale, from: onSale ? r.arrivedAt : null, supply: null as BatchSupplyRef | null, pend: null as BatchStage | null };
      }
      const mine = (s: LoadedSupply) => (lot ? lot.codes.some((c) => s.codes.has(c)) : false);
      const arrived = r.legStatus === 'arrived';
      // Bog'lanmagan qator — partiyaning qabuli (o'z jo'natmasi kelgan bo'lsa)
      const from = lot ? lot.availableFrom : arrived ? (firstAfter(acceptedOwn, r.arrivedAt)?.day ?? null) : null;
      const waitFor = arrived && !from ? (pendingOwn.find(mine) ?? pendingOwn[0]) : undefined;
      const supply = from
        ? refOf(acceptedOwn.find((s) => s.day === from && mine(s)) ?? acceptedOwn.find((s) => s.day === from))
        : refOf(waitFor);
      // Qatorning o'z kutilayotgan ta'minlashi bo'yicha: qabul boshlangan — "qabul qilinmoqda"
      const pend: BatchStage | null = waitFor ? (waitFor.status === 'accepting' ? 'accepting' : 'toUzum') : null;
      return { onSale: from !== null, from, supply, pend };
    });

    const inputs: ProfitRowInput[] = b.rows.map((r, ri) => {
      const take = r.lot >= 0 ? alloc.lots[r.lot] : null;
      const { onSale, from } = sale[ri];
      const soldAll = take !== null && r.qty > 0 && take.sold >= r.qty;
      const stage: BatchStage = onSale
        ? soldAll
          ? 'soldOut'
          : 'selling'
        : supplyMode[bi] && r.legStatus === 'arrived' && (sale[ri].pend ?? pendingStage)
          ? ((sale[ri].pend ?? pendingStage) as BatchStage)
          : r.legStatus;
      return {
        name: r.name,
        link: r.link.link,
        qty: r.qty,
        cost: r.cost,
        legStatus: r.legStatus,
        take,
        optedOut: r.link.optedOut,
        onSale,
        stage,
        onSaleFrom: from,
      };
    });
    totals.set(b.id, summarizeBatchProfit(inputs, b.undistributed));
    rowsOf.set(
      b.id,
      b.rows.map((r, index) => {
        const take = r.lot >= 0 ? alloc.lots[r.lot] : null;
        const calc = profitRow(inputs[index]);
        const pieces = take ? [...take.pieces].sort((x, y) => lines[y.line].at - lines[x.line].at || y.line - x.line) : [];
        const orders: BatchProfitOrder[] = pieces.slice(0, ORDERS_PER_ROW).map((p) => ({
          orderNo: lineOrderNo[p.line],
          day: lines[p.line].day,
          units: p.units,
          moneyBack: p.payout - p.tax - p.adFee,
          adFee: p.adFee,
          state: lines[p.line].state,
        }));
        return {
          ...calc,
          index,
          name: r.name,
          link: r.link.link,
          codes: r.link.codes,
          linkFrom: r.link.from,
          optedOut: r.link.optedOut,
          qty: r.qty,
          legStatus: r.legStatus,
          arrivedAt: r.arrivedAt,
          beforeArrival: take?.beforeArrival ?? 0,
          notMarked: take?.notMarked ?? 0,
          firstSaleAt: take?.firstDay ?? null,
          lastSaleAt: take?.lastDay ?? null,
          soldOutAt: take && calc.left === 0 ? take.soldOutDay : null,
          missingCodes: r.link.codes.filter((c) => !skus.has(normSkuCode(c))),
          // Ta'minlash rejimida kelgan kun Uzum qabulidan — tuzatadigan narsa yo'q
          fix: take ? (supplyMode[bi] ? supplyFixOf(r) : fixOf(r, take)) : null,
          orders,
          ordersTotal: pieces.length,
          stage: inputs[index].stage as BatchStage,
          onSaleFrom: sale[index].from,
          supply: sale[index].supply,
        } satisfies BatchProfitRow;
      }),
    );
  });

  // ── Hech qaysi partiyaga tushmagan sotuv ──
  const unattributed: BatchProfitUnattributed = {
    units: 0,
    moneyBack: 0,
    adFee: 0,
    adUnplaced,
    opening: 0,
    beforeArrival: 0,
    notMarked: 0,
    overTracked: 0,
    top: [],
  };
  const tops: { code: string; title: string; units: number }[] = [];
  for (const [code, v] of alloc.byCode) {
    unattributed.units += v.units;
    unattributed.moneyBack += v.payout - v.tax - v.adFee;
    unattributed.adFee += v.adFee;
    unattributed.opening += v.opening;
    unattributed.beforeArrival += v.beforeArrival;
    unattributed.notMarked += v.notMarked;
    unattributed.overTracked += v.overTracked;
    // Eski qoldiqdan sotilgani — tushunarli, ro'yxatda alohida ko'rsatilmaydi
    const unexplained = v.units - v.opening;
    if (unexplained > 0) tops.push({ code: skus.get(code)?.code ?? code, title: skus.get(code)?.title ?? '', units: unexplained });
  }
  unattributed.top = tops.sort((a, b) => b.units - a.units || a.code.localeCompare(b.code)).slice(0, 5);

  return {
    batches,
    totals,
    rowsOf,
    suppliesOf,
    unattributed,
    skus,
    taxRate,
    syncedAt: account?.lastSyncAt?.toISOString() ?? null,
    storeCount: stores.length,
  };
}

/**
 * Sanani bir bosishda tuzatish taklifi — faqat Uzum ta'minlashi yo'q
 * (FBS/DBS, «Keldi» bo'yicha) partiyada: hali «Keldi» emas, lekin tovaridan
 * sotilgan (notMarked) — taklif: birinchi shunday sotuv kuni. Ta'minlashli
 * partiyada sotuv kuni Uzum qabulidan, taklif kerak emas.
 * Kelgan sana jo'natilgandan oldin bo'lolmaydi (server ham rad etadi).
 */
function fixOf(row: LoadedRow, take: ProfitTake): BatchProfitFix | null {
  // Faqat yo'ldagi jo'natma: Xitoy omboridagi tovar sotilgan bo'lolmaydi — sotuv eski tovardan
  if (row.legStatus !== 'shipped') return null;
  const sale = take.notMarked > 0 ? take.firstBlameDay : null;
  if (!sale) return null;
  return {
    kind: 'arrive',
    date: row.shippedAt && sale < row.shippedAt ? row.shippedAt : sale,
    basis: 'sale',
    cargoName: row.cargoName,
    delivery: row.delivery,
    trip: row.trip,
    shippedAt: row.shippedAt,
  };
}

// ─────────────────────────── Kesh ───────────────────────────

/*
 * Hisob butun kompaniya bo'yicha va og'ir: partiya sahifasi har avtomatik
 * saqlashdan keyin uni qayta so'raydi, ro'yxat ham. Natija qisqa muddat
 * eslab qolinadi; bir vaqtdagi so'rovlar bitta hisobni kutadi. Barmoq izi —
 * partiyalar va jo'natmalarning soni va oxirgi o'zgarishi, do'konlar soni,
 * kompaniya (soliq stavkasi) va oxirgi sinxron. Sinxron ishlayotganda
 * keshlanmaydi: buyurtmalar bo'laklab qayta yozilmoqda.
 */
const CACHE_TTL_MS = 60_000;
const CACHE_MAX = 32;
const cache = new Map<string, { fp: string; at: number; book: Promise<BatchProfitBook> }>();

async function fingerprint(companyId: string): Promise<string | null> {
  const [batch, ship, company, account, stores, running, jobs, invoices, ads] = await Promise.all([
    prisma.purchaseBatch.aggregate({ where: { companyId }, _max: { updatedAt: true }, _count: { _all: true } }),
    prisma.purchaseBatchShipment.aggregate({ where: { batch: { companyId } }, _max: { updatedAt: true }, _count: { _all: true } }),
    prisma.company.findUnique({ where: { id: companyId }, select: { updatedAt: true, taxRate: true } }),
    prisma.uzumAccount.aggregate({ where: { companyId }, _max: { lastSyncAt: true } }),
    prisma.store.count({ where: { companyId } }),
    prisma.syncJob.count({ where: { companyId, status: 'running' } }),
    // Buyurtma va SKU'larni faqat sinxron yozadi: har tugagan ish (oddiy ham, tarixni yuklash ham) izni o'zgartiradi
    prisma.syncJob.aggregate({ where: { companyId }, _max: { updatedAt: true }, _count: { _all: true } }),
    prisma.shipment.aggregate({ where: { companyId }, _max: { updatedAt: true }, _count: { _all: true } }),
    // Reklama: sinxrondan tashqari qo'lda ham kiritiladi (Moliya); yig'indi tahrirni ham sezadi
    prisma.expense.aggregate({
      where: { companyId, category: 'marketing' },
      _max: { createdAt: true },
      _count: { _all: true },
      _sum: { amount: true },
    }),
  ]);
  if (running > 0) return null;
  return [
    batch._count._all,
    batch._max.updatedAt?.getTime() ?? 0,
    ship._count._all,
    ship._max.updatedAt?.getTime() ?? 0,
    company?.updatedAt.getTime() ?? 0,
    company?.taxRate ?? 0,
    account._max.lastSyncAt?.getTime() ?? 0,
    stores,
    jobs._count._all,
    jobs._max.updatedAt?.getTime() ?? 0,
    invoices._count._all,
    invoices._max.updatedAt?.getTime() ?? 0,
    ads._count._all,
    ads._max.createdAt?.getTime() ?? 0,
    ads._sum.amount ?? 0,
  ].join('|');
}

/** Testlar uchun: bazaga sinxronsiz to'g'ridan-to'g'ri yozilganda */
export function resetBatchProfitCache(): void {
  cache.clear();
}

/**
 * Partiya yozuvidan keyin (yozuv tranzaksiyasi tugagach) — kompaniya hisobini
 * unutish. Barmoq izi yetmaydi: ikki partiya bir vaqtda saqlansa, keyinroq
 * tugagani oldinroq vaqt tamg'asi bilan yozilishi mumkin (eng katta updatedAt
 * o'zgarmaydi) — eski raqamlar 60 soniya ko'rinib turardi.
 */
export function invalidateBatchProfit(companyId: string): void {
  cache.delete(companyId);
}

/** Marshrutlar shu orqali oladi: o'zgarish bo'lmasa — eslab qolingan hisob */
export async function getBatchProfit(companyId: string): Promise<BatchProfitBook> {
  const fp = await fingerprint(companyId);
  if (fp === null) return loadBatchProfit(companyId);
  const hit = cache.get(companyId);
  if (hit && hit.fp === fp && Date.now() - hit.at < CACHE_TTL_MS) return hit.book;
  const book = loadBatchProfit(companyId);
  cache.delete(companyId);
  cache.set(companyId, { fp, at: Date.now(), book });
  // Xato bo'lsa eslab qolinmaydi — keyingi so'rov qayta hisoblaydi
  book.catch(() => {
    if (cache.get(companyId)?.book === book) cache.delete(companyId);
  });
  while (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value as string);
  return book;
}

/** Ro'yxat sahifasi uchun */
export function toListResponse(book: BatchProfitBook): BatchProfitListResponse {
  const items: BatchProfitSummary[] = book.batches.map((b) => ({
    batchId: b.id,
    ...(book.totals.get(b.id) as BatchProfitTotals),
    supplies: book.suppliesOf.get(b.id) ?? [],
  }));
  const grand = { invested: 0, moneyBack: 0, profit: 0, pendingBack: 0, adFee: 0, paidBack: 0 };
  for (const t of items) {
    grand.invested += t.invested;
    grand.moneyBack += t.moneyBack;
    grand.profit += t.profit;
    grand.pendingBack += t.back.held + t.back.transit;
    grand.adFee += t.adFee;
    if (t.state === 'paidBack') grand.paidBack += 1;
  }
  return { items, grand, unattributed: book.unattributed, taxRate: book.taxRate, syncedAt: book.syncedAt };
}

/** Bitta partiya sahifasi uchun; partiya topilmasa null */
export function toDetailResponse(book: BatchProfitBook, batchId: string): BatchProfitDetail | null {
  const totals = book.totals.get(batchId);
  const rows = book.rowsOf.get(batchId);
  if (!totals || !rows) return null;
  const skus: Record<string, BatchProfitSku> = {};
  for (const r of rows) {
    for (const c of r.codes) {
      const key = normSkuCode(c);
      const sku = book.skus.get(key);
      if (sku) skus[key] = sku;
    }
  }
  return {
    batchId,
    ...totals,
    supplies: book.suppliesOf.get(batchId) ?? [],
    rows,
    skus,
    taxRate: book.taxRate,
    syncedAt: book.syncedAt,
    storeCount: book.storeCount,
  };
}

/**
 * Bog'lash oynasi uchun Uzum tovarlari. Bir xil kodli SKU'lar (ikki do'kon)
 * bitta variant bo'lib chiqadi. Avval aniq qidiruv (Mahsulotlar sahifasidagi
 * qoida: nomi, kodi, shtrix-kodi, ID), topilmasa — so'rovdagi 3+ harfli
 * so'zlarning biri mos kelganlari (ko'p mosi yuqorida): partiyadagi nom
 * ("Skate 20 qora") Uzum'dagi nomga to'liq mos kelmasligi tabiiy.
 */
export async function searchBatchSkus(companyId: string, q: string, take: number): Promise<BatchSkuSearchResponse> {
  const storeIds = await getStoreIds(companyId);
  if (storeIds.length === 0) return { items: [], match: q ? 'query' : 'all' };
  const [skuRecs, stores, linkedRecs] = await Promise.all([
    prisma.sku.findMany({
      // Sotuvchi SavdoIQ'da "o'chirgan" mahsulot tanlovda chiqmaydi
      // SavdoIQ'da "o'chirilgan" (yashirilgan) mahsulot ham — eski partiyasi shunga bog'lanadi; ro'yxat oxirida, "arxivda" belgisi bilan
      where: { storeId: { in: storeIds } },
      select: {
        id: true,
        sku: true,
        title: true,
        barcode: true,
        uzumSkuId: true,
        imageUrl: true,
        storeId: true,
        archived: true,
        product: { select: { id: true, title: true, uzumProductId: true, category: true, hidden: true } },
      },
    }),
    prisma.store.findMany({ where: { companyId }, select: { id: true, title: true } }),
    prisma.purchaseBatchItem.findMany({ where: { batch: { companyId }, skuCodes: { not: '' } }, select: { skuCodes: true } }),
  ]);
  const storeTitle = new Map(stores.map((s) => [s.id, s.title]));
  const linkedRows = new Map<string, number>();
  for (const r of linkedRecs) for (const c of new Set((parseSkuCodes(r.skuCodes) ?? []).map(normSkuCode))) linkedRows.set(c, (linkedRows.get(c) ?? 0) + 1);

  type Option = BatchSkuOption & { recs: typeof skuRecs };
  const byCode = new Map<string, Option>();
  for (const s of skuRecs) {
    const key = normSkuCode(s.sku);
    if (!key) continue;
    const store = storeTitle.get(s.storeId) ?? '';
    const cur = byCode.get(key);
    if (cur) {
      cur.recs.push(s);
      if (store && !cur.stores.includes(store)) cur.stores.push(store);
      // Bir do'konda faol bo'lsa — faol
      cur.archived = cur.archived && (s.archived || s.product.hidden);
      if (!cur.imageUrl && s.imageUrl) cur.imageUrl = s.imageUrl;
      continue;
    }
    byCode.set(key, {
      code: s.sku,
      title: s.title || s.product.title,
      productId: s.product.id,
      productTitle: s.product.title,
      imageUrl: s.imageUrl,
      stores: store ? [store] : [],
      archived: s.archived || s.product.hidden,
      linkedRows: linkedRows.get(key) ?? 0,
      recs: [s],
    });
  }
  const all = [...byCode.values()];
  const order = (a: Option, b: Option) =>
    Number(a.archived) - Number(b.archived) || a.productTitle.localeCompare(b.productTitle) || a.title.localeCompare(b.title) || a.code.localeCompare(b.code);

  let match: BatchSkuSearchResponse['match'] = 'all';
  let list = all.sort(order);
  const query = parseSkuQuery(q);
  if (query) {
    const strict = all.filter((o) => o.recs.some((s) => matchesSkuQuery(query, s, s.product)));
    if (strict.length > 0) {
      match = 'query';
      list = strict.sort(order);
    } else {
      match = 'tokens';
      const tokens = [...new Set(normalizeCardText(q).split(' ').filter((t) => t.length >= 3))];
      list = all
        .map((o) => {
          const hay = normalizeCardText(`${o.title} ${o.productTitle} ${o.code}`);
          return { o, score: tokens.filter((t) => hay.includes(t)).length };
        })
        .filter((x) => x.score > 0)
        .sort((x, y) => y.score - x.score || order(x.o, y.o))
        .map((x) => x.o);
    }
  }
  return { items: list.slice(0, take).map(({ recs: _recs, ...o }) => o), match };
}
