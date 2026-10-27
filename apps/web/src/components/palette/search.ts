/**
 * Buyruq oynasi (Ctrl K) qidiruvi — sof funksiyalar, React'siz.
 *
 * Nima uchun oddiy `includes` yetmaydi (2026-10-24):
 *  - o‘zbekcha nomlarda tutuq belgisi har xil yoziladi (‘ ’ ʻ ' `): "yo'qotilgan"
 *    so‘rovi "Yo‘qotilganlar" ni topmasdi. Endi ikkala tomonda ham belgi olib
 *    tashlanadi;
 *  - sotuvchilar ko‘pincha kirillda yozadi ("фойда") yoki klaviatura tartibini
 *    almashtirishni unutadi ("ащнвф" = "foyda") — ikkalasi ham topiladi;
 *  - bitta so‘z bir nechta sahifaga tegishli: "foyda" — "Mahsulot foydasi" ham,
 *    "Moliya" (foyda va zarar) ham. Natija topilgan JOYIGA qarab tartiblanadi:
 *    joriy tildagi nom > boshqa tildagi nom > sinonim > bo‘lim nomi.
 */

// ‘ ’ ʻ ʼ ` ´ ' — o‘zbekcha "o‘", "g‘" va "ma’lumot" ning barcha yozilishlari
const APOSTROPHES = /[‘’ʻʼ`´']/g;
// NFKD dan keyingi urg‘u belgilari: "ё" → "е", "й" → "и" (ikkala tomonda bir xil — moslik buzilmaydi)
const COMBINING = /[̀-ͯ]/g;
const NON_WORD = /[^\p{L}\p{N}]+/gu;
const WORD_CHARS = /^[\p{L}\p{N}]+$/u;

/** Qidiruv uchun matn: kichik harf, tutuq belgisiz, tinish belgilari o‘rnida bitta bo‘shliq */
export function norm(text: string): string {
  return text
    .toLowerCase()
    .replace(APOSTROPHES, '')
    // "P&L" → "pl": aks holda "p" va "l" ikki alohida harfga bo‘linib, hamma narsani topardi
    .replace(/&/g, '')
    .normalize('NFKD')
    .replace(COMBINING, '')
    .replace(NON_WORD, ' ')
    .trim();
}

/** `norm` ning bitta belgi uchun varianti — topilgan joyni asl matnda bo‘yash uchun */
function normChar(ch: string): string {
  if (ch === '&') return '';
  const lower = ch.toLowerCase().replace(APOSTROPHES, '');
  if (!lower) return '';
  const base = lower.normalize('NFKD').replace(COMBINING, '');
  return WORD_CHARS.test(base) ? base : ' ';
}

// ─────────────────────────── So‘rov variantlari ───────────────────────────

/** O‘zbek kirill → lotin. Ruscha so‘zlar ham shu bilan lotin sinonimlarga tushadi ("склад" → "sklad") */
const CYR_TO_LAT: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'yo', ж: 'j', з: 'z', и: 'i', й: 'y',
  к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f',
  х: 'x', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sh', ъ: '', ы: 'i', ь: '', э: 'e', ю: 'yu', я: 'ya',
  ў: 'o', қ: 'q', ғ: 'g', ҳ: 'h',
};

function cyrToLat(text: string): string {
  let out = '';
  for (const ch of text) out += CYR_TO_LAT[ch] ?? ch;
  return out;
}

/*
 * Klaviaturadagi bir xil tugmalar: QWERTY ↔ ЙЦУКЕН. Ikki qator bir xil
 * uzunlikda va tartibda turishi SHART — indeks bo‘yicha almashtiriladi.
 */
const EN_KEYS = "qwertyuiop[]asdfghjkl;'zxcvbnm,.`";
const RU_KEYS = 'йцукенгшщзхъфывапролджэячсмитьбюё';

function swapLayout(text: string): string {
  const fromRu = /[Ѐ-ӿ]/.test(text);
  const from = fromRu ? RU_KEYS : EN_KEYS;
  const to = fromRu ? EN_KEYS : RU_KEYS;
  let out = '';
  for (const ch of text) {
    const i = from.indexOf(ch);
    out += i >= 0 ? to[i] : ch;
  }
  return out;
}

export interface QueryVariant {
  /** Butun so‘rov (normallashtirilgan) */
  full: string;
  tokens: string[];
  /** Variant ishonchliligi: asl so‘rov 1, transliteratsiya va tartib xatosi pastroq */
  weight: number;
}

export interface QueryVariants {
  primary: QueryVariant[];
  /**
   * Klaviatura tartibi almashtirilgan variant. ATAYLAB alohida: u faqat asl
   * so‘rov yaxshi natija bermaganda qo‘shiladi — aks holda "abc" kabi oddiy
   * so‘rov ruscha "фис" ga aylanib, keraksiz natijalar qo‘shardi.
   */
  swapped: QueryVariant | null;
}

function variant(text: string, weight: number): QueryVariant | null {
  const full = norm(text);
  return full ? { full, tokens: full.split(' '), weight } : null;
}

export function queryVariants(raw: string): QueryVariants {
  const lower = raw.toLowerCase();
  const primary: QueryVariant[] = [];
  const base = variant(lower, 1);
  if (base) primary.push(base);
  if (/[Ѐ-ӿ]/.test(lower)) {
    const lat = variant(cyrToLat(lower), 0.95);
    if (lat && !primary.some((v) => v.full === lat.full)) primary.push(lat);
  }
  const sw = variant(swapLayout(lower), 0.8);
  const swapped = sw && !primary.some((v) => v.full === sw.full) ? sw : null;
  return { primary, swapped };
}

// ─────────────────────────── Moslik bahosi ───────────────────────────

interface PreparedText {
  raw: string;
  text: string;
  words: string[];
}

export interface SearchFields {
  /** Joriy tildagi nom — eng katta vazn */
  label: string;
  /** Boshqa ikki tildagi nomlar */
  other?: readonly string[];
  /** Sinonimlar (uch tilda aralash, "zakaz", "ostatki" kabi lotincha ruscha ham) */
  syn?: readonly string[];
  /** Bo‘lim nomi uch tilda — "ombor" butun "Ombor va logistika" guruhini ham ko‘rsatsin */
  group?: readonly string[];
}

export interface PreparedFields {
  label: PreparedText;
  other: PreparedText[];
  syn: PreparedText[];
  group: PreparedText[];
}

const FIELD_WEIGHT = { label: 1, other: 0.8, syn: 0.7, group: 0.4 } as const;
export type MatchField = keyof typeof FIELD_WEIGHT;

/** Bundan past baho ko‘rsatilmaydi: bitta harf xatosi bo‘lim nomida topilsa — bu shovqin */
const MIN_SCORE = 15;

function prep(raw: string): PreparedText {
  const text = norm(raw);
  return { raw, text, words: text ? text.split(' ') : [] };
}

export function prepareFields(f: SearchFields): PreparedFields {
  const list = (xs?: readonly string[]) => (xs ?? []).map(prep).filter((p) => p.text);
  return { label: prep(f.label), other: list(f.other), syn: list(f.syn), group: list(f.group) };
}

/** a va b bitta tahrir bilan tengmi: harf qo‘shish, o‘chirish, almashtirish yoki qo‘shni ikkitasining o‘rni */
function withinOneEdit(a: string, b: string): boolean {
  if (a === b) return true;
  const la = a.length;
  const lb = b.length;
  if (Math.abs(la - lb) > 1) return false;
  let i = 0;
  while (i < la && i < lb && a[i] === b[i]) i += 1;
  if (la === lb) {
    if (a.slice(i + 1) === b.slice(i + 1)) return true;
    return a[i] === b[i + 1] && a[i + 1] === b[i] && a.slice(i + 2) === b.slice(i + 2);
  }
  return la > lb ? a.slice(i + 1) === b.slice(i) : a.slice(i) === b.slice(i + 1);
}

/** So‘z boshi so‘rovga bitta xato bilan mos keladimi: "kalkulator" → "kalkulyator", "harajat" → "xarajatlar" */
function nearPrefix(token: string, word: string): boolean {
  const n = token.length;
  if (word.length < n - 1) return false;
  return (
    withinOneEdit(token, word.slice(0, n)) ||
    withinOneEdit(token, word.slice(0, n + 1)) ||
    withinOneEdit(token, word.slice(0, n - 1))
  );
}

function tier(token: string, t: PreparedText): number {
  if (!t.text) return 0;
  if (t.text === token) return 100;
  if (t.text.startsWith(token)) return 90;
  if (t.words.some((w) => w.startsWith(token))) return 75;
  // So‘z o‘rtasidagi moslik faqat 3+ harfda — "ab" hamma joyda uchraydi
  if (token.length >= 3 && t.text.includes(token)) return 50;
  /*
   * Bitta harf xatosi faqat 5+ harfli so‘zda: 4 harfda u juda keng —
   * "dark" "daromad" ning boshiga ("daro") bitta harf bilan mos kelib,
   * mavzu almashtirish o‘rniga "Moliya" ni chiqarardi.
   */
  if (token.length >= 5 && t.words.some((w) => nearPrefix(token, w))) return 30;
  return 0;
}

export interface Match {
  score: number;
  /** Eng kuchli moslik qaysi maydonda — boshqa tilda/sinonimda bo‘lsa, izohda ko‘rsatiladi */
  field: MatchField;
  /** O‘sha maydonning asl matni */
  text: string;
  /** Yutgan variant so‘zlari — nomdagi joyni bo‘yash uchun */
  tokens: string[];
}

function scoreVariant(p: PreparedFields, v: QueryVariant): Match | null {
  let total = 0;
  let lead = -1;
  let leadField: MatchField = 'label';
  let leadText = p.label.raw;

  for (const token of v.tokens) {
    let best = 0;
    let bestField: MatchField = 'label';
    let bestText = p.label.raw;
    const consider = (field: MatchField, t: PreparedText) => {
      const s = tier(token, t) * FIELD_WEIGHT[field];
      if (s > best) {
        best = s;
        bestField = field;
        bestText = t.raw;
      }
    };
    consider('label', p.label);
    p.other.forEach((t) => consider('other', t));
    p.syn.forEach((t) => consider('syn', t));
    p.group.forEach((t) => consider('group', t));
    // Har bir so‘z biror joyda topilishi SHART: "sotuv qoldiq" faqat ikkalasi bor sahifani topsin
    if (best === 0) return null;
    total += best;
    if (best > lead) {
      lead = best;
      leadField = bestField;
      leadText = bestText;
    }
  }

  let score = total / v.tokens.length;
  if (p.label.text === v.full) score += 40;
  else if (p.label.text.startsWith(v.full)) score += 15;
  else if (p.other.some((t) => t.text === v.full) || p.syn.some((t) => t.text === v.full)) score += 10;
  score *= v.weight;

  return score >= MIN_SCORE ? { score, field: leadField, text: leadText, tokens: v.tokens } : null;
}

export function matchFields(p: PreparedFields, variants: readonly QueryVariant[]): Match | null {
  let best: Match | null = null;
  for (const v of variants) {
    const m = scoreVariant(p, v);
    if (m && (!best || m.score > best.score)) best = m;
  }
  return best;
}

export interface Ranked<T> {
  item: T;
  match: Match;
}

/** Baho bo‘yicha kamayish tartibida; teng bo‘lsa — menyudagi tartib saqlanadi */
export function rank<T extends { search?: PreparedFields }>(items: readonly T[], variants: readonly QueryVariant[]): Ranked<T>[] {
  const out: Array<Ranked<T> & { order: number }> = [];
  items.forEach((item, order) => {
    if (!item.search) return;
    const match = matchFields(item.search, variants);
    if (match) out.push({ item, match, order });
  });
  out.sort((a, b) => b.match.score - a.match.score || a.order - b.order);
  return out;
}

/**
 * Asl matnda so‘rov so‘zlari turgan joylar ([boshi, oxiri) — asl indekslarda).
 * Normallashtirish tutuq belgilarini olib tashlagani uchun indekslar xaritasi
 * yuritiladi: "yoq" so‘rovida "Yo‘q" to‘liq (belgisi bilan) bo‘yaladi.
 */
export function highlightRanges(text: string, tokens: readonly string[]): Array<[number, number]> {
  if (!tokens.length || !text) return [];
  let flat = '';
  const map: number[] = [];
  for (let i = 0; i < text.length; i += 1) {
    for (const c of normChar(text[i])) {
      flat += c;
      map.push(i);
    }
  }

  const ranges: Array<[number, number]> = [];
  for (const tok of tokens) {
    if (!tok) continue;
    let at = -1;
    // So‘z boshidagi moslik afzal: "foyda" → "Mahsulot [foyda]si", "Sof [foyda]" emas o‘rtadagi bo‘lak
    for (let from = flat.indexOf(tok); from !== -1; from = flat.indexOf(tok, from + 1)) {
      if (from === 0 || flat[from - 1] === ' ') {
        at = from;
        break;
      }
    }
    if (at === -1 && tok.length >= 3) at = flat.indexOf(tok);
    if (at === -1) continue;
    ranges.push([map[at], map[at + tok.length - 1] + 1]);
  }

  ranges.sort((a, b) => a[0] - b[0]);
  const merged: Array<[number, number]> = [];
  for (const r of ranges) {
    const last = merged[merged.length - 1];
    if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]);
    else merged.push([r[0], r[1]]);
  }
  return merged;
}
