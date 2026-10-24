/**
 * Oylik maqsadlar — /api/v1/dashboard/goals
 *
 *  GET /  → GoalsResponse: joriy oy (Toshkent kalendari) natijasi, saqlangan
 *           maqsad, o'tgan oy asosidagi taklif, oy oxiri prognozi va qolgan
 *           kunlarda kuniga kerakli sur'at
 *  PUT /  → maqsadni saqlash yoki tozalash (faqat owner/manager)
 *
 * Raqamlar Boshqaruv paneli bilan AYNAN bir xil (analytics.ts GET /dashboard):
 *   sof foyda = collectTotals().netProfit − getPeriodCosts().total
 *   marja     = sof foyda ÷ tushum
 *   dona      = collectTotals().units (paneldagi `unitsSold`)
 * Tovarlar bo'yicha foyda (davr xarajatlarisiz) olinsa, bitta ekranda MoneyFlow
 * bir "sof foyda"ni, maqsad kartochkasi boshqasini ko'rsatib qo'yardi.
 *
 * Maqsadlar KOMPANIYA darajasida: CompanySetting 'goals:YYYY-MM' kalitida JSON
 * (sxema o'zgarmaydi, SQLite va PostgreSQL'da bir xil ishlaydi). Do'kon filtri
 * tanlangan bo'lsa ham hisob barcha do'konlar bo'yicha (scope: 'company') va
 * sayt buni kartochkada aytadi. ATAYLAB: bitta maqsadni do'konlarga bo'lish
 * qoidasi yo'q, bitta do'kon tushumini kompaniya maqsadiga solishtirish esa
 * "orqada qoldik" degan noto'g'ri xulosa berardi. Do'kon bo'yicha maqsad kerak
 * bo'lsa — alohida kalit ('goals:YYYY-MM:<storeId>') bilan qo'shiladi.
 */
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '@savdoiq/db';
import {
  addDays,
  businessDayStart,
  getPlan,
  parseISODate,
  pct,
  round,
  toBusinessDate,
  toISODate,
  type GoalMetrics,
  type GoalTargets,
  type GoalsResponse,
  type GoalsUpdateResponse,
} from '@savdoiq/shared';
import { AppError, ah } from '../lib/errors.js';
import { companyCtx, requireAuth, requireCompany, requireRole } from '../lib/auth.js';
import { getStoreIds } from '../services/common.js';
import { getPeriodCosts, type PeriodCosts } from '../services/pnl.js';
import { collectTotals, type PeriodTotals } from './analytics.js';

const router = Router();
router.use(requireAuth, requireCompany);

const DAY_MS = 86_400_000;
const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
/** Taklif: o'tgan oydan 10% ko'p — o'sish maqsadi, lekin erishib bo'ladigan */
const GROWTH = 1.1;

const settingKey = (month: string): string => `goals:${month}`;
/** 'YYYY-MM' → oylar tartib raqami (oylar orasidagi farqni sanash uchun) */
const monthIndex = (key: string): number => Number(key.slice(0, 4)) * 12 + Number(key.slice(5, 7)) - 1;

// ─────────────────────────── Validatsiya ───────────────────────────

/*
 * Pul maqsadi musbat: 0 yoki manfiy maqsadga "necha foiz bajarildi" degan
 * savolning javobi yo'q (nolga bo'lish). Maqsadni olib tashlash — null.
 */
const moneyTarget = z.number().finite().positive().max(1e13);
const unitsTarget = z.number().int().positive().max(1e9);
// Marja — chegara: 0% ham ma'noli ("zararsiz ishlash"), 100% dan oshmaydi
const marginTarget = z.number().finite().min(0).max(100);

const putSchema = z
  .object({
    month: z.string().regex(MONTH_RE, 'Oy YYYY-MM ko‘rinishida bo‘lishi kerak'),
    revenue: moneyTarget.nullable().optional(),
    netProfit: moneyTarget.nullable().optional(),
    units: unitsTarget.nullable().optional(),
    marginPct: marginTarget.nullable().optional(),
  })
  // Noma'lum kalit (masalan 'margin') jimgina tashlab yuborilmasin — maqsad saqlandi deb o'ylanardi
  .strict();

/**
 * Saqlangan JSON'ni o'qish. Qiymat umumiy PUT /company/settings orqali ham
 * yozilishi mumkin (kalit qoidasi 'goals:2026-10' ni o'tkazadi), shuning
 * uchun har maydon alohida tekshiriladi: buzilgani null, qolganlari ishlaydi.
 */
function parseTargets(raw: string | null | undefined): GoalTargets | null {
  if (!raw) return null;
  let obj: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    obj = parsed as Record<string, unknown>;
  } catch {
    return null;
  }
  const pick = <T>(schema: z.ZodType<T>, v: unknown): T | null => {
    const r = schema.safeParse(v);
    return r.success ? r.data : null;
  };
  const t: GoalTargets = {
    revenue: pick(moneyTarget, obj.revenue),
    netProfit: pick(moneyTarget, obj.netProfit),
    units: pick(unitsTarget, obj.units),
    marginPct: pick(marginTarget, obj.marginPct),
  };
  return Object.values(t).some((v) => v !== null) ? t : null;
}

// ─────────────────────────── Hisob yordamchilari ───────────────────────────

/**
 * Taklifni "dumaloq" qilish (3 ta muhim raqam): 13 580 246 → 13 600 000.
 * Kasrgacha aniq taklif mashina chiqargan raqamdek ko'rinadi va kartochkada
 * baribir ixcham ("13,6 mln") yoziladi.
 */
function niceRound(v: number): number {
  if (!Number.isFinite(v) || v <= 0) return 0;
  if (v < 1000) return Math.round(v);
  const step = 10 ** (Math.floor(Math.log10(v)) - 2);
  return Math.round(v / step) * step;
}

/** Boshqaruv paneli formulasi: sof foyda davr xarajatlaridan keyin, qiymatlar panel kabi yaxlitlanadi */
function toMetrics(t: PeriodTotals, costs: PeriodCosts): GoalMetrics {
  const net = t.netProfit - costs.total;
  return {
    revenue: round(t.revenue),
    netProfit: round(net),
    units: round(t.units),
    // Panelda ham pct(curNet, cur.revenue) — 2 xona
    marginPct: pct(net, t.revenue),
  };
}

/** Joriy va o'tgan oy chegaralari — savdo kuni (Asia/Tashkent) bo'yicha, reports.ts /compare bilan bir xil */
function monthWindows(now: Date) {
  const today = parseISODate(toBusinessDate(now));
  const y = today.getUTCFullYear();
  const m = today.getUTCMonth();
  const first = new Date(Date.UTC(y, m, 1));
  const prevFirst = new Date(Date.UTC(y, m - 1, 1));
  const daysInMonth = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  const monthStart = businessDayStart(toISODate(first));
  return {
    month: toISODate(first).slice(0, 7),
    dayOfMonth: today.getUTCDate(),
    daysInMonth,
    monthStart,
    // Panelning preset=thisMonth oynasi: 1-kundan bugun oxirigacha (ertangi kun boshi — kirmaydi)
    curToExclusive: addDays(businessDayStart(toISODate(today)), 1),
    lastFrom: businessDayStart(toISODate(prevFirst)),
  };
}

// ─────────────────────────── GET / ───────────────────────────

router.get(
  '/',
  ah(async (req, res) => {
    const { company, plan } = companyCtx(req);
    const now = new Date();
    const w = monthWindows(now);

    // Kompaniya darajasi: `?storeId` ATAYLAB e'tiborsiz (fayl boshidagi izohga qarang)
    const storeIds = await getStoreIds(company.id);

    /*
     * O'tgan oy tarif tarixidan BUTUNLAY tashqarida bo'lsa, undan taklif
     * qilinmaydi — /reports/compare bilan bir xil qoida (qisman kirgan oy
     * to'liq hisoblanadi).
     */
    const earliest = addDays(now, -getPlan(plan).limits.historyDays);
    const lastAllowed = w.monthStart.getTime() > earliest.getTime();

    const [curT, curCosts, lastT, lastCosts, saved] = await Promise.all([
      collectTotals(storeIds, w.monthStart, w.curToExclusive),
      // Davr xarajatlari — panel bilan bir xil: do'kon filtri yo'q, kompaniyaning hamma xarajati
      getPeriodCosts(company.id, storeIds, w.monthStart, w.curToExclusive),
      lastAllowed ? collectTotals(storeIds, w.lastFrom, w.monthStart) : Promise.resolve(null),
      lastAllowed ? getPeriodCosts(company.id, storeIds, w.lastFrom, w.monthStart) : Promise.resolve(null),
      prisma.companySetting.findUnique({
        where: { companyId_key: { companyId: company.id, key: settingKey(w.month) } },
        select: { value: true },
      }),
    ]);

    const actual = toMetrics(curT, curCosts);
    // O'tgan oyda sotuv bo'lmasa (yangi do'kon) taklif qilinmaydi — "0 × 1,1" maqsad emas
    const lastMonth = lastT && lastCosts && lastT.revenue > 0 ? toMetrics(lastT, lastCosts) : null;
    const target = parseTargets(saved?.value);

    /*
     * Zarar bilan yopilgan oy uchun "o'tgan oy × 1,1" kattaroq zarar bo'lib
     * chiqadi — bunday taklif berilmaydi (null), sotuvchi o'zi kiritadi.
     */
    const suggested: GoalTargets | null = lastMonth
      ? {
          revenue: niceRound(lastMonth.revenue * GROWTH),
          netProfit: lastMonth.netProfit > 0 ? niceRound(lastMonth.netProfit * GROWTH) : null,
          // 10 × 1,1 = 11,000000000000002 — yaxlitlamasdan yuqoriga yaxlitlansa 12 chiqardi
          units: lastMonth.units > 0 ? niceRound(Math.ceil(round(lastMonth.units * GROWTH, 6))) : null,
          marginPct: lastMonth.marginPct > 0 ? round(lastMonth.marginPct, 1) : null,
        }
      : null;

    /*
     * O'tgan vaqt KASR kunlarda: 24-kuni soat 10:00 da 23,4 kun. Bugunni to'liq
     * kun deb sanash ertalab sur'atni keskin pasaytiradi (2-kuni soat 9 da
     * 1,15 kunlik sotuv 2 kunga bo'linib, prognoz yarmiga tushardi) va oy
     * boshida hamma qator qizil bo'lib qolardi. Kamida 1 kun — oyning
     * birinchi soatlarida bitta buyurtma prognozni o'n barobar shishirmasin.
     */
    const elapsed = Math.min(w.daysInMonth, Math.max(1, (now.getTime() - w.monthStart.getTime()) / DAY_MS));
    const remaining = w.daysInMonth - elapsed;
    const linear = (v: number): number => (v / elapsed) * w.daysInMonth;

    /*
     * Sof foyda chiziqli EMAS: ish haqi, ijara yoki omborga logistika bitta
     * kunga tushadi. Prognoz = tovarlar foydasi sur'ati × oy kunlari −
     * kutilayotgan davr xarajatlari (shu oy hozircha yozilgani va o'tgan
     * oyning to'liq xarajatidan kattasi). Oy boshida to'langan ish haqi butun
     * oyga cho'zilib prognozni zararga aylantirmaydi, oy oxirida keladigani
     * esa unutilmaydi.
     */
    const expectedCosts = Math.max(curCosts.total, lastCosts?.total ?? 0);
    const costsAhead = expectedCosts - curCosts.total;
    const forecast = {
      revenue: round(linear(curT.revenue)),
      netProfit: round(linear(curT.netProfit) - expectedCosts),
      units: round(linear(curT.units)),
    };

    /*
     * Kuniga kerak = (maqsad − hozirgi) ÷ qolgan kunlar. Oxirgi kun (1 kundan
     * kam qolganda) — butun qoldiq bugun kerak. Sof foyda uchun hali
     * tushmagan kutilgan xarajat ham qo'shiladi: aks holda oy oxirida keladigan
     * ish haqi "kuniga kerak"ni past ko'rsatib, maqsad bajarilmay qolardi.
     * Maqsadga yetilgan bo'lsa 0.
     */
    const days = Math.max(1, remaining);
    const perDay = (gap: number): number => Math.max(0, Math.ceil(gap / days));
    const needPerDay = target
      ? {
          revenue: target.revenue !== null ? perDay(target.revenue - curT.revenue) : null,
          netProfit: target.netProfit !== null ? perDay(target.netProfit - actual.netProfit + costsAhead) : null,
          units: target.units !== null ? perDay(target.units - curT.units) : null,
        }
      : null;

    const payload: GoalsResponse = {
      month: w.month,
      dayOfMonth: w.dayOfMonth,
      daysInMonth: w.daysInMonth,
      elapsedDays: round(elapsed, 2),
      currency: company.currency,
      actual,
      target,
      suggested,
      lastMonth,
      forecast,
      needPerDay,
      scope: 'company',
    };
    res.json(payload);
  }),
);

// ─────────────────────────── PUT / ───────────────────────────

/**
 * Maqsadni saqlash. PUT — to'liq almashtirish: berilmagan yoki null kalit shu
 * maqsadni olib tashlaydi, hammasi null bo'lsa yozuv o'chadi va kartochka yana
 * taklifni ko'rsatadi.
 */
router.put(
  '/',
  requireRole('owner', 'manager'),
  ah(async (req, res) => {
    const { company } = companyCtx(req);
    const body = putSchema.parse(req.body ?? {});

    /*
     * O'tgan oy ham qabul qilinadi: oyna 31-kuni 23:59 da ochilib, 1-kuni
     * saqlansa so'rov rad etilmasin. Kelajak — 12 oygacha (oldindan reja).
     */
    const current = monthWindows(new Date()).month;
    const diff = monthIndex(body.month) - monthIndex(current);
    if (diff < -1 || diff > 12) {
      throw AppError.badRequest('Maqsadni faqat joriy oy (yoki keyingi 12 oy) uchun saqlash mumkin');
    }

    const target: GoalTargets = {
      revenue: body.revenue != null ? round(body.revenue) : null,
      netProfit: body.netProfit != null ? round(body.netProfit) : null,
      units: body.units ?? null,
      marginPct: body.marginPct != null ? round(body.marginPct, 2) : null,
    };
    const key = settingKey(body.month);
    const empty = Object.values(target).every((v) => v === null);

    if (empty) {
      await prisma.companySetting.deleteMany({ where: { companyId: company.id, key } });
    } else {
      const value = JSON.stringify(target);
      await prisma.companySetting.upsert({
        where: { companyId_key: { companyId: company.id, key } },
        create: { companyId: company.id, key, value },
        update: { value },
      });
    }

    const payload: GoalsUpdateResponse = { month: body.month, target: empty ? null : target };
    res.json(payload);
  }),
);

export default router;
