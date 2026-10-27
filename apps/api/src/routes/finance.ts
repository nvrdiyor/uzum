/**
 * Moliya moduli — /api/v1/finance
 *
 *  GET    /                  → FinanceResponse (tushum, xarajatlar, kunlik seriya, balans)
 *  GET    /pnl               → foyda va zarar (P&L) jadvali, oldingi davr bilan taqqoslov,
 *                               va o'sha raqamlardan pul oqimi (tushum → hisobga tushadi → sof foyda)
 *  GET    /expenses          → qo'lda kiritilgan xarajatlar ro'yxati
 *  POST   /expenses          → yangi xarajat
 *  PATCH  /expenses/:id      → xarajatni tahrirlash
 *  DELETE /expenses/:id      → xarajatni o'chirish
 *  GET    /expenses/summary  → kategoriya va oy kesimida jamlanma
 *
 * Ma'lumot bo'lmasa ham barcha marshrutlar 200 va nol qiymatlar qaytaradi.
 */
import { Router } from 'express';
import { prisma } from '@savdoiq/db';
import {
  deltaPct,
  expenseSchema,
  formatMoney,
  parseISODate,
  pct,
  round,
  toISODate,
  addDays,
  businessDayStart,
  type ExpenseCategory,
  type FinanceResponse,
  type Paginated,
  type Period,
} from '@savdoiq/shared';
import { AppError, ah } from '../lib/errors.js';
import { companyCtx, requireAuth, requireCompany, requireFeature, requireRole } from '../lib/auth.js';
import { paginate, resolveRange, type DateBasis } from '../lib/period.js';
import { getExpenses, getStoreIds, getStoreTitles } from '../services/common.js';
import { comparablePeriod, getNetDailySeries, getPreviousNetSeries, type NetDailyPoint } from '../services/pnl.js';
import { lineDateWhere } from '../services/sale-basis.js';
import { getUzumBalance } from '../services/balance.js';
import { getPayoutRules, nextPayoutFromToday } from '../services/payout-schedule.js';

const router = Router();
router.use(requireAuth, requireCompany);

// ─────────────────────────── Yordamchilar ───────────────────────────

/** Xarajat kategoriyalari — javoblarda doimo shu tartibda */
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

const MONTHS_UZ = [
  'Yanvar',
  'Fevral',
  'Mart',
  'Aprel',
  'May',
  'Iyun',
  'Iyul',
  'Avgust',
  'Sentabr',
  'Oktabr',
  'Noyabr',
  'Dekabr',
];

const emptyCategories = (): Record<ExpenseCategory, number> => ({
  commission: 0,
  logistics: 0,
  marketing: 0,
  storage: 0,
  tax: 0,
  salary: 0,
  other: 0,
});

/** Oy kaliti (2026-09) → o'zbekcha yorliq */
function monthLabel(key: string): string {
  const year = Number(key.slice(0, 4));
  const idx = Number(key.slice(5, 7)) - 1;
  const name = MONTHS_UZ[idx] ?? key;
  return Number.isFinite(year) ? `${name} ${year}` : key;
}

/** Sanani (YYYY-MM-DD) tekshirib Date'ga aylantiradi */
function parseDay(value: string): Date {
  const d = parseISODate(value);
  if (Number.isNaN(d.getTime())) throw AppError.badRequest('Sana noto‘g‘ri formatda (YYYY-MM-DD)');
  return d;
}

/** Do'kon shu kompaniyaga tegishliligini tekshiradi */
async function resolveStoreId(companyId: string, storeId?: string): Promise<string | null> {
  if (!storeId) return null;
  const store = await prisma.store.findFirst({ where: { id: storeId, companyId }, select: { id: true } });
  if (!store) throw AppError.badRequest('Do‘kon topilmadi');
  return store.id;
}

/** Davr uchun pullik saqlash (ombor) xarajati */
async function storageAmount(storeIds: string[], from: Date, toExclusive: Date): Promise<number> {
  const agg = await prisma.storageFee.aggregate({
    _sum: { amount: true },
    where: { storeId: { in: storeIds }, date: { gte: from, lt: toExclusive } },
  });
  return agg._sum.amount ?? 0;
}

/**
 * Davrdagi UZUM reklamasi — Uzum'dan import qilingan `marketing` satrlari
 * (`source: 'uzum'`, importer.ts upsertExpenses: "Buyurtmalarni ko'paytirish"
 * va boshqa pullik targ'ibot). Doira getExpenses (services/common.ts) bilan
 * AYNAN bir xil — kompaniya, savdo kunlari, do'kon filtri — shuning uchun
 * "qo'lda kiritilgan reklama" jami reklamadan ayirib topiladi va ikkalasining
 * yig'indisi P&L'dagi "Marketing" qatoriga har doim teng chiqadi.
 */
async function uzumAdSpend(companyId: string, period: Period, storeId?: string): Promise<number> {
  const agg = await prisma.expense.aggregate({
    _sum: { amount: true },
    where: {
      companyId,
      category: 'marketing',
      source: 'uzum',
      date: { gte: businessDayStart(period.from), lt: addDays(businessDayStart(period.to), 1) },
      ...(storeId ? { storeId } : {}),
    },
  });
  return agg._sum.amount ?? 0;
}

/**
 * Davrdagi "tirik" pozitsiyalar yig'indisi — Boshqaruv paneli (analytics.ts
 * collectTotals) va Oylik hisobot (services/monthly-report.ts) bilan AYNAN
 * bir xil qoida: bekor qilingan va qaytgan pozitsiyalar kirmaydi, SKU'siz
 * pozitsiyalar KIRADI.
 *
 * Ilgari bu yerda aggregateSales (SKU kesimi) olinardi: SKU'si topilmagan
 * pozitsiyalar tushib qolardi, soliq esa "tushum × joriy stavka" deb
 * hisoblanardi. Stavka Sozlamalarda o'zgargach eski pozitsiyalarda boshqa
 * stavka bilan ayrilgan soliq turadi — Moliyadagi sof foyda paneldagidan
 * farq qilardi. Endi soliq har pozitsiyadan AYNAN qancha ayrilgan bo'lsa
 * shuncha: netProfit = to'lov − tannarx − qo'shimcha − soliq (importer.ts,
 * item-cost.ts) (2026-10-24).
 *
 * `basis` — pozitsiya davrga qaysi sana bilan tushadi (services/sale-basis.ts):
 * 'order' da avvalgi shartning o'zi, 'receipt' da xaridor qabul qilgan kun.
 * Qaysi pozitsiya pulga kirmasligi (bekor, qaytgan) ikkala rejimda AYNAN shu
 * pastdagi qoida (2026-10-27).
 */
async function sumLiveLines(storeIds: string[], from: Date, toExclusive: Date, basis: DateBasis = 'order') {
  const t = { revenue: 0, payout: 0, cogs: 0, units: 0, commission: 0, logistics: 0, otherCost: 0, tax: 0 };
  if (storeIds.length === 0) return t;
  const items = await prisma.orderItem.findMany({
    where: lineDateWhere(storeIds, from, toExclusive, basis),
    select: {
      qty: true,
      revenue: true,
      payout: true,
      purchasePrice: true,
      commission: true,
      logistics: true,
      otherCost: true,
      netProfit: true,
      status: true,
      returnedAt: true,
    },
  });
  for (const it of items) {
    if (it.status === 'canceled' || it.status === 'returned' || it.returnedAt) continue;
    const cogs = it.purchasePrice * it.qty;
    t.revenue += it.revenue;
    t.payout += it.payout;
    t.cogs += cogs;
    t.units += it.qty;
    t.commission += it.commission;
    t.logistics += it.logistics;
    t.otherCost += it.otherCost;
    t.tax += it.payout - cogs - it.otherCost - it.netProfit;
  }
  return t;
}

interface FinanceSnapshot {
  revenue: number;
  payout: number;
  cogs: number;
  units: number;
  grossProfit: number;
  netProfit: number;
  operatingProfit: number;
  periodExpenses: number;
  taxAmount: number;
  expensesTotal: number;
  /** Kategoriya kesimidagi xarajatlar (platforma + qo'lda kiritilgan) */
  categories: Record<ExpenseCategory, number>;
  /** Sotilgan tovarga tegishli xarajatlar — sof foydadan ayrilgan */
  item: { commission: number; delivery: number; other: number; tax: number };
  /** Davrga tegishli xarajatlar — davr foydasidan ayriladi */
  periodCosts: {
    logistics: number;
    marketing: number;
    storage: number;
    salary: number;
    other: number;
    /** Qo'lda kiritilgan komissiya va soliq — donutdagi kategoriyaga mos qatorlar */
    manualCommission: number;
    manualTax: number;
  };
}

/**
 * Davr bo'yicha moliyaviy kesim.
 * Komissiya/logistika/soliq/boshqa xarajatlar buyurtma satrlaridan (sumLiveLines),
 * ombor — StorageFee'dan, qolgani esa qo'lda kiritilgan Expense yozuvlaridan olinadi.
 *
 * Sana asosi (`basis`) faqat buyurtma satrlariga ta'sir qiladi: qo'lda
 * kiritilgan xarajat va saqlash to'lovi ikkala rejimda ham o'z sanasida.
 */
async function collectFinance(
  companyId: string,
  storeIds: string[],
  period: Period,
  storeId?: string,
  basis: DateBasis = 'order',
): Promise<FinanceSnapshot> {
  const from = businessDayStart(period.from);
  const toExclusive = addDays(businessDayStart(period.to), 1);

  const [lines, manual, storage] = await Promise.all([
    sumLiveLines(storeIds, from, toExclusive, basis),
    getExpenses(companyId, from, toExclusive, storeId),
    storageAmount(storeIds, from, toExclusive),
  ]);

  const { revenue, payout, cogs, units, commission, logistics, otherCost } = lines;
  const taxAmount = lines.tax;

  const categories: Record<ExpenseCategory, number> = {
    commission: commission + manual.commission,
    logistics: logistics + manual.logistics,
    marketing: manual.marketing,
    storage: storage + manual.storage,
    tax: taxAmount + manual.tax,
    salary: manual.salary,
    other: otherCost + manual.other,
  };

  const expensesTotal = CATEGORY_ORDER.reduce((s, c) => s + categories[c], 0);
  const grossProfit = revenue - cogs;

  /**
   * Ikki xil foyda — atamalar butun saytda bir xil ma'noda (services/pnl.ts):
   *
   *  netProfit       — TOVARLAR BO'YICHA foyda: komissiya, mijozga yetkazish va
   *                    soliq ayirilgan, davr xarajatlari hali ayirilmagan.
   *                    Boshqaruv panelidagi `itemProfit` bilan bir xil.
   *  operatingProfit — SOF FOYDA: undan davr xarajatlari (omborga logistika,
   *                    reklama, saqlash, ish haqi) ham ayirilgan. Boshqaruv paneli
   *                    va Oylik hisobotdagi "Sof foyda" aynan shu.
   */
  const itemExpenses = commission + logistics + otherCost + taxAmount;
  const netProfit = revenue - cogs - itemExpenses;
  const periodExpenses = expensesTotal - itemExpenses;
  const operatingProfit = netProfit - periodExpenses;

  return {
    revenue,
    payout,
    cogs,
    units,
    grossProfit,
    netProfit,
    operatingProfit,
    periodExpenses,
    taxAmount,
    expensesTotal,
    categories,
    item: { commission, delivery: logistics, other: otherCost, tax: taxAmount },
    periodCosts: {
      logistics: manual.logistics,
      marketing: manual.marketing,
      storage: storage + manual.storage,
      salary: manual.salary,
      other: manual.other,
      manualCommission: manual.commission,
      manualTax: manual.tax,
    },
  };
}

// ─────────────────────────── GET / — umumiy moliya ───────────────────────────

router.get(
  '/',
  requireFeature('unit_economics'),
  ah(async (req, res) => {
    const { company, plan } = companyCtx(req);
    const range = resolveRange(req, plan);
    const storeIds = await getStoreIds(company.id, range.storeId);

    const snap = await collectFinance(company.id, storeIds, range.period, range.storeId, range.basis);

    /*
     * Kunlik seriya: buyurtmalardan kelgan foydadan davr xarajatlari (qo'lda
     * kiritilgan, ombor to'lovi) kunma-kun ayriladi — shunda profit = revenue −
     * expenses bo'ladi. Boshqaruv paneli grafigi bilan BITTA funksiya
     * (services/pnl.ts): `uzum-payout` satrlari buyurtmada allaqachon ayrilgan,
     * ikki marta ushlanmaydi; oylik xarajat oy kunlariga bo'linadi.
     *
     * Grafik va uzuq chiziq ham sana asosida (`?basis=`): qabul sanasi rejimida
     * kunlar yig'indisi yuqoridagi kartochkalarga teng qolsin. "Balans"
     * plitkalari (to'langan / kutilmoqda) esa ATAYLAB o'zgarmaydi: ular foyda
     * emas, Uzum bilan hisob-kitob holati — buyurtma holati bo'yicha.
     */
    const [series, previous, paidAgg, pendingAgg, uzumBalance] = await Promise.all([
      getNetDailySeries(company.id, storeIds, range.period, range.storeId, range.basis),
      // Oldingi teng davr — grafikdagi uzuq chiziq; tarix yetmasa null
      getPreviousNetSeries(company.id, storeIds, range.previous, plan, range.storeId, range.basis),
      prisma.orderItem.aggregate({
        _sum: { payout: true },
        where: {
          orderedAt: { gte: range.from, lt: range.toExclusive },
          status: { notIn: ['canceled', 'returned'] },
          order: { storeId: { in: storeIds }, status: 'delivered' },
        },
      }),
      prisma.orderItem.aggregate({
        _sum: { payout: true },
        where: {
          orderedAt: { gte: range.from, lt: range.toExclusive },
          status: { notIn: ['canceled', 'returned'] },
          order: { storeId: { in: storeIds }, status: { in: ['new', 'processing'] } },
        },
      }),
      // "Umumiy balans" — hisob boshidan beri, yechib olingan pul ayirilgan (services/balance.ts)
      getUzumBalance(company.id, storeIds, range.storeId),
    ]);

    // To'lov jadvali — Pul kalendari bilan BIR XIL manbadan
    const payoutRules = await getPayoutRules(company.id);

    /**
     * Soliq `orderItem.netProfit` ichida ALLAQACHON ayrilgan (importer.ts),
     * shuning uchun bu yerda qayta qo'shilmaydi — ilgari kunlik grafik
     * yuqoridagi "Sof foyda" kartasidan soliq summasi qadar past chiqardi.
     */
    const toDaily = (row: NetDailyPoint) => ({
      date: row.date,
      revenue: round(row.revenue),
      expenses: round(row.revenue - row.profit),
      profit: row.profit,
    });
    const daily = series.map(toDaily);

    const payload: FinanceResponse = {
      period: range.period,
      revenue: round(snap.revenue),
      payout: round(snap.payout),
      cogs: round(snap.cogs),
      grossProfit: round(snap.grossProfit),
      netProfit: round(snap.netProfit),
      operatingProfit: round(snap.operatingProfit),
      periodExpenses: round(snap.periodExpenses),
      expenses: CATEGORY_ORDER.map((category) => ({
        category,
        amount: round(snap.categories[category]),
        share: pct(snap.categories[category], snap.expensesTotal),
      })),
      expensesTotal: round(snap.expensesTotal),
      taxAmount: round(snap.taxAmount),
      daily,
      // Oldingi teng davr, `daily` bilan kunma-kun tekislangan (i-kun ↔ i-kun)
      previousDaily: previous ? previous.series.map(toDaily) : null,
      comparePeriod: previous?.period ?? null,
      balance: {
        paidOut: round(paidAgg._sum.payout ?? 0),
        pending: round(pendingAgg._sum.payout ?? 0),
        total: uzumBalance.total,
        nextPayoutAt: nextPayoutFromToday(payoutRules.schedule),
        payoutConfirmed: payoutRules.confirmed,
      },
    };

    res.json(payload);
  }),
);

// ─────────────────────────── GET /pnl — foyda va zarar ───────────────────────────

interface PnlLine {
  id: string;
  label: string;
  /** 'income' — tushum, 'cost' — xarajat, 'total' — yakuniy natija */
  kind: 'income' | 'cost' | 'subtotal' | 'total';
  amount: number;
  /** Oldingi teng davr; u saqlangan tarixdan tashqarida bo'lsa null (comparePeriod) */
  previous: number | null;
  deltaPct: number | null;
  /** tushumga nisbatan ulush, % */
  share: number;
}

interface PnlResponse {
  period: Period;
  previous: Period;
  /** Taqqoslanadigan oldingi davr; saqlangan tarix yetmasa null — qatorlarda `previous` ham null */
  comparePeriod: Period | null;
  currency: string;
  lines: PnlLine[];
  /** Pul oqimi: tushum → hisobga tushadi → sof foyda (qarang: FLOW). `lines` bilan bir manbadan */
  waterfall: WaterfallStep[];
  totals: {
    revenue: number;
    cogs: number;
    grossProfit: number;
    grossMargin: number;
    expensesTotal: number;
    netProfit: number;
    margin: number;
    previousNetProfit: number | null;
    netProfitDeltaPct: number | null;
  };
}

/**
 * Pul oqimi (sharshara) qadami — Moliya sahifasidagi "Tushum → Hisobga
 * tushadi → Sof foyda" grafigi uchun.
 *
 * P&L jadvali (`lines`) buxgalteriya tartibida o'qiladi (yalpi foyda,
 * tovarlar bo'yicha foyda...). Sotuvchining savoli esa boshqa: "1 so'm
 * tushumdan Uzum qanchasini ushlaydi, hisobimga qancha tushadi va undan
 * keyin qo'limda nima qoladi?". Sharshara AYNAN o'sha raqamlarni
 * (collectFinance) pul haqiqatda oqadigan tartibda beradi — yangi hisob yo'q.
 */
interface WaterfallStep {
  id: string;
  /** 'start' — tushum, 'minus' — ayriladigan modda, 'subtotal' — hisobga tushadigan pul, 'end' — sof foyda */
  kind: 'start' | 'minus' | 'subtotal' | 'end';
  label: string;
  /** start/subtotal/end — shu nuqtadagi summa; minus — ayrilgan summa (manfiy bo'lsa — qaytib tushgan pul) */
  amount: number;
  /** Oldingi teng davr; u saqlangan tarixdan tashqarida bo'lsa null (comparePeriod) */
  previous: number | null;
  deltaPct: number | null;
  /** tushumga nisbatan ulush, % */
  share: number;
}

interface FlowInput {
  snap: FinanceSnapshot;
  /** Uzum'dan kelgan reklama to'lovlari (uzumAdSpend) */
  uzumAds: number;
}

type FlowDef =
  | { id: string; kind: 'minus'; label: string; amount: (x: FlowInput) => number }
  | { id: string; kind: 'start' | 'subtotal' | 'end'; label: string };

/**
 * Sharshara tartibi — pul qanday oqsa, shunday.
 *
 * "Hisobga tushadi" = tushum − Uzum komissiyasi − mijozga yetkazish. Bu GET /
 * dagi `payout` ("To‘lovga") bilan BIR XIL son: importer.ts har pozitsiyada
 * `payout = tushum − komissiya − logistika` tenglamasini saqlaydi (Uzum
 * raqamlari zid kelsa, komissiyani qoldiq qilib qayta hisoblaydi), ikkalasi
 * ham bir xil pozitsiyalardan (bekor/qaytarilganlarsiz) yig'iladi. Farq
 * faqat bitta holatda chiqishi mumkin: Uzum bergan raqamlar shunchalik zid
 * bo'lsaki, qoldiq mantiqsiz (manfiy yoki tushumdan katta) chiqib, importer
 * Uzum komissiyasini o'zgarishsiz qoldirgan pozitsiyada. U holda ham
 * sharshara P&L arifmetikasida qoladi — yakuni aynan davr foydasi bo'lsin.
 *
 * "Qo‘shimcha xarajat" (`itemOther`) ATAYLAB oraliq natijadan KEYIN turadi.
 * P&L'da u "sotuvdagi boshqa ushlanmalar" yonida, lekin bu Uzum ushlanmasi
 * emas: Tannarx sahifasida har dona uchun kiritilgan sotuvchining o'z
 * xarajati (qadoq, bojxona — Sku.extraCost × dona, importer.ts). Uzum uni
 * to'lovdan ayirmaydi; oldin qo'yilsa, "Hisobga tushadi" Uzum haqiqatda
 * o'tkazadigan puldan shuncha kam chiqib, yolg'on bo'lardi.
 *
 * Reklama manbaga qarab ikkiga bo'linadi: Uzum hisobdan yechgani va sotuvchi
 * o'zi kiritgani (Telegram, Instagram, bloger...). Qo'lda kiritilgan
 * komissiya va soliq ham — P&L'dagi kabi — alohida qadam: ular to'lovdan
 * emas, davr xarajati sifatida ayriladi.
 */
const FLOW: FlowDef[] = [
  { id: 'revenue', kind: 'start', label: 'Tushum' },
  { id: 'commission', kind: 'minus', label: 'Uzum komissiyasi', amount: (x) => x.snap.item.commission },
  { id: 'delivery', kind: 'minus', label: 'Mijozga yetkazish', amount: (x) => x.snap.item.delivery },
  { id: 'payout', kind: 'subtotal', label: 'Hisobga tushadi' },
  { id: 'cogs', kind: 'minus', label: 'Tannarx', amount: (x) => x.snap.cogs },
  { id: 'itemOther', kind: 'minus', label: 'Qo‘shimcha xarajat (har dona uchun)', amount: (x) => x.snap.item.other },
  { id: 'tax', kind: 'minus', label: 'Soliq', amount: (x) => x.snap.item.tax },
  { id: 'manualTax', kind: 'minus', label: 'Soliq (qo‘lda kiritilgan)', amount: (x) => x.snap.periodCosts.manualTax },
  { id: 'marketingUzum', kind: 'minus', label: 'Reklama (Uzum)', amount: (x) => x.uzumAds },
  {
    id: 'marketingManual',
    kind: 'minus',
    label: 'Reklama (qo‘lda kiritilgan)',
    amount: (x) => x.snap.periodCosts.marketing - x.uzumAds,
  },
  { id: 'storage', kind: 'minus', label: 'Saqlash', amount: (x) => x.snap.periodCosts.storage },
  { id: 'logistics', kind: 'minus', label: 'Omborga logistika', amount: (x) => x.snap.periodCosts.logistics },
  { id: 'salary', kind: 'minus', label: 'Ish haqi', amount: (x) => x.snap.periodCosts.salary },
  {
    id: 'manualCommission',
    kind: 'minus',
    label: 'Komissiya (qo‘lda kiritilgan)',
    amount: (x) => x.snap.periodCosts.manualCommission,
  },
  { id: 'other', kind: 'minus', label: 'Boshqa xarajatlar', amount: (x) => x.snap.periodCosts.other },
  { id: 'operatingProfit', kind: 'end', label: 'Sof foyda' },
];

/**
 * Bir davr uchun har qadam summasi, butun so'mda.
 *
 * Har modda P&L qatoridek yaxlitlanadi (round), tushum va sof foyda esa
 * AYNAN P&L'dagi son (`revenue`, `operatingProfit` qatorlari — totals.netProfit,
 * Boshqaruv panelidagi sof foyda). Oraliq natija va yakun ayirmalardan
 * yig'iladi, shuning uchun grafik har doim "tushum − hammasi = sof foyda"
 * ga yopiladi.
 *
 * Kasr summalarda (soliq = tushum × stavka, tiyinli qo'lda kiritilgan
 * xarajat) alohida yaxlitlangan moddalar yig'indisi bir-ikki so'mga adashishi
 * mumkin — masalan, ikkita "x,5" ikkalasi ham yuqoriga yaxlitlanganda.
 * Kumulyativ yaxlitlash (services/pnl.ts getPeriodCostsByDay kabi) bu yerga
 * ATAYLAB olinmadi: u ham yopiladi, lekin 12,25% stavkali sinovda "Soliq"
 * jadvaldagidan 1 so'm kam, "Boshqa" 1 so'm ko'p chiqdi (2026-10-24) — bitta
 * sahifada bir modda ikki xil son bo'lardi. Shuning uchun farq faqat yopilmay
 * qolganda va faqat "Hisobga tushadi"dan KEYINGI qadamlarda tuzatiladi (kasr
 * manbalari o'sha yerda; oldingisiga tegilsa, oraliq natija o'z qoldig'iga
 * teng bo'lmay qolardi): yaxlitlashda eng ko'p "yo'qotgan" qadamga ±1 so'm,
 * qolgan hamma son jadval bilan bir xil.
 */
function flowAmounts(x: FlowInput): Map<string, number> {
  const out = new Map<string, number>();
  const raw = new Map<string, number>();
  for (const def of FLOW) {
    if (def.kind !== 'minus') continue;
    const v = def.amount(x);
    raw.set(def.id, v);
    out.set(def.id, round(v));
  }

  const start = round(x.snap.revenue);
  const end = round(x.snap.operatingProfit);
  let drift = start - [...out.values()].reduce((s, v) => s + v, 0) - end;
  if (drift !== 0) {
    const step = Math.sign(drift);
    // drift > 0 — yana ayirish kerak: pastga eng ko'p yaxlitlangani +1; drift < 0 — aksincha
    const lost = (id: string) => step * ((raw.get(id) ?? 0) - (out.get(id) ?? 0));
    const candidates = FLOW.slice(FLOW.findIndex((d) => d.kind === 'subtotal') + 1)
      // Nol modda tuzatishdan "1 so'm" bo'lib paydo bo'lmasin
      .filter((d) => d.kind === 'minus' && raw.get(d.id) !== 0)
      .map((d) => d.id)
      .sort((a, b) => lost(b) - lost(a));
    for (const id of candidates) {
      if (drift === 0) break;
      out.set(id, (out.get(id) ?? 0) + step);
      drift -= step;
    }
    // Kutilmagan katta farq yoki nomzod yo'q — qolgani birinchi xarajat qadamiga
    if (drift !== 0) {
      const fallback = candidates[0] ?? 'cogs';
      out.set(fallback, (out.get(fallback) ?? 0) + drift);
    }
  }

  let left = start;
  for (const def of FLOW) {
    if (def.kind === 'minus') left -= out.get(def.id) ?? 0;
    else out.set(def.id, left);
  }
  return out;
}

router.get(
  '/pnl',
  requireFeature('unit_economics'),
  ah(async (req, res) => {
    const { company, plan } = companyCtx(req);
    const range = resolveRange(req, plan);
    const storeIds = await getStoreIds(company.id, range.storeId);

    const [cur, prev, comparable, curAds, prevAds] = await Promise.all([
      // Joriy va taqqoslash davri BITTA sana asosida (`?basis=`) — aralashsa yo'q o'sish chiqardi
      collectFinance(company.id, storeIds, range.period, range.storeId, range.basis),
      collectFinance(company.id, storeIds, range.previous, range.storeId, range.basis),
      /*
       * Boshqaruv paneli va grafikdagi uzuq chiziq bilan bitta qoida: oldingi
       * davr saqlangan tarixdan tashqarida bo'lsa (tarif chegarasi, birinchi
       * sinxron) — "oldin" ham, o'zgarish ham yo'q. Ilgari yangi do'konda
       * qisman oyna bilan solishtirilib, "+302%" kabi yolg'on o'sish chiqardi.
       */
      comparablePeriod(storeIds, range.previous, plan),
      // Sharshara reklamani manbaga qarab ikkiga bo'ladi (FLOW)
      uzumAdSpend(company.id, range.period, range.storeId),
      uzumAdSpend(company.id, range.previous, range.storeId),
    ]);

    const line = (
      id: string,
      label: string,
      kind: PnlLine['kind'],
      amount: number,
      previous: number,
    ): PnlLine => ({
      id,
      label,
      kind,
      amount: round(amount),
      previous: comparable ? round(previous) : null,
      deltaPct: comparable ? deltaPct(round(amount), round(previous)) : null,
      share: pct(amount, cur.revenue),
    });

    /**
     * Hisobot qatorma-qator qo'shilib boradi — foydalanuvchi har bir raqam
     * qayerdan chiqqanini ko'radi:
     *
     *   Tushum − Tannarx = Yalpi foyda
     *   Yalpi foyda − (komissiya + yetkazish + soliq + boshqa) = Sof foyda
     *   Sof foyda − davr xarajatlari = Davr foydasi
     */
    const lines: PnlLine[] = [
      line('revenue', 'Tushum', 'income', cur.revenue, prev.revenue),
      line('cogs', 'Tannarx', 'cost', cur.cogs, prev.cogs),
      line('grossProfit', 'Yalpi foyda', 'subtotal', cur.grossProfit, prev.grossProfit),

      line('commission', CATEGORY_LABEL.commission, 'cost', cur.item.commission, prev.item.commission),
      line('delivery', 'Mijozga yetkazish', 'cost', cur.item.delivery, prev.item.delivery),
      line('tax', CATEGORY_LABEL.tax, 'cost', cur.item.tax, prev.item.tax),
      line('itemOther', 'Sotuvdagi boshqa ushlanmalar', 'cost', cur.item.other, prev.item.other),
      line('netProfit', 'Sof foyda (tovarlar bo‘yicha)', 'subtotal', cur.netProfit, prev.netProfit),

      line('logistics', 'Omborga logistika', 'cost', cur.periodCosts.logistics, prev.periodCosts.logistics),
      line('marketing', CATEGORY_LABEL.marketing, 'cost', cur.periodCosts.marketing, prev.periodCosts.marketing),
      line('storage', CATEGORY_LABEL.storage, 'cost', cur.periodCosts.storage, prev.periodCosts.storage),
      line('salary', CATEGORY_LABEL.salary, 'cost', cur.periodCosts.salary, prev.periodCosts.salary),
      line(
        'manualCommission',
        'Komissiya (qo‘lda kiritilgan)',
        'cost',
        cur.periodCosts.manualCommission,
        prev.periodCosts.manualCommission,
      ),
      line('manualTax', 'Soliq (qo‘lda kiritilgan)', 'cost', cur.periodCosts.manualTax, prev.periodCosts.manualTax),
      line('other', 'Boshqa xarajatlar', 'cost', cur.periodCosts.other, prev.periodCosts.other),
      line('operatingProfit', 'Davr foydasi', 'total', cur.operatingProfit, prev.operatingProfit),
    ];

    /*
     * Pul oqimi — o'sha ikki kesimdan (cur/prev), FLOW tartibida. Nolga teng
     * ayirma qadami tashlab yuboriladi (grafikda bo'sh ustun bo'lib turardi);
     * tushum, hisobga tushadigan pul va sof foyda esa har doim bor. Oldingi
     * davr — `lines` dagi kabi faqat taqqoslab bo'lsa.
     */
    const curFlow = flowAmounts({ snap: cur, uzumAds: curAds });
    const prevFlow = flowAmounts({ snap: prev, uzumAds: prevAds });
    const waterfall: WaterfallStep[] = FLOW.map((def) => {
      const amount = curFlow.get(def.id) ?? 0;
      const previous = prevFlow.get(def.id) ?? 0;
      return {
        id: def.id,
        kind: def.kind,
        label: def.label,
        amount,
        previous: comparable ? previous : null,
        deltaPct: comparable ? deltaPct(amount, previous) : null,
        share: pct(amount, cur.revenue),
      };
    }).filter((step) => step.kind !== 'minus' || step.amount !== 0);

    const payload: PnlResponse = {
      period: range.period,
      previous: range.previous,
      comparePeriod: comparable,
      currency: company.currency,
      lines,
      waterfall,
      totals: {
        revenue: round(cur.revenue),
        cogs: round(cur.cogs),
        grossProfit: round(cur.grossProfit),
        grossMargin: pct(cur.grossProfit, cur.revenue),
        expensesTotal: round(cur.expensesTotal),
        // Sof foyda — HAMMA xarajatdan keyin: tushum − tannarx − jami xarajat (yuqoridagi uch qator bilan yopiladi)
        netProfit: round(cur.operatingProfit),
        margin: pct(cur.operatingProfit, cur.revenue),
        previousNetProfit: comparable ? round(prev.operatingProfit) : null,
        netProfitDeltaPct: comparable ? deltaPct(round(cur.operatingProfit), round(prev.operatingProfit)) : null,
      },
    };

    res.json(payload);
  }),
);

// ─────────────────────────── Xarajatlar (qo'lda kiritiladigan) ───────────────────────────

interface ExpenseRow {
  id: string;
  date: string;
  category: ExpenseCategory;
  label: string;
  amount: number;
  storeId: string | null;
  storeTitle: string | null;
  note: string | null;
  source: string;
  createdAt: string;
}

interface ExpenseListResponse {
  period: Period;
  total: number;
  byCategory: { category: ExpenseCategory; label: string; amount: number; share: number }[];
  rows: Paginated<ExpenseRow>;
}

interface ExpenseSummaryResponse {
  period: Period;
  total: number;
  byCategory: { category: ExpenseCategory; label: string; amount: number; share: number; count: number }[];
  byMonth: {
    month: string;
    label: string;
    total: number;
    categories: { category: ExpenseCategory; amount: number }[];
  }[];
}

interface DbExpense {
  id: string;
  date: Date;
  category: string;
  amount: number;
  storeId: string | null;
  note: string | null;
  source: string;
  createdAt: Date;
}

/** Kategoriya nomini xavfsiz aniqlash (bazada notanish qiymat bo'lsa 'other') */
function toCategory(value: string): ExpenseCategory {
  return (CATEGORY_ORDER as string[]).includes(value) ? (value as ExpenseCategory) : 'other';
}

function toExpenseRow(e: DbExpense, storeTitles: Map<string, string>): ExpenseRow {
  const category = toCategory(e.category);
  return {
    id: e.id,
    date: toISODate(e.date),
    category,
    label: CATEGORY_LABEL[category],
    amount: round(e.amount),
    storeId: e.storeId,
    storeTitle: e.storeId ? (storeTitles.get(e.storeId) ?? null) : null,
    note: e.note,
    source: e.source,
    createdAt: e.createdAt.toISOString(),
  };
}

/** GET /expenses/summary — kategoriya va oy bo'yicha jamlanma */
router.get(
  '/expenses/summary',
  requireFeature('expenses'),
  ah(async (req, res) => {
    const { company, plan } = companyCtx(req);
    const range = resolveRange(req, plan);

    const rows = await prisma.expense.findMany({
      where: {
        companyId: company.id,
        date: { gte: range.from, lt: range.toExclusive },
        // Buyurtma satrlarida hisoblangan yetkazish to'lovlari ro'yxatga kirmaydi
        source: { not: 'uzum-payout' },
        ...(range.storeId ? { storeId: range.storeId } : {}),
      },
      select: { date: true, category: true, amount: true },
    });

    const byCat = emptyCategories();
    const countByCat = emptyCategories();
    const byMonth = new Map<string, Record<ExpenseCategory, number>>();
    let total = 0;

    for (const r of rows) {
      const category = toCategory(r.category);
      byCat[category] += r.amount;
      countByCat[category] += 1;
      total += r.amount;

      const key = toISODate(r.date).slice(0, 7);
      const m = byMonth.get(key) ?? emptyCategories();
      m[category] += r.amount;
      byMonth.set(key, m);
    }

    const payload: ExpenseSummaryResponse = {
      period: range.period,
      total: round(total),
      byCategory: CATEGORY_ORDER.map((category) => ({
        category,
        label: CATEGORY_LABEL[category],
        amount: round(byCat[category]),
        share: pct(byCat[category], total),
        count: countByCat[category],
      })),
      byMonth: [...byMonth.entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([month, cats]) => ({
          month,
          label: monthLabel(month),
          total: round(CATEGORY_ORDER.reduce((s, c) => s + cats[c], 0)),
          categories: CATEGORY_ORDER.map((category) => ({ category, amount: round(cats[category]) })),
        })),
    };

    res.json(payload);
  }),
);

/** GET /expenses — ro'yxat (sahifalangan) */
router.get(
  '/expenses',
  requireFeature('expenses'),
  ah(async (req, res) => {
    const { company, plan } = companyCtx(req);
    const range = resolveRange(req, plan);
    const q = req.query as Record<string, string | undefined>;
    const category = q.category && (CATEGORY_ORDER as string[]).includes(q.category) ? q.category : undefined;

    const [rows, storeTitles] = await Promise.all([
      prisma.expense.findMany({
        where: {
          companyId: company.id,
          date: { gte: range.from, lt: range.toExclusive },
          // Buyurtma satrlarida hisoblangan yetkazish to'lovlari ro'yxatga kirmaydi
          source: { not: 'uzum-payout' },
          ...(range.storeId ? { storeId: range.storeId } : {}),
          ...(category ? { category } : {}),
          ...(range.search ? { note: { contains: range.search } } : {}),
        },
        orderBy: { date: range.order === 'asc' ? 'asc' : 'desc' },
      }),
      getStoreTitles(company.id),
    ]);

    const byCat = emptyCategories();
    let total = 0;
    for (const r of rows) {
      byCat[toCategory(r.category)] += r.amount;
      total += r.amount;
    }

    const items = rows.map((r) => toExpenseRow(r, storeTitles));

    const payload: ExpenseListResponse = {
      period: range.period,
      total: round(total),
      byCategory: CATEGORY_ORDER.map((cat) => ({
        category: cat,
        label: CATEGORY_LABEL[cat],
        amount: round(byCat[cat]),
        share: pct(byCat[cat], total),
      })),
      rows: paginate(items, range.page, range.pageSize),
    };

    res.json(payload);
  }),
);

/** POST /expenses — yangi xarajat */
router.post(
  '/expenses',
  requireFeature('expenses'),
  requireRole('owner', 'manager'),
  ah(async (req, res) => {
    const { company } = companyCtx(req);
    const input = expenseSchema.parse(req.body);
    const storeId = await resolveStoreId(company.id, input.storeId);

    const created = await prisma.expense.create({
      data: {
        companyId: company.id,
        storeId,
        date: parseDay(input.date),
        category: input.category,
        amount: input.amount,
        note: input.note ?? null,
        source: 'manual',
      },
    });

    const storeTitles = await getStoreTitles(company.id);
    res.status(201).json(toExpenseRow(created, storeTitles));
  }),
);

/** PATCH /expenses/:id — tahrirlash */
router.patch(
  '/expenses/:id',
  requireFeature('expenses'),
  requireRole('owner', 'manager'),
  ah(async (req, res) => {
    const { company } = companyCtx(req);
    const id = req.params.id;
    const existing = await prisma.expense.findFirst({ where: { id, companyId: company.id }, select: { id: true } });
    if (!existing) throw AppError.notFound('Xarajat topilmadi');

    const input = expenseSchema.partial().parse(req.body);
    const storeId = input.storeId === undefined ? undefined : await resolveStoreId(company.id, input.storeId);

    const updated = await prisma.expense.update({
      where: { id: existing.id },
      data: {
        ...(input.date !== undefined ? { date: parseDay(input.date) } : {}),
        ...(input.category !== undefined ? { category: input.category } : {}),
        ...(input.amount !== undefined ? { amount: input.amount } : {}),
        ...(input.note !== undefined ? { note: input.note } : {}),
        ...(storeId !== undefined ? { storeId } : {}),
      },
    });

    const storeTitles = await getStoreTitles(company.id);
    res.json(toExpenseRow(updated, storeTitles));
  }),
);

/** DELETE /expenses/:id — o'chirish */
router.delete(
  '/expenses/:id',
  requireFeature('expenses'),
  requireRole('owner', 'manager'),
  ah(async (req, res) => {
    const { company } = companyCtx(req);
    const id = req.params.id;
    const existing = await prisma.expense.findFirst({
      where: { id, companyId: company.id },
      select: { id: true, amount: true },
    });
    if (!existing) throw AppError.notFound('Xarajat topilmadi');

    await prisma.expense.delete({ where: { id: existing.id } });
    res.json({ ok: true, id: existing.id, message: `${formatMoney(existing.amount, 'uz')} xarajat o‘chirildi` });
  }),
);

export default router;
