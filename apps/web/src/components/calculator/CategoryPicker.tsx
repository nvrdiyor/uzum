import {
  memo,
  useCallback,
  useDeferredValue,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import { createPortal, flushSync } from 'react-dom';
import { useQuery } from '@tanstack/react-query';
import { Check, ChevronDown, Loader2, Search, X } from '@/components/icons';
import { registerNamespace, useFormat, useLang, useT } from '@/i18n';
import { cn } from '@/lib/utils';
import {
  categoryName,
  categoryPath,
  findCategory,
  highlightRanges,
  loadCommissionCategories,
  searchCategories,
  type CommissionCategory,
} from './commissions';

registerNamespace('categoryPicker', {
  uz: {
    placeholder: 'Kategoriyani tanlang yoki yozing',
    label: 'Uzum kategoriyasi',
    clear: 'Tanlovni olib tashlash',
    clearSearch: 'Qidiruvni tozalash',
    toggle: 'Ro‘yxatni ochish yoki yopish',
    loading: 'Kategoriyalar yuklanmoqda…',
    loadError: 'Ro‘yxat yuklanmadi',
    retry: 'Qayta urinish',
    'empty.title': 'Hech narsa topilmadi',
    'empty.hint': 'Ruscha yoki qisqaroq so‘z bilan urinib ko‘ring',
    'count.all': 'Jami {n} ta kategoriya',
    'count.found': '{n} ta topildi',
    rateKind: 'Uzumning yangi stavkasi',
    noRate: 'Uzum jadvalida bu kategoriya uchun stavka yo‘q — komissiyani qo‘lda yozasiz',
    'line.rate': 'Komissiya {pct} — Uzum jadvalidagi yangi stavka',
    'line.noRate': 'Uzum jadvalida bu kategoriya uchun stavka yo‘q — komissiyani qo‘lda yozing',
    'line.changed': 'Uzum jadvalida bu kategoriya stavkasi {pct}',
  },
  ru: {
    placeholder: 'Выберите или начните вводить',
    label: 'Категория Uzum',
    clear: 'Убрать выбор',
    clearSearch: 'Очистить поиск',
    toggle: 'Открыть или закрыть список',
    loading: 'Загружаем категории…',
    loadError: 'Список не загрузился',
    retry: 'Повторить',
    'empty.title': 'Ничего не найдено',
    'empty.hint': 'Попробуйте по-узбекски или слово покороче',
    'count.all': 'Всего категорий: {n}',
    'count.found': 'Найдено: {n}',
    rateKind: 'Новая ставка Uzum',
    noRate: 'В таблице Uzum нет ставки для этой категории — комиссию вы вводите сами',
    'line.rate': 'Комиссия {pct} — новая ставка из таблицы Uzum',
    'line.noRate': 'В таблице Uzum нет ставки для этой категории — введите комиссию вручную',
    'line.changed': 'В таблице Uzum ставка этой категории {pct}',
  },
  en: {
    placeholder: 'Pick a category or start typing',
    label: 'Uzum category',
    clear: 'Remove selection',
    clearSearch: 'Clear search',
    toggle: 'Open or close the list',
    loading: 'Loading categories…',
    loadError: 'The list did not load',
    retry: 'Retry',
    'empty.title': 'Nothing found',
    'empty.hint': 'Try Uzbek or Russian, or a shorter word',
    'count.all': '{n} categories in total',
    'count.found': '{n} found',
    rateKind: 'Uzum’s new rate',
    noRate: 'Uzum’s table has no rate for this category — you type the commission yourself',
    'line.rate': 'Commission {pct} — Uzum’s new rate',
    'line.noRate': 'Uzum’s table has no rate for this category — type the commission by hand',
    'line.changed': 'The Uzum table rate for this category is {pct}',
  },
});

/** Qator balandligi — ro'yxat aynan 5 qator ko'rsatadi, qolgani aylanadi */
const ROW_H = 52;
const VISIBLE_ROWS = 5;
/** Ko'rinadigan qatorlardan tashqari yuqori va pastda chiziladiganlar: tez aylantirganda bo'sh joy ko'rinmasin */
const OVERSCAN = 8;
const FOOTER_H = 30;
const PANEL_MIN_W = 340;
/** Telefon ekrani cheti */
const GUTTER = 16;
/** Maydon va ro'yxat orasidagi bo'shliq */
const GAP = 6;
/** Ro'yxat yuqori yoki pastki chetga yopishib qolmasligi uchun */
const EDGE = 8;
/** Telefon klaviaturasi ochilayotganda maydon bir zum ko'rinmay turadi — shu paytda ro'yxat yopilmaydi */
const KEYBOARD_MS = 600;
/** Qator ikki marta bosilganda ikkinchi bosish shu vaqt ichida yutiladi */
const DOUBLE_CLICK_MS = 400;

const NO_RESULTS: readonly CommissionCategory[] = [];

/**
 * Kategoriyalar ro'yxati: react-query orqali, shunda jadvaldagi 200 ta tanlagich
 * bitta yuklanishni bo'lishadi. `enabled` — bo'lak (~450 KB) faqat kerak bo'lganda:
 * ro'yxat ochilganda yoki tanlangan kategoriya nomini tilga moslash uchun.
 */
export function useCommissionCategories(enabled = true) {
  return useQuery({
    queryKey: ['commission-categories'],
    queryFn: loadCommissionCategories,
    enabled,
    staleTime: Infinity,
    gcTime: Infinity,
  });
}

/** Komissiya matni: "20,5%", "25%" — kerakli kasr bilan */
export function usePctText() {
  const f = useFormat();
  return (v: number) => f.pct(v, [0, 1, 2].find((d) => Math.abs(v * 10 ** d - Math.round(v * 10 ** d)) < 1e-6) ?? 2);
}

/** Matnda so'rovga mos qismni bo'yaydi */
function Marked({ text, query, className }: { text: string; query: string; className: string }) {
  const ranges = useMemo(() => highlightRanges(text, query), [text, query]);
  if (ranges.length === 0) return <>{text}</>;
  const parts = [];
  let at = 0;
  for (const [from, to] of ranges) {
    if (from > at) parts.push(text.slice(at, from));
    parts.push(
      <mark key={from} className={className}>
        {text.slice(from, to)}
      </mark>,
    );
    at = to;
  }
  if (at < text.length) parts.push(text.slice(at));
  return <>{parts}</>;
}

const NAME_MARK = 'rounded-[3px] bg-brand/20 text-inherit';
const PATH_MARK = 'bg-transparent font-semibold text-ink-soft';

const CategoryRow = memo(function CategoryRow({
  cat,
  index,
  total,
  optionId,
  name,
  path,
  query,
  active,
  selected,
  pctLabel,
  noRateHint,
  onHover,
  onChoose,
}: {
  cat: CommissionCategory;
  index: number;
  total: number;
  optionId: string;
  name: string;
  path: string;
  query: string;
  active: boolean;
  selected: boolean;
  pctLabel: string | null;
  noRateHint: string;
  onHover: (index: number) => void;
  onChoose: (cat: CommissionCategory) => void;
}) {
  return (
    <div
      id={optionId}
      role="option"
      aria-selected={selected}
      aria-posinset={index + 1}
      aria-setsize={total}
      title={`${name}\n${path}`}
      style={{ height: ROW_H }}
      // Brauzer ro'yxat aylanganda ham "sichqon yurdi" deydi — klaviatura bilan yurganda faol qator sakramasin
      onMouseMove={(e) => {
        if (e.movementX || e.movementY) onHover(index);
      }}
      onClick={() => onChoose(cat)}
      className={cn(
        'flex cursor-pointer items-center gap-3 border-b border-line/50 px-3 transition-colors duration-75 last:border-b-0',
        selected ? (active ? 'bg-brand/[0.14]' : 'bg-brand/[0.08]') : active && 'bg-surface-2',
        active && 'shadow-[inset_2px_0_0_rgb(var(--c-brand))]',
      )}
    >
      <div className="min-w-0 flex-1">
        <p className={cn('truncate text-sm leading-5', selected ? 'font-semibold text-brand-ink' : 'font-medium text-ink')}>
          <Marked text={name} query={query} className={NAME_MARK} />
        </p>
        <p className="truncate text-2xs text-muted">
          <Marked text={path} query={query} className={PATH_MARK} />
        </p>
      </div>
      {selected ? <Check className="h-4 w-4 shrink-0 text-brand-ink" /> : null}
      {pctLabel !== null ? (
        <span className="chip tnum shrink-0 bg-violet/10 px-2 py-0.5 font-semibold text-violet-ink">{pctLabel}</span>
      ) : (
        <span title={noRateHint} className="chip tnum shrink-0 bg-surface-3 px-2 py-0.5 text-muted">
          —
        </span>
      )}
    </div>
  );
});

export interface CategoryPickerValue {
  id: string | null;
  /** Bo'lak hali yuklanmagan yoki kalit eskirgan bo'lsa ko'rinadigan saqlangan nom */
  name: string | null;
}

/**
 * Uzum kategoriyasini tanlash: maydonga bosilganda ro'yxat ochiladi (5 qator,
 * qolgani aylanadi) va shu maydonning o'zida qidiriladi — Excel'dagi ochiluvchi
 * ro'yxat kabi, lekin 3 905 kategoriya orasidan o'zbekcha yoki ruscha yozib topiladi.
 * Tab yoki Enter bilan kelganda ro'yxat o'zi ochilmaydi (yozish yoki ↓ bilan ochiladi):
 * aks holda jadval bo'ylab yurishda har qatorda pastki kataklarni yopib turardi.
 *
 * Ro'yxat portal orqali `fixed` chiziladi: jadval gorizontal aylanadigan idish
 * ichida turadi va oddiy `absolute` ro'yxat uning chetida kesilib qolardi.
 */
export function CategoryPicker({
  value,
  onSelect,
  disabled,
  placeholder,
  compact,
  id,
  ariaLabel,
  cell,
  onKeyDown,
  className,
}: {
  value: CategoryPickerValue | null;
  onSelect: (category: CommissionCategory | null) => void;
  disabled?: boolean;
  placeholder?: string;
  /** Jadval katagi uchun: chegarasiz, katakni to'ldiradi */
  compact?: boolean;
  /** Tashqi <label htmlFor> uchun */
  id?: string;
  ariaLabel?: string;
  /** Jadvalda Enter bilan yurish uchun `data-cell` */
  cell?: string;
  /** Ro'yxat ishlatmagan tugmalar (yopiq holatda Enter) jadvalga qaytadi */
  onKeyDown?: (e: ReactKeyboardEvent<HTMLElement>) => void;
  className?: string;
}) {
  const t = useT('categoryPicker');
  const f = useFormat();
  const lang = useLang();
  const pctText = usePctText();
  const listboxId = useId();

  const anchorRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(-1);
  const [listTop, setListTop] = useState(0);
  const deferredQuery = useDeferredValue(query);

  const selectedId = value?.id ?? null;
  const categories = useCommissionCategories(open || Boolean(selectedId));
  const selected = categories.data && selectedId ? findCategory(categories.data, selectedId) : null;
  const selectedName = selected ? categoryName(selected, lang) : (value?.name ?? '');

  const results = useMemo(
    () => (open && categories.data ? searchCategories(categories.data, deferredQuery, lang) : NO_RESULTS),
    [open, categories.data, deferredQuery, lang],
  );

  // ── Joylashuv: to'g'ridan-to'g'ri DOM'ga, aylantirishda ro'yxat qayta chizilmasin ──
  const place = useCallback(() => {
    const anchor = anchorRef.current;
    const panel = panelRef.current;
    const list = listRef.current;
    if (!anchor || !panel) return;
    const rect = anchor.getBoundingClientRect();
    const docW = document.documentElement.clientWidth;
    const docH = document.documentElement.clientHeight;
    // Telefonda klaviatura ochilganda ko'rinadigan qism `visualViewport` da
    const viewport = window.visualViewport;
    const viewTop = viewport?.offsetTop ?? 0;
    const viewBottom = viewTop + (viewport?.height ?? docH);

    const width = Math.min(Math.max(rect.width, PANEL_MIN_W), docW - GUTTER * 2);
    const left = Math.max(GUTTER, Math.min(rect.left, docW - GUTTER - width));
    const fullHeight = ROW_H * VISIBLE_ROWS + FOOTER_H + 2;
    const roomBelow = viewBottom - rect.bottom - GAP - EDGE;
    const roomAbove = rect.top - viewTop - GAP - EDGE;
    const flip = roomBelow < fullHeight && roomAbove > roomBelow;
    const room = flip ? roomAbove : roomBelow;

    panel.style.left = `${left}px`;
    panel.style.width = `${width}px`;
    panel.style.top = flip ? 'auto' : `${rect.bottom + GAP}px`;
    panel.style.bottom = flip ? `${docH - rect.top + GAP}px` : 'auto';
    // Joy yetmasa (telefon klaviaturasi) ro'yxat qisqaradi, ekrandan chiqib ketmaydi
    const listHeight = Math.max(ROW_H * 2, Math.min(ROW_H * VISIBLE_ROWS, room - FOOTER_H - 2));
    if (list) list.style.maxHeight = `${listHeight}px`;
  }, []);

  useLayoutEffect(() => {
    if (open) place();
  }, [open, place]);

  const close = useCallback(() => {
    setOpen(false);
    setQuery('');
    setActive(-1);
    setListTop(0);
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    let frame = 0;
    const openedAt = performance.now();
    /** Maydon aylanib ketdi: ekrandan chiqdi yoki yopishqoq sarlavha, ustun, ilova paneli ostida qoldi */
    const anchorHidden = () => {
      const anchor = anchorRef.current;
      if (!anchor) return true;
      const rect = anchor.getBoundingClientRect();
      // Telefonda katak ekrandan keng — o'rtasi emas, ko'rinib turgan qismi tekshiriladi
      const left = Math.max(rect.left, 0);
      const right = Math.min(rect.right, document.documentElement.clientWidth);
      const y = rect.top + rect.height / 2;
      return ![left + 12, (left + right) / 2].some((x) => {
        const hit = document.elementFromPoint(x, y);
        return hit !== null && (anchor.contains(hit) || panelRef.current?.contains(hit));
      });
    };
    const schedule = (e: Event) => {
      // Ro'yxatning o'z aylanishi joylashuvga ta'sir qilmaydi
      if (e.target instanceof Node && panelRef.current?.contains(e.target)) return;
      const scrolled = e.type === 'scroll';
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        // Maydoni ko'rinmayotgan ro'yxat bo'shliqda (hatto yon menyu ustida) osilib qolardi.
        // O'lcham o'zgarishi hisob emas: telefon klaviaturasi maydonni bir zum yopishi mumkin
        if (scrolled && performance.now() - openedAt > KEYBOARD_MS && anchorHidden()) close();
        else place();
      });
    };
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (anchorRef.current?.contains(target) || panelRef.current?.contains(target)) return;
      close();
    };
    const viewport = window.visualViewport;
    // capture: jadval idishi va sahifa — har qanday aylanayotgan ota element
    window.addEventListener('scroll', schedule, true);
    window.addEventListener('resize', schedule);
    viewport?.addEventListener('resize', schedule);
    viewport?.addEventListener('scroll', schedule);
    document.addEventListener('pointerdown', onPointerDown, true);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', schedule, true);
      window.removeEventListener('resize', schedule);
      viewport?.removeEventListener('resize', schedule);
      viewport?.removeEventListener('scroll', schedule);
      document.removeEventListener('pointerdown', onPointerDown, true);
    };
  }, [open, place, close]);

  // ── Faol qatorni ko'rsatish ──
  /** 'nearest' — klaviatura bilan yurganda; 'center' — ochilganda tanlangan qator o'rtada */
  const pendingScroll = useRef<'nearest' | 'center' | null>(null);
  const scrollToRow = (index: number, mode: 'nearest' | 'center') => {
    const list = listRef.current;
    if (!list) return;
    // Qator balandligi qat'iy — hisoblash scrollIntoView dan aniqroq va sahifani qimirlatmaydi
    const top = index * ROW_H;
    const bottom = top + ROW_H;
    if (mode === 'center') list.scrollTop = top - (list.clientHeight - ROW_H) / 2;
    else if (top < list.scrollTop) list.scrollTop = top;
    else if (bottom > list.scrollTop + list.clientHeight) list.scrollTop = bottom - list.clientHeight;
    // Qatorlar shu qiymatdan chiziladi: aylanish hodisasini kutilsa, bir kadr bo'sh ro'yxat ko'rinardi
    setListTop(list.scrollTop);
  };
  useLayoutEffect(() => {
    const mode = pendingScroll.current;
    if (!mode || active < 0) return;
    pendingScroll.current = null;
    scrollToRow(active, mode);
  }, [active]);

  /*
   * Ochilganda tanlangan qator belgilangan va ko'rinib turadi.
   * Bo'lak hali yuklanmagan bo'lsa — yuklangach bir marta.
   */
  const revealedSelection = useRef(false);
  useLayoutEffect(() => {
    if (!open) {
      revealedSelection.current = false;
      return;
    }
    if (revealedSelection.current || !categories.data) return;
    revealedSelection.current = true;
    if (!selectedId || query) return;
    const index = results.findIndex((c) => c.id === selectedId);
    if (index < 0) return;
    pendingScroll.current = 'center';
    setActive(index);
  }, [open, categories.data, results, selectedId, query]);

  // ── Ochish, yopish, tanlash ──
  const openList = () => {
    if (disabled || open) return;
    setQuery('');
    setActive(-1);
    setListTop(0);
    setOpen(true);
  };

  /** Tanlangach yoki Esc dan keyin nom belgilanadi: yangi harf uning ustidan yozadi */
  const selectText = useRef(false);
  useLayoutEffect(() => {
    if (open || !selectText.current) return;
    selectText.current = false;
    const input = inputRef.current;
    // Telefonda belgilash menyusi ochilib qolmasin
    if (input && document.activeElement === input && !window.matchMedia?.('(pointer: coarse)').matches) input.select();
  }, [open]);

  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const selectedIdRef = useRef(selectedId);
  selectedIdRef.current = selectedId;
  const choose = useCallback(
    (cat: CommissionCategory) => {
      // Tanlangan qator qayta bosilsa hech narsa o'zgarmaydi: qo'lda yozilgan komissiya ustidan yozilmasin
      if (cat.id !== selectedIdRef.current) onSelectRef.current(cat);
      selectText.current = true;
      close();
    },
    [close],
  );

  /*
   * Ikki marta bosilganda ro'yxat birinchi bosishda yopiladi va ikkinchisi ostidagi
   * katakka tushib, boshqa qatorning ro'yxatini ochardi: u shaffof parda bilan yutiladi.
   */
  const [clickShield, setClickShield] = useState(false);
  useEffect(() => {
    if (!clickShield) return undefined;
    const timer = window.setTimeout(() => setClickShield(false), DOUBLE_CLICK_MS);
    return () => window.clearTimeout(timer);
  }, [clickShield]);
  const chooseByClick = useCallback(
    (cat: CommissionCategory) => {
      setClickShield(true);
      choose(cat);
    },
    [choose],
  );

  const onHover = useCallback((index: number) => setActive((cur) => (cur === index ? cur : index)), []);

  const onInput = (next: string, deleting: boolean) => {
    let typed = next;
    if (!open) {
      // Yopiq maydonda tanlangan nom turadi: o'chirish uni butunlay oladi, yozilgan harf unga qo'shilib ketmaydi
      if (deleting) typed = '';
      else if (selectedName && next.includes(selectedName)) typed = next.replace(selectedName, '');
      setOpen(true);
    }
    setQuery(typed);
    setActive(typed.trim() ? 0 : -1);
    setListTop(0);
    if (listRef.current) listRef.current.scrollTop = 0;
  };

  const move = (next: number) => {
    if (results.length === 0) return;
    const index = Math.max(0, Math.min(results.length - 1, next));
    // Qator o'sha, lekin yarim ko'rinib turgan bo'lishi mumkin: effekt bu holda ishlamaydi
    if (index === active) scrollToRow(index, 'nearest');
    else pendingScroll.current = 'nearest';
    setActive(index);
  };
  /** Faol qator yo'q (ro'yxat g'ildirak bilan aylantirilgan) — ko'rinib turgan birinchi qatordan davom etadi */
  const step = (delta: number) => {
    if (active >= 0) move(active + delta);
    else move(Math.ceil(listTop / ROW_H) + (Math.abs(delta) > 1 ? delta : 0));
  };

  const onKey = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (e.nativeEvent.isComposing) return;
    if (!open) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        openList();
        return;
      }
      onKeyDown?.(e);
      return;
    }
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        step(1);
        return;
      case 'ArrowUp':
        e.preventDefault();
        step(-1);
        return;
      case 'Home':
        e.preventDefault();
        move(0);
        return;
      case 'End':
        e.preventDefault();
        move(results.length - 1);
        return;
      case 'PageDown':
        e.preventDefault();
        step(VISIBLE_ROWS);
        return;
      case 'PageUp':
        e.preventDefault();
        step(-VISIBLE_ROWS);
        return;
      case 'Enter': {
        // Kechiktirilgan natija eskirgan bo'lishi mumkin — Enter yozilgan so'rov bo'yicha tanlaydi
        const fresh = query === deferredQuery || !categories.data ? results : searchCategories(categories.data, query, lang);
        const cat = active >= 0 ? fresh[active] : undefined;
        if (cat) {
          e.preventDefault();
          choose(cat);
          return;
        }
        // Hech narsa faol emas: ro'yxat yopiladi, jadvalda Enter keyingi qatorga o'tadi
        close();
        onKeyDown?.(e);
        return;
      }
      case 'Escape':
        e.preventDefault();
        e.stopPropagation();
        selectText.current = true;
        close();
        return;
      case 'Tab':
        close();
        return;
      default:
    }
  };

  const onListScroll = () => {
    const list = listRef.current;
    if (!list) return;
    const top = list.scrollTop;
    // Darhol, kadr chizilishidan oldin: aks holda tez aylantirganda bo'sh joy ko'rinib qolardi
    flushSync(() => {
      setListTop(top);
      // G'ildirak bilan aylantirilganda faol qator ekrandan chiqadi: Enter ko'rinmayotgan qatorni tanlab yubormasin
      setActive((cur) => (cur >= 0 && (cur * ROW_H + ROW_H <= top || cur * ROW_H >= top + list.clientHeight) ? -1 : cur));
    });
  };

  /*
   * Faqat ko'rinib turgan qatorlar chiziladi (balandligi qat'iy, joyi hisoblanadi):
   * 3 905 ta qator birdan chizilsa, ro'yxat ochilishi telefonda bir necha soniya qotardi.
   */
  const firstRow = Math.max(0, Math.floor(listTop / ROW_H) - OVERSCAN);
  const visible = results.slice(firstRow, firstRow + VISIBLE_ROWS + OVERSCAN * 2 + 1);
  const activeCat = active >= 0 ? results[active] : undefined;
  const optionId = (cat: CommissionCategory) => `${listboxId}-${cat.id}`;
  const canClear = !disabled && (open ? Boolean(query) || Boolean(selectedId) : Boolean(selectedId));

  /*
   * Qator matnlari keshda: Intl.NumberFormat qimmat, aylantirganda esa har kadrda
   * yangi qatorlar chiziladi.
   */
  const labels = useMemo(() => new Map<string, { name: string; path: string; pct: string | null }>(), [lang]);
  const labelOf = (cat: CommissionCategory) => {
    let label = labels.get(cat.id);
    if (!label) {
      label = {
        name: categoryName(cat, lang),
        path: categoryPath(cat, lang),
        pct: cat.pct === null ? null : pctText(cat.pct),
      };
      labels.set(cat.id, label);
    }
    return label;
  };

  const panel = open ? (
    <div
      ref={panelRef}
      // Fokus maydonda qoladi: bosilganda klaviatura va yozilgan so'rov yo'qolmasin
      onMouseDown={(e) => e.preventDefault()}
      className="fixed z-[120] animate-fade-up overflow-hidden rounded-xl border border-line bg-surface shadow-pop"
    >
      {categories.isError ? (
        <div className="flex flex-col items-center gap-2 px-4 py-6 text-center">
          <p className="text-sm font-medium text-ink">{t('loadError')}</p>
          <button
            type="button"
            onClick={() => void categories.refetch()}
            className="focusable rounded-lg text-xs font-semibold text-brand-ink hover:underline"
          >
            {t('retry')}
          </button>
        </div>
      ) : !categories.data ? (
        <div className="flex items-center justify-center gap-2 px-4 py-8 text-sm text-muted" role="status">
          <Loader2 className="h-4 w-4 animate-spin" />
          {t('loading')}
        </div>
      ) : null}
      <div
        ref={listRef}
        id={listboxId}
        role="listbox"
        aria-label={ariaLabel ?? t('label')}
        aria-busy={query !== deferredQuery}
        onScroll={onListScroll}
        // overflow-anchor: qatorlar almashganda brauzer aylanish joyini "to'g'rilab", ro'yxatni orqaga tortardi
        className={cn('overflow-y-auto overscroll-contain [overflow-anchor:none]', !categories.data && 'hidden')}
      >
        <div role="presentation" style={{ height: results.length * ROW_H, paddingTop: firstRow * ROW_H }}>
          {visible.map((cat, i) => {
            const label = labelOf(cat);
            const index = firstRow + i;
            return (
              <CategoryRow
                key={cat.id}
                cat={cat}
                index={index}
                total={results.length}
                optionId={optionId(cat)}
                name={label.name}
                path={label.path}
                query={deferredQuery}
                active={index === active}
                selected={cat.id === selectedId}
                pctLabel={label.pct}
                noRateHint={t('noRate')}
                onHover={onHover}
                onChoose={chooseByClick}
              />
            );
          })}
        </div>
      </div>
      {categories.data && results.length === 0 ? (
        <div className="flex flex-col items-center px-4 py-7 text-center">
          <span className="mb-2.5 flex h-10 w-10 items-center justify-center rounded-xl bg-surface-2 text-muted">
            <Search className="h-5 w-5" />
          </span>
          <p className="text-sm font-semibold text-ink">{t('empty.title')}</p>
          <p className="mt-0.5 text-xs text-muted">{t('empty.hint')}</p>
        </div>
      ) : null}
      {categories.data && results.length > 0 ? (
        <div
          style={{ height: FOOTER_H }}
          className="flex items-center justify-between gap-3 border-t border-line bg-surface-2/70 px-3 text-2xs text-muted"
        >
          <span className="tnum shrink-0" aria-live="polite">
            {t(deferredQuery.trim() ? 'count.found' : 'count.all', { n: f.num(results.length) })}
          </span>
          <span className="truncate">{t('rateKind')}</span>
        </div>
      ) : null}
    </div>
  ) : null;

  return (
    <div ref={anchorRef} className={cn('relative', compact && 'h-full', className)}>
      <Search
        className={cn(
          'pointer-events-none absolute top-1/2 -translate-y-1/2 text-muted',
          compact ? 'left-2.5 h-3.5 w-3.5' : 'left-3 h-4 w-4',
        )}
      />
      <input
        ref={inputRef}
        id={id}
        data-cell={cell}
        type="text"
        role="combobox"
        autoComplete="off"
        spellCheck={false}
        aria-label={ariaLabel ?? (id ? undefined : t('label'))}
        aria-autocomplete="list"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        aria-activedescendant={open && activeCat ? optionId(activeCat) : undefined}
        disabled={disabled}
        value={open ? query : selectedName}
        placeholder={open ? selectedName || placeholder || t('placeholder') : (placeholder ?? t('placeholder'))}
        title={!open && selected ? `${selectedName}\n${categoryPath(selected, lang)}` : !open && selectedName ? selectedName : undefined}
        onFocus={(e) => {
          // Klaviatura bilan kelindi: nom belgilanadi, yangi harf uning ustidan yozadi. Telefonda belgilash menyusi ochilmasin
          if (!open && !window.matchMedia?.('(pointer: coarse)').matches) e.currentTarget.select();
        }}
        onClick={openList}
        onBlur={(e) => {
          // Fokus boshqa maydonga o'tdi (Enter bilan yurish). Bosish `pointerdown` da yopiladi
          const next = e.relatedTarget;
          if (next instanceof Node && !panelRef.current?.contains(next)) close();
        }}
        onChange={(e) => onInput(e.target.value, (e.nativeEvent as InputEvent).inputType?.startsWith('delete') ?? false)}
        onKeyDown={onKey}
        className={cn(
          compact
            ? 'h-full w-full min-w-0 truncate bg-transparent py-2.5 pl-8 text-sm text-ink outline-none placeholder:text-muted/60 focus:bg-surface focus:ring-2 focus:ring-inset focus:ring-brand/40 disabled:cursor-default'
            : 'input truncate pl-9 disabled:cursor-default disabled:opacity-70',
          canClear ? (compact ? 'pr-14' : 'pr-16') : compact ? 'pr-8' : 'pr-10',
          open && !compact && 'border-brand/60 ring-2 ring-brand/20',
          !open && selectedName && 'font-medium',
        )}
      />
      {disabled ? null : (
        <div className={cn('absolute inset-y-0 flex items-center', compact ? 'right-1' : 'right-1.5')}>
          {canClear ? (
            <button
              type="button"
              tabIndex={-1}
              aria-label={open && query ? t('clearSearch') : t('clear')}
              title={open && query ? t('clearSearch') : t('clear')}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                if (open && query) {
                  setQuery('');
                  setActive(-1);
                  setListTop(0);
                  if (listRef.current) listRef.current.scrollTop = 0;
                } else {
                  onSelect(null);
                }
              }}
              className="focusable rounded-md p-1 text-muted hover:text-ink"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          ) : null}
          <button
            type="button"
            tabIndex={-1}
            aria-label={t('toggle')}
            title={t('toggle')}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              if (open) {
                close();
                return;
              }
              inputRef.current?.focus();
              openList();
            }}
            className="focusable rounded-md p-1 text-muted hover:text-ink"
          >
            <ChevronDown className={cn('h-3.5 w-3.5 transition-transform duration-150', open && 'rotate-180')} />
          </button>
        </div>
      )}
      {panel ? createPortal(panel, document.body) : null}
      {clickShield
        ? createPortal(<div aria-hidden className="fixed inset-0 z-[120]" onMouseDown={(e) => e.preventDefault()} />, document.body)
        : null}
    </div>
  );
}

/**
 * Tanlagich ostidagi qator: tanlangan kategoriya stavkasi komissiya maydoni bilan
 * qanday bog'liq. Stavka qo'yilgan — brend rangida; jadvalda stavka yo'q —
 * ogohlantirish; sotuvchi raqamni o'zgartirgan — xira eslatma.
 */
export function CategoryRateLine({
  category,
  commissionPct,
  className,
}: {
  category: CommissionCategory | null;
  commissionPct: number | null;
  className?: string;
}) {
  const t = useT('categoryPicker');
  const pctText = usePctText();
  if (!category) return null;
  const base = 'tnum text-xs leading-relaxed';
  if (category.pct === null) return <p className={cn(base, 'text-warn-ink', className)}>{t('line.noRate')}</p>;
  if (commissionPct !== category.pct) {
    return <p className={cn(base, 'text-muted', className)}>{t('line.changed', { pct: pctText(category.pct) })}</p>;
  }
  return <p className={cn(base, 'font-medium text-brand-ink', className)}>{t('line.rate', { pct: pctText(category.pct) })}</p>;
}
