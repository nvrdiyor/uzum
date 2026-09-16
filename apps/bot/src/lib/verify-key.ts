/**
 * Uzum API kalitini DARHOL tekshirish.
 *
 * Ilgari bot kalitni tekshirmasdan saqlab, to'liq sinxronizatsiyani navbatga
 * qo'yardi. Kalit noto'g'ri bo'lsa sotuvchi buni faqat sinxron yiqilganda —
 * o'n daqiqalardan keyin — bilardi va nima xato bo'lganini tushunmasdi.
 *
 * Bu yerda eng arzon tekshiruv bajariladi: do'konlar ro'yxatini so'raymiz.
 * Javob 200 bo'lsa kalit haqiqiy va unga kamida bitta do'kon biriktirilgan.
 *
 * DIQQAT: Uzum `Authorization` sarlavhasini `Bearer` prefiksisiz kutadi.
 */

/** Tekshiruv uchun maksimal kutish — foydalanuvchi botda javob kutib turadi */
const TIMEOUT_MS = 12_000;

const BASE_URL = process.env.UZUM_API_BASE ?? 'https://api-seller.uzum.uz/api/seller-openapi';

export interface KeyCheck {
  ok: boolean;
  /** Foydalanuvchiga ko'rsatiladigan sabab (ok=false bo'lganda) */
  reason?: 'invalid' | 'no_shops' | 'network';
  /** Topilgan do'konlar soni */
  shops?: number;
}

/**
 * Demo rejimida tarmoqqa chiqmaymiz — sinov muhitida istalgan kalit qabul
 * qilinadi, aks holda demo bilan tanishayotgan foydalanuvchi ilgari siljiy olmaydi.
 */
function isDemoMode(): boolean {
  return (process.env.UZUM_MODE ?? 'demo') === 'demo';
}

export async function verifyUzumKey(apiKey: string): Promise<KeyCheck> {
  if (isDemoMode()) return { ok: true };

  const key = apiKey.trim();
  if (!key) return { ok: false, reason: 'invalid' };

  try {
    const res = await fetch(`${BASE_URL}/v1/shops`, {
      headers: { Authorization: key, Accept: 'application/json' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    // 401/403 — kalit noto'g'ri yoki bekor qilingan
    if (res.status === 401 || res.status === 403) return { ok: false, reason: 'invalid' };
    if (!res.ok) return { ok: false, reason: 'network' };

    const payload: unknown = await res.json().catch(() => null);
    const list = Array.isArray(payload)
      ? payload
      : ((payload as { shops?: unknown[]; content?: unknown[]; items?: unknown[] } | null)?.shops ??
        (payload as { content?: unknown[] } | null)?.content ??
        (payload as { items?: unknown[] } | null)?.items ??
        []);

    const shops = Array.isArray(list) ? list.length : 0;
    // Kalit ishlaydi, lekin do'kon biriktirilmagan — sinxron baribir bo'sh chiqadi
    if (shops === 0) return { ok: false, reason: 'no_shops' };

    return { ok: true, shops };
  } catch {
    // Tarmoq uzilishi — kalitni ayblamaymiz, qayta urinishni taklif qilamiz
    return { ok: false, reason: 'network' };
  }
}
