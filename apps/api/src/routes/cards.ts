/**
 * Kartochka SEO — /api/v1/cards
 *
 *  GET    /                              → CardListResponse (ball, ustuvorlik, 30 kunlik sotuv)
 *  GET    /:productId                    → CardDetailResponse
 *  PUT    /:productId/content/:lang      → CardContentDto (ikkalasi bo'sh — yozuv o'chadi)
 *  POST   /:productId/keywords           → { items: CardKeywordDto[] } (qo'shish yoki jadval importi)
 *  POST   /:productId/keywords/suggest   → { items: string[] } (faqat taklif, saqlanmaydi)
 *  PATCH  /:productId/keywords/:id       → CardKeywordDto
 *  DELETE /:productId/keywords/:id       → { ok: true }
 *  POST   /:productId/drafts             → CardDraftDto
 *  POST   /:productId/drafts/:id/apply   → { ok: true }
 *  DELETE /:productId/drafts/:id         → { ok: true }
 *
 * TEKIN YO'L. Pullik AI API ham, Uzum sahifalarini yig'ish (scraping) ham yo'q:
 *   - kartochka matni — Seller API bergan nom (bitta tilda) va sotuvchi o'zi
 *     joylagan matn (CardContent);
 *   - AI ishini sotuvchi bepul chatbotda (ChatGPT / Gemini / Claude.ai) qiladi:
 *     sayt so'rovni yozib beradi, javob qoralama (CardDraft) bo'lib shu yerga qaytadi;
 *   - Uzum'ga hech narsa avtomatik yozilmaydi: sotuvchi matnni kabinetga o'zi
 *     qo'yadi va qoralamani "qo'llandi" deb belgilaydi — ta'sir shu paytdan o'lchanadi.
 *
 * Ball `auditCard` dan (packages/shared/src/card-seo.ts) — sayt ham aynan shu
 * funksiyani chaqiradi. Shuning uchun audit kirishi (sarlavha qaysi tildan,
 * sharhlar qayerdan) faqat shu fayldagi yordamchilarda yig'iladi: ro'yxatdagi
 * ball va tahrirlash paytidagi jonli ball farq qilmasligi kerak.
 */
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '@savdoiq/db';
import type { Prisma } from '@savdoiq/db';
import {
  CARD_LANGS,
  CARD_LIMITS,
  addDays,
  auditCard,
  businessDayStart,
  cleanCardDescription as cleanDescription,
  cleanCardTitle as cleanTitle,
  detectCardLang,
  normalizeCardText,
  round,
  suggestCardKeywords,
  toBusinessDate,
  uzumProductUrl,
  type CardAuditContext,
  type CardAuditResult,
  type CardContentDto,
  type CardDetailResponse,
  type CardDraftDto,
  type CardImpact,
  type CardKeywordDto,
  type CardLang,
  type CardListResponse,
  type CardListRow,
  type CardReviewInsights,
  type CardSectionId,
} from '@savdoiq/shared';
import { AppError, ah } from '../lib/errors.js';
import { companyCtx, requireAuth, requireCompany, requireFeature, requireRole } from '../lib/auth.js';
import { paginate, resolveRange } from '../lib/period.js';
import { getLatestStocks, getStoreIds } from '../services/common.js';
import { aggregateSalesNet, getAdFeesBySku } from '../services/pnl.js';

const router = Router();
router.use(requireAuth, requireCompany, requireFeature('card_seo'));

/** Yozish amallari — kuzatuvchi (viewer) faqat ko'radi */
const canWrite = requireRole('owner', 'manager');

/** Sotuv oynasi (Toshkent savdo kuni) — ustuvorlik va kartochka sotuvi shu bo'yicha */
const SALES_DAYS = 30;
/** Bitta mahsulotda saqlanadigan qoralamalar soni — eskilari o'chadi */
const MAX_DRAFTS = 30;
/** Ta'sir: qo'llashdan oldingi va keyingi teng oyna, ko'pi bilan shuncha kun */
const IMPACT_MAX_DAYS = 14;
/** Ball shundan past — "zaif kartochka" (jamlanmadagi `lowScore`) */
const LOW_SCORE = 60;
/** Omborda yo'q tovarning ustuvorligi: matnni tuzatish hozir sotuv bermaydi */
const OUT_OF_STOCK_FACTOR = 0.25;
/** Tafsilotda o'qiladigan eng yangi sharhlar (afzallik/kamchilik va takliflar uchun) */
const REVIEW_SCAN = 500;
/** Afzallik va kamchiliklar ro'yxatining uzunligi (AI so'roviga ko'pi bilan 10 tasi ketadi) */
const MAX_INSIGHTS = 30;
const DAY_MS = 86_400_000;

// ─────────────────────────── Umumiy yordamchilar ───────────────────────────

const asLang = (value: string): CardLang | null =>
  (CARD_LANGS as string[]).includes(value) ? (value as CardLang) : null;

/** Belgilar bo'yicha qisqartirish (emoji va kirillni o'rtasidan kesmaslik uchun kod nuqtalari bilan) */
function clip(value: string, max: number): string {
  const chars = [...value.trim()];
  return chars.length > max ? `${chars.slice(0, max - 1).join('').trimEnd()}…` : chars.join('');
}

/**
 * Kalit so'zlar tartibi hamma joyda bir xil: qo'shilgan vaqt, bir so'rovda
 * qo'shilganlar — id (cuid ketma-ket) bo'yicha, ya'ni sotuvchi yozgan tartibda.
 * Ilgari ro'yxat faqat vaqt bo'yicha saralanardi va Postgres bir vaqtdagi
 * qatorlarni har safar boshqacha qaytarib, "eng muhim ibora" almashib turardi.
 */
const KEYWORD_ORDER = [{ createdAt: 'asc' }, { id: 'asc' }] satisfies Prisma.CardKeywordOrderByWithRelationInput[];

/**
 * API tilidagi nom Seller API nomi bilan bir xil bo'lsa — saqlanmaydi (bo'sh).
 * Sayt nom maydonini API nomi bilan to'ldirib yuboradi; uni saqlab qo'ysak,
 * sotuvchi keyin Uzum kabinetida nomni o'zgartirganda audit va AI so'rovi eski
 * nomda qolib ketardi. Bo'sh saqlangan nom o'rniga har doim jonli API nomi olinadi.
 */
function storedTitle(lang: CardLang, title: string, productTitle: string): string {
  return lang === detectCardLang(productTitle) && title === cleanTitle(productTitle) ? '' : title;
}

/**
 * Kartochka uchun mahsulot ma'lumoti. Ro'yxat, tafsilot va taklif bir xil
 * tanlovdan foydalanadi — audit kirishi hamma joyda bir xil yig'ilsin.
 */
const CARD_PRODUCT_SELECT = {
  id: true,
  storeId: true,
  uzumProductId: true,
  title: true,
  category: true,
  brand: true,
  imageUrl: true,
  status: true,
  rating: true,
  reviewsCount: true,
  store: { select: { title: true } },
  skus: {
    select: { id: true, title: true, imageUrl: true, archived: true, blocked: true, returnedPct: true },
  },
  cardContents: {
    select: { lang: true, title: true, descriptionHtml: true, source: true, updatedAt: true },
  },
  cardKeywords: {
    select: { id: true, text: true, demand: true, source: true, status: true },
    orderBy: KEYWORD_ORDER,
  },
} as const;

type CardProduct = Prisma.ProductGetPayload<{ select: typeof CARD_PRODUCT_SELECT }>;

/**
 * Uzum arxividagi tovar. products.ts dagi qoida bilan bir xil: SavdoIQ'da
 * "o'chirilgan" (hidden) belgisi faqat arxivdagi tovarda amal qiladi, shuning
 * uchun arxivni chiqarib tashlash yashirilganlarni ham chiqaradi, Uzum'da
 * qayta faollashgan tovar esa o'zi qaytadi.
 */
function isArchivedProduct(p: { status: string; skus: ReadonlyArray<{ archived: boolean }> }): boolean {
  return (p.skus.length > 0 && p.skus.every((s) => s.archived)) || /arch/i.test(p.status);
}

/** Kompaniyaga tegishli mahsulot (boshqa kompaniyaniki — 404, mavjudligi ham bilinmasin) */
async function loadCardProduct(companyId: string, productId: string): Promise<CardProduct> {
  const storeIds = await getStoreIds(companyId);
  const product = await prisma.product.findFirst({
    where: { id: productId, storeId: { in: storeIds } },
    select: CARD_PRODUCT_SELECT,
  });
  if (!product) throw AppError.notFound('Mahsulot topilmadi');
  return product;
}

/** Yozish amallari uchun yengil tekshiruv — faqat egalik */
async function ownProduct(companyId: string, productId: string): Promise<{ id: string; title: string }> {
  const storeIds = await getStoreIds(companyId);
  const product = await prisma.product.findFirst({
    where: { id: productId, storeId: { in: storeIds } },
    select: { id: true, title: true },
  });
  if (!product) throw AppError.notFound('Mahsulot topilmadi');
  return product;
}

function langParam(value: unknown): CardLang {
  const lang = asLang(String(value));
  if (!lang) throw AppError.badRequest('Til faqat ru yoki uz bo‘lishi mumkin');
  return lang;
}

/**
 * Audit uchun sarlavha va tavsiflar. Seller API nomni BITTA tilda beradi —
 * qaysi tilligi matndan aniqlanadi. Sotuvchi o'sha tilda o'z nomini joylamagan
 * bo'lsa API nomi ishlatiladi: Uzum'da u baribir turibdi, "nom yo'q" deyish
 * noto'g'ri bo'lardi. Tavsif esa faqat sotuvchi joylagan matndan (API bermaydi).
 */
function cardTexts(p: Pick<CardProduct, 'title' | 'cardContents'>) {
  const titles: Partial<Record<CardLang, string>> = {};
  const descriptions: Partial<Record<CardLang, string>> = {};
  for (const c of p.cardContents) {
    const lang = asLang(c.lang);
    if (!lang) continue;
    if (c.title.trim()) titles[lang] = c.title;
    if (c.descriptionHtml.trim()) descriptions[lang] = c.descriptionHtml;
  }
  const apiLang = detectCardLang(p.title);
  if (!titles[apiLang] && p.title.trim()) titles[apiLang] = p.title;
  return { titles, descriptions, apiLang };
}

const presentLangs = (rec: Partial<Record<CardLang, string>>): CardLang[] =>
  CARD_LANGS.filter((l) => (rec[l] ?? '').trim().length > 0);

/** Arxivda bo'lmagan variant nomlari, mahsulot nomidan farq qiladiganlari — AI uchun fakt */
function skuTitlesOf(p: Pick<CardProduct, 'title' | 'skus'>): string[] {
  const base = normalizeCardText(p.title);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of p.skus) {
    if (s.archived) continue;
    const title = s.title.replace(/\s+/g, ' ').trim();
    const key = normalizeCardText(title);
    if (!title || key === base || seen.has(key)) continue;
    seen.add(key);
    out.push(title);
  }
  return out;
}

/**
 * Kartochka holati: blok va qaytarish — arxivda bo'lmagan SKU'lar bo'yicha
 * (arxivdagi variant xaridorga ko'rinmaydi), rasm — istalgan joyda bo'lsa yetadi.
 */
function cardHealth(p: Pick<CardProduct, 'imageUrl' | 'skus'>): NonNullable<CardAuditContext['health']> {
  const live = p.skus.filter((s) => !s.archived);
  return {
    blocked: live.some((s) => s.blocked),
    returnedPct: live.length > 0 ? round(Math.max(...live.map((s) => s.returnedPct)), 1) : null,
    hasImage: Boolean(p.imageUrl) || p.skus.some((s) => Boolean(s.imageUrl)),
  };
}

interface ReviewAgg {
  count: number;
  avg: number;
  answered: number;
}

/**
 * Sharhlar konteksti. Bazadagi sharhlar (biz yuklagan) bo'lsa — ular: javob
 * berilganlar soni faqat shulardan ma'lum. Bo'lmasa Uzum katalogidagi son va
 * reyting olinadi, lekin javoblar noma'lum (null) — "javobsiz" deb jazolanmaydi.
 */
function reviewContext(
  p: Pick<CardProduct, 'reviewsCount' | 'rating'>,
  db: ReviewAgg | undefined,
): NonNullable<CardAuditContext['reviews']> {
  if (db && db.count > 0) return { count: db.count, rating: round(db.avg, 2), answered: db.answered };
  if (p.reviewsCount > 0) return { count: p.reviewsCount, rating: round(p.rating, 2), answered: null };
  return { count: 0, rating: 0, answered: null };
}

function auditContextOf(p: CardProduct, db: ReviewAgg | undefined): CardAuditContext {
  return { category: p.category, reviews: reviewContext(p, db), health: cardHealth(p) };
}

/** Joriy ball — faqat faol kalit so'zlar bilan (chiqarilganlari hisobga kirmaydi) */
function auditOf(p: CardProduct, context: CardAuditContext): CardAuditResult {
  const { titles, descriptions } = cardTexts(p);
  return auditCard({
    titles,
    descriptions,
    keywords: p.cardKeywords.filter((k) => k.status === 'active').map((k) => ({ text: k.text, demand: k.demand })),
    category: context.category,
    reviews: context.reviews,
    health: context.health,
  });
}

/**
 * Bo'lim foizi; ma'lumot yo'q bo'lim (sharhlar yoki holat konteksti berilmagan) — null.
 * Yuklanmagan tavsif va kalit so'zsiz kartochka esa 0 (audit ularni 0 ball bilan sanaydi).
 */
function sectionPercents(audit: CardAuditResult): Record<CardSectionId, number | null> {
  const out: Record<CardSectionId, number | null> = {
    title: null,
    keywords: null,
    description: null,
    social: null,
    health: null,
  };
  for (const s of audit.sections) {
    out[s.id] = s.available && s.max > 0 ? Math.round((Math.min(s.score, s.max) / s.max) * 100) : null;
  }
  return out;
}

/**
 * Oxirgi 30 savdo kuni (bugun ham kiradi). Chegaralar Toshkent kuni bo'yicha —
 * boshqa hisobotlardagi "30 kun" bilan bir xil raqam chiqishi uchun.
 */
function salesWindow(): { from: Date; toExclusive: Date } {
  const today = businessDayStart(toBusinessDate(new Date()));
  return { from: addDays(today, -(SALES_DAYS - 1)), toExclusive: addDays(today, 1) };
}

const KEYWORD_SOURCES = ['seller', 'auto', 'import'] as const;

function toKeywordDto(k: {
  id: string;
  text: string;
  demand: number | null;
  source: string;
  status: string;
}): CardKeywordDto {
  return {
    id: k.id,
    text: k.text,
    demand: k.demand ?? null,
    source: (KEYWORD_SOURCES as readonly string[]).includes(k.source) ? (k.source as CardKeywordDto['source']) : 'seller',
    status: k.status === 'excluded' ? 'excluded' : 'active',
  };
}

/** `usp` bazada JSON matn — buzilgan bo'lsa sahifa yiqilmasin, bo'sh ro'yxat */
function parseUsp(raw: string): string[] {
  try {
    const value: unknown = JSON.parse(raw);
    return Array.isArray(value) ? value.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

function toDraftDto(d: {
  id: string;
  lang: string;
  title: string;
  descriptionHtml: string;
  usp: string;
  source: string;
  status: string;
  scoreBefore: number | null;
  scoreAfter: number | null;
  createdAt: Date;
  appliedAt: Date | null;
}): CardDraftDto | null {
  const lang = asLang(d.lang);
  if (!lang) return null;
  return {
    id: d.id,
    lang,
    title: d.title,
    descriptionHtml: d.descriptionHtml,
    usp: parseUsp(d.usp),
    source: d.source === 'manual' ? 'manual' : 'ai_chat',
    status: d.status === 'applied' ? 'applied' : 'draft',
    scoreBefore: d.scoreBefore,
    scoreAfter: d.scoreAfter,
    createdAt: d.createdAt.toISOString(),
    appliedAt: d.appliedAt ? d.appliedAt.toISOString() : null,
  };
}

/** Seller API'dan kelgan (bazada saqlanmagan) nom */
const apiContent = (lang: CardLang, title: string): CardContentDto => ({
  lang,
  title,
  descriptionHtml: '',
  source: 'seller_api',
  updatedAt: null,
});

/**
 * Saqlangan matn. API tilidagi sarlavha bo'sh qolgan bo'lsa (sotuvchi faqat
 * tavsif joylagan) API nomi qo'yiladi — sayt jonli hisoblaganda ham server
 * hisoblagan ball chiqsin (`cardTexts` bilan bir xil qoida).
 */
function toContentDto(
  lang: CardLang,
  row: { title: string; descriptionHtml: string; source: string; updatedAt: Date },
  productTitle: string,
): CardContentDto {
  const fallback = lang === detectCardLang(productTitle) ? productTitle : '';
  return {
    lang,
    title: row.title.trim() ? row.title : fallback,
    descriptionHtml: row.descriptionHtml,
    source: row.source === 'draft' ? 'draft' : 'manual',
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** ru va uz matnlari; API tilida yozuv bo'lmasa — Seller API nomi (virtual) */
function contentDtos(p: Pick<CardProduct, 'title' | 'cardContents'>): CardContentDto[] {
  const apiLang = detectCardLang(p.title);
  const out: CardContentDto[] = [];
  for (const lang of CARD_LANGS) {
    const row = p.cardContents.find((c) => c.lang === lang);
    if (row) out.push(toContentDto(lang, row, p.title));
    else if (lang === apiLang && p.title.trim()) out.push(apiContent(lang, p.title));
  }
  return out;
}

/**
 * Qoralama holati ro'yxat uchun. Oxirgi qo'llashdan KEYIN yaratilgan
 * qo'llanmagan qoralama bo'lsa — ish davom etyapti ('draft'); undan eskilari
 * qo'llangan matn bilan almashgan, ular holatga ta'sir qilmaydi.
 */
function draftState(
  drafts: { status: string; createdAt: Date; appliedAt: Date | null }[],
): { draftStatus: CardListRow['draftStatus']; appliedAt: Date | null } {
  let appliedAt: Date | null = null;
  for (const d of drafts) {
    if (d.status === 'applied' && d.appliedAt && (!appliedAt || d.appliedAt > appliedAt)) appliedAt = d.appliedAt;
  }
  const pending = drafts.some((d) => d.status !== 'applied' && (!appliedAt || d.createdAt > appliedAt));
  return { draftStatus: pending ? 'draft' : appliedAt ? 'applied' : 'none', appliedAt };
}

interface ItemRow {
  orderId: string;
  qty: number;
  revenue: number;
  netProfit: number;
  status: string;
  returnedAt: Date | null;
  orderedAt: Date;
}

/**
 * [from, to) oynasidagi sotuv. `aggregateSales` (services/common.ts) bilan bir
 * xil qoida: qaytarilgan va bekor qilingan satr tushum, dona va foydaga
 * kirmaydi. Buyurtma — tirik satri bor buyurtma (bekor/qaytgani sanalmaydi).
 */
function sumItems(rows: ItemRow[], from: Date, to: Date) {
  let revenue = 0;
  let profit = 0;
  let units = 0;
  const orders = new Set<string>();
  for (const r of rows) {
    if (r.orderedAt < from || r.orderedAt >= to) continue;
    if (r.status === 'returned' || r.returnedAt || r.status === 'canceled') continue;
    revenue += r.revenue;
    profit += r.netProfit;
    units += r.qty;
    orders.add(r.orderId);
  }
  return { revenue: round(revenue), profit: round(profit), units, orders: orders.size };
}

const PROS_PREFIX = /^afzalliklari\s*:\s*/i;
const CONS_PREFIX = /^kamchiliklari\s*:\s*/i;

/**
 * Sharhlardan xulosa. Storefront importi (uzum/storefront.ts) xaridor
 * to'ldirgan "Afzalliklari:" / "Kamchiliklari:" qismlarini alohida qatorga
 * yozadi — shu qatorlar ajratib olinadi. Past baholi (≤3) sharhning izohi
 * ham kamchilik: AI tavsifda shu e'tirozga javob bera oladi.
 */
function reviewInsights(
  rows: { rating: number; text: string | null; publishedAt: Date }[],
  byRating: { rating: number; count: number }[],
  answered: number,
): CardReviewInsights {
  const distribution = [0, 0, 0, 0, 0];
  let count = 0;
  let sum = 0;
  for (const g of byRating) {
    const star = Math.min(5, Math.max(1, Math.round(g.rating)));
    distribution[star - 1] += g.count;
    count += g.count;
    sum += star * g.count;
  }

  const pros: string[] = [];
  const cons: string[] = [];
  const add = (list: string[], value: string) => {
    const text = clip(value, 200);
    if (!text || list.length >= MAX_INSIGHTS) return;
    const key = normalizeCardText(text);
    if (!list.some((x) => normalizeCardText(x) === key)) list.push(text);
  };

  for (const r of rows) {
    const body: string[] = [];
    for (const raw of (r.text ?? '').split(/\r?\n/)) {
      const line = raw.trim();
      if (!line) continue;
      if (PROS_PREFIX.test(line)) add(pros, line.replace(PROS_PREFIX, ''));
      else if (CONS_PREFIX.test(line)) add(cons, line.replace(CONS_PREFIX, ''));
      else body.push(line);
    }
    if (r.rating <= 3 && body.length > 0) add(cons, body.join(' '));
  }

  return {
    count,
    rating: count > 0 ? round(sum / count, 2) : 0,
    answered,
    distribution,
    pros,
    cons,
    recent: rows.slice(0, 20).map((r) => ({
      rating: r.rating,
      text: clip(r.text ?? '', 300),
      date: r.publishedAt.toISOString(),
    })),
  };
}

/** Bir vaqtda ikki oynadan saqlanganda unikal kalit to'qnashuvi — 500 emas, tushunarli 409 */
function isUniqueConflict(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: unknown }).code === 'P2002';
}

// ─────────────────────────── GET / — kartochkalar ro'yxati ───────────────────────────

type SortValue = number | string;

const CARD_SORT: Record<string, (r: CardListRow) => SortValue> = {
  opportunity: (r) => r.opportunity,
  score: (r) => r.score,
  revenue: (r) => r.revenue30,
  title: (r) => r.title,
};

/**
 * Ro'yxat qatorlari keshi. Ro'yxat har so'rovda kompaniyaning BARCHA
 * kartochkalarini qayta baholaydi (ball, sotuv, qoldiq) — 5000 ta mahsulotda
 * bu ~0,3–1,5 s sinxron CPU, sahifa, saralash yoki qidiruv almashganda ham.
 * Qatorlar shu sabab qisqa muddat saqlanadi. Kartochkani o'zgartiradigan har
 * bir amal (matn, kalit so'z, qoralama) kompaniya keshini tozalaydi; sinxron
 * keltirgan yangi sotuv va sharhlar ko'pi bilan LIST_CACHE_MS kechikadi.
 * API bitta jarayon (PM2 fork) — xotiradagi kesh yetarli.
 */
const LIST_CACHE_MS = 60_000;
const LIST_CACHE_MAX = 200;

interface ListRows {
  rows: CardListRow[];
  /** Qidiruv uchun: API nomi va sotuvchi joylagan nomlar (normallashtirilgan) */
  haystack: Map<string, string[]>;
}

const listCache = new Map<string, ListRows & { at: number }>();
/**
 * Kompaniya keshining avlodi: qatorlar yig'ilayotganda yozuv bo'lsa, eski
 * natija keshga tushmasin (aks holda o'zgarish bir daqiqa ko'rinmay turardi).
 */
const listGeneration = new Map<string, number>();

function dropListCache(companyId: string): void {
  listGeneration.set(companyId, (listGeneration.get(companyId) ?? 0) + 1);
  for (const key of listCache.keys()) if (key.startsWith(`${companyId}|`)) listCache.delete(key);
}

/** Butun kesh — testlar bazaga to'g'ridan-to'g'ri yozgandan keyin */
export function clearCardsListCache(): void {
  listCache.clear();
}

/**
 * Hammasi bir nechta yig'ma so'rovda: mahsulotlar (matn, kalit so'z, SKU
 * bilan), sharhlar guruhlab, qoralamalar, sotuv va qoldiq. Mahsulot boshiga
 * alohida so'rov yo'q — 2000 ta kartochkada ham sahifa tez ochilsin.
 */
async function buildListRows(companyId: string, storeIds: string[], storeId?: string): Promise<ListRows> {
  const { from, toExclusive } = salesWindow();
  const [products, reviewGroups, answeredGroups, drafts, sales, stocks] = await Promise.all([
    prisma.product.findMany({
      where: { storeId: { in: storeIds } },
      select: CARD_PRODUCT_SELECT,
      orderBy: { title: 'asc' },
    }),
    prisma.review.groupBy({
      by: ['productId'],
      where: { storeId: { in: storeIds }, productId: { not: null } },
      _count: { _all: true },
      _avg: { rating: true },
    }),
    prisma.review.groupBy({
      by: ['productId'],
      where: { storeId: { in: storeIds }, productId: { not: null }, answered: true },
      _count: { _all: true },
    }),
    prisma.cardDraft.findMany({
      where: { product: { storeId: { in: storeIds } } },
      select: { productId: true, status: true, createdAt: true, appliedAt: true },
    }),
    // Foyda — Mahsulotlar sahifasidagi kabi, mahsulot reklamasi ayirilgan holda
    aggregateSalesNet(companyId, storeIds, from, toExclusive, storeId),
    getLatestStocks(storeIds),
  ]);

  const answeredBy = new Map<string, number>();
  for (const g of answeredGroups) if (g.productId) answeredBy.set(g.productId, g._count._all);
  const reviewsBy = new Map<string, ReviewAgg>();
  for (const g of reviewGroups) {
    if (!g.productId) continue;
    reviewsBy.set(g.productId, {
      count: g._count._all,
      avg: g._avg.rating ?? 0,
      answered: answeredBy.get(g.productId) ?? 0,
    });
  }
  const draftsBy = new Map<string, { status: string; createdAt: Date; appliedAt: Date | null }[]>();
  for (const d of drafts) {
    const list = draftsBy.get(d.productId) ?? [];
    list.push(d);
    draftsBy.set(d.productId, list);
  }

  const rows: CardListRow[] = [];
  const haystack = new Map<string, string[]>();
  for (const p of products) {
    if (isArchivedProduct(p)) continue;

    const context = auditContextOf(p, reviewsBy.get(p.id));
    const audit = auditOf(p, context);
    const { titles, descriptions } = cardTexts(p);

    // Sotuv va qoldiq — barcha SKU'lar (arxivdagisi ham): sotuv haqiqiy pul
    let revenue = 0;
    let profit = 0;
    let units = 0;
    let stock = 0;
    for (const s of p.skus) {
      const agg = sales.get(s.id);
      if (agg) {
        revenue += agg.revenue;
        profit += agg.netProfit;
        units += agg.units;
      }
      stock += stocks.get(s.id)?.total ?? 0;
    }

    /*
     * Ustuvorlik — "matnni tuzatsa qancha pul o'zgarishi mumkin" taxmini:
     * ko'p sotilayotgan, lekin bali past kartochka birinchi. Omborda yo'q
     * tovarni tuzatish hozir sotuv bermaydi — vazni kamayadi, lekin nolga
     * tushmaydi (qoldiq kelishi bilan matn tayyor tursin).
     */
    const revenue30 = round(revenue);
    const opportunity = Math.round(
      ((revenue30 * (100 - audit.score)) / 100) * (stock > 0 ? 1 : OUT_OF_STOCK_FACTOR),
    );
    const state = draftState(draftsBy.get(p.id) ?? []);

    rows.push({
      productId: p.id,
      title: p.title,
      imageUrl: p.imageUrl ?? p.skus.find((s) => s.imageUrl)?.imageUrl ?? null,
      category: p.category,
      storeTitle: p.store.title,
      uzumUrl: p.uzumProductId ? uzumProductUrl(p.uzumProductId) : null,
      score: audit.score,
      sections: sectionPercents(audit),
      revenue30,
      profit30: round(profit),
      units30: units,
      stock,
      opportunity,
      titleLangs: presentLangs(titles),
      descriptionLangs: presentLangs(descriptions),
      keywordsCount: p.cardKeywords.filter((k) => k.status === 'active').length,
      draftStatus: state.draftStatus,
      appliedAt: state.appliedAt ? state.appliedAt.toISOString() : null,
    });
    haystack.set(p.id, [p.title, ...p.cardContents.map((c) => c.title)].map(normalizeCardText));
  }
  return { rows, haystack };
}

router.get(
  '/',
  ah(async (req, res) => {
    const { company, plan } = companyCtx(req);
    const range = resolveRange(req, plan);
    const storeIds = await getStoreIds(company.id, range.storeId);

    const key = `${company.id}|${range.storeId ?? ''}|${storeIds.join(',')}`;
    const cached = listCache.get(key);
    let list: ListRows;
    if (cached && Date.now() - cached.at <= LIST_CACHE_MS) {
      list = cached;
    } else {
      const generation = listGeneration.get(company.id) ?? 0;
      list = await buildListRows(company.id, storeIds, range.storeId);
      if ((listGeneration.get(company.id) ?? 0) === generation) {
        listCache.delete(key);
        listCache.set(key, { ...list, at: Date.now() });
        // Eng eski yozuv chiqadi (Map qo'shilish tartibini saqlaydi)
        if (listCache.size > LIST_CACHE_MAX) {
          const oldest = listCache.keys().next().value;
          if (oldest !== undefined) listCache.delete(oldest);
        }
      }
    }

    /*
     * Qidiruv JS'da: Postgres'da Prisma `contains` katta-kichik harfni
     * farqlaydi (SQLite'da yo'q) — prod va dev bir xil natija bersin.
     * Sotuvchi joylagan ikkinchi til nomi ham qidiriladi.
     */
    let rows = list.rows;
    if (range.search) {
      const needle = normalizeCardText(range.search);
      const haystack = list.haystack;
      rows = rows.filter((r) => (haystack.get(r.productId) ?? []).some((t) => t.includes(needle)));
    }

    // Keshdagi massiv o'zgarmasin — saralash nusxada
    const sorter = CARD_SORT[range.sort ?? 'opportunity'] ?? CARD_SORT.opportunity;
    const dir = range.order === 'asc' ? 1 : -1;
    rows = [...rows].sort((a, b) => {
      const va = sorter(a);
      const vb = sorter(b);
      const primary =
        typeof va === 'string' || typeof vb === 'string'
          ? String(va).localeCompare(String(vb)) * dir
          : (va - vb) * dir;
      // Teng bo'lsa (masalan sotuvsiz kartochkalar) — bali pastrog'i oldinda, keyin nomi
      return primary || a.score - b.score || a.title.localeCompare(b.title);
    });

    const scoreSum = rows.reduce((s, r) => s + r.score, 0);
    const payload: CardListResponse = {
      ...paginate(rows, range.page, range.pageSize),
      totals: {
        cards: rows.length,
        avgScore: rows.length > 0 ? Math.round(scoreSum / rows.length) : 0,
        lowScore: rows.filter((r) => r.score < LOW_SCORE).length,
        withDescription: rows.filter((r) => r.descriptionLangs.length > 0).length,
        applied: rows.filter((r) => r.appliedAt !== null).length,
      },
    };

    res.json(payload);
  }),
);

// ─────────────────────────── GET /:productId — kartochka tafsiloti ───────────────────────────

router.get(
  '/:productId',
  ah(async (req, res) => {
    const { company } = companyCtx(req);
    const p = await loadCardProduct(company.id, String(req.params.productId));
    const skuIds = p.skus.map((s) => s.id);
    const now = new Date();
    const { from, toExclusive } = salesWindow();

    const [reviewRows, ratingGroups, answered, drafts, lastApplied, stocks] = await Promise.all([
      prisma.review.findMany({
        where: { productId: p.id },
        select: { rating: true, text: true, publishedAt: true },
        orderBy: { publishedAt: 'desc' },
        take: REVIEW_SCAN,
      }),
      // Taqsimot va o'rtacha — barcha sharhlar bo'yicha (o'qilgan 500 tasi emas)
      prisma.review.groupBy({
        by: ['rating'],
        where: { productId: p.id },
        _count: { _all: true },
      }),
      prisma.review.count({ where: { productId: p.id, answered: true } }),
      prisma.cardDraft.findMany({
        where: { productId: p.id },
        orderBy: { createdAt: 'desc' },
        take: MAX_DRAFTS,
      }),
      prisma.cardDraft.findFirst({
        where: { productId: p.id, status: 'applied', appliedAt: { not: null } },
        orderBy: { appliedAt: 'desc' },
        select: { appliedAt: true },
      }),
      getLatestStocks([p.storeId]),
    ]);

    /*
     * Ta'sir: oxirgi qo'llangan qoralamadan oldingi va keyingi TENG kunlar
     * (ko'pi bilan 14). Teng oyna — "oldin 14 kun, keyin 3 kun" kabi noto'g'ri
     * solishtirish bo'lmasin. Qo'llanganiga bir kun to'lmagan bo'lsa days = 0.
     */
    const appliedAt = lastApplied?.appliedAt ?? null;
    const impactDays = appliedAt
      ? Math.max(0, Math.min(IMPACT_MAX_DAYS, Math.floor((now.getTime() - appliedAt.getTime()) / DAY_MS)))
      : 0;
    const beforeFrom = appliedAt ? new Date(appliedAt.getTime() - impactDays * DAY_MS) : from;
    const afterTo = appliedAt ? new Date(appliedAt.getTime() + impactDays * DAY_MS) : toExclusive;

    /*
     * 30 kunlik sotuv va ta'sir oynalari bitta so'rovda — faqat shu mahsulot
     * SKU'lari va faqat shu oynalar. Ilgari bitta keng oraliq olinardi:
     * 300 kun oldin qo'llangan qoralamada butun 300 kunlik buyurtmalar o'qilardi.
     */
    const windows: Prisma.OrderItemWhereInput[] = [{ orderedAt: { gte: from, lt: toExclusive } }];
    if (appliedAt) windows.push({ orderedAt: { gte: beforeFrom, lt: afterTo } });
    const items: (ItemRow & { skuId: string | null })[] = skuIds.length
      ? await prisma.orderItem.findMany({
          where: { skuId: { in: skuIds }, OR: windows },
          select: {
            skuId: true,
            orderId: true,
            qty: true,
            revenue: true,
            netProfit: true,
            status: true,
            returnedAt: true,
            orderedAt: true,
          },
        })
      : [];

    const sales30 = sumItems(items, from, toExclusive);
    const stock = p.skus.reduce((s, sku) => s + (stocks.get(sku.id)?.total ?? 0), 0);

    /*
     * Foyda — ro'yxat va Mahsulotlar sahifasidagi kabi, mahsulot reklamasi
     * ayirilgan. Reklama SKU'larga shu oynadagi tushum ulushi bo'yicha bo'linadi.
     */
    const revenueBySku = new Map<string, number>();
    for (const it of items) {
      if (it.orderedAt < from || it.orderedAt >= toExclusive) continue;
      if (it.status === 'returned' || it.returnedAt || it.status === 'canceled') continue;
      if (it.skuId) revenueBySku.set(it.skuId, (revenueBySku.get(it.skuId) ?? 0) + it.revenue);
    }
    const adFees = await getAdFeesBySku(company.id, [p.storeId], from, toExclusive, revenueBySku);
    const adFee = skuIds.reduce((s, id) => s + (adFees.get(id) ?? 0), 0);

    let impact: CardImpact | null = null;
    if (appliedAt) {
      const before = sumItems(items, beforeFrom, appliedAt);
      const after = sumItems(items, appliedAt, afterTo);
      impact = {
        appliedAt: appliedAt.toISOString(),
        days: impactDays,
        before: { revenue: before.revenue, units: before.units, orders: before.orders },
        after: { revenue: after.revenue, units: after.units, orders: after.orders },
      };
    }

    const byRating = ratingGroups.map((g) => ({ rating: g.rating, count: g._count._all }));
    const reviews = reviewInsights(reviewRows, byRating, answered);
    // Ball konteksti ro'yxatdagi kabi xom o'rtachadan (ro'yxat `_avg.rating` ni oladi) — ikki joyda bir xil ball
    const rawCount = byRating.reduce((s, g) => s + g.count, 0);
    const rawAvg = rawCount > 0 ? byRating.reduce((s, g) => s + g.rating * g.count, 0) / rawCount : 0;
    const auditContext = auditContextOf(
      p,
      rawCount > 0 ? { count: rawCount, avg: rawAvg, answered } : undefined,
    );
    const health = auditContext.health;

    const payload: CardDetailResponse = {
      product: {
        id: p.id,
        title: p.title,
        imageUrl: p.imageUrl ?? p.skus.find((s) => s.imageUrl)?.imageUrl ?? null,
        category: p.category,
        brand: p.brand,
        storeTitle: p.store.title,
        uzumProductId: p.uzumProductId,
        uzumUrl: p.uzumProductId ? uzumProductUrl(p.uzumProductId) : null,
        blocked: health?.blocked ?? false,
        returnedPct: health?.returnedPct ?? 0,
        skuTitles: skuTitlesOf(p),
      },
      contents: contentDtos(p),
      keywords: p.cardKeywords.map(toKeywordDto),
      drafts: drafts.map(toDraftDto).filter((d): d is CardDraftDto => d !== null),
      reviews,
      sales: { revenue30: sales30.revenue, profit30: round(sales30.profit - adFee), units30: sales30.units, stock },
      auditContext,
      audit: auditOf(p, auditContext),
      impact,
    };

    res.json(payload);
  }),
);

// ─────────────────────────── PUT /:productId/content/:lang — matnni saqlash ───────────────────────────

const contentSchema = z.object({
  title: z.string().max(255, 'Sarlavha 255 belgidan oshmasin').default(''),
  descriptionHtml: z.string().max(20_000, 'Tavsif 20 000 belgidan oshmasin').default(''),
});

router.put(
  '/:productId/content/:lang',
  canWrite,
  ah(async (req, res) => {
    const { company } = companyCtx(req);
    const lang = langParam(req.params.lang);
    const input = contentSchema.parse(req.body ?? {});
    const product = await ownProduct(company.id, String(req.params.productId));

    const title = storedTitle(lang, cleanTitle(input.title), product.title);
    const descriptionHtml = cleanDescription(input.descriptionHtml);

    if (!title && !descriptionHtml) {
      /*
       * Ikkalasi bo'sh — sotuvchi matnni olib tashladi. Yozuv o'chadi va
       * kartochka yana Seller API nomiga qaytadi (API tilida), aks holda bo'sh.
       */
      await prisma.cardContent.deleteMany({ where: { productId: product.id, lang } });
      dropListCache(company.id);
      const apiLang = detectCardLang(product.title);
      const fallback: CardContentDto =
        lang === apiLang && product.title.trim()
          ? apiContent(lang, product.title)
          : { lang, title: '', descriptionHtml: '', source: 'manual', updatedAt: null };
      res.json(fallback);
      return;
    }

    const row = await prisma.cardContent.upsert({
      where: { productId_lang: { productId: product.id, lang } },
      create: { productId: product.id, lang, title, descriptionHtml, source: 'manual' },
      update: { title, descriptionHtml, source: 'manual' },
      select: { title: true, descriptionHtml: true, source: true, updatedAt: true },
    });
    dropListCache(company.id);
    res.json(toContentDto(lang, row, product.title) satisfies CardContentDto);
  }),
);

// ─────────────────────────── Kalit so'zlar ───────────────────────────

const keywordText = z
  .string()
  .max(200, 'Kalit so‘z juda uzun')
  .transform(normalizeCardText)
  .refine((t) => t.length >= 2 && t.length <= CARD_LIMITS.keywordMaxChars, {
    message: `Kalit so‘z 2–${CARD_LIMITS.keywordMaxChars} belgi bo‘lishi kerak`,
  });

/** Talab (ko'rishlar) — faqat sotuvchi import qilgan son; 0 — noma'lum */
const demandValue = z.number().min(0).max(2_000_000_000).nullable().optional();

const keywordsAddSchema = z.object({
  items: z
    .array(z.object({ text: keywordText, demand: demandValue }))
    .min(1, 'Kamida bitta kalit so‘z yuboring')
    .max(200, 'Bir martada ko‘pi bilan 200 ta kalit so‘z'),
  source: z.enum(['seller', 'auto', 'import']).default('seller'),
});

const keywordPatchSchema = z
  .object({
    status: z.enum(['active', 'excluded']).optional(),
    demand: demandValue,
  })
  .refine((v) => v.status !== undefined || v.demand !== undefined, {
    message: 'O‘zgartirish uchun status yoki demand yuboring',
  });

const positiveDemand = (value: number | null | undefined): number | null =>
  value !== null && value !== undefined && value > 0 ? Math.round(value) : null;


router.post(
  '/:productId/keywords',
  canWrite,
  ah(async (req, res) => {
    const { company } = companyCtx(req);
    const input = keywordsAddSchema.parse(req.body ?? {});
    const product = await ownProduct(company.id, String(req.params.productId));

    // Bir so'rovdagi takrorlar bitta bo'ladi (normallashtirilgan matn bo'yicha, oxirgisi ustun)
    const incoming = new Map<string, number | null>();
    for (const it of input.items) incoming.set(it.text, positiveDemand(it.demand));

    const existing = await prisma.cardKeyword.findMany({
      where: { productId: product.id },
      select: { id: true, text: true, demand: true, status: true },
    });
    const byText = new Map(existing.map((k) => [k.text, k]));
    const fresh = [...incoming].filter(([text]) => !byText.has(text));

    // Chiqarilganlar ham sanaladi: ular qayta taklif qilinmasligi uchun saqlanadi
    if (existing.length + fresh.length > CARD_LIMITS.keywordsMax) {
      throw AppError.badRequest(
        `Bitta kartochkada ko‘pi bilan ${CARD_LIMITS.keywordsMax} ta kalit so‘z bo‘ladi (hozir ${existing.length} ta, ` +
          `yangi ${fresh.length} ta). Keraksizlarini o‘chiring.`,
      );
    }

    const ops: Prisma.PrismaPromise<unknown>[] = [];
    for (const [text, demand] of incoming) {
      const cur = byText.get(text);
      if (!cur) continue;
      const data: Prisma.CardKeywordUpdateInput = {};
      // Son yo'q qator mavjud talabni o'chirmaydi — faqat yangi ma'lum son yoziladi
      if (demand !== null && demand !== cur.demand) data.demand = demand;
      /*
       * Sotuvchi so'zni o'zi qayta qo'shsa (yoki taklifni tanlasa) — u yana
       * faol. Jadval importi esa ATAYLAB chiqarilganlarni qaytarmaydi: qayta
       * import qilinganda sotuvchi rad etgan so'zlar yana ballga kirib qolardi.
       */
      if (input.source !== 'import' && cur.status !== 'active') data.status = 'active';
      if (Object.keys(data).length > 0) ops.push(prisma.cardKeyword.update({ where: { id: cur.id }, data }));
    }
    if (fresh.length > 0) {
      ops.push(
        prisma.cardKeyword.createMany({
          data: fresh.map(([text, demand]) => ({
            productId: product.id,
            text,
            demand,
            source: input.source,
            status: 'active',
          })),
        }),
      );
    }

    if (ops.length > 0) {
      try {
        await prisma.$transaction(ops);
      } catch (err) {
        if (isUniqueConflict(err)) {
          throw AppError.conflict('Kalit so‘zlar boshqa oynada o‘zgardi — sahifani yangilab, qayta urinib ko‘ring');
        }
        throw err;
      }
    }

    dropListCache(company.id);
    const all = await prisma.cardKeyword.findMany({ where: { productId: product.id }, orderBy: KEYWORD_ORDER });
    res.json({ items: all.map(toKeywordDto) });
  }),
);

/**
 * Bepul takliflar (kodda): kategoriya, sarlavhadagi so'z va birikmalar, variant
 * nomlari va sharhlarda ko'p uchraydigan so'zlar. Talab raqami BERILMAYDI —
 * Uzum'da ochiq chastota manbasi yo'q, biz uni o'ylab topmaymiz. Mavjud
 * (chiqarilganlari ham) so'zlar qaytmaydi. Saqlanmaydi — tanlovni sotuvchi qiladi.
 */
router.post(
  '/:productId/keywords/suggest',
  ah(async (req, res) => {
    const { company } = companyCtx(req);
    const p = await loadCardProduct(company.id, String(req.params.productId));
    const reviews = await prisma.review.findMany({
      where: { productId: p.id, text: { not: null } },
      select: { text: true },
      orderBy: { publishedAt: 'desc' },
      take: REVIEW_SCAN,
    });

    const { titles } = cardTexts(p);
    const have = new Set(p.cardKeywords.map((k) => k.text));
    const items = suggestCardKeywords(
      {
        titles,
        category: p.category,
        extra: skuTitlesOf(p),
        reviewTexts: reviews.map((r) => r.text ?? '').filter(Boolean),
      },
      60,
    )
      .filter((t) => !have.has(t))
      .slice(0, 30);

    res.json({ items });
  }),
);

router.patch(
  '/:productId/keywords/:id',
  canWrite,
  ah(async (req, res) => {
    const { company } = companyCtx(req);
    const input = keywordPatchSchema.parse(req.body ?? {});
    const product = await ownProduct(company.id, String(req.params.productId));

    const keyword = await prisma.cardKeyword.findFirst({
      where: { id: String(req.params.id), productId: product.id },
      select: { id: true },
    });
    if (!keyword) throw AppError.notFound('Kalit so‘z topilmadi');

    const updated = await prisma.cardKeyword.update({
      where: { id: keyword.id },
      data: {
        ...(input.status !== undefined ? { status: input.status } : {}),
        // null — talabni tozalash (sotuvchi noto'g'ri son kiritgan bo'lsa)
        ...(input.demand !== undefined ? { demand: positiveDemand(input.demand) } : {}),
      },
    });
    dropListCache(company.id);
    res.json(toKeywordDto(updated) satisfies CardKeywordDto);
  }),
);

router.delete(
  '/:productId/keywords/:id',
  canWrite,
  ah(async (req, res) => {
    const { company } = companyCtx(req);
    const product = await ownProduct(company.id, String(req.params.productId));
    const { count } = await prisma.cardKeyword.deleteMany({
      where: { id: String(req.params.id), productId: product.id },
    });
    if (count === 0) throw AppError.notFound('Kalit so‘z topilmadi');
    dropListCache(company.id);
    res.json({ ok: true });
  }),
);

// ─────────────────────────── Qoralamalar ───────────────────────────

const scoreValue = z.number().int().min(0).max(100).nullable().optional();

const draftSchema = z.object({
  lang: z.enum(['ru', 'uz']),
  title: z.string().max(255, 'Sarlavha 255 belgidan oshmasin').default(''),
  descriptionHtml: z.string().max(20_000, 'Tavsif 20 000 belgidan oshmasin').default(''),
  usp: z.array(z.string().max(300)).max(20).default([]),
  source: z.enum(['ai_chat', 'manual']).default('ai_chat'),
  scoreBefore: scoreValue,
  scoreAfter: scoreValue,
});

/**
 * Mahsulotda ko'pi bilan MAX_DRAFTS qoralama qoladi — eskilari o'chadi.
 * Oxirgi QO'LLANGAN qoralama esa saqlanadi: ta'sir (oldin/keyin sotuv) shu
 * sanadan o'lchanadi, u o'chsa sotuvchi natijani ko'rmay qolardi.
 */
async function pruneDrafts(productId: string): Promise<void> {
  const extra = await prisma.cardDraft.findMany({
    where: { productId },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    skip: MAX_DRAFTS,
    select: { id: true },
  });
  if (extra.length === 0) return;
  const keep = await prisma.cardDraft.findFirst({
    where: { productId, status: 'applied', appliedAt: { not: null } },
    orderBy: { appliedAt: 'desc' },
    select: { id: true },
  });
  const ids = extra.map((d) => d.id).filter((id) => id !== keep?.id);
  if (ids.length > 0) await prisma.cardDraft.deleteMany({ where: { id: { in: ids } } });
}

router.post(
  '/:productId/drafts',
  canWrite,
  ah(async (req, res) => {
    const { company, user } = companyCtx(req);
    const input = draftSchema.parse(req.body ?? {});
    const product = await ownProduct(company.id, String(req.params.productId));

    // Chatbot javobi ham tozalanadi: sayt `parseCardAnswer` dan o'tkazgan bo'lsa ham API ishonmaydi
    const title = cleanTitle(input.title);
    const descriptionHtml = cleanDescription(input.descriptionHtml);
    const usp = input.usp.map(cleanTitle).filter(Boolean).slice(0, 10);
    if (!title && !descriptionHtml) throw AppError.badRequest('Qoralama bo‘sh: sarlavha yoki tavsif kerak');

    const draft = await prisma.cardDraft.create({
      data: {
        productId: product.id,
        lang: input.lang,
        title,
        descriptionHtml,
        usp: JSON.stringify(usp),
        source: input.source,
        status: 'draft',
        scoreBefore: input.scoreBefore ?? null,
        scoreAfter: input.scoreAfter ?? null,
        createdById: user.id,
      },
    });
    await pruneDrafts(product.id);
    dropListCache(company.id);

    const dto = toDraftDto(draft);
    if (!dto) throw AppError.internal('Qoralama saqlanmadi');
    res.json(dto);
  }),
);

/**
 * "Uzum kabinetiga qo'ydim". Uzum'ga biz yozmaymiz (Seller API kartochka
 * matnini o'zgartirishga ruxsat bermaydi) — sotuvchi matnni o'zi qo'yadi.
 * Shu belgidan keyin kartochka matni qoralamadagi matn bo'ladi va ta'sir
 * (oldin/keyin sotuv) shu paytdan hisoblanadi.
 */
router.post(
  '/:productId/drafts/:id/apply',
  canWrite,
  ah(async (req, res) => {
    const { company } = companyCtx(req);
    const product = await ownProduct(company.id, String(req.params.productId));

    const draft = await prisma.cardDraft.findFirst({
      where: { id: String(req.params.id), productId: product.id },
      select: { id: true, lang: true, title: true, descriptionHtml: true },
    });
    if (!draft) throw AppError.notFound('Qoralama topilmadi');
    const lang = asLang(draft.lang);
    if (!lang) throw AppError.badRequest('Qoralama tili noto‘g‘ri');

    // Qoralamada bo'sh qolgan maydon joriy matnni o'chirib yubormasin (masalan faqat tavsif yozilgan)
    const title = draft.title.trim() ? storedTitle(lang, draft.title, product.title) : undefined;
    const descriptionHtml = draft.descriptionHtml.trim() ? draft.descriptionHtml : undefined;

    await prisma.$transaction([
      prisma.cardDraft.update({
        where: { id: draft.id },
        data: { status: 'applied', appliedAt: new Date() },
      }),
      prisma.cardContent.upsert({
        where: { productId_lang: { productId: product.id, lang } },
        create: {
          productId: product.id,
          lang,
          title: title ?? '',
          descriptionHtml: descriptionHtml ?? '',
          source: 'draft',
        },
        update: {
          ...(title !== undefined ? { title } : {}),
          ...(descriptionHtml !== undefined ? { descriptionHtml } : {}),
          source: 'draft',
        },
      }),
    ]);
    dropListCache(company.id);

    res.json({ ok: true });
  }),
);

router.delete(
  '/:productId/drafts/:id',
  canWrite,
  ah(async (req, res) => {
    const { company } = companyCtx(req);
    const product = await ownProduct(company.id, String(req.params.productId));
    const { count } = await prisma.cardDraft.deleteMany({
      where: { id: String(req.params.id), productId: product.id },
    });
    if (count === 0) throw AppError.notFound('Qoralama topilmadi');
    dropListCache(company.id);
    res.json({ ok: true });
  }),
);

export default router;
