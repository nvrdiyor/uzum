/**
 * Pul kalendari — /api/v1/payout
 *
 *  GET /  → PayoutCalendarResponse
 *
 * Uzum pulni darhol bermaydi: xaridor tovarni QABUL QILGANIDAN keyin
 * belgilangan kun o'tishi kerak, shundan keyingina summa yechib olish uchun
 * ochiladi. Kabinetdagi "Umumiy balans" va "Yechib olish mumkin" orasidagi
 * farq aynan shundan.
 *
 * Bir buyurtma uchun ochiladigan summa — kabinetdagi "Yechib olish uchun"
 * ustuni: `tushum − komissiya − logistika`. Bu bizdagi `OrderItem.payout`
 * bilan AYNAN mos tushadi (jonli kabinetda uchta buyurtmada tekshirilgan).
 *
 * DIQQAT: bu hisob Uzum shartlari asosida QURILGAN, Uzumdan olinmagan.
 * Yakuniy raqam har doim kabinetda. Shuning uchun qoidalar sozlamada
 * saqlanadi — Uzum shartni o'zgartirsa kodga tegmasdan moslanadi.
 */
import { Router } from 'express';
import { prisma } from '@savdoiq/db';
import {
  addDays,
  parseISODate,
  round,
  toISODate,
  type PayoutCalendarResponse,
  type PayoutCheck,
  type PayoutDay,
  type PayoutMode,
  type PayoutOrder,
  type PayoutPlanDay,
} from '@savdoiq/shared';
import { ah } from '../lib/errors.js';
import { companyCtx, requireAuth, requireCompany, requireFeature } from '../lib/auth.js';
import { resolveRange } from '../lib/period.js';
import { getStoreIds } from '../services/common.js';

const router = Router();
router.use(requireAuth, requireCompany);

/** Sozlamalar kaliti — kompaniya bo'yicha */
const HOLD_KEY = 'payout:holdDays';
const FEE_KEY = 'payout:earlyFeePct';
const MODE_KEY = 'payout:mode';

/** Uzumning joriy sharti: qabul qilingandan keyin 10 kun */
const DEFAULT_HOLD_DAYS = 10;
/** Erta (tezkor) yechib olish xizmat haqi */
const DEFAULT_EARLY_FEE_PCT = 2.5;

/**
 * To'lov jadvallari — Uzum kabinetidagi "To'lovlar jadvalini sozlash".
 * Har birining o'z haqi bor: tez-tez to'lansa qimmatroq.
 * `daily` — har ISH kuni (dam olish kunlari to'lov yo'q).
 */
const SCHEDULE_DAYS: Record<PayoutMode, number[]> = {
  daily: [],
  weekly: [7, 14, 21, 28],
  biweekly: [7, 21],
  monthly: [7],
};

const SCHEDULE_FEE: Record<PayoutMode, number> = {
  daily: 1.5,
  weekly: 1,
  biweekly: 0,
  monthly: 0,
};

const DEFAULT_MODE: PayoutMode = 'biweekly';

/**
 * Berilgan sanadan boshlab jadval bo'yicha eng yaqin to'lov kunini topadi.
 *
 * Pul ochilgan kuniyoq tushmaydi: u jadvaldagi navbatdagi sanani kutadi.
 * Masalan 2 haftalik jadvalda (7 va 21) 27-sentyabrda ochilgan summa
 * 7-oktyabrda tushadi.
 */
function nextPayoutDate(from: Date, mode: PayoutMode): Date {
  const d = new Date(from.getTime());

  if (mode === 'daily') {
    // Dam olish kunlarida to'lov yo'q — dushanbaga suriladi
    for (let i = 0; i < 7; i += 1) {
      const wd = d.getUTCDay();
      if (wd !== 0 && wd !== 6) return d;
      d.setUTCDate(d.getUTCDate() + 1);
    }
    return d;
  }

  const days = SCHEDULE_DAYS[mode];
  // Ko'pi bilan ikki oy oldinga qaraymiz — jadvalda albatta kun topiladi
  for (let i = 0; i < 70; i += 1) {
    if (days.includes(d.getUTCDate())) return d;
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return d;
}

function asMode(value: string | undefined): PayoutMode {
  const v = (value ?? '') as PayoutMode;
  return v in SCHEDULE_DAYS ? v : DEFAULT_MODE;
}

/**
 * Tezkor yechib olish mezonlari (Uzum shartlaridan).
 * Faqat quyidagilarni o'zimiz hisoblay olamiz — qolgan ikkitasi
 * (hisob bloklanganmi, antifrod) faqat Uzumda ma'lum.
 */
const MIN_ACCOUNT_AGE_DAYS = 60;
const STABILITY_WINDOW_DAYS = 60;
const MIN_SALE_DAYS = 15;
const ANOMALY_WINDOW_DAYS = 7;
const ANOMALY_BASE_DAYS = 30;
/** Oxirgi 7 kun o'rtacha haftalikdan shuncha barobar oshsa — anomaliya */
const ANOMALY_FACTOR = 10;

/** Bekor qilingan va qaytarilgan buyurtma pul keltirmaydi */
const EFFECTIVE_STATUSES = ['new', 'processing', 'delivered'];

async function readRule(companyId: string, key: string, fallback: number): Promise<number> {
  const row = await prisma.companySetting.findUnique({
    where: { companyId_key: { companyId, key } },
    select: { value: true },
  });
  const n = Number(row?.value);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

router.get(
  '/',
  requireFeature('unit_economics'),
  ah(async (req, res) => {
    const { company, plan } = companyCtx(req);
    const range = resolveRange(req, plan);
    const storeIds = await getStoreIds(company.id, range.storeId);

    const [holdDays, earlyFeePct, modeRow] = await Promise.all([
      readRule(company.id, HOLD_KEY, DEFAULT_HOLD_DAYS),
      readRule(company.id, FEE_KEY, DEFAULT_EARLY_FEE_PCT),
      prisma.companySetting.findUnique({
        where: { companyId_key: { companyId: company.id, key: MODE_KEY } },
        select: { value: true },
      }),
    ]);
    const mode = asMode(modeRow?.value);
    const scheduleFeePct = SCHEDULE_FEE[mode];

    const today = parseISODate(toISODate(new Date()));

    /*
     * Faqat QABUL QILINGAN buyurtmalar soatni boshlaydi. `deliveredAt` —
     * kabinetdagi "Qabul sanasi"; u bo'sh bo'lsa tovar hali xaridorga
     * yetib bormagan va hisob boshlanmagan.
     */
    const orders = await prisma.order.findMany({
      where: {
        storeId: { in: storeIds },
        deliveredAt: { not: null },
        status: { in: EFFECTIVE_STATUSES },
      },
      select: {
        uzumOrderId: true,
        deliveredAt: true,
        items: { select: { title: true, payout: true, status: true } },
      },
      orderBy: { deliveredAt: 'desc' },
    });

    const rows: PayoutOrder[] = [];

    for (const o of orders) {
      if (!o.deliveredAt) continue;
      const amount = round(
        o.items.filter((i) => EFFECTIVE_STATUSES.includes(i.status)).reduce((s, i) => s + i.payout, 0),
      );
      if (amount <= 0) continue;

      const acceptedAt = parseISODate(toISODate(o.deliveredAt));
      const unlockAt = addDays(acceptedAt, holdDays);
      const daysLeft = Math.ceil((unlockAt.getTime() - today.getTime()) / 86_400_000);
      // Ochilgan pul jadvaldagi navbatdagi sanani kutadi
      const payoutAt = nextPayoutDate(unlockAt, mode);

      rows.push({
        uzumOrderId: o.uzumOrderId,
        title: o.items[0]?.title ?? '',
        acceptedAt: toISODate(acceptedAt),
        unlockAt: toISODate(unlockAt),
        payoutAt: toISODate(payoutAt),
        amount,
        unlocked: daysLeft <= 0,
        daysLeft: Math.max(0, daysLeft),
      });
    }

    // Kunlar bo'yicha jamlash — kalendarda bir kun bitta qator
    const byDay = new Map<string, { amount: number; orders: number }>();
    for (const r of rows) {
      const cur = byDay.get(r.unlockAt) ?? { amount: 0, orders: 0 };
      cur.amount += r.amount;
      cur.orders += 1;
      byDay.set(r.unlockAt, cur);
    }

    const days: PayoutDay[] = [...byDay.entries()]
      .map(([date, v]) => ({
        date,
        amount: round(v.amount),
        orders: v.orders,
        unlocked: parseISODate(date).getTime() <= today.getTime(),
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    // Jadval bo'yicha to'lov kunlari
    const byPlan = new Map<string, { amount: number; orders: number }>();
    for (const r of rows) {
      const cur = byPlan.get(r.payoutAt) ?? { amount: 0, orders: 0 };
      cur.amount += r.amount;
      cur.orders += 1;
      byPlan.set(r.payoutAt, cur);
    }
    const planDays: PayoutPlanDay[] = [...byPlan.entries()]
      .map(([date, v]) => ({
        date,
        amount: round(v.amount),
        orders: v.orders,
        // Jadval haqi ayirilgandan keyin qo'lga tegadigan summa
        net: round(v.amount * (1 - scheduleFeePct / 100)),
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    const unlocked = round(rows.filter((r) => r.unlocked).reduce((s, r) => s + r.amount, 0));
    const pending = round(rows.filter((r) => !r.unlocked).reduce((s, r) => s + r.amount, 0));
    const next = days.find((d) => !d.unlocked);

    // ── Xizmat to'lovlari: Uzum ushlab qoladigan summalar ──
    const chargeRows = await prisma.expense.aggregate({
      where: {
        storeId: { in: storeIds },
        date: { gte: range.from, lt: range.toExclusive },
        source: { in: ['uzum', 'uzum-payout'] },
      },
      _sum: { amount: true },
    });
    const charges = round(chargeRows._sum.amount ?? 0);

    // ─────────── Tezkor yechib olish mezonlari ───────────

    const checks: PayoutCheck[] = [];

    // 1) Qarzdorlik — ochilgan summa xizmat to'lovlarini qoplaydimi
    checks.push(
      unlocked >= charges
        ? { key: 'no_debt', status: 'ok', detail: 'Ochilgan summa xizmat to‘lovlaridan ko‘p' }
        : {
            key: 'no_debt',
            status: 'fail',
            detail: `Xizmat to‘lovlari ochilgan summadan ${round(charges - unlocked)} so‘mga ko‘p`,
          },
    );

    // 2) Hisob bloklanganmi — faqat Uzumda ma'lum
    checks.push({ key: 'not_blocked', status: 'unknown', detail: 'Faqat Uzum kabinetida ko‘rinadi' });

    // 3) Platformada 60 kundan ortiq
    const first = await prisma.order.findFirst({
      where: { storeId: { in: storeIds }, status: { in: EFFECTIVE_STATUSES } },
      orderBy: { orderedAt: 'asc' },
      select: { orderedAt: true },
    });
    if (!first) {
      checks.push({ key: 'age_60d', status: 'fail', detail: 'Hali birorta sotuv yo‘q' });
    } else {
      const ageDays = Math.floor((today.getTime() - first.orderedAt.getTime()) / 86_400_000);
      checks.push({
        key: 'age_60d',
        status: ageDays > MIN_ACCOUNT_AGE_DAYS ? 'ok' : 'fail',
        detail: `Birinchi sotuvdan ${ageDays} kun o‘tgan (kamida ${MIN_ACCOUNT_AGE_DAYS} kerak)`,
      });
    }

    /*
     * 4) Barqaror savdo: oxirgi 60 kunda kamida 15 KUN davomida
     *    hech bo'lmasa bitta buyurtma bo'lgan. Kunlar soni muhim,
     *    buyurtmalar soni emas.
     */
    const since = addDays(today, -STABILITY_WINDOW_DAYS);
    const recent = await prisma.order.findMany({
      where: {
        storeId: { in: storeIds },
        status: { in: EFFECTIVE_STATUSES },
        orderedAt: { gte: since },
      },
      select: { orderedAt: true },
    });
    const saleDays = new Set(recent.map((o) => toISODate(o.orderedAt)));
    checks.push({
      key: 'stable_sales',
      status: saleDays.size >= MIN_SALE_DAYS ? 'ok' : 'fail',
      detail: `Oxirgi ${STABILITY_WINDOW_DAYS} kunda ${saleDays.size} kun savdo bo‘lgan (kamida ${MIN_SALE_DAYS} kerak)`,
    });

    /*
     * 5) Anomaliya: oxirgi 7 kundagi buyurtmalar soni oxirgi 30 kunning
     *    o'rtacha HAFTALIK ko'rsatkichidan 10 va undan ortiq barobar oshgan.
     */
    const weekAgo = addDays(today, -ANOMALY_WINDOW_DAYS);
    const monthAgo = addDays(today, -ANOMALY_BASE_DAYS);
    const lastWeek = recent.filter((o) => o.orderedAt >= weekAgo).length;
    const lastMonth = recent.filter((o) => o.orderedAt >= monthAgo).length;
    const weeklyAvg = (lastMonth / ANOMALY_BASE_DAYS) * ANOMALY_WINDOW_DAYS;
    const spike = weeklyAvg > 0 && lastWeek >= weeklyAvg * ANOMALY_FACTOR;
    checks.push({
      key: 'no_anomaly',
      status: spike ? 'fail' : 'ok',
      detail: spike
        ? `Oxirgi 7 kunda ${lastWeek} ta buyurtma — o‘rtacha haftalik ${round(weeklyAvg)} ta`
        : `Oxirgi 7 kunda ${lastWeek} ta, o‘rtacha haftalik ${round(weeklyAvg)} ta — keskin o‘sish yo‘q`,
    });

    // 6) Qo'shimcha antifrod — Uzum ixtiyorida
    checks.push({ key: 'antifraud', status: 'unknown', detail: 'Uzum qo‘shimcha cheklov qo‘yishi mumkin' });

    /*
     * Yakuniy xulosa: birorta mezon bajarilmasa — yo'q. Hammasi bajarilib,
     * lekin tekshira olmaganlarimiz qolsa — noma'lum (null), chunki
     * "bo'ladi" deb va'da berish mumkin emas.
     */
    const hasFail = checks.some((c) => c.status === 'fail');
    const hasUnknown = checks.some((c) => c.status === 'unknown');
    const eligible = hasFail ? false : hasUnknown ? null : true;

    const payload: PayoutCalendarResponse = {
      rules: { holdDays, earlyFeePct, mode, scheduleFeePct, payoutDays: SCHEDULE_DAYS[mode] },
      totals: {
        unlocked,
        pending,
        charges,
        nextDate: next?.date ?? null,
        nextAmount: next?.amount ?? 0,
      },
      days,
      plan: planDays,
      orders: rows.sort((a, b) => a.unlockAt.localeCompare(b.unlockAt)),
      instant: { eligible, checks },
    };
    res.json(payload);
  }),
);

export default router;
