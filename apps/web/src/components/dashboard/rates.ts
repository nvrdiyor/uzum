import type { DashboardResponse, MetricValue } from '@savdoiq/shared';
import type { Tone } from '@/components/ui';

/*
 * Foiz ko'rsatkichlarning rangi — qiymatga qarab, bir sahifada bir xil
 * chegaralar bilan (halqa, kartochka chizig'i, jadvaldagi marja nishoni).
 *
 * Qizil (danger) faqat ZARAR uchun: manfiy marja/ROI. Ingichka, lekin
 * musbat marja — xavf (sariq), zarar emas. Chegaralar serverdagi tavsiyalar
 * bilan mos (analytics.ts buildInsights): marja 15% dan yuqori — "barqaror",
 * sotib olish 80% dan past — ogohlantirish, qaytarish 8% dan — jiddiy.
 * Ilgari halqa doim yashil edi va 0,8% marja ham "yaxshi" ko'rinardi.
 */
export function marginTone(v: number): Tone {
  if (v < 0) return 'danger';
  if (v < 15) return 'warn';
  return 'brand';
}

/** ROI ≈ marja ÷ tannarx ulushi: tannarx tushumning yarmi bo'lsa 15% marja ≈ 30% ROI */
export function roiTone(v: number): Tone {
  if (v < 0) return 'danger';
  if (v < 30) return 'warn';
  return 'brand';
}

export function buyoutTone(v: number): Tone {
  return v < 80 ? 'warn' : 'brand';
}

/** Qaytarish — kami yaxshi */
export function returnsTone(v: number): Tone {
  if (v >= 8) return 'danger';
  if (v >= 4) return 'warn';
  return 'brand';
}

/**
 * Foiz ko'rsatkich o'zgarishi FOIZ PUNKTIDA: joriy − oldingi.
 * Marja 20% dan 25% ga chiqsa bu "+5 p.p.", "+25%" emas — ilgari kartada
 * nisbiy o'zgarish (deltaPct) chiqib, sotuvchini adashtirardi.
 *
 * Oldingi davrda asos bo'lmasa (sotuv yo'q) server `previous: 0` qaytaradi —
 * bu "0% marja" emas, ma'lumot yo'qligi. Shunda null ("—"), o'zgarish
 * o'ylab topilmaydi.
 */
export function ppDelta(m: MetricValue, hasBase: boolean): number | null {
  if (!hasBase || m.previous === null || !Number.isFinite(m.previous)) return null;
  return Math.round((m.value - m.previous) * 10) / 10;
}

/** Har foiz ko'rsatkich uchun oldingi davr asosi bormi */
export function rateBases(data: DashboardResponse) {
  const prevRevenue = data.revenue.previous ?? 0;
  const prevOrders = data.ordersCount.previous ?? 0;
  const completed = prevOrders > 0 && (data.buyoutRate.previous ?? 0) > 0;
  return {
    margin: prevRevenue > 0,
    // Tannarx kiritilmagan davrda ROI asosi 0 — server 0 qaytaradi, foyda esa bor
    roi: prevRevenue > 0 && !(data.roi.previous === 0 && (data.netProfit.previous ?? 0) !== 0),
    buyout: completed,
    returns: completed,
  };
}
