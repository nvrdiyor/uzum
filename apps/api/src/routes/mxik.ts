/**
 * MXIK kodlari — /api/v1/mxik
 *
 *   GET   /              → do'kondagi SKU'lar va ularning MXIK holati
 *   GET   /search?q=     → soliq qo'mitasi registridan qidirish (proksi)
 *   PATCH /:skuId        → SKU ga kod biriktirish yoki olib tashlash
 *
 * MXIK (Mahsulot va Xizmatlar Identifikatsiya Kodi) O'zbekistonda har bir
 * tovar uchun MAJBURIY: kod noto'g'ri bo'lsa soliq idorasi tovarni sotishga
 * yo'l qo'ymaydi va sotuv to'xtaydi.
 *
 * IKKI MANBA:
 *   1. Uzum katalogi `ikpu` maydonini qaytaradi — importer uni saqlaydi.
 *   2. Bo'sh bo'lsa sotuvchi registrdan qidirib, o'zi tanlaydi.
 *
 * KODNI HECH QACHON AVTOMATIK BIRIKTIRMAYMIZ. Registr matn bo'yicha
 * qidiradi va o'xshash, lekin noto'g'ri kodlarni qaytarishi tabiiy —
 * noto'g'ri kod esa sotuvchining sotuvini to'xtatadi. Shuning uchun sahifa
 * faqat taklif ko'rsatadi, tanlovni sotuvchi qiladi.
 */
import { Router } from 'express';
import { prisma } from '@savdoiq/db';
import { AppError, ah } from '../lib/errors.js';
import { companyCtx, requireAuth, requireCompany } from '../lib/auth.js';
import { getStoreIds } from '../services/common.js';

const router = Router();
router.use(requireAuth, requireCompany);

/** Soliq qo'mitasining ochiq registri — kalit talab qilinmaydi */
const REGISTRY = 'https://tasnif.soliq.uz/api/cls-api';
/** Tashqi xizmat javob bermasa butun sahifa qotib qolmasin */
const REGISTRY_TIMEOUT_MS = 8_000;
/** Kesh muddati — registr kamdan-kam o'zgaradi */
const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

interface MxikHit {
  code: string;
  name: string;
  fullName: string;
  groupName: string;
  className: string;
  unitsName: string;
}

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : v == null ? '' : String(v));

/**
 * Registr javobini bizning shaklga keltiradi.
 *
 * `fullName` registrda o'zbek kirill, rus va lotin nomlarini bitta qatorga
 * qo'shib yuboradi (masalan "ҚУЛОҚЧИН НАУШНИКИ QULOQCHIN 0851…"), shuning
 * uchun undan kodning o'zini olib tashlaymiz — ekranda takrorlanmasin.
 */
function toHit(raw: Record<string, unknown>): MxikHit | null {
  const code = str(raw.mxikCode);
  if (!code) return null;
  const full = str(raw.fullName).replace(code, '').replace(/\s+/g, ' ').trim();
  return {
    code,
    name: str(raw.name) || full || code,
    fullName: full,
    groupName: str(raw.groupName),
    className: str(raw.className),
    unitsName: str(raw.unitsName),
  };
}

/** Registrdan qidirish. Xato bo'lsa bo'sh ro'yxat — sahifa ishlayveradi. */
async function searchRegistry(query: string): Promise<MxikHit[]> {
  const url = `${REGISTRY}/elasticsearch/search?search=${encodeURIComponent(query)}&size=20&page=0&lang=uz_latn`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), REGISTRY_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { accept: 'application/json' } });
    if (!res.ok) return [];
    const body = (await res.json()) as { data?: unknown };
    const list = Array.isArray(body.data) ? body.data : [];
    return list
      .map((r) => toHit(r as Record<string, unknown>))
      .filter((r): r is MxikHit => r !== null);
  } catch {
    // Tashqi xizmat yiqilsa ham sahifa ochilishi kerak
    return [];
  } finally {
    clearTimeout(timer);
  }
}

/** Topilgan kodlarni keshga yozadi — takroriy qidiruv tashqariga chiqmaydi */
async function cacheHits(hits: MxikHit[]): Promise<void> {
  for (const h of hits) {
    await prisma.mxikCache
      .upsert({
        where: { code: h.code },
        create: {
          code: h.code,
          name: h.name,
          fullName: h.fullName,
          groupName: h.groupName,
          className: h.className,
          unitsName: h.unitsName,
        },
        update: { name: h.name, fullName: h.fullName, unitsName: h.unitsName, fetchedAt: new Date() },
      })
      .catch(() => undefined);
  }
}

// ─────────────────────────── GET / ───────────────────────────

router.get(
  '/',
  ah(async (req, res) => {
    const { company } = companyCtx(req);
    const storeIds = await getStoreIds(company.id, req.query.storeId as string | undefined);

    const rows = await prisma.sku.findMany({
      where: { storeId: { in: storeIds }, archived: false },
      select: {
        id: true,
        sku: true,
        title: true,
        imageUrl: true,
        barcode: true,
        ikpu: true,
        price: true,
        product: { select: { title: true, category: true } },
      },
      orderBy: { title: 'asc' },
      take: 2000,
    });

    // Kodi yo'q SKU'lar ro'yxat boshida — ish aynan ular bilan boshlanadi
    const items = rows
      .map((r) => ({
        skuId: r.id,
        sku: r.sku,
        title: r.title,
        productTitle: r.product?.title ?? '',
        category: r.product?.category ?? '',
        imageUrl: r.imageUrl ?? '',
        barcode: r.barcode ?? '',
        price: r.price,
        ikpu: r.ikpu ?? '',
      }))
      .sort((a, b) => (a.ikpu ? 1 : 0) - (b.ikpu ? 1 : 0));

    // Keshdan nomlarni qo'shamiz — kod yonida nima turgani ko'rinsin
    const codes = [...new Set(items.map((i) => i.ikpu).filter(Boolean))];
    const cached = codes.length
      ? await prisma.mxikCache.findMany({ where: { code: { in: codes } } })
      : [];
    const names = new Map(cached.map((c) => [c.code, c.name]));

    res.json({
      items: items.map((i) => ({ ...i, ikpuName: names.get(i.ikpu) ?? '' })),
      total: items.length,
      missing: items.filter((i) => !i.ikpu).length,
    });
  }),
);

// ─────────────────────────── GET /search ───────────────────────────

router.get(
  '/search',
  ah(async (req, res) => {
    const q = str(req.query.q);
    if (q.length < 2) {
      res.json({ items: [], query: q });
      return;
    }

    /*
     * Avval kesh: registr javob bermasa ham ilgari topilgan kodlar
     * ishlayveradi. Qidiruv bo'yicha kesh to'liq emas, shuning uchun
     * registr javob bersa — u ustun.
     */
    const live = await searchRegistry(q);
    if (live.length > 0) {
      void cacheHits(live);
      res.json({ items: live, query: q, source: 'registry' });
      return;
    }

    const fresh = new Date(Date.now() - CACHE_TTL_MS);
    const local = await prisma.mxikCache.findMany({
      where: {
        fetchedAt: { gte: fresh },
        OR: [{ name: { contains: q } }, { fullName: { contains: q } }, { code: { contains: q } }],
      },
      take: 20,
    });

    res.json({
      items: local.map((c) => ({
        code: c.code,
        name: c.name,
        fullName: c.fullName,
        groupName: c.groupName,
        className: c.className,
        unitsName: c.unitsName,
      })),
      query: q,
      source: 'cache',
    });
  }),
);

// ─────────────────────────── PATCH /:skuId ───────────────────────────

router.patch(
  '/:skuId',
  ah(async (req, res) => {
    const { company } = companyCtx(req);
    const storeIds = await getStoreIds(company.id);
    const skuId = String(req.params.skuId);

    const sku = await prisma.sku.findFirst({
      where: { id: skuId, storeId: { in: storeIds } },
      select: { id: true },
    });
    if (!sku) throw new AppError(404, 'not_found', 'SKU topilmadi');

    const raw = str((req.body as { ikpu?: unknown })?.ikpu);
    // Bo'sh qiymat — kodni olib tashlash
    if (raw && !/^\d{6,20}$/.test(raw)) {
      throw new AppError(400, 'bad_request', 'MXIK faqat raqamlardan iborat bo‘lishi kerak');
    }

    await prisma.sku.update({ where: { id: skuId }, data: { ikpu: raw || null } });
    res.json({ ok: true, skuId, ikpu: raw });
  }),
);

export default router;
