/**
 * Yechib olish haqini reklamadan ajratish — bir martalik ko'chirish (2026-11-14).
 *
 *   npx tsx apps/api/src/scripts/payout-fee-migrate.ts <companyId> [companyId…] [--apply] [--include-unmatched]
 *
 * `demo_` bilan boshlanadigan kompaniyaga tegilmaydi (serverdagi demo nusxa) —
 * faqat test bazasida `--allow-demo` bilan.
 *
 * NIMA UCHUN. Uzum yechib olish haqini ("Har hafta / Shoshilinch yechib olish
 * xizmati uchun to‘lov") reklama bilan bir manba va kodda beradi — ilgari u
 * `marketing` bo'lib yozilib, reklama sarfini oshirib ko'rsatardi. Yangi import
 * uni `payout_fee` qiladi, lekin faqat sinxron qayta o'qigan kunlarda (oddiy
 * sinxron — oxirgi 14 kun, ochiq buyurtma bo'lsa ko'proq). Eski kunlar va API
 * kaliti ishlamaydigan kabinetlar (yangi sinxron yo'q) shu skript bilan
 * ko'chiriladi:
 *   1. izohi yechib olish haqi bo'lgan, importer kalitidagi Uzum qatorlari
 *      topiladi (toifasi keyin qo'lda o'zgartirilgan bo'lsa ham);
 *   2. har biri importer beradigan id bilan `payout_fee` qatoriga ko'chadi —
 *      o'chirish va yaratish bitta tranzaksiyada, keyingi sinxron aynan shu
 *      qatorni yangilaydi (ikkinchi nusxa paydo bo'lmaydi);
 *   3. to'lovlar tarixiga haq biriktiriladi (attachPayoutFees).
 * Pul jami o'zgarmaydi: balans yig'indisi (uzum + uzum-payout) va foydaga
 * kiradigan Uzum xarajatlari jami oldin va keyin solishtiriladi — faqat
 * reklama kamayadi, "Yechib olish haqi" shunchaga oshadi. Yangi qator sinxron
 * tomonidan allaqachon yozilgan bo'lsa, eskisi nusxa — u o'chiriladi va jami
 * aynan shunchaga kamayadi (ikki marta ayrilgan haq tuzaladi).
 *
 * EHTIYOT. Eski kodda bir kunning mahsulotga bog'lanmagan reklama satrlari
 * bitta qatorga qo'shilardi va izoh birinchisidan qolardi: qator izohi haq
 * bo'lsa ham, ichida reklama yoki ikkinchi haq bo'lishi mumkin. Shuning uchun
 * har qator o'z to'lovi bilan solishtiriladi: haq Uzum foiziga (izohdagi
 * jadval — har hafta 1%, har kun 1,5%; shoshilinch — 2,5%) yaxlitlash
 * aniqligida mos kelsagina "ishonchli". Mos kelmagan qator KO'CHIRILMAYDI —
 * kalit ishlayotgan kabinetda to'liq sinxron (scripts/resync.ts, --expenses'siz)
 * uni Uzum satrlaridan aniq ajratadi. To'lovi topilmagan qator (tarix
 * yuritilishidan oldingi) foiz bilan tekshirilmaydi — faqat --include-unmatched bilan.
 *
 * Standart rejim faqat ko'rsatadi, hech narsa yozmaydi. --apply bilan yozadi;
 * kompaniyada sinxron ishlayotgan yoki navbatda bo'lsa rad etadi. Har bir
 * qo'llash AuditLog'ga yoziladi (action 'maintenance.payout_fee').
 */
import { prisma } from '@savdoiq/db';
import {
  DEFAULT_EARLY_FEE_PCT,
  SCHEDULE_FEE,
  payoutFeeKind,
  round,
  toISODate,
  type PayoutFeeKind,
  type PayoutMode,
} from '@savdoiq/shared';
import { expenseRowId } from '../services/importer.js';
import {
  assignPayoutFees,
  attachPayoutFees,
  matchPayoutFees,
  type FeeLineInput,
  type FeeMatch,
  type FeeRecordInput,
} from '../services/payout-history.js';

const SOURCES = ['uzum', 'uzum-payout'];
/** Importer haqni shu toifalar kalitida yozgan (mahsulotsiz reklama; ehtiyot uchun "boshqa") */
const LEGACY_KEY_CATEGORIES = ['marketing', 'other'];
/** Reklama shu kundan beri qanchaga kamayishini ko'rsatish uchun (muammo topilgan davr boshi) */
const REPORT_SINCE = new Date('2026-10-25T00:00:00.000Z');

const USAGE =
  'Foydalanish: npx tsx apps/api/src/scripts/payout-fee-migrate.ts <companyId> [companyId…] [--apply] [--include-unmatched] [--allow-demo]';
const FLAGS = new Set(['--apply', '--include-unmatched', '--allow-demo']);

const money = (n: number) => Math.round(n).toLocaleString('ru-RU');
const pct = (r: number) => `${(r * 100).toFixed(2)}%`;
const KIND_LABEL: Record<PayoutFeeKind, string> = { scheduled: 'jadval', early: 'shoshilinch' };

/**
 * Qator turi va izohidagi muddatga ko'ra Uzum foizi(lari). "Har ikki hafta"
 * "har hafta"dan oldin tekshiriladi. Muddat aytilmagan jadval haqi — har qanday
 * pullik jadval foizi. Bepul jadval (0%) uchun ro'yxat bo'sh — bunday "haq"
 * ishonchli emas.
 */
function nominalRates(kind: PayoutFeeKind, note: string | null): number[] {
  if (kind === 'early') return [DEFAULT_EARLY_FEE_PCT / 100];
  const t = note ?? '';
  const mode: PayoutMode | null = /har\s+ikki\s+hafta|двухнедельн|biweekly/i.test(t)
    ? 'biweekly'
    : /har\s+hafta|еженедельн|weekly/i.test(t)
      ? 'weekly'
      : /har\s+kun|ежедневн|daily/i.test(t)
        ? 'daily'
        : /har\s+oy|ежемесячн|monthly/i.test(t)
          ? 'monthly'
          : null;
  const pcts = mode ? [SCHEDULE_FEE[mode]] : Object.values(SCHEDULE_FEE);
  return [...new Set(pcts.filter((p) => p > 0))].map((p) => p / 100);
}

/**
 * Yaxlitlash farqi, so'm. Uzum haqni butun so'mga yaxlitlaydi: egasining
 * to'lovlarida farq 1 so'mdan oshmagan (36 617,4 → 36 618). Foizli chegara
 * (masalan 0,02%) haqqa qo'shilgan bir necha yuz so'mlik reklamani ham
 * o'tkazib yuborardi — mos kelmagan qator ko'chirilmaydi, bu xavfsiz tomon.
 */
const FEE_TOLERANCE = 10;

type Verdict = 'ok' | 'unmatched' | 'implausible' | 'bad-id';

interface Candidate {
  id: string;
  newId: string;
  storeId: string | null;
  date: Date;
  day: string;
  category: string;
  source: string;
  amount: number;
  note: string | null;
  kind: PayoutFeeKind;
  verdict: Verdict;
  reason: string;
}

interface Totals {
  /** Balans hisobidagi Uzum xarajatlari (uzum + uzum-payout) */
  balance: number;
  /** Foydaga kiradigan Uzum xarajatlari (uzum) */
  profit: number;
  marketing: number;
  payoutFee: number;
  marketingSince: number;
  payoutFeeSince: number;
}

async function totals(companyId: string): Promise<Totals> {
  const sum = (rows: Array<{ category: string; _sum: { amount: number | null } }>, category: string) =>
    round(rows.find((r) => r.category === category)?._sum.amount ?? 0);
  const [balance, all, since] = await Promise.all([
    prisma.expense.aggregate({ _sum: { amount: true }, where: { companyId, source: { in: SOURCES } } }),
    prisma.expense.groupBy({ by: ['category'], _sum: { amount: true }, where: { companyId, source: 'uzum' } }),
    prisma.expense.groupBy({
      by: ['category'],
      _sum: { amount: true },
      where: { companyId, source: 'uzum', date: { gte: REPORT_SINCE } },
    }),
  ]);
  return {
    balance: round(balance._sum.amount ?? 0),
    profit: round(all.reduce((s, r) => s + (r._sum.amount ?? 0), 0)),
    marketing: sum(all, 'marketing'),
    payoutFee: sum(all, 'payout_fee'),
    marketingSince: sum(since, 'marketing'),
    payoutFeeSince: sum(since, 'payout_fee'),
  };
}

async function busyJob(companyId: string) {
  return prisma.syncJob.findFirst({
    where: { companyId, status: { in: ['queued', 'running'] } },
    select: { id: true, type: true, status: true },
  });
}

/**
 * Bir Uzum kabinetining do'konlari (sinxrondagi tartibda — birinchisi sotuvchi
 * darajasidagi haqni oladi). Kabineti o'chirilgan do'kon alohida guruh.
 */
function accountGroups(stores: Array<{ id: string; uzumAccountId: string | null }>): string[][] {
  const groups = new Map<string, string[]>();
  for (const s of stores) {
    const key = s.uzumAccountId ? `acc:${s.uzumAccountId}` : `store:${s.id}`;
    groups.set(key, [...(groups.get(key) ?? []), s.id]);
  }
  return [...groups.values()];
}

interface Preview {
  matches: FeeMatch[];
  /** attachPayoutFees qo'yadigan haq: yozuv id → haq */
  assigned: Map<string, number>;
  records: Array<{ id: string; date: string; kind: PayoutFeeKind; amount: number; fee: number; createdAt: Date }>;
}

/** Kabinet to'lovlari va (ko'chirilgandan keyingi) haq satrlari — attachPayoutFees bilan bir xil hisob */
async function preview(storeIds: string[], moving: Candidate[]): Promise<Preview> {
  const [rows, existing] = await Promise.all([
    prisma.payoutRecord.findMany({
      where: { storeId: { in: storeIds }, kind: { in: ['scheduled', 'early'] } },
      select: { id: true, date: true, kind: true, amount: true, fee: true, createdAt: true },
    }),
    prisma.expense.findMany({
      where: { storeId: { in: storeIds }, category: 'payout_fee', source: 'uzum' },
      select: { id: true, date: true, amount: true, note: true },
    }),
  ]);
  const records = rows.map((r) => ({
    id: r.id,
    date: toISODate(r.date),
    kind: (r.kind === 'early' ? 'early' : 'scheduled') as PayoutFeeKind,
    amount: r.amount,
    fee: r.fee,
    createdAt: r.createdAt,
  }));
  const recInput: FeeRecordInput[] = records.map(({ id, date, kind, amount, createdAt }) => ({
    id,
    date,
    kind,
    amount,
    createdAt,
  }));
  // Ko'chadigan qatorning yangi id'si allaqachon bor bo'lsa (nusxa) — u ikki marta qo'shilmasin
  const replaced = new Set(moving.map((c) => c.newId));
  // attachPayoutFees faqat `uzum` manbasini o'qiydi — ko'rinish ham shunday
  const lines: FeeLineInput[] = [
    ...existing
      .filter((e) => !replaced.has(e.id))
      .map((e) => ({ date: toISODate(e.date), kind: payoutFeeKind(e.note) ?? 'scheduled', amount: e.amount })),
    ...moving
      .filter((c) => c.source === 'uzum' && c.storeId && storeIds.includes(c.storeId))
      .map((c) => ({ date: c.day, kind: c.kind, amount: c.amount })),
  ];
  return { matches: matchPayoutFees(recInput, lines), assigned: assignPayoutFees(recInput, lines), records };
}

type MoveResult = 'moved' | 'deduped';

/** Bitta eski qatorni yangi id'ga ko'chiradi. Qator shu orada o'zgargan bo'lsa — xato (hech narsa yozilmaydi) */
async function moveRow(companyId: string, c: Candidate): Promise<MoveResult> {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.expense.findUnique({ where: { id: c.newId }, select: { amount: true } });
    if (existing && Math.abs(existing.amount - c.amount) >= 0.5) {
      throw new Error(`yangi qator allaqachon bor, summasi boshqa (${money(existing.amount)})`);
    }
    // Shart bilan o'chiramiz: sinxron shu orada qatorni o'zgartirgan/o'chirgan bo'lsa — hech narsa yozilmaydi
    const del = await tx.expense.deleteMany({ where: { id: c.id, category: c.category, amount: c.amount } });
    if (del.count !== 1) throw new Error('eski qator shu orada o‘zgargan yoki o‘chgan');
    // Sinxron yangi qatorni allaqachon yozgan — eskisi uning nusxasi edi
    if (existing) return 'deduped';
    await tx.expense.create({
      data: {
        id: c.newId,
        companyId,
        storeId: c.storeId,
        date: c.date,
        category: 'payout_fee',
        amount: c.amount,
        note: c.note,
        source: c.source,
      },
    });
    return 'moved';
  });
}

async function migrateCompany(
  companyId: string,
  opts: { apply: boolean; includeUnmatched: boolean; allowDemo: boolean },
): Promise<void> {
  console.log(`\n═══ ${companyId}`);
  if (companyId.startsWith('demo_') && !opts.allowDemo) {
    console.log('Demo kompaniya — tegilmaydi');
    return;
  }
  const company = await prisma.company.findUnique({ where: { id: companyId }, select: { name: true } });
  if (!company) {
    console.error('Kompaniya topilmadi');
    process.exitCode = 1;
    return;
  }
  console.log(`Kompaniya: ${company.name}`);

  if (opts.apply) {
    const busy = await busyJob(companyId);
    if (busy) {
      console.error(`Sinxron ${busy.status} (${busy.type}, ${busy.id}) — tugashini kutib, qayta ishga tushiring`);
      process.exitCode = 1;
      return;
    }
  }

  const stores = await prisma.store.findMany({
    where: { companyId },
    select: { id: true, title: true, uzumAccountId: true },
    orderBy: [{ createdAt: 'asc' }, { uzumShopId: 'asc' }],
  });
  const titleOf = new Map(stores.map((s) => [s.id, s.title]));
  const groups = accountGroups(stores);

  const before = await totals(companyId);

  const rows = await prisma.expense.findMany({
    where: { companyId, source: { in: SOURCES }, category: { not: 'payout_fee' } },
    select: { id: true, storeId: true, date: true, category: true, source: true, amount: true, note: true },
    orderBy: { date: 'asc' },
  });
  const candidates: Candidate[] = [];
  for (const r of rows) {
    const kind = payoutFeeKind(r.note);
    if (!kind) continue;
    const day = toISODate(r.date);
    /*
     * Faqat importer yozgan qator — id uning eski kalitlaridan biri. Toifani
     * kalit emas, id belgilaydi: foydalanuvchi toifani qo'lda o'zgartirgan
     * bo'lsa ham bu o'sha haq (sinxron ham uni shunday almashtiradi).
     */
    const legacyKey = LEGACY_KEY_CATEGORIES.some(
      (cat) => expenseRowId(companyId, r.storeId, day, cat, r.source) === r.id,
    );
    candidates.push({
      ...r,
      day,
      kind,
      newId: expenseRowId(companyId, r.storeId, day, 'payout_fee', r.source, kind),
      verdict: legacyKey ? 'unmatched' : 'bad-id',
      reason: legacyKey ? 'to‘lov yozuvi topilmadi' : 'id importer kalitiga mos emas (sana yoki do‘kon o‘zgargan?)',
    });
  }

  // Har qatorni o'z to'lovi va Uzum foizi bilan solishtiramiz (kabinet bo'yicha)
  for (const storeIds of groups) {
    const mine = candidates.filter((c) => c.verdict !== 'bad-id' && c.storeId && storeIds.includes(c.storeId));
    if (mine.length === 0) continue;
    const { matches } = await preview(storeIds, mine);
    for (const c of mine) {
      const m = matches.find((x) => x.lineDate === c.day && x.kind === c.kind);
      if (!m) continue;
      const gross = m.net + m.fee;
      const rate = gross > 0 ? m.fee / gross : 0;
      const label = `${m.date} to‘lovi: ${money(m.net)} + ${money(m.fee)} = ${money(gross)}, ${pct(rate)}`;
      const rates = nominalRates(c.kind, c.note);
      const diff = rates.length ? Math.min(...rates.map((p) => Math.abs(m.fee - gross * p))) : Infinity;
      const fits = diff <= FEE_TOLERANCE;
      c.verdict = fits ? 'ok' : 'implausible';
      c.reason = fits
        ? `${label}, farq ${money(diff)} so‘m`
        : rates.length === 0
          ? `${label} — bu jadval Uzumda bepul (0%), haq bo‘lmasligi kerak: tekshirib ko‘ring`
          : `${label} — Uzum foiziga (${rates.map(pct).join(' / ')}) mos emas (farq ${money(diff)} so‘m): ichida ` +
            'reklama yoki ikkinchi haq bo‘lishi mumkin, to‘liq sinxron aniq ajratadi';
    }
  }

  const moving = candidates.filter((c) => c.verdict === 'ok' || (opts.includeUnmatched && c.verdict === 'unmatched'));
  const MARK: Record<Verdict, string> = { ok: '✓', unmatched: '?', implausible: '✗', 'bad-id': '✗' };

  console.log(`Uzum xarajatlari (balans): ${money(before.balance)}, foydaga kiradigani: ${money(before.profit)}`);
  console.log(
    `Reklama: ${money(before.marketing)} (25.10 dan: ${money(before.marketingSince)}), ` +
      `yechib olish haqi: ${money(before.payoutFee)}`,
  );
  console.log(`Haq izohli eski qatorlar: ${candidates.length} ta`);
  for (const c of candidates) {
    const move = moving.includes(c) ? '→ ko‘chadi' : '  qoladi';
    console.log(
      `  ${MARK[c.verdict]} ${c.day} ${titleOf.get(c.storeId ?? '') ?? '(do‘konsiz)'} · ${c.category}/${c.source} · ` +
        `${KIND_LABEL[c.kind]} ${money(c.amount)} ${move} — ${c.reason}`,
    );
  }
  const unchecked = moving.filter((c) => c.verdict === 'unmatched');
  if (unchecked.length > 0) {
    console.log(
      `DIQQAT: to‘lovi topilmagan ${unchecked.length} ta qator (${money(unchecked.reduce((s, c) => s + c.amount, 0))} ` +
        'so‘m) foiz bilan tekshirilmasdan ko‘chadi (--include-unmatched)',
    );
  }
  const movingSum = round(moving.reduce((s, c) => s + c.amount, 0));
  console.log(`Ko‘chiriladi: ${moving.length} ta, ${money(movingSum)} so‘m`);

  // To'lovlar tarixi ko'chirishdan keyin qanday ko'rinadi (haqi o'zgaradigan yozuvlar)
  for (const storeIds of groups) {
    const { assigned, records } = await preview(storeIds, moving);
    const groupsOut = new Map<string, { date: string; kind: PayoutFeeKind; net: number; from: number; to: number }>();
    for (const r of records) {
      const to = assigned.get(r.id);
      if (to === undefined || Math.abs(to - r.fee) < 0.5) continue;
      const key = `${r.date}|${r.kind}`;
      const g = groupsOut.get(key) ?? { date: r.date, kind: r.kind, net: 0, from: 0, to: 0 };
      g.net += r.amount;
      g.from += r.fee;
      g.to += to;
      groupsOut.set(key, g);
    }
    if (groupsOut.size === 0) continue;
    console.log(`To‘lovlar tarixi (${storeIds.map((id) => titleOf.get(id)).join(', ')}):`);
    for (const g of [...groupsOut.values()].sort((a, b) => a.date.localeCompare(b.date))) {
      console.log(
        `  ${g.date} ${KIND_LABEL[g.kind]}: hisobga ${money(g.net)}, haq ${money(g.from)} → ${money(g.to)}, ` +
          `Uzumda ${money(g.net + g.to)}`,
      );
    }
  }

  if (!opts.apply) {
    console.log('Faqat ko‘rsatildi — yozish uchun --apply');
    return;
  }

  // Ko'rsatish paytida sinxron boshlangan bo'lishi mumkin — yozishdan oldin yana
  const busy = await busyJob(companyId);
  if (busy) {
    console.error(`Sinxron ${busy.status} (${busy.type}, ${busy.id}) — hech narsa yozilmadi, keyin qayta ishga tushiring`);
    process.exitCode = 1;
    return;
  }
  const start = await totals(companyId);

  let moved = 0;
  let movedSum = 0;
  let deduped = 0;
  // Nusxa o'chirilganda jami aynan shunchaga kamayadi (ikki marta ayrilgan haq)
  let dedupedBalance = 0;
  let dedupedProfit = 0;
  const failed: Array<{ id: string; day: string; amount: number; error: string }> = [];
  const done: Array<Candidate & { result: MoveResult }> = [];
  for (const c of moving) {
    try {
      const result = await moveRow(companyId, c);
      if (result === 'moved') {
        moved += 1;
        movedSum += c.amount;
      } else {
        deduped += 1;
        dedupedBalance += c.amount;
        if (c.source === 'uzum') dedupedProfit += c.amount;
      }
      done.push({ ...c, result });
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      failed.push({ id: c.id, day: c.day, amount: c.amount, error });
      console.error(`  ✗ ${c.day} ${money(c.amount)} (${c.id}): ${error}`);
    }
  }

  let feesUpdated = 0;
  for (const storeIds of groups) feesUpdated += await attachPayoutFees(storeIds);

  const after = await totals(companyId);
  const balanceOk = Math.abs(after.balance - (start.balance - dedupedBalance)) < 0.5;
  const profitOk = Math.abs(after.profit - (start.profit - dedupedProfit)) < 0.5;

  await prisma.auditLog.create({
    data: {
      action: 'maintenance.payout_fee',
      entity: 'company',
      entityId: companyId,
      // Qaytarish uchun yetarli: har qatorning avvalgi toifasi (foydalanuvchi qo'ygan bo'lishi mumkin) va holati
      meta: JSON.stringify({
        includeUnmatched: opts.includeUnmatched,
        moved,
        movedSum: round(movedSum),
        deduped,
        dedupedSum: round(dedupedBalance),
        failed: failed.length,
        failedRows: failed,
        feesUpdated,
        rows: done.map((c) => ({
          from: c.id,
          to: c.newId,
          day: c.day,
          amount: c.amount,
          kind: c.kind,
          category: c.category,
          source: c.source,
          storeId: c.storeId,
          verdict: c.verdict,
          result: c.result,
        })),
        before: start,
        after,
      }),
    },
  });

  console.log(`Ko‘chirildi: ${moved} ta (${money(movedSum)} so‘m), o‘tkazib yuborildi: ${failed.length} ta`);
  if (deduped > 0) {
    console.log(`Ikki marta yozilgan nusxa o‘chirildi: ${deduped} ta (${money(dedupedBalance)} so‘m) — jami shunchaga kamaydi`);
  }
  console.log(`To‘lov yozuvlarida haq yangilandi: ${feesUpdated} ta`);
  console.log(
    `Reklama: ${money(start.marketing)} → ${money(after.marketing)} (25.10 dan: ${money(start.marketingSince)} → ` +
      `${money(after.marketingSince)}), yechib olish haqi: ${money(start.payoutFee)} → ${money(after.payoutFee)}`,
  );
  console.log(
    `Balans yig‘indisi: ${money(start.balance)} → ${money(after.balance)} ${balanceOk ? 'OK' : 'XATO'}; ` +
      `foydaga kiradigani: ${money(start.profit)} → ${money(after.profit)} ${profitOk ? 'OK' : 'XATO'}`,
  );
  if (!balanceOk || !profitOk || failed.length > 0) process.exitCode = 1;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const unknown = args.filter((a) => a.startsWith('--') && !FLAGS.has(a));
  const ids = args.filter((a) => !a.startsWith('--'));
  if (unknown.length > 0 || ids.length === 0) {
    console.error(USAGE);
    process.exitCode = 1;
    return;
  }
  const opts = {
    apply: args.includes('--apply'),
    includeUnmatched: args.includes('--include-unmatched'),
    allowDemo: args.includes('--allow-demo'),
  };
  for (const id of ids) await migrateCompany(id, opts);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
