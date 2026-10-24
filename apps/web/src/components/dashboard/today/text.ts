import type { TodayTask, TodayTaskKind } from '@savdoiq/shared';
import { useFormat, useT } from '@/i18n';
import { TODAY_NS } from './i18n';

export interface TaskText {
  title: string;
  body: string;
  cta: string;
  /** Summa ostidagi izoh ("qoplanishi kerak") — summa nimani anglatishini aytadi */
  amountLabel: string | null;
  amountHint: string | null;
}

/** Summasi bo'lmaydigan tur (sharh) — izoh ham yo'q */
const AMOUNT_KINDS: ReadonlySet<TodayTaskKind> = new Set(['loss', 'cost', 'fbs', 'stock', 'storage']);

const str = (v: string | number | undefined): string => (v === undefined ? '' : String(v));
const n = (v: string | number | undefined): number => (typeof v === 'number' ? v : Number(v) || 0);
const join = (parts: string[]): string => parts.filter(Boolean).join(' · ');

/**
 * Qator matni joriy tilda — server `params`idan (routes/today.ts singleText /
 * groupText bilan bir xil qoidalar). Noma'lum yangi tur kelsa server
 * yuborgan o'zbekcha matn qoladi: bo'sh qator chiqmasin.
 */
export function useTaskText() {
  const t = useT(TODAY_NS);
  const f = useFormat();

  return (task: TodayTask): TaskText => {
    const p = task.params;
    const one = task.count <= 1;
    const money = (v: number) => t('money', { v: f.compact(Math.round(v)) });
    const date = (v: string | number | undefined) => (v ? f.dateShort(str(v)) : '');
    // Buyurtma yoshi: 2 kungacha soatda, keyin kunda (server ageText bilan bir xil)
    const age = (hours: number) =>
      hours < 48 ? t('age.h', { n: f.num(Math.max(1, hours)) }) : t('age.d', { n: f.num(Math.floor(hours / 24)) });
    const amountLabel = AMOUNT_KINDS.has(task.kind) ? t(`amount.${task.kind}`) : null;
    const amountHint = AMOUNT_KINDS.has(task.kind) ? t(`amountHint.${task.kind}`) : null;
    const base = { cta: t(`cta.${task.kind}`), amountLabel, amountHint };

    switch (task.kind) {
      case 'loss':
        return one
          ? {
              ...base,
              title: t('loss.one', { sku: str(p.sku), qty: f.num(n(p.qty)) }),
              body: join([str(p.name), date(p.date), t('loss.oneBody')]),
            }
          : {
              ...base,
              title: t('loss.many', { n: f.num(task.count) }),
              body: t('loss.manyBody', { qty: f.num(n(p.qty)), sku: str(p.sku) }),
            };
      case 'review': {
        const name = str(p.name) || t('review.product');
        return one
          ? {
              ...base,
              title: t('review.one', { rating: n(p.rating), name }),
              body: join([p.text ? `«${str(p.text)}»` : t('review.noText'), date(p.date)]),
            }
          : {
              ...base,
              title: t('review.many', { n: f.num(task.count) }),
              body: t('review.manyBody', { name, rating: n(p.rating) }),
            };
      }
      case 'cost':
        return one
          ? { ...base, title: t('cost.one', { sku: str(p.sku) }), body: t('cost.oneBody', { units: f.num(n(p.units)) }) }
          : {
              ...base,
              title: t('cost.many', { n: f.num(task.count) }),
              body: t('cost.manyBody', { units: f.num(n(p.units)) }),
            };
      case 'fbs':
        return one
          ? {
              ...base,
              cta: t('cta.fbsOne'),
              title: t('fbs.one', { scheme: str(p.scheme), order: str(p.order) }),
              body: t('fbs.oneBody', { age: age(n(p.hours)), units: f.num(n(p.units)) }),
            }
          : {
              ...base,
              title: t('fbs.many', { n: f.num(task.count), scheme: str(p.scheme) }),
              body: t('fbs.manyBody', { age: age(n(p.hours)) }),
            };
      case 'stock': {
        const days = n(p.days);
        const lead = f.num(n(p.lead));
        if (one) {
          // Rejalashtiruvchi kunni pastga yaxlitlaydi: 0 — qoldiq bor, lekin bir kunga yetmaydi
          const title =
            n(p.stock) <= 0
              ? t('stock.out', { sku: str(p.sku) })
              : days < 1
                ? t('stock.lessDay', { sku: str(p.sku) })
                : t('stock.one', { sku: str(p.sku), days: f.num(days) });
          return { ...base, title, body: join([str(p.name), t('stock.oneBody', { lead })]) };
        }
        return {
          ...base,
          title: t('stock.many', { n: f.num(task.count) }),
          body:
            days < 1
              ? t('stock.manyBodyOut', { sku: str(p.sku), lead })
              : t('stock.manyBody', { sku: str(p.sku), days: f.num(days), lead }),
        };
      }
      case 'storage':
        return {
          ...base,
          title: p.pct !== undefined ? t('storage.grew', { pct: f.num(n(p.pct)) }) : t('storage.started'),
          body: join([
            t('storage.body', { cur: money(n(p.cur)), prev: money(n(p.prev)) }),
            p.sku ? t('storage.top', { sku: str(p.sku) }) : '',
          ]),
        };
      default:
        return { title: task.title, body: task.body, cta: task.cta, amountLabel: null, amountHint: null };
    }
  };
}
