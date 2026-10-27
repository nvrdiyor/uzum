/**
 * Yetkazib berish rejalashtiruvchisi — /api/v1/planner
 *
 *  GET  /               → PlannerResponse: har bir SKU uchun qoldiq necha kunga yetadi,
 *                         QACHON buyurtma berish kerak, qancha SOTIB OLISH va qanchasini
 *                         o'z ombori/FBS dan FBO'ga JO'NATISH kerak
 *  GET  /preview        → PlannerPreviewResponse: sinov tarifida sotuvchining o'z eng
 *                         shoshilinch SKU'lari (qolgani saytda xiralashgan) — 'preview' da ham ochiq
 *  GET  /settings       → PlannerSettingsResponse: kompaniyaning yetkazish muddati va zaxira davri
 *  PUT  /settings       → saqlash (faqat owner/manager)
 *  POST /shipment-draft → yetkazma qoralamasi: tanlangan SKU'lar (`skuIds`) yoki bir
 *                         bosishda (`scope`: 'needed' | 'urgent') — FAQAT jo'natiladigan miqdor bilan
 *
 * Hisobning o'zi — services/plan.ts: Mahsulotlar, Qoldiqlar, "Bugun nima qilish
 * kerak" va Excel'dagi sotib olish ro'yxati (GET /export/planner) ham o'shandan,
 * shuning uchun "buyurtma kerak" soni hamma joyda bir xil.
 *
 * Yetkazish muddati va zaxira davri KOMPANIYA sozlamasidan olinadi; so'rovdagi
 * ?lead= / ?cover= faqat aniq berilganda ustun turadi (eski mijozlar va testlar uchun).
 */
import { Router } from 'express';
import type { RequestHandler } from 'express';
import { z } from 'zod';
import { prisma } from '@savdoiq/db';
import {
  addDays,
  featureAccess,
  formatNumber,
  parseISODate,
  round,
  toISODate,
  type PlannerDraftResponse,
  type PlannerPreviewResponse,
  type PlannerResponse,
  type PlannerRow,
  type PlannerSettingsResponse,
  type ShipmentItemRow,
} from '@savdoiq/shared';
import { AppError, ah } from '../lib/errors.js';
import { companyCtx, requireAuth, requireCompany, requireFeature, requireRole } from '../lib/auth.js';
import { resolveRange } from '../lib/period.js';
import { getStoreIds } from '../services/common.js';
import { DEMAND_WINDOW_DAYS } from '../services/demand.js';
import {
  COVER_MAX,
  COVER_MIN,
  DEFAULT_PLANNER_SETTINGS,
  LEAD_MAX,
  LEAD_MIN,
  SAFETY_DAYS,
  getPlannerSettings,
  inDraftScope,
  loadPlanData,
  parseStatusFilter,
  planSku,
  planTable,
  savePlannerSettings,
  type PlannerSettingsState,
} from '../services/plan.js';

/*
 * Rejaning o'zi services/plan.ts ga ko'chdi (2026-10-24). Bu yerdan ham
 * eksport qilinadi — eski importlar (`./planner.js`) buzilmasin.
 */
export {
  DEFAULT_COVER,
  DEFAULT_LEAD,
  EMPTY_STOCK,
  NO_DEMAND,
  buildRow,
  getInbound,
  type PlanInput,
} from '../services/plan.js';

const router = Router();
router.use(requireAuth, requireCompany);

/** Javobdagi qatorlar chegarasi — jadval cheksiz o'smasligi uchun */
const MAX_ROWS = 1000;
/** Sinov tarifidagi namunada ochiq ko'rinadigan SKU'lar */
const PREVIEW_ROWS = 3;
/** Standart quti hajmi (litr) va qutidagi dona — yetkazma qoralamasi uchun */
const BOX_VOLUME_L = 60;
const BOX_UNITS = 20;
/** Shipment.note — yetkazma tahririda 500 belgidan oshmasligi kerak (warehouse.ts PATCH sxemasi) */
const NOTE_MAX = 500;

/**
 * 'preview' tarifda ham ochiq marshrutlar (namuna va sozlama). Faqat 'off'
 * (masalan, muddati tugagan obuna) yopiladi. Asosiy jadval va qoralama esa
 * `requireFeature('planner')` — to'liq tarif.
 */
const requirePlannerVisible: RequestHandler = (req, _res, next) => {
  const plan = req.ctx?.plan ?? 'trial';
  const access = featureAccess(plan, 'planner');
  if (access !== 'off') return next();
  return next(AppError.limit('Bu bo‘lim pullik tarifda mavjud', { feature: 'planner', plan, access }));
};

// ─────────────────────────── GET / — reja ───────────────────────────

router.get(
  '/',
  requireFeature('planner'),
  ah(async (req, res) => {
    const { company, plan } = companyCtx(req);
    const range = resolveRange(req, plan);
    const q = req.query as Record<string, string | undefined>;

    const storeIds = await getStoreIds(company.id, range.storeId);
    const data = await loadPlanData(company.id, storeIds, { cover: q.cover, lead: q.lead });
    const table = planTable(data, { filter: parseStatusFilter(q.status), search: range.search });

    const payload: PlannerResponse = {
      coverDays: data.coverDays,
      leadDays: data.leadDays,
      windowDays: DEMAND_WINDOW_DAYS,
      safetyDays: SAFETY_DAYS,
      counts: table.counts,
      totals: table.totals,
      rows: table.rows.slice(0, MAX_ROWS),
    };

    res.json(payload);
  }),
);

// ─────────────────────────── GET /preview — sinov tarifidagi namuna ───────────────────────────

/**
 * Ilgari sinov tarifida sahifa o'rnida qulf oynali oq kartochka turardi:
 * jadval so'rovi 402 qaytarardi va xiralashgan xato kartochkasi ko'rinardi.
 * Endi sotuvchi O'Z eng shoshilinch SKU'larini haqiqiy raqamlar bilan ko'radi
 * (qolgan reja saytda xiralashgan) — nima yo'qotayotgani aniq ko'rinadi.
 */
router.get(
  '/preview',
  requirePlannerVisible,
  ah(async (req, res) => {
    const { company, plan } = companyCtx(req);
    const range = resolveRange(req, plan);
    const storeIds = await getStoreIds(company.id, range.storeId);
    const data = await loadPlanData(company.id, storeIds);
    const table = planTable(data);

    // Avval kritik va "buyurtma vaqti"; ular bo'lmasa — miqdor tavsiya etilgan yetarlilar
    const urgent = table.all.filter((r) => r.status === 'critical' || r.status === 'ending');
    const pool = urgent.length > 0 ? urgent : table.all.filter((r) => r.recommendedQty > 0 || r.shipQty > 0);
    const rows = pool.slice(0, PREVIEW_ROWS);
    const selling = table.all.filter((r) => r.status !== 'no_action').length;

    const payload: PlannerPreviewResponse = {
      leadDays: data.leadDays,
      coverDays: data.coverDays,
      counts: table.counts,
      totals: table.totals,
      rows,
      more: Math.max(0, selling - rows.length),
    };
    res.json(payload);
  }),
);

// ─────────────────────────── GET/PUT /settings — kompaniya sozlamasi ───────────────────────────

function settingsPayload(s: PlannerSettingsState): PlannerSettingsResponse {
  return {
    leadDays: s.leadDays,
    coverDays: s.coverDays,
    defaults: DEFAULT_PLANNER_SETTINGS,
    limits: { leadMin: LEAD_MIN, leadMax: LEAD_MAX, coverMin: COVER_MIN, coverMax: COVER_MAX },
    saved: s.saved,
    updatedAt: s.updatedAt ? s.updatedAt.toISOString() : null,
  };
}

router.get(
  '/settings',
  requirePlannerVisible,
  ah(async (req, res) => {
    const { company } = companyCtx(req);
    res.json(settingsPayload(await getPlannerSettings(company.id)));
  }),
);

const settingsSchema = z
  .object({
    leadDays: z.number().int().min(LEAD_MIN).max(LEAD_MAX).optional(),
    coverDays: z.number().int().min(COVER_MIN).max(COVER_MAX).optional(),
  })
  // Noma'lum kalit (masalan 'lead') jimgina tashlab yuborilmasin — saqlandi deb o'ylanardi
  .strict()
  .refine((v) => v.leadDays !== undefined || v.coverDays !== undefined, {
    message: 'leadDays yoki coverDays yuboring',
  });

/**
 * Saqlash — butun kompaniya uchun: Rejalashtiruvchi, "Bugun nima qilish
 * kerak", Mahsulotlar va Qoldiqlar darhol yangi muddat bilan hisoblaydi.
 * Shuning uchun faqat owner/manager (kuzatuvchi faqat ko'radi).
 */
router.put(
  '/settings',
  requirePlannerVisible,
  requireRole('owner', 'manager'),
  ah(async (req, res) => {
    const { company } = companyCtx(req);
    const body = settingsSchema.parse(req.body ?? {});
    res.json(settingsPayload(await savePlannerSettings(company.id, body)));
  }),
);

// ─────────────────────────── POST /shipment-draft — yetkazma qoralamasi ───────────────────────────

const shipmentDraftSchema = z
  .object({
    /** Qo'lda tanlangan SKU'lar — berilsa `scope` e'tiborga olinmaydi */
    skuIds: z.array(z.string().min(1)).min(1).max(500).optional(),
    /** Bir bosishda: 'needed' — jo'natiladigan hamma SKU, 'urgent' — buyurtma kuni yetganlari */
    scope: z.enum(['needed', 'urgent']).optional(),
    /** Sahifadagi do'kon filtri (scope bilan) */
    storeId: z.string().trim().min(1).optional(),
    cover: z.coerce.number().optional(),
    lead: z.coerce.number().optional(),
    destination: z.string().trim().max(120).optional(),
    plannedAt: z.string().optional(),
    note: z.string().trim().max(NOTE_MAX).optional(),
  })
  .refine((v) => Boolean(v.scope) || (v.skuIds?.length ?? 0) > 0, {
    message: 'SKU tanlang yoki scope yuboring',
    path: ['skuIds'],
  });

/** Qutilar soni: avval hajm bo'yicha, hajm noma'lum bo'lsa — dona bo'yicha */
function boxCount(qty: number, volumeL: number): number {
  if (qty <= 0) return 0;
  if (volumeL > 0) return Math.max(1, Math.ceil((qty * volumeL) / BOX_VOLUME_L));
  return Math.max(1, Math.ceil(qty / BOX_UNITS));
}

/** Kompaniya ichida ketma-ket kod: SP-2026-001 */
async function nextCode(companyId: string): Promise<string> {
  const count = await prisma.shipment.count({ where: { companyId } });
  return `SP-${new Date().getUTCFullYear()}-${String(count + 1).padStart(3, '0')}`;
}

const num = (v: number): string => formatNumber(v, 'uz');

/**
 * Qoralamaga FAQAT jo'natiladigan miqdor (o'z ombori + FBS dan FBO'ga) tushadi.
 *
 * Ilgari qoralamaga SOTIB OLISH miqdori yozilardi, yetkazma qabul qilinganda
 * esa warehouse.ts uni o'z omboridan FBO'ga ko'chirilgandek yozadi (own −,
 * FBO +). Natijada omborda yo'q tovar "jo'natilardi", omborda turgani esa
 * qoralamada umuman ko'rinmasdi; qoldig'i yetarli SKU 0 dona qator bo'lib
 * tushardi. Sotib olinadigan qism yetkazma emas — u yetkazib beruvchiga
 * buyurtma: javobda (`buySkus`, `buyUnits`) va izohda aytiladi, ro'yxati —
 * GET /export/planner (2026-10-24).
 */
router.post(
  '/shipment-draft',
  requireFeature('planner'),
  requireRole('owner', 'manager'),
  ah(async (req, res) => {
    const { company } = companyCtx(req);
    const input = shipmentDraftSchema.parse(req.body ?? {});

    const storeIds = await getStoreIds(company.id, input.storeId);
    if (input.storeId && storeIds.length === 0) throw AppError.badRequest('Do‘kon topilmadi');
    const data = await loadPlanData(company.id, storeIds, { cover: input.cover, lead: input.lead });

    /** Ko'rib chiqilgan SKU'lar: qo'lda tanlanganlar yoki scope bo'yicha butun katalog */
    const manual = Boolean(input.skuIds && input.skuIds.length > 0);
    let considered: PlannerRow[];
    if (input.skuIds && manual) {
      considered = [...new Set(input.skuIds)]
        .map((id) => planSku(data, id))
        .filter((r): r is PlannerRow => r !== null);
      if (considered.length === 0) throw AppError.badRequest('Yuborilgan SKU’lar bu kompaniyada topilmadi');
    } else {
      const urgentOnly = input.scope === 'urgent';
      considered = planTable(data).all.filter(
        (r) => !urgentOnly || (r.orderInDays !== null && r.orderInDays <= 0),
      );
    }

    // 0 dona qator qoralamaga hech qachon yozilmaydi
    const ship = considered.filter((r) => inDraftScope(r, 'needed'));
    const buy = considered.filter((r) => r.recommendedQty > 0);
    const buyUnits = buy.reduce((s, r) => s + r.recommendedQty, 0);
    // Qoralamaga kirmaganlar: qo'lda tanlanganlardan jo'natiladigani yo'qlari, scope'da — faqat sotib olinadiganlar
    const skipped = considered.filter((r) => r.shipQty <= 0 && (manual || r.recommendedQty > 0)).length;

    if (ship.length === 0) {
      throw AppError.badRequest(
        buy.length > 0
          ? 'O‘z omboringiz va FBS’da FBO’ga jo‘natiladigan tovar yo‘q — bu SKU’larni avval sotib olish kerak (ro‘yxat: “Sotib olish ro‘yxati” Excel)'
          : 'Jo‘natish kerak bo‘lgan SKU yo‘q — qoldiq yetarli',
        { skipped, buySkus: buy.length, buyUnits },
      );
    }

    const drafts = ship.map((row) => {
      const info = data.catalog.get(row.skuId);
      return { row, info, qty: row.shipQty, boxes: boxCount(row.shipQty, info?.volumeL ?? 0) };
    });

    // Yetkazma bitta do'konga tegishli bo'lsa — o'sha do'kon, aralash bo'lsa — bog'lanmaydi
    const uniqueStores = [...new Set(drafts.map((d) => d.info?.storeId).filter((s): s is string => Boolean(s)))];
    const storeId = uniqueStores.length === 1 ? uniqueStores[0] : null;

    const plannedAt = input.plannedAt ? parseISODate(input.plannedAt) : addDays(data.today, data.leadDays);
    if (Number.isNaN(plannedAt.getTime())) throw AppError.badRequest('Sana noto‘g‘ri formatda (YYYY-MM-DD)');

    const shipUnits = drafts.reduce((s, d) => s + d.qty, 0);
    const autoNote = [
      `Rejalashtiruvchidan: ${data.coverDays} kunlik zaxira, yetkazish ${data.leadDays} kun.`,
      `O‘z ombori/FBS → FBO: ${num(shipUnits)} dona.`,
      buyUnits > 0
        ? `Sotib olish kerak (yetkazmaga kirmagan): ${num(buy.length)} SKU, ${num(buyUnits)} dona — ro‘yxat Rejalashtiruvchida (Excel).`
        : '',
    ]
      .filter(Boolean)
      .join(' ')
      .slice(0, NOTE_MAX);

    const created = await prisma.shipment.create({
      data: {
        companyId: company.id,
        storeId,
        code: await nextCode(company.id),
        destination: input.destination ?? null,
        status: 'draft',
        plannedAt,
        note: input.note ?? autoNote,
        items: {
          create: drafts.map((d) => ({ skuId: d.row.skuId, qty: d.qty, accepted: 0, boxes: d.boxes })),
        },
      },
      include: { items: true },
    });

    const bySku = new Map(drafts.map((d) => [d.row.skuId, d]));
    const items: ShipmentItemRow[] = created.items.map((it) => {
      const d = bySku.get(it.skuId);
      return {
        id: it.id,
        skuId: it.skuId,
        sku: d?.row.sku ?? '—',
        title: d?.info?.title ?? d?.row.title ?? 'Noma’lum SKU',
        qty: it.qty,
        accepted: it.accepted,
        boxes: it.boxes,
      } satisfies ShipmentItemRow;
    });

    const costValue = drafts.reduce(
      (s, d) => s + d.qty * ((d.info?.purchasePrice ?? 0) + (d.info?.extraCost ?? 0)),
      0,
    );

    const payload: PlannerDraftResponse = {
      id: created.id,
      code: created.code,
      destination: created.destination,
      status: 'draft',
      plannedAt: created.plannedAt ? toISODate(created.plannedAt) : null,
      acceptedAt: null,
      source: 'manual',
      itemsCount: items.length,
      unitsCount: items.reduce((s, i) => s + i.qty, 0),
      costValue: round(costValue),
      note: created.note,
      items,
      skipped,
      buySkus: buy.length,
      buyUnits,
    };

    res.status(201).json(payload);
  }),
);

export default router;
