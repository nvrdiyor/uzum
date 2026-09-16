/**
 * Obuna muddati haqida ogohlantirish.
 *
 * Ilgari sinov ham, pullik obuna ham JIMGINA tugardi: sotuvchi ertasi kuni
 * saytga kirib, bo'limlar yopilganini ko'rardi va nima bo'lganini tushunmasdi.
 *
 * Har bir chegara (3 kun, 1 kun, tugadi) uchun BITTA xabar yuboriladi.
 * Takrorlanmasligi `CompanySetting` dagi belgi bilan ta'minlanadi; belgi
 * tugash sanasini ham saqlaydi, shuning uchun obuna uzaytirilsa yangi
 * muddat uchun ogohlantirishlar qaytadan ishlaydi.
 */
import { prisma } from '@savdoiq/db';
import { formatDate, getPlan } from '@savdoiq/shared';
import { notifyCompanyOwners } from './notify.js';

/** Belgi shu kalitda saqlanadi */
const MARKER_KEY = 'billing:lastExpiryNotice';

/**
 * Ogohlantirish chegaralari — O'SISH tartibida.
 *
 * Tartib muhim: qolgan kunga MOS KELADIGAN ENG KICHIK chegara tanlanadi.
 * Kamayish tartibida qidirilsa, muddati tugagan obuna ham birinchi
 * chegaraga (3) tushib, "3 kun qoldi" xabarini olardi va "tugadi"
 * xabari hech qachon yuborilmasdi — belgi allaqachon qo'yilgan bo'lardi.
 */
const THRESHOLDS = [0, 1, 3] as const;

const DAY_MS = 24 * 60 * 60 * 1000;

function log(message: string): void {
  // eslint-disable-next-line no-console
  console.log(`[billing] ${message}`);
}

/** Bugundan tugash sanasigacha qolgan to'liq kunlar (o'tgan bo'lsa manfiy) */
function daysLeft(expiresAt: Date): number {
  return Math.floor((expiresAt.getTime() - Date.now()) / DAY_MS);
}

/** Shu holat uchun xabar matni */
function message(plan: string, left: number, expiresAt: Date): { title: string; body: string; type: string } {
  const name = getPlan(plan).name;
  const date = formatDate(expiresAt, 'uz');

  if (left <= 0) {
    return {
      type: 'danger',
      title: `${name} tarifi muddati tugadi`,
      body: `Bo‘limlar yopildi, lekin ma’lumotlaringiz saqlanib turibdi — tarifni uzaytirsangiz hammasi joyida qoladi.`,
    };
  }
  if (left === 1) {
    return {
      type: 'warning',
      title: 'Tarif ertaga tugaydi',
      body: `${name} tarifi ${date} da tugaydi. Uzaytirmasangiz tahlil bo‘limlari yopiladi.`,
    };
  }
  return {
    type: 'warning',
    title: `Tarif ${left} kundan keyin tugaydi`,
    body: `${name} tarifi ${date} gacha amal qiladi.`,
  };
}

/**
 * Tugash arafasidagi obunalarni tekshiradi va kerak bo'lsa xabar yuboradi.
 * Qaytaradi: yuborilgan xabarlar soni.
 */
export async function runExpiryAlerts(): Promise<number> {
  // Eng uzoq chegaradan keyin tugaydiganlar hali qiziqtirmaydi
  const maxThreshold = THRESHOLDS[THRESHOLDS.length - 1];
  const horizon = new Date(Date.now() + (maxThreshold + 1) * DAY_MS);

  const subs = await prisma.subscription.findMany({
    where: { status: 'active', canceledAt: null, expiresAt: { lt: horizon } },
    select: { companyId: true, plan: true, expiresAt: true },
  });
  if (subs.length === 0) return 0;

  const markers = await prisma.companySetting.findMany({
    where: { key: MARKER_KEY, companyId: { in: subs.map((s) => s.companyId) } },
    select: { companyId: true, value: true },
  });
  const seen = new Map(markers.map((m) => [m.companyId, m.value]));

  let sent = 0;

  for (const sub of subs) {
    const left = daysLeft(sub.expiresAt);
    // Qolgan kunga mos ENG KICHIK chegara (0 → 1 → 3)
    const threshold = THRESHOLDS.find((t) => left <= t);
    if (threshold === undefined) continue;

    /*
     * Belgi tugash sanasini ham o'z ichiga oladi. Obuna uzaytirilsa sana
     * o'zgaradi va yangi muddat uchun ogohlantirishlar qaytadan yuboriladi.
     */
    const marker = `${sub.expiresAt.toISOString()}:${threshold}`;
    if (seen.get(sub.companyId) === marker) continue;

    const m = message(sub.plan, left, sub.expiresAt);

    try {
      await notifyCompanyOwners(sub.companyId, {
        type: m.type,
        title: m.title,
        body: m.body,
        link: '/pricing',
        buttonText: 'Tarifni uzaytirish',
      });
      // Belgini faqat muvaffaqiyatdan keyin qo'yamiz
      await prisma.companySetting.upsert({
        where: { companyId_key: { companyId: sub.companyId, key: MARKER_KEY } },
        create: { companyId: sub.companyId, key: MARKER_KEY, value: marker },
        update: { value: marker },
      });
      sent += 1;
    } catch (err) {
      log(`${sub.companyId}: ogohlantirish yuborilmadi — ${err instanceof Error ? err.message : err}`);
    }
  }

  return sent;
}
