/**
 * Pul kalendari — /api/v1/payout
 *
 *  GET   /       → PayoutCalendarResponse
 *  PATCH /rules  → sotuvchi kabinetdagi to'lov jadvalini qayd etadi
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
  type PayoutRulesRequest,
  SCHEDULE_FEE,
} from '@savdoiq/shared';
import { AppError, ah } from '../lib/errors.js';
import { companyCtx, requireAuth, requireCompany, requireFeature, requireRole } from '../lib/auth.js';
import { resolveRange } from '../lib/period.js';
import { getStoreIds } from '../services/common.js';
import {
  PAYOUT_KEYS,
  businessToday,
  getPayoutRules,
  isPayoutMode,
  modeOn,
  nextPayoutDate,
} from '../services/payout-schedule.js';

const router = Router();
router.use(requireAuth, requireCompany);

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

router.get(
  '/',
  requireFeature('unit_economics'),
  ah(async (req, res) => {
    const { company, plan } = companyCtx(req);
    const range = resolveRange(req, plan);
    const storeIds = await getStoreIds(company.id, range.storeId);

    const rules = await getPayoutRules(company.id);
    const { mode, holdDays, earlyFeePct, scheduleFeePct, payoutDays, schedule, confirmed } = rules;

    const today = businessToday();
    /*
     * Jadval TASDIQLANMAGAN bo'lsa hech qanday pulni "o'tkazilgan" deb
     * belgilamaymiz. Sana standart jadval TAXMINIDAN chiqadi, taxminga
     * tayanib "bu pul allaqachon keldi" deyish — sotuvchiga bo'lmagan
     * narsani aytish. Bunday holda o'tib ketgan sana oldinga suriladi:
     * ro'yxatda eskirgan kun turmaydi, lekin yolg'on da'vo ham qilinmaydi.
     */
    const firstUpcoming = nextPayoutDate(today, schedule);

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
      const scheduled = nextPayoutDate(unlockAt, schedule);

      /*
       * To'lov sanasi o'tib ketgan bo'lsa, o'sha pul allaqachon
       * o'tkazilgan. Ilgari bunday satr ro'yxatda qolib ketardi va
       * sahifa kechagi sanani "bugun tushadi" deb ko'rsatardi.
       */
      const past = scheduled.getTime() < today.getTime();
      const paid = confirmed && past;
      // Tasdiqlanmagan jadvalda o'tib ketgan sana oldinga suriladi
      const payoutAt = past && !paid ? firstUpcoming : scheduled;

      rows.push({
        uzumOrderId: o.uzumOrderId,
        title: o.items[0]?.title ?? '',
        acceptedAt: toISODate(acceptedAt),
        unlockAt: toISODate(unlockAt),
        payoutAt: toISODate(payoutAt),
        amount,
        unlocked: daysLeft <= 0,
        daysLeft: Math.max(0, daysLeft),
        paid,
      });
    }

    // Kunlar bo'yicha jamlash — kalendarda bir kun bitta qator
    const byDay = new Map<string, { amount: number; orders: number; paid: number }>();
    for (const r of rows) {
      const cur = byDay.get(r.unlockAt) ?? { amount: 0, orders: 0, paid: 0 };
      cur.amount += r.amount;
      cur.orders += 1;
      if (r.paid) cur.paid += r.amount;
      byDay.set(r.unlockAt, cur);
    }

    const days: PayoutDay[] = [...byDay.entries()]
      .map(([date, v]) => ({
        date,
        amount: round(v.amount),
        orders: v.orders,
        unlocked: parseISODate(date).getTime() <= today.getTime(),
        /*
         * Shu kuni ochilgan pulning qancha qismi jadval bo'yicha
         * allaqachon o'tkazilgani. Busiz jadval yig'indisi "Ochilgan"
         * ko‘rsatkichidan katta chiqib, ikkovi zid tushardi.
         */
        paid: round(v.paid),
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    // Jadval bo'yicha to'lov kunlari — faqat oldinda turganlari
    const byPlan = new Map<string, { amount: number; orders: number }>();
    for (const r of rows) {
      if (r.paid) continue;
      const cur = byPlan.get(r.payoutAt) ?? { amount: 0, orders: 0 };
      cur.amount += r.amount;
      cur.orders += 1;
      byPlan.set(r.payoutAt, cur);
    }
    const planDays: PayoutPlanDay[] = [...byPlan.entries()]
      .map(([date, v]) => {
        /*
         * Haq BITTA emas: jadval o'rtada almashsa, 7-oktyabr hali eski
         * jadval (0%), 14-oktyabr esa yangisi (1%) bo'yicha to'lanadi.
         */
        const rowMode = modeOn(parseISODate(date), schedule);
        const feePct = SCHEDULE_FEE[rowMode];
        return {
          date,
          amount: round(v.amount),
          orders: v.orders,
          mode: rowMode,
          feePct,
          // Jadval haqi ayirilgandan keyin qo'lga tegadigan summa
          net: round(v.amount * (1 - feePct / 100)),
          /*
           * Qolgan kun SERVERDA sanaladi. Brauzerda sanalganda UTC yarim
           * tuni mijozning mahalliy vaqti bilan solishtirilib, Toshkentda
           * 00:00–05:00 orasida bir kunga adashardi.
           */
          daysLeft: Math.max(
            0,
            Math.round((parseISODate(date).getTime() - today.getTime()) / 86_400_000),
          ),
        };
      })
      .sort((a, b) => a.date.localeCompare(b.date));

    const unlocked = round(rows.filter((r) => r.unlocked && !r.paid).reduce((s, r) => s + r.amount, 0));
    const paidOut = round(rows.filter((r) => r.paid).reduce((s, r) => s + r.amount, 0));
    const pending = round(rows.filter((r) => !r.unlocked).reduce((s, r) => s + r.amount, 0));
    const next = days.find((d) => !d.unlocked);

    /*
     * Uzum hali o'tkazmagan butun summa. Qarzdorlik tekshiruvi aynan
     * shunga taqaladi: `unlocked` endi faqat navbatdagi to'lovni kutayotgan
     * pul, ya'ni har to'lov sanasidan keyingi kuni u nolga yaqinlashadi va
     * o'ttiz kunlik xarajat bilan solishtirilsa har safar yolg'on "qarz bor"
     * chiqardi.
     */
    const owed = round(unlocked + pending);

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
      owed >= charges
        ? { key: 'no_debt', status: 'ok', detail: 'Hisobdagi summa xizmat to‘lovlaridan ko‘p' }
        : {
            key: 'no_debt',
            status: 'fail',
            detail: `Xizmat to‘lovlari hisobdagi summadan ${round(charges - owed)} so‘mga ko‘p`,
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
      rules: {
        holdDays,
        earlyFeePct,
        mode,
        scheduleFeePct,
        payoutDays,
        nextMode: rules.nextMode,
        nextFrom: rules.nextFrom,
        confirmed: rules.confirmed,
      },
      totals: {
        unlocked,
        paidOut,
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

// ─────────────────────────── PATCH /rules ───────────────────────────

/**
 * Sotuvchi kabinetdagi to'lov jadvalini qayd etadi.
 *
 * Uzum bu jadvalni ochiq API'da BERMAYDI, shuning uchun uni o'qib olishning
 * imkoni yo'q. Lekin jadval o'zgarganda butun Pul kalendari siljiydi, ya'ni
 * uni bilish shart. Yechim: sotuvchi bir marta tanlaydi.
 *
 * Kelajakdagi o'zgarish ham shu yerda saqlanadi — Uzum jadvalni darhol
 * emas, belgilangan sanadan almashtiradi. Sana kelganda hisob o'zi
 * o'tadi, sotuvchi qaytib kirishi shart emas.
 */

/** Jadvalni juda uzoq kelajakka qo'yish — deyarli har doim xato */
const MAX_SWITCH_AHEAD_DAYS = 400;

router.patch(
  '/rules',
  requireRole('owner', 'manager'),
  // O'qish qaysi tarifda ochiq bo'lsa, yozish ham o'sha tarifda
  requireFeature('unit_economics'),
  ah(async (req, res) => {
    const { company } = companyCtx(req);
    const body = (req.body ?? {}) as PayoutRulesRequest;

    if (!isPayoutMode(body.mode)) throw new AppError(400, 'bad_request', 'To‘lov jadvali noto‘g‘ri');

    const rawFrom = typeof body.nextFrom === 'string' ? body.nextFrom.trim() : '';
    const hasSwitch = Boolean(rawFrom) || (body.nextMode != null && body.nextMode !== undefined);

    let nextMode: PayoutMode | null = null;
    let nextFrom: string | null = null;

    if (hasSwitch) {
      if (!isPayoutMode(body.nextMode)) {
        throw new AppError(400, 'bad_request', 'Yangi jadvalni tanlang');
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(rawFrom)) {
        throw new AppError(400, 'bad_request', 'O‘zgarish sanasi YYYY-MM-DD ko‘rinishida bo‘lishi kerak');
      }
      const at = parseISODate(rawFrom);
      const today = businessToday();
      if (Number.isNaN(at.getTime()) || at.getTime() <= today.getTime()) {
        throw new AppError(400, 'bad_request', 'O‘zgarish sanasi kelajakda bo‘lishi kerak');
      }
      if (at.getTime() > addDays(today, MAX_SWITCH_AHEAD_DAYS).getTime()) {
        throw new AppError(400, 'bad_request', 'O‘zgarish sanasi juda uzoqda');
      }
      if (body.nextMode === body.mode) {
        throw new AppError(400, 'bad_request', 'Yangi jadval joriysidan farq qilishi kerak');
      }
      nextMode = body.nextMode;
      nextFrom = rawFrom;
    }

    const values: Record<string, string | null> = {
      [PAYOUT_KEYS.mode]: body.mode,
      [PAYOUT_KEYS.modeNext]: nextMode,
      [PAYOUT_KEYS.modeNextFrom]: nextFrom,
      [PAYOUT_KEYS.confirmedAt]: new Date().toISOString(),
    };

    /*
     * Uchta kalit BIRGA yoziladi. Yarim yozilgan holat — yangi rejim,
     * lekin eski kelajakdagi o'zgarish hamon o'rnida — jadvalni
     * sotuvchi kutmagan sanada almashtirib yuborardi.
     */
    await prisma.$transaction(
      Object.entries(values).map(([key, value]) =>
        value === null
          ? prisma.companySetting.deleteMany({ where: { companyId: company.id, key } })
          : prisma.companySetting.upsert({
              where: { companyId_key: { companyId: company.id, key } },
              create: { companyId: company.id, key, value },
              update: { value },
            }),
      ),
    );

    const rules = await getPayoutRules(company.id);
    res.json({
      holdDays: rules.holdDays,
      earlyFeePct: rules.earlyFeePct,
      mode: rules.mode,
      scheduleFeePct: rules.scheduleFeePct,
      payoutDays: rules.payoutDays,
      nextMode: rules.nextMode,
      nextFrom: rules.nextFrom,
      confirmed: rules.confirmed,
    });
  }),
);

export default router;
