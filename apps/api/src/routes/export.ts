/**
 * Excel eksport moduli — /api/v1/export
 *
 *  GET /sales           → buyurtma pozitsiyalari (sotuv tahlili)
 *  GET /sales-stock     → sotuv va qoldiq (SKU kesimida)
 *  GET /products        → mahsulotlar assortimenti
 *  GET /stocks          → omborlardagi qoldiqlar
 *  GET /abc             → ABC tahlil
 *  GET /unit-economics  → unit-iqtisod (1 dona uchun)
 *  GET /monthly         → oylik hisobot (kunlik seriya + xarajatlar)
 *  GET /losses          → yo'qotishlar
 *  GET /returns         → qaytarishlar
 *
 * Barcha marshrutlar `export_excel` funksiyasini talab qiladi va .xlsx fayl qaytaradi.
 * Ma'lumot bo'lmasa ham fayl yaratiladi: sarlavha qatori va nol qiymatli JAMI bilan.
 *
 * Hisoblash mantig'i tegishli sahifa marshrutlari bilan bir xil —
 * barcha yig'ish `services/common.ts` yordamchilari orqali bajariladi.
 */
import { Router } from 'express';
import type { Response } from 'express';
import ExcelJS from 'exceljs';
import type { Workbook, Worksheet } from 'exceljs';
import { prisma } from '@savdoiq/db';
import {
  DEFAULTS,
  abcGroup,
  pct,
  recommendedQty,
  round,
  safeDiv,
  toISODate,
  type DeliveryType,
  type ExpenseCategory,
  type OrderStatus,
  type Period,
} from '@savdoiq/shared';
import { ah } from '../lib/errors.js';
import { companyCtx, requireAuth, requireCompany, requireFeature } from '../lib/auth.js';
import { resolveRange } from '../lib/period.js';
import {
  aggregateSales,
  daysSince,
  getAvgDaily,
  getDailySeries,
  getExpenses,
  getLastSaleDates,
  getLatestStocks,
  getSkuCatalog,
  getStoreIds,
  getStoreTitles,
  stockState,
  type SkuInfo,
} from '../services/common.js';

const router = Router();
router.use(requireAuth, requireCompany, requireFeature('export_excel'));

// ─────────────────────────── Umumiy sozlamalar ───────────────────────────

/**
 * Bitta varaqdagi maksimal qator soni.
 * Workbook to'liq xotirada yig'ilib `writeBuffer()` bilan qaytariladi, shuning uchun
 * juda katta hajmlarda (yuz minglab qator) xotira va javob vaqti oshib ketmasligi uchun
 * cheklov qo'yamiz. Cheklov ishlaganda faylning oxiriga eslatma qatori qo'shiladi.
 */
const MAX_ROWS = 10_000;

/** Sarlavha qatori foni — mint (brend rangi) */
const HEADER_BG = 'FF10D094';
const HEADER_LINE = 'FF0B8F68';

/** Raqam formatlari */
const FMT = {
  /** pul (UZS, butun son) */
  money: `# ##0 "so'm"`,
  /** foiz — qiymat 0..100 oralig'ida saqlanadi */
  percent: '0.0"%"',
  /** butun son */
  int: '# ##0',
  /** bir kasrli son (o'rtacha kunlik sotuv va h.k.) */
  decimal: '# ##0.0',
} as const;

type FormatId = keyof typeof FMT;

/** Katakka yoziladigan qiymat: matn, son yoki bo'sh */
type Cell = string | number | null;

interface ColumnDef {
  header: string;
  /** ustun kengligi (belgi) */
  width: number;
  fmt?: FormatId;
  /** JAMI qatorida yig'indi chiqarilsinmi */
  sum?: boolean;
}

interface SheetSpec {
  name: string;
  columns: ColumnDef[];
  rows: Cell[][];
  /** oxirgi qator — JAMI (yo'q bo'lsa qo'shilmaydi) */
  totals?: Cell[];
  /** jadval ostidagi eslatma (masalan, qator cheklovi haqida) */
  note?: string;
}

// ─────────────────────────── Workbook yordamchilari ───────────────────────────

function newWorkbook(): Workbook {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'SavdoIQ';
  wb.lastModifiedBy = 'SavdoIQ';
  wb.created = new Date();
  wb.modified = new Date();
  return wb;
}

/**
 * JAMI qatorini yig'adi: `sum: true` ustunlar bo'yicha yig'indi,
 * `overrides` orqali hosilaviy qiymatlarni (marja, ulush) qo'lda berish mumkin.
 */
function totalsRow(
  columns: ColumnDef[],
  rows: Cell[][],
  overrides: Record<number, Cell> = {},
  label = 'JAMI',
): Cell[] {
  const out: Cell[] = columns.map(() => null);
  out[0] = label;

  columns.forEach((col, i) => {
    if (!col.sum) return;
    let acc = 0;
    for (const row of rows) {
      const v = row[i];
      if (typeof v === 'number' && Number.isFinite(v)) acc += v;
    }
    out[i] = round(acc, 2);
  });

  for (const [index, value] of Object.entries(overrides)) {
    const i = Number(index);
    if (i >= 0 && i < out.length) out[i] = value;
  }

  return out;
}

/** Varaqni yaratadi va to'liq formatlaydi (sarlavha, muzlatish, avtofiltr, JAMI) */
function addSheet(wb: Workbook, spec: SheetSpec): Worksheet {
  const ws = wb.addWorksheet(spec.name, {
    views: [{ state: 'frozen', ySplit: 1 }],
  });

  // 1) Ustunlar va sarlavha qatori
  ws.columns = spec.columns.map((c) => ({ header: c.header, width: c.width }));

  // 2) Ma'lumot qatorlari
  for (const row of spec.rows) ws.addRow(row);

  // 3) JAMI qatori
  let totalsRowNumber = 0;
  if (spec.totals) {
    const r = ws.addRow(spec.totals);
    totalsRowNumber = r.number;
  }

  // 4) Ustun formatlari (butun ustunga, sarlavha keyin qayta bo'yaladi)
  spec.columns.forEach((c, i) => {
    const col = ws.getColumn(i + 1);
    if (c.fmt) {
      col.numFmt = FMT[c.fmt];
      col.alignment = { horizontal: 'right', vertical: 'middle' };
    } else {
      col.alignment = { horizontal: 'left', vertical: 'middle' };
    }
  });

  // 5) Sarlavha: mint fon, oq qalin shrift
  const head = ws.getRow(1);
  head.height = 24;
  head.font = { bold: true, size: 11, color: { argb: 'FFFFFFFF' } };
  head.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  head.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_BG } };
    cell.border = { bottom: { style: 'thin', color: { argb: HEADER_LINE } } };
  });

  // 6) JAMI qatori — qalin va yuqoridan chiziq bilan ajratilgan
  if (totalsRowNumber > 0) {
    const totals = ws.getRow(totalsRowNumber);
    totals.font = { bold: true };
    totals.eachCell((cell) => {
      cell.border = { top: { style: 'thin', color: { argb: HEADER_LINE } } };
    });
  }

  // 7) Avtofiltr — sarlavhadan ma'lumot qatorlarining oxirigacha
  const lastDataRow = 1 + spec.rows.length;
  ws.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: lastDataRow, column: spec.columns.length },
  };

  // 8) Eslatma (agar qatorlar cheklangan bo'lsa)
  if (spec.note) {
    ws.addRow([]);
    const note = ws.addRow([spec.note]);
    note.font = { italic: true, size: 10, color: { argb: 'FF6B7280' } };
  }

  return ws;
}

/** Cheklov ishlaganda faylga qo'shiladigan eslatma matni */
function limitNote(total: number): string | undefined {
  if (total <= MAX_ROWS) return undefined;
  return `Eslatma: fayl hajmi cheklangani uchun faqat birinchi ${MAX_ROWS.toLocaleString('ru-RU')} qator eksport qilindi (jami ${total.toLocaleString('ru-RU')}). Davrni qisqartiring yoki do'kon bo'yicha filtrlang.`;
}

/** Workbook'ni .xlsx sifatida yuboradi */
async function sendWorkbook(res: Response, wb: Workbook, section: string, period: Period): Promise<void> {
  const fileName = `savdoiq-${section}-${period.from}_${period.to}.xlsx`;
  const buffer = await wb.xlsx.writeBuffer();
  const body = Buffer.from(buffer as ArrayBuffer);

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
  res.setHeader('Content-Length', String(body.byteLength));
  res.setHeader('Cache-Control', 'no-store');
  res.end(body);
}

// ─────────────────────────── Yorliqlar ───────────────────────────

const ORDER_STATUSES: OrderStatus[] = ['new', 'processing', 'delivered', 'canceled', 'returned'];

const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  new: 'Yangi',
  processing: 'Jarayonda',
  delivered: 'Yetkazilgan',
  canceled: 'Bekor qilingan',
  returned: 'Qaytarilgan',
};

const DELIVERY_TYPES: DeliveryType[] = ['FBO', 'FBS', 'DBS'];

const STOCK_STATUS_LABEL: Record<'critical' | 'low' | 'ok' | 'excess' | 'dead', string> = {
  critical: 'Kritik',
  low: 'Tugayapti',
  ok: 'Yetarli',
  excess: 'Ortiqcha',
  dead: 'Harakatsiz',
};

const LOSS_TYPE_LABEL: Record<string, string> = {
  lost: 'Yo‘qolgan',
  damaged: 'Shikastlangan',
  shortage: 'Kam chiqqan',
  not_delivered: 'Yetkazilmagan',
};

const LOSS_STATUS_LABEL: Record<string, string> = {
  open: 'Ochiq',
  claimed: 'Da’vo yuborilgan',
  compensated: 'Qoplangan',
  rejected: 'Rad etilgan',
};

const RETURN_STATUS_LABEL: Record<string, string> = {
  returned: 'Qaytarilgan',
  refunded: 'Puli qaytarilgan',
  pending: 'Kutilmoqda',
  rejected: 'Rad etilgan',
};

const PRODUCT_STATUS_LABEL: Record<string, string> = {
  active: 'Faol',
  inactive: 'Nofaol',
  archived: 'Arxiv',
  moderation: 'Moderatsiyada',
  blocked: 'Bloklangan',
};

const CATEGORY_ORDER: ExpenseCategory[] = [
  'commission',
  'logistics',
  'marketing',
  'storage',
  'tax',
  'salary',
  'other',
];

const CATEGORY_LABEL: Record<ExpenseCategory, string> = {
  commission: 'Komissiya',
  logistics: 'Logistika',
  marketing: 'Marketing',
  storage: 'Ombor (saqlash)',
  tax: 'Soliq',
  salary: 'Ish haqi',
  other: 'Boshqa',
};

const toOrderStatus = (v: string): OrderStatus =>
  (ORDER_STATUSES as string[]).includes(v) ? (v as OrderStatus) : 'new';

const toDeliveryType = (v: string): DeliveryType =>
  (DELIVERY_TYPES as string[]).includes(v) ? (v as DeliveryType) : 'FBO';

/** Bo'sh matn o'rniga chiziqcha */
const dash = (v: string | null | undefined): string => (v && v.trim() ? v : '—');

/** SKU nomini katalogdan (yoki yozuvdagi nusxadan) olish */
const skuTitle = (info: SkuInfo | undefined, fallback?: string | null): string =>
  info?.title ?? (fallback && fallback.trim() ? fallback : 'Noma’lum SKU');

// ─────────────────────────── GET /sales ───────────────────────────

router.get(
  '/sales',
  requireFeature('sales_analytics'),
  ah(async (req, res) => {
    const { company, plan } = companyCtx(req);
    const range = resolveRange(req, plan);
    const storeIds = await getStoreIds(company.id, range.storeId);

    const where = {
      orderedAt: { gte: range.from, lt: range.toExclusive },
      order: { storeId: { in: storeIds } },
    };

    const [total, items, catalog] = await Promise.all([
      prisma.orderItem.count({ where }),
      prisma.orderItem.findMany({
        where,
        orderBy: { orderedAt: 'desc' },
        take: MAX_ROWS,
        select: {
          skuId: true,
          skuCode: true,
          title: true,
          qty: true,
          sellPrice: true,
          purchasePrice: true,
          commission: true,
          logistics: true,
          revenue: true,
          payout: true,
          netProfit: true,
          status: true,
          returnedAt: true,
          orderedAt: true,
          order: { select: { uzumOrderId: true, status: true, deliveryType: true, buyerCity: true } },
        },
      }),
      getSkuCatalog(storeIds, true),
    ]);

    const columns: ColumnDef[] = [
      { header: 'Sana', width: 12 },
      { header: 'Buyurtma', width: 16 },
      { header: 'Holat', width: 16 },
      { header: 'Yetkazish', width: 11 },
      { header: 'Shahar', width: 16 },
      { header: 'SKU', width: 16 },
      { header: 'Mahsulot', width: 38 },
      { header: 'Miqdor', width: 9, fmt: 'int', sum: true },
      { header: 'Tannarx', width: 14, fmt: 'money' },
      { header: 'Sotuv narxi', width: 14, fmt: 'money' },
      { header: 'Tushum', width: 16, fmt: 'money', sum: true },
      { header: 'Komissiya', width: 14, fmt: 'money', sum: true },
      { header: 'Logistika', width: 14, fmt: 'money', sum: true },
      { header: 'To‘lov', width: 16, fmt: 'money', sum: true },
      { header: 'Sof foyda', width: 16, fmt: 'money', sum: true },
      { header: 'Marja', width: 10, fmt: 'percent' },
    ];

    // Bekor qilingan/qaytarilgan pozitsiyalar ham ko'rsatiladi (holat ustuni bilan),
    // lekin JAMI faqat hisobga olinadigan qatorlar bo'yicha yig'iladi — analitika bilan mos.
    const counted: Cell[][] = [];

    const rows: Cell[][] = items.map((it) => {
      const info = it.skuId ? catalog.get(it.skuId) : undefined;
      const returned = it.status === 'returned' || Boolean(it.returnedAt);
      const status: OrderStatus = returned
        ? 'returned'
        : it.status === 'canceled'
          ? 'canceled'
          : toOrderStatus(it.order.status);

      const row: Cell[] = [
        toISODate(it.orderedAt),
        dash(it.order.uzumOrderId),
        ORDER_STATUS_LABEL[status],
        toDeliveryType(it.order.deliveryType),
        dash(it.order.buyerCity),
        dash(it.skuCode ?? info?.sku ?? null),
        skuTitle(info, it.title),
        it.qty,
        round(it.purchasePrice),
        round(it.sellPrice),
        round(it.revenue),
        round(it.commission),
        round(it.logistics),
        round(it.payout),
        round(it.netProfit),
        pct(it.netProfit, it.revenue),
      ];

      if (status !== 'canceled' && status !== 'returned') counted.push(row);
      return row;
    });

    let revenueSum = 0;
    let profitSum = 0;
    for (const r of counted) {
      if (typeof r[10] === 'number') revenueSum += r[10];
      if (typeof r[14] === 'number') profitSum += r[14];
    }

    const wb = newWorkbook();
    addSheet(wb, {
      name: 'Sotuvlar',
      columns,
      rows,
      totals: totalsRow(
        columns,
        counted,
        { 15: pct(profitSum, revenueSum) },
        'JAMI (bekor va qaytarilganlarsiz)',
      ),
      note: limitNote(total),
    });

    await sendWorkbook(res, wb, 'sales', range.period);
  }),
);

// ─────────────────────────── GET /sales-stock ───────────────────────────

router.get(
  '/sales-stock',
  requireFeature('stocks_fbo_fbs'),
  ah(async (req, res) => {
    const { company, plan } = companyCtx(req);
    const range = resolveRange(req, plan);
    const storeIds = await getStoreIds(company.id, range.storeId);

    const [catalog, stocks, sales, avgDaily, lastSale] = await Promise.all([
      getSkuCatalog(storeIds, true),
      getLatestStocks(storeIds),
      aggregateSales(storeIds, range.from, range.toExclusive),
      getAvgDaily(storeIds, 30),
      getLastSaleDates(storeIds),
    ]);

    const columns: ColumnDef[] = [
      { header: 'SKU', width: 16 },
      { header: 'Mahsulot', width: 38 },
      { header: 'Do‘kon', width: 20 },
      { header: 'Sotildi', width: 10, fmt: 'int', sum: true },
      { header: 'FBO', width: 9, fmt: 'int', sum: true },
      { header: 'FBS', width: 9, fmt: 'int', sum: true },
      { header: 'O‘z ombori', width: 11, fmt: 'int', sum: true },
      { header: 'Tushum', width: 16, fmt: 'money', sum: true },
      { header: 'To‘lov', width: 16, fmt: 'money', sum: true },
      { header: 'Sof foyda', width: 16, fmt: 'money', sum: true },
      { header: 'O‘rt. kunlik', width: 12, fmt: 'decimal' },
      { header: 'Qoldiq (kun)', width: 12, fmt: 'int' },
      { header: 'Oylik potensial', width: 14, fmt: 'int' },
      { header: 'Holat', width: 14 },
    ];

    const list = [...catalog.values()]
      .map((info) => {
        const agg = sales.get(info.id);
        const st = stocks.get(info.id);
        const avg = avgDaily.get(info.id) ?? 0;
        const total = st?.total ?? 0;
        const state = stockState(total, avg, daysSince(lastSale.get(info.id)), daysSince(info.createdAt));
        return {
          info,
          sold: agg?.units ?? 0,
          revenue: agg?.revenue ?? 0,
          payout: agg?.payout ?? 0,
          netProfit: agg?.netProfit ?? 0,
          fbo: st?.fbo ?? 0,
          fbs: st?.fbs ?? 0,
          own: st?.own ?? 0,
          avg,
          state,
          monthPotential: Math.max(0, Math.round(avg * 30)),
          total,
        };
      })
      // Sotuvi ham, qoldig'i ham bo'lmagan (arxiv) SKU'lar faylni to'ldirmasin
      .filter((r) => r.sold > 0 || r.total > 0 || r.revenue !== 0)
      .sort((a, b) => b.revenue - a.revenue);

    const rows: Cell[][] = list.slice(0, MAX_ROWS).map((r) => [
      r.info.sku,
      r.info.title,
      r.info.storeTitle,
      r.sold,
      r.fbo,
      r.fbs,
      r.own,
      round(r.revenue),
      round(r.payout),
      round(r.netProfit),
      round(r.avg, 2),
      r.state.daysLeft,
      r.monthPotential,
      STOCK_STATUS_LABEL[r.state.status],
    ]);

    const wb = newWorkbook();
    addSheet(wb, {
      name: 'Sotuv va qoldiq',
      columns,
      rows,
      totals: totalsRow(columns, rows),
      note: limitNote(list.length),
    });

    await sendWorkbook(res, wb, 'sales-stock', range.period);
  }),
);

// ─────────────────────────── GET /products ───────────────────────────

router.get(
  '/products',
  requireFeature('products_assortment'),
  ah(async (req, res) => {
    const { company, plan } = companyCtx(req);
    const range = resolveRange(req, plan);
    const storeIds = await getStoreIds(company.id, range.storeId);

    const [catalog, stocks, sales, avgDaily, products] = await Promise.all([
      getSkuCatalog(storeIds, true),
      getLatestStocks(storeIds),
      aggregateSales(storeIds, range.from, range.toExclusive),
      getAvgDaily(storeIds, 30),
      prisma.product.findMany({
        where: { storeId: { in: storeIds } },
        select: {
          id: true,
          title: true,
          category: true,
          status: true,
          rating: true,
          reviewsCount: true,
        },
      }),
    ]);

    interface ProductAgg {
      title: string;
      category: string | null;
      status: string;
      rating: number;
      reviewsCount: number;
      skuCount: number;
      minPrice: number;
      sold: number;
      returns: number;
      revenue: number;
      profit: number;
      cogs: number;
      fbo: number;
      fbs: number;
      own: number;
      avg: number;
    }

    const byProduct = new Map<string, ProductAgg>();
    for (const p of products) {
      byProduct.set(p.id, {
        title: p.title,
        category: p.category,
        status: p.status,
        rating: p.rating,
        reviewsCount: p.reviewsCount,
        skuCount: 0,
        minPrice: 0,
        sold: 0,
        returns: 0,
        revenue: 0,
        profit: 0,
        cogs: 0,
        fbo: 0,
        fbs: 0,
        own: 0,
        avg: 0,
      });
    }

    for (const info of catalog.values()) {
      const p = byProduct.get(info.productId);
      if (!p) continue;
      const agg = sales.get(info.id);
      const st = stocks.get(info.id);

      p.skuCount += 1;
      if (info.price > 0 && (p.minPrice === 0 || info.price < p.minPrice)) p.minPrice = info.price;
      p.sold += agg?.units ?? 0;
      p.returns += agg?.returns ?? 0;
      p.revenue += agg?.revenue ?? 0;
      p.profit += agg?.netProfit ?? 0;
      p.cogs += agg?.cogs ?? 0;
      p.fbo += st?.fbo ?? 0;
      p.fbs += st?.fbs ?? 0;
      p.own += st?.own ?? 0;
      p.avg += avgDaily.get(info.id) ?? 0;
    }

    const columns: ColumnDef[] = [
      { header: 'Mahsulot', width: 40 },
      { header: 'Kategoriya', width: 22 },
      { header: 'Holat', width: 12 },
      { header: 'Reyting', width: 10, fmt: 'decimal' },
      { header: 'Sharhlar', width: 10, fmt: 'int', sum: true },
      { header: 'SKU soni', width: 10, fmt: 'int', sum: true },
      { header: 'Min. narx', width: 14, fmt: 'money' },
      { header: 'Sotildi', width: 10, fmt: 'int', sum: true },
      { header: 'Qaytarish', width: 11, fmt: 'int', sum: true },
      { header: 'Tushum', width: 16, fmt: 'money', sum: true },
      { header: 'Sof foyda', width: 16, fmt: 'money', sum: true },
      { header: 'ROI', width: 10, fmt: 'percent' },
      { header: 'Marja', width: 10, fmt: 'percent' },
      { header: 'FBO', width: 9, fmt: 'int', sum: true },
      { header: 'FBS', width: 9, fmt: 'int', sum: true },
      { header: 'O‘z ombori', width: 11, fmt: 'int', sum: true },
      { header: 'Qoldiq (kun)', width: 12, fmt: 'int' },
      { header: 'Buyurtma kerak', width: 14, fmt: 'int', sum: true },
    ];

    const list = [...byProduct.values()]
      .filter((p) => p.skuCount > 0 && (p.sold > 0 || p.fbo + p.fbs + p.own > 0 || p.revenue !== 0))
      .sort((a, b) => b.revenue - a.revenue);

    const rows: Cell[][] = list.slice(0, MAX_ROWS).map((p) => {
      const stock = p.fbo + p.fbs + p.own;
      const daysLeft = p.avg > 0 ? Math.round(stock / p.avg) : null;
      return [
        p.title,
        dash(p.category),
        PRODUCT_STATUS_LABEL[p.status] ?? p.status,
        round(p.rating, 1),
        p.reviewsCount,
        p.skuCount,
        round(p.minPrice),
        p.sold,
        p.returns,
        round(p.revenue),
        round(p.profit),
        pct(p.profit, p.cogs),
        pct(p.profit, p.revenue),
        p.fbo,
        p.fbs,
        p.own,
        daysLeft,
        // 30 kunlik zaxira + 7 kun yetkazish muddati hisobga olinadi
        recommendedQty(p.avg, 30, stock),
      ];
    });

    const revenueSum = list.reduce((s, p) => s + p.revenue, 0);
    const profitSum = list.reduce((s, p) => s + p.profit, 0);
    const cogsSum = list.reduce((s, p) => s + p.cogs, 0);

    const wb = newWorkbook();
    addSheet(wb, {
      name: 'Mahsulotlar',
      columns,
      rows,
      totals: totalsRow(columns, rows, {
        11: pct(profitSum, cogsSum),
        12: pct(profitSum, revenueSum),
      }),
      note: limitNote(list.length),
    });

    await sendWorkbook(res, wb, 'products', range.period);
  }),
);

// ─────────────────────────── GET /stocks ───────────────────────────

router.get(
  '/stocks',
  requireFeature('stocks_fbo_fbs'),
  ah(async (req, res) => {
    const { company, plan } = companyCtx(req);
    const range = resolveRange(req, plan);
    const storeIds = await getStoreIds(company.id, range.storeId);

    const [catalog, stocks, avgDaily, lastSale] = await Promise.all([
      getSkuCatalog(storeIds, true),
      getLatestStocks(storeIds),
      getAvgDaily(storeIds, 30),
      getLastSaleDates(storeIds),
    ]);

    const columns: ColumnDef[] = [
      { header: 'SKU', width: 16 },
      { header: 'Mahsulot', width: 38 },
      { header: 'Do‘kon', width: 20 },
      { header: 'FBO', width: 9, fmt: 'int', sum: true },
      { header: 'FBS', width: 9, fmt: 'int', sum: true },
      { header: 'O‘z ombori', width: 11, fmt: 'int', sum: true },
      { header: 'Rezerv', width: 10, fmt: 'int', sum: true },
      { header: 'Yo‘lda', width: 10, fmt: 'int', sum: true },
      { header: 'Jami', width: 10, fmt: 'int', sum: true },
      { header: 'Tannarx qiymati', width: 18, fmt: 'money', sum: true },
      { header: 'Sotuv qiymati', width: 18, fmt: 'money', sum: true },
      { header: 'O‘rt. kunlik', width: 12, fmt: 'decimal' },
      { header: 'Qoldiq (kun)', width: 12, fmt: 'int' },
      { header: 'Holat', width: 14 },
    ];

    const list = [...catalog.values()]
      .map((info) => {
        const st = stocks.get(info.id);
        const avg = avgDaily.get(info.id) ?? 0;
        const total = st?.total ?? 0;
        return {
          info,
          fbo: st?.fbo ?? 0,
          fbs: st?.fbs ?? 0,
          own: st?.own ?? 0,
          reserved: st?.reserved ?? 0,
          inTransit: st?.inTransit ?? 0,
          total,
          costValue: total * (info.purchasePrice + info.extraCost),
          retailValue: total * info.price,
          avg,
          state: stockState(total, avg, daysSince(lastSale.get(info.id)), daysSince(info.createdAt)),
        };
      })
      .filter((r) => r.total > 0 || r.reserved > 0 || r.inTransit > 0)
      .sort((a, b) => b.costValue - a.costValue);

    const rows: Cell[][] = list.slice(0, MAX_ROWS).map((r) => [
      r.info.sku,
      r.info.title,
      r.info.storeTitle,
      r.fbo,
      r.fbs,
      r.own,
      r.reserved,
      r.inTransit,
      r.total,
      round(r.costValue),
      round(r.retailValue),
      round(r.avg, 2),
      r.state.daysLeft,
      STOCK_STATUS_LABEL[r.state.status],
    ]);

    const wb = newWorkbook();
    addSheet(wb, {
      name: 'Qoldiqlar',
      columns,
      rows,
      totals: totalsRow(columns, rows),
      note: limitNote(list.length),
    });

    await sendWorkbook(res, wb, 'stocks', range.period);
  }),
);

// ─────────────────────────── GET /abc ───────────────────────────

router.get(
  '/abc',
  requireFeature('abc_analysis'),
  ah(async (req, res) => {
    const { company, plan } = companyCtx(req);
    const range = resolveRange(req, plan);
    const storeIds = await getStoreIds(company.id, range.storeId);

    const [catalog, sales] = await Promise.all([
      getSkuCatalog(storeIds, true),
      aggregateSales(storeIds, range.from, range.toExclusive),
    ]);

    const columns: ColumnDef[] = [
      { header: 'SKU', width: 16 },
      { header: 'Mahsulot', width: 40 },
      { header: 'Do‘kon', width: 20 },
      { header: 'Tushum', width: 16, fmt: 'money', sum: true },
      { header: 'Sof foyda', width: 16, fmt: 'money', sum: true },
      { header: 'Sotildi (dona)', width: 13, fmt: 'int', sum: true },
      { header: 'Ulush', width: 10, fmt: 'percent' },
      { header: 'Kumulyativ', width: 12, fmt: 'percent' },
      { header: 'Guruh', width: 8 },
    ];

    const list = [...catalog.values()]
      .map((info) => {
        const agg = sales.get(info.id);
        return {
          info,
          revenue: agg?.revenue ?? 0,
          profit: agg?.netProfit ?? 0,
          units: agg?.units ?? 0,
        };
      })
      .filter((r) => r.revenue > 0 || r.units > 0)
      .sort((a, b) => b.revenue - a.revenue);

    const totalRevenue = list.reduce((s, r) => s + r.revenue, 0);
    let cumulative = 0;

    const rows: Cell[][] = list.slice(0, MAX_ROWS).map((r) => {
      const share = pct(r.revenue, totalRevenue);
      cumulative = Math.min(100, cumulative + share);
      return [
        r.info.sku,
        r.info.title,
        r.info.storeTitle,
        round(r.revenue),
        round(r.profit),
        r.units,
        share,
        round(cumulative, 2),
        abcGroup(cumulative),
      ];
    });

    const wb = newWorkbook();
    addSheet(wb, {
      name: 'ABC tahlil',
      columns,
      rows,
      totals: totalsRow(columns, rows, { 6: totalRevenue > 0 ? 100 : 0, 7: null }),
      note: limitNote(list.length),
    });

    await sendWorkbook(res, wb, 'abc', range.period);
  }),
);

// ─────────────────────────── GET /unit-economics ───────────────────────────

router.get(
  '/unit-economics',
  requireFeature('unit_economics'),
  ah(async (req, res) => {
    const { company, plan } = companyCtx(req);
    const range = resolveRange(req, plan);
    const storeIds = await getStoreIds(company.id, range.storeId);
    const taxRate = company.taxRate;

    const [catalog, sales] = await Promise.all([
      getSkuCatalog(storeIds, true),
      aggregateSales(storeIds, range.from, range.toExclusive),
    ]);

    const columns: ColumnDef[] = [
      { header: 'SKU', width: 16 },
      { header: 'Mahsulot', width: 38 },
      { header: 'Narx', width: 14, fmt: 'money' },
      { header: 'Tannarx', width: 14, fmt: 'money' },
      { header: 'Komissiya %', width: 12, fmt: 'percent' },
      { header: 'Komissiya', width: 14, fmt: 'money' },
      { header: 'Logistika', width: 14, fmt: 'money' },
      { header: 'Saqlash', width: 14, fmt: 'money' },
      { header: 'Boshqa', width: 14, fmt: 'money' },
      { header: 'Soliq', width: 14, fmt: 'money' },
      { header: 'Sof foyda (1 dona)', width: 18, fmt: 'money' },
      { header: 'Marja', width: 10, fmt: 'percent' },
      { header: 'ROI', width: 10, fmt: 'percent' },
      { header: 'Nol nuqta narxi', width: 16, fmt: 'money' },
      { header: 'Sotildi (dona)', width: 13, fmt: 'int', sum: true },
      { header: 'Jami foyda', width: 16, fmt: 'money', sum: true },
    ];

    const list = [...catalog.values()]
      .map((info) => {
        const agg = sales.get(info.id);
        const units = agg?.units ?? 0;
        const price = info.price;

        // Haqiqiy sotuvlar bo'lsa — 1 donaga to'g'ri keladigan real xarajat,
        // aks holda platforma bo'yicha standart taxminlar (DEFAULTS).
        const commission = units > 0 ? safeDiv(agg?.commission ?? 0, units) : (price * (info.commissionPct || DEFAULTS.commissionPct)) / 100;
        const logistics = units > 0 ? safeDiv(agg?.logistics ?? 0, units) : DEFAULTS.logisticsPerUnit;
        // Saqlash: hajm (litr) × kunlik tarif × 30 kun
        const storage = (info.storagePerItem > 0 ? info.storagePerItem : info.volumeL * DEFAULTS.storagePerLiterPerDay * 30);
        const otherCost = info.extraCost + (units > 0 ? safeDiv(agg?.otherCost ?? 0, units) : 0);
        const tax = (price * taxRate) / 100;
        const commissionPct = price > 0 ? pct(commission, price) : DEFAULTS.commissionPct;

        const netProfit = price - info.purchasePrice - commission - logistics - storage - otherCost - tax;
        const investment = info.purchasePrice + otherCost;

        // Nol foyda nuqtasi: o'zgaruvchan foizli xarajatlarni (komissiya + soliq) hisobga olib
        const variablePct = (commissionPct + taxRate) / 100;
        const fixedPerUnit = info.purchasePrice + logistics + storage + otherCost;
        const breakEvenPrice = variablePct >= 1 ? 0 : fixedPerUnit / (1 - variablePct);

        return {
          info,
          price,
          commissionPct,
          commission,
          logistics,
          storage,
          otherCost,
          tax,
          netProfit,
          margin: pct(netProfit, price),
          roi: pct(netProfit, investment),
          breakEvenPrice,
          units,
          totalProfit: agg?.netProfit ?? 0,
          revenue: agg?.revenue ?? 0,
        };
      })
      .filter((r) => r.units > 0 || r.price > 0)
      .sort((a, b) => b.totalProfit - a.totalProfit);

    const rows: Cell[][] = list.slice(0, MAX_ROWS).map((r) => [
      r.info.sku,
      r.info.title,
      round(r.price),
      round(r.info.purchasePrice),
      round(r.commissionPct, 2),
      round(r.commission),
      round(r.logistics),
      round(r.storage),
      round(r.otherCost),
      round(r.tax),
      round(r.netProfit),
      r.margin,
      r.roi,
      round(r.breakEvenPrice),
      r.units,
      round(r.totalProfit),
    ]);

    const revenueSum = list.reduce((s, r) => s + r.revenue, 0);
    const profitSum = list.reduce((s, r) => s + r.totalProfit, 0);

    const wb = newWorkbook();
    addSheet(wb, {
      name: 'Unit-iqtisod',
      columns,
      rows,
      totals: totalsRow(columns, rows, { 11: pct(profitSum, revenueSum) }),
      note: limitNote(list.length),
    });

    await sendWorkbook(res, wb, 'unit-economics', range.period);
  }),
);

// ─────────────────────────── GET /monthly ───────────────────────────

router.get(
  '/monthly',
  requireFeature('monthly_reports'),
  ah(async (req, res) => {
    const { company, plan } = companyCtx(req);
    const range = resolveRange(req, plan);
    const storeIds = await getStoreIds(company.id, range.storeId);
    const taxRate = company.taxRate;

    const [series, sales, manual] = await Promise.all([
      getDailySeries(storeIds, range.period),
      aggregateSales(storeIds, range.from, range.toExclusive),
      getExpenses(company.id, range.from, range.toExclusive, range.storeId),
    ]);

    // 1-varaq — kunlik seriya
    const dailyColumns: ColumnDef[] = [
      { header: 'Sana', width: 14 },
      { header: 'Tushum', width: 16, fmt: 'money', sum: true },
      { header: 'Sof foyda', width: 16, fmt: 'money', sum: true },
      { header: 'To‘lov', width: 16, fmt: 'money', sum: true },
      { header: 'Buyurtmalar', width: 13, fmt: 'int', sum: true },
      { header: 'Sotildi (dona)', width: 13, fmt: 'int', sum: true },
      { header: 'Qaytarish (dona)', width: 15, fmt: 'int', sum: true },
      { header: 'Marja', width: 10, fmt: 'percent' },
    ];

    // Kunlar soni tarif tarixi bilan cheklangan, ammo himoya sifatida MAX_ROWS qo'llanadi
    const dailyRows: Cell[][] = series.slice(0, MAX_ROWS).map((d) => [
      d.date,
      round(d.revenue),
      round(d.profit),
      round(d.payout),
      d.orders,
      d.units,
      d.returns,
      pct(d.profit, d.revenue),
    ]);

    let revenue = 0;
    let profit = 0;
    let commission = 0;
    let logistics = 0;
    let otherCost = 0;
    for (const agg of sales.values()) {
      revenue += agg.revenue;
      profit += agg.netProfit;
      commission += agg.commission;
      logistics += agg.logistics;
      otherCost += agg.otherCost;
    }

    const wb = newWorkbook();
    addSheet(wb, {
      name: 'Kunlik',
      columns: dailyColumns,
      rows: dailyRows,
      totals: totalsRow(dailyColumns, dailyRows, { 7: pct(profit, revenue) }),
      note: limitNote(series.length),
    });

    // 2-varaq — xarajatlar kesimi (dashboard bilan bir xil mantiq)
    const amounts: Record<ExpenseCategory, number> = {
      commission: commission + manual.commission,
      logistics: logistics + manual.logistics,
      marketing: manual.marketing,
      storage: manual.storage,
      tax: manual.tax > 0 ? manual.tax : (revenue * taxRate) / 100,
      salary: manual.salary,
      other: otherCost + manual.other,
    };
    const expensesTotal = CATEGORY_ORDER.reduce((s, c) => s + amounts[c], 0);

    const expenseColumns: ColumnDef[] = [
      { header: 'Kategoriya', width: 24 },
      { header: 'Summa', width: 18, fmt: 'money', sum: true },
      { header: 'Ulush', width: 10, fmt: 'percent' },
      { header: 'Tushumga nisbatan', width: 18, fmt: 'percent' },
    ];

    const expenseRows: Cell[][] = CATEGORY_ORDER.map((c) => [
      CATEGORY_LABEL[c],
      round(amounts[c]),
      pct(amounts[c], expensesTotal),
      pct(amounts[c], revenue),
    ]);

    addSheet(wb, {
      name: 'Xarajatlar',
      columns: expenseColumns,
      rows: expenseRows,
      totals: totalsRow(expenseColumns, expenseRows, {
        2: expensesTotal > 0 ? 100 : 0,
        3: pct(expensesTotal, revenue),
      }),
    });

    await sendWorkbook(res, wb, 'monthly', range.period);
  }),
);

// ─────────────────────────── GET /losses ───────────────────────────

router.get(
  '/losses',
  requireFeature('losses_report'),
  ah(async (req, res) => {
    const { company, plan } = companyCtx(req);
    const range = resolveRange(req, plan);
    const storeIds = await getStoreIds(company.id, range.storeId);

    const where = {
      storeId: { in: storeIds },
      happenedAt: { gte: range.from, lt: range.toExclusive },
    };

    const [total, records, catalog] = await Promise.all([
      prisma.lossRecord.count({ where }),
      prisma.lossRecord.findMany({ where, orderBy: { happenedAt: 'desc' }, take: MAX_ROWS }),
      getSkuCatalog(storeIds, true),
    ]);

    const columns: ColumnDef[] = [
      { header: 'Sana', width: 12 },
      { header: 'SKU', width: 16 },
      { header: 'Mahsulot', width: 38 },
      { header: 'Turi', width: 16 },
      { header: 'Sxema', width: 10 },
      { header: 'Miqdor', width: 10, fmt: 'int', sum: true },
      { header: 'Summa', width: 16, fmt: 'money', sum: true },
      { header: 'Kompensatsiya', width: 16, fmt: 'money', sum: true },
      { header: 'Qoplanmagan', width: 16, fmt: 'money', sum: true },
      { header: 'Holat', width: 18 },
    ];

    const rows: Cell[][] = records.map((r) => {
      const info = r.skuId ? catalog.get(r.skuId) : undefined;
      return [
        toISODate(r.happenedAt),
        dash(info?.sku ?? null),
        info ? info.title : '—',
        LOSS_TYPE_LABEL[r.type] ?? r.type,
        r.scheme,
        r.qty,
        round(r.amount),
        round(r.compensated),
        round(Math.max(0, r.amount - r.compensated)),
        LOSS_STATUS_LABEL[r.status] ?? r.status,
      ];
    });

    const wb = newWorkbook();
    addSheet(wb, {
      name: 'Yo‘qotishlar',
      columns,
      rows,
      totals: totalsRow(columns, rows),
      note: limitNote(total),
    });

    await sendWorkbook(res, wb, 'losses', range.period);
  }),
);

// ─────────────────────────── GET /returns ───────────────────────────

router.get(
  '/returns',
  requireFeature('returns_report'),
  ah(async (req, res) => {
    const { company, plan } = companyCtx(req);
    const range = resolveRange(req, plan);
    const storeIds = await getStoreIds(company.id, range.storeId);

    const where = {
      storeId: { in: storeIds },
      returnedAt: { gte: range.from, lt: range.toExclusive },
    };

    const [total, records, catalog, sales] = await Promise.all([
      prisma.returnRecord.count({ where }),
      prisma.returnRecord.findMany({ where, orderBy: { returnedAt: 'desc' }, take: MAX_ROWS }),
      getSkuCatalog(storeIds, true),
      aggregateSales(storeIds, range.from, range.toExclusive),
    ]);

    // Qaytarish ulushi: qaytarilgan dona / (sotilgan + qaytarilgan) dona
    let soldUnits = 0;
    let returnedUnits = 0;
    for (const agg of sales.values()) {
      soldUnits += agg.units;
      returnedUnits += agg.returns;
    }
    const returnRate = pct(returnedUnits, soldUnits + returnedUnits);

    const columns: ColumnDef[] = [
      { header: 'Sana', width: 12 },
      { header: 'SKU', width: 16 },
      { header: 'Mahsulot', width: 38 },
      { header: 'Buyurtma kodi', width: 18 },
      { header: 'Miqdor', width: 10, fmt: 'int', sum: true },
      { header: 'Summa', width: 16, fmt: 'money', sum: true },
      { header: 'Sabab', width: 30 },
      { header: 'Holat', width: 16 },
    ];

    const rows: Cell[][] = records.map((r) => {
      const info = r.skuId ? catalog.get(r.skuId) : undefined;
      return [
        toISODate(r.returnedAt),
        dash(info?.sku ?? null),
        info ? info.title : '—',
        dash(r.orderCode),
        r.qty,
        round(r.amount),
        dash(r.reason),
        RETURN_STATUS_LABEL[r.status] ?? r.status,
      ];
    });

    const wb = newWorkbook();
    addSheet(wb, {
      name: 'Qaytarishlar',
      columns,
      rows,
      totals: totalsRow(columns, rows),
      note: limitNote(total),
    });

    // Umumiy ko'rsatkichlar alohida varaqda
    const summaryColumns: ColumnDef[] = [
      { header: 'Ko‘rsatkich', width: 32 },
      { header: 'Qiymat', width: 18, fmt: 'decimal' },
    ];
    const summaryRows: Cell[][] = [
      ['Qaytarilgan dona (davr bo‘yicha)', returnedUnits],
      ['Sotilgan dona (davr bo‘yicha)', soldUnits],
      ['Qaytarish ulushi, %', returnRate],
    ];
    addSheet(wb, { name: 'Xulosa', columns: summaryColumns, rows: summaryRows });

    await sendWorkbook(res, wb, 'returns', range.period);
  }),
);

// ─────────────────────────── GET /expenses ───────────────────────────

router.get(
  '/expenses',
  requireFeature('expenses'),
  ah(async (req, res) => {
    const { company, plan } = companyCtx(req);
    const range = resolveRange(req, plan);

    const [rows, storeTitles] = await Promise.all([
      prisma.expense.findMany({
        where: {
          companyId: company.id,
          date: { gte: range.from, lt: range.toExclusive },
          ...(range.storeId ? { storeId: range.storeId } : {}),
        },
        orderBy: { date: 'desc' },
        take: MAX_ROWS,
      }),
      getStoreTitles(company.id),
    ]);

    const columns: ColumnDef[] = [
      { header: 'Sana', width: 12 },
      { header: 'Kategoriya', width: 20 },
      { header: 'Do‘kon', width: 22 },
      { header: 'Manba', width: 14 },
      { header: 'Izoh', width: 44 },
      { header: 'Summa', width: 16, fmt: 'money', sum: true },
    ];

    const SOURCE_LABEL: Record<string, string> = {
      manual: 'Qo‘lda',
      uzum: 'Uzum',
      'uzum-payout': 'Uzum (to‘lovda)',
    };

    const data: Cell[][] = rows.map((r: (typeof rows)[number]) => [
      toISODate(r.date),
      CATEGORY_LABEL[r.category as ExpenseCategory] ?? r.category,
      r.storeId ? (storeTitles.get(r.storeId) ?? '—') : '—',
      SOURCE_LABEL[r.source] ?? r.source,
      r.note ?? '—',
      round(r.amount),
    ]);

    const wb = newWorkbook();
    addSheet(wb, {
      name: 'Xarajatlar',
      columns,
      rows: data,
      totals: totalsRow(columns, data),
      note: limitNote(rows.length),
    });
    await sendWorkbook(res, wb, 'expenses', range.period);
  }),
);

// ─────────────────────────── GET /illiquid ───────────────────────────

router.get(
  '/illiquid',
  requireFeature('illiquid'),
  ah(async (req, res) => {
    const { company, plan } = companyCtx(req);
    const range = resolveRange(req, plan);
    const storeIds = await getStoreIds(company.id, range.storeId);

    const [catalog, stocks, avgDaily, lastSale] = await Promise.all([
      getSkuCatalog(storeIds, true),
      getLatestStocks(storeIds),
      getAvgDaily(storeIds, 30),
      getLastSaleDates(storeIds),
    ]);

    const columns: ColumnDef[] = [
      { header: 'SKU', width: 18 },
      { header: 'Mahsulot', width: 40 },
      { header: 'Qoldiq', width: 10, fmt: 'int', sum: true },
      { header: 'Sotilmagan kun', width: 16, fmt: 'int' },
      { header: 'Oxirgi sotuv', width: 14 },
      { header: 'Muzlagan kapital', width: 18, fmt: 'money', sum: true },
      { header: 'Sotuv qiymati', width: 18, fmt: 'money', sum: true },
    ];

    const data: Cell[][] = [];
    for (const [skuId, st] of stocks) {
      const info = catalog.get(skuId);
      if (!info || st.total <= 0) continue;
      const last = lastSale.get(skuId) ?? null;
      const idle = last ? daysSince(last) : daysSince(info.createdAt);
      const avg = avgDaily.get(skuId) ?? 0;
      const daysLeft = avg > 0 ? Math.round(st.total / avg) : null;
      if (idle < 30 && !(daysLeft !== null && daysLeft > 90)) continue;
      data.push([
        info.sku,
        info.title,
        st.total,
        idle,
        last ? toISODate(last) : '—',
        round(st.total * (info.purchasePrice + info.extraCost)),
        round(st.total * info.price),
      ]);
    }
    data.sort((a, b) => Number(b[5]) - Number(a[5]));

    const wb = newWorkbook();
    addSheet(wb, {
      name: 'Nolikvid',
      columns,
      rows: data.slice(0, MAX_ROWS),
      totals: totalsRow(columns, data.slice(0, MAX_ROWS)),
      note: limitNote(data.length),
    });
    await sendWorkbook(res, wb, 'illiquid', range.period);
  }),
);

// ─────────────────────────── GET /storage ───────────────────────────

router.get(
  '/storage',
  requireFeature('paid_storage'),
  ah(async (req, res) => {
    const { company, plan } = companyCtx(req);
    const range = resolveRange(req, plan);
    const storeIds = await getStoreIds(company.id, range.storeId);

    const [fees, catalog] = await Promise.all([
      prisma.storageFee.findMany({
        where: { storeId: { in: storeIds }, date: { gte: range.from, lt: range.toExclusive } },
        orderBy: { date: 'desc' },
        take: MAX_ROWS,
      }),
      getSkuCatalog(storeIds, true),
    ]);

    const columns: ColumnDef[] = [
      { header: 'Sana', width: 12 },
      { header: 'SKU', width: 18 },
      { header: 'Mahsulot', width: 40 },
      { header: 'Dona', width: 10, fmt: 'int', sum: true },
      { header: 'Hajm, L', width: 12, fmt: 'decimal', sum: true },
      { header: 'To‘lov', width: 16, fmt: 'money', sum: true },
    ];

    const data: Cell[][] = fees.map((f) => {
      const info = f.skuId ? catalog.get(f.skuId) : undefined;
      return [
        toISODate(f.date),
        dash(info?.sku ?? null),
        info ? info.title : '—',
        f.qty,
        round(f.volumeL, 2),
        round(f.amount),
      ];
    });

    const wb = newWorkbook();
    addSheet(wb, {
      name: 'Pullik saqlash',
      columns,
      rows: data,
      totals: totalsRow(columns, data),
      note: limitNote(fees.length),
    });
    await sendWorkbook(res, wb, 'storage', range.period);
  }),
);

// ─────────────────────────── GET /warehouse ───────────────────────────

router.get(
  '/warehouse',
  requireFeature('warehouse'),
  ah(async (req, res) => {
    const { company, plan } = companyCtx(req);
    const range = resolveRange(req, plan);
    const storeIds = await getStoreIds(company.id, range.storeId);

    const [catalog, stocks, avgDaily, lastSale] = await Promise.all([
      getSkuCatalog(storeIds, true),
      getLatestStocks(storeIds),
      getAvgDaily(storeIds, 30),
      getLastSaleDates(storeIds),
    ]);

    const columns: ColumnDef[] = [
      { header: 'SKU', width: 18 },
      { header: 'Mahsulot', width: 40 },
      { header: 'O‘z ombori', width: 12, fmt: 'int', sum: true },
      { header: 'Band', width: 10, fmt: 'int', sum: true },
      { header: 'Yo‘lda', width: 10, fmt: 'int', sum: true },
      { header: 'Hajm, L', width: 12, fmt: 'decimal', sum: true },
      { header: 'Tannarx qiymati', width: 18, fmt: 'money', sum: true },
      { header: 'Holat', width: 14 },
    ];

    const data: Cell[][] = [];
    for (const [skuId, st] of stocks) {
      const info = catalog.get(skuId);
      if (!info) continue;
      if (st.own <= 0 && st.reserved <= 0 && st.inTransit <= 0) continue;
      const avg = avgDaily.get(skuId) ?? 0;
      const state = stockState(st.own, avg, daysSince(lastSale.get(skuId)), daysSince(info.createdAt));
      data.push([
        info.sku,
        info.title,
        st.own,
        st.reserved,
        st.inTransit,
        round(st.own * info.volumeL, 2),
        round(st.own * (info.purchasePrice + info.extraCost)),
        state.status,
      ]);
    }
    data.sort((a, b) => Number(b[6]) - Number(a[6]));

    const wb = newWorkbook();
    addSheet(wb, {
      name: 'Ombor',
      columns,
      rows: data.slice(0, MAX_ROWS),
      totals: totalsRow(columns, data.slice(0, MAX_ROWS)),
      note: limitNote(data.length),
    });
    await sendWorkbook(res, wb, 'warehouse', range.period);
  }),
);

export default router;
