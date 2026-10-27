/**
 * Narxlar shkalasi (2026-10-24) — bitta chiziqda: zarar zonasi (zararsizlik
 * narxigacha), zararsizlik narxi (uzuq qizil chiziq), bizning narx (brend,
 * variantlar min–max oralig'i bilan), raqobatchilar (nuqtalar; zararsizlikdan
 * pasti qizil) va mediana. Sotuvchi "raqobatchiga tenglashsam zarar
 * ko'ramanmi?" degan savolga jadvalni o'qimasdan javob oladi.
 *
 * Nol foyda narxi yashirin (pulsiz ko'rinish, null) bo'lsa — zarar zonasi
 * chizilmaydi, faqat narxlar.
 */
import type { CompetitorReference } from '@savdoiq/shared';
import { useFormat, useT } from '@/i18n';
import { cn } from '@/lib/utils';
import './texts';

export interface LadderPoint {
  id: string;
  title: string;
  price: number | null;
  belowBreakEven?: boolean | null;
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0;

/** Yorliq chetdan chiqib ketmasin: chap chekkada chapga, o'ngda o'ngga tekislanadi (to'liq klass satrlari) */
function anchor(x: number): string {
  if (x < 14) return 'translate-x-0';
  if (x > 86) return '-translate-x-full';
  return '-translate-x-1/2';
}

export function PriceLadder({
  our,
  medianPrice,
  points,
  className,
}: {
  our: CompetitorReference;
  medianPrice: number | null | undefined;
  points: LadderPoint[];
  className?: string;
}) {
  const t = useT('competitors');
  const f = useFormat();
  const be = isNum(our.breakEvenPrice) ? our.breakEvenPrice : null;
  const ourMin = isNum(our.minPrice) ? our.minPrice : null;
  const ourMax = isNum(our.maxPrice) ? our.maxPrice : ourMin;
  const priced = points.filter((p): p is LadderPoint & { price: number } => isNum(p.price));
  const values = [be, ourMin, ourMax, ...priced.map((p) => p.price)].filter(isNum);
  if (priced.length === 0 || values.length < 2) return null;

  const lo0 = Math.min(...values);
  const hi0 = Math.max(...values);
  const pad = hi0 > lo0 ? (hi0 - lo0) * 0.14 : hi0 * 0.1;
  const lo = Math.max(0, lo0 - pad);
  const hi = hi0 + pad;
  const x = (v: number) => ((v - lo) / (hi - lo)) * 100;
  const med = isNum(medianPrice) ? medianPrice : null;

  return (
    <div className={cn('select-none', className)}>
      <div className="relative h-[86px]" role="img" aria-label={t('ladder.aria')}>
        {/* Bizning narx yorlig'i — tepada */}
        {ourMin !== null ? (
          <span
            className={cn('tnum absolute top-0 whitespace-nowrap text-2xs font-semibold text-brand-ink', anchor(x(ourMin)))}
            style={{ left: `${x(ourMin)}%` }}
          >
            {t('ladder.our')} · {f.num(ourMin)}
            {ourMax !== null && ourMax !== ourMin ? `–${f.num(ourMax)}` : ''}
          </span>
        ) : null}

        {/* Chiziq va zarar zonasi */}
        <div className="absolute inset-x-0 top-[34px] h-2.5 overflow-hidden rounded-full bg-surface-3">
          {be !== null && be > lo ? (
            <div className="absolute inset-y-0 left-0 bg-danger/25" style={{ width: `${Math.min(100, x(be))}%` }} />
          ) : null}
          {ourMin !== null && ourMax !== null && ourMax > ourMin ? (
            <div
              className="absolute inset-y-0 bg-brand/35"
              style={{ left: `${x(ourMin)}%`, width: `${x(ourMax) - x(ourMin)}%` }}
            />
          ) : null}
        </div>

        {/* Zararsizlik narxi — uzuq qizil chiziq */}
        {be !== null ? (
          <span
            className="absolute top-[24px] h-[30px] -translate-x-1/2 border-l-2 border-dashed border-danger"
            style={{ left: `${x(be)}%` }}
            aria-hidden
          />
        ) : null}

        {/* Bizning narx — brend chizig'i */}
        {ourMin !== null ? (
          <span
            className="absolute top-[22px] h-[34px] w-[3px] -translate-x-1/2 rounded-full bg-brand"
            style={{ left: `${x(ourMin)}%` }}
            aria-hidden
          />
        ) : null}

        {/* Mediana — chiziq ostidagi romb */}
        {med !== null ? (
          <span
            className="absolute top-[48px] h-2 w-2 -translate-x-1/2 rotate-45 rounded-[2px] bg-violet"
            style={{ left: `${x(med)}%` }}
            title={`${t('ladder.median')} · ${f.money(med)}`}
          />
        ) : null}

        {/* Raqobatchilar */}
        {priced.map((p) => (
          <span
            key={p.id}
            className={cn(
              'absolute top-[33px] h-3 w-3 -translate-x-1/2 rounded-full ring-2 ring-surface',
              p.belowBreakEven ? 'bg-danger' : 'bg-violet',
            )}
            style={{ left: `${x(p.price)}%` }}
            title={`${p.title} — ${f.money(p.price)}`}
          />
        ))}

        {/* Zararsizlik yorlig'i — pastda */}
        {be !== null ? (
          <span
            className={cn('tnum absolute top-[62px] whitespace-nowrap text-2xs font-semibold text-danger-ink', anchor(x(be)))}
            style={{ left: `${x(be)}%` }}
          >
            {t('ladder.breakEven')} · {f.num(be)}
          </span>
        ) : null}
      </div>

      <ul className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-2xs text-muted">
        {be !== null ? (
          <li className="inline-flex items-center gap-1.5">
            <span className="h-2 w-3.5 rounded-sm bg-danger/25" aria-hidden />
            {t('ladder.loss')}
          </li>
        ) : null}
        {ourMin !== null ? (
          <li className="inline-flex items-center gap-1.5">
            <span className="h-3 w-[3px] rounded-full bg-brand" aria-hidden />
            {t('ref.our')}
          </li>
        ) : null}
        <li className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-violet" aria-hidden />
          {t('ref.competitors')}
        </li>
        {med !== null ? (
          <li className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rotate-45 rounded-[2px] bg-violet" aria-hidden />
            {t('ladder.median')}
          </li>
        ) : null}
      </ul>
    </div>
  );
}
