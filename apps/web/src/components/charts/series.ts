/**
 * Vaqt qatorini grafikka tayyorlash: bo'sh boshlanishni kesish, haftalarga
 * yoki oylarga yig'ish, o'q uchun "chiroyli" belgilar.
 *
 * Bu yerda React yo'q — sof funksiyalar, alohida tekshirish oson.
 */

export type Granularity = 'day' | 'week' | 'month';

export type Row = Record<string, unknown>;

const DAY_MS = 86_400_000;
const YMD = /^(\d{4})-(\d{2})-(\d{2})/;

/** "2026-10-13" → kun raqami (UTC). Sana bo'lmasa null */
export function dayNumber(value: unknown): number | null {
  const m = YMD.exec(String(value ?? ''));
  if (!m) return null;
  return Math.round(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / DAY_MS);
}

export function ymd(day: number): string {
  return new Date(day * DAY_MS).toISOString().slice(0, 10);
}

const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : Number(v) || 0);

/**
 * Bo'sh boshlanishni kesadi.
 *
 * Do'kon sentabrda ochilgan, sotuvchi esa "1 yil" ni tanlagan bo'lsa, grafikning
 * to'rtdan uch qismi nol ustida yotgan tekis chiziq bo'lib qoladi va haqiqiy
 * ma'lumot o'ng chetga siqiladi. Boshidagi bo'sh kunlar uzoq (bir haftadan
 * ko'p VA butun oraliqning beshdan biridan ko'p) bo'lsa, grafik birinchi
 * harakatdan bir kun oldin boshlanadi.
 *
 * Qisqa bo'shliq (masalan oyning dastlabki uch kuni) kesilmaydi — u "bu
 * kunlarda sotuv bo'lmadi" degan ma'lumot.
 */
export function trimLeadingEmpty(rows: Row[], keys: string[]): { rows: Row[]; trimmed: number } {
  const first = rows.findIndex((r) => keys.some((k) => num(r[k]) !== 0));
  if (first < 7 || first / rows.length <= 0.2) return { rows, trimmed: 0 };
  const from = first - 1;
  return { rows: rows.slice(from), trimmed: from };
}

/**
 * Standart yiriklik: nuqtalar soni va grafikka nechta ustun sig'ishiga qarab.
 *
 * `maxBars` — grafik kengligiga o'qiladigan holda sig'adigan ustunlar soni.
 * Telefonda 42 kunlik ustunlar ignadek ingichka chiqardi; u yerda o'sha davr
 * haftalarga yig'iladi. Sotuvchi almashtirgich bilan istalgan yiriklikka qaytadi.
 */
export function autoGranularity(points: number, maxBars = 92): Granularity {
  if (points <= Math.min(92, maxBars)) return 'day';
  if (points <= 400 && Math.ceil(points / 7) <= Math.max(12, maxBars)) return 'week';
  return 'month';
}

/** Shu oraliq uchun ma'noli yirikliklar (bitta bo'lsa almashtirgich ko'rsatilmaydi) */
export function granularityOptions(points: number): Granularity[] {
  const out: Granularity[] = [];
  if (points <= 190) out.push('day');
  if (points > 14) out.push('week');
  if (points > 62) out.push('month');
  return out.length ? out : ['day'];
}

export interface Bucket extends Row {
  /** Oraliqning birinchi kuni — X o'qidagi kalit */
  __from: string;
  /** Oraliqning oxirgi kuni */
  __to: string;
}

/**
 * Kunlik qatorlarni haftalarga yoki oylarga yig'adi (qiymatlar qo'shiladi).
 *
 * Haftalar taqvim bo'yicha emas, OXIRGI kundan orqaga sanaladi: taqvim
 * haftasida oxirgi ustun deyarli har doim to'liqmas bo'ladi va grafik
 * "sotuv qulab tushdi" degan yolg'on taassurot beradi. Orqaga sanalganda
 * to'liqmas bo'lishi mumkin bo'lgan yagona ustun — eng birinchisi.
 */
export function bucketize(rows: Row[], xKey: string, keys: string[], gran: Granularity): Bucket[] {
  const days = rows.map((r) => dayNumber(r[xKey]));
  if (gran === 'day' || days.some((d) => d === null)) {
    return rows.map((r) => ({ ...r, __from: String(r[xKey]), __to: String(r[xKey]) }));
  }

  const last = days[days.length - 1] as number;
  const out = new Map<string, Bucket>();

  rows.forEach((r, i) => {
    const day = days[i] as number;
    const date = ymd(day);
    // Hafta — oxirgi kundan orqaga yettitadan; oy — taqvim oyi
    const id = gran === 'week' ? String(last - Math.floor((last - day) / 7) * 7) : date.slice(0, 7);

    let b = out.get(id);
    if (!b) {
      // Kalit — oraliqda HAQIQATDA bor birinchi kun: to'liqmas birinchi hafta o'z sanasidan boshlanadi
      b = { [xKey]: date, __from: date, __to: date };
      for (const k of keys) b[k] = 0;
      out.set(id, b);
    }
    if (date < b.__from) b.__from = date;
    if (date > b.__to) b.__to = date;
    for (const k of keys) b[k] = num(b[k]) + num(r[k]);
  });

  return [...out.values()];
}

/**
 * O'q uchun "dumaloq" belgilar: 0, 250 ming, 500 ming — 0, 187 ming, 374 ming emas.
 *
 * Recharts belgilarni o'zi tanlaganda qadam ko'pincha noqulay chiqadi va
 * manfiy tomonda `-250,0 ming` kabi yozuvlar paydo bo'ladi. Qadam 1 / 2 / 2,5 / 5
 * ning o'n darajasi bo'ladi; nol har doim belgilar ichida.
 *
 * Oraliqni `maxIntervals` tadan ko'p bo'lmagan bo'lakka bo'ladigan ENG KICHIK
 * qadam olinadi: yirikroq qadam (masalan 250 ming o'rniga 500 ming) bitta
 * zararli kun tufayli grafikning uchdan birini bo'sh manfiy maydonga berardi.
 */
export function niceTicks(min: number, max: number, maxIntervals = 5, integers = false): number[] {
  const lo = Math.min(0, min);
  const hi = Math.max(0, max);
  if (hi === lo) return [0, 1];

  let pow = 10 ** Math.floor(Math.log10((hi - lo) / maxIntervals));
  if (integers) pow = Math.max(1, pow);
  let step = pow * 20;
  for (const m of [1, 2, 2.5, 5, 10, 20]) {
    const s = m * pow;
    if (integers && !Number.isInteger(s)) continue;
    if (Math.ceil(hi / s) - Math.floor(lo / s) <= maxIntervals) {
      step = s;
      break;
    }
  }

  const start = Math.floor(lo / step) * step;
  const end = Math.ceil(hi / step) * step;
  const ticks: number[] = [];
  // Suzuvchi nuqta xatosi yig'ilmasin: har belgi qadamdan qayta hisoblanadi
  for (let i = 0; start + i * step <= end + step / 1e6; i++) ticks.push(Number((start + i * step).toPrecision(12)));
  return ticks;
}

/** Qatorlardagi eng kichik va eng katta qiymat (ustma-ust bo'lsa — yig'indi bo'yicha) */
export function extent(rows: Row[], keys: string[], stacked = false): { min: number; max: number; integers: boolean } {
  let min = 0;
  let max = 0;
  let integers = true;
  for (const r of rows) {
    let pos = 0;
    let neg = 0;
    for (const k of keys) {
      const v = num(r[k]);
      if (!Number.isInteger(v)) integers = false;
      if (stacked) {
        if (v >= 0) pos += v;
        else neg += v;
      } else {
        if (v > max) max = v;
        if (v < min) min = v;
      }
    }
    if (stacked) {
      if (pos > max) max = pos;
      if (neg < min) min = neg;
    }
  }
  return { min, max, integers };
}

/** Sparkline uchun: nuqtalar ko'p bo'lsa, qo'shni kunlar o'rtachasiga siqiladi */
export function downsample(values: number[], maxPoints: number): number[] {
  if (values.length <= maxPoints) return values;
  const size = values.length / maxPoints;
  const out: number[] = [];
  for (let i = 0; i < maxPoints; i++) {
    const from = Math.floor(i * size);
    const to = Math.max(from + 1, Math.floor((i + 1) * size));
    let sum = 0;
    for (let j = from; j < to; j++) sum += values[j] ?? 0;
    out.push(sum / (to - from));
  }
  return out;
}

/**
 * Nuqtalardan silliq egri chiziq (monoton kubik).
 *
 * Oddiy siniq chiziq sparkline'ni tishli arraga o'xshatadi; oddiy kubik
 * silliqlash esa cho'qqilar orasida qiymatdan pastga "sho'ng'iydi" — nol
 * sotuvli kun manfiydek ko'rinadi. Monoton variant ikkala nuqsondan xoli.
 */
export function smoothPath(pts: { x: number; y: number }[]): string {
  const n = pts.length;
  if (n === 0) return '';
  const p0 = pts[0] as { x: number; y: number };
  if (n === 1) return `M${p0.x},${p0.y}`;

  const dx: number[] = [];
  const slope: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    const a = pts[i] as { x: number; y: number };
    const b = pts[i + 1] as { x: number; y: number };
    dx.push(b.x - a.x);
    slope.push((b.y - a.y) / (b.x - a.x || 1));
  }

  const tan: number[] = [slope[0] ?? 0];
  for (let i = 1; i < n - 1; i++) {
    const a = slope[i - 1] ?? 0;
    const b = slope[i] ?? 0;
    tan.push(a * b <= 0 ? 0 : (2 * a * b) / (a + b));
  }
  tan.push(slope[n - 2] ?? 0);

  let d = `M${p0.x.toFixed(2)},${p0.y.toFixed(2)}`;
  for (let i = 0; i < n - 1; i++) {
    const a = pts[i] as { x: number; y: number };
    const b = pts[i + 1] as { x: number; y: number };
    const h = (dx[i] ?? 0) / 3;
    const c1y = a.y + (tan[i] ?? 0) * h;
    const c2y = b.y - (tan[i + 1] ?? 0) * h;
    d += `C${(a.x + h).toFixed(2)},${c1y.toFixed(2)} ${(b.x - h).toFixed(2)},${c2y.toFixed(2)} ${b.x.toFixed(2)},${b.y.toFixed(2)}`;
  }
  return d;
}
