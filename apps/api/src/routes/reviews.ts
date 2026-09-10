/**
 * Sharhlar moduli — /api/v1/reviews
 *
 *  GET  /             → ReviewsResponse (reyting taqsimoti, sahifalangan ro'yxat)
 *  GET  /templates    → javob shablonlari (CompanySetting kaliti: 'review_templates')
 *  PUT  /templates    → shablonlarni saqlash
 *  POST /:id/reply    → bitta sharhga javob (Uzum API + bazada answered=true)
 *  POST /auto-reply   → javobsiz sharhlarga ommaviy javob (tarif limiti hisobga olinadi)
 *
 * Ro'yxatni ko'rish barcha tariflarda ochiq, javob berish esa `reviews_autoreply`
 * funksiyasini talab qiladi. Uzum kabineti ulanmagan bo'lsa javob bazaga yoziladi,
 * lekin `sentToUzum: false` bilan qaytariladi — jarayon xato bermaydi.
 */
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '@savdoiq/db';
import type { Prisma } from '@savdoiq/db';
import {
  getPlan,
  pct,
  reviewReplySchema,
  round,
  type Paginated,
  type ReviewRow,
  type ReviewsResponse,
} from '@savdoiq/shared';
import { AppError, ah } from '../lib/errors.js';
import { companyCtx, requireAuth, requireCompany, requireFeature, requireRole } from '../lib/auth.js';
import { paginate, resolveRange } from '../lib/period.js';
import { decryptSecret } from '../lib/crypto.js';
import { getStoreIds } from '../services/common.js';
import { createUzumClient } from '../uzum/client.js';
import type { UzumClient } from '../uzum/types.js';

const router = Router();
router.use(requireAuth, requireCompany);

// ─────────────────────────── Umumiy yordamchilar ───────────────────────────

/** Salbiy sharh chegarasi (shu reytingdan past — salbiy) */
const NEGATIVE_MAX_RATING = 3;

/** Ro'yxat filtri */
const FILTERS = ['all', 'unanswered', 'negative'] as const;
type ReviewFilter = (typeof FILTERS)[number];

const asFilter = (value: string | undefined): ReviewFilter =>
  (FILTERS as readonly string[]).includes(value ?? '') ? (value as ReviewFilter) : 'all';

/** Bazadagi sharh + bog'liq mahsulot/SKU maydonlari */
interface DbReview {
  id: string;
  rating: number;
  text: string | null;
  author: string | null;
  publishedAt: Date;
  answered: boolean;
  answerText: string | null;
  autoAnswered: boolean;
  product: { title: string; imageUrl: string | null } | null;
  sku: { sku: string; title: string; imageUrl: string | null } | null;
}

const toReviewRow = (r: DbReview): ReviewRow => ({
  id: r.id,
  rating: r.rating,
  text: r.text,
  author: r.author,
  publishedAt: r.publishedAt.toISOString(),
  answered: r.answered,
  answerText: r.answerText,
  autoAnswered: r.autoAnswered,
  productTitle: r.product?.title ?? r.sku?.title ?? null,
  sku: r.sku?.sku ?? null,
  imageUrl: r.sku?.imageUrl ?? r.product?.imageUrl ?? null,
});

/** Prisma so'rovlarida bir xil `include` ishlatiladi */
const REVIEW_INCLUDE = {
  product: { select: { title: true, imageUrl: true } },
  sku: { select: { sku: true, title: true, imageUrl: true } },
} as const;

// ─────────────────────────── Javob shablonlari ───────────────────────────

/** CompanySetting kaliti */
const TEMPLATES_KEY = 'review_templates';

export interface ReviewTemplate {
  id: string;
  /** Shablon qaysi reyting uchun (1..5) */
  rating: number;
  label: string;
  /** {name} — mijoz ismi, {product} — mahsulot nomi */
  text: string;
}

const DEFAULT_TEMPLATES: ReviewTemplate[] = [
  {
    id: 'r5',
    rating: 5,
    label: '5 yulduz — minnatdorchilik',
    text: 'Rahmat, {name}! “{product}” sizga yoqqanidan juda xursandmiz. Yana kutamiz!',
  },
  {
    id: 'r4',
    rating: 4,
    label: '4 yulduz — rahmat va takomil',
    text: 'Fikringiz uchun rahmat, {name}! “{product}” haqidagi taklifingizni albatta hisobga olamiz.',
  },
  {
    id: 'r3',
    rating: 3,
    label: '3 yulduz — aniqlashtirish',
    text: 'Salom, {name}! Bahoyingiz uchun rahmat. “{product}” bo‘yicha nima yoqmaganini yozsangiz — tezda tuzatamiz.',
  },
  {
    id: 'r2',
    rating: 2,
    label: '2 yulduz — uzr va yechim',
    text: 'Uzr so‘raymiz, {name}. “{product}” kutganingizdek chiqmabdi. Muammoni hal qilish uchun biz bilan bog‘laning.',
  },
  {
    id: 'r1',
    rating: 1,
    label: '1 yulduz — uzr va kompensatsiya',
    text: 'Juda afsusdamiz, {name}. “{product}” bilan bog‘liq holatni shaxsan ko‘rib chiqamiz — iltimos, biz bilan bog‘laning.',
  },
];

const templateSchema = z.object({
  id: z.string().trim().min(1).max(40),
  rating: z.coerce.number().int().min(1).max(5),
  label: z.string().trim().min(1).max(80),
  text: z.string().trim().min(2).max(2000),
});

const templatesSchema = z.object({
  templates: z.array(templateSchema).min(1).max(10),
});

/** Kompaniyaning shablonlari (saqlanmagan yoki buzilgan bo'lsa — standartlari) */
async function loadTemplates(companyId: string): Promise<ReviewTemplate[]> {
  const row = await prisma.companySetting.findUnique({
    where: { companyId_key: { companyId, key: TEMPLATES_KEY } },
    select: { value: true },
  });
  if (!row?.value) return DEFAULT_TEMPLATES;

  try {
    const parsed: unknown = JSON.parse(row.value);
    const list = Array.isArray(parsed) ? parsed : (parsed as { templates?: unknown }).templates;
    const check = z.array(templateSchema).safeParse(list);
    if (!check.success || check.data.length === 0) return DEFAULT_TEMPLATES;
    return check.data;
  } catch {
    // Buzilgan JSON — standart shablonlarga qaytamiz
    return DEFAULT_TEMPLATES;
  }
}

/** Reytingga eng mos shablonni tanlaydi */
function pickTemplate(templates: ReviewTemplate[], rating: number): ReviewTemplate | null {
  if (templates.length === 0) return null;
  const exact = templates.find((t) => t.rating === rating);
  if (exact) return exact;
  // Aniq moslik bo'lmasa — reytingga eng yaqini
  return [...templates].sort((a, b) => Math.abs(a.rating - rating) - Math.abs(b.rating - rating))[0] ?? null;
}

/** {name} va {product} o'rin egallarini to'ldiradi */
function renderTemplate(text: string, vars: { name: string; product: string }): string {
  return text.replace(/\{name\}/g, vars.name).replace(/\{product\}/g, vars.product);
}

// ─────────────────────────── Uzum'ga javob yuborish ───────────────────────────

interface StoreClient {
  client: UzumClient;
  shopId: string;
}

/**
 * Do'kon bo'yicha Uzum klientini keshlaydigan yuboruvchi.
 * Kabinet ulanmagan yoki kalit o'qilmasa — `false` qaytaradi (xato tashlamaydi).
 */
function createReplySender() {
  const cache = new Map<string, StoreClient | null>();

  const resolve = async (storeId: string): Promise<StoreClient | null> => {
    const cached = cache.get(storeId);
    if (cached !== undefined) return cached;

    const store = await prisma.store.findUnique({
      where: { id: storeId },
      select: {
        id: true,
        uzumShopId: true,
        uzumAccount: { select: { id: true, apiKeyEnc: true, apiSecretEnc: true } },
      },
    });

    let result: StoreClient | null = null;
    if (store?.uzumAccount) {
      try {
        const apiKey = decryptSecret(store.uzumAccount.apiKeyEnc);
        const apiSecret = store.uzumAccount.apiSecretEnc
          ? decryptSecret(store.uzumAccount.apiSecretEnc)
          : null;
        const client = createUzumClient({ apiKey, apiSecret, seed: store.uzumAccount.id });
        result = { client, shopId: store.uzumShopId ?? store.id };
      } catch {
        // Kalitni ochib bo'lmadi — javob faqat bazaga yoziladi
        result = null;
      }
    }

    cache.set(storeId, result);
    return result;
  };

  return {
    /** Uzum'ga javobni yuboradi; muvaffaqiyatli bo'lsa `true` */
    async send(storeId: string, uzumReviewId: string | null, text: string): Promise<boolean> {
      const target = await resolve(storeId);
      if (!target || !uzumReviewId) return false;
      try {
        return await target.client.replyReview(target.shopId, uzumReviewId, text);
      } catch {
        return false;
      }
    },
  };
}

/** Kompaniyaning do'konlaridagi sharhni topadi */
async function findCompanyReview(storeIds: string[], id: string) {
  return prisma.review.findFirst({
    where: { id, storeId: { in: storeIds } },
    include: REVIEW_INCLUDE,
  });
}

// ─────────────────────────── GET / ───────────────────────────

router.get(
  '/',
  ah(async (req, res) => {
    const { company, plan } = companyCtx(req);
    const range = resolveRange(req, plan);
    const storeIds = await getStoreIds(company.id, range.storeId);
    const filter = asFilter((req.query as Record<string, string | undefined>).filter);

    // Jamlanma va taqsimot — davr + do'kon kesimida (ro'yxat filtri ta'sir qilmaydi)
    const base: Prisma.ReviewWhereInput = {
      storeId: { in: storeIds },
      publishedAt: { gte: range.from, lt: range.toExclusive },
    };

    const where: Prisma.ReviewWhereInput = {
      ...base,
      ...(filter === 'unanswered' ? { answered: false } : {}),
      ...(filter === 'negative' ? { rating: { lte: NEGATIVE_MAX_RATING } } : {}),
      ...(range.search
        ? { OR: [{ text: { contains: range.search } }, { author: { contains: range.search } }] }
        : {}),
    };

    const [count, answered, avg, ratingCounts, rows] = await Promise.all([
      prisma.review.count({ where: base }),
      prisma.review.count({ where: { ...base, answered: true } }),
      prisma.review.aggregate({ _avg: { rating: true }, where: base }),
      Promise.all([5, 4, 3, 2, 1].map((rating) => prisma.review.count({ where: { ...base, rating } }))),
      prisma.review.findMany({
        where,
        orderBy: { publishedAt: range.order === 'asc' ? 'asc' : 'desc' },
        take: 2000,
        include: REVIEW_INCLUDE,
      }),
    ]);

    const items = rows.map(toReviewRow);
    const page: Paginated<ReviewRow> = paginate(items, range.page, range.pageSize);

    // Ma'lumot bo'lmasa ham 200 va nol qiymatlar qaytadi
    const payload: ReviewsResponse = {
      totals: {
        count,
        avgRating: round(avg._avg.rating ?? 0, 2),
        answered,
        unanswered: Math.max(0, count - answered),
      },
      distribution: [5, 4, 3, 2, 1].map((rating, idx) => ({ rating, count: ratingCounts[idx] ?? 0 })),
      rows: page,
    };

    res.json(payload);
  }),
);

// ─────────────────────────── Shablonlar ───────────────────────────

interface TemplatesResponse {
  templates: ReviewTemplate[];
  /** Matnda ishlatiladigan o'rin egallari */
  placeholders: { key: string; label: string }[];
  isDefault: boolean;
}

const PLACEHOLDERS = [
  { key: '{name}', label: 'Mijoz ismi' },
  { key: '{product}', label: 'Mahsulot nomi' },
];

router.get(
  '/templates',
  ah(async (req, res) => {
    const { company } = companyCtx(req);
    const saved = await prisma.companySetting.findUnique({
      where: { companyId_key: { companyId: company.id, key: TEMPLATES_KEY } },
      select: { id: true },
    });
    const templates = await loadTemplates(company.id);

    const payload: TemplatesResponse = {
      templates,
      placeholders: PLACEHOLDERS,
      isDefault: !saved,
    };
    res.json(payload);
  }),
);

router.put(
  '/templates',
  requireRole('owner', 'manager'),
  ah(async (req, res) => {
    const { company } = companyCtx(req);
    // Ikkala shakl ham qabul qilinadi: massiv yoki { templates: [...] }
    const raw = Array.isArray(req.body) ? { templates: req.body } : (req.body ?? {});
    const input = templatesSchema.parse(raw);

    await prisma.companySetting.upsert({
      where: { companyId_key: { companyId: company.id, key: TEMPLATES_KEY } },
      create: { companyId: company.id, key: TEMPLATES_KEY, value: JSON.stringify(input.templates) },
      update: { value: JSON.stringify(input.templates) },
    });

    const payload: TemplatesResponse = {
      templates: input.templates,
      placeholders: PLACEHOLDERS,
      isDefault: false,
    };
    res.json(payload);
  }),
);

// ─────────────────────────── POST /:id/reply ───────────────────────────

interface ReplyResponse {
  ok: boolean;
  /** Javob Uzum kabinetiga yetib bordimi */
  sentToUzum: boolean;
  review: ReviewRow;
  message: string;
}

router.post(
  '/:id/reply',
  requireFeature('reviews_autoreply'),
  requireRole('owner', 'manager'),
  ah(async (req, res) => {
    const { company } = companyCtx(req);
    const input = reviewReplySchema.parse(req.body ?? {});
    const storeIds = await getStoreIds(company.id);

    const review = await findCompanyReview(storeIds, String(req.params.id));
    if (!review) throw AppError.notFound('Sharh topilmadi');
    if (review.answered) throw AppError.conflict('Bu sharhga allaqachon javob berilgan');

    const sender = createReplySender();
    const sentToUzum = await sender.send(review.storeId, review.uzumReviewId, input.text);

    const updated = await prisma.review.update({
      where: { id: review.id },
      data: {
        answered: true,
        answerText: input.text,
        answeredAt: new Date(),
        autoAnswered: false,
      },
      include: REVIEW_INCLUDE,
    });

    const payload: ReplyResponse = {
      ok: true,
      sentToUzum,
      review: toReviewRow(updated),
      message: sentToUzum
        ? 'Javob Uzum kabinetiga yuborildi'
        : 'Javob saqlandi, lekin Uzum kabinetiga yuborilmadi (kabinet ulanmagan yoki API javob bermadi)',
    };
    res.json(payload);
  }),
);

// ─────────────────────────── POST /auto-reply ───────────────────────────

const autoReplySchema = z.object({
  /** 'unanswered' — barcha javobsizlar, 'negative' — faqat past reytinglar */
  filter: z.enum(['unanswered', 'negative']).default('unanswered'),
  /** Nechta sharhga javob berilsin (tarif limitidan oshmaydi) */
  limit: z.coerce.number().int().min(1).max(500).optional(),
  storeId: z.string().optional(),
});

interface AutoReplyResponse {
  ok: boolean;
  /** Bugungi limit va undan foydalanish */
  dailyLimit: number;
  usedToday: number;
  remaining: number;
  /** Javob berilgan sharhlar soni */
  answered: number;
  /** Uzum kabinetiga yetib borgan javoblar */
  sentToUzum: number;
  /** Mos shablon topilmagani uchun o'tkazib yuborilganlar */
  skipped: number;
  rows: { id: string; rating: number; text: string; sentToUzum: boolean }[];
  message: string;
}

router.post(
  '/auto-reply',
  requireFeature('reviews_autoreply'),
  requireRole('owner', 'manager'),
  ah(async (req, res) => {
    const { company, plan } = companyCtx(req);
    const input = autoReplySchema.parse(req.body ?? {});
    const dailyLimit = getPlan(plan).limits.autoReplyPerDay;

    const storeIds = await getStoreIds(company.id, input.storeId);

    // Bugun (UTC) berilgan avto-javoblar
    const dayStart = new Date();
    dayStart.setUTCHours(0, 0, 0, 0);
    const usedToday = await prisma.review.count({
      where: { storeId: { in: storeIds }, autoAnswered: true, answeredAt: { gte: dayStart } },
    });

    const remaining = Math.max(0, dailyLimit - usedToday);
    if (remaining === 0) {
      throw AppError.limit(
        dailyLimit === 0
          ? 'Sizning tarifingizda avto-javob mavjud emas'
          : `Bugungi avto-javob limiti tugadi (${dailyLimit} ta)`,
        { plan, dailyLimit, usedToday },
      );
    }

    const take = Math.min(remaining, input.limit ?? remaining);
    const templates = await loadTemplates(company.id);

    const pending = await prisma.review.findMany({
      where: {
        storeId: { in: storeIds },
        answered: false,
        ...(input.filter === 'negative' ? { rating: { lte: NEGATIVE_MAX_RATING } } : {}),
      },
      orderBy: { publishedAt: 'desc' },
      take,
      include: REVIEW_INCLUDE,
    });

    const sender = createReplySender();
    const rows: AutoReplyResponse['rows'] = [];
    let sentToUzum = 0;
    let skipped = 0;

    for (const review of pending) {
      const template = pickTemplate(templates, review.rating);
      if (!template) {
        skipped += 1;
        continue;
      }

      const text = renderTemplate(template.text, {
        name: review.author?.trim() || 'mijoz',
        product: review.product?.title ?? review.sku?.title ?? 'mahsulot',
      });

      const ok = await sender.send(review.storeId, review.uzumReviewId, text);
      if (ok) sentToUzum += 1;

      await prisma.review.update({
        where: { id: review.id },
        data: { answered: true, answerText: text, answeredAt: new Date(), autoAnswered: true },
      });

      rows.push({ id: review.id, rating: review.rating, text, sentToUzum: ok });
    }

    const payload: AutoReplyResponse = {
      ok: true,
      dailyLimit,
      usedToday: usedToday + rows.length,
      remaining: Math.max(0, remaining - rows.length),
      answered: rows.length,
      sentToUzum,
      skipped,
      rows,
      message:
        rows.length === 0
          ? 'Javob kutayotgan sharh topilmadi'
          : `${rows.length} ta sharhga javob berildi (${pct(sentToUzum, rows.length)}% Uzum kabinetiga yetib bordi)`,
    };

    res.json(payload);
  }),
);

export default router;
