/**
 * Uzum adapteriga yagona kirish nuqtasi.
 *
 * Ishlatish:
 * ```ts
 * import { createUzumClient } from '../uzum/client.js';
 *
 * const uzum = createUzumClient({ apiKey });      // rejim env.uzum.mode dan
 * const check = await uzum.verify();
 * if (!check.ok) throw AppError.badRequest(check.message ?? 'API kalit noto‘g‘ri');
 * const shops = await uzum.getShops();
 * ```
 *
 * Rejim:
 *  • `demo` — `DemoUzumClient`, real API'siz determinlashtirilgan namunaviy ma'lumot;
 *  • `live` — `LiveUzumClient`, haqiqiy Uzum Seller OpenAPI.
 *
 * `opts.mode` berilsa u ustun turadi, aks holda `env.uzum.mode` (`UZUM_MODE`) ishlatiladi.
 */
import { env } from '../env.js';
import { DemoUzumClient } from './demo.js';
import { LiveUzumClient } from './live.js';
import type { UzumClient, UzumClientOptions, UzumMode } from './types.js';

/** Amaldagi rejimni aniqlaydi (opts → env → 'demo') */
export function resolveUzumMode(mode?: UzumMode): UzumMode {
  const value = mode ?? env.uzum.mode;
  return value === 'live' ? 'live' : 'demo';
}

/**
 * Rejimga mos `UzumClient` yaratadi.
 * Barcha `get*` metodlari xatolikda bo'sh massiv qaytaradi — chaqiruvchi kod
 * try/catch bilan o'rashi shart emas.
 */
export function createUzumClient(opts: UzumClientOptions): UzumClient {
  return resolveUzumMode(opts.mode) === 'live'
    ? new LiveUzumClient(opts)
    : new DemoUzumClient(opts);
}

export { DemoUzumClient } from './demo.js';
export { LiveUzumClient } from './live.js';
export {
  UzumApiError,
  UzumHttp,
  toUzumApiError,
  uzumErrorMessage,
  type UzumErrorCode,
  type UzumHttpOptions,
  type UzumQuery,
} from './http.js';
export {
  UZUM_ENDPOINTS,
  UZUM_MAX_PAGES,
  UZUM_PAGE_LIMITS,
  uzumEndpoint,
  uzumPath,
  type UzumEndpointKey,
} from './endpoints.js';
export * from './types.js';
