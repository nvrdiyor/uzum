/**
 * Uzum kabinetlari moduli — /api/v1/uzum
 *
 *  GET    /            → ulangan kabinetlar (UzumAccountSummary[]; kalit KO'RSATILMAYDI)
 *  POST   /            → yangi kabinet ulash: kalitni tekshirish, shifrlash, sinxronizatsiya
 *  POST   /:id/test    → kalitni qayta tekshirish
 *  POST   /:id/resync  → to'liq qayta sinxronizatsiya
 *  DELETE /:id         → kabinetni va unga bog'liq do'konlarni o'chirish
 *  GET    /stores      → kompaniyaning do'konlari
 *
 * XAVFSIZLIK: API kalit AES-256-GCM bilan shifrlanadi (`encryptSecret`) va javoblarda
 * hech qachon qaytarilmaydi — faqat `keyHint` (oxirgi 4 belgi) ko'rsatiladi.
 */
import { Router } from 'express';
import { prisma } from '@savdoiq/db';
import type { UzumAccount } from '@savdoiq/db';
import { getPlan, uzumAccountSchema, type StoreSummary, type UzumAccountSummary } from '@savdoiq/shared';
import { AppError, ah } from '../lib/errors.js';
import { companyCtx, requireAuth, requireCompany, requireRole } from '../lib/auth.js';
import { decryptSecret, encryptSecret, maskKey, randomToken } from '../lib/crypto.js';
import { createUzumClient } from '../uzum/client.js';
import { enqueueSync } from '../services/sync.js';
import { env } from '../env.js';

const router = Router();
router.use(requireAuth, requireCompany);

// ─────────────────────────── Yordamchilar ───────────────────────────

const ACCOUNT_STATUSES: UzumAccountSummary['status'][] = ['pending', 'active', 'invalid', 'disabled'];

const INVALID_KEY_MESSAGE =
  'Kalit qabul qilinmadi — seller.uzum.uz dagi API kalitni tekshirib, to‘liq nusxalang';

/** Demo rejim (haqiqiy kalitsiz sinash) ochiqmi */
const demoAllowed = (): boolean => env.uzum.mode === 'demo' || !env.isProd;

function asAccountStatus(value: string | null | undefined): UzumAccountSummary['status'] {
  return ACCOUNT_STATUSES.includes(value as UzumAccountSummary['status'])
    ? (value as UzumAccountSummary['status'])
    : 'pending';
}

/** Prisma yozuvi → API javobi (kalit hech qachon qaytarilmaydi) */
function toAccountSummary(a: UzumAccount, storesCount: number): UzumAccountSummary {
  return {
    id: a.id,
    label: a.label,
    keyHint: a.keyHint,
    status: asAccountStatus(a.status),
    lastSyncAt: a.lastSyncAt?.toISOString() ?? null,
    nextSyncAt: a.nextSyncAt?.toISOString() ?? null,
    lastError: a.lastError,
    storesCount,
    createdAt: a.createdAt.toISOString(),
  };
}

/** Kabinetni kompaniya doirasida topadi */
async function findAccount(companyId: string, id: string): Promise<UzumAccount> {
  const account = await prisma.uzumAccount.findFirst({ where: { id, companyId } });
  if (!account) throw AppError.notFound('Uzum kabineti topilmadi');
  return account;
}

/** Kabinetga bog'langan do'konlar soni */
function countStores(accountId: string): Promise<number> {
  return prisma.store.count({ where: { uzumAccountId: accountId } });
}

/** Shifrlangan kalitlarni ochadi (kalit buzilgan bo'lsa tushunarli xato beradi) */
function decryptKeys(account: UzumAccount): { apiKey: string; apiSecret: string | null } {
  try {
    return {
      apiKey: decryptSecret(account.apiKeyEnc),
      apiSecret: account.apiSecretEnc ? decryptSecret(account.apiSecretEnc) : null,
    };
  } catch {
    throw AppError.badRequest('Saqlangan kalitni ochib bo‘lmadi — kabinetni qayta ulang');
  }
}

/**
 * Kalitni Uzum tomonida tekshiradi.
 * Adapter xato tashlasa ham javob `{ ok: false }` bo'ladi — marshrut 500 bermaydi.
 */
async function verifyKey(
  apiKey: string,
  apiSecret: string | null,
  seed: string,
): Promise<{ ok: boolean; message: string }> {
  try {
    const client = createUzumClient({ apiKey, apiSecret, seed });
    const result = await client.verify();
    return {
      ok: result.ok,
      message: result.message ?? (result.ok ? 'Kalit tekshirildi' : INVALID_KEY_MESSAGE),
    };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : INVALID_KEY_MESSAGE };
  }
}

/**
 * Sinxronizatsiyani navbatga qo'yadi.
 * Navbat ishlamasa ham kabinet ulangan hisoblanadi — foydalanuvchi keyin
 * `/sync/start` orqali qayta boshlashi mumkin.
 */
async function queueFullSync(companyId: string, accountId: string): Promise<boolean> {
  try {
    await enqueueSync(companyId, accountId, 'full');
    return true;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[uzum] sinxronizatsiyani navbatga qo‘yib bo‘lmadi:', err instanceof Error ? err.message : err);
    return false;
  }
}

/**
 * Onboarding'dagi "Demo ma'lumot bilan davom etish" tugmasi qisqa `demo` kalitini yuboradi.
 * Demo rejimda uni to'liq qiymatli namunaviy kalitga aylantiramiz.
 */
function normalizeBody(body: unknown): unknown {
  if (!body || typeof body !== 'object') return body;
  const raw = body as Record<string, unknown>;
  const key = typeof raw.apiKey === 'string' ? raw.apiKey.trim().toLowerCase() : '';
  if (key !== 'demo' || !demoAllowed()) return body;
  return { ...raw, apiKey: `demo-uzum-key-${randomToken(6)}` };
}

// ─────────────────────────── GET / ───────────────────────────

router.get(
  '/',
  ah(async (req, res) => {
    const { company } = companyCtx(req);

    const rows = await prisma.uzumAccount.findMany({
      where: { companyId: company.id },
      include: { _count: { select: { stores: true } } },
      orderBy: { createdAt: 'asc' },
    });

    const payload: UzumAccountSummary[] = rows.map((a) => toAccountSummary(a, a._count.stores));
    res.json(payload);
  }),
);

// ─────────────────────────── GET /stores ───────────────────────────

router.get(
  '/stores',
  ah(async (req, res) => {
    const { company } = companyCtx(req);

    const rows = await prisma.store.findMany({
      where: { companyId: company.id },
      include: { _count: { select: { products: true } } },
      orderBy: { createdAt: 'asc' },
    });

    const payload: StoreSummary[] = rows.map((s) => ({
      id: s.id,
      title: s.title,
      uzumShopId: s.uzumShopId,
      status: s.status,
      productsCount: s._count.products,
    }));

    res.json(payload);
  }),
);

// ─────────────────────────── POST / ───────────────────────────

/**
 * Yangi kabinet ulash.
 *  1) tarif limiti tekshiriladi (muvaffaqiyatsiz eski urinishlar limitni band qilmaydi);
 *  2) kalit shifrlanib saqlanadi (status `pending`);
 *  3) Uzum tomonida tekshiriladi — xato bo'lsa 400 va status `invalid`;
 *  4) muvaffaqiyatda status `active`, onboarding `syncing` bosqichiga o'tadi va
 *     to'liq sinxronizatsiya navbatga qo'yiladi (~30 daqiqa).
 */
router.post(
  '/',
  requireRole('owner'),
  ah(async (req, res) => {
    const { company, plan } = companyCtx(req);
    const input = uzumAccountSchema.parse(normalizeBody(req.body ?? {}));
    const limits = getPlan(plan).limits;

    // Yaroqsiz (va do'konsiz) eski urinishlar limitni to'sib qo'ymasin
    await prisma.uzumAccount.deleteMany({
      where: { companyId: company.id, status: 'invalid', stores: { none: {} } },
    });

    const used = await prisma.uzumAccount.count({ where: { companyId: company.id } });
    if (used >= limits.cabinets) {
      throw AppError.limit(
        `Tarifingizda ${limits.cabinets} tagacha Uzum kabineti ulash mumkin — tarifni yangilang`,
        { limit: limits.cabinets, used, plan, planName: getPlan(plan).name },
      );
    }

    const account = await prisma.uzumAccount.create({
      data: {
        companyId: company.id,
        label: input.label?.trim() || 'Uzum kabinet',
        apiKeyEnc: encryptSecret(input.apiKey),
        apiSecretEnc: input.apiSecret ? encryptSecret(input.apiSecret) : null,
        keyHint: maskKey(input.apiKey),
        status: 'pending',
        syncIntervalM: limits.syncIntervalMinutes,
      },
    });

    const check = await verifyKey(input.apiKey, input.apiSecret ?? null, account.id);

    if (!check.ok) {
      await prisma.uzumAccount.update({
        where: { id: account.id },
        data: { status: 'invalid', lastError: check.message.slice(0, 500) },
      });
      throw AppError.badRequest(check.message, { accountId: account.id, status: 'invalid' });
    }

    const activated = await prisma.uzumAccount.update({
      where: { id: account.id },
      data: {
        status: 'active',
        lastError: null,
        nextSyncAt: new Date(Date.now() + limits.syncIntervalMinutes * 60_000),
      },
    });

    // Onboarding tugamagan bo'lsagina "sinxronizatsiya" bosqichiga o'tkazamiz —
    // ishlab turgan kompaniyaga ikkinchi kabinet qo'shilsa, u qayta sozlashga tushmasin
    if (company.onboardStep !== 'done') {
      await prisma.company.update({ where: { id: company.id }, data: { onboardStep: 'syncing' } });
    }
    await queueFullSync(company.id, activated.id);

    res.status(201).json(toAccountSummary(activated, 0));
  }),
);

// ─────────────────────────── POST /:id/test ───────────────────────────

/** Kalitni qayta tekshirish — natija kabinet holatiga yoziladi */
router.post(
  '/:id/test',
  requireRole('owner', 'manager'),
  ah(async (req, res) => {
    const { company } = companyCtx(req);
    const account = await findAccount(company.id, String(req.params.id));
    const keys = decryptKeys(account);

    const check = await verifyKey(keys.apiKey, keys.apiSecret, account.id);

    const updated = await prisma.uzumAccount.update({
      where: { id: account.id },
      data: {
        status: check.ok ? 'active' : 'invalid',
        lastError: check.ok ? null : check.message.slice(0, 500),
      },
    });

    res.json({
      ok: check.ok,
      message: check.ok ? 'Kalit ishlayapti — kabinet faol' : check.message,
      account: toAccountSummary(updated, await countStores(updated.id)),
    });
  }),
);

// ─────────────────────────── POST /:id/resync ───────────────────────────

/** Qo'lda to'liq qayta sinxronizatsiya (ma'lumot to'liq qayta yig'iladi) */
router.post(
  '/:id/resync',
  requireRole('owner', 'manager'),
  ah(async (req, res) => {
    const { company } = companyCtx(req);
    const account = await findAccount(company.id, String(req.params.id));

    if (account.status === 'disabled') {
      throw AppError.badRequest('Kabinet o‘chirilgan — avval uni qayta faollashtiring');
    }

    const queued = await queueFullSync(company.id, account.id);
    if (!queued) throw AppError.internal('Sinxronizatsiyani boshlab bo‘lmadi — birozdan so‘ng urinib ko‘ring');

    const updated = await prisma.uzumAccount.update({
      where: { id: account.id },
      data: { status: account.status === 'invalid' ? 'pending' : account.status, lastError: null },
    });

    res.json({
      ok: true,
      message: 'Sinxronizatsiya navbatga qo‘yildi',
      account: toAccountSummary(updated, await countStores(updated.id)),
    });
  }),
);

// ─────────────────────────── DELETE /:id ───────────────────────────

/**
 * Kabinetni o'chirish — unga bog'langan do'konlar (va ular orqali mahsulot, buyurtma,
 * qoldiq va sharhlar) ham o'chadi. Amal qaytarilmaydi.
 */
router.delete(
  '/:id',
  requireRole('owner'),
  ah(async (req, res) => {
    const { company } = companyCtx(req);
    const account = await findAccount(company.id, String(req.params.id));
    const stores = await countStores(account.id);

    await prisma.$transaction([
      prisma.store.deleteMany({ where: { uzumAccountId: account.id } }),
      prisma.uzumAccount.delete({ where: { id: account.id } }),
    ]);

    res.json({
      ok: true,
      id: account.id,
      storesRemoved: stores,
      message: `“${account.label}” kabineti o‘chirildi${stores > 0 ? ` (${stores} ta do‘kon bilan)` : ''}`,
    });
  }),
);

export default router;
