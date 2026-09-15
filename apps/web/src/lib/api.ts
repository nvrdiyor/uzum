/**
 * API klient — barcha so'rovlar shu yerdan o'tadi.
 * Token localStorage'da, aktiv kompaniya x-company-id sarlavhasida yuboriladi.
 */

const BASE = import.meta.env.VITE_API_URL ?? '/api/v1';

export const TOKEN_KEY = 'sq-token';
export const COMPANY_KEY = 'sq-company';

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string | null): void {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* noop */
  }
}

export function getCompanyId(): string | null {
  try {
    return localStorage.getItem(COMPANY_KEY);
  } catch {
    return null;
  }
}

export function setCompanyId(id: string | null): void {
  try {
    if (id) localStorage.setItem(COMPANY_KEY, id);
    else localStorage.removeItem(COMPANY_KEY);
  } catch {
    /* noop */
  }
}

export interface ApiErrorShape {
  code: string;
  message: string;
  details?: unknown;
}

export class ApiError extends Error {
  status: number;
  code: string;
  details?: unknown;

  constructor(status: number, body: ApiErrorShape) {
    super(body.message);
    this.status = status;
    this.code = body.code;
    this.details = body.details;
  }

  /** Tarif limiti sabab bloklangan (402) */
  get isPlanLimit(): boolean {
    return this.status === 402 || this.code === 'plan_limit';
  }
}

type Query = Record<string, string | number | boolean | undefined | null>;

function buildUrl(path: string, query?: Query): string {
  const url = `${BASE}${path.startsWith('/') ? path : `/${path}`}`;
  if (!query) return url;
  const qs = new URLSearchParams();
  Object.entries(query).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') qs.append(k, String(v));
  });
  const s = qs.toString();
  return s ? `${url}?${s}` : url;
}

async function request<T>(
  method: string,
  path: string,
  opts: { query?: Query; body?: unknown; signal?: AbortSignal; raw?: boolean } = {},
): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  const companyId = getCompanyId();
  if (companyId) headers['x-company-id'] = companyId;
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';

  const res = await fetch(buildUrl(path, opts.query), {
    method,
    headers,
    credentials: 'include',
    signal: opts.signal,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });

  if (opts.raw) {
    if (!res.ok) throw new ApiError(res.status, { code: 'download_failed', message: 'Yuklab olishda xatolik' });
    return (await res.blob()) as unknown as T;
  }

  if (res.status === 204) return undefined as T;

  let payload: unknown = null;
  const text = await res.text();
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = { error: { code: 'bad_response', message: text.slice(0, 200) } };
    }
  }

  if (!res.ok) {
    const err = (payload as { error?: ApiErrorShape })?.error ?? {
      code: 'unknown',
      message: `Xatolik (${res.status})`,
    };
    if (res.status === 401) {
      setToken(null);
      if (!location.pathname.startsWith('/login') && !location.pathname.startsWith('/auth')) {
        /*
         * Bu yo'l React render'idan tashqarida ishlaydi, shuning uchun
         * <Navigate state={{ from }}> ishlamaydi — manzilni `next` orqali
         * uzatamiz (AuthCallback ham aynan shu nomdan foydalanadi).
         */
        const next = encodeURIComponent(location.pathname + location.search);
        location.href = `/login?next=${next}`;
      }
    }
    throw new ApiError(res.status, err);
  }

  return payload as T;
}

export const api = {
  get: <T>(path: string, query?: Query, signal?: AbortSignal) => request<T>('GET', path, { query, signal }),
  post: <T>(path: string, body?: unknown, query?: Query) => request<T>('POST', path, { body, query }),
  put: <T>(path: string, body?: unknown) => request<T>('PUT', path, { body }),
  patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, { body }),
  del: <T>(path: string, query?: Query) => request<T>('DELETE', path, { query }),
  blob: (path: string, query?: Query) => request<Blob>('GET', path, { query, raw: true }),
};
