import { type CSSProperties, Fragment, type KeyboardEvent, type ReactNode, useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUpDown, ChevronDown, ChevronLeft, ChevronRight, Inbox, TrendingUp } from '@/components/icons';
import { useIsDesktop } from '@/hooks/useMediaQuery';
import { registerNamespace, useFormat, useT } from '@/i18n';
import { cn } from '@/lib/utils';
import { Button, EmptyState, Select, SkeletonRows } from './primitives';

registerNamespace('table', {
  uz: {
    more: 'Yana {n} ta ko‘rsatish',
    shown: '{shown} / {total} qator',
    details: 'Batafsil ({n})',
    less: 'Yig‘ish',
    sortBy: 'Saralash',
    sortNone: 'Odatiy tartib',
    sortAsc: 'O‘sish bo‘yicha',
    sortDesc: 'Kamayish bo‘yicha',
    expand: 'Ochish',
  },
  ru: {
    more: 'Показать ещё {n}',
    shown: '{shown} из {total} строк',
    details: 'Подробнее ({n})',
    less: 'Свернуть',
    sortBy: 'Сортировка',
    sortNone: 'По умолчанию',
    sortAsc: 'По возрастанию',
    sortDesc: 'По убыванию',
    expand: 'Развернуть',
  },
  en: {
    more: 'Show {n} more',
    shown: '{shown} of {total} rows',
    details: 'Details ({n})',
    less: 'Collapse',
    sortBy: 'Sort',
    sortNone: 'Default order',
    sortAsc: 'Ascending',
    sortDesc: 'Descending',
    expand: 'Expand',
  },
});

/**
 * Sahifalash berilmagan jadvalda bir martada chiziladigan qatorlar.
 * Pul kalendari 2 016 qatorni (30 mingdan ortiq element) birdaniga chizardi —
 * sahifa ochilishi ham, aylantirish ham sekinlashardi.
 */
const ROWS_STEP = 100;

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
  /** Mobil ko'rinishda yashirish (kartada "Batafsil" ostiga tushadi) */
  hideOnMobile?: boolean;
  /**
   * Jadvalda faqat shu kenglikdan boshlab ko'rinadi (ikkinchi darajali ustun —
   * 1366px da jadval gorizontal surilmasin). `hideOnMobile` ning 'md:table-cell'
   * klassi ilgari qo'shimcha `hidden` ni bekor qilardi, shuning uchun alohida xossa.
   * Telefondagi kartada bunday ustun "Batafsil" ostida turadi.
   */
  hideBelow?: 'lg' | 'xl' | '2xl';
  /**
   * Telefondagi karta ichida o'rni. Berilmasa: birinchi ustun — sarlavha,
   * sarlavhasi bo'sh yoki `actions` ustun — tugmalar qatori, `hideOnMobile` —
   * "Batafsil" ostida, qolgani — asosiy maydonlar.
   */
  mobile?: MobileRole;
}

type MobileRole = 'title' | 'field' | 'detail' | 'actions' | 'hidden';

/** Tailwind klasslari to'liq yozilgan — shablon qatoridan yasalsa CSS'ga chiqmaydi */
const HIDE_BELOW = {
  lg: 'hidden lg:table-cell',
  xl: 'hidden xl:table-cell',
  '2xl': 'hidden 2xl:table-cell',
} as const;

function hideClass<T>(c: Column<T>): string | undefined {
  if (c.hideBelow) return HIDE_BELOW[c.hideBelow];
  return c.hideOnMobile ? 'hidden md:table-cell' : undefined;
}

/**
 * Har ustunning kartadagi o'rni. Belgilash katakchasi (`select`) sarlavha
 * yonida chapda turadi; sarlavha — undan keyingi birinchi ustun.
 */
function mobileRoles<T>(columns: Column<T>[]): (MobileRole | 'select')[] {
  let titled = columns.some((c) => c.mobile === 'title');
  return columns.map((c) => {
    if (c.mobile) return c.mobile;
    if (c.key === 'select') return 'select';
    if (!titled) {
      titled = true;
      return 'title';
    }
    if (c.key === 'actions' || c.key === 'action' || c.header === '' || c.header == null) return 'actions';
    return c.hideOnMobile || c.hideBelow ? 'detail' : 'field';
  });
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
  /**
   * Qator ostida ochiladigan qo'shimcha mazmun (masalan, mahsulotning SKU
   * variantlari). Ochish tugmasi birinchi ustun katagining boshida turadi —
   * alohida ustun emas, shuning uchun sarlavha, jami qatori va mahkamlangan
   * birinchi ustun avvalgidek qoladi. Berilmasa jadval aynan avvalgidek:
   * tugma ham, qo'shimcha qator ham chiqmaydi (2026-10-24).
   */
  renderExpanded?: (row: T) => ReactNode;
  /** Qaysi qatorni ochish mumkin; berilmasa — hammasini */
  canExpand?: (row: T) => boolean;
  /** Ochish tugmasi yozuvi: telefondagi kartada matn, jadvalda izoh (title) */
  expandLabel?: (row: T, open: boolean) => string;
}

/** Qatorni ochish tugmasi — jadvalda ham, telefondagi kartada ham */
function ExpandToggle({
  open,
  label,
  onToggle,
  withText,
}: {
  open: boolean;
  label: string;
  onToggle: () => void;
  /** Kartada matn bilan; jadvalda faqat belgi (yozuvi izohda) */
  withText?: boolean;
}) {
  return (
    <button
      type="button"
      aria-expanded={open}
      aria-label={withText ? undefined : label}
      title={withText ? undefined : label}
      // Qator yoki karta bosilganda ochiladigan yon panel shu tugmadan ochilib ketmasin
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      onKeyDown={(e) => e.stopPropagation()}
      className={cn(
        // cn — oddiy clsx: bir-biriga zid klasslar (text-muted / text-brand-ink) hech qachon birga berilmaydi
        'inline-flex shrink-0 items-center justify-center rounded-md transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50',
        withText ? 'mt-2.5 gap-1 text-xs font-medium text-brand-ink' : 'h-6 w-6 text-muted hover:bg-surface-3 hover:text-ink',
      )}
    >
      {withText ? label : null}
      <ChevronDown className={cn('transition-transform', withText ? 'h-3.5 w-3.5' : 'h-4 w-4', open && 'rotate-180')} />
    </button>
  );
}

/**
 * Jadval o'ngga suriladimi — shunga qarab chetida yumshoq soya chiqadi.
 * Ilgari ustunlar chetda kesilib qolardi va foydalanuvchi ularni umuman
 * ko'rmasdi.
 */
function useEdgeScroll() {
  // Element holatda saqlanadi: jadval yuklanishdan keyin paydo bo'ladi va
  // effekt aynan o'shanda (bir marta) ulanadi
  const [el, setEl] = useState<HTMLDivElement | null>(null);
  const [edges, setEdges] = useState({ left: false, right: false });

  useEffect(() => {
    if (!el) return undefined;
    const update = () => {
      const max = el.scrollWidth - el.clientWidth;
      const left = el.scrollLeft > 4;
      const right = max > 4 && el.scrollLeft < max - 4;
      /*
       * O'zgarmagan bo'lsa AYNAN eski obyekt qaytariladi. Ilgari har
       * chaqiruvda yangi obyekt yozilardi, effekt esa bog'liqliksiz edi:
       * holat → qayta chizish → effekt → holat… Jadvali bor har bir sahifa
       * sekundiga ~100 marta to'xtovsiz qayta chizilardi (Boshqaruv panelida
       * o'lchangan: 3 soniyada 655 ta yangi ResizeObserver).
       */
      setEdges((prev) => (prev.left === left && prev.right === right ? prev : { left, right }));
    };
    update();
    el.addEventListener('scroll', update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => {
      el.removeEventListener('scroll', update);
      ro.disconnect();
    };
  }, [el]);

  return { ref: setEl, edges };
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
  renderExpanded,
  canExpand,
  expandLabel,
}: DataTableProps<T>) {
  const t = useT('table');
  const f = useFormat();
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [limit, setLimit] = useState(ROWS_STEP);
  // Ochilgan qatorlar kaliti bo'yicha: saralash yoki filtr o'zgarsa ham ochiq qator ochiqligicha qoladi
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set());
  const toggleExpanded = (key: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  const expandable = (row: T) => Boolean(renderExpanded) && (canExpand ? canExpand(row) : true);
  const toggleLabel = (row: T, open: boolean) => expandLabel?.(row, open) ?? (open ? t('less') : t('expand'));
  const { ref: scrollRef, edges } = useEdgeScroll();
  /*
   * Telefonda (md dan tor) jadval o'rniga kartalar: 640 px'lik jadval 375 px
   * ekranda yon tomonga surilib, ustunlar kesilib qolardi.
   */
  const isDesktop = useIsDesktop();

  // Ro'yxat almashsa (filtr, davr) yana boshidan 100 ta
  useEffect(() => setLimit(ROWS_STEP), [rows]);

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

  // Saralash butun ro'yxat bo'yicha, chizish esa bosqichma-bosqich
  // Chegaradan ozgina oshsa (masalan 121 qator) "yana 21 ta" tugmasi o'rniga hammasi chiziladi
  const visible = pagination || sorted.length <= limit + ROWS_STEP / 2 ? sorted : sorted.slice(0, limit);
  const hidden = sorted.length - visible.length;

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

  const moreBar =
    hidden > 0 ? (
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-3 md:px-5">
        <p className="tnum text-xs text-muted">
          {t('shown', { shown: f.num(visible.length), total: f.num(sorted.length) })}
        </p>
        <Button
          size="sm"
          variant="outline"
          icon={<ChevronDown className="h-3.5 w-3.5" />}
          onClick={() => setLimit((n) => n + ROWS_STEP * 2)}
        >
          {t('more', { n: f.num(Math.min(hidden, ROWS_STEP * 2)) })}
        </Button>
      </div>
    ) : null;

  const pager =
    pagination && pagination.pages > 1 ? (
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
    ) : null;

  if (!isDesktop) {
    const sortables = localSort ? columns.filter((c) => c.sortable && c.sortValue) : [];
    return (
      <div className={cn('w-full', className)}>
        {sortables.length > 0 ? (
          <div className="flex items-center gap-2 border-b border-line px-4 py-2.5">
            <span className="shrink-0 text-xs text-muted">{t('sortBy')}</span>
            <Select
              value={sortKey ?? ''}
              onChange={(e) => setSortKey(e.target.value || null)}
              className="h-9 min-w-0 flex-1 py-1.5 text-xs"
              aria-label={t('sortBy')}
            >
              <option value="">{t('sortNone')}</option>
              {sortables.map((c) => (
                <option key={c.key} value={c.key}>
                  {typeof c.header === 'string' ? c.header : c.key}
                </option>
              ))}
            </Select>
            {sortKey ? (
              <Button
                size="sm"
                variant="outline"
                className="h-9 shrink-0 px-2.5"
                aria-label={sortDir === 'asc' ? t('sortAsc') : t('sortDesc')}
                title={sortDir === 'asc' ? t('sortAsc') : t('sortDesc')}
                onClick={() => setSortDir(sortDir === 'asc' ? 'desc' : 'asc')}
              >
                {sortDir === 'asc' ? <TrendingUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />}
              </Button>
            ) : null}
          </div>
        ) : null}
        <ul className="divide-y divide-line/70">
          {visible.map((row, i) => {
            const key = rowKey(row, i);
            const canOpen = expandable(row);
            const open = canOpen && expanded.has(key);
            return (
              <MobileRow
                key={key}
                row={row}
                index={i}
                columns={columns}
                onRowClick={onRowClick}
                detailsLabel={(n) => t('details', { n })}
                lessLabel={t('less')}
                expand={
                  canOpen
                    ? {
                        open,
                        label: toggleLabel(row, open),
                        onToggle: () => toggleExpanded(key),
                        content: open ? renderExpanded?.(row) : null,
                      }
                    : undefined
                }
              />
            );
          })}
        </ul>
        {footer ? (
          // Jami qatori: md:table-cell bilan yashirilgan kataklar telefonda ko'rinmaydi
          <div className="overflow-x-auto border-t border-line bg-surface-2/60">
            <table className="w-full border-collapse text-sm">
              <tbody>
                <tr className="font-semibold text-ink">{footer}</tr>
              </tbody>
            </table>
          </div>
        ) : null}
        {moreBar}
        {pager}
      </div>
    );
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
                  aria-sort={
                    c.sortable && sortKey === c.key ? (sortDir === 'asc' ? 'ascending' : 'descending') : undefined
                  }
                  className={cn(
                    'table-head border-b border-line',
                    cellPad,
                    c.align === 'right' && 'whitespace-nowrap text-right',
                    c.align === 'center' && 'whitespace-nowrap text-center',
                    !c.align && 'text-left',
                    hideClass(c),
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
                      {/* Tanlangan ustunda yo'nalish ko'rinadi — ilgari ikki tomonlama belgi doim bir xil edi */}
                      {sortKey === c.key ? (
                        <ArrowDown className={cn('h-3 w-3 transition-transform', sortDir === 'asc' && 'rotate-180')} />
                      ) : (
                        <ArrowUpDown className="h-3 w-3 opacity-60" />
                      )}
                    </button>
                  ) : (
                    c.header
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map((row, i) => {
              const key = rowKey(row, i);
              const canOpen = expandable(row);
              const open = canOpen && expanded.has(key);
              return (
                <Fragment key={key}>
                  <tr
                    onClick={onRowClick ? () => onRowClick(row) : undefined}
                    className={cn(
                      'group transition-colors',
                      // Ochiq qator ostidagi mazmun bilan bitta blok bo'lib ko'rinsin — orada chiziq yo'q
                      open ? 'bg-surface-2/40' : 'border-b border-line/60 last:border-0',
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
                          hideClass(c),
                          // group-hover: mahkamlangan ustun ham qator bilan birga yoritiladi
                          stickyFirstColumn && ci === 0 && 'sticky left-0 z-10 bg-surface group-hover:bg-surface-2',
                          // Bosiladigan qator: chap chetda brend chizig'i — "bu qator ochiladi" ishorasi
                          onRowClick && ci === 0 && 'group-hover:shadow-[inset_2px_0_0_rgb(var(--c-brand))]',
                          c.className,
                        )}
                      >
                        {ci === 0 && renderExpanded ? (
                          <div className="flex min-w-0 items-center gap-2">
                            {canOpen ? (
                              <ExpandToggle open={open} label={toggleLabel(row, open)} onToggle={() => toggleExpanded(key)} />
                            ) : (
                              // Ochilmaydigan qatorda ham joy qoladi — nomlar bir chiziqda tursin
                              <span aria-hidden className="w-6 shrink-0" />
                            )}
                            <div className="min-w-0 flex-1">{c.render(row, i)}</div>
                          </div>
                        ) : (
                          c.render(row, i)
                        )}
                      </td>
                    ))}
                  </tr>
                  {open ? (
                    <tr className="border-b border-line/60 bg-surface-2/40 last:border-0">
                      <td colSpan={columns.length} className="px-5 pb-4 pt-1">
                        {renderExpanded?.(row)}
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              );
            })}
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

      {moreBar}
      {pager}
    </div>
  );
}

/**
 * Telefondagi bitta qator — karta: tepada sarlavha ustuni, ostida "nom — qiymat"
 * juftlari ikki ustunda, `hideOnMobile` ustunlar "Batafsil" ostida, tugmalar pastda.
 * Ustunlarning o'z `render`i ishlatiladi — sahifalar kodi o'zgarmaydi.
 */
function MobileRow<T>({
  row,
  index,
  columns,
  onRowClick,
  detailsLabel,
  lessLabel,
  expand,
}: {
  row: T;
  index: number;
  columns: Column<T>[];
  onRowClick?: (row: T) => void;
  detailsLabel: (n: number) => string;
  lessLabel: string;
  /** `renderExpanded` berilgan jadvalda: ochish tugmasi va ochilgan mazmun */
  expand?: { open: boolean; label: string; onToggle: () => void; content: ReactNode };
}) {
  const [open, setOpen] = useState(false);
  const roles = mobileRoles(columns);
  const pick = (role: MobileRole | 'select') => columns.filter((_, ci) => roles[ci] === role);
  const selects = pick('select');
  const title = pick('title');
  const fields = pick('field');
  const details = pick('detail');
  const actions = pick('actions');

  const field = (c: Column<T>) => (
    <div key={c.key} className="min-w-0">
      <dt className="truncate text-2xs font-medium text-muted">{c.header}</dt>
      {/* Jadvalda o'ngga tekislangan qiymatlar kartada chapda turadi */}
      <dd className="mt-0.5 min-w-0 break-words text-sm text-ink-soft [&_.justify-end]:justify-start [&_.text-right]:text-left">
        {c.render(row, index)}
      </dd>
    </div>
  );

  const clickable = Boolean(onRowClick);
  return (
    <li
      role={clickable ? 'button' : undefined}
      tabIndex={clickable ? 0 : undefined}
      onClick={clickable ? () => onRowClick?.(row) : undefined}
      onKeyDown={
        clickable
          ? (e: KeyboardEvent) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onRowClick?.(row);
              }
            }
          : undefined
      }
      className={cn(
        'px-4 py-3.5',
        clickable &&
          'cursor-pointer transition-colors focus-visible:bg-surface-2/70 focus-visible:outline-none active:bg-surface-2/70',
      )}
    >
      <div className="flex items-start gap-3">
        {selects.map((c) => (
          // Katakcha bosilganda karta ochilib ketmasin
          <div key={c.key} className="shrink-0 pt-0.5" onClick={(e) => e.stopPropagation()}>
            {c.render(row, index)}
          </div>
        ))}
        {title.map((c) => (
          <div key={c.key} className="min-w-0 flex-1 text-sm text-ink">
            {c.render(row, index)}
          </div>
        ))}
      </div>
      {fields.length ? <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2.5">{fields.map(field)}</dl> : null}
      {details.length ? (
        <>
          {open ? <dl className="mt-2.5 grid grid-cols-2 gap-x-4 gap-y-2.5">{details.map(field)}</dl> : null}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setOpen((v) => !v);
            }}
            aria-expanded={open}
            className="mt-2.5 inline-flex items-center gap-1 rounded-md text-xs font-medium text-brand-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50"
          >
            {open ? lessLabel : detailsLabel(details.length)}
            <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', open && 'rotate-180')} />
          </button>
        </>
      ) : null}
      {expand ? (
        <div>
          <ExpandToggle open={expand.open} label={expand.label} onToggle={expand.onToggle} withText />
          {expand.open ? (
            // Ichidagi havola yoki tugma bosilganda karta (yon panel) ochilib ketmasin
            <div className="mt-2.5" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
              {expand.content}
            </div>
          ) : null}
        </div>
      ) : null}
      {actions.length ? (
        // Tugmalar bosilganda karta (qator) ochilib ketmasin
        <div className="mt-3 flex flex-wrap items-center gap-2" onClick={(e) => e.stopPropagation()}>
          {actions.map((c) => (
            <div key={c.key} className="[&_.justify-center]:justify-start [&_.justify-end]:justify-start">
              {c.render(row, index)}
            </div>
          ))}
        </div>
      ) : null}
    </li>
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

/** Monogram foni uchun grafik palitrasi — nomdan barqaror tanlanadi (bir mahsulot doim bir rangda) */
const MONOGRAM_TONES = ['--sc-1', '--sc-2', '--sc-3', '--sc-4', '--sc-5', '--sc-6', '--sc-7', '--sc-8'] as const;

function monogram(name: string): { letters: string; tone: string } {
  const words = name
    .split(/[\s\-–—/,.()]+/u)
    .map((w) => w.replace(/[^\p{L}\p{N}]/gu, ''))
    .filter(Boolean);
  // Raqam bilan boshlangan so'z ("400 ml") harf o'rniga olinmasin: "Shampun 400 ml" → "SM", "S4" emas
  const alpha = words.filter((w) => /^\p{L}/u.test(w));
  const pick = alpha.length > 0 ? alpha : words;
  const letters = (pick.length >= 2 ? `${pick[0]?.[0] ?? ''}${pick[1]?.[0] ?? ''}` : (pick[0] ?? '?').slice(0, 2))
    .toUpperCase();
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) hash = (hash * 31 + name.charCodeAt(i)) | 0;
  return { letters: letters || '?', tone: MONOGRAM_TONES[Math.abs(hash) % MONOGRAM_TONES.length] as string };
}

/**
 * Mahsulot rasmi. Rasm yo'q yoki havola eskirgan bo'lsa (Uzum CDN manzili
 * vaqt o'tib o'chadi) — nomning bosh harflari rangli fonda. Ilgari hamma
 * qatorda bir xil kulrang "Inbox" belgisi turardi, eskirgan havolada esa
 * brauzerning "singan rasm" belgisi chiqardi.
 */
export function ProductThumb({
  name,
  imageUrl,
  className,
  style,
}: {
  name: string;
  imageUrl?: string | null;
  className?: string;
  style?: CSSProperties;
}) {
  const [broken, setBroken] = useState(false);
  if (imageUrl && !broken) {
    return (
      <img
        src={imageUrl}
        alt=""
        className={cn('h-full w-full object-cover', className)}
        style={style}
        loading="lazy"
        onError={() => setBroken(true)}
      />
    );
  }
  const m = monogram(name);
  return (
    <div
      aria-hidden
      className={cn('flex h-full w-full select-none items-center justify-center font-display font-bold text-ink-soft', className)}
      style={{
        background: `rgb(var(${m.tone}) / 0.16)`,
        boxShadow: `inset 0 0 0 1px rgb(var(${m.tone}) / 0.28)`,
        ...style,
      }}
    >
      {m.letters}
    </div>
  );
}

/** Jadvaldagi mahsulot ustuni uchun yagona ko'rinish */
export function ProductCell({
  title,
  subtitle,
  imageUrl,
  size = 40,
  lines = 1,
  name,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  imageUrl?: string | null;
  size?: number;
  /**
   * Monogram uchun nom — `title` JSX bo'lsa majburiy. Aks holda monogram
   * izohdan (SKU kodi, do'kon) yasalib, hamma qatorda bir xil "SS" chiqardi.
   */
  name?: string;
  /**
   * 2 — uzun nom ikki qatorga bo'linadi. Avtomatik kenglikdagi jadvalda bir
   * qatorli `truncate` ishlamaydi: nom kesilmay, jadvalni 1366px dan kengaytirib
   * yuborardi.
   */
  lines?: 1 | 2;
}) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <div
        className="shrink-0 overflow-hidden rounded-lg border border-line bg-surface-2"
        style={{ width: size, height: size }}
      >
        <ProductThumb
          name={name ?? (typeof title === 'string' ? title : typeof subtitle === 'string' ? subtitle : '?')}
          imageUrl={imageUrl}
          style={{ fontSize: Math.round(size * 0.34) }}
        />
      </div>
      <div className="min-w-0">
        {/* Uzun nom kesiladi — to'liq nomi sichqoncha olib borilganda ko'rinadi */}
        <p
          className={cn(
            'text-sm font-medium text-ink',
            lines === 2 ? 'line-clamp-2 break-words leading-snug' : 'truncate',
          )}
          title={typeof title === 'string' ? title : undefined}
        >
          {title}
        </p>
        {subtitle ? (
          <p className="truncate text-xs text-muted" title={typeof subtitle === 'string' ? subtitle : undefined}>
            {subtitle}
          </p>
        ) : null}
      </div>
    </div>
  );
}
