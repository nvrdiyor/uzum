import type { Request } from 'express';
import {
  getPlan,
  parseISODate,
  presetPeriod,
  previousPeriod,
  toISODate,
  addDays,
  type Period,
  type PlanId,
} from '@savdoiq/shared';

export interface ResolvedRange {
  period: Period;
  previous: Period;
  from: Date;
  to: Date;
  /** to + 1 kun (yarim ochiq oraliq uchun: orderedAt < toExclusive) */
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
 * Standart davr — joriy oy.
 */
export function resolveRange(req: Request, plan: PlanId = 'trial'): ResolvedRange {
  const q = req.query as Record<string, string | undefined>;

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
    period = { from: toISODate(earliest), to: period.to };
    clamped = true;
  }

  const from = parseISODate(period.from);
  const to = parseISODate(period.to);

  const page = Math.max(1, Number(q.page ?? 1) || 1);
  const pageSizeRaw = Number(q.pageSize ?? 50) || 50;
  const pageSize = Math.min(500, Math.max(1, pageSizeRaw));

  return {
    period,
    previous: previousPeriod(period),
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
