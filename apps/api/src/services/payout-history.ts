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
 * bo'lsa, farq — yangi to'lov. Sinxron kunduzi har 30–60 daqiqada, kechasi
 * 03:00 va 06:00 da yuradi, ya'ni to'lov 00:00 da o'tsa, yozuv shu kunning
 * o'zida paydo bo'ladi.
 *
 * HAQ. `withdrawnProfit` hisobingizga TUSHGAN summani ko'rsatadi, Uzum
 * kabineti esa to'lovni haqi bilan birga: 14.11 da 1 210 900 = 1 198 791 +
 * 12 109 (har hafta 1%), 09.11 da 800 000 = 780 000 + 20 000 (shoshilinch
 * 2,5%). Haq Uzum xarajatlarida alohida satr (`payout_fee`) bo'lib keladi —
 * u to'lovga `attachPayoutFees` bilan biriktiriladi, tarix esa kabinetdagi
 * raqamni (amount + fee) ko'rsatadi. `amount` hech qachon brutto emas: yangi
 * to'lov aynan Σ withdrawn − Σ amount farqidan topiladi.
 */
import { prisma } from '@savdoiq/db';
import {
  DEFAULT_EARLY_FEE_PCT,
  addDays,
  parseISODate,
  payoutFeeKind,
  round,
  splitByWeight,
  toISODate,
  type PayoutFeeKind,
  type PayoutHistoryRow,
} from '@savdoiq/shared';
import { businessToday, getPayoutRules, nextPayoutDate } from './payout-schedule.js';

/** Sinxron shuncha kun kechiksa ham jadval to'lovi o'z sanasiga yoziladi */
const SCHEDULED_GRACE_DAYS = 2;
const HISTORY_LIMIT = 60;
const DAY_MS = 86_400_000;

/**
 * Do'kon bo'yicha yechib olingan jami summa oshgan bo'lsa — yangi to'lovni yozadi.
 * Haq bu yerda yozilmaydi: uning satri to'lovdan keyingi sinxronda kelishi
 * mumkin, shuning uchun uni `attachPayoutFees` har sinxronda bazadan ulaydi.
 */
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
   * so'ralganda 132 600). Haq 0 bilan yoziladi — `attachPayoutFees` uni
   * xarajatlardagi "Shoshilinch yechib olish" satridan qo'yadi.
   */
  await prisma.payoutRecord.create({ data: { storeId, date: today, amount: delta, kind: 'early' } });
}

// ─────────────────────────── Haqni biriktirish ───────────────────────────

/**
 * Haq satri to'lov kunidan (Toshkent) necha kun farq qilishi mumkin, qaysi farq kutiladi.
 *
 * Jadval to'lovi Toshkentda 00:00 da o'tadi, ya'ni UTC bo'yicha oldingi kun
 * 19:00 da — Uzum haqni shu UTC sana bilan yozadi (27.10, 06.11, 13.11 satrlari
 * 28.10, 07.11, 14.11 to'lovlariniki). Erta yechish kunduzi — haq o'sha kuni.
 *
 * Satr yozuvdan KEYIN bo'lmaydi (max 0): yozuv sanasi — sinxron yechishni
 * ko'rgan Toshkent kuni, satr sanasi — yechish paytining UTC kuni, u esa
 * Toshkent kunidan oldin yoki teng. +1 ruxsat etilsa, keyingi kunning haqi
 * vaqtincha oldingi yozuvga ulanib, keyin ikkalasida qolib ketardi.
 *
 * Erta yechishda kutilgan farq yozuv QACHON yaratilganiga bog'liq: sinxron uni
 * Toshkentda tunda (00:00–05:00 — UTC hali oldingi kun) ko'rgan bo'lsa, yechish
 * ham, haq satri ham oldingi UTC kunida — kutilgan −1; kunduzi ko'rgan bo'lsa 0.
 * Shunda ketma-ket tunlardagi yechishlar har biri o'z haqini oladi (aks holda
 * keyingi tunning haqini olardi), bir kundagi tungi va kunduzgi yechish esa
 * alohida guruh — har biri o'z satrini oladi.
 *
 * Bir UTC kunidagi ikki erta yechishning haqini Uzum bitta satrga yozadi,
 * yozuvlar esa ikki guruhda bo'lishi mumkin (kunduzgi va ertasi tungi, yoki
 * 03:00 va 06:00 sinxronlari). Shuning uchun juftsiz qolgan erta guruh band
 * satrga qo'shiladi — satr ikkalasining summasiga (2,5%) yolg'iz to'lovnikidan
 * yaxshiroq mos kelsa (matchPayoutFees, EARLY_FEE_K).
 */
const FEE_WINDOW: Record<PayoutFeeKind, { min: number; max: number; expected: number }> = {
  scheduled: { min: -2, max: 0, expected: -1 },
  early: { min: -2, max: 0, expected: 0 },
};
/** Tunda (UTC sanasi hali oldingi kun) yaratilgan erta yechish yozuvida kutilgan farq */
const EARLY_NIGHT_EXPECTED = -1;
/**
 * Erta yechish haqi — yechib olingan (brutto) summaning qat'iy foizi: haq =
 * net × p / (1 − p). Faqat bitta satrni bir yoki ikki to'lovga solishtirish
 * uchun (qaysi gipoteza aniqroq) — foiz biroz boshqa bo'lsa ham to'g'ri tanlaydi.
 */
const EARLY_FEE_K = DEFAULT_EARLY_FEE_PCT / (100 - DEFAULT_EARLY_FEE_PCT);

export interface FeeRecordInput {
  id: string;
  /** To'lov kuni, YYYY-MM-DD (Toshkent) */
  date: string;
  kind: PayoutFeeKind;
  /** Hisobga tushgan summa (net) — bir kundagi bir nechta yozuv orasida haqni bo'lish uchun */
  amount: number;
  /** Yozuv yaratilgan payt — erta yechishda tungi yozuvni ajratadi (bo'lmasa kunduzgi deb olinadi) */
  createdAt?: Date;
}

/** Erta yechish yozuvi Toshkentda tunda yaratilgan: yaratilish paytining UTC sanasi to'lov kunidan oldin */
const isNightEarly = (r: FeeRecordInput): boolean =>
  r.kind === 'early' && r.createdAt instanceof Date && toISODate(r.createdAt) < r.date;

export interface FeeLineInput {
  /** Uzum xarajat satri sanasi, YYYY-MM-DD (UTC) */
  date: string;
  kind: PayoutFeeKind;
  amount: number;
}

const dayNumber = (iso: string): number => Math.round(parseISODate(iso).getTime() / DAY_MS);

/** Bitta haq satri va uni olgan to'lov(lar) — odatda bitta guruh, erta yechishda bir nechta bo'lishi mumkin */
export interface FeeMatch {
  /** To'lov kuni (Toshkent; bir nechta guruh bo'lsa — birinchisiniki) va turi */
  date: string;
  kind: PayoutFeeKind;
  /** Haq satri(lari) sanasi (UTC) */
  lineDate: string;
  fee: number;
  /** Satrni olgan yozuvlarning hisobga tushgan summasi (net) */
  net: number;
  /** Guruh yozuvlari: id → haqdan ulush (yig'indi = fee) */
  shares: Map<string, number>;
}

/**
 * Haq satrlarini to'lovlarga juftlaydi (sof funksiya — test qilinadi).
 *
 *  • Yozuvlar (sana, tur; erta yechishda tungi/kunduzgi) bo'yicha guruh:
 *    bitta to'lov bir nechta do'kon yozuviga bo'lingan bo'lishi mumkin; haq
 *    ular orasida summaga qarab bo'linadi (yig'indi aynan haqqa teng).
 *  • Faqat bir xil tur; farq FEE_WINDOW ichida. Eng kutilgan farq birinchi,
 *    teng bo'lsa — keyingi to'lov (13.11 dagi haq 14.11 to'loviniki, 13.11
 *    dagi erta yechishniki emas).
 *  • Har guruh bitta haq satriga; satr odatda bitta guruhga. Erta yechishda
 *    juftsiz guruh band satrni bo'lishishi mumkin — satr ikkalasining summasiga
 *    yaxshiroq mos kelsa (bir UTC kunidagi ikki yechish haqi bitta satrda).
 *  • Manfiy yoki nol satr (qaytarilgan haq) — o'tkaziladi.
 * Juftsiz to'lovlar natijada yo'q. Ko'chirish skripti ham shuni ishlatadi:
 * qaysi haq qaysi to'lovga tushishini va uning foizini ko'rsatadi.
 */
export function matchPayoutFees(records: FeeRecordInput[], lines: FeeLineInput[]): FeeMatch[] {
  const groups = new Map<
    string,
    { date: string; kind: PayoutFeeKind; expected: number; members: FeeRecordInput[] }
  >();
  for (const r of records) {
    const night = isNightEarly(r);
    const key = `${r.date}|${r.kind}${night ? '|night' : ''}`;
    const expected = night ? EARLY_NIGHT_EXPECTED : FEE_WINDOW[r.kind].expected;
    const g = groups.get(key) ?? { date: r.date, kind: r.kind, expected, members: [] };
    g.members.push(r);
    groups.set(key, g);
  }

  const sums = new Map<string, FeeLineInput>();
  for (const l of lines) {
    const key = `${l.date}|${l.kind}`;
    const cur = sums.get(key) ?? { date: l.date, kind: l.kind, amount: 0 };
    cur.amount += l.amount;
    sums.set(key, cur);
  }
  const usable = [...sums.entries()].filter(([, l]) => round(l.amount) > 0);

  const pairs: Array<{ group: string; line: string; score: number; day: number }> = [];
  for (const [gKey, g] of groups) {
    const gDay = dayNumber(g.date);
    const win = FEE_WINDOW[g.kind];
    for (const [lKey, l] of usable) {
      if (l.kind !== g.kind) continue;
      const d = dayNumber(l.date) - gDay;
      if (d < win.min || d > win.max) continue;
      pairs.push({ group: gKey, line: lKey, score: Math.abs(d - g.expected), day: gDay });
    }
  }
  pairs.sort((a, b) => a.score - b.score || b.day - a.day);

  // Satr → uni olgan guruh(lar)
  const taken = new Map<string, { line: FeeLineInput; groups: string[] }>();
  const matched = new Set<string>();
  for (const p of pairs) {
    if (matched.has(p.group) || taken.has(p.line)) continue;
    const l = sums.get(p.line);
    if (!l) continue;
    matched.add(p.group);
    taken.set(p.line, { line: l, groups: [p.group] });
  }

  /*
   * Erta yechish: juftsiz guruh oynasidagi band satrga qo'shiladi, agar satr
   * ikkala to'lov summasiga yolg'iz to'lovnikidan yaxshiroq mos kelsa (bir UTC
   * kunidagi ikki yechish haqi bitta satrda). Satr yolg'iz to'lovga mos kelsa —
   * bu guruhning o'z satri hali kelmagan (keyingi sinxronda o'zi ulanadi) yoki
   * u haqsiz (jadval to'lovining kech kelgan qoldig'i): qo'shilmaydi.
   */
  const netOf = (keys: string[]): number =>
    keys.reduce((s, k) => s + (groups.get(k)?.members ?? []).reduce((t, m) => t + Math.max(0, m.amount), 0), 0);
  const lonely = [...groups.entries()]
    .filter(([k, g]) => g.kind === 'early' && !matched.has(k))
    .sort(([, a], [, b]) => a.date.localeCompare(b.date));
  for (const [gKey, g] of lonely) {
    const gDay = dayNumber(g.date);
    const win = FEE_WINDOW.early;
    let best: { t: { line: FeeLineInput; groups: string[] }; gain: number } | null = null;
    for (const t of taken.values()) {
      if (t.line.kind !== 'early') continue;
      const d = dayNumber(t.line.date) - gDay;
      if (d < win.min || d > win.max) continue;
      const fee = round(t.line.amount);
      const net = netOf(t.groups);
      const gain = Math.abs(fee - EARLY_FEE_K * net) - Math.abs(fee - EARLY_FEE_K * (net + netOf([gKey])));
      if (gain > 0 && (!best || gain > best.gain)) best = { t, gain };
    }
    if (best) {
      best.t.groups.push(gKey);
      matched.add(gKey);
    }
  }

  const out: FeeMatch[] = [];
  for (const t of taken.values()) {
    const first = groups.get(t.groups[0]);
    if (!first) continue;
    const members = t.groups.flatMap((k) => groups.get(k)?.members ?? []);
    const fee = round(t.line.amount);
    const split = splitByWeight(
      fee,
      members.map((m) => Math.max(0, m.amount)),
    );
    out.push({
      date: first.date,
      kind: first.kind,
      lineDate: t.line.date,
      fee,
      net: round(members.reduce((s, m) => s + m.amount, 0)),
      shares: new Map(members.map((m, i) => [m.id, split[i] ?? 0])),
    });
  }
  return out;
}

/**
 * Yozuv bo'yicha haq: id → haq (`matchPayoutFees` ulushlari).
 *
 * Juftsiz yozuv: oynasida shu turdagi haq satri bor bo'lsa — 0. Bu satr
 * boshqa to'lovniki (bir haq ikki to'lovda ko'rinmasin) yoki haq qaytarilgan
 * (yig'indi 0). Oynasida satr umuman yo'q yozuv natijada yo'q — uning haqi
 * tegilmaydi: tarix boshidagi, haq toifasi kiritilishidan oldingi yozuvlar.
 */
export function assignPayoutFees(records: FeeRecordInput[], lines: FeeLineInput[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const m of matchPayoutFees(records, lines)) for (const [id, fee] of m.shares) out.set(id, fee);

  const lineDays: Record<PayoutFeeKind, number[]> = { scheduled: [], early: [] };
  for (const l of lines) lineDays[l.kind].push(dayNumber(l.date));
  for (const r of records) {
    if (out.has(r.id)) continue;
    const day = dayNumber(r.date);
    const win = FEE_WINDOW[r.kind];
    if (lineDays[r.kind].some((d) => d - day >= win.min && d - day <= win.max)) out.set(r.id, 0);
  }
  return out;
}

/**
 * Bitta Uzum kabinetining (bir sinxrondagi do'konlar) to'lov yozuvlariga
 * yechib olish haqini qo'yadi. Har sinxronda qayta hisoblanadi va QIYMAT
 * QO'YILADI (qo'shilmaydi): haq satri kech kelsa shu safar ulanadi, hech bir
 * so'm ikki marta hisoblanmaydi. Juftsiz yozuv — `assignPayoutFees` qoidasi:
 * oynasida haq satri bo'lsa 0, bo'lmasa tegilmaydi (eski yoki ko'chirilmagan).
 * `fee` faqat ko'rinish uchun: pul hisobiga Expense satrining o'zi kiradi.
 * Qaytaradi: o'zgargan yozuvlar soni.
 */
export async function attachPayoutFees(storeIds: string[]): Promise<number> {
  if (storeIds.length === 0) return 0;

  const records = await prisma.payoutRecord.findMany({
    where: { storeId: { in: storeIds }, kind: { in: ['scheduled', 'early'] } },
    select: { id: true, date: true, kind: true, amount: true, fee: true, createdAt: true },
  });
  if (records.length === 0) return 0;

  const first = records.reduce((min, r) => (r.date < min ? r.date : min), records[0].date);
  const rows = await prisma.expense.findMany({
    where: {
      storeId: { in: storeIds },
      category: 'payout_fee',
      source: 'uzum',
      date: { gte: addDays(first, -3) },
    },
    select: { date: true, amount: true, note: true },
  });
  if (rows.length === 0) return 0;

  const assigned = assignPayoutFees(
    records.map((r) => ({
      id: r.id,
      date: toISODate(r.date),
      kind: r.kind === 'early' ? 'early' : 'scheduled',
      amount: r.amount,
      createdAt: r.createdAt,
    })),
    rows.map((e) => ({ date: toISODate(e.date), kind: payoutFeeKind(e.note) ?? 'scheduled', amount: e.amount })),
  );

  const changes = records.filter((r) => {
    const fee = assigned.get(r.id);
    return fee !== undefined && Math.abs(fee - r.fee) >= 0.5;
  });
  if (changes.length === 0) return 0;

  await prisma.$transaction(
    changes.map((r) => prisma.payoutRecord.update({ where: { id: r.id }, data: { fee: assigned.get(r.id) ?? 0 } })),
  );
  return changes.length;
}

/**
 * Bitta sinxronning do'kon yozuvlari bir zumda yoziladi (stepFinance — hamma
 * do'kon xarajatidan keyin, bitta payt bilan ketma-ket), keyingi sinxron esa
 * kamida 5 daqiqadan keyin. 15 daqiqa — vaqt qoldig'i bilan.
 */
const SAME_RUN_MS = 15 * 60_000;

/**
 * Oxirgi to'lovlar — eng yangisi birinchi.
 *
 * Uzum kabineti bitta sotuvchi to'lovini bitta qator qilib ko'rsatadi, bizda
 * esa yozuv do'kon bo'yicha — bir kabinetning bitta to'lovi bitta qatorga
 * qo'shiladi:
 *  • jadval to'lovi va "oldingi to'lovlar" — kabinet va sana bo'yicha (har
 *    do'konda shu kunga bittadan ortiq bo'lmaydi, recordPayout);
 *  • erta yechish — bitta sinxron yozgan yozuvlar: har do'kondan bittadan,
 *    bir-biridan 15 daqiqa ichida va sinxron do'konlarni yuradigan tartibda
 *    (reloadStores: qo'shilgan vaqti, shop id). Tartibda oldingi do'kon yozuvi
 *    kelsa — bu keyingi sinxron. Bir kundagi ikki yechish, birinchisi faqat
 *    bitta do'kondan bo'lsa ham, Uzumdagidek ikki qator bo'lib qoladi.
 * Kabineti o'chirilgan do'kon o'zi alohida. `gross` — kabinetdagi raqam
 * (hisobga tushgani + haq).
 */
export async function listPayoutHistory(storeIds: string[]): Promise<PayoutHistoryRow[]> {
  if (storeIds.length === 0) return [];
  const take = HISTORY_LIMIT * Math.max(1, storeIds.length);
  // Bitta ortiqcha yozuv: u bor bo'lsa, eng eski sananing yozuvlari chala bo'lishi mumkin
  const fetched = await prisma.payoutRecord.findMany({
    where: { storeId: { in: storeIds } },
    orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
    take: take + 1,
    select: {
      storeId: true,
      date: true,
      amount: true,
      fee: true,
      kind: true,
      createdAt: true,
      store: { select: { uzumAccountId: true, createdAt: true, uzumShopId: true } },
    },
  });
  const more = fetched.length > take;
  // Sinxron do'konlarni shu tartibda yuradi (sync.ts reloadStores) — bitta sinxronning yozuvlari ham shu tartibda
  const storeRank = new Map(
    [...new Map(fetched.map((r) => [r.storeId, r.store])).entries()]
      .sort(
        ([, a], [, b]) =>
          a.createdAt.getTime() - b.createdAt.getTime() || (a.uzumShopId ?? '').localeCompare(b.uzumShopId ?? ''),
      )
      .map(([id], i) => [id, i]),
  );
  const rows = more ? fetched.slice(0, take) : fetched;

  type Merged = {
    date: string;
    amount: number;
    fee: number;
    kind: PayoutHistoryRow['kind'];
    last: number;
    lastRank: number;
    stores: Set<string>;
  };
  const list: Merged[] = [];
  const open = new Map<string, Merged>();
  // Eskisidan boshlab — erta yechishda yozuvlar yaratilish tartibida guruhlanadi
  for (let i = rows.length - 1; i >= 0; i -= 1) {
    const r = rows[i];
    const kind: PayoutHistoryRow['kind'] = r.kind === 'early' || r.kind === 'earlier' ? r.kind : 'scheduled';
    const date = toISODate(r.date);
    const key = `${r.store.uzumAccountId ?? `store:${r.storeId}`}|${date}|${kind}`;
    const at = r.createdAt.getTime();
    const rank = storeRank.get(r.storeId) ?? 0;
    let cur = open.get(key);
    const otherRun =
      cur !== undefined &&
      (cur.stores.has(r.storeId) || at - cur.last > SAME_RUN_MS || rank <= cur.lastRank);
    if (cur && kind === 'early' && otherRun) cur = undefined;
    if (!cur) {
      cur = { date, amount: 0, fee: 0, kind, last: at, lastRank: -1, stores: new Set() };
      open.set(key, cur);
      list.push(cur);
    }
    cur.amount += r.amount;
    cur.fee += r.fee;
    cur.last = Math.max(cur.last, at);
    cur.lastRank = Math.max(cur.lastRank, rank);
    cur.stores.add(r.storeId);
  }

  let out = list.sort((a, b) => b.date.localeCompare(a.date) || b.last - a.last);
  /*
   * Chegara: so'rovga sig'magan yozuv bor va do'kon bir nechta bo'lsa, eng eski
   * sananing qatorlari chala bo'lishi mumkin (bir do'konniki keldi, boshqasiniki
   * yo'q) — chala qator ko'rsatilgandan ko'ra tashlanadi. Bitta do'konda har
   * qator bitta yozuv — chala bo'lmaydi.
   */
  if (more && storeIds.length > 1) {
    const edge = toISODate(fetched[take].date);
    const whole = out.filter((r) => r.date !== edge);
    if (whole.length > 0) out = whole;
  }

  return out.slice(0, HISTORY_LIMIT).map((r) => ({
    date: r.date,
    amount: round(r.amount),
    fee: round(r.fee),
    gross: round(r.amount + r.fee),
    kind: r.kind,
  }));
}
