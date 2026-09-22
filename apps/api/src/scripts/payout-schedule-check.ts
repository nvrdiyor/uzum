/**
 * To'lov jadvali mantig'ini tekshiradi — kelajakdagi o'zgarish bilan.
 *
 *   npx tsx apps/api/src/scripts/payout-schedule-check.ts
 *
 * Nima uchun kerak: Uzum jadvalni darhol emas, belgilangan sanadan
 * almashtiradi ("08.10.2026 dan amal qiladi"). Ya'ni bitta ro'yxatda
 * eski va yangi jadval yonma-yon turadi va ularning haqi ham har xil.
 * Bu skript o'sha chegarani qo'lda emas, hisob bilan tekshiradi.
 *
 * Bazaga tegmaydi.
 */
import { SCHEDULE_FEE, type PayoutMode } from '@savdoiq/shared';
import {
  asPayoutMode,
  businessToday,
  fixedSchedule,
  isPayoutMode,
  modeOn,
  nextPayoutDate,
  nextPayoutFromToday,
  type Schedule,
} from '../services/payout-schedule.js';

const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const iso = (x: Date) => x.toISOString().slice(0, 10);

let failed = 0;

function check(label: string, actual: string, expected: string): void {
  const ok = actual === expected;
  if (!ok) failed += 1;
  console.log(`  ${ok ? '✓' : '✗'} ${label}: ${actual}${ok ? '' : ` (kutilgan ${expected})`}`);
}

/** Sotuvchining haqiqiy holati: 2 haftalik → 08.10.2026 dan haftalik */
const switching: Schedule = {
  mode: 'biweekly',
  nextMode: 'weekly',
  nextFrom: d('2026-10-08'),
};

console.log('── O‘zgarishsiz jadval ──');
check('biweekly, 27-sen ochildi', iso(nextPayoutDate(d('2026-09-27'), fixedSchedule('biweekly'))), '2026-10-07');
check('biweekly, 7-okt ochildi', iso(nextPayoutDate(d('2026-10-07'), fixedSchedule('biweekly'))), '2026-10-07');
check('biweekly, 8-okt ochildi', iso(nextPayoutDate(d('2026-10-08'), fixedSchedule('biweekly'))), '2026-10-21');
check('monthly, 8-okt ochildi', iso(nextPayoutDate(d('2026-10-08'), fixedSchedule('monthly'))), '2026-11-07');
check('weekly, 22-dek ochildi', iso(nextPayoutDate(d('2026-12-22'), fixedSchedule('weekly'))), '2026-12-28');
// Yakshanba — dam olish kuni, dushanbaga suriladi
check('daily, 4-okt (yakshanba)', iso(nextPayoutDate(d('2026-10-04'), fixedSchedule('daily'))), '2026-10-05');

console.log('\n── 08.10.2026 dan haftalikka o‘tish ──');
// Chegaragacha eski jadval ishlaydi
check('27-sen ochildi → eski jadval', iso(nextPayoutDate(d('2026-09-27'), switching)), '2026-10-07');
check('7-okt ochildi → hali eski', iso(nextPayoutDate(d('2026-10-07'), switching)), '2026-10-07');
// Chegaradan keyin yangisi: 8-okt 7,14,21,28 ro'yxatida yo'q → 14-okt
check('8-okt ochildi → yangi jadval', iso(nextPayoutDate(d('2026-10-08'), switching)), '2026-10-14');
check('15-okt ochildi → yangi jadval', iso(nextPayoutDate(d('2026-10-15'), switching)), '2026-10-21');
check('22-okt ochildi → yangi jadval', iso(nextPayoutDate(d('2026-10-22'), switching)), '2026-10-28');

console.log('\n── Har bir to‘lov kuni o‘z haqi bilan ──');
const rowFee = (day: string): string => {
  const mode: PayoutMode = modeOn(d(day), switching);
  return `${mode} ${SCHEDULE_FEE[mode]}%`;
};
check('7-okt', rowFee('2026-10-07'), 'biweekly 0%');
check('14-okt', rowFee('2026-10-14'), 'weekly 1%');
check('21-okt', rowFee('2026-10-21'), 'weekly 1%');

/*
 * Chegara kuni almashish: o'tish sanasining O'ZIDA yangi jadval ishlashi
 * kerak ("08.10.2026 DAN amal qiladi"), bir kun oldin — hali eskisi.
 */
console.log('\n── Chegara kuni ──');
check('7-okt rejimi', modeOn(d('2026-10-07'), switching), 'biweekly');
check('8-okt rejimi', modeOn(d('2026-10-08'), switching), 'weekly');

/*
 * Rejim nomi ro'yxat bo'yicha tekshiriladi, `in` bilan emas.
 * `'constructor' in SCHEDULE_DAYS` rost bo'lgani uchun bunday qiymat
 * bazaga tushib, keyin `SCHEDULE_DAYS[mode].includes(...)` da funksiyaga
 * aylanib butun Pul kalendari va Moliyani 500 ga olib borardi.
 */
console.log('\n── Rejim nomini tekshirish ──');
for (const junk of ['constructor', '__proto__', 'toString', 'valueOf', 'yearly', '']) {
  check(`«${junk}» rad etiladi`, String(isPayoutMode(junk)), 'false');
}
for (const good of ['daily', 'weekly', 'biweekly', 'monthly']) {
  check(`«${good}» qabul qilinadi`, String(isPayoutMode(good)), 'true');
}
check('asPayoutMode(«constructor»)', asPayoutMode('constructor'), 'biweekly');
// Zaharlangan qiymat endi hisobni yiqitmaydi
check(
  'buzuq rejim bilan hisob ishlaydi',
  iso(nextPayoutDate(d('2026-10-08'), fixedSchedule(asPayoutMode('constructor')))),
  '2026-10-21',
);

/*
 * Bugungi kun Toshkent bo'yicha. UTC kuni ishlatilganda jadval
 * o'zgarishi besh soat kechikardi: Toshkentda 8-oktyabr kirgan,
 * server esa hamon 7-oktyabrda turgan bo'lardi.
 */
console.log('\n── Bugungi kun (Asia/Tashkent) ──');
check('08.10 02:00 Toshkent', iso(businessToday(new Date('2026-10-07T21:00:00Z'))), '2026-10-08');
check('07.10 23:00 Toshkent', iso(businessToday(new Date('2026-10-07T18:00:00Z'))), '2026-10-07');
check(
  'o‘zgarish o‘sha tunda kuchga kiradi',
  modeOn(businessToday(new Date('2026-10-07T21:00:00Z')), switching),
  'weekly',
);

/*
 * To'lov kunining O'ZIDA Moliya ham "bugun" deyishi kerak. Ilgari u
 * ertadan boshlab qidirardi va Pul kalendari "bugun tushadi" deganda
 * Moliya keyingi sanani ko'rsatib, ikkovi zid tushardi.
 */
console.log('\n── To‘lov kunining o‘zi ──');
check(
  '7-okt, biweekly → bugun',
  nextPayoutFromToday(fixedSchedule('biweekly'), new Date('2026-10-07T09:00:00Z')),
  '2026-10-07',
);
check(
  '8-okt, biweekly → 21-okt',
  nextPayoutFromToday(fixedSchedule('biweekly'), new Date('2026-10-08T09:00:00Z')),
  '2026-10-21',
);

console.log(failed === 0 ? '\nHammasi to‘g‘ri.' : `\n${failed} ta tekshiruv o‘tmadi.`);
process.exitCode = failed === 0 ? 0 : 1;
