/**
 * Sinxronizatsiya moduli — /api/v1/sync
 *
 *  GET  /status    → SyncStatus (sayt har 3-4 soniyada so'rab turadi; `history` — tarix qamrovi)
 *  POST /start     → sinxronizatsiyani navbatga qo'yadi (owner/manager)
 *  POST /cancel    → navbatdagi/bajarilayotgan jarayonni bekor qiladi (owner/manager)
 *  POST /backfill  → tarif ochgan, lekin hali yuklanmagan tarixni yuklaydi (owner/manager)
 *  GET  /history   → oxirgi 20 ta job (tur, holat, progress, davomiylik, xato)
 *
 * Ma'lumot bo'lmasa ham barcha marshrutlar 200 va bo'sh/nol qiymat qaytaradi.
 */
import { Router } from 'express';
import { prisma } from '@savdoiq/db';
import type { SyncJob } from '@savdoiq/db';
import { SYNC_STEPS, type SyncStatus, type SyncStepId } from '@savdoiq/shared';
import { AppError, ah } from '../lib/errors.js';
import { companyCtx, requireAuth, requireCompany, requireRole } from '../lib/auth.js';
import {
  cancelSync,
  enqueueSync,
  getSyncStatus,
  scheduleHistoryBackfill,
  type RegularSyncType,
  type SyncJobType,
} from '../services/sync.js';

const router = Router();
router.use(requireAuth, requireCompany);

// ─────────────────────────── Yordamchilar ───────────────────────────

/** Tarixda ko'rsatiladigan joblar soni */
const HISTORY_LIMIT = 20;

const STEP_LABELS = new Map<string, string>(SYNC_STEPS.map((s) => [s.id, s.label.uz]));
const VALID_STEPS = new Set<string>(['queued', 'done', ...SYNC_STEPS.map((s) => s.id)]);

type HistoryStatus = 'queued' | 'running' | 'done' | 'failed' | 'canceled';
const HISTORY_STATUSES: HistoryStatus[] = ['queued', 'running', 'done', 'failed', 'canceled'];

export interface SyncHistoryRow {
  id: string;
  type: SyncJobType;
  status: HistoryStatus;
  progress: number;
  step: SyncStepId;
  stepLabel: string;
  message: string | null;
  error: string | null;
  attempts: number;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  /** Boshlanishdan tugagunicha o'tgan vaqt (sekund); tugamagan bo'lsa null */
  durationSeconds: number | null;
}

export interface SyncHistoryResponse {
  items: SyncHistoryRow[];
  total: number;
  /** Oxirgi muvaffaqiyatli sinxronizatsiya vaqti */
  lastSuccessAt: string | null;
}

function toStepId(value: string | null | undefined): SyncStepId {
  return VALID_STEPS.has(value ?? '') ? (value as SyncStepId) : 'queued';
}

function toHistoryStatus(value: string): HistoryStatus {
  return HISTORY_STATUSES.includes(value as HistoryStatus) ? (value as HistoryStatus) : 'queued';
}

function toHistoryRow(job: SyncJob): SyncHistoryRow {
  const step = toStepId(job.step);
  const duration =
    job.startedAt && job.finishedAt
      ? Math.max(0, Math.round((job.finishedAt.getTime() - job.startedAt.getTime()) / 1000))
      : null;

  return {
    id: job.id,
    type: job.type === 'incremental' || job.type === 'backfill' ? job.type : 'full',
    status: toHistoryStatus(job.status),
    progress: Math.min(100, Math.max(0, Math.round(job.progress))),
    step,
    stepLabel: step === 'done' ? 'Yakunlandi' : (STEP_LABELS.get(step) ?? 'Navbatda'),
    message: job.message,
    error: job.error,
    attempts: job.attempts,
    createdAt: job.createdAt.toISOString(),
    startedAt: job.startedAt ? job.startedAt.toISOString() : null,
    finishedAt: job.finishedAt ? job.finishedAt.toISOString() : null,
    durationSeconds: duration,
  };
}

/** So'rovdan sinxronizatsiya turini ajratadi (body yoki query). Tarix yuklash — alohida `/backfill` */
function readType(body: unknown, query: Record<string, string | undefined>): RegularSyncType | undefined {
  const fromBody = body && typeof body === 'object' ? (body as { type?: unknown }).type : undefined;
  const raw = typeof fromBody === 'string' ? fromBody : query.type;
  if (raw === 'full' || raw === 'incremental') return raw;
  return undefined;
}

/** So'rovdan kabinet id'ini ajratadi (berilmasa — kompaniyaning birinchi kabineti) */
function readAccountId(body: unknown, query: Record<string, string | undefined>): string | undefined {
  const fromBody = body && typeof body === 'object' ? (body as { uzumAccountId?: unknown }).uzumAccountId : undefined;
  const raw = typeof fromBody === 'string' ? fromBody : query.uzumAccountId;
  return raw?.trim() || undefined;
}

// ─────────────────────────── GET /status ───────────────────────────

router.get(
  '/status',
  ah(async (req, res) => {
    const { company } = companyCtx(req);
    const payload: SyncStatus = await getSyncStatus(company.id);
    res.json(payload);
  }),
);

// ─────────────────────────── POST /start ───────────────────────────

/**
 * Sinxronizatsiyani boshlaydi.
 * Allaqachon navbatda/bajarilayotgan jarayon bo'lsa — yangisi yaratilmaydi,
 * mavjudining holati qaytariladi (takroriy bosish xavfsiz).
 */
router.post(
  '/start',
  requireRole('owner', 'manager'),
  ah(async (req, res) => {
    const { company } = companyCtx(req);
    const query = req.query as Record<string, string | undefined>;

    const requestedId = readAccountId(req.body, query);
    const account = requestedId
      ? await prisma.uzumAccount.findFirst({
          where: { id: requestedId, companyId: company.id },
          select: { id: true },
        })
      : await prisma.uzumAccount.findFirst({
          where: { companyId: company.id },
          orderBy: { createdAt: 'asc' },
          select: { id: true },
        });

    if (!account) {
      if (requestedId) throw AppError.notFound('Uzum kabineti topilmadi');
      throw new AppError(
        409,
        'no_uzum_account',
        'Avval Uzum API kalitini ulang (seller.uzum.uz → Mening profilim → API kalitlar)',
      );
    }

    await enqueueSync(company.id, account.id, readType(req.body, query));

    const payload: SyncStatus = await getSyncStatus(company.id);
    res.json(payload);
  }),
);

// ─────────────────────────── POST /cancel ───────────────────────────

router.post(
  '/cancel',
  requireRole('owner', 'manager'),
  ah(async (req, res) => {
    const { company } = companyCtx(req);
    await cancelSync(company.id);
    const payload: SyncStatus = await getSyncStatus(company.id);
    res.json(payload);
  }),
);

// ─────────────────────────── POST /backfill ───────────────────────────

/**
 * Tarif ruxsat bergan, lekin hali yuklanmagan tarixni yuklashni boshlaydi
 * (masalan, sinovdagi 60 kundan VIP'ning 365 kunigacha). Odatda o'zi boshlanadi
 * (tarif o'zgarganda) — bu tugma qayta urinish va eski kabinetlar uchun.
 *
 * `{ rescan: true }` — butun tarif oralig'ini QAYTA o'qish (oxirgi 14 kundan
 * eskisi): eski kabinetning birinchi sinxroni Uzum chegarasida jim kesilgan
 * bo'lishi mumkin bo'lsa (`history.suspectGap`). Fonda, sekin tezlikda ketadi.
 *
 * Tarix to'liq bo'lsa yoki yuklash allaqachon ketayotgan bo'lsa yangi job
 * yaratilmaydi; har holda joriy holat (`history` bilan) qaytariladi.
 */
router.post(
  '/backfill',
  requireRole('owner', 'manager'),
  ah(async (req, res) => {
    const { company } = companyCtx(req);
    const query = req.query as Record<string, string | undefined>;

    const requestedId = readAccountId(req.body, query);
    const account = requestedId
      ? await prisma.uzumAccount.findFirst({ where: { id: requestedId, companyId: company.id }, select: { id: true } })
      : await prisma.uzumAccount.findFirst({ where: { companyId: company.id }, select: { id: true } });
    if (!account) {
      if (requestedId) throw AppError.notFound('Uzum kabineti topilmadi');
      throw new AppError(
        409,
        'no_uzum_account',
        'Avval Uzum API kalitini ulang (seller.uzum.uz → Mening profilim → API kalitlar)',
      );
    }

    const rescan = Boolean(req.body && typeof req.body === 'object' && (req.body as { rescan?: unknown }).rescan === true);
    await scheduleHistoryBackfill(company.id, { accountId: requestedId ?? null, reason: 'manual', rescan });

    const payload: SyncStatus = await getSyncStatus(company.id);
    res.json(payload);
  }),
);

// ─────────────────────────── GET /history ───────────────────────────

router.get(
  '/history',
  ah(async (req, res) => {
    const { company } = companyCtx(req);

    const [jobs, total, lastSuccess] = await Promise.all([
      prisma.syncJob.findMany({
        where: { companyId: company.id },
        orderBy: { createdAt: 'desc' },
        take: HISTORY_LIMIT,
      }),
      prisma.syncJob.count({ where: { companyId: company.id } }),
      prisma.syncJob.findFirst({
        where: { companyId: company.id, status: 'done' },
        orderBy: { finishedAt: 'desc' },
        select: { finishedAt: true },
      }),
    ]);

    const payload: SyncHistoryResponse = {
      items: jobs.map(toHistoryRow),
      total,
      lastSuccessAt: lastSuccess?.finishedAt ? lastSuccess.finishedAt.toISOString() : null,
    };

    res.json(payload);
  }),
);

export default router;
