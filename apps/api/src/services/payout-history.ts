/**
 * To'lovlar tarixi — Uzum sotuvchiga haqiqatda o'tkazgan pul.
 *
 * NEGA O'ZIMIZ YURITAMIZ. Uzumning ochiq API'sida to'lovlar ro'yxati yo'q
 * (kabinetdagi "To'lovlar tarixi" faqat saytda). Moliyaviy pozitsiyada
 * faqat `withdrawnProfit` keladi — shu pozitsiyadan hozirgacha yechib
 * berilgan JAMI summa, sanasiz. Jonli do'konda tekshirildi: erta yechish ham
 * (27.09, 136 000), jadval bo'yicha to'lov ham (07.10, 511 130) aynan shu
 * maydonni oshiradi.
 *
 * Shuning uchun har sinxrondan keyin yig'indi solishtiriladi: u oshgan
 * bo'lsa, farq — yangi to'lov. Sinxron ~13 daqiqada bir yuradi, ya'ni
 * to'lov 00:00 da o'tsa, yozuv shu kunning o'zida paydo bo'ladi.
 */
import { prisma } from '@savdoiq/db';
import { addDays, round, toISODate, type PayoutHistoryRow } from '@savdoiq/shared';
import { businessToday, getPayoutRules, nextPayoutDate } from './payout-schedule.js';

/** Sinxron shuncha kun kechiksa ham jadval to'lovi o'z sanasiga yoziladi */
const SCHEDULED_GRACE_DAYS = 2;
const HISTORY_LIMIT = 60;

/** Do'kon bo'yicha yechib olingan jami summa oshgan bo'lsa — yangi to'lovni yozadi */
export async function recordPayout(companyId: string, storeId: string, now = new Date()): Promise<void> {
  const [items, recorded, last] = await Promise.all([
    prisma.orderItem.aggregate({
      _sum: { withdrawn: true },
      // Balans bilan bir xil to'plam: bekor qilingan va qaytgan pozitsiyalar kirmaydi
      where: { status: { notIn: ['canceled', 'returned'] }, order: { storeId } },
    }),
    prisma.payoutRecord.aggregate({ _sum: { amount: true }, _count: { _all: true }, where: { storeId } }),
    prisma.payoutRecord.findFirst({ where: { storeId }, orderBy: { date: 'desc' }, select: { date: true } }),
  ]);

  const delta = round((items._sum.withdrawn ?? 0) - (recorded._sum.amount ?? 0));
  // Kamayish (to'langan pozitsiya keyin qaytgan) — tarixni o'zgartirmaydi
  if (delta < 1) return;

  const today = businessToday(now);

  /*
   * Birinchi yozuv: tarix shu paytgacha yuritilmagan, yig'indi nechta
   * to'lovdan iboratligini bilib bo'lmaydi — bitta "oldingi to'lovlar"
   * qatori bo'lib yoziladi, uydirma sanalar qo'yilmaydi.
   */
  if (recorded._count._all === 0) {
    await prisma.payoutRecord.create({ data: { storeId, date: today, amount: delta, kind: 'earlier' } });
    return;
  }

  const rules = await getPayoutRules(companyId, now);

  // Bugun yoki yaqin kunlarda jadval kuni bo'lganmi — bo'lsa, bu o'sha to'lov
  let scheduledOn: Date | null = null;
  for (let back = 0; back <= SCHEDULED_GRACE_DAYS; back += 1) {
    const day = addDays(today, -back);
    if (nextPayoutDate(day, rules.schedule).getTime() === day.getTime()) {
      scheduledOn = day;
      break;
    }
  }
  // O'sha jadval kuni uchun yozuv allaqachon bor — demak bu alohida, erta yechish
  const alreadyRecorded = Boolean(scheduledOn && last && last.date.getTime() >= scheduledOn.getTime());

  if (scheduledOn && !alreadyRecorded) {
    await prisma.payoutRecord.create({ data: { storeId, date: scheduledOn, amount: delta, kind: 'scheduled' } });
    return;
  }

  /*
   * Erta yechish: pozitsiyalarga haqdan KEYINGI summa yoziladi (136 000
   * so'ralganda 132 600), haq esa xizmat to'lovi bo'lib keladi.
   */
  const pct = Math.min(99, Math.max(0, rules.earlyFeePct));
  const fee = round(delta / (1 - pct / 100) - delta);
  await prisma.payoutRecord.create({ data: { storeId, date: today, amount: delta, fee, kind: 'early' } });
}

/** Oxirgi to'lovlar — eng yangisi birinchi */
export async function listPayoutHistory(storeIds: string[]): Promise<PayoutHistoryRow[]> {
  if (storeIds.length === 0) return [];
  const rows = await prisma.payoutRecord.findMany({
    where: { storeId: { in: storeIds } },
    orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
    take: HISTORY_LIMIT,
    select: { date: true, amount: true, fee: true, kind: true },
  });
  return rows.map((r) => ({
    date: toISODate(r.date),
    amount: round(r.amount),
    fee: round(r.fee),
    kind: r.kind === 'early' || r.kind === 'earlier' ? r.kind : 'scheduled',
  }));
}
