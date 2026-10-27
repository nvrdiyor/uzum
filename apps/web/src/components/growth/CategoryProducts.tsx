/**
 * Kategoriya qatori ochilganda: qisqa tafsilot (komissiya, yetkazish, bekor
 * qilish, muzlagan qoldiq) va eng foydali mahsulotlar.
 *
 * Mahsulot raqamlari "Mahsulot foydasi" qatorlarining o'zi (server
 * `topProducts`), shuning uchun mahsulot sahifasiga o'tganda o'sha son
 * chiqadi. Kategoriyadagi qolgan mahsulotlar — Mahsulotlar sahifasida
 * kategoriya filtri bilan.
 */
import { Link } from 'react-router-dom';
import type { CategoryRow } from '@savdoiq/shared';
import { ArrowRight, EyeOff, Tag } from '@/components/icons';
import { Badge, ProductThumb } from '@/components/ui';
import { COST_COLORS } from '@/lib/theme';
import { useFormat, useT } from '@/i18n';
import { cn } from '@/lib/utils';

/** Mahsulotlar sahifasi shu kategoriya bilan (filtrni o'sha sahifa o'qiydi); kategoriyasiz guruhda — null */
export function categoryLink(category: string | null): string | null {
  return category === null ? null : `/products?category=${encodeURIComponent(category)}`;
}

/** Marja ohangi — "Mahsulot foydasi" chegarasi bilan bir xil (zarar — qizil, 10% dan past — za'faron) */
export function categoryMarginTone(margin: number, revenue: number): 'danger' | 'warn' | 'brand' | 'muted' {
  if (revenue <= 0) return 'muted';
  if (margin < 0) return 'danger';
  return margin < 10 ? 'warn' : 'brand';
}

export function CategoryProducts({ row }: { row: CategoryRow }) {
  const t = useT('categories');
  const f = useFormat();
  const link = categoryLink(row.category);

  const facts: { key: string; label: string; value: string; hint?: string; color?: string; tone?: 'warn' }[] = [
    {
      key: 'commission',
      label: t('detail.commission'),
      value: f.money(row.commission),
      hint: row.commissionShare === null ? undefined : f.pct(row.commissionShare),
      color: COST_COLORS.commission,
    },
    {
      key: 'logistics',
      label: t('detail.logistics'),
      value: f.money(row.logistics),
      hint: row.revenue > 0 ? f.pct((row.logistics / row.revenue) * 100) : undefined,
      color: COST_COLORS.logistics,
    },
    {
      key: 'cancel',
      label: t('detail.cancel'),
      value: row.cancelRate === null ? '—' : f.pct(row.cancelRate),
      hint: t('top.units', { n: f.num(row.canceledUnits) }),
    },
    {
      key: 'frozen',
      label: t('detail.frozen'),
      value: f.money(row.frozenValue),
      hint: t('detail.frozenSkus', { n: f.num(row.frozenSkus) }),
      tone: row.frozenValue > 0 ? 'warn' : undefined,
    },
  ];

  return (
    <div className="min-w-0 space-y-3">
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        {facts.map((x) => (
          <div key={x.key} className="well min-w-0 px-3 py-2">
            <p className="eyebrow flex items-center gap-1.5 truncate">
              {x.color ? <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: x.color }} /> : null}
              {x.label}
            </p>
            <p className={cn('tnum mt-0.5 truncate text-sm font-semibold', x.tone === 'warn' ? 'text-warn-ink' : 'text-ink')}>
              {x.value}
            </p>
            {x.hint ? <p className="tnum truncate text-2xs text-muted">{x.hint}</p> : null}
          </div>
        ))}
      </div>

      <div>
        <p className="eyebrow mb-2">{t('top.title')}</p>
        {row.topProducts.length === 0 ? (
          <p className="rounded-xl border border-line/70 bg-surface px-3 py-3 text-xs text-muted">{t('top.empty')}</p>
        ) : (
          <ul className="divide-y divide-line/60 overflow-hidden rounded-xl border border-line/70 bg-surface">
            {row.topProducts.map((p) => (
              <li key={p.productId}>
                <Link
                  to={`/products/${p.productId}`}
                  className="flex items-center gap-3 px-3 py-2.5 transition-colors hover:bg-surface-2/60 focus-visible:bg-surface-2/60 focus-visible:outline-none"
                >
                  <span className="h-9 w-9 shrink-0 overflow-hidden rounded-lg border border-line bg-surface-2">
                    <ProductThumb name={p.title} imageUrl={p.imageUrl} style={{ fontSize: 12 }} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex min-w-0 items-center gap-1.5">
                      {/* Telefonda nom ikki qatorgacha — bir qatorda "Sport krossovka …" bo'lib qolardi */}
                      <span className="min-w-0 text-sm font-medium text-ink max-sm:line-clamp-2 sm:truncate" title={p.title}>
                        {p.title}
                      </span>
                      {p.noCost ? (
                        <Badge tone="warn" className="shrink-0 px-1.5 py-0" title={t('cell.noCostTitle', { n: 1 })}>
                          <Tag className="h-3 w-3" />
                        </Badge>
                      ) : null}
                      {p.hidden ? <EyeOff className="h-3.5 w-3.5 shrink-0 text-muted" aria-label={t('top.hidden')} /> : null}
                    </span>
                    {/* Kategoriya tushumidagi ulushi — tasma bilan, qaysi mahsulot kategoriyani "ko'taryapti" bir qarashda */}
                    <span className="mt-1 flex items-center gap-2">
                      <span className="hidden h-1.5 w-20 shrink-0 overflow-hidden rounded-full bg-surface-3 sm:block">
                        <span className="block h-full rounded-full bg-brand" style={{ width: `${Math.min(100, Math.max(0, p.share))}%` }} />
                      </span>
                      <span className="tnum min-w-0 text-2xs text-muted sm:truncate">
                        {t('top.share', { v: f.pct(p.share) })} · {t('top.units', { n: f.num(p.units) })} · {f.money(p.revenue)}
                      </span>
                    </span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className={cn('tnum block text-sm font-semibold', p.netProfit < 0 ? 'text-danger' : 'text-brand-ink')}>
                      {f.money(p.netProfit)}
                    </span>
                    <span className="tnum block text-2xs text-muted">{t('top.margin', { v: f.pct(p.margin) })}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        {link ? (
          <Link to={link} className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-brand-ink hover:underline">
            {row.moreProducts > 0 ? t('top.more', { n: f.num(row.moreProducts) }) : t('top.all')}
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        ) : null}
      </div>
    </div>
  );
}
