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
 * Bir buyurtmadan ochiladigan summa — `sotuv − komissiya`. Yetkazish haqi
 * va boshqa xizmat to'lovlarini Uzum balansdan alohida ushlaydi; to'lov kuni
 * 00:00 da ochilgan puldan shu to'lovlar ayirilib o'tkaziladi (07.10.2026
 * to'lovida so'mgacha tekshirilgan: 1 535 900 − 892 170 − 132 600 = 511 130).
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
  todayInBusinessTz,
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
import { getUzumBalance } from '../services/balance.js';
import { listPayoutHistory } from '../services/payout-history.js';
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
    const tomorrow = addDays(today, 1);

    /*
     * UZUM QOIDASI (jonli do'konda 07.10.2026 to'lovida tekshirilgan, so'mgacha mos):
     *
     *   to'lov = to'lov kuni 00:00 gacha OCHILGAN buyurtmalarning (sotuv − komissiya)
     *            − Uzum ushlagan BARCHA xizmat to'lovlari − ilgari yechib olingan
     *
     * Bundan uch narsa kelib chiqadi:
     *  1. To'lov kuni BOSHLANISHIDA (00:00) o'tadi. O'sha kuni kunduzi ochilgan
     *     buyurtma keyingi sanaga qoladi — kabinet ham "21-oktabr to'lanadi:
     *     10.10 gacha yig'ilgan pul" deydi.
     *  2. Buyurtmadan ochiladigan summa — sotuv minus komissiya. Yetkazish haqi
     *     xizmat to'lovlari ichida alohida ushlanadi (balansda bor), shuning
     *     uchun `payout` (logistika ayirilgan) ishlatilsa u ikki marta ayrilardi.
     *  3. To'langan-to'lanmaganini Uzumning o'zi aytadi (`withdrawnProfit`).
     *     Ilgari "sana o'tdi — demak to'langan" deb taxmin qilinardi.
     */
    const orders = await prisma.order.findMany({
      where: { storeId: { in: storeIds }, status: { in: EFFECTIVE_STATUSES } },
      select: {
        uzumOrderId: true,
        deliveredAt: true,
        items: { select: { title: true, revenue: true, commission: true, payout: true, withdrawn: true, status: true } },
      },
      orderBy: { deliveredAt: 'desc' },
    });

    const rows: PayoutOrder[] = [];
    const nowTs = Date.now();
    const holdMs = holdDays * 86_400_000;
    /** Hali xaridorga yetmagan buyurtmalar: balansda bor, lekin 10 kunlik soat boshlanmagan */
    let inTransit = 0;
    /** O'shalardan qo'lga tegadigan summa — yetkazish haqi ham ayirilgan (kabinetdagi "Yechib olish uchun") */
    let transitPayout = 0;
    let transitOrders = 0;

    for (const o of orders) {
      const live = o.items.filter((i) => EFFECTIVE_STATUSES.includes(i.status));
      const full = round(live.reduce((sum, i) => sum + i.revenue - i.commission, 0));
      const rest = round(full - live.reduce((sum, i) => sum + i.withdrawn, 0));
      if (full <= 0) continue;

      /*
       * Faqat QABUL QILINGAN buyurtma soatni boshlaydi. `deliveredAt` —
       * kabinetdagi "Qabul sanasi"; u bo'sh bo'lsa tovar hali yo'lda.
       */
      if (!o.deliveredAt) {
        inTransit += Math.max(0, rest);
        transitPayout += Math.max(0, live.reduce((sum, i) => sum + i.payout - i.withdrawn, 0));
        transitOrders += 1;
        continue;
      }

      // Uzum to'liq yechib bergan — kalendarda "to'langan" bo'lib qoladi
      const paid = rest < 1;

      /*
       * Ochilish ANIQ SOAT bilan: qabul vaqti + 10 × 24 soat (live'da
       * `dateIssued` millisekundgacha aniq). Buyurtma holatiga tayanilmaydi:
       * demo generatori yetkazilganni darhol 'delivered' qiladi.
       */
      const unlockTs = o.deliveredAt.getTime() + holdMs;
      const isUnlocked = unlockTs <= nowTs;
      const hoursLeft = isUnlocked ? 0 : Math.ceil((unlockTs - nowTs) / 3_600_000);
      const daysLeft = Math.ceil(hoursLeft / 24);
      const acceptedAt = parseISODate(todayInBusinessTz(o.deliveredAt));
      const unlockAt = parseISODate(todayInBusinessTz(new Date(unlockTs)));

      /*
       * To'lov sanasi — ochilgan kundan KEYINGI birinchi jadval kuni: to'lov
       * 00:00 da o'tadi, kun ichida ochilgan pul unga ulgurmaydi. To'lanmay
       * qolgan eski pul esa eng yaqin kelgusi sanaga o'tadi.
       */
      const earliest = addDays(unlockAt, 1);
      const payoutAt = nextPayoutDate(!paid && earliest.getTime() < tomorrow.getTime() ? tomorrow : earliest, schedule);

      rows.push({
        uzumOrderId: o.uzumOrderId,
        title: o.items[0]?.title ?? '',
        acceptedAt: toISODate(acceptedAt),
        unlockAt: toISODate(unlockAt),
        payoutAt: toISODate(payoutAt),
        // To'lanmagan qismi; to'liq to'langan bo'lsa — buyurtmaning butun summasi
        amount: paid ? full : rest,
        unlocked: isUnlocked,
        daysLeft,
        hoursLeft,
        unlockTime: new Date(unlockTs).toISOString(),
        paid,
        coveredByFees: false,
      });
    }
    inTransit = round(inTransit);

    // Kunlar bo'yicha jamlash — kalendarda bir kun bitta qator
    const byDay = new Map<string, { amount: number; orders: number; paid: number; locked: number }>();
    for (const r of rows) {
      const cur = byDay.get(r.unlockAt) ?? { amount: 0, orders: 0, paid: 0, locked: 0 };
      cur.amount += r.amount;
      cur.orders += 1;
      if (r.paid) cur.paid += r.amount;
      if (!r.unlocked) cur.locked += 1;
      byDay.set(r.unlockAt, cur);
    }

    const days: PayoutDay[] = [...byDay.entries()]
      .map(([date, v]) => ({
        date,
        amount: round(v.amount),
        orders: v.orders,
        // Kun ochilgan — undagi barcha buyurtmalar soati to'lgan bo'lsa
        unlocked: v.locked === 0,
        // Shu kuni ochilgan pulning Uzum allaqachon yechib bergan qismi
        paid: round(v.paid),
      }))
      .sort((x, y) => x.date.localeCompare(y.date));

    const unpaid = rows.filter((r) => !r.paid);
    const unlockedGross = round(unpaid.filter((r) => r.unlocked).reduce((sum, r) => sum + r.amount, 0));
    /*
     * "Ochilgan" — hozir yechib olish mumkin bo'lgan pul, Uzum kabinetidagi
     * "…so'mni ertaroq yechib olish mumkin" bilan bir xil ma'noda: balansdan
     * hali ochilmagan buyurtmalar ayriladi. Xizmat to'lovlari (logistika,
     * reklama) va yechib olingan pul balansning o'zida ayrilgan.
     */
    const balance = await getUzumBalance(company.id, storeIds, range.storeId);
    const unlocked = balance.available;
    const pending = round(unpaid.filter((r) => !r.unlocked).reduce((sum, r) => sum + r.amount, 0));

    /*
     * XIZMAT TO'LOVLARIGA KETGAN BUYURTMALAR.
     *
     * Ochilgan buyurtmalar yig'indisi yechib olish mumkin bo'lgan puldan
     * katta bo'lsa, farqni Uzum xizmat to'lovlari (logistika, reklama) uchun
     * ushlagan. Uzum to'lovni eng eski buyurtmalarga yozgani kabi, bu farq
     * ham eng eski ochilgan buyurtmalardan boshlab yopiladi. Aks holda ular
     * abadiy "tayyor" bo'lib turardi va har safar keyingi to'lov sanasiga
     * ko'chib, uning buyurtmalar sonini shishirardi (07.10 dan keyin 15 ta
     * o'rniga 35 ta ko'rinardi).
     */
    const availableNow = balance.total - inTransit - pending;
    let toCover = Math.max(0, unlockedGross - Math.max(0, availableNow));
    for (const r of unpaid.filter((x) => x.unlocked).sort((x, y) => x.unlockTime.localeCompare(y.unlockTime))) {
      if (toCover < 1) break;
      if (r.amount <= toCover + 0.5) {
        toCover -= r.amount;
        r.coveredByFees = true;
      } else {
        // Qisman qoplangan buyurtmadan faqat qolgani kutiladi
        r.amount = round(r.amount - toCover);
        toCover = 0;
      }
    }
    /** Hali pul kelishi kutilayotgan buyurtmalar */
    const open = unpaid.filter((r) => !r.coveredByFees);

    /*
     * KELGUSI TO'LOVLAR. Har bir sana uchun:
     *
     *   o'sha kungacha yig'iladigan pul = balans − yo'ldagilar − shu sana va
     *                                     undan keyin ochiladigan buyurtmalar
     *
     * To'lov — shu yig'indidan oldingi sanalarda berilganini ayirgani.
     * Yig'indi manfiy bo'lsa (xizmat to'lovlari ochilgan puldan ko'p) to'lov 0
     * bo'ladi va qarz keyingi sanaga o'tadi — Uzum ham shunday ushlaydi.
     * Kamida uchta sana ko'rsatiladi: yaqin to'lov o'tgach ro'yxat o'zi suriladi.
     */
    const planDates: Date[] = [];
    const lastRowDate = open.reduce((max, r) => (r.payoutAt > max ? r.payoutAt : max), '');
    for (let d = nextPayoutDate(tomorrow, schedule); planDates.length < 8; d = nextPayoutDate(addDays(d, 1), schedule)) {
      if (planDates.length >= 3 && toISODate(d) > lastRowDate) break;
      planDates.push(d);
    }

    /*
     * Yo'ldagi buyurtmalar qabul qilinmaguncha qaysi to'lovga tushishi
     * noma'lum. Lekin sotuvchi ularni sotilgan deb ko'radi, jadvalda umuman
     * bo'lmasa "nega kam" degan savol tug'iladi. Shuning uchun ular qabul
     * muddati hali o'tmagan eng yaqin sanada SHARTLI ko'rsatiladi —
     * asosiy summaga qo'shilmaydi, chunki bekor bo'lishi ham mumkin.
     */
    const todayKey = toISODate(today);
    let transitShown = false;

    /*
     * Yo'ldagi buyurtmadan qancha kelishi yetkazish haqiga bog'liq, uni esa
     * Uzum qabul kuni ushlaydi. Oxirgi qabul qilingan buyurtmalarda u 0
     * bo'lgan bo'lsa (aksiya), yo'ldagilar uchun ham ayirilmaydi; birinchi
     * pullik yetkazish kelishi bilan taxmin o'zi nominal tarifga qaytadi.
     */
    const lastDelivery = await prisma.expense.findFirst({
      where: {
        storeId: { in: storeIds },
        source: 'uzum-payout',
        category: 'logistics',
        date: { gte: addDays(today, -14) },
      },
      orderBy: { date: 'desc' },
      select: { amount: true },
    });
    const deliveryFreeNow = lastDelivery !== null && Math.abs(lastDelivery.amount) < 1;

    let paidSoFar = 0;
    const planDays: PayoutPlanDay[] = planDates.map((d) => {
      const date = toISODate(d);
      const acceptedUntil = toISODate(addDays(d, -(holdDays + 1)));
      const takesTransit = !transitShown && transitOrders > 0 && acceptedUntil >= todayKey;
      if (takesTransit) transitShown = true;
      const mine = open.filter((r) => r.payoutAt === date);
      const gross = round(mine.reduce((sum, r) => sum + r.amount, 0));
      const lockedAfter = open.filter((r) => r.unlockAt >= date).reduce((sum, r) => sum + r.amount, 0);
      const collected = balance.total - inTransit - lockedAfter;
      const amount = Math.max(0, round(collected - paidSoFar));
      paidSoFar += amount;

      /*
       * Haq BITTA emas: jadval o'rtada almashsa, eski sana eski jadval,
       * keyingisi yangisi bo'yicha to'lanadi.
       */
      const rowMode = modeOn(d, schedule);
      const feePct = SCHEDULE_FEE[rowMode];
      return {
        date,
        amount,
        gross,
        deducted: Math.max(0, round(gross - amount)),
        orders: mine.length,
        mode: rowMode,
        feePct,
        // Jadval haqi ayirilgandan keyin qo'lga tegadigan summa
        net: round(amount * (1 - feePct / 100)),
        // Shu sanagacha qabul qilingan buyurtmalar kiradi (kabinetdagi "… gacha yig'ilgan pul")
        acceptedUntil,
        transitOrders: takesTransit ? transitOrders : 0,
        transitAmount: takesTransit ? round(deliveryFreeNow ? inTransit : transitPayout) : 0,
        // Qolgan kun SERVERDA sanaladi (brauzerda vaqt mintaqasi adashtiradi)
        daysLeft: Math.max(0, Math.round((d.getTime() - today.getTime()) / 86_400_000)),
      };
    });

    const next = days.find((d) => !d.unlocked);
    // Eng yaqin ochilishning aniq vaqti — kartada soati bilan ko'rsatiladi
    const nextAt =
      rows
        .filter((r) => !r.unlocked)
        .map((r) => r.unlockTime)
        .sort()[0] ?? null;

    // Uzum o'tkazgan to'lovlar — sinxron `withdrawnProfit` o'sishidan yozib boradi
    const history = await listPayoutHistory(storeIds);

    /*
     * Uzum hali o'tkazmagan butun summa. Qarzdorlik tekshiruvi aynan
     * shunga taqaladi: `unlocked` endi faqat navbatdagi to'lovni kutayotgan
     * pul, ya'ni har to'lov sanasidan keyingi kuni u nolga yaqinlashadi va
     * o'ttiz kunlik xarajat bilan solishtirilsa har safar yolg'on "qarz bor"
     * chiqardi.
     */
    const owed = round(unlockedGross + pending);

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
        earlyFeeFreeUntil: rules.earlyFeeFreeUntil,
        mode,
        scheduleFeePct,
        payoutDays,
        nextMode: rules.nextMode,
        nextFrom: rules.nextFrom,
        confirmed: rules.confirmed,
      },
      totals: {
        unlocked,
        paidOut: balance.withdrawn,
        pending,
        inTransit,
        charges,
        withdrawn: balance.withdrawn,
        balance: balance.total,
        nextDate: next?.date ?? null,
        nextAt,
        nextAmount: next?.amount ?? 0,
      },
      days,
      plan: planDays,
      history,
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
      earlyFeeFreeUntil: rules.earlyFeeFreeUntil,
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
