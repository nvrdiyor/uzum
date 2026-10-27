import type { Request } from 'express';
import {
  businessDayStart,
  comparePeriodFor,
  getPlan,
  isCompareMode,
  parseISODate,
  presetPeriod,
  toBusinessDate,
  addDays,
  type CompareMode,
  type Period,
  type PlanId,
} from '@savdoiq/shared';

export interface ResolvedRange {
  period: Period;
  /**
   * Taqqoslanadigan davr — `compare` rejimi bo'yicha (shared comparePeriodFor),
   * tarif chegarasida kesilgan `period` dan hisoblanadi. 'prev' da oldingi teng
   * davr; 'prevMonth' / 'prevYear' da o'tgan oy (yil)ning o'sha sanalari —
   * uzunligi joriy davrdan farq qilishi MUMKIN (fevral ↔ mart, butun oy ↔ butun
   * oy), shuning uchun "previous joriy bilan teng uzunlikda" deb hisoblamang.
   * Saqlangan tarixdan tashqarida bo'lsa ham shu yerda turadi: taqqoslashga
   * yaroqliligini services/pnl.ts comparablePeriod hal qiladi.
   */
  previous: Period;
  /** `?compare=` rejimi; noma'lum yoki yo'q qiymat — 'prev' (standart so'rov avvalgidek) */
  compare: CompareMode;
  from: Date;
  to: Date;
  /**
   * to + 1 kun (yarim ochiq oraliq uchun: orderedAt < toExclusive).
   *
   * `from`, `to` va `toExclusive` — SAVDO KUNI (Asia/Tashkent) chegaralari,
   * UTC yarim tuni emas: "14-oktabr" davri 13-oktabr 19:00 UTC da boshlanadi.
   * Kalendar sanasi kerak bo'lsa `period.from` / `period.to` dan olinadi.
   */
  toExclusive: Date;
  storeId?: string;
  page: number;
  pageSize: number;
  search?: string;
  sort?: string;
  order: 'asc' | 'desc';
  /** Tarif tarix chuqurligi sabab davr qisqartirildimi */
  clamped: boolean;
}

const isDate = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}/.test(s);

/**
 * Query'dan davrni ajratib oladi, tarif tarix chuqurligiga qarab cheklaydi.
 * Standart davr — joriy oy, standart taqqoslash — oldingi teng davr.
 */
export function resolveRange(req: Request, plan: PlanId = 'trial'): ResolvedRange {
  const q = req.query as Record<string, string | undefined>;
  // Takrorlangan (?compare=a&compare=b — massiv) yoki noma'lum qiymat ham 'prev': xato emas, standart
  const compare: CompareMode = isCompareMode(q.compare) ? q.compare : 'prev';

  let period: Period;
  if (q.preset) {
    period = presetPeriod(q.preset as Parameters<typeof presetPeriod>[0]);
  } else if (isDate(q.from) && isDate(q.to)) {
    period = { from: q.from.slice(0, 10), to: q.to.slice(0, 10) };
  } else {
    period = presetPeriod('thisMonth');
  }

  if (parseISODate(period.from).getTime() > parseISODate(period.to).getTime()) {
    period = { from: period.to, to: period.from };
  }

  const maxDays = getPlan(plan).limits.historyDays;
  const earliest = addDays(new Date(), -maxDays);
  let clamped = false;
  if (parseISODate(period.from).getTime() < earliest.getTime()) {
    period = { from: toBusinessDate(earliest), to: period.to };
    clamped = true;
  }

  const from = businessDayStart(period.from);
  const to = businessDayStart(period.to);

  const page = Math.max(1, Number(q.page ?? 1) || 1);
  const pageSizeRaw = Number(q.pageSize ?? 50) || 50;
  const pageSize = Math.min(500, Math.max(1, pageSizeRaw));

  return {
    period,
    previous: comparePeriodFor(period, compare),
    compare,
    from,
    to,
    toExclusive: addDays(to, 1),
    storeId: q.storeId && q.storeId !== 'all' ? q.storeId : undefined,
    page,
    pageSize,
    search: q.search?.trim() || undefined,
    sort: q.sort || undefined,
    order: q.order === 'asc' ? 'asc' : 'desc',
    clamped,
  };
}

export function paginate<T>(items: T[], page: number, pageSize: number) {
  const total = items.length;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const start = (page - 1) * pageSize;
  return {
    items: items.slice(start, start + pageSize),
    total,
    page,
    pageSize,
    pages,
  };
}

/** Do'kon filtri: berilgan companyId ichidagi do'konlar ro'yxati */
export function storeFilter(storeIds: string[], storeId?: string): string[] {
  if (!storeId) return storeIds;
  return storeIds.filter((id) => id === storeId);
}
