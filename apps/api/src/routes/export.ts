/**
 * Excel eksport moduli — /api/v1/export
 *
 *  GET /sales           → buyurtma pozitsiyalari (sotuv tahlili)
 *  GET /sales-stock     → sotuv va qoldiq (SKU kesimida)
 *  GET /products        → mahsulotlar assortimenti
 *  GET /stocks          → omborlardagi qoldiqlar
 *  GET /abc             → ABC tahlil
 *  GET /unit-economics  → unit-iqtisod (1 dona uchun)
 *  GET /product-profit  → mahsulot foydasi (sahifadagi jadval + SKU variantlari)
 *  GET /monthly         → oylik hisobot — "Oylik hisobot" sahifasi bilan bitta javobdan (services/monthly-report.ts)
 *  GET /losses          → yo'qotishlar
 *  GET /returns         → qaytarishlar
 *  GET /planner         → sotib olish ro'yxati yetkazib beruvchi uchun (Rejalashtiruvchi, services/plan.ts)
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
  classifyAbc,
  logisticsFee,
  storageFeePerDay,
  storageTariffKind,
  turnoverDays,
  parseSkuQuery,
  pct,
  round,
  safeDiv,
  toISODate,
  toBusinessDate,
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
  getLastSaleDates,
  getLatestStocks,
  getSkuCatalog,
  getStoreIds,
  getStoreTitles,
  isSalesStockVisible,
  skuInfoMatches,
  stockState,
  withSoldSkus,
  type SkuInfo,
} from '../services/common.js';
import { aggregateSalesNet } from '../services/pnl.js';
import { loadReturnLines } from '../services/returns.js';
import type { ProductProfitFlag } from '@savdoiq/shared';
import { buildProductProfit } from '../services/product-profit.js';
import {
  BUSINESS_TZ_OFFSET_MS,
  EXPENSE_CATEGORIES,
  formatNumber,
  type Insight,
  type MonthlyReportResponse,
  type PlanId,
} from '@savdoiq/shared';
import type { ResolvedRange } from '../lib/period.js';
import {
  RETURNS_DANGER_PCT,
  RETURNS_WARN_PCT,
  buildMonthlyReport,
  collectMonthCompare,
  monthLabel,
  type MonthCompareRow,
} from '../services/monthly-report.js';
import {
  loadPlanData,
  parseStatusFilter,
  parseStockStatus,
  planProduct,
  planSku,
  planStockStatus,
  planTable,
} from '../services/plan.js';

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

/** SavdoIQ o'zi aniqlagan yozuvlar turi (`LossRecord.source`) */
const LOSS_KIND_LABEL: Record<string, string> = {
  balance: 'Hisobda yo‘q',
  counter: 'Uzum: yo‘qolgan',
  defect: 'Brak',
  shortage: 'Qabulda kam',
};

const LOSS_STATUS_LABEL: Record<string, string> = {
  open: 'Ochiq',
  claimed: 'Da’vo yuborilgan',
  compensated: 'Qoplangan',
  rejected: 'Rad etilgan',
};

const RETURN_STATUS_LABEL: Record<string, string> = {
  canceled: 'Bekor qilingan',
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
        toBusinessDate(it.orderedAt),
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

    const [catalog, planData, sales, avgDaily, lastSale] = await Promise.all([
      getSkuCatalog(storeIds, true),
      /*
       * "Holat", "Qoldiq (kun)" va "O'rt. kunlik" — Rejalashtiruvchining o'zi
       * (services/plan.ts planStockStatus, kompaniyaning yetkazish muddati),
       * sahifadagi va Qoldiqlardagi nishon bilan bir xil. Ilgari fayl 7/14
       * kunlik qat'iy chegara va oddiy 30 kunlik o'rtacha bilan hisoblardi:
       * yetkazish 14 kun bo'lsa sahifada "Kritik" turgan SKU faylda
       * "Tugayapti" edi (2026-10-24). Qoldiq ham rejadan — u `getLatestStocks` ni o'zi yuklaydi.
       */
      loadPlanData(company.id, storeIds),
      aggregateSalesNet(company.id, storeIds, range.from, range.toExclusive, range.storeId),
      getAvgDaily(storeIds, 30),
      getLastSaleDates(storeIds),
    ]);
    const stocks = planData.stocks;
    // Sahifadagidek: yashirilgan, lekin davrda sotilgan SKU ham faylda — ilgari JAMI tushum sahifadagidan kam chiqardi
    await withSoldSkus(catalog, sales.keys(), storeIds);
    /*
     * Sahifa (GET /stocks/sales-stock) `?status=` va `?search=` ni serverda
     * qo'llaydi va tugma ularni faylga ham yuboradi — fayl o'sha qoidalar
     * bilan: holat planStockStatus'dan, qidiruv services/common.ts
     * skuInfoMatches. Ilgari ikkalasi e'tiborsiz qolardi: "Kritik" yoki
     * qidiruv bilan turgan sahifadan Excel bosilsa, faylda barcha SKU chiqardi (2026-10-27).
     */
    const onlyStatus = parseStockStatus(req.query.status);
    const query = parseSkuQuery(range.search);

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
      .filter((info) => query === null || skuInfoMatches(info, query))
      .map((info) => {
        const agg = sales.get(info.id);
        const st = stocks.get(info.id);
        const avg = avgDaily.get(info.id) ?? 0;
        const total = st?.total ?? 0;
        // Sotuvi yo'q va arxivdagi SKU (rejada `no_action` yoki umuman yo'q) — eski qoldiq qoidasi
        const planned = planSku(planData, info.id);
        const state = planStockStatus(
          planned,
          stockState(total, avg, daysSince(lastSale.get(info.id)), daysSince(info.createdAt)),
        );
        // "Yetadi" shu tezlikdan chiqadi — sahifadagi kabi bir manbadan (routes/stocks.ts)
        const daily = planned && planned.status !== 'no_action' ? planned.avgDaily : avg;
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
          daily,
          state,
          monthPotential: Math.max(0, Math.round(round(daily, 2) * 30)),
          total,
        };
      })
      // Sahifa bilan bir xil qoida (services/common.ts); ilgari sur'ati bor, qoldig'i tugagan SKU faylga tushmasdi
      .filter((r) => isSalesStockVisible(r.sold, r.revenue, r.total, r.avg))
      .filter((r) => onlyStatus === null || r.state.status === onlyStatus)
      // Sahifaning standart tartibi (tushum, kamayish) — sahifadagi yaxlitlangan tushum bo'yicha
      .sort((a, b) => round(b.revenue) - round(a.revenue));

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
      round(r.daily, 2),
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

    const [catalog, planData, sales, products] = await Promise.all([
      getSkuCatalog(storeIds, true),
      /*
       * "Qoldiq (kun)" va "Buyurtma kerak" — Rejalashtiruvchining o'zi
       * (services/plan.ts planProduct, kompaniyaning yetkazish muddati va zaxira
       * davri), sahifadagi kartochka bilan bir xil son. Ilgari bu yerda jami
       * qoldiq jami o'rtachaga bo'linardi va `recommendedQty(o'rtacha, 30, qoldiq)`
       * qat'iy 30 + 7 kun bilan, yo'ldagi tovarsiz hisoblanardi: fayldagi son
       * sahifadagidan farq qilardi, tugagan variant esa boshqalarining
       * qoldig'iga "o'rtacha" bo'lib singib ketardi (2026-10-24). Qoldiq ham
       * rejadan — u `getLatestStocks` ni o'zi yuklaydi.
       */
      loadPlanData(company.id, storeIds),
      aggregateSalesNet(company.id, storeIds, range.from, range.toExclusive, range.storeId),
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
      /** Mahsulot SKU'lari — reja xulosasi (planProduct) shular bo'yicha */
      skuIds: string[];
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
        skuIds: [],
      });
    }

    const stocks = planData.stocks;
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
      p.cogs += (agg?.cogs ?? 0) + (agg?.otherCost ?? 0);
      p.fbo += st?.fbo ?? 0;
      p.fbs += st?.fbs ?? 0;
      p.own += st?.own ?? 0;
      p.skuIds.push(info.id);
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
      // Eng tez tugaydigan SOTILADIGAN variant va SKU'lar bo'yicha qo'shilgan sotib olish — kartochkadagi kabi
      const planned = planProduct(planData, p.skuIds);
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
        planned?.daysLeft ?? null,
        // Kompaniyaning zaxira davri + yetkazish muddati, yo'ldagi tovar bilan (Rejalashtiruvchi)
        planned?.reorderQty ?? 0,
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

    const [catalog, planData, avgDaily, lastSale] = await Promise.all([
      getSkuCatalog(storeIds, true),
      /*
       * "Holat", "Qoldiq (kun)" va "O'rt. kunlik" — Qoldiqlar sahifasining
       * o'zi (GET /stocks: planStockStatus, kompaniyaning yetkazish muddati,
       * yo'ldagi tovar bilan). Ilgari fayl 7/14 kunlik qat'iy chegara va oddiy
       * 30 kunlik o'rtacha bilan hisoblardi: sahifada "Kritik" turgan SKU
       * faylda "Tugayapti" edi (2026-10-24). Qoldiq ham rejadan — u
       * `getLatestStocks` ni o'zi yuklaydi.
       */
      loadPlanData(company.id, storeIds),
      getAvgDaily(storeIds, 30),
      getLastSaleDates(storeIds),
    ]);
    const stocks = planData.stocks;
    /*
     * Fayl — sahifadagi jadvalning AYNAN o'zi: do'kon, `?status=` (sahifadagi
     * holat tugmasi) va `?search=` (umumiy qidiruv qoidasi, services/common.ts
     * skuInfoMatches — sahifa ham shu maydonlar bilan qidiradi). Ilgari ikkalasi
     * e'tiborsiz qolardi va faylda doim butun ombor chiqardi; qoldig'i 0 bo'lgan
     * SKU esa (sahifada qizil "0" bilan turgan "Kritik") faylga umuman
     * tushmasdi (2026-10-27).
     */
    const onlyStatus = parseStockStatus(req.query.status);
    const query = parseSkuQuery(range.search);

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
      .filter((info) => query === null || skuInfoMatches(info, query))
      .map((info) => {
        const st = stocks.get(info.id);
        const avg = avgDaily.get(info.id) ?? 0;
        const total = st?.total ?? 0;
        // Sotuvi yo'q va arxivdagi SKU (rejada `no_action` yoki umuman yo'q) — eski qoldiq qoidasi
        const planned = planSku(planData, info.id);
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
          // "Yetadi" shu tezlikdan chiqadi — sahifadagi kabi bir manbadan
          avg: planned && planned.status !== 'no_action' ? planned.avgDaily : avg,
          state: planStockStatus(
            planned,
            stockState(total, avg, daysSince(lastSale.get(info.id)), daysSince(info.createdAt)),
          ),
        };
      })
      .filter((r) => onlyStatus === null || r.state.status === onlyStatus)
      // Sahifaning standart tartibi (GET /stocks: tannarx qiymati, kamayish) — o'sha yaxlitlangan qiymat bo'yicha
      .sort((a, b) => round(b.costValue) - round(a.costValue));

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
      aggregateSalesNet(company.id, storeIds, range.from, range.toExclusive, range.storeId),
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
      .filter((r) => r.revenue > 0 || r.units > 0);

    // ABC sahifasi bilan bitta qoida (shared classifyAbc) — chegaradagi SKU ikkalasida bir guruhda
    const classified = classifyAbc(list, (r) => r.revenue);

    const rows: Cell[][] = classified.slice(0, MAX_ROWS).map(({ item: r, share, cumulativeShare, group }) => [
      r.info.sku,
      r.info.title,
      r.info.storeTitle,
      round(r.revenue),
      round(r.profit),
      r.units,
      share,
      cumulativeShare,
      group,
    ]);

    const wb = newWorkbook();
    addSheet(wb, {
      name: 'ABC tahlil',
      columns,
      rows,
      totals: totalsRow(columns, rows, { 6: list.some((r) => r.revenue > 0) ? 100 : 0, 7: null }),
      note: limitNote(list.length),
    });

    await sendWorkbook(res, wb, 'abc', range.period);
  }),
);

// ─────────────────────────── GET /unit-economics ───────────────────────────

/** Bir donaning omborda turishi shundan uzun hisoblanmaydi (kalkulyatordagi maydon chegarasi bilan bir xil) */
const UNIT_STORAGE_MAX_DAYS = 365;

/**
 * Bir sotilgan donaga saqlash — Uzum tarifi (shared tariffs.ts, 01.06.2026 dan).
 * Aylanma = Uzum omboridagi (FBO) qoldiq ÷ davrdagi o'rtacha kunlik sotuv; 60
 * kungacha bepul, keyin hajm × stavka har kuni. Dona omborda o'rtacha aylanma
 * kunicha turadi, shuning uchun bir donaga = kunlik to'lov × aylanma (365 kun
 * bilan cheklangan). Davrda sotuv bo'lmasa — bir donaning 30 kunlik to'lovi
 * (ustunning avvalgi "oylik" ma'nosi). Hajm noma'lum yoki FBO qoldiq yo'q — 0.
 *
 * Ilgari: hajm × 120 so'm × 30 kun — o'lchanmagan, ~10 baravar katta stavka,
 * bepul davrsiz (2026-10-24).
 */
function storagePerSoldUnit(info: SkuInfo, fbo: number, avgDaily: number): number {
  const turnover = turnoverDays(fbo, avgDaily);
  const perDay = storageFeePerDay({
    units: 1,
    volumeL: info.volumeL,
    turnover,
    kind: storageTariffKind(info.category),
  });
  if (perDay === 0) return 0;
  return perDay * (Number.isFinite(turnover) ? Math.min(turnover, UNIT_STORAGE_MAX_DAYS) : 30);
}

router.get(
  '/unit-economics',
  requireFeature('unit_economics'),
  ah(async (req, res) => {
    const { company, plan } = companyCtx(req);
    const range = resolveRange(req, plan);
    const storeIds = await getStoreIds(company.id, range.storeId);
    const taxRate = company.taxRate;
    const periodDays = Math.max(1, Math.round((range.toExclusive.getTime() - range.from.getTime()) / 86_400_000));

    const [catalog, sales, stocks] = await Promise.all([
      getSkuCatalog(storeIds, true),
      aggregateSalesNet(company.id, storeIds, range.from, range.toExclusive, range.storeId),
      getLatestStocks(storeIds),
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
        // aks holda Uzum tarifi (logistika hajmdan) va platforma taxminlari (DEFAULTS).
        const commission = units > 0 ? safeDiv(agg?.commission ?? 0, units) : (price * (info.commissionPct || DEFAULTS.commissionPct)) / 100;
        const logistics =
          units > 0 ? safeDiv(agg?.logistics ?? 0, units) : (logisticsFee(info.volumeL) ?? DEFAULTS.logisticsPerUnit);
        // Saqlash: Uzum kartochkasidagi oylik to'lov, bo'lmasa — Uzum tarifi bo'yicha (aylanmadan)
        const storage =
          info.storagePerItem > 0
            ? info.storagePerItem
            : storagePerSoldUnit(info, stocks.get(info.id)?.fbo ?? 0, units / periodDays);
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

/*
 * Oylik hisobot fayli — "Oylik hisobot" sahifasining AYNAN o'zi (2026-10-24).
 *
 * Raqamlar services/monthly-report.ts `buildMonthlyReport` javobidan olinadi:
 * sahifa ham, bu fayl ham, Telegram'ga yuboriladigan nusxa ham
 * (routes/reports.ts) bitta javobdan quriladi — bu yerda qayta hisob YO'Q,
 * faqat joylashtirish. Ilgari fayl o'zicha hisoblardi: kunlik foyda davr
 * xarajatlarisiz, soliq faqat qo'lda kiritilmagan bo'lsagina, saqlash to'lovi
 * esa umuman yo'q — fayldagi sof foyda va marja sahifadagidan baland chiqardi.
 * "Qaytarish (dona)" ustuni ham olib tashlandi: jonli Uzumda qaytgan satrda
 * qty = 0 keladi va u doim 0 ko'rsatardi; qaytarishlar "Xulosa"da, sahifadagidek.
 */

/** Xarajat nomlari sahifadagidek (shared EXPENSE_CATEGORIES) — fayl va ekran bitta atamada */
const reportExpenseLabel = (c: ExpenseCategory): string =>
  EXPENSE_CATEGORIES.find((x) => x.id === c)?.label.uz ?? CATEGORY_LABEL[c];

const DELIVERY_LABEL: Record<DeliveryType, string> = {
  FBO: 'Uzum omboridan',
  FBS: 'O‘z omboringizdan',
  DBS: 'O‘zingiz yetkazasiz',
};

const INSIGHT_LEVEL_LABEL: Record<Insight['level'], string> = {
  danger: 'Xavf',
  warning: 'Diqqat',
  success: 'Yaxshi',
  info: 'Ma’lumot',
};

/** 2026-10-24 → 24.10.2026 */
const dmy = (iso: string): string => `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}`;

/** Fayl tuzilgan payt, Toshkent vaqti: 24.10.2026 14:05 */
function tashkentStamp(now: Date): string {
  const t = new Date(now.getTime() + BUSINESS_TZ_OFFSET_MS);
  const hh = String(t.getUTCHours()).padStart(2, '0');
  const mm = String(t.getUTCMinutes()).padStart(2, '0');
  return `${dmy(toISODate(t))} ${hh}:${mm}`;
}

const n0 = (v: number): string => formatNumber(v, 'uz');
const p1 = (v: number): string => `${formatNumber(v, 'uz', 1)}%`;

interface SummaryRow {
  label: string;
  value: Cell;
  fmt?: FormatId;
  note?: string;
  /** Asosiy natija qatori — qalin */
  strong?: boolean;
}

/**
 * "Ko'rsatkich — qiymat — izoh" varag'i. Ustunga bitta format bu yerda
 * yaramaydi (pul, foiz va dona bitta ustunda), shuning uchun format har
 * katakka alohida; sarlavha boshqa varaqlardagi (addSheet) kabi bo'yaladi.
 */
function addSummarySheet(wb: Workbook, name: string, rows: SummaryRow[]): Worksheet {
  const ws = wb.addWorksheet(name, { views: [{ state: 'frozen', ySplit: 1 }] });
  ws.columns = [
    { header: 'Ko‘rsatkich', width: 30 },
    { header: 'Qiymat', width: 22 },
    { header: 'Izoh', width: 80 },
  ];

  for (const r of rows) {
    const row = ws.addRow([r.label, r.value, r.note ?? null]);
    const value = row.getCell(2);
    if (r.fmt && typeof r.value === 'number') {
      value.numFmt = FMT[r.fmt];
      value.alignment = { horizontal: 'right', vertical: 'middle' };
    } else {
      value.alignment = { horizontal: 'left', vertical: 'middle' };
    }
    row.getCell(3).font = { size: 10, color: { argb: 'FF6B7280' } };
    if (r.strong) {
      row.getCell(1).font = { bold: true };
      value.font = { bold: true };
    }
  }

  const head = ws.getRow(1);
  head.height = 24;
  head.font = { bold: true, size: 11, color: { argb: 'FFFFFFFF' } };
  head.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  head.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_BG } };
    cell.border = { bottom: { style: 'thin', color: { argb: HEADER_LINE } } };
  });
  return ws;
}

export interface MonthlyFileContext {
  companyName: string;
  /** Do'kon filtri bo'lsa — uning nomi; barcha do'konlar bo'yicha null */
  storeTitle: string | null;
  /** Sinov uchun: fayl tuzilgan payt */
  now?: Date;
}

/** Oylik hisobot fayli — sahifadagi har blok alohida varaqda, raqamlar javobdan o'zgarishsiz */
export function buildMonthlyWorkbook(
  r: MonthlyReportResponse,
  compare: MonthCompareRow[],
  ctx: MonthlyFileContext,
): Workbook {
  const fin = r.finality;
  const ofRevenue = (v: number): string | undefined => (r.revenue > 0 ? `tushumning ${p1(pct(v, r.revenue))}` : undefined);
  const activeOrders = Math.max(0, r.ordersTotal - r.canceled - r.returns);
  const capital = r.warehouse.fboAmount + r.warehouse.fbsAmount;

  const statusNote =
    fin.reason === 'current'
      ? 'Davr hali tugamagan — yangi buyurtma, bekor qilish va qaytarishlar raqamlarni o‘zgartiradi'
      : fin.reason === 'in_transit'
        ? `${n0(fin.inTransitUnits)} dona hali xaridorga yetib bormagan — ular bekor bo‘lishi yoki qaytishi mumkin`
        : 'Davr tugagan va buyurtmalar yakunlangan — raqamlar endi deyarli o‘zgarmaydi';

  const wb = newWorkbook();

  // 1-varaq — xulosa: sahifa sarlavhasi, natija kartochkasi, buyurtmalar oqimi va xavf
  addSummarySheet(wb, 'Xulosa', [
    { label: 'Kompaniya', value: ctx.companyName },
    { label: 'Do‘kon', value: ctx.storeTitle ?? 'Barcha do‘konlar' },
    { label: 'Davr', value: `${dmy(r.period.from)} — ${dmy(r.period.to)}` },
    { label: 'Holat', value: fin.status === 'final' ? 'Yakuniy' : 'Oraliq', note: statusNote, strong: true },
    {
      label: 'Yakunlangan',
      value: fin.completionPct,
      fmt: 'percent',
      note: `${n0(fin.completedUnits)} / ${n0(fin.orderedUnits)} dona — xaridor qabul qilgan, bekor qilingan yoki qaytgan. Yakuniy bo‘lishi uchun kamida ${fin.thresholdPct}%`,
    },
    { label: 'Tuzilgan', value: tashkentStamp(ctx.now ?? new Date()), note: 'Toshkent vaqti' },
    { label: '', value: null },
    {
      label: 'Tushum',
      value: r.revenue,
      fmt: 'money',
      note: `${n0(r.ordersTotal)} buyurtma · ${n0(r.unitsSold)} dona`,
    },
    { label: 'To‘lov (Uzum o‘tkazadi)', value: r.payout, fmt: 'money', note: 'Tushum − komissiya − logistika' },
    { label: 'Tannarx', value: r.cogs, fmt: 'money', note: ofRevenue(r.cogs) },
    { label: 'Yalpi foyda', value: r.grossProfit, fmt: 'money', note: `Marja ${p1(r.grossMargin)} · tannarxdan keyin` },
    {
      label: 'Jami xarajatlar',
      value: r.expensesTotal,
      fmt: 'money',
      note: [ofRevenue(r.expensesTotal), 'kategoriyalar «Xarajatlar» varag‘ida'].filter(Boolean).join(' · '),
    },
    {
      label: r.netProfit < 0 ? 'Zarar' : 'Sof foyda',
      value: r.netProfit,
      fmt: 'money',
      note: 'Barcha xarajat va soliqdan keyin — Boshqaruv paneli bilan bir xil',
      strong: true,
    },
    { label: 'Sof marja', value: r.margin, fmt: 'percent' },
    { label: '', value: null },
    { label: 'Buyurtmalar', value: r.ordersTotal, fmt: 'int', note: 'Bekor va qaytganlar bilan' },
    { label: 'Muvaffaqiyatli', value: r.ordersSuccess, fmt: 'int', note: 'Bekor qilinmagan, qaytmagan' },
    /*
     * Ulushlar nomida asosi yoziladi: muvaffaqiyat — BUYURTMA bo'yicha,
     * qaytarish — DONA bo'yicha (Boshqaruv paneli kartasi bilan bir xil son,
     * services/returns.ts). Ilgari ikkalasi ham buyurtmadan edi va fayldagi
     * "Qaytarish ulushi" paneldagidan farq qilardi; bekor/qaytarilgan esa
     * buyurtma SONI bo'lib qoladi (2026-10-27).
     */
    { label: 'Muvaffaqiyat ulushi (buyurtma)', value: r.successRate, fmt: 'percent', note: 'Muvaffaqiyatli ÷ jami buyurtmalar' },
    { label: 'Bekor qilingan buyurtma', value: r.canceled, fmt: 'int', note: 'Yetkazilmagan buyurtmalar soni' },
    { label: 'Qaytarilgan buyurtma', value: r.returns, fmt: 'int', note: 'Mijoz qaytargan buyurtmalar soni' },
    {
      label: 'Qaytarish ulushi (dona)',
      // Asos yo'q (hamma tovar hali yo'lda) — panel kartasidagidek tire, "0%" emas
      value: r.receivedUnits + r.returnedUnits > 0 ? r.returnRate : '—',
      fmt: 'percent',
      note: `Qaytgan dona ÷ (xaridor qabul qilgan + qaytgan dona) — Boshqaruv paneli bilan bir xil. ${n0(r.returnedUnits)} dona qaytdi, ${n0(r.receivedUnits)} dona qabul qilindi. ${RETURNS_WARN_PCT}% gacha — normal, ${RETURNS_DANGER_PCT}% dan — xavfli`,
    },
    { label: 'Sotildi, dona', value: r.unitsSold, fmt: 'int', note: 'Muvaffaqiyatli buyurtmalarda' },
    { label: 'O‘rtacha chek', value: r.avgCheck, fmt: 'money', note: `${n0(activeOrders)} buyurtma asosida` },
    { label: '', value: null },
    {
      label: 'Ombor kapitali',
      value: capital,
      fmt: 'money',
      note: `FBO ${n0(r.warehouse.fbo)} dona · FBS ${n0(r.warehouse.fbs)} dona — hozirgi qoldiq, tannarx bo‘yicha`,
    },
    { label: 'Soliq stavkasi', value: r.taxRate, fmt: 'percent', note: 'Sozlamalardagi stavka' },
  ]);

  // 2-varaq — kunlik dinamika (sahifadagi grafik), foyda davr xarajatlaridan keyin
  const dailyColumns: ColumnDef[] = [
    { header: 'Sana', width: 14 },
    { header: 'Tushum', width: 16, fmt: 'money', sum: true },
    { header: 'Sof foyda', width: 16, fmt: 'money', sum: true },
    { header: 'To‘lov', width: 16, fmt: 'money', sum: true },
    { header: 'Buyurtmalar', width: 13, fmt: 'int', sum: true },
    { header: 'Sotildi (dona)', width: 13, fmt: 'int', sum: true },
    { header: 'Marja', width: 10, fmt: 'percent' },
  ];
  // Kunlar soni tarif tarixi bilan cheklangan, ammo himoya sifatida MAX_ROWS qo'llanadi
  const dailyRows: Cell[][] = r.daily
    .slice(0, MAX_ROWS)
    .map((d) => [d.date, d.revenue, d.profit, d.payout ?? 0, d.orders, d.units, pct(d.profit, d.revenue)]);
  addSheet(wb, {
    name: 'Kunlik',
    columns: dailyColumns,
    rows: dailyRows,
    totals: totalsRow(dailyColumns, dailyRows, { 6: r.margin }),
    note:
      limitNote(r.daily.length) ??
      'Sof foyda — davr xarajatlaridan keyin: qo‘lda kiritilgan oylik xarajat (ish haqi, ijara) oy kunlariga teng bo‘lingan. Kunlar yig‘indisi «Xulosa»dagi sof foydaga teng.',
  });

  // 3-varaq — davr xarajatlari (sahifadagi "Davr xarajatlari" kartochkasi)
  const expenseColumns: ColumnDef[] = [
    { header: 'Kategoriya', width: 24 },
    { header: 'Summa', width: 18, fmt: 'money', sum: true },
    { header: 'Ulush', width: 10, fmt: 'percent' },
    { header: 'Tushumga nisbatan', width: 18, fmt: 'percent' },
  ];
  const expenseRows: Cell[][] = r.expenses.map((e) => [
    reportExpenseLabel(e.category),
    e.amount,
    pct(e.amount, r.expensesTotal),
    pct(e.amount, r.revenue),
  ]);
  addSheet(wb, {
    name: 'Xarajatlar',
    columns: expenseColumns,
    rows: expenseRows,
    // Jami — sahifadagi "Jami xarajat" (qatorlar alohida yaxlitlangani uchun yig'indidan 1 so'mga farq qilishi mumkin)
    totals: totalsRow(expenseColumns, expenseRows, {
      1: r.expensesTotal,
      2: r.expensesTotal > 0 ? 100 : 0,
      3: pct(r.expensesTotal, r.revenue),
    }),
    note: 'Tannarx bu yerga kirmaydi — u «Xulosa»da alohida: tushum − tannarx − xarajatlar = sof foyda.',
  });

  // 4-varaq — top sotuvlar
  const topColumns: ColumnDef[] = [
    { header: '#', width: 6, fmt: 'int' },
    { header: 'SKU', width: 16 },
    { header: 'Mahsulot', width: 44 },
    { header: 'Dona', width: 9, fmt: 'int', sum: true },
    { header: 'Tushum', width: 16, fmt: 'money', sum: true },
    { header: 'Foyda', width: 16, fmt: 'money', sum: true },
    { header: 'Marja', width: 10, fmt: 'percent' },
    { header: 'Ulush', width: 10, fmt: 'percent', sum: true },
  ];
  const topRows: Cell[][] = r.topProducts.map((p, i) => [
    i + 1,
    p.sku,
    // SKU nomi ko'pincha faqat variant («ЧЕРН») — faylda mahsulot nomi bilan birga
    p.productTitle && p.productTitle !== p.title ? `${p.productTitle} — ${p.title}` : p.title,
    p.units,
    p.revenue,
    p.profit,
    p.margin,
    p.share,
  ]);
  const topRevenue = r.topProducts.reduce((s, p) => s + p.revenue, 0);
  const topProfit = r.topProducts.reduce((s, p) => s + p.profit, 0);
  addSheet(wb, {
    name: 'Top sotuvlar',
    columns: topColumns,
    rows: topRows,
    totals: totalsRow(topColumns, topRows, { 6: pct(topProfit, topRevenue) }, 'JAMI'),
    note: 'Foyda — mahsulotning o‘z reklama to‘lovi ayirilgan; tushum bo‘yicha eng ko‘p sotilgan 10 ta SKU.',
  });

  // 5-varaq — kategoriyalar bo'yicha tushum
  const categoryColumns: ColumnDef[] = [
    { header: 'Kategoriya', width: 34 },
    { header: 'Tushum', width: 18, fmt: 'money', sum: true },
    { header: 'Ulush', width: 10, fmt: 'percent', sum: true },
  ];
  const categoryRows: Cell[][] = r.categories.map((c) => [c.category, c.revenue, c.share]);
  addSheet(wb, {
    name: 'Kategoriyalar',
    columns: categoryColumns,
    rows: categoryRows,
    totals: totalsRow(categoryColumns, categoryRows),
  });

  // 6-varaq — yetkazib berish turlari
  const deliveryTotal = r.deliveryTypes.reduce((s, d) => s + d.orders, 0);
  const deliverySuccess = r.deliveryTypes.reduce((s, d) => s + d.success, 0);
  const deliveryColumns: ColumnDef[] = [
    { header: 'Turi', width: 8 },
    { header: 'Izoh', width: 22 },
    { header: 'Buyurtmalar', width: 13, fmt: 'int', sum: true },
    { header: 'Ulush', width: 10, fmt: 'percent' },
    { header: 'Muvaffaqiyatli', width: 15, fmt: 'int', sum: true },
    { header: 'Muvaffaqiyat ulushi', width: 18, fmt: 'percent' },
  ];
  const deliveryRows: Cell[][] = r.deliveryTypes.map((d) => [
    d.type,
    DELIVERY_LABEL[d.type] ?? d.type,
    d.orders,
    pct(d.orders, deliveryTotal),
    d.success,
    pct(d.success, d.orders),
  ]);
  addSheet(wb, {
    name: 'Yetkazish',
    columns: deliveryColumns,
    rows: deliveryRows,
    totals: totalsRow(deliveryColumns, deliveryRows, {
      3: deliveryTotal > 0 ? 100 : 0,
      5: pct(deliverySuccess, deliveryTotal),
    }),
  });

  // 7-varaq — ombor (hozirgi qoldiq, tannarx bo'yicha)
  const warehouseColumns: ColumnDef[] = [
    { header: 'Joy', width: 8 },
    { header: 'Izoh', width: 20 },
    { header: 'Dona', width: 10, fmt: 'int', sum: true },
    { header: 'Tannarx qiymati', width: 18, fmt: 'money', sum: true },
    { header: 'Ulush (qiymat)', width: 15, fmt: 'percent' },
  ];
  const warehouseRows: Cell[][] = [
    ['FBO', 'Uzum omborida', r.warehouse.fbo, r.warehouse.fboAmount, pct(r.warehouse.fboAmount, capital)],
    ['FBS', 'O‘z omboringizda', r.warehouse.fbs, r.warehouse.fbsAmount, pct(r.warehouse.fbsAmount, capital)],
  ];
  addSheet(wb, {
    name: 'Ombor',
    columns: warehouseColumns,
    rows: warehouseRows,
    totals: totalsRow(warehouseColumns, warehouseRows, { 4: capital > 0 ? 100 : 0 }),
    note: 'Fayl tuzilgan paytdagi qoldiq — tanlangan davrga bog‘liq emas.',
  });

  // 8-varaq — oylar taqqoslovi (sahifadagi "Oylar taqqoslash")
  const compareColumns: ColumnDef[] = [
    { header: 'Oy', width: 18 },
    { header: 'Tushum', width: 18, fmt: 'money', sum: true },
    { header: 'Sof foyda', width: 18, fmt: 'money', sum: true },
    { header: 'Marja', width: 10, fmt: 'percent' },
  ];
  const compareRows: Cell[][] = compare.map((m) => [monthLabel(m.month), m.revenue, m.profit, m.margin]);
  const compareRevenue = compare.reduce((s, m) => s + m.revenue, 0);
  const compareProfit = compare.reduce((s, m) => s + m.profit, 0);
  addSheet(wb, {
    name: 'Oylar',
    columns: compareColumns,
    rows: compareRows,
    totals: totalsRow(compareColumns, compareRows, { 3: pct(compareProfit, compareRevenue) }),
    note: 'Oxirgi oylar (joriy oy — bugungacha), tanlangan davrga bog‘liq emas. Sof foyda — davr xarajatlaridan keyin.',
  });

  // 9-varaq — xulosalar matni
  const insightColumns: ColumnDef[] = [
    { header: 'Daraja', width: 12 },
    { header: 'Xulosa', width: 60 },
    { header: 'Batafsil', width: 110 },
  ];
  const insights = addSheet(wb, {
    name: 'Xulosalar',
    columns: insightColumns,
    rows: r.insights.map((i) => [INSIGHT_LEVEL_LABEL[i.level] ?? i.level, i.title, i.body]),
  });
  insights.getColumn(3).alignment = { horizontal: 'left', vertical: 'top', wrapText: true };

  return wb;
}

/**
 * Hisobot va uning fayli bitta yo'ldan: GET /monthly ham, Telegram'ga
 * yuborish ham (routes/reports.ts) shuni chaqiradi — ikkalasida bir xil davr
 * qoidasi (`?month=` yoki from/to/preset, tarif chegarasi), bir xil raqam.
 */
export async function loadMonthlyWorkbook(input: {
  company: { id: string; name: string; taxRate: number };
  plan: PlanId;
  range: ResolvedRange;
  month?: string | null;
}): Promise<{ report: MonthlyReportResponse; workbook: Workbook; fileName: string }> {
  const { company, plan, range } = input;
  const storeIds = await getStoreIds(company.id, range.storeId);
  const [report, compare, storeTitles] = await Promise.all([
    buildMonthlyReport({ companyId: company.id, taxRate: company.taxRate, plan, storeIds, range, month: input.month }),
    collectMonthCompare(company.id, storeIds, plan, range.storeId),
    range.storeId ? getStoreTitles(company.id) : Promise.resolve(null),
  ]);
  const workbook = buildMonthlyWorkbook(report, compare, {
    companyName: company.name,
    storeTitle: range.storeId ? (storeTitles?.get(range.storeId) ?? null) : null,
  });
  // sendWorkbook bilan bir xil nom — yuklab olingan va Telegram'dagi fayl bir xil atalsin
  return { report, workbook, fileName: `savdoiq-monthly-${report.period.from}_${report.period.to}.xlsx` };
}

router.get(
  '/monthly',
  requireFeature('monthly_reports'),
  ah(async (req, res) => {
    const { company, plan } = companyCtx(req);
    const q = req.query as Record<string, string | undefined>;
    const { report, workbook } = await loadMonthlyWorkbook({
      company,
      plan,
      range: resolveRange(req, plan),
      month: q.month,
    });
    await sendWorkbook(res, workbook, 'monthly', report.period);
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

    // Sahifadagi kabi: hal bo'lmagan yozuvlar davrdan qat'i nazar kiradi
    const where = {
      storeId: { in: storeIds },
      OR: [
        { happenedAt: { gte: range.from, lt: range.toExclusive } },
        { status: { in: ['open', 'claimed'] } },
      ],
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
        toBusinessDate(r.happenedAt),
        dash(info?.sku ?? null),
        info ? info.title : '—',
        LOSS_KIND_LABEL[r.source] ?? LOSS_TYPE_LABEL[r.type] ?? r.type,
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

    // Xaridor qaytarishlari va bekor qilishlari — buyurtma pozitsiyalaridan (sahifa bilan bir xil manba)
    const q = req.query as Record<string, string | undefined>;
    const kind = q.kind === 'canceled' || q.kind === 'all' ? q.kind : 'returned';

    const [allLines, sales] = await Promise.all([
      loadReturnLines(storeIds, range.from, range.toExclusive),
      aggregateSales(storeIds, range.from, range.toExclusive),
    ]);
    const lines = kind === 'all' ? allLines : allLines.filter((l) => l.kind === kind);
    const total = lines.length;

    let soldUnits = 0;
    for (const agg of sales.values()) soldUnits += agg.units;
    const returnedUnits = allLines.filter((l) => l.kind === 'returned').reduce((n, l) => n + l.qty, 0);
    const canceledUnits = allLines.filter((l) => l.kind === 'canceled').reduce((n, l) => n + l.qty, 0);
    const returnRate = pct(returnedUnits, soldUnits + returnedUnits);
    const cancelRate = pct(canceledUnits, soldUnits + canceledUnits);

    const columns: ColumnDef[] = [
      { header: 'Sana', width: 12 },
      { header: 'SKU', width: 16 },
      { header: 'Mahsulot', width: 38 },
      { header: 'Buyurtma kodi', width: 18 },
      { header: 'Miqdor', width: 10, fmt: 'int', sum: true },
      { header: 'Summa', width: 16, fmt: 'money', sum: true },
      { header: 'Sabab', width: 30 },
      { header: 'Turi', width: 16 },
    ];

    const rows: Cell[][] = lines.slice(0, MAX_ROWS).map((l) => [
      toISODate(l.date),
      dash(l.sku),
      l.title ?? '—',
      dash(l.orderCode),
      l.qty,
      round(l.amount),
      dash(l.reason),
      RETURN_STATUS_LABEL[l.kind] ?? l.kind,
    ]);

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
      ['Sotilgan dona (davr bo‘yicha)', soldUnits],
      ['Qaytarilgan dona', returnedUnits],
      ['Qaytarish ulushi, %', returnRate],
      ['Bekor qilingan dona', canceledUnits],
      ['Bekor qilish ulushi, %', cancelRate],
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

    const [catalog, planData, avgDaily, lastSale] = await Promise.all([
      getSkuCatalog(storeIds, true),
      /*
       * "Holat" — Ombor sahifasi (GET /stocks/warehouse) va Qoldiqlar bilan
       * bitta qoida: SKU'ning UMUMIY reja holati (planStockStatus — barcha
       * qoldiq, yo'ldagi tovar, kompaniyaning yetkazish muddati). Ilgari fayl
       * faqat o'z omboridagi donani 7/14 kunlik qat'iy chegara bilan baholab,
       * ustunga inglizcha kalitni ("critical") yozardi (2026-10-27). Qoldiq
       * ham rejadan — u `getLatestStocks` ni o'zi yuklaydi.
       */
      loadPlanData(company.id, storeIds),
      getAvgDaily(storeIds, 30),
      getLastSaleDates(storeIds),
    ]);
    const stocks = planData.stocks;

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
      // Sotuvi yo'q va arxivdagi SKU — sahifadagi kabi eski qoldiq qoidasi, butun qoldiq bilan
      const state = planStockStatus(
        planSku(planData, skuId),
        stockState(st.total, avg, daysSince(lastSale.get(skuId)), daysSince(info.createdAt)),
      );
      data.push([
        info.sku,
        info.title,
        st.own,
        st.reserved,
        st.inTransit,
        round(st.own * info.volumeL, 2),
        round(st.own * (info.purchasePrice + info.extraCost)),
        STOCK_STATUS_LABEL[state.status],
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

// ─────────────────────────── GET /product-profit ───────────────────────────

/** "Muammo" ustuni — sahifadagi bo'limlar (tablar) nomi bilan bir xil */
const PROFIT_FLAG_LABEL: Record<ProductProfitFlag, string> = {
  loss: 'Zararda',
  lowMargin: 'Past marja',
  noCost: 'Tannarxsiz',
  lowBuyout: 'Past xarid',
};

router.get(
  '/product-profit',
  requireFeature('unit_economics'),
  ah(async (req, res) => {
    const { company, plan } = companyCtx(req);
    const range = resolveRange(req, plan);
    const storeIds = await getStoreIds(company.id, range.storeId);

    // Sahifa bilan BITTA hisob (services/product-profit.ts) — fayldagi har bir so'm sahifadagidek
    const data = await buildProductProfit(company, range, storeIds);
    const { totals } = data;
    const list = data.rows.slice(0, MAX_ROWS);
    const perUnitTotal = totals.units > 0 ? round(totals.netProfit / totals.units) : null;

    const columns: ColumnDef[] = [
      { header: 'Mahsulot', width: 40 },
      { header: 'Kategoriya', width: 22 },
      { header: 'SKU soni', width: 9, fmt: 'int', sum: true },
      { header: 'Sotildi (dona)', width: 12, fmt: 'int', sum: true },
      { header: 'Buyurtmalar', width: 12, fmt: 'int', sum: true },
      { header: 'Qaytgan (dona)', width: 13, fmt: 'int', sum: true },
      { header: 'Tushum', width: 16, fmt: 'money', sum: true },
      { header: 'Komissiya', width: 14, fmt: 'money', sum: true },
      { header: 'Yetkazish', width: 14, fmt: 'money', sum: true },
      { header: 'Chiqarishga', width: 16, fmt: 'money', sum: true },
      { header: 'Tannarx', width: 14, fmt: 'money', sum: true },
      { header: 'Qadoq va boshqa', width: 15, fmt: 'money', sum: true },
      { header: 'Soliq', width: 13, fmt: 'money', sum: true },
      { header: 'Reklama', width: 13, fmt: 'money', sum: true },
      { header: 'Sof foyda', width: 16, fmt: 'money', sum: true },
      { header: '1 donadan sof foyda', width: 17, fmt: 'money' },
      { header: 'Marja', width: 9, fmt: 'percent' },
      { header: 'ROI', width: 9, fmt: 'percent' },
      { header: 'Xarid foizi', width: 11, fmt: 'percent' },
      { header: 'Muammo', width: 30 },
    ];

    const rows: Cell[][] = list.map((r) => [
      // Yashirilgan mahsulot ham faylda — puli hisobda (sahifadagi kabi), nomi yonida belgisi bilan
      r.hidden ? `${r.title} (katalogdan yashirilgan)` : r.title,
      dash(r.category),
      r.skuCount,
      r.units,
      r.orders,
      r.returns,
      r.revenue,
      r.commission,
      r.logistics,
      r.payout,
      r.cogs,
      r.otherCost,
      r.tax,
      r.ads,
      r.netProfit,
      r.units > 0 ? r.perUnit.netProfit : null,
      r.margin,
      // Tannarx kiritilmagan bo'lsa ROI'ni hisoblab bo'lmaydi — sahifadagidek bo'sh, 0% emas
      r.cogs + r.otherCost > 0 ? r.roi : null,
      // Yakunlangan dona bo'lmasa bo'sh — "0%" "hech kim olmadi" degani bo'lib qolardi
      r.buyoutRate,
      r.flags.map((f) => PROFIT_FLAG_LABEL[f]).join(', '),
    ]);

    /*
     * Mahsulotlar foydasi yig'indisi do'konnikidan nega farq qiladi — sahifadagi
     * "Do'kon sof foydasi" plitkasi bilan bir xil izoh, faylning o'zida.
     */
    const notes: string[] = [];
    const tooMany = limitNote(data.rows.length);
    if (tooMany) notes.push(tooMany);
    if (data.unallocated > 0 && data.rows.length > 0) {
      const fmt = (v: number) => v.toLocaleString('ru-RU');
      notes.push(
        `Mahsulotga bog‘lab bo‘lmaydigan xarajatlar (omborga logistika, umumiy reklama, saqlash): ${fmt(data.unallocated)} so‘m. ` +
          `Ular ayirilsa do‘kon sof foydasi — ${fmt(totals.netProfit - data.unallocated)} so‘m, Boshqaruv panelidagi bilan bir xil.`,
      );
    }

    const wb = newWorkbook();
    addSheet(wb, {
      name: 'Mahsulot foydasi',
      columns,
      rows,
      totals: totalsRow(columns, rows, {
        // Bitta buyurtmada ikki mahsulot bo'lsa bir marta — sahifadagi jami bilan bir xil
        4: totals.orders,
        15: perUnitTotal,
        16: totals.margin,
        17: totals.cogs + totals.otherCost > 0 ? totals.roi : null,
        18: totals.buyoutRate,
      }),
      note: notes.length ? notes.join(' ') : undefined,
    });

    // 2-varaq — SKU variantlari (sahifada qator ochilganda ko'rinadigani); yig'indisi 1-varaqqa so'mgacha teng
    const variantColumns: ColumnDef[] = [
      { header: 'Mahsulot', width: 38 },
      { header: 'SKU', width: 18 },
      { header: 'Variant', width: 26 },
      { header: 'Sotildi (dona)', width: 12, fmt: 'int', sum: true },
      { header: 'Tushum', width: 16, fmt: 'money', sum: true },
      { header: 'Tannarx', width: 14, fmt: 'money', sum: true },
      { header: 'Sof foyda', width: 16, fmt: 'money', sum: true },
      { header: '1 donadan sof foyda', width: 17, fmt: 'money' },
      { header: 'Marja', width: 9, fmt: 'percent' },
      { header: 'Xarid foizi', width: 11, fmt: 'percent' },
      { header: 'Yakunlangan (dona)', width: 15, fmt: 'int', sum: true },
      { header: 'Yo‘lda (dona)', width: 12, fmt: 'int', sum: true },
    ];
    const variantRows: Cell[][] = list
      .flatMap((r) =>
        r.variants.map((v): Cell[] => [
          r.title,
          v.sku,
          v.variant ?? v.title,
          v.units,
          v.revenue,
          v.cogs,
          v.netProfit,
          v.units > 0 ? v.perUnitProfit : null,
          v.margin,
          v.buyoutRate,
          v.completedUnits,
          v.transitUnits,
        ]),
      )
      .slice(0, MAX_ROWS);

    addSheet(wb, {
      name: 'SKU variantlari',
      columns: variantColumns,
      rows: variantRows,
      totals: totalsRow(variantColumns, variantRows, {
        7: perUnitTotal,
        8: totals.margin,
        9: totals.buyoutRate,
      }),
    });

    await sendWorkbook(res, wb, 'product-profit', range.period);
  }),
);

// ─────────────────────────── GET /planner — sotib olish ro'yxati ───────────────────────────

/** `in` ro'yxati bo'laklari (SQLite o'zgaruvchilar chegarasi) */
const PLANNER_IN_CHUNK = 500;

/**
 * Yetkazib beruvchiga yuboriladigan ro'yxat — Rejalashtiruvchidagi "Sotib
 * oling" miqdori. Hisob va filtrlar sahifa bilan AYNAN bir xil
 * (services/plan.ts): do'kon, holat yorlig'i (?status=), qidiruv; yetkazish
 * muddati va zaxira davri — kompaniya sozlamasi. Faqat sotib olinadigan
 * SKU'lar: o'z ombori/FBS dan FBO'ga jo'natiladigan qism bu yerda emas — u
 * yetkazma qoralamasida (2026-10-24).
 *
 * Narx — SOF sotib olish narxi: yetkazib beruvchi shuni oladi. Sahifadagi
 * "Xarid qiymati" ga qo'shimcha xarajat (qadoq, marker) ham kiradi — farq
 * bo'lsa fayl ostida yoziladi, sotuvchi "summa nega boshqa" deb o'ylamasin.
 */
router.get(
  '/planner',
  requireFeature('planner'),
  ah(async (req, res) => {
    const { company, plan } = companyCtx(req);
    const range = resolveRange(req, plan);
    const q = req.query as Record<string, string | undefined>;
    const storeIds = await getStoreIds(company.id, range.storeId);
    const data = await loadPlanData(company.id, storeIds, { cover: q.cover, lead: q.lead });
    const table = planTable(data, { filter: parseStatusFilter(q.status), search: range.search });
    const buy = table.rows.filter((r) => r.recommendedQty > 0);

    // Shtrix-kod katalog (SkuInfo) tarkibida yo'q — alohida, bo'laklab
    const barcodes = new Map<string, string | null>();
    const ids = buy.map((r) => r.skuId);
    for (let i = 0; i < ids.length; i += PLANNER_IN_CHUNK) {
      const rows = await prisma.sku.findMany({
        where: { id: { in: ids.slice(i, i + PLANNER_IN_CHUNK) } },
        select: { id: true, barcode: true },
      });
      for (const s of rows) barcodes.set(s.id, s.barcode);
    }

    const columns: ColumnDef[] = [
      { header: 'SKU', width: 18 },
      { header: 'Mahsulot', width: 42 },
      { header: 'Variant', width: 22 },
      { header: 'Shtrix-kod', width: 18 },
      { header: 'Sotib olish, dona', width: 15, fmt: 'int', sum: true },
      { header: 'Sotib olish narxi', width: 17, fmt: 'money' },
      { header: 'Jami', width: 18, fmt: 'money', sum: true },
    ];

    let withExtra = 0;
    const rows: Cell[][] = buy.slice(0, MAX_ROWS).map((r) => {
      const info = data.catalog.get(r.skuId);
      const price = round(info?.purchasePrice ?? 0);
      withExtra += r.purchaseCost;
      return [
        r.sku,
        r.title,
        dash(r.variant),
        dash(barcodes.get(r.skuId)),
        r.recommendedQty,
        price,
        round(price * r.recommendedQty),
      ];
    });

    const total = rows.reduce((s, row) => s + (typeof row[6] === 'number' ? row[6] : 0), 0);
    const today = toBusinessDate(new Date());
    const notes = [
      `${today.slice(8, 10)}.${today.slice(5, 7)}.${today.slice(0, 4)} holatiga · yetkazish muddati ${data.leadDays} kun, zaxira davri ${data.coverDays} kun (kompaniya sozlamasi).`,
      round(withExtra) !== round(total)
        ? `Rejalashtiruvchidagi xarid qiymati qo'shimcha xarajat (qadoq, marker) bilan: ${formatNumber(round(withExtra), 'uz')} so'm.`
        : '',
      limitNote(buy.length) ?? '',
    ].filter(Boolean);

    const wb = newWorkbook();
    addSheet(wb, {
      name: 'Sotib olish',
      columns,
      rows,
      totals: totalsRow(columns, rows),
      note: notes.join(' '),
    });

    await sendWorkbook(res, wb, 'sotib-olish', { from: today, to: today });
  }),
);

export default router;
