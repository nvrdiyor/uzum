import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowUpDown, ChevronLeft, ChevronRight, Inbox } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button, EmptyState, SkeletonRows } from './primitives';

export interface Column<T> {
  key: string;
  header: ReactNode;
  align?: 'left' | 'center' | 'right';
  width?: number | string;
  sortable?: boolean;
  /** Qiymatni chiqarish */
  render: (row: T, index: number) => ReactNode;
  /** Mahalliy saralash uchun raqamli/matnli qiymat */
  sortValue?: (row: T) => number | string;
  className?: string;
  headerClassName?: string;
  /** Mobil ko'rinishda yashirish */
  hideOnMobile?: boolean;
}

export interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T, index: number) => string;
  loading?: boolean;
  empty?: ReactNode;
  onRowClick?: (row: T) => void;
  /** Sahifalash — server tomonda bo'lsa page/pages/total bering */
  pagination?: {
    page: number;
    pages: number;
    total: number;
    pageSize?: number;
    onPage: (page: number) => void;
  };
  /** Pastdagi jami qatori */
  footer?: ReactNode;
  /** Mahalliy saralash yoqilsin */
  localSort?: boolean;
  density?: 'comfortable' | 'compact';
  className?: string;
  stickyFirstColumn?: boolean;
}

/**
 * Jadval o'ngga suriladimi — shunga qarab chetida yumshoq soya chiqadi.
 * Ilgari ustunlar chetda kesilib qolardi va foydalanuvchi ularni umuman
 * ko'rmasdi.
 */
function useEdgeScroll() {
  const ref = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ left: false, right: false });

  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const update = () => {
      const max = el.scrollWidth - el.clientWidth;
      setEdges({ left: el.scrollLeft > 4, right: max > 4 && el.scrollLeft < max - 4 });
    };
    update();
    el.addEventListener('scroll', update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => {
      el.removeEventListener('scroll', update);
      ro.disconnect();
    };
  });

  return { ref, edges };
}

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  loading,
  empty,
  onRowClick,
  pagination,
  footer,
  localSort = true,
  density = 'comfortable',
  className,
  stickyFirstColumn,
}: DataTableProps<T>) {
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const { ref: scrollRef, edges } = useEdgeScroll();

  const sorted = useMemo(() => {
    if (!localSort || !sortKey) return rows;
    const col = columns.find((c) => c.key === sortKey);
    if (!col?.sortValue) return rows;
    const copy = [...rows];
    copy.sort((a, b) => {
      const av = col.sortValue!(a);
      const bv = col.sortValue!(b);
      if (typeof av === 'number' && typeof bv === 'number') return sortDir === 'asc' ? av - bv : bv - av;
      return sortDir === 'asc'
        ? String(av).localeCompare(String(bv))
        : String(bv).localeCompare(String(av));
    });
    return copy;
  }, [rows, sortKey, sortDir, columns, localSort]);

  // Gorizontal chekinish kartochka paddingiga (px-5) teng — chap chiziq yagona
  const cellPad = density === 'compact' ? 'px-5 py-2' : 'px-5 py-3';

  if (loading) {
    return (
      <div className="p-5">
        <SkeletonRows rows={8} />
      </div>
    );
  }

  if (!rows.length) {
    return <>{empty ?? <EmptyState icon={<Inbox className="h-6 w-6" />} title="Ma’lumot yo‘q" />}</>;
  }

  return (
    <div className={cn('relative w-full', className)}>
      {edges.right ? (
        <div className="pointer-events-none absolute inset-y-0 right-0 z-30 w-10 bg-gradient-to-l from-surface to-transparent" />
      ) : null}
      {edges.left ? (
        <div className="pointer-events-none absolute inset-y-0 left-0 z-30 w-8 bg-gradient-to-r from-surface to-transparent" />
      ) : null}
      <div ref={scrollRef} className="overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse text-sm">
          <thead>
            <tr>
              {columns.map((c, ci) => (
                <th
                  key={c.key}
                  style={{ width: c.width }}
                  className={cn(
                    'table-head border-b border-line',
                    cellPad,
                    c.align === 'right' && 'whitespace-nowrap text-right',
                    c.align === 'center' && 'whitespace-nowrap text-center',
                    !c.align && 'text-left',
                    c.hideOnMobile && 'hidden md:table-cell',
                    stickyFirstColumn && ci === 0 && 'sticky left-0 z-20 bg-surface-2',
                    c.headerClassName,
                  )}
                >
                  {c.sortable && c.sortValue ? (
                    <button
                      type="button"
                      onClick={() => {
                        if (sortKey === c.key) setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
                        else {
                          setSortKey(c.key);
                          setSortDir('desc');
                        }
                      }}
                      className={cn(
                        'inline-flex items-center gap-1 transition-colors hover:text-ink',
                        sortKey === c.key && 'text-brand-ink',
                      )}
                    >
                      {c.header}
                      <ArrowUpDown className="h-3 w-3" />
                    </button>
                  ) : (
                    c.header
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((row, i) => (
              <tr
                key={rowKey(row, i)}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={cn(
                  'group border-b border-line/60 transition-colors last:border-0',
                  onRowClick && 'cursor-pointer',
                  'hover:bg-surface-2/70',
                )}
              >
                {columns.map((c, ci) => (
                  <td
                    key={c.key}
                    className={cn(
                      cellPad,
                      'align-middle text-ink-soft',
                      // Raqamlar hech qachon qatorga bo'linmaydi: "142 050 so'm"
                      // uch qatorga tushib ketsa jadval o'qilmay qoladi
                      c.align === 'right' && 'tnum whitespace-nowrap text-right',
                      c.align === 'center' && 'whitespace-nowrap text-center',
                      c.hideOnMobile && 'hidden md:table-cell',
                      // group-hover: mahkamlangan ustun ham qator bilan birga yoritiladi
                      stickyFirstColumn && ci === 0 && 'sticky left-0 z-10 bg-surface group-hover:bg-surface-2',
                      c.className,
                    )}
                  >
                    {c.render(row, i)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
          {footer ? (
            <tfoot>
              {/* [&>td:first-child]: jami qatorining birinchi katagi ham mahkamlanadi,
                  aks holda jadval surilganda u boshqa ustun ostiga kirib ketardi */}
              <tr
                className={cn(
                  'border-t border-line bg-surface-2/60 font-semibold text-ink',
                  stickyFirstColumn && '[&>td:first-child]:sticky [&>td:first-child]:left-0 [&>td:first-child]:z-10 [&>td:first-child]:bg-surface-2',
                )}
              >
                {footer}
              </tr>
            </tfoot>
          ) : null}
        </table>
      </div>

      {pagination && pagination.pages > 1 ? (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-3">
          <p className="text-xs text-muted">
            {pagination.total} {' '}
            <span className="opacity-70">·</span> {pagination.page} / {pagination.pages}
          </p>
          <div className="flex items-center gap-1.5">
            <Button
              size="sm"
              variant="outline"
              disabled={pagination.page <= 1}
              onClick={() => pagination.onPage(pagination.page - 1)}
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
            {pageNumbers(pagination.page, pagination.pages).map((p, idx) =>
              p === '…' ? (
                <span key={`gap-${idx}`} className="px-1 text-xs text-muted">
                  …
                </span>
              ) : (
                <button
                  key={p}
                  onClick={() => pagination.onPage(p as number)}
                  className={cn(
                    'h-8 min-w-8 rounded-lg px-2 text-xs font-semibold transition-colors',
                    p === pagination.page ? 'bg-brand text-on-brand' : 'bg-surface-2 text-muted hover:text-ink',
                  )}
                >
                  {p}
                </button>
              ),
            )}
            <Button
              size="sm"
              variant="outline"
              disabled={pagination.page >= pagination.pages}
              onClick={() => pagination.onPage(pagination.page + 1)}
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function pageNumbers(page: number, pages: number): (number | '…')[] {
  if (pages <= 7) return Array.from({ length: pages }, (_, i) => i + 1);
  const out: (number | '…')[] = [1];
  if (page > 3) out.push('…');
  for (let p = Math.max(2, page - 1); p <= Math.min(pages - 1, page + 1); p += 1) out.push(p);
  if (page < pages - 2) out.push('…');
  out.push(pages);
  return out;
}

/** Jadvaldagi mahsulot ustuni uchun yagona ko'rinish */
export function ProductCell({
  title,
  subtitle,
  imageUrl,
  size = 40,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  imageUrl?: string | null;
  size?: number;
}) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <div
        className="shrink-0 overflow-hidden rounded-lg border border-line bg-surface-2"
        style={{ width: size, height: size }}
      >
        {imageUrl ? (
          <img src={imageUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-muted">
            <Inbox className="h-4 w-4" />
          </div>
        )}
      </div>
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-ink">{title}</p>
        {subtitle ? <p className="truncate text-xs text-muted">{subtitle}</p> : null}
      </div>
    </div>
  );
}
