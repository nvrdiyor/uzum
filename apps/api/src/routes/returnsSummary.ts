/**
 * Qaytarish va bekor qilish xulosasi — /api/v1/dashboard/returns
 *
 *  GET / → DashboardReturnsResponse (tanlangan davr va oldingi teng davr)
 *
 * Hisob — services/returns.ts `summarizeReturns`: "Qaytarishlar" sahifasi
 * jamlari va Sotuv voronkasidagi qaytgan/bekor qilingan dona aynan shu
 * ta'rifdan. Ilgari panel, voronka va sahifa bir davr uchun uch xil foiz
 * ko'rsatardi (2026-10-24).
 *
 * Davr, do'kon filtri va tarif tarixi chegarasi — Boshqaruv paneli bilan bir
 * xil (lib/period.ts resolveRange, analytics.ts /dashboard).
 */
import { Router } from 'express';
import {
  addDays,
  businessDayStart,
  round,
  type DashboardReturnsResponse,
  type ReturnsSummary,
} from '@savdoiq/shared';
import { ah } from '../lib/errors.js';
import { companyCtx, requireAuth, requireCompany, requireFeature } from '../lib/auth.js';
import { resolveRange } from '../lib/period.js';
import { getStoreIds } from '../services/common.js';
import { summarizeReturns } from '../services/returns.js';

const router = Router();
router.use(requireAuth, requireCompany);

/**
 * Ulush o'zgarishi foiz punktida. Ulush asosi (qaytarishda — qabul qilingan +
 * qaytgan, bekor qilishda — buyurtma qilingan dona) ikki davrdan birida 0
 * bo'lsa null: "0% → 5%" sotuvchiga "+5 p.p. yomonlashdi" bo'lib ko'rinardi,
 * holbuki taqqoslaydigan narsaning o'zi yo'q.
 */
function ppDelta(cur: number, prev: number, hasBase: boolean): number | null {
  return hasBase ? round(cur - prev, 1) : null;
}

const returnedBase = (s: ReturnsSummary) => s.soldUnits + s.returned.qty;

router.get(
  '/',
  requireFeature('returns_report'),
  ah(async (req, res) => {
    const { company, plan } = companyCtx(req);
    const range = resolveRange(req, plan);
    const storeIds = await getStoreIds(company.id, range.storeId);

    const prevFrom = businessDayStart(range.previous.from);
    const prevToExclusive = addDays(businessDayStart(range.previous.to), 1);
    /*
     * Ikkala davr ham HOZIRGI holat bilan: oldingi davrni alohida tanlab
     * ochganda ham aynan shu raqamlar chiqadi. Voronkadagi "teng yosh"
     * (oldingi davr qabul qilinganini hozir − davr uzunligi paytidagidek
     * sanash) bu yerda olinmadi: qaytgan dona sanasini Uzum bermaydi, u doim
     * yakuniy holatda — qabul qilinganni kesib, qaytganni kesmasak, oldingi
     * davr ulushi sun'iy oshib, "qaytarish kamaydi" degan noto'g'ri xulosa
     * chiqqan bo'lardi.
     */
    const now = new Date();
    const [current, prev] = await Promise.all([
      summarizeReturns(storeIds, range.from, range.toExclusive, now),
      summarizeReturns(storeIds, prevFrom, prevToExclusive, now),
    ]);

    const previous = prev.orderedUnits > 0 ? prev : null;
    const deltaPp: DashboardReturnsResponse['deltaPp'] = previous
      ? {
          returned: ppDelta(
            current.returned.rate,
            previous.returned.rate,
            returnedBase(current) > 0 && returnedBase(previous) > 0,
          ),
          canceled: ppDelta(
            current.canceled.rate,
            previous.canceled.rate,
            current.orderedUnits > 0 && previous.orderedUnits > 0,
          ),
        }
      : null;

    const payload: DashboardReturnsResponse = {
      period: range.period,
      previousPeriod: range.previous,
      current,
      previous,
      deltaPp,
    };
    res.json(payload);
  }),
);

export default router;
