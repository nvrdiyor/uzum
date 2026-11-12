/**
 * Partiya foydasi (2026-11-12): har bir xarid partiyasiga qancha pul tikilgan,
 * Uzum'dan qancha qaytgan va qancha foyda qolgan — sotuvchi hech narsa
 * kiritmasdan, sotuvlardan avtomatik.
 *
 * BOG'LANISH. Partiya qatori Uzum'dagi tovarga sotuvchi SKU kodi bilan
 * bog'lanadi (`PurchaseBatchItem.skuCodes`, bazada har kod alohida qatorda).
 * Id emas, kod: do'kon qayta ulanganda SKU id'lari o'zgargan (2026-10-28), kod
 * esa o'zgarmaydi va ikkala do'kondagi bir xil kodli tovarni birga oladi.
 * Bog'lanmagan qator boshqa partiyada xuddi shu nom bilan bog'langan bo'lsa,
 * o'sha bog'lanishni oladi ("nomi bo'yicha", `resolveRowLinks`).
 *
 * TAQSIMLASH (FIFO, `allocateBatchSales`). Har bir sotilgan dona shu tovar bor
 * va sotuv kunigacha «Keldi» bo'lgan eng eski partiyadan hisoblanadi. Partiyadan
 * oldin Uzum qabul qilgan qoldiq ("eski qoldiq") birinchi sotiladi va hech
 * qaysi partiyaga yozilmaydi. Hech qaysi partiyaga tushmagan sotuv sababi bilan
 * alohida ko'rsatiladi — hech narsa taxmin qilinmaydi.
 *
 * PUL. Pozitsiya puli (Uzum to'laydigani, reklamasi va soliq) bo'laklarga dona
 * bo'yicha butun so'mlarda bo'linadi (eng katta qoldiq usuli) — bo'laklar
 * yig'indisi pozitsiya summasiga aynan teng. Tannarx: qatorning tovar + cargo +
 * qo'shimcha xarajat ulushi (`calcBatch`), sotilgan donaga mutanosib.
 *
 * REKLAMA (2026-11-12). Uzum "Buyurtmalarni ko'paytirish" to'lovini mahsulot
 * bo'yicha, xaridor tovarni olgan kuni yechadi — buyurtma raqamisiz. Shuning
 * uchun kunlik to'lov o'sha kuni xaridorga topshirilgan shu mahsulot
 * sotuvlariga tushum ulushiga qarab bo'linadi (`spreadAdFees`), keyin
 * pozitsiya puli bilan birga partiyalarga boradi: qaytgan pul = Uzum
 * to'laydigani − reklama − soliq.
 *
 * SOTUVSIZ CHIQIM (2026-11-12, egasi: "2-partiyada 12 dona bor deyapti — brak
 * chiqqanlari, utilizatsiya qilinganlari bor"). Uzum omboridan sotilmasdan
 * chiqib ketgan dona — brak, yo'qolgan (utilizatsiya ham shu: Uzum hisobida
 * yo'q), sizga qaytarilgan, xaridordan qaytish yo'lidagi — sotuv kabi, o'sha
 * kuni sotuvda turgan eng eski partiyadan yechiladi (pulsiz,
 * `ProfitOutflowInput`). Aks holda u partiyada "qoldi" bo'lib turib, keyingi
 * sotuvlarni o'ziga olardi: yangi partiyaning sotuvi eski partiyaga yozilardi.
 * Brak va yo'qolganning tannarxi foydadan ayriladi (zarar); qaytayotgan va
 * sizga qaytarilgani sizniki — tannarxi "qolgan tovar"da qoladi.
 *
 * Bu modul toza: vaqt va baza yo'q, faqat kunlar (YYYY-MM-DD) — testlarda soat
 * kerak emas. Ma'lumotni server yig'adi (apps/api/src/services/batch-profit.ts).
 */
import { splitByWeight } from './calc.js';
import { normalizeCardText } from './card-seo.js';
import type { ShipmentStatus } from './types.js';

// ─────────────────────────── SKU kodlari ───────────────────────────

/**
 * SKU kodini solishtirish uchun bitta ko'rinishga keltirish: chetidagi bo'sh joy
 * olinadi, ichidagisi bittaga qisqaradi, harflar kattalashadi. "lb-skate red " va
 * "LB-SKATE RED" — bitta kod.
 */
export const normSkuCode = (code: string): string => code.trim().replace(/\s+/g, ' ').toUpperCase();

/** Bazadagi matndan kodlar ro'yxati (bo'sh qatorlarsiz) */
export const splitSkuCodes = (stored: string | null | undefined): string[] =>
  (stored ?? '')
    .split('\n')
    .map((c) => c.trim())
    .filter(Boolean);

/** Kodlar ro'yxatidan bazaga yoziladigan matn: takrorlar (katta-kichik harf farqi bilan ham) bir marta */
export function joinSkuCodes(codes: readonly string[]): string {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of codes) {
    const code = raw.trim();
    const key = normSkuCode(code);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(code);
  }
  return out.join('\n');
}

/** Bazadagi "ataylab bog'lanmagan" belgisi (haqiqiy SKU kodi bo'lolmaydi — server rad etadi) */
export const SKU_CODES_NONE = '-';

/**
 * Bazadagi matndan bog'lanish, uch holat:
 *  • '' → null — sotuvchi tegmagan: nomi bo'yicha avtomatik bog'lanishi mumkin;
 *  • '-' → [] — ataylab bog'lanmagan ("Uzumda yo'q"): avtomatik bog'lanmaydi;
 *  • aks holda — tanlangan kodlar.
 */
export function parseSkuCodes(stored: string | null | undefined): string[] | null {
  const s = (stored ?? '').trim();
  if (!s) return null;
  if (s === SKU_CODES_NONE) return [];
  return splitSkuCodes(s);
}

/** `parseSkuCodes` ning teskarisi: null → '', bo'sh ro'yxat → '-', aks holda kodlar */
export function serializeSkuCodes(codes: readonly string[] | null): string {
  if (codes === null) return '';
  return joinSkuCodes(codes) || SKU_CODES_NONE;
}

// ─────────────────────────── Nomi bo'yicha bog'lanish ───────────────────────────

/** Qator nomini solishtirish kaliti: katta-kichik harf, apostrof va bo'sh joy farqi hisobga olinmaydi */
export const rowNameKey = (name: string): string => normalizeCardText(name);

export interface LinkRowInput {
  name: string;
  /** `parseSkuCodes` natijasi: null — tegilmagan, [] — ataylab bog'lanmagan */
  skuCodes: readonly string[] | null;
  extraExcluded: boolean;
}

export interface LinkBatchInput {
  id: string;
  name: string;
  /** ISO */
  createdAt: string;
  items: readonly LinkRowInput[];
}

/**
 * Qator qanday bog'langan:
 *  • explicit — sotuvchi o'zi tanlagan;
 *  • name — o'zi bo'sh, boshqa qatordagi xuddi shu nomli bog'lanishdan;
 *  • none — bog'lanmagan (sotuvi hisobga kirmaydi);
 *  • personal — qo'shimcha xarajatdan chiqarilgan va bog'lanmagan: shaxsiy yoki
 *    namuna tovar, sotilmaydi (tikilgan pulga ham kirmaydi).
 */
export type BatchRowLink = 'explicit' | 'name' | 'none' | 'personal';

export interface ResolvedRowLink {
  link: BatchRowLink;
  /** Hisobda ishlatiladigan kodlar (asl yozilishi); none/personal — bo'sh */
  codes: string[];
  /** Nomi bo'yicha bo'lsa — bog'lanish olingan partiya */
  from: { batchId: string; batchName: string } | null;
  /** Sotuvchi ataylab "Uzumda yo'q" deb belgilagan (none bo'lganda) */
  optedOut: boolean;
}

/**
 * Har qatorning bog'lanishi. Bog'lanmagan qator (qo'shimcha xarajatdan
 * chiqarilmagan, nomi bor) xuddi shu nomli bog'langan qatorning kodlarini
 * oladi: avval o'zidan OLDINGI eng yaqin qator (partiya yaratilgan vaqti, keyin
 * qator o'rni bo'yicha), bo'lmasa keyingi eng yaqini. Shunda:
 *  • tovar bir marta bog'lansa, o'tgan va kelgusi barcha partiyalardagi shu
 *    nomli qatorlar ham hisobga kiradi;
 *  • keyinroq shu nom bilan BOSHQA tovar olinib, boshqacha bog'lansa, eski
 *    qatorlar eski bog'lanishda qoladi — faqat undan keyingilar yangisiga o'tadi.
 * Sotuvchining o'z tanlovi doim ustun: kodlar (explicit) yoki ataylab "Uzumda
 * yo'q" ([]) — bunday qator avtomatik bog'lanmaydi.
 */
export function resolveRowLinks(batches: readonly LinkBatchInput[]): ResolvedRowLink[][] {
  /** Barcha qatorlar xronologik tartibda: partiya yaratilgan payt, id, qator o'rni */
  const order = batches
    .map((b, bi) => ({ b, bi }))
    .sort((x, y) => x.b.createdAt.localeCompare(y.b.createdAt) || x.b.id.localeCompare(y.b.id));
  const flat: { bi: number; ri: number; key: string }[] = [];
  for (const { b, bi } of order) b.items.forEach((it, ri) => flat.push({ bi, ri, key: rowNameKey(it.name) }));
  const codesOf = (bi: number, ri: number): readonly string[] => batches[bi].items[ri].skuCodes ?? [];

  /** Nom → bog'langan qatorlar (flat dagi o'rni bilan, o'sish tartibida) */
  const sources = new Map<string, number[]>();
  flat.forEach((r, pos) => {
    if (r.key && codesOf(r.bi, r.ri).length > 0) pushTo(sources, r.key, pos);
  });

  const out = batches.map((b) =>
    b.items.map<ResolvedRowLink>(() => ({ link: 'none', codes: [], from: null, optedOut: false })),
  );
  flat.forEach((r, pos) => {
    const it = batches[r.bi].items[r.ri];
    if (codesOf(r.bi, r.ri).length > 0) {
      out[r.bi][r.ri] = { link: 'explicit', codes: [...codesOf(r.bi, r.ri)], from: null, optedOut: false };
      return;
    }
    if (it.extraExcluded) {
      out[r.bi][r.ri] = { link: 'personal', codes: [], from: null, optedOut: false };
      return;
    }
    if (it.skuCodes !== null) {
      // Ataylab bog'lanmagan — nomi bo'yicha ham bog'lanmaydi
      out[r.bi][r.ri] = { link: 'none', codes: [], from: null, optedOut: true };
      return;
    }
    const list = r.key ? sources.get(r.key) : undefined;
    if (!list?.length) return;
    // O'zidan oldingi eng yaqini, bo'lmasa keyingi eng yaqini (ro'yxat o'sish tartibida — ikkiga bo'lib qidirish)
    let lo = 0;
    let hi = list.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (list[mid] < pos) lo = mid + 1;
      else hi = mid;
    }
    // lo — pos dan katta yoki teng birinchi o'rin; manba qatorning o'zi bo'lolmaydi (u bog'lanmagan)
    const src = lo > 0 ? list[lo - 1] : lo < list.length ? list[lo] : -1;
    if (src < 0) return;
    const s = flat[src];
    const source = batches[s.bi];
    out[r.bi][r.ri] = {
      link: 'name',
      codes: [...codesOf(s.bi, s.ri)],
      from: { batchId: source.id, batchName: source.name },
      optedOut: false,
    };
  });
  return out;
}

// ─────────────────────────── Pulni bo'lish ───────────────────────────

/**
 * Butun so'mni og'irlikka mutanosib bo'lish, manfiy summa ham (Uzum ba'zan
 * pozitsiya bo'yicha manfiy to'lov yozadi): bo'laklar yig'indisi aynan `amount`.
 */
export function splitSigned(amount: number, weights: readonly number[]): number[] {
  const a = Math.round(amount || 0);
  if (a === 0) return weights.map(() => 0);
  if (a > 0) return splitByWeight(a, weights);
  return splitByWeight(-a, weights).map((v) => (v === 0 ? 0 : -v));
}

// ─────────────────────────── Reklama ───────────────────────────

/** Bitta mahsulotning bir kunlik reklama to'lovi */
export interface AdFeeInput {
  /** Uzum mahsulot ID'si (to'lov izohidagi "tovar IDsi") */
  product: string;
  /** To'lov kuni (YYYY-MM-DD) */
  day: string;
  /** So'm; qaytarilgani manfiy */
  amount: number;
}

/** Reklama bo'linadigan sotuv: xaridorga topshirilgan tirik pozitsiya */
export interface AdBaseLine {
  product: string;
  /** Xaridorga topshirilgan savdo kuni (YYYY-MM-DD) */
  day: string;
  /** Sotuv summasi — ulush shunga qarab */
  revenue: number;
}

export interface AdSpread {
  /** `base` bilan bir xil tartibda: har pozitsiyaga tushgan reklama, so'm */
  perLine: number[];
  /** Mahsulot → hech bir sotuvga tushmagan reklama (yaqin kunlarda topshirilgan sotuvi yo'q) */
  unplaced: Map<string, number>;
}

/** Reklama to'lovi kunida sotuv bo'lmasa, shuncha kun ichidagi eng yaqin sotuv kuniga */
export const AD_MATCH_DAYS = 7;

const DAY_MS = 86_400_000;
const dayGap = (a: string, b: string): number => Math.abs(Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY_MS;

/** Saralangan kunlar ichidan `day` ga eng yaqini (teng bo'lsa — oldingisi); `maxGap` dan uzoq bo'lsa null */
function nearestDay(days: readonly string[], day: string, maxGap: number): string | null {
  let lo = 0;
  let hi = days.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (days[mid] < day) lo = mid + 1;
    else hi = mid;
  }
  if (lo < days.length && days[lo] === day) return day;
  const prev = lo > 0 ? days[lo - 1] : null;
  const next = lo < days.length ? days[lo] : null;
  const dPrev = prev !== null ? dayGap(prev, day) : Infinity;
  const dNext = next !== null ? dayGap(day, next) : Infinity;
  // To'lov topshirilgandan keyin yechiladi: teng uzoqlikda — oldingi kun
  const best = dPrev <= dNext ? prev : next;
  return best !== null && Math.min(dPrev, dNext) <= maxGap ? best : null;
}

/**
 * Mahsulot reklamasini sotuvlarga bo'lish. Uzum to'lovni xaridor tovarni olgan
 * kuni yechadi, lekin qaysi buyurtmaniki ekanini aytmaydi: kunlik to'lov o'sha
 * kuni topshirilgan shu mahsulot sotuvlariga (barcha SKU'lari) tushum ulushiga
 * qarab, butun so'mda bo'linadi. O'sha kuni sotuv bo'lmasa (vaqt mintaqasi,
 * holat kechikib yangilangan, tovar qaytarilgan) — `maxGapDays` ichidagi eng
 * yaqin sotuv kuniga; u ham bo'lmasa — `unplaced`. Qaytarilgan to'lov (manfiy)
 * xuddi shunday bo'linadi.
 */
export function spreadAdFees(fees: readonly AdFeeInput[], base: readonly AdBaseLine[], maxGapDays = AD_MATCH_DAYS): AdSpread {
  const perLine = base.map(() => 0);
  const unplaced = new Map<string, number>();

  const linesOf = new Map<string, Map<string, number[]>>();
  base.forEach((b, i) => {
    let byDay = linesOf.get(b.product);
    if (!byDay) {
      byDay = new Map();
      linesOf.set(b.product, byDay);
    }
    pushTo(byDay, b.day, i);
  });
  const daysOf = new Map<string, string[]>();
  for (const [product, byDay] of linesOf) daysOf.set(product, [...byDay.keys()].sort());

  // Bir kunning to'lovlari (bir nechta do'kon yoki qator) avval qo'shiladi
  const sums = new Map<string, Map<string, number>>();
  for (const f of fees) {
    if (!f.product || !f.day || !Number.isFinite(f.amount) || f.amount === 0) continue;
    let byDay = sums.get(f.product);
    if (!byDay) {
      byDay = new Map();
      sums.set(f.product, byDay);
    }
    byDay.set(f.day, (byDay.get(f.day) ?? 0) + f.amount);
  }

  for (const [product, byDay] of sums) {
    const days = daysOf.get(product) ?? [];
    const lineDays = linesOf.get(product);
    const entries = [...byDay]
      .map(([day, raw]) => ({ day, amount: Math.round(raw), target: nearestDay(days, day, maxGapDays) }))
      .sort((a, b) => cmpStr(a.day, b.day));
    /*
     * Qaytarilgan to'lov (xaridor tovarni qaytardi) avval o'sha tovar uchun yechilgan,
     * hech bir tirik sotuvga tushmagan to'lovni yopadi (eng yaqin oldingisidan): qaytgan
     * sotuv tirik pozitsiyalarda yo'q, ikkalasi birga nol. Ilgari yechilgani "hech qaysi
     * sotuvga tushmadi", qaytarilgani esa boshqa sotuvning foydasiga qo'shilib ketardi.
     */
    for (const refund of entries) {
      if (refund.amount >= 0) continue;
      for (let j = entries.length - 1; j >= 0 && refund.amount < 0; j -= 1) {
        const charge = entries[j];
        if (charge.amount <= 0 || charge.target !== null || charge.day > refund.day) continue;
        const k = Math.min(charge.amount, -refund.amount);
        charge.amount -= k;
        refund.amount += k;
      }
    }
    for (const { amount, target } of entries) {
      if (amount === 0) continue;
      const idx = target !== null ? lineDays?.get(target) : undefined;
      if (!idx || idx.length === 0) {
        unplaced.set(product, (unplaced.get(product) ?? 0) + amount);
        continue;
      }
      const weights = idx.map((i) => Math.max(0, base[i].revenue || 0));
      const shares = splitSigned(amount, weights.some((w) => w > 0) ? weights : idx.map(() => 1));
      idx.forEach((i, j) => {
        perLine[i] += shares[j];
      });
    }
  }
  return { perLine, unplaced };
}

// ─────────────────────────── Uzum ta'minlashlari ───────────────────────────

/** Qabul «Keldi» kunidan bir kun oldin ham (vaqt mintaqasi, ertasi kuni belgilangan) — partiya kelgan hisoblanadi */
export const SUPPLY_MATCH_DAYS = 1;
/** «Keldi» kech belgilangan bo'lishi mumkin: qabul undan ko'pi bilan shuncha kun oldin bo'lsa ham partiyaniki */
export const SUPPLY_LATE_DAYS = 14;
/** Hali qabul qilinmagan ta'minlash oldindan yaratiladi (vaqt band qilinadi) — kelgan kundan shuncha kun oldin ham */
export const SUPPLY_PENDING_DAYS = 14;
/** Ta'minlash partiyaga tegishli bo'lishi uchun umumiy kodlar ta'minlashning yoki partiyaning kamida shuncha ulushi */
export const SUPPLY_MATCH_SHARE = 0.5;

/** Kunni (YYYY-MM-DD) shuncha kunga suradi */
export const shiftIsoDay = (day: string, days: number): string =>
  new Date(Date.parse(`${day}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);

/** Bog'lash uchun partiya */
export interface SupplyMatchBatch {
  /** Bog'langan kodlar (`normSkuCode`) */
  codes: ReadonlySet<string>;
  /** Tovar sotuvchiga kelgan kun (eng erta «Keldi»), bo'lmasa jo'natilgan, bo'lmasa partiya yaratilgan kun */
  anchor: string;
  /** Eng erta jo'natilgan kun (Xitoydan); noma'lum — null */
  shippedFrom: string | null;
  /**
   * Kamida bitta jo'natmasi «Keldi»: hali kelmagan tovar Uzumda bo'lolmaydi. Yo'ldagi
   * partiya bir xil tovarning boshqa partiyasi ta'minlashini "o'g'irlamasin" — cargo
   * yo'lga chiqqanidan ikki kun keyingi qabul uniki emas.
   */
  canBeAtUzum: boolean;
  /** Sig'im — bog'langan qatorlar donasi: shuncha qabul qilingach partiya "to'ladi" */
  capacity: number;
}

/** Bog'lash uchun Uzum ta'minlashi */
export interface SupplyMatchSupply {
  /** Qabul qilingan kun; hali qabul qilinmagan bo'lsa — yaratilgan kun */
  day: string;
  accepted: boolean;
  codes: ReadonlySet<string>;
  /** Kod → dona (qabul qilingani; kutilayotganda — rejadagi) */
  units: ReadonlyMap<string, number>;
}

/**
 * Qaysi Uzum ta'minlashi qaysi partiyaniki (natija: ta'minlash → partiya o'rni yoki null).
 * Uzum buni aytmaydi — tovar kodlari, sanalar va partiya sig'imi bo'yicha topiladi.
 *
 * Ta'minlashlar kun tartibida ko'riladi; har biri unga mos partiyalardan (partiyalar
 * Xitoydan jo'natilgan tartibda — FIFO) biriga beriladi:
 *  • mos — umumiy kodlar ta'minlashning yoki partiyaning yarmidan ko'pi
 *    (`SUPPLY_MATCH_SHARE`); partiya «Keldi»; qabul jo'natilgan kundan oldin emas va
 *    «Keldi» kunidan `SUPPLY_LATE_DAYS` dan ko'p oldin emas (kech belgilangan sana);
 *  • donasi partiyaning qolgan sig'imiga aynan mos kelgani birinchi (egasining odati:
 *    bitta partiya — bitta ta'minlash, 129 dona ↔ 129 dona);
 *  • bo'lmasa — avval o'sha kunga kelib bo'lgan partiyalar, keyin «Keldi» kechroq
 *    yozilganlari; to'lgan partiya o'tkaziladi (bir xil tovar qayta olinganda keyingi
 *    ta'minlash keyingi partiyaniki); ta'minlashi bor partiya undan yangi partiya
 *    kelgach yopiladi (dona birligi mos kelmasa ham yangi partiya o'zinikini oladi).
 * Asosiy partiyada yo'q kodning donasi shu kodli boshqa partiyaga yoziladi (`extra`:
 * eski partiya qoldig'i keyingi ta'minlashda birga ketgan). Hech biriga to'g'ri
 * kelmagan qabul — partiyalarga kiritilmagan tovar (eski qoldiq).
 */
export function matchBatchSupplies(
  batches: readonly SupplyMatchBatch[],
  supplies: readonly SupplyMatchSupply[],
): (number | null)[] {
  return matchBatchSuppliesDetailed(batches, supplies).owner;
}

/** Ta'minlash ↔ partiya, kod bo'yicha qo'shimchalari bilan */
export interface SupplyMatch {
  /** Ta'minlash → asosiy partiya (yoki null) */
  owner: (number | null)[];
  /**
   * Ta'minlash → kod → boshqa partiya: asosiy partiyada yo'q kodning donasi (masalan,
   * eski partiya qoldig'i yangi partiya ta'minlashida birga yuborilgan). Bunday dona
   * "eski qoldiq" emas — o'sha partiyaniki.
   */
  extra: Map<string, number>[];
}

/** Dona soni partiyaning qolgan sig'imiga mos (Uzum bir-ikki donani kam qabul qilishi mumkin) */
const fitsExactly = (units: number, rem: number): boolean => rem > 0 && Math.abs(units - rem) <= Math.max(1, Math.round(rem * 0.03));

export function matchBatchSuppliesDetailed(
  batches: readonly SupplyMatchBatch[],
  supplies: readonly SupplyMatchSupply[],
): SupplyMatch {
  const owner: (number | null)[] = supplies.map(() => null);
  const extra: Map<string, number>[] = supplies.map(() => new Map());
  const order = supplies.map((_, i) => i).sort((a, b) => cmpStr(supplies[a].day, supplies[b].day) || a - b);
  const fifo = batches
    .map((_, i) => i)
    .sort((a, b) => cmpStr(batches[a].shippedFrom ?? batches[a].anchor, batches[b].shippedFrom ?? batches[b].anchor) || a - b);
  const rank = new Map(fifo.map((b, i) => [b, i]));
  const assigned = batches.map(() => 0);
  const hasSupply = batches.map(() => false);
  const rem = (b: number) => batches[b].capacity - assigned[b];

  /** Sana shartlari: «Keldi», Xitoydan chiqqandan keyin, «Keldi» kunidan juda oldin emas */
  const datesFit = (b: number, s: number): boolean => {
    const B = batches[b];
    const S = supplies[s];
    if (!B.canBeAtUzum) return false;
    if (S.accepted && B.shippedFrom && S.day < B.shippedFrom) return false;
    return S.day >= shiftIsoDay(B.anchor, -(S.accepted ? SUPPLY_LATE_DAYS : SUPPLY_PENDING_DAYS));
  };
  const fits = (b: number, s: number): boolean => {
    const B = batches[b];
    const S = supplies[s];
    if (B.codes.size === 0 || S.codes.size === 0 || !datesFit(b, s)) return false;
    let ov = 0;
    for (const c of S.codes) if (B.codes.has(c)) ov += 1;
    return ov > 0 && (ov / S.codes.size >= SUPPLY_MATCH_SHARE || ov / B.codes.size >= SUPPLY_MATCH_SHARE);
  };
  /** Partiya shu ta'minlash kuniga kelib bo'lgan (kutilayotgani oldindan yaratiladi) */
  const arrivedBy = (b: number, s: number): boolean =>
    batches[b].anchor <= shiftIsoDay(supplies[s].day, supplies[s].accepted ? SUPPLY_MATCH_DAYS : SUPPLY_PENDING_DAYS);
  /** Shu partiya kodlari bo'yicha ta'minlashdagi dona */
  const unitsFor = (b: number, s: number, codes: ReadonlySet<string> = batches[b].codes): number => {
    let n = 0;
    for (const [code, units] of supplies[s].units) if (codes.has(code)) n += Math.max(0, units);
    return n;
  };
  const take = (b: number, s: number, units: number) => {
    hasSupply[b] = true;
    assigned[b] += units;
  };

  for (const s of order) {
    const cands = fifo.filter((b) => fits(b, s) && rem(b) > 0);
    let pick: number | undefined;
    if (cands.length) {
      /*
       * 1) Donasi partiyaning qolgan sig'imiga aynan mos keladigani (129 dona ↔ 129 donali
       *    partiya): «Keldi» kech yozilgan yoki eski partiya qoldig'i keyinroq topshirilgan
       *    bo'lsa ham to'g'ri partiya topiladi.
       */
      // Bir nechtasiga aynan mos kelsa — hali birinchi ta'minlashini kutayotgani, keyin kelib bo'lgani
      const exact = cands.filter((b) => fitsExactly(unitsFor(b, s), rem(b)));
      pick =
        exact.find((b) => !hasSupply[b] && arrivedBy(b, s)) ??
        exact.find((b) => !hasSupply[b]) ??
        exact.find((b) => arrivedBy(b, s)) ??
        exact[0];
      if (pick === undefined) {
        // 2) Avval o'sha kunga kelib bo'lganlar; ta'minlashi bor eski partiya yangisi kelgach yopiq
        const ready = cands.filter((b) => arrivedBy(b, s));
        const late = cands.filter((b) => !arrivedBy(b, s));
        pick = [...ready, ...late].find((b) => !(hasSupply[b] && ready.some((n) => (rank.get(n) as number) > (rank.get(b) as number))));
      }
    }
    if (pick !== undefined) {
      owner[s] = pick;
      take(pick, s, unitsFor(pick, s));
    }
    /*
     * Asosiy partiyada yo'q kodlar — shu kodli boshqa partiyaga (FIFO, sig'imi bo'lsa,
     * sanasi to'g'ri kelsa; yangi partiya kelib bo'lgan bo'lsa ta'minlashi bor eskisi yopiq).
     * Aks holda u partiyalarga kiritilmagan tovar — eski qoldiq.
     */
    for (const [code, units] of supplies[s].units) {
      if (units <= 0 || (pick !== undefined && batches[pick].codes.has(code))) continue;
      const withCode = fifo.filter((b) => b !== pick && batches[b].codes.has(code) && datesFit(b, s) && rem(b) > 0);
      const ready = withCode.filter((b) => arrivedBy(b, s));
      const b2 = withCode.find((b) => !(hasSupply[b] && ready.some((n) => (rank.get(n) as number) > (rank.get(b) as number))));
      if (b2 === undefined) continue;
      extra[s].set(code, b2);
      take(b2, s, units);
    }
  }
  return { owner, extra };
}

// ─────────────────────────── Taqsimlash ───────────────────────────

/**
 * Pul holati (Pul oqimi sahifasi bilan bir xil, routes/payout.ts):
 *  • unlocked — xaridor qabul qilgan va Uzum ochgan, yechib olish mumkin;
 *  • held — xaridor qabul qilgan, Uzum ~10 kun ushlab turibdi;
 *  • transit — xaridorga hali yetkazilmoqda.
 */
export type ProfitMoneyState = 'unlocked' | 'held' | 'transit';

/** Partiyaning bitta qatori — bitta tovar to'plami (lot) */
export interface ProfitLotInput {
  batchId: string;
  /** Partiya yaratilgan payt (ISO) — bir kunda kelgan lotlar orasida tartib */
  batchCreatedAt: string;
  /** Qatorning partiyadagi o'rni */
  position: number;
  /** Dona */
  qty: number;
  /** Bog'langan kodlar (`normSkuCode`) */
  codes: readonly string[];
  /** Kelgan savdo kuni (YYYY-MM-DD); null — hali «Keldi» emas, sotuv olmaydi */
  availableFrom: string | null;
  /**
   * Hali «Keldi» bo'lmagan lot qaysi kundan sotuvchi qo'lida bo'lishi mumkin
   * (jo'natilgan kuni, bo'lmasa partiya yaratilgan kuni). Undan oldingi sotuv
   * bu lotga "ayblanmaydi": u hali sotib olinmagan yoki yo'lda edi. null — chegarasiz.
   */
  notBefore?: string | null;
  /**
   * false — lot hech qachon "ayblanmaydi" (notMarked/beforeArrival): mavjud
   * bo'lish kuni Uzum qabulidan aniq ma'lum, undan oldingi sotuv bu lotdan
   * bo'lolmaydi — u partiyalarga kiritilmagan tovardan. Standart: true.
   */
  blame?: boolean;
}

/** Eski qoldiq: hech qaysi partiyaga tegishli bo'lmagan, Uzum qabul qilgan dona */
export interface ProfitOpeningInput {
  /** `normSkuCode` */
  code: string;
  /** Qabul savdo kuni */
  day: string;
  units: number;
}

/** Bitta tirik buyurtma pozitsiyasi (bekor qilingan va qaytgan donasiz) */
export interface ProfitLineInput {
  /** Barqaror tartib uchun (OrderItem id) */
  id: string;
  /** `normSkuCode` */
  code: string;
  /** Buyurtma savdo kuni */
  day: string;
  /** Buyurtma payti (ms) — kun ichidagi tartib */
  at: number;
  units: number;
  /** Uzum to'laydigani (sellerProfit), so'm */
  payout: number;
  /** Sotuv summasi, so'm */
  revenue: number;
  /** Soliq, so'm */
  tax: number;
  /** Uzum reklamasining shu pozitsiyaga tushgan ulushi (`spreadAdFees`), so'm */
  adFee?: number;
  state: ProfitMoneyState;
}

/**
 * Sotuvsiz chiqim turi:
 *  • defect — brak: Uzum omborida brak deb turibdi yoki brak sifatida ombordan
 *    chiqarilgan (sizga qaytarish yoki utilizatsiya hujjati);
 *  • lost — Uzum hisobida yo'q: yo'qolgan, utilizatsiya qilingan, qabulda kam chiqqan;
 *  • returning — xaridor qaytargan yoki bekor qilgan, omborga qaytmoqda (vaqtincha);
 *  • toSeller — yaroqli tovar Uzum omboridan sizga qaytarilgan.
 */
export type ProfitOutKind = 'defect' | 'lost' | 'returning' | 'toSeller';
export const PROFIT_OUT_KINDS: readonly ProfitOutKind[] = ['defect', 'lost', 'returning', 'toSeller'];
/** Tannarxi foydadan ayriladigan (zarar) turlar; qolganlari — hali sotuvchiniki */
export const PROFIT_LOSS_KINDS: readonly ProfitOutKind[] = ['defect', 'lost'];
export type ProfitOutCounts = Record<ProfitOutKind, number>;
export const emptyOutCounts = (): ProfitOutCounts => ({ defect: 0, lost: 0, returning: 0, toSeller: 0 });

/**
 * Sotuvsiz chiqim hodisasi — sotuv kabi vaqt tartibida, o'sha kuni sotuvda turgan
 * eng eski manbadan (eski qoldiq yoki lot) yechiladi, lekin pulsiz.
 */
export interface ProfitOutflowInput {
  /** `normSkuCode` */
  code: string;
  /** Hodisa savdo kuni (YYYY-MM-DD) */
  day: string;
  /** Hodisa payti (ms) — kun ichidagi tartib; bir paytda sotuv oldin */
  at: number;
  units: number;
  kind: ProfitOutKind;
  /**
   * Aniq lot(lar) (`lots` dagi o'rni): hodisa bitta partiyaga tegishli (masalan, partiya
   * ta'minlashining qabulda kam chiqqani) — ro'yxat tartibida, sig'imi borlaridan.
   * Berilmasa — FIFO.
   */
  lot?: number | readonly number[] | null;
}

/** Pozitsiyaning bitta lotga tushgan qismi */
export interface ProfitPiece {
  /** `lines` dagi o'rni */
  line: number;
  units: number;
  payout: number;
  tax: number;
  revenue: number;
  adFee: number;
}

export interface ProfitMoneyByState {
  unlocked: number;
  held: number;
  transit: number;
}

/** Bitta lotning sotuvi */
export interface ProfitTake {
  sold: number;
  payout: number;
  tax: number;
  revenue: number;
  /** Uzum reklamasi */
  adFee: number;
  /** Qo'lga tegadigan pul (Uzum to'laydigani − reklama − soliq) holati bo'yicha */
  back: ProfitMoneyByState;
  firstDay: string | null;
  lastDay: string | null;
  /** Lot tugagan kun: oxirgi donasi sotilgan yoki sotuvsiz chiqqan kun */
  soldOutDay: string | null;
  /** Sotuvsiz chiqqan dona, turi bo'yicha (`ProfitOutflowInput`) */
  out: ProfitOutCounts;
  /** Oxirgi sotuvsiz chiqim kuni */
  lastOutDay: string | null;
  /** Shu lot kelishidan oldin sotilgan va hech qaysi lotga tushmagan dona (eski qoldiq yoki kelgan sana kech yozilgan) */
  beforeArrival: number;
  /** Lot «Keldi» emas, lekin uning tovaridan sotilgan va hech qaysi lotga tushmagan dona */
  notMarked: number;
  /** Shunday (beforeArrival yoki notMarked) birinchi sotuv kuni */
  firstBlameDay: string | null;
  pieces: ProfitPiece[];
}

/** Kod bo'yicha hech qaysi partiyaga tushmagan sotuv */
export interface ProfitLeftover {
  units: number;
  payout: number;
  tax: number;
  revenue: number;
  adFee: number;
  /** Eski qoldiqdan sotilgan */
  opening: number;
  /** Partiya (yoki eski qoldiq) kelishidan oldin */
  beforeArrival: number;
  /** Tovar partiyasi bor-u «Keldi» belgilanmagan */
  notMarked: number;
  /** Partiyalardagi sonidan ortiq */
  overTracked: number;
  /** Sotuvsiz chiqim — eski qoldiqdan (partiyaga tegishli emas) */
  outOpening: number;
  /** Sotuvsiz chiqim — o'sha kuni hech qaysi manbada dona qolmagan (ma'lumot mos emas) */
  outUnplaced: number;
}

export interface ProfitAllocation {
  /** `lots` bilan bir xil tartibda */
  lots: ProfitTake[];
  /** Eski qoldiq: `openings` bilan bir xil tartibda — nechtasi sotildi va sotuvsiz chiqdi */
  openings: { sold: number; out: number }[];
  /** Kod → hech qaysi partiyaga tushmagan sotuv */
  byCode: Map<string, ProfitLeftover>;
}

const emptyTake = (): ProfitTake => ({
  sold: 0,
  payout: 0,
  tax: 0,
  revenue: 0,
  adFee: 0,
  back: { unlocked: 0, held: 0, transit: 0 },
  firstDay: null,
  lastDay: null,
  soldOutDay: null,
  out: emptyOutCounts(),
  lastOutDay: null,
  beforeArrival: 0,
  notMarked: 0,
  firstBlameDay: null,
  pieces: [],
});

const emptyLeftover = (): ProfitLeftover => ({
  units: 0,
  payout: 0,
  tax: 0,
  revenue: 0,
  adFee: 0,
  opening: 0,
  beforeArrival: 0,
  notMarked: 0,
  overTracked: 0,
  outOpening: 0,
  outUnplaced: 0,
});

const cmpStr = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
const wholeUnits = (v: number): number => Math.max(0, Math.floor(v || 0));

/** Ro'yxatga qo'shish: nusxa ko'chirmasdan (katta ro'yxatda kvadratik bo'lmasin) */
function pushTo<K, V>(map: Map<K, V[]>, key: K, value: V): void {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}

/** Kod ro'yxatidagi bitta manba: partiya qatori yoki eski qoldiq */
type Slot = { kind: 'lot'; i: number; from: string } | { kind: 'open'; i: number; from: string };

/** Hech qaysi lotga tushmagan qism (sababi va "ayblangan" lot bilan) */
interface Stray {
  line: number;
  units: number;
  payout: number;
  tax: number;
  revenue: number;
  adFee: number;
  reason: 'beforeArrival' | 'notMarked' | 'overTracked';
  blame: number | null;
}

/** `units` donani bo'lakdan ajratib oladi (pul ham mutanosib, butun so'mda); bo'lak qolganiga kamayadi */
function splitOff(p: { units: number; payout: number; tax: number; revenue: number; adFee: number }, units: number) {
  const w = [units, p.units - units];
  const pay = splitSigned(p.payout, w);
  const tax = splitSigned(p.tax, w);
  const rev = splitSigned(p.revenue, w);
  const ad = splitSigned(p.adFee, w);
  p.units -= units;
  p.payout = pay[1];
  p.tax = tax[1];
  p.revenue = rev[1];
  p.adFee = ad[1];
  return { units, payout: pay[0], tax: tax[0], revenue: rev[0], adFee: ad[0] };
}

/**
 * Sotuvlarni lotlarga taqsimlash.
 *
 * Har kod uchun manbalar ro'yxati: eski qoldiq (qabul kuni bo'yicha) va «Keldi»
 * lotlar (kelgan kuni, keyin partiya yaratilgan payti, id, qator o'rni bo'yicha —
 * ro'yxatdagi joyi hech qachon). Bir nechta kodli lot (ranglar) hamma kodning
 * ro'yxatida turadi, qoldig'i umumiy.
 *
 * Sotuvlar vaqt bo'yicha (kun, payt, id) ko'riladi. Har pozitsiya o'z kodining
 * eng eski, sotuv kunigacha kelgan, donasi qolgan manbasidan oladi; yetmasa
 * keyingisidan. Qolgani — hech qaysi partiyaga tushmagan sotuv, sababi bilan:
 *  • notMarked — shu tovarning «Keldi» belgilanmagan, sotuv kunida mavjud
 *    bo'lishi mumkin bo'lgan (`notBefore`) lot(lar)i bor — birinchisiga. Sotuvdan
 *    keyin keladigan lot ham bo'lsa, u eskiroq (oldin yaratilgan) bo'lgandagina;
 *  • beforeArrival — keyingi manba sotuvdan keyin kelgan (u lotga "yoziladi");
 *  • overTracked — partiyalardagi barcha dona allaqachon sotilgan.
 *
 * `rebalance` (standart: ha): bir nechta kodli lot (ranglar bitta qatorda)
 * bitta rangning sotuvi bilan "yeyilib", boshqa rangning sotuvi partiyasiz
 * qolsa — o'sha rangning sotuvlari o'zining keyingi lotiga (o'sha kuni kelgan,
 * joyi bor) ko'chiriladi va bo'shagan dona partiyasiz qolgan sotuvga beriladi.
 * Haqiqatda bitta qatorning har rangidan nechtadan borligi noma'lum — shunday
 * taqsimot ham to'g'ri va hech narsa partiyasiz qolmaydi.
 *
 * `outflows` — sotuvsiz chiqim (brak, yo'qolgan, qaytayotgan, sizga qaytarilgan):
 * sotuvlar bilan bitta vaqt chizig'ida (bir paytda — sotuv oldin), sotuv kabi
 * o'sha kuni donasi bor eng eski manbadan, lekin pulsiz. `lot` berilgani — faqat
 * o'sha lotdan. Joy topilmagani `outUnplaced`: hech qaysi lot "ayblanmaydi".
 * Qayta taqsimlash sotuvsiz chiqimni ko'chirmaydi (u lot qoldig'ini kamaytirgan, xolos).
 */
export function allocateBatchSales(
  lots: readonly ProfitLotInput[],
  openings: readonly ProfitOpeningInput[],
  lines: readonly ProfitLineInput[],
  options: { rebalance?: boolean; outflows?: readonly ProfitOutflowInput[] } = {},
): ProfitAllocation {
  const rebalance = options.rebalance ?? true;
  const outs = options.outflows ?? [];
  const takes = lots.map(() => emptyTake());
  const lotLeft = lots.map((l) => wholeUnits(l.qty));
  const openLeft = openings.map((o) => wholeUnits(o.units));
  const openOut = openings.map(() => ({ sold: 0, out: 0 }));
  const byCode = new Map<string, ProfitLeftover>();
  const leftoverOf = (code: string): ProfitLeftover => {
    const cur = byCode.get(code);
    if (cur) return cur;
    const fresh = emptyLeftover();
    byCode.set(code, fresh);
    return fresh;
  };

  const uniq = (codes: readonly string[]) => [...new Set(codes)];
  const byCreated = (a: number, b: number): number =>
    cmpStr(lots[a].batchCreatedAt, lots[b].batchCreatedAt) ||
    cmpStr(lots[a].batchId, lots[b].batchId) ||
    lots[a].position - lots[b].position;

  const ready = lots
    .map((_, i) => i)
    .filter((i) => lots[i].availableFrom && lotLeft[i] > 0 && lots[i].codes.length > 0)
    .sort((a, b) => cmpStr(lots[a].availableFrom as string, lots[b].availableFrom as string) || byCreated(a, b));
  const waiting = lots
    .map((_, i) => i)
    .filter((i) => !lots[i].availableFrom && lotLeft[i] > 0 && lots[i].codes.length > 0 && lots[i].blame !== false)
    .sort(byCreated);

  const slots = new Map<string, Slot[]>();
  openings
    .map((_, i) => i)
    .filter((i) => openLeft[i] > 0)
    .sort((a, b) => cmpStr(openings[a].day, openings[b].day) || a - b)
    .forEach((i) => pushTo(slots, openings[i].code, { kind: 'open', i, from: openings[i].day }));
  for (const i of ready) for (const code of uniq(lots[i].codes)) pushTo<string, Slot>(slots, code, { kind: 'lot', i, from: lots[i].availableFrom as string });
  // Eski qoldiq va lotlar birga, kun bo'yicha; bir kunda — eski qoldiq oldin (barqaror saralash)
  for (const list of slots.values()) list.sort((a, b) => cmpStr(a.from, b.from) || (a.kind === b.kind ? 0 : a.kind === 'open' ? -1 : 1));

  const waitingOf = new Map<string, number[]>();
  for (const i of waiting) for (const code of uniq(lots[i].codes)) pushTo(waitingOf, code, i);
  /** Sotuv kunida mavjud bo'lishi mumkin bo'lgan birinchi «Keldi» belgilanmagan lot */
  const waitingAt = (code: string, day: string): number | undefined =>
    waitingOf.get(code)?.find((i) => !lots[i].notBefore || (lots[i].notBefore as string) <= day);

  const left = (s: Slot): number => (s.kind === 'lot' ? lotLeft[s.i] : openLeft[s.i]);
  const ptr = new Map<string, number>();
  const strays: Stray[] = [];

  const lineOrder = (a: number, b: number): number =>
    cmpStr(lines[a].day, lines[b].day) || lines[a].at - lines[b].at || cmpStr(lines[a].id, lines[b].id) || a - b;
  const order = lines.map((_, k) => k).sort(lineOrder);

  /*
   * Sotuvsiz chiqim — sotuv kabi: o'sha kuni donasi bor eng eski manbadan (ko'rsatkich
   * bilan bir xil yurish), pulsiz. Aniq lotga tegishlisi — faqat o'sha lotdan.
   */
  const consumeOut = (o: ProfitOutflowInput): void => {
    let need = wholeUnits(o.units);
    if (need === 0) return;
    const toLot = (i: number, n: number): void => {
      lotLeft[i] -= n;
      takes[i].out[o.kind] += n;
      takes[i].lastOutDay = takes[i].lastOutDay && takes[i].lastOutDay > o.day ? takes[i].lastOutDay : o.day;
    };
    if (o.lot !== undefined && o.lot !== null) {
      const pins: readonly number[] = typeof o.lot === 'number' ? [o.lot] : o.lot;
      for (const i of pins) {
        if (need <= 0) break;
        if (!Number.isInteger(i) || i < 0 || i >= lots.length) continue;
        const n = Math.min(lotLeft[i], need);
        if (n > 0) toLot(i, n);
        need -= n;
      }
      if (need > 0) leftoverOf(o.code).outUnplaced += need;
      return;
    }
    const list = slots.get(o.code) ?? [];
    let p = ptr.get(o.code) ?? 0;
    while (p < list.length && left(list[p]) === 0) p += 1;
    ptr.set(o.code, p);
    for (let j = p; need > 0 && j < list.length; j += 1) {
      const slot = list[j];
      if (slot.from > o.day) break;
      const n = Math.min(left(slot), need);
      if (n <= 0) continue;
      if (slot.kind === 'lot') toLot(slot.i, n);
      else {
        openLeft[slot.i] -= n;
        openOut[slot.i].out += n;
        leftoverOf(o.code).outOpening += n;
      }
      need -= n;
    }
    if (need > 0) leftoverOf(o.code).outUnplaced += need;
  };

  /** Sotuvlar va sotuvsiz chiqimlar bitta vaqt chizig'ida: kun, payt; bir paytda — sotuv oldin */
  const outOrder = outs
    .map((_, k) => k)
    .sort((a, b) => cmpStr(outs[a].day, outs[b].day) || outs[a].at - outs[b].at || a - b);
  const timeline: { sale: boolean; k: number }[] = [];
  for (let a = 0, b = 0; a < order.length || b < outOrder.length; ) {
    const s = a < order.length ? lines[order[a]] : null;
    const o = b < outOrder.length ? outs[outOrder[b]] : null;
    const saleFirst = s !== null && (o === null || cmpStr(s.day, o.day) < 0 || (s.day === o.day && s.at <= o.at));
    if (saleFirst) timeline.push({ sale: true, k: order[a++] });
    else timeline.push({ sale: false, k: outOrder[b++] });
  }

  for (const ev of timeline) {
    if (!ev.sale) {
      consumeOut(outs[ev.k]);
      continue;
    }
    const k = ev.k;
    const s = lines[k];
    const units = wholeUnits(s.units);
    if (units === 0) continue;
    const list = slots.get(s.code) ?? [];

    // Tugagan manbalar boshidan o'tkazib yuboriladi — ko'rsatkich faqat oldinga yuradi
    let p = ptr.get(s.code) ?? 0;
    while (p < list.length && left(list[p]) === 0) p += 1;
    ptr.set(s.code, p);

    let need = units;
    const parts: { slot: Slot; units: number }[] = [];
    let blockedBy: Slot | null = null;
    for (let j = p; need > 0 && j < list.length; j += 1) {
      const slot = list[j];
      // Ro'yxat kun bo'yicha: bu manba hali kelmagan bo'lsa, keyingilari ham
      if (slot.from > s.day) {
        blockedBy = slot;
        break;
      }
      const have = left(slot);
      if (have <= 0) continue;
      const take = Math.min(have, need);
      if (slot.kind === 'lot') lotLeft[slot.i] -= take;
      else openLeft[slot.i] -= take;
      parts.push({ slot, units: take });
      need -= take;
    }

    // Pul bo'laklari: lotlar, eski qoldiq va (qolgan bo'lsa) hech qaysi partiyaga tushmagan qism
    const weights = [...parts.map((x) => x.units), need];
    const payouts = splitSigned(s.payout, weights);
    const taxes = splitSigned(s.tax, weights);
    const revenues = splitSigned(s.revenue, weights);
    const ads = splitSigned(s.adFee ?? 0, weights);

    parts.forEach((part, idx) => {
      if (part.slot.kind === 'open') {
        openOut[part.slot.i].sold += part.units;
        const cur = leftoverOf(s.code);
        cur.units += part.units;
        cur.opening += part.units;
        cur.payout += payouts[idx];
        cur.tax += taxes[idx];
        cur.revenue += revenues[idx];
        cur.adFee += ads[idx];
        return;
      }
      takes[part.slot.i].pieces.push({
        line: k,
        units: part.units,
        payout: payouts[idx],
        tax: taxes[idx],
        revenue: revenues[idx],
        adFee: ads[idx],
      });
    });

    if (need > 0) {
      const w = waitingAt(s.code, s.day);
      // Eskiroq, «Keldi» belgilanmagan lot — sotuvdan keyin keladigan yangi lotdan ko'ra ehtimolliroq manba
      const preferWaiting = w !== undefined && (blockedBy?.kind !== 'lot' || byCreated(w, blockedBy.i) < 0);
      const last = parts.length;
      strays.push({
        line: k,
        units: need,
        payout: payouts[last],
        tax: taxes[last],
        revenue: revenues[last],
        adFee: ads[last],
        ...(preferWaiting
          ? { reason: 'notMarked' as const, blame: w as number }
          : blockedBy
            ? {
                reason: 'beforeArrival' as const,
                blame: blockedBy.kind === 'lot' && lots[blockedBy.i].blame !== false ? blockedBy.i : null,
              }
            : { reason: 'overTracked' as const, blame: null }),
      });
    }
  }

  if (rebalance && strays.length > 0) {
    /*
     * Ish ko'chirilishi mumkin bo'lgan narsaga mutanosib bo'lsin (sinxron hisob, katta do'kon):
     *  • har lotning bo'laklari kod bo'yicha alohida ro'yxatda, vaqt tartibida;
     *  • har kod uchun "donasi qolgan birinchi lot" ko'rsatkichi faqat oldinga yuradi
     *    (qayta taqsimlashda qoldiq hech qachon ko'paymaydi);
     *  • sheriklarining (bir lotdagi boshqa ranglar) hech birida joy qolmagan kod —
     *    "o'lik": uning keyingi partiyasiz sotuvlari ko'rilmaydi.
     */
    const codeLists = takes.map((t) => {
      const m = new Map<string, ProfitPiece[]>();
      for (const pc of t.pieces) pushTo(m, lines[pc.line].code, pc);
      return m;
    });
    const listOf = (lot: number, code: string): ProfitPiece[] => {
      const cur = codeLists[lot].get(code);
      if (cur) return cur;
      const fresh: ProfitPiece[] = [];
      codeLists[lot].set(code, fresh);
      return fresh;
    };
    const spareAt = new Map<string, number>();
    /** Shu kodning `except` dan boshqa, donasi qolgan, eng erta kelgan lot sloti; yo'q bo'lsa null */
    const firstSpare = (code: string, except: number): Slot | null => {
      const list = slots.get(code) ?? [];
      let p = spareAt.get(code) ?? 0;
      while (p < list.length && (list[p].kind !== 'lot' || lotLeft[list[p].i] === 0)) p += 1;
      spareAt.set(code, p);
      for (let j = p; j < list.length; j += 1) {
        const s = list[j];
        if (s.kind === 'lot' && s.i !== except && lotLeft[s.i] > 0) return s;
      }
      return null;
    };
    /** Bo'lak ro'yxatga vaqt tartibini buzmay qo'shiladi (orqadan ko'rish va to'xtash shunga tayanadi) */
    const insertByTime = (list: ProfitPiece[], piece: ProfitPiece) => {
      let lo = 0;
      let hi = list.length;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (lineOrder(list[mid].line, piece.line) <= 0) lo = mid + 1;
        else hi = mid;
      }
      list.splice(lo, 0, piece);
    };
    const pooledOf = new Map<string, number[]>();
    for (const i of ready) if (lots[i].codes.length > 1) for (const code of uniq(lots[i].codes)) pushTo(pooledOf, code, i);
    const dead = new Set<string>();
    const gained: ProfitPiece[] = [];

    for (const e of strays) {
      const X = lines[e.line].code;
      const day = lines[e.line].day;
      const pooled = pooledOf.get(X);
      if (!pooled || dead.has(X)) continue;
      if (!pooled.some((L) => uniq(lots[L].codes).some((Y) => Y !== X && firstSpare(Y, L) !== null))) {
        dead.add(X);
        continue;
      }
      for (const L of pooled) {
        if (e.units === 0) break;
        if ((lots[L].availableFrom as string) > day) continue;
        for (const Y of uniq(lots[L].codes)) {
          if (Y === X || e.units === 0) continue;
          const list = codeLists[L].get(Y);
          if (!list) continue;
          // Boshqa rangning eng so'nggi sotuvlaridan boshlab
          for (let pi = list.length - 1; pi >= 0 && e.units > 0; pi -= 1) {
            const piece = list[pi];
            if (piece.units === 0) continue;
            const pday = lines[piece.line].day;
            let moved = false;
            // Bitta bo'lak bir nechta lotga bo'linishi mumkin: joy tugaguncha keyingi lotga
            while (piece.units > 0 && e.units > 0) {
              const t = firstSpare(Y, L);
              if (!t || t.from > pday) break;
              const n = Math.min(piece.units, lotLeft[t.i], e.units);
              insertByTime(listOf(t.i, Y), { line: piece.line, ...splitOff(piece, n) });
              lotLeft[t.i] -= n;
              // Bo'shagan dona — partiyasiz qolgan sotuvga (lot ro'yxatiga sikl tugagach qo'shiladi)
              gained.push({ line: e.line, ...splitOff(e, n) });
              moved = true;
            }
            // Eng erta bo'sh joy ham bu sotuvdan keyin keladi — undan eskilari uchun ham joy yo'q
            if (!moved) break;
          }
        }
        for (const g of gained.splice(0)) insertByTime(listOf(L, X), g);
      }
    }
    codeLists.forEach((m, i) => {
      takes[i].pieces = [...m.values()].flat();
    });
  }

  // Lot natijalari bo'laklardan: bir pozitsiyaning bir lotdagi bo'laklari bitta qilinadi
  takes.forEach((t, i) => {
    const merged = new Map<number, ProfitPiece>();
    for (const pc of t.pieces) {
      if (pc.units === 0) continue;
      const cur = merged.get(pc.line);
      if (cur) {
        cur.units += pc.units;
        cur.payout += pc.payout;
        cur.tax += pc.tax;
        cur.revenue += pc.revenue;
        cur.adFee += pc.adFee;
      } else merged.set(pc.line, { ...pc });
    }
    t.pieces = [...merged.values()].sort((a, b) => lineOrder(a.line, b.line));
    for (const pc of t.pieces) {
      t.sold += pc.units;
      t.payout += pc.payout;
      t.tax += pc.tax;
      t.revenue += pc.revenue;
      t.adFee += pc.adFee;
      t.back[lines[pc.line].state] += pc.payout - pc.tax - pc.adFee;
    }
    t.firstDay = t.pieces.length ? lines[t.pieces[0].line].day : null;
    t.lastDay = t.pieces.length ? lines[t.pieces[t.pieces.length - 1].line].day : null;
    // Tugagan kun — oxirgi sotuv yoki oxirgi sotuvsiz chiqim (qaysi keyin bo'lsa)
    const end = t.lastDay && t.lastOutDay ? (t.lastDay > t.lastOutDay ? t.lastDay : t.lastOutDay) : (t.lastDay ?? t.lastOutDay);
    t.soldOutDay = lotLeft[i] === 0 && end ? end : null;
  });

  for (const e of strays) {
    if (e.units === 0) continue;
    const cur = leftoverOf(lines[e.line].code);
    cur.units += e.units;
    cur.payout += e.payout;
    cur.tax += e.tax;
    cur.revenue += e.revenue;
    cur.adFee += e.adFee;
    cur[e.reason] += e.units;
    if (e.blame !== null && e.reason !== 'overTracked') {
      const t = takes[e.blame];
      t[e.reason] += e.units;
      t.firstBlameDay ??= lines[e.line].day;
    }
  }

  return { lots: takes, openings: openOut, byCode };
}

// ─────────────────────────── Partiya xulosasi ───────────────────────────

/**
 * Partiya holati:
 *  • empty — hisoblashga narsa yo'q (sotiladigan qator yo'q);
 *  • waiting — hech bir qatori hali sotuvda emas (`BatchStage` qaysi bosqichda ekanini aytadi);
 *  • unlinked — sotuvda, lekin sotuvdagi qatorlari Uzum tovariga bog'lanmagan;
 *  • selling — sotilmoqda;
 *  • paidBack — qaytgan pul tikilgan puldan oshdi.
 */
export type BatchProfitState = 'empty' | 'waiting' | 'unlinked' | 'selling' | 'paidBack';

/**
 * Tovar qayerda (qator yoki butun partiya):
 *  • warehouse — Xitoy omborida; shipped — cargo yo'lda; arrived — keldi, Uzumga hali topshirilmagan;
 *  • toUzum — Uzum ta'minlashi yaratilgan (rejada yoki omborga yo'lda);
 *  • accepting — Uzum ombori qabul qilmoqda ("Qabul qilish jarayonida");
 *  • selling — Uzum qabul qilgan, sotuvda; soldOut — hammasi sotilgan.
 * Sotuv faqat `selling` dan boshlab partiyaga yoziladi.
 */
export type BatchStage = 'warehouse' | 'shipped' | 'arrived' | 'toUzum' | 'accepting' | 'selling' | 'soldOut';

/** Uzum ta'minlashi (FBO nakladnoy) holati — partiya uchun kerakli qismi */
export type BatchSupplyStatus = 'planned' | 'in_transit' | 'accepting' | 'accepted';

/** Qator bo'yicha hisob uchun kirish (server yig'adi) */
export interface ProfitRowInput {
  name: string;
  link: BatchRowLink;
  qty: number;
  /** Tovar + cargo + qo'shimcha xarajat ulushi, so'm (calcBatch: total + extraShare) */
  cost: number;
  /** Qatorning jo'natmasi holati */
  legStatus: ShipmentStatus;
  /** Lot sotuvi; bog'lanmagan qatorda null */
  take: ProfitTake | null;
  /**
   * Sotuvchi ataylab "Uzumda yo'q" deb belgilagan (qadoq, sovg'a, boshqa joyda
   * sotiladigan): puli tikilganda, partiyaning umumiy xarajati sifatida sotilgan
   * ulushga qarab tan olinadi; "bog'lanmagan" deb sanalmaydi
   */
  optedOut?: boolean;
  /** Qator sotuvdami (Uzum qabul qilgan). Berilmasa — `legStatus === 'arrived'` (eski qoida) */
  onSale?: boolean;
  /** Qator bosqichi. Berilmasa — `onSale` va `legStatus` dan */
  stage?: BatchStage;
  /** Sotuvga chiqqan kun (YYYY-MM-DD) */
  onSaleFrom?: string | null;
  /**
   * Qolgan donadan Uzum'da hozir turgani (server Uzum qoldig'ini yangi partiyalardan
   * boshlab taqsimlaydi): sotuvda va sotuvdan tashqari (fotostudiya, qo'shimcha
   * ombor). null — noma'lum (nakladnoysiz sotuvchi, qator hali sotuvda emas).
   */
  stock?: { onSale: number; elsewhere: number } | null;
}

/** Qator bosqichi: berilgani, bo'lmasa sotuvda/jo'natma holatidan */
export function rowStage(row: Pick<ProfitRowInput, 'stage' | 'onSale' | 'legStatus'>): BatchStage {
  if (row.stage) return row.stage;
  if (row.onSale ?? row.legStatus === 'arrived') return 'selling';
  // Jo'natma holatlari (warehouse/shipped/arrived) bosqichlarning bir qismi
  return row.legStatus;
}

/** Partiya bosqichi uchun ustunlik: eng ilgari ketgan qator partiyaning holati */
const STAGE_ORDER: readonly BatchStage[] = ['selling', 'accepting', 'toUzum', 'arrived', 'shipped', 'warehouse'];

export interface BatchProfitRowCalc {
  /** Sotuvga qo'yilgan pul: shaxsiy/namuna qatorda 0 (u alohida, `personalCost`) */
  invested: number;
  sold: number;
  /** Sotuvsiz chiqqan dona, turi bo'yicha */
  out: ProfitOutCounts;
  /** Zarar bo'lgan dona: brak + yo'qolgan */
  lost: number;
  /** Ularning tannarxi — foydadan ayriladi */
  lossCost: number;
  /**
   * Qolgan dona — hali sizniki, sotilmagan (qaytayotgan va sizga qaytarilgani ham
   * shu yerda); bog'lanmagan qatorda — barcha donasi
   */
  left: number;
  /**
   * Qolganidan qayerda turgani (qaytayotgan va sizga qaytarilgandan tashqari): Uzum'da
   * sotuvda, Uzum'da sotuvdan tashqari va Uzum omborida ko'rinmayotgani. null — noma'lum
   */
  stock: { onSale: number; elsewhere: number; missing: number } | null;
  payout: number;
  tax: number;
  revenue: number;
  /** Uzum reklamasining shu qator sotuvlariga tushgan ulushi */
  adFee: number;
  /** Qaytgan pul = Uzum to'laydigani − reklama − soliq */
  moneyBack: number;
  /** Shundan hali kutilayotgani (ushlab turilgan + yo'ldagi) */
  pendingBack: number;
  /** Sotilganlar tannarxi */
  cogs: number;
  /** Qolgan dona tannarxi (zarar bo'lganlarsiz) */
  leftCost: number;
  /** Sotilgan donadan foyda, brak va yo'qolgan tannarxi ayrilgan; bog'lanmagan/shaxsiy qatorda null */
  profit: number | null;
  /** Foyda ÷ sotilganlar tannarxi, % */
  roi: number | null;
}

export interface BatchProfitTotals {
  state: BatchProfitState;
  /** Tikilgan pul: shaxsiy/namunadan tashqari barcha qatorlar + qatorlarga bo'linmagan xarajat */
  invested: number;
  /** Shaxsiy va namuna tovarlar (tikilganga kirmaydi) */
  personalCost: number;
  personalRows: number;
  /** Sotuvchi «Uzumda yo'q» deb belgilagan qatorlar (donasi sotiladigan donaga kirmaydi) */
  optedOutRows: number;
  payout: number;
  tax: number;
  revenue: number;
  /** Uzum reklamasi (qaytgan puldan ayrilgan) */
  adFee: number;
  /** Qaytgan pul = Uzum to'laydigani − reklama − soliq */
  moneyBack: number;
  /** Qaytgan pul holati bo'yicha */
  back: ProfitMoneyByState;
  cogs: number;
  /**
   * Sotilgan donadan foyda: Σ (qaytgan − tannarx − brak va yo'qolgan tannarxi) −
   * umumiy xarajatning tugagan ulushi. Hammasi sotilgan yoki zarar bo'lganda
   * aynan qaytgan − tikilgan.
   */
  profit: number;
  roi: number | null;
  /** Qaytgan ÷ tikilgan, % */
  paybackPct: number | null;
  /** Tikilgan pul qaytishiga yana qancha kerak */
  toPayback: number;
  /** Shuncha dona yana sotilsa tikilgan pul qaytadi (hozirgi o'rtacha bilan) */
  breakEvenQty: number | null;
  /** Qolgani ham hozirgidek ustama bilan sotilsa — taxminiy yakuniy foyda */
  expectedProfit: number | null;
  qty: number;
  soldQty: number;
  /** Sotuvsiz chiqqan dona, turi bo'yicha (bog'langan qatorlar) */
  out: ProfitOutCounts;
  /** Zarar bo'lgan dona: brak + yo'qolgan */
  lostQty: number;
  /** Ularning tannarxi — foydadan ayrilgan */
  lossCost: number;
  /** Kelgan, bog'langan, sotilmagan va zarar bo'lmagan (qaytayotgan, sizga qaytarilgani ham) */
  leftQty: number;
  leftCost: number;
  /** Qolganidan Uzum'da sotuvda turgani */
  onSaleQty: number;
  /** Uzum'da, lekin sotuvdan tashqari (fotostudiya, qo'shimcha ombor) */
  elsewhereQty: number;
  /** Partiyada qolgan, lekin Uzum omborida ko'rinmayotgani (yuborilmagan, qabul qilinmagan, noto'g'ri bog'langan) */
  missingQty: number;
  /** Sotuvdagi qatorlarning qayerdaligi noma'lum qolgani (nakladnoysiz sotuvchi) */
  restQty: number;
  /** Bog'langan, lekin hali kelmagan */
  transitQty: number;
  /** Bog'lanmagan qatorlar */
  unlinkedRows: number;
  unlinkedQty: number;
  unlinkedCost: number;
  /** Soni yo'q, lekin puli bor qatorlar (umumiy xarajat sifatida) */
  noQtyRows: number;
  /** Umumiy xarajat: qatorlarga bo'linmagan qo'shimcha xarajat, soni yo'q va "Uzumda yo'q" qatorlar puli */
  overhead: number;
  /** Umumiy xarajatning hozirgacha (sotilgan ulushga qarab) foydadan ayrilgan qismi */
  overheadNow: number;
  beforeArrival: number;
  notMarked: number;
  firstSaleAt: string | null;
  lastSaleAt: string | null;
  /** Hammasi sotilgan kun (bog'langan barcha qator sotilgan, kelmagan/bog'lanmagani yo'q) */
  soldOutAt: string | null;
  /** Partiya qayerda: eng ilgari ketgan sotiladigan qatori bo'yicha; hammasi sotilgan bo'lsa soldOut */
  stage: BatchStage;
  /** Sotuvga chiqqan birinchi kun (YYYY-MM-DD) */
  onSaleFrom: string | null;
}

const pctOf =(part: number, whole: number): number | null => (whole > 0 ? Math.round((part / whole) * 1000) / 10 : null);

/** Bitta qatorning hisobi */
export function profitRow(row: ProfitRowInput): BatchProfitRowCalc {
  const qty = wholeUnits(row.qty);
  const cost = Math.round(row.cost || 0);
  const t = row.take;
  const personal = row.link === 'personal';
  if (!t || row.link === 'none' || personal) {
    return {
      invested: personal ? 0 : cost,
      sold: 0,
      out: emptyOutCounts(),
      lost: 0,
      lossCost: 0,
      left: qty,
      stock: null,
      payout: 0,
      tax: 0,
      revenue: 0,
      adFee: 0,
      moneyBack: 0,
      pendingBack: 0,
      cogs: 0,
      leftCost: cost,
      profit: null,
      roi: null,
    };
  }
  const sold = Math.min(qty, t.sold);
  // Sotuvsiz chiqim lot donasidan oshmaydi (taqsimlash ham shunday) — ehtiyot uchun kesiladi
  const out = emptyOutCounts();
  let room = qty - sold;
  for (const kind of PROFIT_OUT_KINDS) {
    const n = Math.min(room, wholeUnits(t.out?.[kind] ?? 0));
    out[kind] = n;
    room -= n;
  }
  const lost = out.defect + out.lost;
  // Yaxlitlash yig'ilib ketmasin: hammasi sotilgan yoki zarar bo'lganda tannarx aynan qator puli
  const cogs = qty > 0 ? Math.round((cost * sold) / qty) : 0;
  const lossCost = qty > 0 ? Math.round((cost * (sold + lost)) / qty) - cogs : 0;
  const adFee = t.adFee ?? 0;
  const moneyBack = t.payout - t.tax - adFee;
  const profit = moneyBack - cogs - lossCost;
  const left = qty - sold - lost;
  const atUzum = left - out.returning - out.toSeller;
  const stock = row.stock
    ? (() => {
        const onSale = Math.min(atUzum, wholeUnits(row.stock.onSale));
        const elsewhere = Math.min(atUzum - onSale, wholeUnits(row.stock.elsewhere));
        return { onSale, elsewhere, missing: atUzum - onSale - elsewhere };
      })()
    : null;
  return {
    invested: cost,
    sold,
    out,
    lost,
    lossCost,
    left,
    stock,
    payout: t.payout,
    tax: t.tax,
    revenue: t.revenue,
    adFee,
    moneyBack,
    pendingBack: t.back.held + t.back.transit,
    cogs,
    leftCost: cost - cogs - lossCost,
    profit,
    roi: cogs + lossCost > 0 ? pctOf(profit, cogs + lossCost) : null,
  };
}

/**
 * Partiya xulosasi. `undistributedExtra` — qo'shimcha xarajatning hech bir qatorga
 * tushmagan qismi (calcBatch: totals.extra − Σ extraShare).
 */
export function summarizeBatchProfit(rows: readonly ProfitRowInput[], undistributedExtra: number): BatchProfitTotals {
  const calcs = rows.map(profitRow);
  const sum = (f: (c: BatchProfitRowCalc, i: number) => number) => calcs.reduce((a, c, i) => a + f(c, i), 0);
  const isLot = (i: number) => (rows[i].link === 'explicit' || rows[i].link === 'name') && wholeUnits(rows[i].qty) > 0;
  const isPersonal = (i: number) => rows[i].link === 'personal';
  const isOptedOut = (i: number) => rows[i].link === 'none' && Boolean(rows[i].optedOut);
  // Sotuvda: Uzum qabul qilgan (server `onSale` beradi); berilmasa — eski qoida, «Keldi»
  const arrived = (i: number) => rows[i].onSale ?? rows[i].legStatus === 'arrived';

  const extra = Math.max(0, Math.round(undistributedExtra || 0));
  const noQty = rows.map((r, i) => !isPersonal(i) && !isOptedOut(i) && wholeUnits(r.qty) === 0 && Math.round(r.cost || 0) !== 0);
  const overhead = extra + sum((c, i) => (noQty[i] || isOptedOut(i) ? c.invested : 0));
  const invested = sum((c) => c.invested) + extra;
  const personalCost = rows.reduce((a, r, i) => a + (isPersonal(i) ? Math.round(r.cost || 0) : 0), 0);

  const lotCost = sum((c, i) => (isLot(i) ? c.invested : 0));
  const cogs = sum((c, i) => (isLot(i) ? c.cogs : 0));
  const lossCost = sum((c, i) => (isLot(i) ? c.lossCost : 0));
  const lotQty = rows.reduce((a, r, i) => a + (isLot(i) ? wholeUnits(r.qty) : 0), 0);
  const lotSold = sum((c, i) => (isLot(i) ? c.sold : 0));
  const lotLost = sum((c, i) => (isLot(i) ? c.lost : 0));
  /*
   * Bo'linmagan xarajat tugagan (sotilgan yoki zarar bo'lgan) ulushga qarab tan olinadi —
   * hammasi tugaganda to'liq. Ulush tannarx bo'yicha; sotiladigan qatorlarning narxi hali
   * yozilmagan bo'lsa (tannarxi 0) — dona bo'yicha, aks holda xarajat hech qachon ayrilmasdi.
   */
  const overheadNow =
    lotCost > 0
      ? Math.round((overhead * (cogs + lossCost)) / lotCost)
      : lotQty > 0
        ? Math.round((overhead * (lotSold + lotLost)) / lotQty)
        : 0;
  const moneyBack = sum((c) => c.moneyBack);
  const profit = sum((c, i) => (isLot(i) ? (c.profit ?? 0) : 0)) - overheadNow;
  const back: ProfitMoneyByState = { unlocked: 0, held: 0, transit: 0 };
  for (const r of rows) {
    if (!r.take || !(r.link === 'explicit' || r.link === 'name')) continue;
    back.unlocked += r.take.back.unlocked;
    back.held += r.take.back.held;
    back.transit += r.take.back.transit;
  }

  const qty = rows.reduce((a, r, i) => a + (isPersonal(i) || isOptedOut(i) ? 0 : wholeUnits(r.qty)), 0);
  const soldQty = sum((c, i) => (isLot(i) ? c.sold : 0));
  const out = emptyOutCounts();
  calcs.forEach((c, i) => {
    if (!isLot(i)) return;
    for (const kind of PROFIT_OUT_KINDS) out[kind] += c.out[kind];
  });
  const leftQty = sum((c, i) => (isLot(i) && arrived(i) ? c.left : 0));
  const leftCost = sum((c, i) => (isLot(i) && arrived(i) ? c.leftCost : 0));
  const onSaleLot = (i: number) => isLot(i) && arrived(i);
  const onSaleQty = sum((c, i) => (onSaleLot(i) && c.stock ? c.stock.onSale : 0));
  const elsewhereQty = sum((c, i) => (onSaleLot(i) && c.stock ? c.stock.elsewhere : 0));
  const missingQty = sum((c, i) => (onSaleLot(i) && c.stock ? c.stock.missing : 0));
  const restQty = sum((c, i) => (onSaleLot(i) && !c.stock ? c.left - c.out.returning - c.out.toSeller : 0));
  const transitQty = sum((c, i) => (isLot(i) && !arrived(i) ? c.left : 0));
  const unlinked = rows.map((r, i) => r.link === 'none' && !isOptedOut(i) && wholeUnits(r.qty) > 0);
  const unlinkedRows = unlinked.filter(Boolean).length;
  const unlinkedQty = rows.reduce((a, r, i) => a + (unlinked[i] ? wholeUnits(r.qty) : 0), 0);
  const unlinkedCost = sum((c, i) => (unlinked[i] ? c.invested : 0));

  const toPayback = Math.max(0, invested - moneyBack);
  const perUnit = soldQty > 0 ? moneyBack / soldQty : 0;
  // Qolgan donadan ko'p bo'lsa — dona soni aytilmaydi: qolgani sotilsa ham to'liq qaytmaydi
  const remaining = leftQty + transitQty + unlinkedQty;
  const unitsToPayback = toPayback > 0 && soldQty > 0 && perUnit > 0 ? Math.ceil(toPayback / perUnit) : null;
  const breakEvenQty = unitsToPayback !== null && unitsToPayback <= remaining ? unitsToPayback : null;

  // Prognoz: qolgan har qator o'z ustamasi bilan (sotuvi bo'lmasa — partiyaning o'rtachasi); zarar bo'lgani sotilmaydi
  const markup = cogs > 0 ? moneyBack / cogs : null;
  let expectedProfit: number | null = null;
  if (soldQty > 0 && markup !== null) {
    let future = 0;
    calcs.forEach((c, i) => {
      if (isPersonal(i) || noQty[i] || isOptedOut(i)) return;
      const m = isLot(i) && c.cogs > 0 ? c.moneyBack / c.cogs : markup;
      future += (c.invested - c.cogs - c.lossCost) * m;
    });
    expectedProfit = Math.round(moneyBack + future) - invested;
  }

  const days = (f: (t: ProfitTake) => string | null) =>
    rows
      .map((r, i) => (isLot(i) && r.take ? f(r.take) : null))
      .filter((d): d is string => Boolean(d))
      .sort();
  const firsts = days((t) => t.firstDay);
  const lasts = days((t) => t.lastDay);
  const lotRows = rows.map((_, i) => i).filter(isLot);
  const allSold = lotRows.length > 0 && lotRows.every((i) => calcs[i].left === 0) && unlinkedRows === 0;
  const soldOutDays = days((t) => t.soldOutDay);

  const sellable = (i: number) => !isPersonal(i) && !isOptedOut(i);
  const hasSellable = rows.some((r, i) => sellable(i) && (wholeUnits(r.qty) > 0 || Math.round(r.cost || 0) !== 0));
  const anyReadyLot = lotRows.some((i) => arrived(i));
  const anyArrived = rows.some((_, i) => sellable(i) && arrived(i));
  const state: BatchProfitState = !hasSellable
    ? 'empty'
    : moneyBack >= invested && invested > 0
      ? 'paidBack'
      : !anyArrived
        ? 'waiting'
        : !anyReadyLot
          ? 'unlinked'
          : 'selling';

  const soldOutAt = allSold && soldOutDays.length ? soldOutDays[soldOutDays.length - 1] : null;
  /*
   * Partiya bosqichi — sotiladigan qatorlarning eng ilgari ketgani: bittasi sotuvda (yoki
   * sotib bo'lingan) bo'lsa — "sotuvda". Donali qator bo'lmasa — puli bor qatorlardan.
   */
  const withQty = rows.map((_, i) => i).filter((i) => sellable(i) && wholeUnits(rows[i].qty) > 0);
  const stageRows = withQty.length
    ? withQty
    : rows.map((_, i) => i).filter((i) => sellable(i) && Math.round(rows[i].cost || 0) !== 0);
  const stages = new Set(stageRows.map((i) => (rowStage(rows[i]) === 'soldOut' ? 'selling' : rowStage(rows[i]))));
  const stage: BatchStage = soldOutAt
    ? 'soldOut'
    : (STAGE_ORDER.find((s) => stages.has(s)) ?? (stages.has('soldOut') ? 'soldOut' : 'warehouse'));
  const onSaleDays = stageRows
    .map((i) => rows[i].onSaleFrom ?? null)
    .filter((d): d is string => Boolean(d))
    .sort();

  return {
    state,
    invested,
    personalCost,
    personalRows: rows.filter((_, i) => isPersonal(i)).length,
    optedOutRows: rows.filter((_, i) => isOptedOut(i)).length,
    payout: sum((c) => c.payout),
    tax: sum((c) => c.tax),
    revenue: sum((c) => c.revenue),
    adFee: sum((c) => c.adFee),
    moneyBack,
    back,
    cogs,
    profit,
    roi: cogs + lossCost + overheadNow > 0 ? pctOf(profit, cogs + lossCost + overheadNow) : null,
    paybackPct: pctOf(moneyBack, invested),
    toPayback,
    breakEvenQty,
    expectedProfit,
    qty,
    soldQty,
    out,
    lostQty: lotLost,
    lossCost,
    leftQty,
    leftCost,
    onSaleQty,
    elsewhereQty,
    missingQty,
    restQty,
    transitQty,
    unlinkedRows,
    unlinkedQty,
    unlinkedCost,
    noQtyRows: noQty.filter(Boolean).length,
    overhead,
    overheadNow,
    beforeArrival: rows.reduce((a, r, i) => a + (isLot(i) && r.take ? r.take.beforeArrival : 0), 0),
    notMarked: rows.reduce((a, r, i) => a + (isLot(i) && r.take ? r.take.notMarked : 0), 0),
    firstSaleAt: firsts[0] ?? null,
    lastSaleAt: lasts.length ? lasts[lasts.length - 1] : null,
    soldOutAt,
    stage,
    onSaleFrom: onSaleDays[0] ?? null,
  };
}

// ─────────────────────────── API javoblari ───────────────────────────

/**
 * Bir bosishda tuzatish: partiya «Keldi» deb belgilanmagan yoki kelgan sanasi
 * dalillardan kech. `date` — taklif (Uzum nakladnoyi qabul qilgan kun yoki
 * birinchi sotuv kuni); jo'natma kaliti PUT /batches/:id/shipment uchun.
 */
export interface BatchProfitFix {
  /** arrive — hali «Keldi» emas; earlier — kelgan sana dalillardan kech */
  kind: 'arrive' | 'earlier';
  /** Taklif qilingan kelgan kun (YYYY-MM-DD) */
  date: string;
  /** invoice — Uzum shu kuni qabul qilgan; sale — shu kuni sotila boshlagan */
  basis: 'invoice' | 'sale';
  cargoName: string;
  delivery: 'avia' | 'avto';
  trip: string;
  /** Jo'natmaning hozirgi jo'natilgan sanasi (o'zgarmaydi) */
  shippedAt: string | null;
}

/** Qatorning bitta sotuvi (tekshirish uchun) */
export interface BatchProfitOrder {
  /** Uzum buyurtma raqami */
  orderNo: string | null;
  day: string;
  units: number;
  /** Qaytgan pul (Uzum to'laydigani − reklama − soliq) */
  moneyBack: number;
  /** Shundan ayrilgan Uzum reklamasi */
  adFee: number;
  state: ProfitMoneyState;
}

export interface BatchProfitRow extends BatchProfitRowCalc {
  /** Partiyadagi o'rni (bo'sh qatorlarsiz, saqlangan tartibda) */
  index: number;
  name: string;
  link: BatchRowLink;
  /** Hisobdagi kodlar (asl yozilishi) */
  codes: string[];
  /** Nomi bo'yicha bog'langan bo'lsa — qaysi partiyadan */
  linkFrom: { batchId: string; batchName: string } | null;
  /** Sotuvchi ataylab "Uzumda yo'q" deb belgilagan */
  optedOut: boolean;
  qty: number;
  legStatus: ShipmentStatus;
  /** Kelgan kun (YYYY-MM-DD) */
  arrivedAt: string | null;
  beforeArrival: number;
  notMarked: number;
  firstSaleAt: string | null;
  lastSaleAt: string | null;
  soldOutAt: string | null;
  /** Katalogda topilmagan kodlar */
  missingCodes: string[];
  fix: BatchProfitFix | null;
  /** Oxirgi sotuvlar (yangisi birinchi, ko'pi bilan 50) */
  orders: BatchProfitOrder[];
  /** Jami sotuv pozitsiyalari soni (orders kesilgan bo'lishi mumkin) */
  ordersTotal: number;
  /** Qator qayerda (qator bo'yicha; bog'lanmagan qatorda — partiyaniki) */
  stage: BatchStage;
  /** Sotuvga chiqqan kun (Uzum qabul qilgan) */
  onSaleFrom: string | null;
  /** Qatorning tovari kelgan (yoki kelayotgan) Uzum ta'minlashi */
  supply: BatchSupplyRef | null;
}

/** Uzum ta'minlashiga havola */
export interface BatchSupplyRef {
  /** Kabinetdagi raqam (12 xonali) */
  code: string;
  status: BatchSupplyStatus;
  /** Qabul qilingan kun; hali qabul qilinmagan bo'lsa — yaratilgan kun */
  day: string | null;
}

/** Partiyaga tegishli Uzum ta'minlashi */
export interface BatchSupplyInfo extends BatchSupplyRef {
  /** Rejadagi dona (butun ta'minlash) */
  planned: number;
  /** Uzum qabul qilgan dona */
  accepted: number;
}

export interface BatchProfitSummary extends BatchProfitTotals {
  batchId: string;
  /** Partiya tovari kelgan (kelayotgan) Uzum ta'minlashlari, kun tartibida */
  supplies: BatchSupplyInfo[];
  /**
   * Kutilayotgan sana tuzatishlari (qatorlardagi `fix`): har jo'natma (kargo · tur ·
   * reys) va turiga bitta, eng ertagi sana bilan. Masalan, «Keldi» belgilanmagan,
   * lekin Uzum tovarni qabul qilgan — sotuvi partiyaga yozilmayapti.
   */
  fixes: BatchProfitFix[];
}

/** Hech qaysi partiyaga tushmagan sotuv (kompaniya bo'yicha) */
export interface BatchProfitUnattributed {
  units: number;
  /** Qaytgan pul (reklama ayrilgan) */
  moneyBack: number;
  /** Shu sotuvlarga tushgan Uzum reklamasi */
  adFee: number;
  /**
   * Partiyadagi tovarlarning hech bir sotuvga tushmagan reklamasi: to'lov kuni
   * atrofida (`AD_MATCH_DAYS`) xaridorga topshirilgan sotuvi yo'q
   */
  adUnplaced: number;
  opening: number;
  beforeArrival: number;
  notMarked: number;
  overTracked: number;
  /** Sotuvsiz chiqim (brak, yo'qolgan...) — eski qoldiqdan, partiyalarga tegishli emas */
  outOpening: number;
  /** Sotuvsiz chiqim — o'sha kuni partiyalarda ham, eski qoldiqda ham dona yo'q edi */
  outUnplaced: number;
  /** Eng ko'p dona bo'yicha (5 tagacha) */
  top: { code: string; title: string; units: number }[];
}

export interface BatchProfitListResponse {
  items: BatchProfitSummary[];
  grand: {
    invested: number;
    moneyBack: number;
    profit: number;
    pendingBack: number;
    /** Partiyalar qaytgan pulidan ayrilgan Uzum reklamasi */
    adFee: number;
    /** O'zini oqlagan partiyalar soni */
    paidBack: number;
  };
  unattributed: BatchProfitUnattributed;
  /** Soliq stavkasi, % */
  taxRate: number;
  /** Uzum ma'lumoti oxirgi yangilangan payt (ISO) */
  syncedAt: string | null;
}

export interface BatchProfitSku {
  code: string;
  title: string;
  imageUrl: string | null;
  /** Do'kon nomlari (kompaniyada 2+ do'kon bo'lsa ko'rsatiladi) */
  stores: string[];
}

export interface BatchProfitDetail extends BatchProfitSummary {
  rows: BatchProfitRow[];
  /** Kod (`normSkuCode`) → katalogdagi tovar */
  skus: Record<string, BatchProfitSku>;
  taxRate: number;
  syncedAt: string | null;
  storeCount: number;
}

/** Bog'lash oynasidagi bitta SKU (bir xil kodli SKU'lar do'konlardan birlashtiriladi) */
export interface BatchSkuOption {
  code: string;
  title: string;
  productId: string;
  productTitle: string;
  imageUrl: string | null;
  stores: string[];
  archived: boolean;
  /** Shu kod nechta partiya qatoriga (o'zi bog'langan) bog'langan */
  linkedRows: number;
}

export interface BatchSkuSearchResponse {
  items: BatchSkuOption[];
  /** query — so'rov bo'yicha; tokens — so'zlarning biri mos; all — so'rovsiz ro'yxat */
  match: 'query' | 'tokens' | 'all';
}
