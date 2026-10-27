/**
 * Botdagi hisobot raqamlari — saytdagi Boshqaruv paneli bilan AYNAN bir xil
 * ta'rif (tushum, buyurtma, dona, o'rtacha chek va davr xarajatlaridan keyingi
 * sof foyda).
 *
 * NEGA bu yerda nusxa: bot API kodini import qila olmaydi (arxitektura
 * qoidasi), shuning uchun API'dagi sof mantiq shu faylga ko'chirilgan. Bazaga
 * murojaat yo'q — so'rovlar handlers/data.ts da, bu yerda faqat hisob.
 *
 * Manbalar (o'zgarsa, shu fayl ham birga o'zgarishi SHART):
 *   • davr chegaralari va tarif bo'yicha kesish — apps/api/src/lib/period.ts `resolveRange`;
 *   • pozitsiya va buyurtma yig'indisi        — apps/api/src/routes/analytics.ts `collectTotals`;
 *   • davr xarajatlari                         — apps/api/src/services/pnl.ts `getPeriodCosts`
 *                                                (+ services/common.ts `getExpenses`);
 *   • KPI'lar (yaxlitlash, o'rtacha chek)      — analytics.ts GET /dashboard (`metric`, `curNet`).
 *
 * Ilgari bot o'z qoidasini ishlatardi: pozitsiyani o'z `orderedAt` i bo'yicha
 * kesardi va buyurtmani "tirik pozitsiyasi bor" deb sanardi, panel esa
 * buyurtma sanasi va holati bo'yicha. Bir kunning ikki xil buyurtma soni va
 * o'rtacha cheki chiqardi (2026-10-27). scratchpad p6-bot e2e ikkalasini
 * har davr uchun solishtiradi.
 */
import {
  EXPENSE_CATEGORIES,
  addDays,
  businessDayStart,
  getPlan,
  parseISODate,
  presetPeriod,
  round,
  safeDiv,
  toBusinessDate,
  type Period,
  type PresetRange,
} from '@savdoiq/shared';

// ─────────────────────────── Davr ───────────────────────────

/** Bot hisobotining davrlari — tugmalar va callback ma'lumoti shu nomlar bilan */
export type ReportPeriod = 'today' | 'yesterday' | 'month' | 'year';

export const REPORT_PERIODS: readonly ReportPeriod[] = ['today', 'yesterday', 'month', 'year'] as const;

export function isReportPeriod(v: unknown): v is ReportPeriod {
  return typeof v === 'string' && (REPORT_PERIODS as readonly string[]).includes(v);
}

/** Saytdagi davr tanlagichning o'sha presetlari (shared `presetPeriod`) */
const PRESET: Record<ReportPeriod, PresetRange> = {
  today: 'today',
  yesterday: 'yesterday',
  month: 'thisMonth',
  year: 'thisYear',
};

export interface ReportRange {
  kind: ReportPeriod;
  /** Kalendar sanalari (savdo kuni, Asia/Tashkent), tarif chegarasida kesilgan */
  period: Period;
  /** Savdo kuni boshi — `orderedAt >= from` */
  from: Date;
  /** Oxirgi kundan keyingi savdo kuni boshi — `orderedAt < toExclusive` */
  toExclusive: Date;
  /** Tarif tarixi yetmagani uchun davr boshi surildimi */
  clamped: boolean;
  /** Tarifdagi tarix chuqurligi (kun) — kesilganda sotuvchiga aytiladi */
  historyDays: number;
}

/**
 * Davr chegaralari — API `resolveRange` ning aynan nusxasi: preset, so'ng
 * tarif tarixidan (`historyDays`) oldingi qism kesiladi. Kesish shart: sinov
 * tarifida "Shu yil" sayt 60 kun bilan hisoblaydi — bot 1-yanvardan
 * hisoblasa, ikki joyda ikki xil yillik raqam chiqardi (2026-10-27).
 */
export function resolveReportPeriod(kind: ReportPeriod, plan: string | null | undefined, now = new Date()): ReportRange {
  let period = presetPeriod(PRESET[kind], now);

  const historyDays = getPlan(plan).limits.historyDays;
  const earliest = addDays(now, -historyDays);
  let clamped = false;
  if (parseISODate(period.from).getTime() < earliest.getTime()) {
    period = { from: toBusinessDate(earliest), to: period.to };
    clamped = true;
  }

  return {
    kind,
    period,
    from: businessDayStart(period.from),
    toExclusive: addDays(businessDayStart(period.to), 1),
    clamped,
    historyDays,
  };
}

// ─────────────────────────── Pozitsiyalar yig'indisi ───────────────────────────

export interface KpiLine {
  qty: number;
  revenue: number;
  netProfit: number;
  status: string;
  returnedAt: Date | null;
}

export interface KpiOrder {
  status: string;
  items: KpiLine[];
}

/**
 * Pozitsiya tushum va foydaga kiradimi — collectTotals'dagi
 * `!returned && it.status !== 'canceled'` (returned = status 'returned' yoki `returnedAt` bor).
 */
export function isLiveLine(it: Pick<KpiLine, 'status' | 'returnedAt'>): boolean {
  const returned = it.status === 'returned' || Boolean(it.returnedAt);
  return !returned && it.status !== 'canceled';
}

export interface LineTotals {
  revenue: number;
  /** Tovarlar bo'yicha foyda — davr xarajatlari hali ayrilmagan */
  netProfit: number;
  units: number;
  /** Bekor qilinmagan va qaytarilmagan buyurtmalar (panel `ordersActive`) */
  ordersActive: number;
}

/**
 * collectTotals'ning panel KPI'lari uchun kerakli qismi. Buyurtmalar
 * BUYURTMA sanasi bo'yicha olinadi (so'rov data.ts da), buyurtma soni —
 * buyurtma HOLATI bo'yicha: pozitsiyalarining hammasi qaytgan, lekin o'zi
 * hali 'processing' bo'lgan buyurtma ham sanaladi — panel ham shunday sanaydi.
 */
export function sumLineTotals(orders: KpiOrder[]): LineTotals {
  const t: LineTotals = { revenue: 0, netProfit: 0, units: 0, ordersActive: 0 };
  for (const o of orders) {
    if (o.status !== 'canceled' && o.status !== 'returned') t.ordersActive += 1;
    for (const it of o.items) {
      if (!isLiveLine(it)) continue;
      t.units += it.qty;
      t.revenue += it.revenue;
      t.netProfit += it.netProfit;
    }
  }
  return t;
}

// ─────────────────────────── Davr xarajatlari ───────────────────────────

const KNOWN_CATEGORIES = new Set<string>(EXPENSE_CATEGORIES.map((c) => c.id));

/**
 * Davr xarajatlari jami — getPeriodCosts().total. Kiruvchi satrlar allaqachon
 * `source != 'uzum-payout'` bilan olingan (ular pozitsiyada ayrilgan).
 *
 * Faqat ma'lum toifalar: getExpenses noma'lum toifani alohida kalitga
 * yig'adi, getPeriodCosts esa yettita toifani oladi — ya'ni noma'lum toifa
 * panel foydasidan ayrilmaydi. Bot ham ayirmaydi, aks holda raqamlar ajralardi.
 */
export function periodCostsTotal(expenses: Array<{ category: string; amount: number }>, storageFees: number): number {
  let total = storageFees;
  for (const e of expenses) {
    if (KNOWN_CATEGORIES.has(e.category)) total += e.amount;
  }
  return total;
}

// ─────────────────────────── Panel KPI'lari ───────────────────────────

export interface DashboardKpis {
  revenue: number;
  /** Panel `ordersCount` */
  orders: number;
  /** Panel `unitsSold` */
  units: number;
  avgCheck: number;
  /** Davr xarajatlaridan keyingi sof foyda (panel `netProfit`) */
  netProfit: number;
}

/** GET /dashboard: `metric()` (shared `round`), `safeDiv(revenue, ordersActive)`, `cur.netProfit − costs.total` */
export function dashboardKpis(t: LineTotals, costsTotal: number): DashboardKpis {
  return {
    revenue: round(t.revenue),
    orders: t.ordersActive,
    units: round(t.units),
    avgCheck: round(safeDiv(t.revenue, t.ordersActive)),
    netProfit: round(t.netProfit - costsTotal),
  };
}
