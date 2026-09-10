/**
 * Valyuta kurslari — O'zbekiston Markaziy banki (cbu.uz) ochiq API'sidan.
 *
 * Kurs 6 soatga keshlanadi. Internet bo'lmasa yoki javob buzilgan bo'lsa
 * zaxira qiymat qaytariladi — kalkulyator hech qachon ishlamay qolmaydi.
 */

const CBU_URL = 'https://cbu.uz/uz/arkhiv-kursov-valyut/json';
const CACHE_MS = 6 * 60 * 60 * 1000;
const TIMEOUT_MS = 8_000;

/** Internet bo'lmagan holat uchun taxminiy qiymatlar (so'm) */
const FALLBACK: Record<string, number> = {
  CNY: 1_750,
  USD: 12_600,
  RUB: 140,
  KZT: 26,
};

export interface CurrencyRate {
  code: string;
  rate: number;
  source: 'cbu' | 'fallback';
  updatedAt: string | null;
}

interface CacheEntry {
  value: CurrencyRate;
  fetchedAt: number;
}

const cache = new Map<string, CacheEntry>();
/** Bir vaqtning o'zida bitta so'rov ketishi uchun */
const inflight = new Map<string, Promise<CurrencyRate>>();

/** "11.09.2026" → ISO sana */
function parseCbuDate(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const m = value.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (!m) return null;
  return `${m[3]}-${m[2]}-${m[1]}`;
}

async function fetchFromCbu(code: string): Promise<CurrencyRate> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${CBU_URL}/${code}/`, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) throw new Error(`CBU javobi: ${res.status}`);

    const body: unknown = await res.json();
    const row = Array.isArray(body) ? (body[0] as Record<string, unknown> | undefined) : undefined;
    const rate = Number(row?.Rate);
    const nominal = Number(row?.Nominal) || 1;
    if (!Number.isFinite(rate) || rate <= 0) throw new Error('CBU kursi noto‘g‘ri');

    return {
      code,
      rate: rate / nominal,
      source: 'cbu',
      updatedAt: parseCbuDate(row?.Date),
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Valyuta kursini qaytaradi (1 birlik necha so'm).
 * Hech qachon xato tashlamaydi — eng yomon holatda zaxira qiymat.
 */
export async function getRate(code = 'CNY'): Promise<CurrencyRate> {
  const key = code.toUpperCase();

  const cached = cache.get(key);
  if (cached && Date.now() - cached.fetchedAt < CACHE_MS) return cached.value;

  const running = inflight.get(key);
  if (running) return running;

  const task = (async (): Promise<CurrencyRate> => {
    try {
      const value = await fetchFromCbu(key);
      cache.set(key, { value, fetchedAt: Date.now() });
      return value;
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn(`[rates] ${key} kursini olishda xatolik:`, err instanceof Error ? err.message : err);
      // Eski kesh bo'lsa — undan foydalanamiz (muddati o'tgan bo'lsa ham)
      if (cached) return cached.value;
      return {
        code: key,
        rate: FALLBACK[key] ?? 0,
        source: 'fallback',
        updatedAt: null,
      };
    } finally {
      inflight.delete(key);
    }
  })();

  inflight.set(key, task);
  return task;
}

/** Keshni majburan yangilash (admin yoki test uchun) */
export function clearRateCache(): void {
  cache.clear();
}
