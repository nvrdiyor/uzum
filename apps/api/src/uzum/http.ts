/**
 * Uzum Seller API — quyi darajali HTTP klient.
 *
 * Vazifalari (biznes-logikasiz, faqat transport):
 *  • `Authorization: <apiKey>` sarlavhasi bilan so'rov yuborish (rasmiy spetsifikatsiya:
 *    TokenAuth = apiKey in header, "Токен авторизации без префикса Bearer");
 *  • taymaut — `AbortController` + `env.uzum.timeoutMs`;
 *  • qayta urinish — `env.uzum.maxRetries`, eksponensial backoff + jitter,
 *    FAQAT 5xx / 429 / tarmoq xatolarida (4xx qayta urinilmaydi);
 *  • oddiy RPS cheklovi — `env.uzum.rpsLimit` (so'rovlar navbat bilan, teng oraliqda ketadi);
 *  • `429` javobida `Retry-After` sarlavhasini hurmat qilish (butun klient pauza qiladi);
 *  • javob konvertini ochish (`payload` / `data` / `result` — qaysi biri bo'lsa);
 *  • xatolarni yagona `UzumApiError` ko'rinishiga keltirish;
 *  • sahifalash — `fetchAllPages()` (page 0 dan, `UZUM_MAX_PAGES` chegarasi bilan).
 *
 * Javoblarni normalizatsiya qilish `live.ts` ning zimmasida.
 */
import { env } from '../env.js';
import { UZUM_MAX_PAGES, UZUM_PAGE_LIMITS, type UzumHttpMethod } from './endpoints.js';

// ─────────────────────────── Tiplar ───────────────────────────

/** Query parametri sifatida ruxsat etilgan qiymatlar */
export type UzumQueryValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | ReadonlyArray<string | number>;

/** So'rov query parametrlari */
export type UzumQuery = Record<string, UzumQueryValue>;

/** Xato turi — chaqiruvchi shu bo'yicha qaror qabul qiladi */
export type UzumErrorCode =
  | 'bad_request'
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'rate_limited'
  | 'server_error'
  | 'timeout'
  | 'network'
  | 'invalid_response'
  | 'api_error'
  | 'unknown';

export interface UzumHttpOptions {
  /** Uzum seller kabinetidagi API token */
  apiKey: string;
  /** Base URL (berilmasa `env.uzum.baseUrl`) */
  baseUrl?: string;
  /** So'rov taymauti, ms */
  timeoutMs?: number;
  /** Qayta urinishlar soni (0 — umuman urinmaslik) */
  maxRetries?: number;
  /** Sekundiga so'rovlar chegarasi */
  rpsLimit?: number;
}

export interface UzumRequestOptions {
  method?: UzumHttpMethod;
  query?: UzumQuery;
  /** JSON tanasi (POST/PUT/PATCH uchun) */
  body?: unknown;
  /** Shu so'rov uchun qayta urinishlar soni (berilmasa — klient sozlamasi) */
  retries?: number;
  /** Javob konvertini ochmaslik (xom JSON kerak bo'lsa) */
  raw?: boolean;
}

export interface UzumPageOptions {
  /** Sahifa hajmi (berilmasa `UZUM_PAGE_LIMITS.default`) */
  size?: number;
  /** Maksimal sahifalar soni (berilmasa `UZUM_MAX_PAGES`) */
  maxPages?: number;
  /** `page` parametrining nomi */
  pageParam?: string;
  /** `size` parametrining nomi */
  sizeParam?: string;
  /** Har bir so'rov uchun qayta urinishlar soni */
  retries?: number;
}

// ─────────────────────────── Xato ───────────────────────────

/**
 * Uzum API xatosi — barcha nosozliklar (HTTP, tarmoq, taymaut, buzuq JSON)
 * shu klassga keltiriladi.
 */
export class UzumApiError extends Error {
  /** HTTP status (tarmoq/taymaut uchun 0) */
  readonly status: number;
  /** Mashina o'qiy oladigan xato kodi */
  readonly code: UzumErrorCode;
  /** Qayta urinish mantiqiymi (5xx, 429, tarmoq, taymaut) */
  readonly retryable: boolean;
  /** `Retry-After` dan olingan kutish vaqti, ms */
  readonly retryAfterMs: number | null;
  /** Javob tanasi yoki asl xato (nosozlikni tekshirish uchun) */
  readonly details?: unknown;

  constructor(params: {
    status: number;
    code: UzumErrorCode;
    message: string;
    retryable?: boolean;
    retryAfterMs?: number | null;
    details?: unknown;
  }) {
    super(params.message);
    this.name = 'UzumApiError';
    this.status = params.status;
    this.code = params.code;
    this.retryable = params.retryable ?? false;
    this.retryAfterMs = params.retryAfterMs ?? null;
    this.details = params.details;
  }

  /** So'rov belgilangan vaqtda tugamadi */
  static timeout(timeoutMs: number): UzumApiError {
    return new UzumApiError({
      status: 0,
      code: 'timeout',
      message: `Uzum API ${timeoutMs} ms ichida javob bermadi`,
      retryable: true,
    });
  }

  /** Tarmoq darajasidagi nosozlik (DNS, TLS, uzilish) */
  static network(message: string, details?: unknown): UzumApiError {
    return new UzumApiError({
      status: 0,
      code: 'network',
      message: `Uzum API bilan aloqa yo‘q: ${message}`,
      retryable: true,
      details,
    });
  }

  /** Javob JSON emas yoki kutilmagan ko'rinishda */
  static invalidResponse(message: string, details?: unknown): UzumApiError {
    return new UzumApiError({
      status: 0,
      code: 'invalid_response',
      message: `Uzum API javobi tushunarsiz: ${message}`,
      retryable: false,
      details,
    });
  }

  /** HTTP statusdan xato yasash */
  static fromStatus(
    status: number,
    message: string,
    details?: unknown,
    retryAfterMs: number | null = null,
  ): UzumApiError {
    const code: UzumErrorCode =
      status === 400
        ? 'bad_request'
        : status === 401
          ? 'unauthorized'
          : status === 403
            ? 'forbidden'
            : status === 404
              ? 'not_found'
              : status === 429
                ? 'rate_limited'
                : status >= 500
                  ? 'server_error'
                  : 'api_error';
    // Faqat 429, 408 va server xatolarida qayta urinish mantiqiy
    const retryable = status === 429 || status === 408 || status >= 500;
    return new UzumApiError({ status, code, message, retryable, retryAfterMs, details });
  }
}

/** Ixtiyoriy xatoni `UzumApiError` ga keltiradi */
export function toUzumApiError(err: unknown): UzumApiError {
  if (err instanceof UzumApiError) return err;
  if (err instanceof Error) return UzumApiError.network(err.message, err);
  return new UzumApiError({
    status: 0,
    code: 'unknown',
    message: 'Uzum API bilan ishlashda noma’lum xatolik',
    retryable: false,
    details: err,
  });
}

/** Xatoni foydalanuvchiga ko'rsatiladigan o'zbekcha matnga aylantiradi */
export function uzumErrorMessage(err: UzumApiError): string {
  switch (err.code) {
    case 'unauthorized':
      return 'API kalit noto‘g‘ri yoki muddati tugagan';
    case 'forbidden':
      return 'API kalitga bu do‘kon uchun ruxsat berilmagan';
    case 'not_found':
      return 'Uzum API bu manzilni topmadi (endpoint o‘zgargan bo‘lishi mumkin)';
    case 'rate_limited':
      return 'Uzum API so‘rovlar chegarasiga yetdi — birozdan so‘ng qayta urinib ko‘ring';
    case 'timeout':
      return 'Uzum API javob bermadi (vaqt tugadi) — keyinroq urinib ko‘ring';
    case 'network':
      return 'Uzum API bilan aloqa yo‘q — internet aloqasini tekshiring';
    case 'server_error':
      return 'Uzum serverida vaqtinchalik xatolik — keyinroq urinib ko‘ring';
    case 'bad_request':
      return 'Uzum API so‘rovni qabul qilmadi (parametrlar noto‘g‘ri)';
    case 'invalid_response':
      return 'Uzum API kutilmagan javob qaytardi';
    default:
      return err.message || 'Uzum API xatosi';
  }
}

// ─────────────────────────── Kichik yordamchilar ───────────────────────────

/** Oddiy obyekt (massiv va null emas) */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

/** Base URL va yo'lni xavfsiz birlashtiradi */
function joinUrl(baseUrl: string, path: string): string {
  const base = baseUrl.replace(/\/+$/, '');
  const tail = path.startsWith('/') ? path : `/${path}`;
  return `${base}${tail}`;
}

/**
 * Query qatorini yig'adi. Massivlar takrorlanuvchi kalit sifatida ketadi
 * (`?shopIds=1&shopIds=2`) — Spring Pageable uslubidagi API'lar shuni kutadi.
 */
function buildQuery(params: UzumQuery | undefined): string {
  if (!params) return '';
  const sp = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    if (Array.isArray(value)) {
      for (const item of value) {
        if (item === undefined || item === null) continue;
        sp.append(key, String(item));
      }
    } else {
      sp.append(key, String(value));
    }
  }
  const qs = sp.toString();
  return qs ? `?${qs}` : '';
}

/** `Retry-After` (sekund yoki HTTP-sana) → ms */
function parseRetryAfter(header: string | null): number | null {
  if (!header) return null;
  const seconds = Number(header);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.min(seconds * 1000, 60_000);
  const at = Date.parse(header);
  if (Number.isNaN(at)) return null;
  return Math.min(Math.max(0, at - Date.now()), 60_000);
}

/**
 * Javob konvertini ochadi.
 * Uzum Spring uslubida `{ successful, errorMessage, payload }` qaytaradi, lekin
 * maydon nomlari tasdiqlanmagan — shuning uchun `payload | data | result | content`
 * variantlarining hammasi qo'llab-quvvatlanadi.
 * TODO(uzum): real kalit bilan tekshirish — konvert nomlari aniqlanganda soddalashtirish mumkin.
 */
function unwrapPayload(json: unknown): unknown {
  if (!isRecord(json)) return json;

  const ok = json.successful ?? json.success;
  if (ok === false) {
    const message =
      typeof json.errorMessage === 'string' && json.errorMessage
        ? json.errorMessage
        : 'Uzum API muvaffaqiyatsiz javob qaytardi';
    throw new UzumApiError({
      status: 200,
      code: 'api_error',
      message,
      retryable: false,
      details: json,
    });
  }

  for (const key of ['payload', 'data', 'result'] as const) {
    const value = json[key];
    if (value !== undefined && value !== null) return value;
  }
  return json;
}

/** Javob tanasidan xato matnini ajratib oladi */
function errorMessageFromBody(body: unknown, status: number): string {
  if (isRecord(body)) {
    for (const key of ['errorMessage', 'message', 'error', 'detail', 'title'] as const) {
      const value = body[key];
      if (typeof value === 'string' && value.trim()) return value.trim();
    }
  }
  if (typeof body === 'string' && body.trim()) return body.trim().slice(0, 300);
  return `Uzum API ${status} xatosi`;
}

// ─────────────────────────── RPS cheklovi ───────────────────────────

/**
 * Juda oddiy navbat: so'rovlar bir-biridan kamida `minIntervalMs` masofada boshlanadi.
 * `pause()` — `429` kelganda butun klientni vaqtincha to'xtatadi.
 */
class RateLimiter {
  private nextSlotAt = 0;
  private pausedUntil = 0;

  constructor(private readonly minIntervalMs: number) {}

  async acquire(): Promise<void> {
    const now = Date.now();
    const slot = Math.max(now, this.nextSlotAt, this.pausedUntil);
    // Navbatni sinxron holda band qilamiz — parallel chaqiruvlar ham teng taqsimlanadi
    this.nextSlotAt = slot + this.minIntervalMs;
    const wait = slot - now;
    if (wait > 0) await sleep(wait);
  }

  pause(ms: number): void {
    this.pausedUntil = Math.max(this.pausedUntil, Date.now() + ms);
  }
}

// ─────────────────────────── Klient ───────────────────────────

/** Backoff bazasi (ms) — 1-urinish ~400 ms, 2-urinish ~800 ms ... */
const BACKOFF_BASE_MS = 400;
const BACKOFF_MAX_MS = 15_000;

export class UzumHttp {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly limiter: RateLimiter;

  constructor(opts: UzumHttpOptions) {
    this.apiKey = opts.apiKey ?? '';
    this.baseUrl = opts.baseUrl ?? env.uzum.baseUrl;
    this.timeoutMs = Math.max(1_000, opts.timeoutMs ?? env.uzum.timeoutMs);
    this.maxRetries = Math.max(0, opts.maxRetries ?? env.uzum.maxRetries);
    const rps = Math.max(0.2, opts.rpsLimit ?? env.uzum.rpsLimit);
    this.limiter = new RateLimiter(Math.ceil(1000 / rps));
  }

  /** Sozlangan qayta urinishlar soni (chaqiruvchi undan oshib ketmasligi uchun) */
  get retryCount(): number {
    return this.maxRetries;
  }

  /** GET so'rov (konvert ochilgan holda qaytadi) */
  get(path: string, query?: UzumQuery, opts: UzumRequestOptions = {}): Promise<unknown> {
    return this.request(path, { ...opts, method: 'GET', query });
  }

  /** POST so'rov */
  post(
    path: string,
    body?: unknown,
    query?: UzumQuery,
    opts: UzumRequestOptions = {},
  ): Promise<unknown> {
    return this.request(path, { ...opts, method: 'POST', body, query });
  }

  /**
   * Bitta so'rov (qayta urinishlar bilan).
   * Xatolikda doimo `UzumApiError` tashlaydi.
   */
  async request(path: string, opts: UzumRequestOptions = {}): Promise<unknown> {
    const retries = Math.max(0, opts.retries ?? this.maxRetries);

    let lastError: UzumApiError = new UzumApiError({
      status: 0,
      code: 'unknown',
      message: 'Uzum API so‘rovi bajarilmadi',
    });

    for (let attempt = 0; attempt <= retries; attempt += 1) {
      try {
        return await this.once(path, opts);
      } catch (err) {
        lastError = toUzumApiError(err);

        // Token formati: avval prefikssiz, 401/403 bo'lsa bir marta `Bearer` bilan sinaymiz
        if ((lastError.status === 401 || lastError.status === 403) && !this.useBearer && !this.bearerTried) {
          this.bearerTried = true;
          this.useBearer = true;
          continue;
        }

        if (!lastError.retryable || attempt === retries) throw lastError;
        await sleep(this.backoffMs(attempt, lastError.retryAfterMs));
      }
    }

    throw lastError;
  }

  /**
   * Barcha sahifalarni yig'adi (page 0 dan).
   * `pick` — bitta sahifaning javobidan elementlar massivini ajratib beradi.
   * To'xtash shartlari: bo'sh sahifa, `size` dan kam element, `maxPages` chegarasi.
   */
  async fetchAllPages<T>(
    path: string,
    params: UzumQuery,
    pick: (payload: unknown) => T[],
    opts: UzumPageOptions = {},
  ): Promise<T[]> {
    const size = Math.max(1, opts.size ?? UZUM_PAGE_LIMITS.default);
    const maxPages = Math.max(1, opts.maxPages ?? UZUM_MAX_PAGES);
    const pageParam = opts.pageParam ?? 'page';
    const sizeParam = opts.sizeParam ?? 'size';

    const out: T[] = [];

    for (let page = 0; page < maxPages; page += 1) {
      const payload = await this.request(path, {
        method: 'GET',
        query: { ...params, [pageParam]: page, [sizeParam]: size },
        retries: opts.retries,
      });

      const chunk = pick(payload);
      if (chunk.length === 0) break;
      out.push(...chunk);
      // To'liq bo'lmagan sahifa — oxirgi sahifa
      if (chunk.length < size) break;
    }

    return out;
  }

  /**
   * Uzum spetsifikatsiyasi bo'yicha token \`Bearer\` prefiksisiz yuboriladi.
   * Ba'zi kabinetlarda esa aksincha talab qilinishi mumkin — birinchi 401/403 dan keyin
   * bir marta \`Bearer\` bilan sinab ko'ramiz va ishlagan variantni eslab qolamiz.
   */
  private useBearer = false;
  /** `Bearer` varianti allaqachon sinab ko'rilganmi (cheksiz aylanishning oldini oladi) */
  private bearerTried = false;

  private authHeader(): string {
    const key = this.apiKey.trim().replace(/^Bearer\s+/i, '');
    return this.useBearer ? `Bearer ${key}` : key;
  }

  // ─────────────── ichki ───────────────

  /** Bitta HTTP urinish (qayta urinishlarsiz) */
  private async once(path: string, opts: UzumRequestOptions): Promise<unknown> {
    const method: UzumHttpMethod = opts.method ?? 'GET';
    const url = joinUrl(this.baseUrl, path) + buildQuery(opts.query);

    await this.limiter.acquire();

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    // `Response` tipini global e'londan emas, `fetch` dan olamiz (muhitga bog'liq bo'lmasin)
    let response: Awaited<ReturnType<typeof fetch>>;
    try {
      response = await fetch(url, {
        method,
        headers: {
          authorization: this.authHeader(),
          accept: 'application/json',
          'accept-language': 'uz',
          ...(opts.body !== undefined ? { 'content-type': 'application/json' } : {}),
        },
        body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
        signal: controller.signal,
      });
    } catch (err) {
      if (controller.signal.aborted) throw UzumApiError.timeout(this.timeoutMs);
      throw UzumApiError.network(err instanceof Error ? err.message : 'noma’lum xatolik', err);
    } finally {
      clearTimeout(timer);
    }

    const text = await response.text().catch(() => '');
    const body = parseJson(text);

    if (!response.ok) {
      const retryAfterMs =
        response.status === 429 ? parseRetryAfter(response.headers.get('retry-after')) : null;
      // 429 — butun klient biroz pauza qiladi (boshqa so'rovlar ham kutadi)
      if (response.status === 429) this.limiter.pause(retryAfterMs ?? 2_000);
      throw UzumApiError.fromStatus(
        response.status,
        errorMessageFromBody(body, response.status),
        body,
        retryAfterMs,
      );
    }

    if (opts.raw) return body;
    return unwrapPayload(body);
  }

  /** Eksponensial backoff + jitter (kutilmagan "to'lqin"lardan saqlaydi) */
  private backoffMs(attempt: number, retryAfterMs: number | null): number {
    const base = Math.min(BACKOFF_BASE_MS * 2 ** attempt, BACKOFF_MAX_MS);
    const jitter = Math.floor(base * 0.25 * Math.random());
    return Math.max(retryAfterMs ?? 0, base + jitter);
  }
}

/** JSON'ni xavfsiz o'qish (bo'sh yoki buzuq tana ham xato tashlamaydi) */
function parseJson(text: string): unknown {
  const trimmed = text.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return trimmed;
  }
}
