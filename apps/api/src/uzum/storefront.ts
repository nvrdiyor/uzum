/**
 * uzum.uz xaridor saytining ochiq API'si — faqat Seller OpenAPI'da yo'q
 * ma'lumot uchun.
 *
 * Seller OpenAPI'da sharh endpointi YO'Q (2026-09-26 da 35 ta yo'l qayta
 * tekshirildi). Sharhlar esa uzum.uz mahsulot sahifasida hamma uchun ochiq
 * ko'rinadi va sayt ularni shu manzildan oladi:
 *
 *   GET https://api.uzum.uz/api/product/{productId}/reviews?amount=20&page=0
 *
 * Kalit talab qilinmaydi. Javob: `{ payload: Review[] }`, eng yangisi birinchi.
 * Faqat O'QISH mumkin — sharhga javob yozish Uzum kabinetida bo'ladi.
 */
import type { UzumReview } from './types.js';

const STOREFRONT_BASE = 'https://api.uzum.uz/api';
const PAGE_SIZE = 20;
const TIMEOUT_MS = 15_000;
/** Xaridor saytiga ketma-ket so'rovlar orasidagi tanaffus */
const PAUSE_MS = 200;

interface StorefrontReview {
  reviewId?: number | string;
  productId?: number | string;
  date?: number;
  customer?: string;
  isAnonymous?: boolean;
  rating?: number;
  content?: string;
  pros?: string;
  cons?: string;
  reply?: { content?: string; date?: number } | null;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fetchPage(productId: string, page: number): Promise<StorefrontReview[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const url = `${STOREFRONT_BASE}/product/${encodeURIComponent(productId)}/reviews?amount=${PAGE_SIZE}&page=${page}`;
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'application/json', 'Accept-Language': 'uz-UZ' },
    });
    if (!res.ok) throw new Error(`uzum.uz sharhlar: HTTP ${res.status}`);
    const body = (await res.json()) as { payload?: unknown };
    return Array.isArray(body.payload) ? (body.payload as StorefrontReview[]) : [];
  } finally {
    clearTimeout(timer);
  }
}

/** Sharh matni: izoh + "Afzalliklari / Kamchiliklari" (xaridor to'ldirgan bo'lsa) */
function composeText(r: StorefrontReview): string | undefined {
  const parts = [
    r.content?.trim(),
    r.pros?.trim() ? `Afzalliklari: ${r.pros.trim()}` : '',
    r.cons?.trim() ? `Kamchiliklari: ${r.cons.trim()}` : '',
  ].filter(Boolean);
  return parts.length ? parts.join('\n') : undefined;
}

function toReview(r: StorefrontReview, productId: string): UzumReview | null {
  const id = r.reviewId !== undefined && r.reviewId !== null ? String(r.reviewId) : '';
  if (!id || !r.date) return null;
  const answer = r.reply?.content?.trim();
  return {
    id,
    productId: String(r.productId ?? productId),
    rating: Math.min(5, Math.max(1, Math.round(Number(r.rating) || 5))),
    text: composeText(r),
    // Anonim sharhda Uzum "***" yuboradi — ism yo'q deb olamiz
    author: r.isAnonymous || !r.customer || /^\*+$/.test(r.customer) ? undefined : r.customer,
    publishedAt: new Date(r.date).toISOString(),
    answered: Boolean(answer),
    answerText: answer || undefined,
  };
}

/**
 * Mahsulotlar sharhlari. Har mahsulot uchun sahifalab o'qiladi va `since` dan
 * eski sharhga yetganda to'xtaydi (sharhlar yangidan eskiga keladi).
 * Bitta mahsulotdagi xato qolganlarini to'xtatmaydi.
 */
export async function fetchStorefrontReviews(
  productIds: string[],
  since: Date,
  maxPagesPerProduct = 25,
): Promise<{ reviews: UzumReview[]; failed: number }> {
  const reviews: UzumReview[] = [];
  let failed = 0;

  for (const productId of productIds) {
    try {
      for (let page = 0; page < maxPagesPerProduct; page += 1) {
        const rows = await fetchPage(productId, page);
        await sleep(PAUSE_MS);
        let reachedOld = false;
        for (const raw of rows) {
          const review = toReview(raw, productId);
          if (!review) continue;
          reviews.push(review);
          if (Date.parse(review.publishedAt) < since.getTime()) reachedOld = true;
        }
        if (rows.length < PAGE_SIZE || reachedOld) break;
      }
    } catch {
      failed += 1;
    }
  }

  return { reviews, failed };
}
