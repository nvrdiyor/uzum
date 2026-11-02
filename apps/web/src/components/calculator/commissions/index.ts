/**
 * Uzum komissiyalari jadvali — sof modul (React'siz, `@/` importsiz, alohida
 * sinab ko'rish uchun).
 *
 * Ma'lumot manbai (data.json): egasining Google jadvali, ko'rinadigan OZB
 * (stavkalar, "o‘zgarishdan keyingi komissiya" ustuni) va RUS (ruscha nomlar)
 * varaqlari, 2026-11-02 da olingan. O'zbekcha 4-daraja nomlarining 1299 tasi buzuq
 * edi — ular Unit.xlsx dagi nomlar va tarjima orqali tiklangan. `pct` — Uzum e'lon
 * qilgan o'zgarishdan keyingi komissiya; `null` (158 qator) — manbada stavka yo'q.
 * Ikki varaq 4 qatorda farq qiladi (plastik va alyuminiy deraza, xona va kirish eshigi:
 * OZB 9,5%, RUS 7,5%) — OZB olingan.
 *
 * Fayl ~450 KB, shuning uchun faqat kerak bo'lganda yuklanadi (dinamik import —
 * alohida bo'lak, asosiy to'plamga kirmaydi) va bir marta tayyorlanadi.
 */

/** Interfeys tili: inglizcha nom yo'q, 'en' da o'zbekchasi ko'rsatiladi */
export type CommissionLang = 'uz' | 'ru' | 'en';

export interface CommissionName {
  uz: string;
  ru: string;
}

/** Qidiruv uchun oldindan normallashtirilgan matnlar */
export interface CategorySearchText {
  nameUz: string;
  nameRu: string;
  l3Uz: string;
  l3Ru: string;
  l2Uz: string;
  l2Ru: string;
  l1Uz: string;
  l1Ru: string;
  /** Hammasi bitta qatorda — so'z hech qayerda yo'q qatorni tez tashlab ketish uchun */
  all: string;
}

export interface CommissionCategory {
  id: string;
  l1: CommissionName;
  l2: CommissionName;
  /** 18 ta kategoriyada 3-daraja yo'q */
  l3: CommissionName | null;
  name: CommissionName;
  /** Uzum komissiyasi, %; `null` — manbada stavka yo'q, sotuvchi qo'lda yozadi */
  pct: number | null;
  search: CategorySearchText;
}

type RawName = [uz: string, ru: string];
/** [id, l1 indeksi, l2 indeksi, l3 indeksi yoki -1, o'zbekcha nom, ruscha nom, stavka yoki null] */
type RawRow = [id: string, l1: number, l2: number, l3: number, nameUz: string, nameRu: string, pct: number | null];

interface RawData {
  l1: RawName[];
  l2: RawName[];
  l3: RawName[];
  rows: RawRow[];
}

// ─────────────────────────── Normallashtirish ───────────────────────────

// ' ’ ‘ ʻ ʼ ` ´ va o'xshashlari — o‘zbekcha "o‘" va "g‘" ning barcha yozilishlari: "oyin" "O‘yin" ni topsin
const APOSTROPHES = /['’‘ʻʼ`´ʹʾʿ′＇‛׳́]/g;
// Tinish belgilari ham so'z ajratadi: "krossovka," va "avtomobil-aromatizatorlari" topilsin
const SEPARATORS = /[\s,;:.!?/\\|()[\]{}"«»„“”_+=*–—-]+/g;
const WORD_CHAR = /[\p{L}\p{N}]/u;

/** Qidiruv uchun matn: kichik harf, tutuq belgisiz, ё → е, so'zlar orasida bitta bo'shliq */
export function normalizeSearch(text: string): string {
  return text.normalize('NFC').toLowerCase().replace(APOSTROPHES, '').replace(/ё/g, 'е').replace(SEPARATORS, ' ').trim();
}

/**
 * So'zning qidiriladigan shakllari. Katalog nomlari ko'plikda ("Платья", "Kolgotkilar"),
 * sotuvchi esa birlikda yozadi ("платье", "сумка", "tish pastasi") va to'liq so'z topilmaydi.
 * Negiz — oxiridagi unli va qo'shimchasiz; ruschada o'zgaruvchi unlisiz shakl ham sinaladi
 * ("носок" → "носк", "кошелек" → "кошельк"), lekin asl negiz qoladi: "камера" da unli
 * o'zgarmaydi. To'liq stemmer emas: faqat moslikni kengaytiradi.
 */
function stemsOf(word: string): string[] {
  const forms = [word];
  if (/[а-я]/.test(word)) {
    const base = word.replace(/[ьй]$/, '').replace(/[аеиоуыэюя]+$/, '');
    // Oxirgisi — kichraytirish qo'shimchasisiz: "мышка" → "мыш" ("Мыши"), "зарядка" → "заряд" ("Зарядные")
    forms.push(
      base,
      base.replace(/([лн])ек$/, '$1ьк').replace(/^(.{2,})[ео]([клнрц])$/, '$1$2'),
      base.replace(/([^аеиоуыэюя])к$/, '$1'),
    );
  } else {
    forms.push(word.replace(/(lari?|si)$/, '').replace(/[aeiou]+$/, ''));
  }
  return [...new Set(forms)].filter((form) => form === word || form.length >= 3);
}

const LATIN_TO_CYRILLIC: [RegExp, string][] = [
  [/shch/g, 'щ'],
  [/sh/g, 'ш'],
  [/ch/g, 'ч'],
  [/zh/g, 'ж'],
  [/kh/g, 'х'],
  [/ts/g, 'ц'],
  [/y[oe]/g, 'е'],
  [/ya/g, 'я'],
  [/yu/g, 'ю'],
];
const LATIN_LETTERS: Record<string, string> = {
  a: 'а', b: 'б', c: 'к', d: 'д', e: 'е', f: 'ф', g: 'г', h: 'х', i: 'и', j: 'ж', k: 'к', l: 'л', m: 'м',
  n: 'н', o: 'о', p: 'п', q: 'к', r: 'р', s: 'с', t: 'т', u: 'у', v: 'в', w: 'в', x: 'кс', y: 'й', z: 'з',
};
const CYRILLIC_LETTERS: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', ғ: 'g', д: 'd', е: 'e', ж: 'j', з: 'z', и: 'i', й: 'y', к: 'k', қ: 'q', л: 'l',
  м: 'm', н: 'n', о: 'o', ў: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'x', ҳ: 'h', ц: 's', ч: 'ch',
  ш: 'sh', щ: 'sh', ъ: '', ы: 'i', ь: '', э: 'e', ю: 'yu', я: 'ya',
};

/**
 * Boshqa alifbodagi yozilishi: ruscha so'z lotinda ("shapka" → "шапка") yoki o'zbekcha so'z
 * kirillda ("соат" → "soat") yoziladi, katalogda esa har bir til o'z alifbosida.
 */
function transliterate(word: string): string {
  if (/[а-яўқғҳ]/.test(word)) return [...word].map((ch) => CYRILLIC_LETTERS[ch] ?? ch).join('');
  const digraphs = LATIN_TO_CYRILLIC.reduce((text, [from, to]) => text.replace(from, to), word);
  return [...digraphs].map((ch) => LATIN_LETTERS[ch] ?? ch).join('');
}

// ─────────────────────────── Yuklash ───────────────────────────

function buildCategories(raw: RawData): CommissionCategory[] {
  const named = ([uz, ru]: RawName): { name: CommissionName; uz: string; ru: string } => ({
    name: { uz, ru },
    uz: normalizeSearch(uz),
    ru: normalizeSearch(ru),
  });
  // Yuqori darajalar minglab qatorda takrorlanadi — bir marta tayyorlanadi
  const l1 = raw.l1.map(named);
  const l2 = raw.l2.map(named);
  const l3 = raw.l3.map(named);

  return raw.rows.map(([id, i1, i2, i3, nameUz, nameRu, pct]) => {
    const top = l1[i1];
    const mid = l2[i2];
    const low = i3 >= 0 ? l3[i3] : null;
    const search: CategorySearchText = {
      nameUz: normalizeSearch(nameUz),
      nameRu: normalizeSearch(nameRu),
      l3Uz: low?.uz ?? '',
      l3Ru: low?.ru ?? '',
      l2Uz: mid.uz,
      l2Ru: mid.ru,
      l1Uz: top.uz,
      l1Ru: top.ru,
      all: '',
    };
    // Ajratuvchi so'rovda uchramaydi: so'z ikki maydon chegarasidan o'tib "topilib" qolmasin
    search.all = [search.nameUz, search.nameRu, search.l3Uz, search.l3Ru, search.l2Uz, search.l2Ru, search.l1Uz, search.l1Ru].join('\n');
    return { id, l1: top.name, l2: mid.name, l3: low?.name ?? null, name: { uz: nameUz, ru: nameRu }, pct, search };
  });
}

let loading: Promise<CommissionCategory[]> | null = null;

/** Ro'yxatni yuklaydi (keshlanadi). Bo'lak yuklanmasa kesh tozalanadi — keyingi urinish qayta so'raydi */
export function loadCommissionCategories(): Promise<CommissionCategory[]> {
  loading ??= import('./data.json').then(
    (mod) => buildCategories(mod.default as unknown as RawData),
    (err: unknown) => {
      loading = null;
      throw err;
    },
  );
  return loading;
}

// ─────────────────────────── Nomlar ───────────────────────────

const pick = (name: CommissionName, lang: CommissionLang): string => (lang === 'ru' ? name.ru : name.uz);

/** Kategoriya nomi: ruscha interfeysda ruscha, qolganida o'zbekcha */
export function categoryName(cat: CommissionCategory, lang: CommissionLang): string {
  return pick(cat.name, lang);
}

/** Yuqori darajalar: "L1 › L2 › L3" */
export function categoryPath(cat: CommissionCategory, lang: CommissionLang): string {
  const parts = [cat.l1, cat.l2, ...(cat.l3 ? [cat.l3] : [])];
  return parts.map((p) => pick(p, lang)).join(' › ');
}

const byIdCache = new WeakMap<readonly CommissionCategory[], Map<string, CommissionCategory>>();

/** Kategoriya kaliti bo'yicha; jadvaldagi har qator uchun chaqiriladi, shuning uchun xarita bilan */
export function findCategory(list: readonly CommissionCategory[], id: string | null | undefined): CommissionCategory | null {
  if (!id) return null;
  let map = byIdCache.get(list);
  if (!map) {
    map = new Map(list.map((c) => [c.id, c]));
    byIdCache.set(list, map);
  }
  return map.get(id) ?? null;
}

// ─────────────────────────── Tartiblash ───────────────────────────

const COLLATOR = {
  uz: new Intl.Collator('uz'),
  ru: new Intl.Collator('ru'),
};

/**
 * Alifbo bo'yicha, nomlari bir xil bo'lsa — yo'li bo'yicha: bir xil nomli
 * kategoriyalar ko'p (295 ta nom takrorlanadi), tartibi har gal bir xil chiqsin.
 */
function compareNames(a: CommissionCategory, b: CommissionCategory, lang: CommissionLang): number {
  const collator = lang === 'ru' ? COLLATOR.ru : COLLATOR.uz;
  return (
    collator.compare(categoryName(a, lang), categoryName(b, lang)) ||
    collator.compare(categoryPath(a, lang), categoryPath(b, lang)) ||
    a.id.localeCompare(b.id)
  );
}

const sortedCache = new WeakMap<readonly CommissionCategory[], { uz?: CommissionCategory[]; ru?: CommissionCategory[] }>();

/** Butun ro'yxat alifbo bo'yicha: birinchi ochilishda bir marta saralanadi */
function sortedAll(list: readonly CommissionCategory[], lang: CommissionLang): readonly CommissionCategory[] {
  const key = lang === 'ru' ? 'ru' : 'uz';
  const cached = sortedCache.get(list) ?? {};
  const hit = cached[key];
  if (hit) return hit;
  const sorted = [...list].sort((a, b) => compareNames(a, b, lang));
  cached[key] = sorted;
  sortedCache.set(list, cached);
  return sorted;
}

// ─────────────────────────── Qidiruv ───────────────────────────

interface Query {
  /** Butun so'rov (normallashtirilgan) */
  full: string;
  words: string[];
}

/** `q` matnda biror so'zning boshida turadimi (tire va qavsdan keyin ham) */
function startsWord(text: string, q: string): boolean {
  for (let at = text.indexOf(q); at !== -1; at = text.indexOf(q, at + 1)) {
    if (at === 0 || !WORD_CHAR.test(text[at - 1])) return true;
  }
  return false;
}

const MISS = -1;

/**
 * Bitta maydonda moslik darajasi: 0 — matn so'rov bilan boshlanadi, 1 — biror so'zi
 * boshlanadi, 2 — ichida bor, MISS — yo'q. So'rovning so'zlari matnda yonma-yon
 * kelmasa ham ("sichqoncha oyin" → "O‘yin sichqonchalari"), hammasi shu maydonda
 * bo'lsa moslik hisoblanadi: faqat 0-daraja bo'la olmaydi.
 */
function tierIn(text: string, q: Query): number {
  if (!text) return MISS;
  if (text.startsWith(q.full)) return 0;
  if (startsWord(text, q.full)) return 1;
  if (text.includes(q.full)) return 2;
  if (q.words.length < 2) return MISS;
  let worst = 1;
  for (const word of q.words) {
    if (startsWord(text, word)) continue;
    if (!text.includes(word)) return MISS;
    worst = 2;
  }
  return worst;
}

/**
 * Kategoriya o'rni (kichigi yuqorida): joriy tildagi nom 0–2, boshqa tildagi nom
 * 3–5, 3-daraja 6, 2-daraja 7, 1-daraja 8. So'zlar har xil maydonda topilsa
 * ("kiyim ko‘ylak": biri nomda, biri 1-darajada) — o'sha darajadagi butun
 * moslikdan keyin, eng kuchsiz so'z joyiga qarab.
 */
function rankOf(cat: CommissionCategory, q: Query, lang: CommissionLang): number {
  const s = cat.search;
  const [nameCur, nameOther] = lang === 'ru' ? [s.nameRu, s.nameUz] : [s.nameUz, s.nameRu];

  const cur = tierIn(nameCur, q);
  if (cur !== MISS) return cur;
  const other = tierIn(nameOther, q);
  if (other !== MISS) return 3 + other;
  if (tierIn(s.l3Uz, q) !== MISS || tierIn(s.l3Ru, q) !== MISS) return 6;
  if (tierIn(s.l2Uz, q) !== MISS || tierIn(s.l2Ru, q) !== MISS) return 7;
  if (tierIn(s.l1Uz, q) !== MISS || tierIn(s.l1Ru, q) !== MISS) return 8;

  // Har bir so'z qaysi maydonda topilgan: 0 — joriy nom ... 4 — 1-daraja
  let worst = 0;
  let sum = 0;
  let inside = 0;
  for (const word of q.words) {
    let field = 4;
    if (nameCur.includes(word)) field = 0;
    else if (nameOther.includes(word)) field = 1;
    else if (s.l3Uz.includes(word) || s.l3Ru.includes(word)) field = 2;
    else if (s.l2Uz.includes(word) || s.l2Ru.includes(word)) field = 3;
    // Boshqa so'z ichida ("корм" → "Автокормушки") — haqiqiy so'zdan keyin
    if ((field === 0 && !startsWord(nameCur, word)) || (field === 1 && !startsWord(nameOther, word))) inside = 0.4;
    worst = Math.max(worst, field);
    sum += field;
  }
  return 4.5 + worst + inside + sum / 100;
}

/** So'rovning hisobga olinadigan qismi: tasodifan joylangan uzun matn sahifani qotirmasin */
const MAX_QUERY = 200;
/** O'rinlar: aniq moslik (0–8.5) → negiz bo'yicha → boshqa alifboda → boshqa so'z ichida */
const STEM_RANK = 20;
const TRANSLIT_RANK = 30;
const INSIDE_RANK = 40;

/** Bog'lovchilar nomda bo'lishi shart emas: "коврик для йоги", "telefon uchun g'ilof" */
const STOP_WORDS = new Set(['для', 'на', 'и', 'в', 'во', 'с', 'со', 'по', 'из', 'от', 'под', 'над', 'за', 'к', 'у', 'о', 'об', 'при', 'без', 'uchun', 'va', 'bilan', 'hamda', 'yoki', 'ham']);

/** So'rovning takrorlanmaydigan, ma'noli so'zlari */
function wordsOf(full: string): string[] {
  const words = [...new Set(full.split(' '))];
  const meaningful = words.filter((word) => !STOP_WORDS.has(word));
  return meaningful.length ? meaningful : words;
}

/**
 * Shakl so'z boshida turadi va qolgani qo'shimchaga o'xshaydi: "шин" → "шины", "шинами",
 * lekin "kos" → "kosmetika" emas va "ремен" → "беременных" emas.
 */
function stemIn(text: string, stem: string): boolean {
  const room = stem.length <= 3 ? 3 : 5;
  for (let at = text.indexOf(stem); at !== -1; at = text.indexOf(stem, at + 1)) {
    if (at > 0 && WORD_CHAR.test(text[at - 1])) continue;
    let end = at + stem.length;
    while (end < text.length && WORD_CHAR.test(text[end])) end += 1;
    if (end - at - stem.length <= room) return true;
  }
  return false;
}

/** Shakllardan biri qaysi maydonda: 0 — joriy tildagi nom, 1 — boshqa tildagi nom, 2–4 — 3-, 2-, 1-daraja */
function stemField(cat: CommissionCategory, forms: readonly string[], lang: CommissionLang): number {
  const s = cat.search;
  if (!forms.some((form) => s.all.includes(form))) return MISS;
  const has = (text: string) => forms.some((form) => stemIn(text, form));
  const [nameCur, nameOther] = lang === 'ru' ? [s.nameRu, s.nameUz] : [s.nameUz, s.nameRu];
  if (has(nameCur)) return 0;
  if (has(nameOther)) return 1;
  if (has(s.l3Uz) || has(s.l3Ru)) return 2;
  if (has(s.l2Uz) || has(s.l2Ru)) return 3;
  return has(s.l1Uz) || has(s.l1Ru) ? 4 : MISS;
}

/** Har bir so'z shakllaridan biri bilan topilishi shart; o'rin eng kuchsiz so'zga qarab */
function formsRank(cat: CommissionCategory, words: readonly (readonly string[])[], lang: CommissionLang): number {
  let worst = 0;
  let sum = 0;
  for (const forms of words) {
    const field = stemField(cat, forms, lang);
    if (field === MISS) return MISS;
    worst = Math.max(worst, field);
    sum += field;
  }
  return worst + sum / 100;
}

/**
 * Kategoriya qidiruvi. So'rov o'zbekcha yoki ruscha bo'lishi mumkin (interfeys
 * tilidan qat'i nazar): har bir so'z ikkala tildagi nom yoki yo'lning biror
 * joyida topilishi shart. Tartib: aniq moslik, keyin negizi bo'yicha ("платье" →
 * "Платья"), keyin boshqa alifboda ("shapka" → "Шапки"), oxirida boshqa so'z ichida
 * ("ковер" → "Гайковерты"). Bo'sh so'rov — butun ro'yxat alifbo bo'yicha.
 * Natija o'qish uchun: bo'sh so'rovda keshlangan massiv qaytadi.
 */
export function searchCategories(
  list: readonly CommissionCategory[],
  query: string,
  lang: CommissionLang,
): readonly CommissionCategory[] {
  const full = normalizeSearch(query.slice(0, MAX_QUERY));
  if (!full) return sortedAll(list, lang);
  const words = wordsOf(full);
  const q: Query = { full, words };
  const stems = words.map(stemsOf);
  const translit = words.map((word) => stemsOf(transliterate(word)));

  const hits: { cat: CommissionCategory; rank: number }[] = [];
  for (const cat of list) {
    if (words.every((word) => cat.search.all.includes(word))) {
      const rank = rankOf(cat, q, lang);
      hits.push({ cat, rank: rank === 2 || rank === 5 ? INSIDE_RANK + rank : rank });
      continue;
    }
    const byStem = formsRank(cat, stems, lang);
    if (byStem !== MISS) {
      // Nom shu so'z bilan boshlansa yuqoriroq: "Платья", keyin "Вечерние платья"
      const name = lang === 'ru' ? cat.search.nameRu : cat.search.nameUz;
      const starts = stems.some((forms) => forms.some((form) => name.startsWith(form)));
      hits.push({ cat, rank: STEM_RANK + byStem - (starts ? 0.5 : 0) });
      continue;
    }
    const byTranslit = formsRank(cat, translit, lang);
    if (byTranslit !== MISS) hits.push({ cat, rank: TRANSLIT_RANK + byTranslit });
  }
  hits.sort((a, b) => a.rank - b.rank || compareNames(a.cat, b.cat, lang));
  return hits.map((h) => h.cat);
}

// ─────────────────────────── Bo'yash ───────────────────────────

/**
 * Asl matnda so'rov turgan joylar ([boshi, oxiri) — asl indekslarda). Tutuq belgisi
 * olib tashlangani uchun indekslar xaritasi yuritiladi: "oyin" so'rovida "O‘yin"
 * belgisi bilan birga bo'yaladi. Butun so'rov yonma-yon topilmasa — har so'z alohida.
 */
export function highlightRanges(text: string, query: string): Array<[number, number]> {
  const full = normalizeSearch(query.slice(0, MAX_QUERY));
  if (!full || !text) return [];

  let flat = '';
  const map: number[] = [];
  for (let i = 0; i < text.length; i += 1) {
    const lower = text[i].toLowerCase().replace(APOSTROPHES, '').replace(/ё/g, 'е').replace(SEPARATORS, ' ');
    for (const ch of lower) {
      if (ch === ' ' && (flat === '' || flat.endsWith(' '))) continue;
      flat += ch;
      map.push(i);
    }
  }

  const locate = (q: string): [number, number] | null => {
    let at = -1;
    // So'z boshidagi moslik afzal: "kol" → "Avto [kol]onkalar", "Mo[kol]..." emas
    for (let from = flat.indexOf(q); from !== -1; from = flat.indexOf(q, from + 1)) {
      if (from === 0 || !WORD_CHAR.test(flat[from - 1])) {
        at = from;
        break;
      }
    }
    if (at === -1) at = flat.indexOf(q);
    return at === -1 ? null : [map[at], map[at + q.length - 1] + 1];
  };

  const whole = locate(full);
  if (whole) return [whole];

  const ranges = wordsOf(full)
    .map((word) => [...stemsOf(word), ...stemsOf(transliterate(word))].map(locate).find(Boolean) ?? null)
    .filter((r): r is [number, number] => r !== null)
    .sort((a, b) => a[0] - b[0]);
  const merged: Array<[number, number]> = [];
  for (const r of ranges) {
    const last = merged[merged.length - 1];
    if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]);
    else merged.push([r[0], r[1]]);
  }
  return merged;
}
