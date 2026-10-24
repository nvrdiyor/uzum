/**
 * "Bugun nima qilish kerak" — /api/v1/dashboard/today
 *
 *  GET   /      → TodayResponse: bugungi vazifalar, xavf ostidagi pul bo'yicha saralangan
 *  PATCH /:key  → { action: 'done' | 'snooze' | 'reset', keys? } — vazifani yashirish yoki qaytarish
 *
 * NEGA ALOHIDA RO'YXAT. Har bir signal o'z sahifasida bor edi (da'vo
 * yuborilmagan yo'qotish — /losses, javobsiz sharh — /reviews, tannarxsiz
 * sotuv — /cost-price, tugayotgan qoldiq — /planner...), lekin sotuvchi
 * ularni bitta joyda va "qaysi biri ko'proq pul" tartibida ko'rmasdi.
 * Davr xulosalari (analytics.ts buildInsights) esa tanlangan davrga bog'liq
 * va "nima bo'ldi"ni aytadi, "bugun nima qilish kerak"ni emas. Shuning
 * uchun bu ro'yxat davr tanlagichiga BOG'LIQ EMAS: "bugun" — har doim joriy
 * Toshkent savdo kuni (toBusinessDate). Do'kon filtri (?storeId) esa
 * boshqa panel bloklari kabi hisobga olinadi.
 *
 * QOIDALAR — hammasi o'z bazamizdan, Uzum'ga birorta so'rov yo'q:
 *  1. loss    — holati 'open' (da'vo yuborilmagan) yo'qotish; summa = amount − compensated.
 *  2. review  — javobsiz, ≤ 3★, oxirgi 30 kundagi sharh; summa yo'q (null) —
 *               sharhning puldagi narxini halol aytib bo'lmaydi, uydirmaymiz.
 *  3. cost    — oxirgi 30 kunda sotilgan, tannarxi 0 bo'lgan SKU; summa = shu
 *               sotuvlar tushumi (foyda aynan shu tushumda tannarxsiz hisoblangan).
 *  4. fbs     — FAQAT 'new' (Uzum: CREATED) holatidagi FBS/DBS buyurtma. 'processing'
 *               ATAYLAB olinmaydi: live.ts mapOrderStatus unga PACKING bilan birga
 *               PENDING_DELIVERY va DELIVERING ni ham qo'shadi — ya'ni kuryerga
 *               allaqachon berilgan buyurtmalar "yig'ing" deb chiqib qolardi.
 *  5. stock   — rejalashtiruvchining O'ZI (planner.ts buildRow, yetkazish 7 kun):
 *               bugun buyurtma berilsa ham tovar kelguncha tugaydigan SKU;
 *               summa = o'sha formuladagi yo'qotiladigan tushum — /planner bilan bir xil raqam.
 *  6. storage — pullik saqlash: oxirgi 7 to'liq kun oldingi 7 kundan ≥ 20% va
 *               kamida 50 000 so'mga ko'p. Uzum saqlashni moliya xarajatlaridan
 *               bo'lak-bo'lak yozadi — mutlaq chegara shovqinni to'sadi.
 *
 * Bir turdagi bir nechta obyekt BITTA qatorga yig'iladi ("3 ta yo'qotish
 * bo'yicha da'vo yuborilmagan"): ish ham bitta — da'vo matni hammasini qamraydi,
 * tannarx bitta sahifada kiritiladi. Aks holda 40 ta tannarxsiz SKU bo'lgan
 * yangi sotuvchida ro'yxat faqat shulardan iborat bo'lib, da'vo va qoldiq
 * ko'rinmay qolardi.
 *
 * HOLAT. "Bajarildi" / "Keyinroq" CompanySetting 'todo_state' da OBYEKT
 * kalitlari bilan saqlanadi: { "loss:<id>": { doneAt }, "cost:<skuId>": { snoozeUntil } }.
 * Kun bo'yicha kalit ('todo:<sana>') ATAYLAB emas — u yarim tunda hamma
 * "keyinroq"ni yo'qotardi. "Keyinroq" — keyingi Toshkent kunining boshigacha
 * ("ertaga yana ko'rsatamiz"): ro'yxat kunlik, uch kunlik yashirish esa
 * muhim ishni unutishga olib kelardi. Obyekt tuzalgach (da'vo yuborildi,
 * javob yozildi, tannarx kiritildi, qoldiq to'ldi) u ro'yxatdan o'zi tushadi,
 * holat yozuvi esa keyingi to'liq (do'kon filtrisiz) so'rovda tozalanadi.
 */
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '@savdoiq/db';
import {
  addDays,
  businessDayStart,
  featureAccess,
  formatCompact,
  formatDateShort,
  formatNumber,
  parseISODate,
  round,
  toBusinessDate,
  toISODate,
  type FeatureId,
  type TodayActionResponse,
  type TodayCheck,
  type TodayResponse,
  type TodayTask,
  type TodayTaskKind,
  type TodayTaskLevel,
} from '@savdoiq/shared';
import { AppError, ah } from '../lib/errors.js';
import { companyCtx, requireAuth, requireCompany, requireFeature, requireRole } from '../lib/auth.js';
import { getLatestStocks, getSkuCatalog, getStoreIds } from '../services/common.js';
import { getDemand } from '../services/demand.js';
import { DEFAULT_COVER, DEFAULT_LEAD, EMPTY_STOCK, NO_DEMAND, buildRow, getInbound } from './planner.js';

const router = Router();
router.use(requireAuth, requireCompany);

// ─────────────────────────── Chegaralar ───────────────────────────

/** Sharh shu kundan eski bo'lsa javob berish kechikkan — ro'yxatni to'ldirmaydi */
const REVIEW_WINDOW_DAYS = 30;
/** Salbiy sharh chegarasi — reviews.ts NEGATIVE_MAX_RATING bilan bir xil */
const NEGATIVE_MAX_RATING = 3;
/** Tannarxsiz sotuv qidiriladigan oyna */
const COST_WINDOW_DAYS = 30;
/**
 * 'new' FBS buyurtma shundan eski bo'lsa — ma'lumot eskirgan: sinxron eski
 * buyurtmani qayta o'qimaydi va u abadiy "yig'ing" bo'lib qolardi.
 */
const FBS_WINDOW_DAYS = 7;
/** Shuncha soatdan beri yig'ilmagan buyurtma — kechikmoqda (qizil) */
const FBS_LATE_HOURS = 24;
/** Saqlash o'sishi: nisbiy va mutlaq chegara (ikkalasi ham bajarilishi kerak) */
const STORAGE_GROWTH_MIN = 0.2;
const STORAGE_MIN_INCREASE = 50_000;
/** Javobdagi qatorlar chegarasi (qatorlar tur bo'yicha yig'ilgani uchun amalda ≤ 6) */
const MAX_ITEMS = 20;

const STATE_KEY = 'todo_state';
/** Holat JSON'i cheksiz o'smasin: eng yangi shuncha yozuv qoladi */
const MAX_STATE_ENTRIES = 1000;

/** Tartib — "Hammasi nazoratda" ro'yxatida ham shu */
const KIND_ORDER: TodayTaskKind[] = ['loss', 'fbs', 'stock', 'cost', 'review', 'storage'];

/** Har vazifa o'z sahifasining tarifi bilan: 'preview' / 'off' bo'lsa qator qulf bilan chiqadi */
const KIND_FEATURE: Record<TodayTaskKind, FeatureId> = {
  loss: 'losses_report',
  review: 'reviews_autoreply',
  cost: 'cost_price',
  fbs: 'sales_analytics',
  stock: 'planner',
  storage: 'paid_storage',
};

const KIND_LINK: Record<TodayTaskKind, string> = {
  loss: '/losses',
  review: '/reviews',
  cost: '/cost-price',
  fbs: '/sales',
  stock: '/planner',
  storage: '/storage',
};

const KIND_CTA: Record<TodayTaskKind, string> = {
  loss: 'Da’vo yuborish',
  review: 'Javob berish',
  cost: 'Tannarx kiritish',
  fbs: 'Buyurtmalar',
  stock: 'Rejalashtirish',
  storage: 'Saqlashni ko‘rish',
};

const CLEARED_LABEL: Record<TodayTaskKind, string> = {
  loss: 'Da’vo kutayotgan yo‘qotish yo‘q',
  review: 'Javobsiz salbiy sharh yo‘q',
  cost: 'Sotilgan tovarlarda tannarx bor',
  fbs: 'Yig‘ilmagan FBS buyurtma yo‘q',
  stock: 'Kelguncha tugaydigan qoldiq yo‘q',
  storage: 'Pullik saqlash o‘smagan',
};

const LEVEL_RANK: Record<TodayTaskLevel, number> = { danger: 0, warn: 1, info: 2 };

/** Obyekt kaliti: "<tur>:<id>" (id — cuid, demo id yoki "2026-W43") */
const ENTITY_KEY_RE = /^(loss|review|cost|fbs|stock|storage):[\w.-]{1,120}$/;
/** Qator kaliti: obyekt kaliti yoki guruh — "<tur>:*" */
const ROW_KEY_RE = /^(loss|review|cost|fbs|stock|storage):(\*|[\w.-]{1,120})$/;

// ─────────────────────────── Yordamchilar ───────────────────────────

const money = (v: number): string => `${formatCompact(Math.round(v), 'uz')} so‘m`;
const num = (v: number): string => formatNumber(v, 'uz');
const shortDate = (iso: string): string => formatDateShort(parseISODate(iso), 'uz');

/** Buyurtma yoshi matnda: 2 kungacha soatda, keyin kunda */
function ageText(hours: number): string {
  if (hours < 48) return `${num(Math.max(1, hours))} soat`;
  return `${num(Math.floor(hours / 24))} kun`;
}

/** ISO hafta kaliti: "2026-W43" — saqlash vazifasi har hafta yangi kalit oladi */
export function isoWeekKey(iso: string): string {
  const d = parseISODate(iso);
  const weekday = d.getUTCDay() || 7;
  // Haftaning payshanbasi qaysi yilda bo'lsa — hafta o'sha yilniki (ISO 8601)
  const thursday = addDays(d, 4 - weekday);
  const yearStart = Date.UTC(thursday.getUTCFullYear(), 0, 1);
  const week = Math.ceil(((thursday.getTime() - yearStart) / 86_400_000 + 1) / 7);
  return `${thursday.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

/** Sharh matnidan bir qatorli parcha */
function snippet(text: string | null, max = 90): string {
  const clean = (text ?? '').replace(/\s+/g, ' ').trim();
  return clean.length > max ? `${clean.slice(0, max - 1).trimEnd()}…` : clean;
}

// ─────────────────────────── Holat (CompanySetting 'todo_state') ───────────────────────────

interface TodoEntry {
  doneAt?: string;
  snoozeUntil?: string;
}
type TodoState = Record<string, TodoEntry>;

/** Buzilgan yoki eski shakldagi JSON butun ro'yxatni yiqitmasin — noto'g'ri yozuvlar tashlab yuboriladi */
function parseState(raw: string | null | undefined): TodoState {
  if (!raw) return {};
  try {
    const obj = JSON.parse(raw) as unknown;
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return {};
    const out: TodoState = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      if (!ENTITY_KEY_RE.test(key) || !value || typeof value !== 'object') continue;
      const v = value as Record<string, unknown>;
      const entry: TodoEntry = {};
      if (typeof v.doneAt === 'string') entry.doneAt = v.doneAt;
      if (typeof v.snoozeUntil === 'string') entry.snoozeUntil = v.snoozeUntil;
      if (entry.doneAt || entry.snoozeUntil) out[key] = entry;
    }
    return out;
  } catch {
    return {};
  }
}

const stamp = (e: TodoEntry): number => Date.parse(e.doneAt ?? e.snoozeUntil ?? '') || 0;

/** Muddati o'tgan "keyinroq" va ortiqcha yozuvlarni tashlaydi */
function compactState(state: TodoState, now: Date): TodoState {
  const live = Object.entries(state).filter(
    ([, e]) => Boolean(e.doneAt) || (e.snoozeUntil !== undefined && Date.parse(e.snoozeUntil) > now.getTime()),
  );
  if (live.length > MAX_STATE_ENTRIES) {
    live.sort((a, b) => stamp(b[1]) - stamp(a[1]));
    live.length = MAX_STATE_ENTRIES;
  }
  return Object.fromEntries(live);
}

function isHidden(e: TodoEntry | undefined, now: Date): boolean {
  if (!e) return false;
  if (e.doneAt) return true;
  return e.snoozeUntil !== undefined && Date.parse(e.snoozeUntil) > now.getTime();
}

async function readState(companyId: string): Promise<{ raw: string | null; state: TodoState }> {
  const row = await prisma.companySetting.findUnique({
    where: { companyId_key: { companyId, key: STATE_KEY } },
    select: { value: true },
  });
  return { raw: row?.value ?? null, state: parseState(row?.value) };
}

const isUniqueViolation = (err: unknown): boolean => (err as { code?: string } | null)?.code === 'P2002';

/**
 * O'qish → o'zgartirish → yozish, "taqqoslab almashtirish" bilan: yozuv faqat
 * o'qilgan qiymat o'zgarmagan bo'lsa yangilanadi. Ikki kishi bir vaqtda
 * "Bajarildi" bossa, biri ikkinchisining belgisini o'chirib yubormasin.
 * Xom SQL va tranzaksiya yo'q — SQLite va PostgreSQL'da bir xil ishlaydi.
 */
async function mutateState(companyId: string, now: Date, fn: (s: TodoState) => void): Promise<void> {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    // To'qnashuvdan keyin biroz kutiladi — bir vaqtda kelgan so'rovlar navbatma-navbat o'tsin
    if (attempt > 1) await new Promise((r) => setTimeout(r, 5 + Math.random() * 25));
    const { raw, state } = await readState(companyId);
    if (raw === null) {
      /*
       * Yozuv hali yo'q: avval bo'sh holat yaratiladi, qiymat esa keyingi
       * aylanishda odatdagi taqqoslab almashtirish bilan yoziladi. `create`
       * bilan ikki parallel birinchi bosish biri ikkinchisini yo'qotardi yoki
       * har safar unique xatosini logga yozardi; `upsert` ikkalasidan ham xoli.
       */
      try {
        await prisma.companySetting.upsert({
          where: { companyId_key: { companyId, key: STATE_KEY } },
          create: { companyId, key: STATE_KEY, value: '{}' },
          update: {},
        });
      } catch (err) {
        if (!isUniqueViolation(err)) throw err;
      }
      continue;
    }
    fn(state);
    const value = JSON.stringify(compactState(state, now));
    if (value === raw) return;
    const r = await prisma.companySetting.updateMany({
      where: { companyId, key: STATE_KEY, value: raw },
      data: { value },
    });
    if (r.count === 1) return;
  }
  throw AppError.conflict('Vazifa holati bir vaqtda o‘zgartirildi — qaytadan urinib ko‘ring');
}

// ─────────────────────────── Qoidalar ───────────────────────────

/** Bitta obyekt (yo'qotish, sharh, SKU, buyurtma) — keyin turi bo'yicha qatorga yig'iladi */
interface Entity {
  key: string;
  amount: number | null;
  level: TodayTaskLevel;
  params: Record<string, string | number>;
  /** Faqat bitta obyektli qator uchun aniqroq havola (masalan, buyurtma oynasi) */
  link?: string;
}

interface RuleCtx {
  companyId: string;
  storeIds: string[];
  now: Date;
  /** Toshkent savdo kuni, YYYY-MM-DD */
  today: string;
  /** Shu kunning boshlanish payti (UTC) */
  todayStart: Date;
}

async function lossEntities(c: RuleCtx): Promise<Entity[]> {
  // /losses dagi "da'vo yuborilmagan" jamlanmasi bilan bir xil shart (openLossSummary: status 'open')
  const rows = await prisma.lossRecord.findMany({
    where: { storeId: { in: c.storeIds }, status: 'open' },
    select: {
      id: true,
      qty: true,
      amount: true,
      compensated: true,
      happenedAt: true,
      sku: { select: { sku: true, title: true } },
    },
  });
  const out: Entity[] = [];
  for (const r of rows) {
    const due = round(r.amount - r.compensated);
    if (due <= 0) continue;
    out.push({
      key: `loss:${r.id}`,
      amount: due,
      level: 'danger',
      params: { sku: r.sku?.sku ?? '—', name: r.sku?.title ?? '', qty: r.qty, date: toBusinessDate(r.happenedAt) },
    });
  }
  return out;
}

async function reviewEntities(c: RuleCtx): Promise<Entity[]> {
  const rows = await prisma.review.findMany({
    where: {
      storeId: { in: c.storeIds },
      answered: false,
      rating: { lte: NEGATIVE_MAX_RATING },
      publishedAt: { gte: addDays(c.todayStart, -(REVIEW_WINDOW_DAYS - 1)) },
    },
    select: {
      id: true,
      rating: true,
      text: true,
      publishedAt: true,
      sku: { select: { title: true } },
      product: { select: { title: true } },
    },
    orderBy: { publishedAt: 'desc' },
    take: 200,
  });
  return rows.map((r) => ({
    key: `review:${r.id}`,
    amount: null,
    // Qizil faqat pul yo'qotilayotganda — sharh ogohlantirish (1–2★) yoki ma'lumot (3★)
    level: r.rating <= 2 ? 'warn' : 'info',
    params: {
      rating: r.rating,
      name: r.product?.title ?? r.sku?.title ?? '',
      text: snippet(r.text),
      date: toBusinessDate(r.publishedAt),
    },
  }));
}

async function costEntities(c: RuleCtx): Promise<Entity[]> {
  /*
   * Shart "Tannarx: N% sotuvda" chipi (analytics.ts /cost-coverage) bilan bir
   * xil: pozitsiyadagi tannarx 0, bekor qilingan va qaytgan pozitsiyalar kirmaydi.
   * Tannarx saqlanganda pozitsiyalar darhol qayta hisoblanadi (item-cost.ts),
   * shuning uchun kiritilgach SKU shu zahoti ro'yxatdan tushadi.
   */
  const groups = await prisma.orderItem.groupBy({
    by: ['skuId'],
    where: {
      order: { storeId: { in: c.storeIds }, orderedAt: { gte: addDays(c.todayStart, -(COST_WINDOW_DAYS - 1)) } },
      skuId: { not: null },
      purchasePrice: { lte: 0 },
      status: { notIn: ['canceled', 'returned'] },
      returnedAt: null,
    },
    _sum: { qty: true, revenue: true },
  });
  const sold = groups.filter((g) => g.skuId && (g._sum.qty ?? 0) > 0 && (g._sum.revenue ?? 0) > 0);
  if (sold.length === 0) return [];

  // SKU'ning o'zida ham tannarx yo'qligi tekshiriladi; sotuvchi o'chirgan (yashirilgan arxiv) tovar so'ralmaydi
  const skus = await prisma.sku.findMany({
    where: {
      id: { in: sold.map((g) => g.skuId as string) },
      storeId: { in: c.storeIds },
      purchasePrice: { lte: 0 },
      NOT: { archived: true, product: { hidden: true } },
    },
    select: { id: true, sku: true, title: true },
  });
  const byId = new Map(skus.map((s) => [s.id, s]));

  const out: Entity[] = [];
  for (const g of sold) {
    const info = byId.get(g.skuId as string);
    if (!info) continue;
    out.push({
      key: `cost:${info.id}`,
      amount: round(g._sum.revenue ?? 0),
      level: 'warn',
      params: { sku: info.sku, name: info.title, units: g._sum.qty ?? 0 },
    });
  }
  return out;
}

async function fbsEntities(c: RuleCtx): Promise<Entity[]> {
  const orders = await prisma.order.findMany({
    where: {
      storeId: { in: c.storeIds },
      // FAQAT 'new' — yuqoridagi izohga qarang ('processing' kuryerdagilarni ham o'z ichiga oladi)
      status: 'new',
      // DBS ham sotuvchining o'zi yig'adigan sxema
      deliveryType: { in: ['FBS', 'DBS'] },
      orderedAt: { gte: addDays(c.now, -FBS_WINDOW_DAYS) },
    },
    select: {
      id: true,
      uzumOrderId: true,
      deliveryType: true,
      orderedAt: true,
      totalAmount: true,
      items: { select: { qty: true, revenue: true, status: true } },
    },
    orderBy: { orderedAt: 'asc' },
    take: 500,
  });
  const out: Entity[] = [];
  for (const o of orders) {
    const live = o.items.filter((it) => it.status !== 'canceled' && it.status !== 'returned');
    const amount = round(o.totalAmount > 0 ? o.totalAmount : live.reduce((s, it) => s + it.revenue, 0));
    const hours = Math.max(0, Math.floor((c.now.getTime() - o.orderedAt.getTime()) / 3_600_000));
    out.push({
      key: `fbs:${o.id}`,
      amount: amount > 0 ? amount : null,
      level: hours >= FBS_LATE_HOURS ? 'danger' : 'warn',
      params: {
        order: o.uzumOrderId ?? o.id,
        scheme: o.deliveryType,
        hours,
        units: live.reduce((s, it) => s + it.qty, 0),
      },
      // Sotuvlar sahifasi `?order=` bilan buyurtma oynasini o'zi ochadi
      link: `/sales?order=${encodeURIComponent(o.id)}`,
    });
  }
  return out;
}

async function stockEntities(c: RuleCtx): Promise<Entity[]> {
  /*
   * Rejalashtiruvchining o'z hisobi (planner.ts buildRow) — tezlik tovar
   * sotuvda bo'lgan kunlar bo'yicha (services/demand.ts), yo'ldagi tovar ham
   * hisobga olinadi. getAvgDaily bilan alohida hisoblansa, raqam havola
   * qilingan /planner sahifasidagidan farq qilardi (2026-10-24 tahlili).
   * Yetkazish muddati saytda brauzerda saqlanadi — server standart 7 kunni oladi.
   */
  const [catalog, stocks, demand, inbound] = await Promise.all([
    getSkuCatalog(c.storeIds, false),
    getLatestStocks(c.storeIds),
    getDemand(c.storeIds),
    getInbound(c.companyId, c.storeIds),
  ]);
  const today = parseISODate(c.today);
  const out: Entity[] = [];
  for (const info of catalog.values()) {
    const row = buildRow({
      info,
      stock: stocks.get(info.id) ?? EMPTY_STOCK,
      inbound: inbound.get(info.id) ?? 0,
      demand: demand.get(info.id) ?? NO_DEMAND,
      cover: DEFAULT_COVER,
      lead: DEFAULT_LEAD,
      today,
    });
    // "critical" — tovar kelguncha tugaydi; yo'qotish 0 bo'lsa (aynan yetkazish kuni tugaydi) — hali vazifa emas
    if (row.status !== 'critical' || row.lostRevenue <= 0) continue;
    out.push({
      key: `stock:${info.id}`,
      amount: row.lostRevenue,
      level: row.stock <= 0 ? 'danger' : 'warn',
      params: { sku: row.sku, name: info.title, days: row.daysLeft ?? 0, stock: row.stock, lead: DEFAULT_LEAD },
    });
  }
  return out;
}

async function storageEntities(c: RuleCtx): Promise<Entity[]> {
  // Bugun kirmaydi: kun hali tugamagan, Uzum saqlashni kechikib yozadi
  const curFrom = addDays(c.todayStart, -7);
  const prevFrom = addDays(c.todayStart, -14);
  const fees = await prisma.storageFee.findMany({
    where: { storeId: { in: c.storeIds }, date: { gte: prevFrom, lt: c.todayStart } },
    select: { skuId: true, date: true, amount: true },
  });
  let cur = 0;
  let prev = 0;
  const bySku = new Map<string, number>();
  for (const f of fees) {
    const sign = f.date.getTime() >= curFrom.getTime() ? 1 : -1;
    if (sign > 0) cur += f.amount;
    else prev += f.amount;
    if (f.skuId) bySku.set(f.skuId, (bySku.get(f.skuId) ?? 0) + sign * f.amount);
  }
  const increase = round(cur - prev);
  const grew = prev > 0 ? increase / prev >= STORAGE_GROWTH_MIN : cur > 0;
  if (!grew || increase < STORAGE_MIN_INCREASE) return [];

  // Eng ko'p o'sgan SKU — qayerdan boshlashni aytadi
  let topSkuId: string | null = null;
  let topDelta = 0;
  for (const [skuId, delta] of bySku) {
    if (delta > topDelta) {
      topDelta = delta;
      topSkuId = skuId;
    }
  }
  const top = topSkuId
    ? await prisma.sku.findUnique({ where: { id: topSkuId }, select: { sku: true, title: true } })
    : null;

  return [
    {
      key: `storage:${isoWeekKey(c.today)}`,
      amount: increase,
      level: 'warn',
      params: {
        cur: round(cur),
        prev: round(prev),
        // Oldingi haftada saqlash bo'lmagan bo'lsa foiz ma'nosiz — matn "boshlandi" bo'ladi
        ...(prev > 0 ? { pct: Math.round((increase / prev) * 100) } : {}),
        ...(top ? { sku: top.sku, name: top.title, skuDelta: round(topDelta) } : {}),
      },
    },
  ];
}

const RULES: Record<TodayTaskKind, (c: RuleCtx) => Promise<Entity[]>> = {
  loss: lossEntities,
  review: reviewEntities,
  cost: costEntities,
  fbs: fbsEntities,
  stock: stockEntities,
  storage: storageEntities,
};

// ─────────────────────────── Qator yasash ───────────────────────────

const str = (v: string | number | undefined): string => (v === undefined ? '' : String(v));
const n = (v: string | number | undefined): number => (typeof v === 'number' ? v : Number(v) || 0);

/** Bitta obyekt qatorining o'zbekcha matni (sayt uch tilda o'zi yasaydi — bu zaxira va boshqa mijozlar uchun) */
function singleText(kind: TodayTaskKind, p: Record<string, string | number>): { title: string; body: string; cta: string } {
  switch (kind) {
    case 'loss':
      return {
        title: `${str(p.sku)}: ${num(n(p.qty))} dona uchun da’vo yuborilmagan`,
        body: [str(p.name), shortDate(str(p.date)), 'Uzum o‘rnini qoplashi kerak'].filter(Boolean).join(' · '),
        cta: KIND_CTA.loss,
      };
    case 'review':
      return {
        title: `${n(p.rating)}★ sharh javobsiz — ${str(p.name) || 'mahsulot'}`,
        body: [p.text ? `«${str(p.text)}»` : 'Matnsiz baho', shortDate(str(p.date))].join(' · '),
        cta: KIND_CTA.review,
      };
    case 'cost':
      return {
        title: `${str(p.sku)}: tannarx kiritilmagan`,
        body: `30 kunda ${num(n(p.units))} dona sotilgan — foyda tannarxsiz, ya’ni oshirib hisoblanmoqda`,
        cta: KIND_CTA.cost,
      };
    case 'fbs':
      return {
        title: `${str(p.scheme)} buyurtma №${str(p.order)} yig‘ilmagan`,
        body: `${ageText(n(p.hours))} oldin tushgan · ${num(n(p.units))} dona`,
        cta: 'Buyurtmani ochish',
      };
    case 'stock':
      return {
        title: n(p.stock) <= 0 ? `${str(p.sku)}: qoldiq tugagan` : `${str(p.sku)}: qoldiq ${num(n(p.days))} kunga yetadi`,
        body: `${str(p.name)} · yetkazish ${num(n(p.lead))} kun — bugun buyurtma berilsa ham uzilish bo‘ladi`,
        cta: KIND_CTA.stock,
      };
    case 'storage':
    default:
      return {
        title: p.pct !== undefined ? `Pullik saqlash ${num(n(p.pct))}% ga o‘sdi` : 'Pullik saqlash boshlandi',
        body: [
          `Oxirgi 7 kun ${money(n(p.cur))}, oldingi 7 kun ${money(n(p.prev))}`,
          p.sku ? `eng ko‘p o‘sgani ${str(p.sku)}` : '',
        ]
          .filter(Boolean)
          .join(' · '),
        cta: KIND_CTA.storage,
      };
  }
}

/** Bir nechta obyektli qator matni */
function groupText(kind: TodayTaskKind, p: Record<string, string | number>): { title: string; body: string; cta: string } {
  const count = num(n(p.count));
  switch (kind) {
    case 'loss':
      return {
        title: `${count} ta yo‘qotishga da’vo yuborilmagan`,
        body: `Jami ${num(n(p.qty))} dona · eng kattasi ${str(p.sku)} · bitta da’vo matnida yuboriladi`,
        cta: KIND_CTA.loss,
      };
    case 'review':
      return {
        title: `${count} ta salbiy sharh javobsiz`,
        body: `Eng yangisi: ${str(p.name) || 'mahsulot'} · ${n(p.rating)}★`,
        cta: KIND_CTA.review,
      };
    case 'cost':
      return {
        title: `${count} ta SKU tannarxsiz sotilmoqda`,
        body: `30 kunda ${num(n(p.units))} dona · foyda shu sotuvlarda oshirib hisoblanmoqda`,
        cta: KIND_CTA.cost,
      };
    case 'fbs':
      return {
        title: `${count} ta ${str(p.scheme)} buyurtma yig‘ilmagan`,
        body: `Eng eskisi ${ageText(n(p.hours))} oldin tushgan · Uzum kabinetida tasdiqlang`,
        cta: KIND_CTA.fbs,
      };
    case 'stock':
      return {
        title: `${count} ta SKU tovar kelguncha tugaydi`,
        body: `Eng shoshilinchi ${str(p.sku)} — ${num(n(p.days))} kunga yetadi · yetkazish ${num(n(p.lead))} kun`,
        cta: KIND_CTA.stock,
      };
    case 'storage':
    default:
      return singleText(kind, p);
  }
}

/** Guruh qatorining qiymatlari: jami va "eng muhim" obyekt */
function groupParams(kind: TodayTaskKind, list: Entity[]): Record<string, string | number> {
  const byAmount = [...list].sort((a, b) => (b.amount ?? 0) - (a.amount ?? 0));
  const top = byAmount[0]?.params ?? {};
  const sum = (field: string) => list.reduce((s, e) => s + n(e.params[field]), 0);
  switch (kind) {
    case 'loss':
      return { count: list.length, qty: sum('qty'), sku: str(top.sku), name: str(top.name) };
    case 'review': {
      // Ro'yxat publishedAt bo'yicha kamayib keladi — birinchisi eng yangisi
      const newest = list[0]?.params ?? {};
      return { count: list.length, rating: n(newest.rating), name: str(newest.name) };
    }
    case 'cost':
      return { count: list.length, units: sum('units'), sku: str(top.sku), name: str(top.name) };
    case 'fbs': {
      const schemes = [...new Set(list.map((e) => str(e.params.scheme)))].sort();
      return { count: list.length, hours: Math.max(...list.map((e) => n(e.params.hours))), scheme: schemes.join('/') };
    }
    case 'stock': {
      // Eng shoshilinchi — eng kam kunga yetadigani (teng bo'lsa — ko'proq yo'qotadigani)
      const urgent = [...list].sort((a, b) => n(a.params.days) - n(b.params.days) || (b.amount ?? 0) - (a.amount ?? 0))[0];
      const u = urgent?.params ?? {};
      return { count: list.length, sku: str(u.sku), name: str(u.name), days: n(u.days), lead: n(u.lead) };
    }
    case 'storage':
    default:
      return { ...top, count: list.length };
  }
}

function toTask(kind: TodayTaskKind, list: Entity[], locked: boolean): TodayTask {
  const single = list.length === 1 ? list[0] : null;
  const params = single ? { ...single.params, count: 1 } : groupParams(kind, list);
  const text = single ? singleText(kind, params) : groupText(kind, params);
  const amounts = list.map((e) => e.amount).filter((a): a is number => a !== null);
  const level = list.reduce<TodayTaskLevel>((best, e) => (LEVEL_RANK[e.level] < LEVEL_RANK[best] ? e.level : best), 'info');
  return {
    key: single ? single.key : `${kind}:*`,
    kind,
    level,
    title: text.title,
    body: text.body,
    amount: amounts.length > 0 ? round(amounts.reduce((s, a) => s + a, 0)) : null,
    link: single?.link ?? KIND_LINK[kind],
    cta: text.cta,
    ...(locked ? { locked: true } : {}),
    count: list.length,
    keys: list.map((e) => e.key),
    params,
  };
}

/** Pul miqdori kamayishi bo'yicha; summasiz qatorlar oxirida — darajasi bo'yicha */
function compareTasks(a: TodayTask, b: TodayTask): number {
  if (a.amount !== null && b.amount !== null && a.amount !== b.amount) return b.amount - a.amount;
  if ((a.amount === null) !== (b.amount === null)) return a.amount === null ? 1 : -1;
  return LEVEL_RANK[a.level] - LEVEL_RANK[b.level] || b.count - a.count;
}

/** Uzum bugun jadval bo'yicha o'tkazgan to'lov — sinxron qayd etgan bo'lsa (payout-history.ts) */
async function payoutToday(storeIds: string[], today: string): Promise<number | null> {
  if (storeIds.length === 0) return null;
  const day = parseISODate(today);
  const agg = await prisma.payoutRecord.aggregate({
    _sum: { amount: true },
    _count: { _all: true },
    // PayoutRecord.date — Toshkent kalendar sanasi (UTC yarim tuni)
    where: { storeId: { in: storeIds }, kind: 'scheduled', date: { gte: day, lt: addDays(day, 1) } },
  });
  return agg._count._all > 0 ? round(agg._sum.amount ?? 0) : null;
}

// ─────────────────────────── GET / ───────────────────────────

router.get(
  '/',
  ah(async (req, res) => {
    const { company, plan } = companyCtx(req);
    const q = req.query as Record<string, string | undefined>;
    const storeId = q.storeId && q.storeId !== 'all' ? q.storeId : undefined;
    const storeIds = await getStoreIds(company.id, storeId);

    const now = new Date();
    const today = toBusinessDate(now);
    const ctx: RuleCtx = { companyId: company.id, storeIds, now, today, todayStart: businessDayStart(today) };

    /*
     * Har qoida alohida: bittasi yiqilsa (masalan, katta bazada vaqt tugasa)
     * qolganlari baribir chiqadi. Yiqilgan tekshiruv "o'tdi" deb ham
     * ko'rsatilmaydi — "Hammasi nazoratda" faqat haqiqatan tekshirilganlar uchun.
     */
    const [{ raw, state }, payout, ...results] = await Promise.all([
      readState(company.id),
      payoutToday(storeIds, today).catch(() => null),
      ...KIND_ORDER.map((kind) =>
        storeIds.length === 0
          ? Promise.resolve<Entity[] | null>(null)
          : RULES[kind](ctx).catch((err: unknown) => {
              // eslint-disable-next-line no-console
              console.error(`[today] ${kind} tekshiruvi yiqildi:`, err);
              return null;
            }),
      ),
    ]);

    const items: TodayTask[] = [];
    const cleared: TodayCheck[] = [];
    const candidates = new Set<string>();
    const ranKinds = new Set<TodayTaskKind>();
    let hidden = 0;

    KIND_ORDER.forEach((kind, i) => {
      const found = results[i];
      if (!found) return;
      ranKinds.add(kind);
      if (found.length === 0) {
        cleared.push({ kind, label: CLEARED_LABEL[kind] });
        return;
      }
      const visible: Entity[] = [];
      for (const e of found) {
        candidates.add(e.key);
        if (isHidden(state[e.key], now)) hidden += 1;
        else visible.push(e);
      }
      if (visible.length === 0) return;
      items.push(toTask(kind, visible, featureAccess(plan, KIND_FEATURE[kind]) !== 'full'));
    });

    items.sort(compareTasks);

    /*
     * Holatni tozalash: tuzalgan obyekt (da'vo yuborildi, qoldiq to'ldi...)
     * belgisi endi kerak emas, muddati o'tgan "keyinroq" ham. Faqat do'kon
     * filtrisiz so'rovda — filtrda boshqa do'kon obyektlari ko'rinmaydi va
     * ularning belgilari noto'g'ri o'chib ketardi. Yozish taqqoslab
     * almashtirish bilan: shu orada kimdir "Bajarildi" bossa — tegilmaydi.
     */
    if (raw !== null && !storeId) {
      const next: TodoState = {};
      let changed = false;
      for (const [key, e] of Object.entries(state)) {
        const kind = key.slice(0, key.indexOf(':')) as TodayTaskKind;
        const fixed = ranKinds.has(kind) && !candidates.has(key);
        const expired = !e.doneAt && !isHidden(e, now);
        if (fixed || expired) changed = true;
        else next[key] = e;
      }
      if (changed) {
        await prisma.companySetting
          .updateMany({ where: { companyId: company.id, key: STATE_KEY, value: raw }, data: { value: JSON.stringify(next) } })
          .catch(() => undefined);
      }
    }

    const payload: TodayResponse = {
      date: today,
      items: items.slice(0, MAX_ITEMS),
      cleared,
      payoutToday: payout,
      hidden,
    };
    res.json(payload);
  }),
);

// ─────────────────────────── PATCH /:key ───────────────────────────

const actionSchema = z.object({
  action: z.enum(['done', 'snooze', 'reset']),
  /** Guruh qatori: amal shu obyektlarning har biriga (qator `keys` maydonidan) */
  keys: z.array(z.string().regex(ENTITY_KEY_RE)).min(1).max(500).optional(),
});

router.patch(
  '/:key',
  requireRole('owner', 'manager'),
  // Muddati tugagan obunada panel faqat ko'rish uchun — vazifalarni belgilab bo'lmaydi
  requireFeature('dashboard_realtime'),
  ah(async (req, res) => {
    const { company } = companyCtx(req);
    const rowKey = String(req.params.key);
    if (!ROW_KEY_RE.test(rowKey)) throw AppError.badRequest('Vazifa kaliti noto‘g‘ri');
    const input = actionSchema.parse(req.body ?? {});

    const kind = rowKey.slice(0, rowKey.indexOf(':'));
    const keys = [...new Set(input.keys ?? (rowKey.endsWith(':*') ? [] : [rowKey]))];
    if (keys.length === 0) throw AppError.badRequest('Guruh qatori uchun obyekt kalitlari (keys) kerak');
    if (keys.some((k) => k.slice(0, k.indexOf(':')) !== kind)) {
      throw AppError.badRequest('Kalitlar qator turiga mos emas');
    }

    const now = new Date();
    // "Keyinroq" — keyingi Toshkent kunining boshigacha (ertaga ro'yxatda yana chiqadi)
    const snoozeUntil =
      input.action === 'snooze'
        ? businessDayStart(toISODate(addDays(parseISODate(toBusinessDate(now)), 1))).toISOString()
        : null;

    await mutateState(company.id, now, (state) => {
      for (const key of keys) {
        if (input.action === 'reset') delete state[key];
        else if (input.action === 'done') state[key] = { doneAt: now.toISOString() };
        else state[key] = { snoozeUntil: snoozeUntil as string };
      }
    });

    const payload: TodayActionResponse = { action: input.action, keys, snoozeUntil };
    res.json(payload);
  }),
);

export default router;
