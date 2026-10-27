/**
 * "So‘nggi ochilganlar" — buyruq oynasi bo‘sh ochilganda birinchi turadi.
 *
 * Sahifalar har qanday o‘tishda yoziladi (yon menyu, havola, oyna — farqi yo‘q),
 * mahsulotlar esa faqat oynadan tanlanganda: nomi va rasmi faqat o‘sha paytda
 * ma’lum. Sahifa nomi bu yerda SAQLANMAYDI — har safar joriy tilda olinadi.
 *
 * localStorage maxfiy rejimda yoki to‘lib qolganda xato beradi — shuning uchun
 * har murojaat try/catch ichida: ro‘yxat yo‘qolsa ham oyna ishlayveradi.
 */
const KEY = 'sq-palette-recent';
/** Ko‘rsatiladigani 5 ta; bittasi zaxira — joriy sahifa ro‘yxatdan chiqarib tashlanadi */
const MAX = 6;

export interface RecentEntry {
  /** '/sales', '/settings#uzum' yoki '/products/<id>' */
  to: string;
  /** Faqat mahsulot uchun */
  title?: string;
  img?: string | null;
}

/** Faqat ilova ichidagi yo‘l: saqlangan qiymat qo‘lda o‘zgartirilgan bo‘lsa ham tashqariga havola bo‘lmaydi */
function isInternalPath(to: unknown): to is string {
  return typeof to === 'string' && to.startsWith('/') && !to.startsWith('//') && to.length < 300;
}

export function readRecent(): RecentEntry[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const out: RecentEntry[] = [];
    for (const e of parsed) {
      if (!e || typeof e !== 'object' || !isInternalPath((e as RecentEntry).to)) continue;
      const { to, title, img } = e as RecentEntry;
      out.push({
        to,
        title: typeof title === 'string' ? title.slice(0, 300) : undefined,
        img: typeof img === 'string' ? img : null,
      });
      if (out.length >= MAX) break;
    }
    return out;
  } catch {
    return [];
  }
}

export function pushRecent(entry: RecentEntry): void {
  if (!isInternalPath(entry.to)) return;
  try {
    const list = [entry, ...readRecent().filter((e) => e.to !== entry.to)].slice(0, MAX);
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* noop */
  }
}
