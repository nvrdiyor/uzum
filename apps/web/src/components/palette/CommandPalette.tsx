import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { motion, useReducedMotion } from 'framer-motion';
import { getPlan, presetPeriod, type FeatureAccess, type ProductsResponse } from '@savdoiq/shared';
import {
  CalendarRange,
  Check,
  CornerDownLeft,
  Globe,
  Loader2,
  Lock,
  Moon,
  PanelLeftClose,
  PartyPopper,
  Search,
  Store,
  Sun,
  X,
  type AppIcon,
} from '@/components/icons';
import { ProductThumb } from '@/components/ui';
import { NAV } from '@/lib/nav';
import { useView } from '@/lib/view';
import { viewAllowsPage, viewAllowsSettings, type ViewSettingsSection } from '@savdoiq/shared';
import { api, ApiError } from '@/lib/api';
import { prefetchPage } from '@/lib/lazyPage';
import { cn } from '@/lib/utils';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { useUi } from '@/store/ui';
import { useNews } from '@/components/news/store';
import { usePlan, useSession, useStores } from '@/store/session';
import { translate, useFormat, useLangStore, useT, type Lang } from '@/i18n';
import { ACTION_SYNONYMS, LANG_NAMES, LANG_SYNONYMS, PAGE_SYNONYMS, PERIOD_PRESETS, SETTINGS_SECTIONS } from './catalog';
import { highlightRanges, prepareFields, queryVariants, rank, type Match, type PreparedFields } from './search';
import { pushRecent, readRecent, type RecentEntry } from './recent';
import { isMacLike } from './PaletteTrigger';
import './i18n';

const LANGS: Lang[] = ['uz', 'ru', 'en'];
/** PageUp / PageDown qadami */
const PAGE_STEP = 8;
const MAX_PAGES = 12;
const MAX_ACTIONS = 8;
const MAX_PRODUCTS = 6;

export interface CommandPaletteProps {
  onClose: () => void;
}

interface Entry {
  key: string;
  kind: 'page' | 'action' | 'product';
  label: string;
  hint: string;
  icon?: AppIcon;
  thumb?: { name: string; url: string | null };
  /** Ilova ichidagi manzil — bor bo‘lsa, tanlash = o‘tish (Ctrl ↵ — yangi oynada) */
  href?: string;
  run?: () => void;
  /** Tarif qulfi: sahifa baribir ochiladi (u yerda PlanGate tushuntiradi), faqat belgi */
  lock?: Exclude<FeatureAccess, 'full'>;
  badge?: 'new' | 'beta';
  /** Tanlangan holat (davr, do‘kon) */
  selected?: boolean;
  /** Bajarib bo‘lmaydi — tarif tarixidan uzun davr */
  disabled?: boolean;
  stock?: number;
  archived?: boolean;
  /** Mahsulot tanlanganda so‘nggilarga yoziladigan yozuv */
  recent?: RecentEntry;
  /** Bo‘sh oynada qaysi menyu guruhida turadi */
  groupKey?: string;
  search?: PreparedFields;
}

interface Section {
  key: string;
  title: string;
  items: Array<{ entry: Entry; match?: Match }>;
  loading?: boolean;
  error?: string;
}

interface Option {
  key: string;
  entry: Entry;
  match?: Match;
}

function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded-md border border-line bg-surface px-1 font-sans text-[10px] font-semibold leading-none text-ink-soft shadow-[0_1px_0_rgb(var(--c-border))]">
      {children}
    </kbd>
  );
}

function Highlighted({ text, ranges }: { text: string; ranges: Array<[number, number]> }) {
  if (!ranges.length) return <>{text}</>;
  const parts: ReactNode[] = [];
  let at = 0;
  ranges.forEach(([s, e]) => {
    if (s > at) parts.push(text.slice(at, s));
    parts.push(
      <mark key={s} className="rounded-[3px] bg-brand/15 px-px text-inherit">
        {text.slice(s, e)}
      </mark>,
    );
    at = e;
  });
  if (at < text.length) parts.push(text.slice(at));
  return <>{parts}</>;
}

/**
 * "Sahifaga o‘tish" oynasi — Ctrl K / ⌘K, "/" yoki yuqori paneldagi qidiruv
 * tugmasi bilan ochiladi (PaletteHost).
 *
 * Nima uchun kerak (2026-10-24): 35 dan ortiq sahifa bor, 768 px balandlikdagi
 * ekranda yon menyu sig‘maydi va pastdagi bo‘limlarga aylantirib yetish kerak.
 * Endi sahifa nomini (uch tilning istalganida, sinonim bilan) yoki mahsulot
 * nomi / SKU ni yozib, Enter bosiladi.
 *
 * ARIA: kiritish maydoni — combobox, ro‘yxat — listbox (guruhlar bilan).
 * Fokus doim maydonda qoladi, faol qator `aria-activedescendant` orqali
 * bildiriladi — ekran o‘quvchi har strelkada qator nomini o‘qiydi.
 */
export function CommandPalette({ onClose }: CommandPaletteProps) {
  const t = useT('palette');
  const f = useFormat();
  const lang = f.lang;
  const navigate = useNavigate();
  const { pathname, hash } = useLocation();
  const reduceMotion = useReducedMotion();
  const wideScreen = useMediaQuery('(min-width: 1024px)', true);
  const coarse = useMediaQuery('(pointer: coarse)', false);

  const features = useSession((s) => s.me?.features);
  // Ko'rinish shablonida yopiq sahifa va Sozlamalar bo'limi oynada ham chiqmaydi (yon menyu bilan bir xil)
  const view = useView();
  const plan = usePlan();
  const stores = useStores();
  const theme = useUi((s) => s.theme);
  const toggleTheme = useUi((s) => s.toggleTheme);
  const rail = useUi((s) => s.rail);
  const toggleRail = useUi((s) => s.toggleRail);
  const preset = useUi((s) => s.preset);
  const setPreset = useUi((s) => s.setPreset);
  const period = useUi((s) => s.period);
  const storeId = useUi((s) => s.storeId);
  const setStoreId = useUi((s) => s.setStoreId);
  const setLang = useLangStore((s) => s.setLang);

  const [query, setQuery] = useState('');
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [recent] = useState(readRecent);
  const navVia = useRef<'key' | 'mouse'>('key');

  const panelRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const baseId = useId();
  const listId = `${baseId}-list`;
  const optionId = (i: number) => `${baseId}-o${i}`;

  const trimmed = query.trim();
  const here = pathname === '/settings' && hash ? `${pathname}${hash}` : pathname;
  const others = <T,>(fn: (l: Lang) => T): T[] => LANGS.filter((l) => l !== lang).map(fn);

  // ─────────────── Sahifalar: menyudan, qulf qoidasi yon menyu bilan bir xil ───────────────
  const pages = useMemo(() => {
    const list: Entry[] = [];
    for (const group of NAV) {
      const groupNames = LANGS.map((l) => translate('common', group.titleKey, l));
      const groupTitle = translate('common', group.titleKey, lang);
      for (const item of group.items) {
        if (!viewAllowsPage(view, item.to)) continue;
        const label = translate('common', item.labelKey, lang);
        const access: FeatureAccess = item.feature ? (features?.[item.feature] ?? 'off') : 'full';
        list.push({
          key: `page:${item.to}`,
          kind: 'page',
          label,
          hint: groupTitle,
          icon: item.icon,
          href: item.to,
          lock: access === 'full' ? undefined : access,
          badge: item.badge,
          groupKey: group.titleKey,
          search: prepareFields({
            label,
            other: LANGS.filter((l) => l !== lang).map((l) => translate('common', item.labelKey, l)),
            syn: PAGE_SYNONYMS[item.to],
            group: groupNames,
          }),
        });
      }
    }
    return list;
  }, [lang, features, view]);

  const settingsSections = useMemo(() => {
    const settingsTitle = translate('common', 'nav.settings', lang);
    const settingsNames = LANGS.map((l) => translate('common', 'nav.settings', l));
    const visible = SETTINGS_SECTIONS.filter(({ id }) => viewAllowsSettings(view, id as ViewSettingsSection));
    return visible.map(({ id, icon, syn }): Entry => {
      const label = translate('palette', `section.${id}`, lang);
      return {
        key: `set:${id}`,
        kind: 'page',
        label,
        hint: settingsTitle,
        icon,
        href: `/settings#${id}`,
        search: prepareFields({
          label,
          other: LANGS.filter((l) => l !== lang).map((l) => translate('palette', `section.${id}`, l)),
          syn,
          group: settingsNames,
        }),
      };
    });
  }, [lang, view]);

  // ─────────────── Tez amallar — faqat ilovada allaqachon bor holat/funksiyalar ───────────────
  const quick = useMemo(() => {
    const list: Entry[] = [];
    const themeKey = theme === 'dark' ? 'action.themeLight' : 'action.themeDark';
    list.push({
      key: 'act:theme',
      kind: 'action',
      label: t(themeKey),
      hint: t('action.themeHint', { name: t(theme === 'dark' ? 'theme.dark' : 'theme.light') }),
      icon: theme === 'dark' ? Sun : Moon,
      run: toggleTheme,
      search: prepareFields({
        label: t(themeKey),
        other: others((l) => translate('palette', themeKey, l)),
        syn: ACTION_SYNONYMS.theme,
      }),
    });
    for (const l of LANGS) {
      if (l === lang) continue;
      const vars = { name: LANG_NAMES[l] };
      list.push({
        key: `act:lang:${l}`,
        kind: 'action',
        label: t('action.lang', vars),
        hint: t('action.langHint'),
        icon: Globe,
        run: () => setLang(l),
        search: prepareFields({
          label: t('action.lang', vars),
          other: others((x) => translate('palette', 'action.lang', x, vars)),
          syn: [...ACTION_SYNONYMS.lang, ...LANG_SYNONYMS[l]],
        }),
      });
    }
    /*
     * "Yangiliklar" oynasi — o‘zi bir marta chiqadi, keyin shu yerdan va profil
     * menyusidan qayta ochiladi (components/news, 2026-10-27). Bu oyna avval
     * yopiladi (activate → onClose), keyin u ochiladi — ikkalasi ustma-ust turmaydi.
     */
    list.push({
      key: 'act:news',
      kind: 'action',
      label: t('action.news'),
      hint: t('action.newsHint'),
      icon: PartyPopper,
      run: () => useNews.getState().setOpen(true),
      search: prepareFields({
        label: t('action.news'),
        other: others((l) => translate('palette', 'action.news', l)),
        syn: ACTION_SYNONYMS.news,
      }),
    });
    // Yig‘iladigan yon menyu faqat keng ekranda bor — telefonda bu amal hech narsa qilmasdi
    if (wideScreen) {
      const railKey = rail ? 'action.railExpand' : 'action.railCollapse';
      list.push({
        key: 'act:rail',
        kind: 'action',
        label: t(railKey),
        hint: t('action.railHint'),
        icon: PanelLeftClose,
        run: toggleRail,
        search: prepareFields({
          label: t(railKey),
          other: others((l) => translate('palette', railKey, l)),
          syn: ACTION_SYNONYMS.rail,
        }),
      });
    }
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang, theme, rail, wideScreen, t, toggleTheme, toggleRail, setLang]);

  /*
   * Davr presetlari — yuqori paneldagi tanlagich bilan bir xil qoida: tarif
   * tarixidan uzun davr tanlanmaydi (server baribir jim qisqartirardi).
   * Ko‘rinadi, lekin qulf belgisi va sababi bilan.
   */
  const historyDays = getPlan(plan).limits.historyDays;
  const periods = useMemo(
    () =>
      PERIOD_PRESETS.map((p): Entry => {
        const name = (l: Lang) => translate('periodPicker', `period.${p}`, l);
        const { from, to } = presetPeriod(p);
        const span = Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000) + 1;
        const locked = span > historyDays;
        const label = t('action.period', { name: name(lang) });
        return {
          key: `per:${p}`,
          kind: 'action',
          label,
          hint: locked ? t('period.limit', { n: historyDays }) : t('action.periodHint'),
          icon: CalendarRange,
          run: () => setPreset(p),
          disabled: locked,
          lock: locked ? 'off' : undefined,
          selected: preset === p,
          search: prepareFields({
            label,
            other: others((l) => translate('palette', 'action.period', l, { name: name(l) })),
            syn: ACTION_SYNONYMS.period,
          }),
        };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lang, t, historyDays, preset, setPreset],
  );

  // Do‘kon almashtirish — bitta do‘konda ma’nosi yo‘q
  const storeActions = useMemo(() => {
    if (stores.length < 2) return [] as Entry[];
    const allLabel = t('common.allStores');
    const list: Entry[] = [
      {
        key: 'store:all',
        kind: 'action',
        label: allLabel,
        hint: t('action.storeHint'),
        icon: Store,
        run: () => setStoreId('all'),
        selected: storeId === 'all',
        search: prepareFields({
          label: allLabel,
          other: others((l) => translate('common', 'common.allStores', l)),
          syn: ACTION_SYNONYMS.store,
        }),
      },
    ];
    for (const s of stores) {
      const vars = { name: s.title };
      list.push({
        key: `store:${s.id}`,
        kind: 'action',
        label: t('action.store', vars),
        hint: t('action.storeHint'),
        icon: Store,
        run: () => setStoreId(s.id),
        selected: storeId === s.id,
        search: prepareFields({
          label: t('action.store', vars),
          other: others((l) => translate('palette', 'action.store', l, vars)),
          syn: [...ACTION_SYNONYMS.store, s.title],
        }),
      });
    }
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stores, storeId, lang, t, setStoreId]);

  // ─────────────── So‘nggi ochilganlar (joriy sahifasiz) ───────────────
  const recentEntries = useMemo(() => {
    const byHref = new Map<string, Entry>();
    for (const e of [...pages, ...settingsSections]) if (e.href) byHref.set(e.href, e);
    const out: Entry[] = [];
    for (const r of recent) {
      if (r.to === pathname || r.to === here) continue;
      const known = byHref.get(r.to);
      if (known) out.push(known);
      else if (r.to.startsWith('/products/') && r.title) {
        out.push({
          key: `prod:${r.to}`,
          kind: 'product',
          label: r.title,
          hint: t('product.hint'),
          thumb: { name: r.title, url: r.img ?? null },
          href: r.to,
          recent: r,
        });
      }
      if (out.length >= 5) break;
    }
    return out;
  }, [recent, pages, settingsSections, pathname, here, t]);

  // ─────────────── Qidiruv ───────────────
  const variants = useMemo(() => queryVariants(trimmed), [trimmed]);
  const searching = variants.primary.length > 0;
  const searchable = useMemo(
    () => [...pages, ...settingsSections, ...quick, ...periods, ...storeActions],
    [pages, settingsSections, quick, periods, storeActions],
  );
  const hits = useMemo(() => {
    if (!searching) return [];
    const primary = rank(searchable, variants.primary);
    if ((primary[0]?.match.score ?? 0) >= 50 || !variants.swapped) return primary;
    return rank(searchable, [...variants.primary, variants.swapped]);
  }, [searching, searchable, variants]);

  /*
   * Mahsulotlar — mavjud GET /products (nomi, SKU, ID bo‘yicha qidiruv serverda).
   * 250 ms kutiladi: har harfga og‘ir so‘rov ketmasin. Do‘kon filtri ATAYLAB
   * berilmaydi — oyna "qayerda bo‘lsa ham top" uchun, mahsulot sahifasi esa
   * barcha do‘konlar bo‘yicha ochiladi. Tarifda bo‘lim yopiq bo‘lsa so‘rov
   * umuman yuborilmaydi (server 402 qaytarardi).
   */
  const productAccess: FeatureAccess = features?.products_assortment ?? 'off';
  const canSearchProducts = productAccess === 'full';
  const [debounced, setDebounced] = useState('');
  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(trimmed), 250);
    return () => window.clearTimeout(id);
  }, [trimmed]);
  const productQ = canSearchProducts && debounced.length >= 2 ? debounced : '';
  const products = useQuery({
    queryKey: ['palette-products', productQ, period.from, period.to],
    queryFn: ({ signal }) =>
      api.get<ProductsResponse>(
        '/products',
        { search: productQ, pageSize: MAX_PRODUCTS, from: period.from, to: period.to },
        signal,
      ),
    enabled: productQ !== '',
    staleTime: 60_000,
    retry: false,
    // Yangi so‘rov kelguncha eski natija turadi — ro‘yxat har harfda yo‘qolib-paydo bo‘lmasin
    placeholderData: keepPreviousData,
  });
  const showProducts = canSearchProducts && trimmed.length >= 2;
  const productPending = showProducts && (debounced !== trimmed || products.isFetching);
  const productError =
    showProducts && products.isError && !(products.error instanceof ApiError && products.error.isPlanLimit);

  const productEntries = useMemo(() => {
    if (!showProducts || !productQ) return [] as Entry[];
    const needle = trimmed.toLowerCase();
    return (products.data?.items.items ?? []).slice(0, MAX_PRODUCTS).map((p): Entry => {
      // SKU bo‘yicha qidirilgan bo‘lsa — aynan o‘sha SKU ko‘rsatiladi
      const sku = p.skus.find((s) => s.sku.toLowerCase().includes(needle))?.sku ?? p.skus[0]?.sku;
      const href = `/products/${p.id}`;
      return {
        key: `prod:${href}`,
        kind: 'product',
        label: p.title,
        hint: [sku, p.category].filter(Boolean).join(' · ') || t('product.hint'),
        thumb: { name: p.title, url: p.imageUrl },
        href,
        stock: p.stockFbo + p.stockFbs + p.stockOwn,
        archived: p.status === 'archived',
        recent: { to: href, title: p.title, img: p.imageUrl },
      };
    });
  }, [showProducts, productQ, trimmed, products.data, t]);

  // ─────────────── Bo‘limlar ───────────────
  const sections = useMemo((): Section[] => {
    if (!searching) {
      const out: Section[] = [];
      if (recentEntries.length) {
        out.push({ key: 'recent', title: t('sec.recent'), items: recentEntries.map((entry) => ({ entry })) });
      }
      out.push({ key: 'quick', title: t('sec.quick'), items: quick.map((entry) => ({ entry })) });
      // Butun menyu guruhlari bilan — kichik ekranda yon menyuning o‘rnini bosadi
      for (const group of NAV) {
        const items = pages.filter((p) => p.groupKey === group.titleKey).map((entry) => ({ entry }));
        if (items.length) out.push({ key: `nav:${group.titleKey}`, title: translate('common', group.titleKey, lang), items });
      }
      return out;
    }
    const out: Section[] = [];
    const pageHits = hits.filter((h) => h.item.kind === 'page').slice(0, MAX_PAGES);
    const actionHits = hits.filter((h) => h.item.kind === 'action').slice(0, MAX_ACTIONS);
    const pageSection: Section = {
      key: 'pages',
      title: t('sec.pages'),
      items: pageHits.map((h) => ({ entry: h.item, match: h.match })),
    };
    const actionSection: Section = {
      key: 'actions',
      title: t('sec.actions'),
      items: actionHits.map((h) => ({ entry: h.item, match: h.match })),
    };
    /*
     * Qaysi guruh birinchi — eng yaxshi moslikka qarab: "русский" yoki "7 kun"
     * da Enter amalni bajarsin, bo‘lim nomidagi tasodifiy moslikni emas.
     * Teng bo‘lsa sahifalar oldinda.
     */
    const actionsFirst = (actionHits[0]?.match.score ?? 0) > (pageHits[0]?.match.score ?? 0);
    for (const s of actionsFirst ? [actionSection, pageSection] : [pageSection, actionSection]) {
      if (s.items.length) out.push(s);
    }
    /*
     * Mahsulotlar ATAYLAB oxirida: ular kechroq keladi va yuqorida tursa,
     * foydalanuvchi ko‘rib turgan sahifa natijalarini pastga surib yuborardi.
     */
    if (productEntries.length || productError) {
      out.push({
        key: 'products',
        title: t('sec.products'),
        items: productEntries.map((entry) => ({ entry })),
        loading: products.isFetching,
        error: productError ? t('products.error') : undefined,
      });
    }
    return out;
  }, [searching, recentEntries, quick, pages, lang, hits, productEntries, productError, products.isFetching, t]);

  const options = useMemo(
    (): Option[] =>
      sections.flatMap((s) => s.items.map(({ entry, match }) => ({ key: `${s.key}|${entry.key}`, entry, match }))),
    [sections],
  );
  const activeIndex = useMemo(() => {
    if (!options.length) return -1;
    const i = activeKey ? options.findIndex((o) => o.key === activeKey) : -1;
    // Faol qator ro‘yxatdan chiqib ketgan bo‘lsa — eng yaxshi moslik (birinchi qator)
    return i >= 0 ? i : 0;
  }, [options, activeKey]);
  const active = activeIndex >= 0 ? options[activeIndex] : undefined;
  const indexOf = useMemo(() => new Map(options.map((o, i) => [o.key, i])), [options]);

  // ─────────────── Ochilish: fokus, sahifa aylanmasin, yopilganda fokus qaytsin ───────────────
  useLayoutEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const body = document.body;
    const prevOverflow = body.style.overflow;
    const prevPadding = body.style.paddingRight;
    /*
     * Aylantirish chizig‘i yo‘qolganda sahifa o‘ngga "sakramasin": uning
     * kengligi o‘ng chekkaga qo‘shiladi (ui/Modal'da bu tuzatish yo‘q — u yerda
     * ochilishda sahifa 10 px siljiydi). Telefonda chiziq kengligi 0 — u yerda
     * hech narsa o‘zgarmaydi.
     */
    const gap = window.innerWidth - document.documentElement.clientWidth;
    body.style.overflow = 'hidden';
    if (gap > 0) body.style.paddingRight = `${gap}px`;
    /*
     * Fokus SHU YERDA, sinxron: iOS klaviaturani faqat bosishning o‘zida
     * berilgan fokusda ochadi. Modal'dagidek setTimeout bilan bo‘lsa, telefonda
     * maydon fokus olardi-yu, klaviatura chiqmasdi.
     */
    inputRef.current?.focus({ preventScroll: true });
    return () => {
      body.style.overflow = prevOverflow;
      body.style.paddingRight = prevPadding;
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, []);

  // Yangi so‘rov — ro‘yxat boshidan
  useEffect(() => {
    listRef.current?.scrollTo({ top: 0 });
  }, [trimmed]);

  // Klaviatura bilan yurilganda faol qator ko‘rinib tursin (sichqonchada — yo‘q, ro‘yxat qo‘l ostida qochmasin)
  useEffect(() => {
    if (navVia.current !== 'key' || activeIndex < 0) return;
    if (activeIndex === 0) {
      listRef.current?.scrollTo({ top: 0 });
      return;
    }
    document.getElementById(optionId(activeIndex))?.scrollIntoView({ block: 'nearest' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIndex]);

  // Faol sahifa fayli oldindan yuklanadi (yon menyudagi hover kabi) — strelka bilan o‘tib ketilganlari emas
  const activeHref = active?.entry.href;
  useEffect(() => {
    if (!activeHref) return undefined;
    const id = window.setTimeout(() => prefetchPage(activeHref.split('#')[0]), 200);
    return () => window.clearTimeout(id);
  }, [activeHref]);

  // Ekran o‘quvchiga natijalar soni — har harfda emas, yozish to‘xtagach
  const [live, setLive] = useState('');
  const liveCount = searching ? options.length : -1;
  useEffect(() => {
    if (liveCount < 0) {
      setLive('');
      return undefined;
    }
    if (liveCount === 0 && productPending) return undefined;
    const id = window.setTimeout(
      () => setLive(liveCount > 0 ? t('results.count', { n: liveCount }) : t('results.none')),
      450,
    );
    return () => window.clearTimeout(id);
  }, [liveCount, productPending, t]);

  // ─────────────── Amallar ───────────────
  const activate = (entry: Entry, newTab = false) => {
    if (entry.disabled) return;
    if (entry.href) {
      if (newTab) {
        window.open(entry.href, '_blank', 'noopener');
        return;
      }
      if (entry.recent) pushRecent(entry.recent);
      const isHere = entry.href === pathname || entry.href === here;
      if (!isHere) navigate(entry.href);
      onClose();
      return;
    }
    onClose();
    entry.run?.();
  };

  const moveTo = (i: number) => {
    const o = options[i];
    if (!o) return;
    navVia.current = 'key';
    setActiveKey(o.key);
  };

  const onInputKeyDown = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (e.nativeEvent.isComposing) return;
    const n = options.length;
    switch (e.key) {
      case 'ArrowDown':
        if (n) moveTo((activeIndex + 1) % n);
        break;
      case 'ArrowUp':
        if (n) moveTo((activeIndex - 1 + n) % n);
        break;
      case 'PageDown':
        if (n) moveTo(Math.min(n - 1, activeIndex + PAGE_STEP));
        break;
      case 'PageUp':
        if (n) moveTo(Math.max(0, activeIndex - PAGE_STEP));
        break;
      /*
       * Home/End — ro‘yxat boshi/oxiri. Matn ichida kursor surish uchun
       * Shift bilan (belgilash) brauzerning o‘ziga qoldiriladi; so‘rov
       * odatda bir-ikki so‘z — chap/o‘ng strelka yetadi.
       */
      case 'Home':
        if (e.shiftKey || !n) return;
        moveTo(0);
        break;
      case 'End':
        if (e.shiftKey || !n) return;
        moveTo(n - 1);
        break;
      case 'Enter':
        if (active) activate(active.entry, e.ctrlKey || e.metaKey);
        break;
      default:
        return;
    }
    e.preventDefault();
  };

  const onPanelKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      onClose();
      return;
    }
    if (e.key !== 'Tab' || !panelRef.current) return;
    /*
     * Tab to‘liq qo‘lda boshqariladi: fokus oynadan chiqib, orqadagi sahifaga
     * tushmasin. Chrome endi aylanadigan ro‘yxatning o‘zini ham Tab bilan
     * fokuslaydi — fokus u yerda (yoki boshqa joyda) bo‘lsa ham, keyingi qadam
     * faqat maydon va tugmalar orasida.
     */
    const nodes = [...panelRef.current.querySelectorAll<HTMLElement>('input, button:not([disabled]), a[href]')].filter(
      (n) => n.offsetParent !== null,
    );
    if (!nodes.length) return;
    e.preventDefault();
    const at = nodes.indexOf(document.activeElement as HTMLElement);
    const next = at === -1 ? (e.shiftKey ? nodes.length - 1 : 0) : (at + (e.shiftKey ? -1 : 1) + nodes.length) % nodes.length;
    nodes[next].focus();
  };

  /*
   * Bo‘sh joyga (sarlavha, izoh) bosilganda fokus maydonga qaytadi — aks
   * holda u body'ga tushib, strelka va yozish ishlamay qolardi. Telefonda
   * qaytarilmaydi: aks holda har teginishda klaviatura qayta ochilardi.
   */
  const onPanelMouseUp = (e: ReactMouseEvent<HTMLDivElement>) => {
    if (coarse) return;
    if ((e.target as HTMLElement).closest('input, button, a')) return;
    inputRef.current?.focus({ preventScroll: true });
  };

  const clear = () => {
    setQuery('');
    setActiveKey(null);
    inputRef.current?.focus({ preventScroll: true });
  };

  const mac = isMacLike();
  const primaryTokens = variants.primary[0]?.tokens ?? [];

  const renderRow = (o: Option) => {
    const i = indexOf.get(o.key) ?? -1;
    const isActive = i === activeIndex;
    const { entry, match } = o;
    const isCurrent = entry.kind === 'page' && (entry.href === pathname || entry.href === here);
    const tokens = entry.kind === 'product' ? primaryTokens : match?.field === 'label' ? match.tokens : null;
    const ranges = tokens ? highlightRanges(entry.label, tokens) : [];
    // Boshqa tilda yoki sinonimda topilgan bo‘lsa — nima topilgani izohda: "Moliya · прибыль"
    const alt = match && (match.field === 'other' || match.field === 'syn') ? match.text : null;

    return (
      <div
        key={o.key}
        id={optionId(i)}
        role="option"
        aria-selected={isActive}
        aria-disabled={entry.disabled || undefined}
        onMouseMove={() => {
          if (isActive) return;
          navVia.current = 'mouse';
          setActiveKey(o.key);
        }}
        // Bosilganda fokus maydondan ketmasin
        onMouseDown={(e) => e.preventDefault()}
        onClick={(e) => activate(entry, e.ctrlKey || e.metaKey)}
        onAuxClick={(e) => {
          if (e.button === 1 && entry.href && !entry.disabled) window.open(entry.href, '_blank', 'noopener');
        }}
        className={cn(
          'mx-2 flex min-h-[48px] cursor-pointer select-none items-center gap-3 rounded-xl px-2.5 py-1.5',
          isActive ? 'bg-brand/10 shadow-[inset_0_0_0_1px_rgb(var(--c-brand)/0.22)]' : 'bg-transparent',
          entry.disabled && 'cursor-not-allowed',
        )}
      >
        {entry.thumb ? (
          <span className="h-8 w-8 shrink-0 overflow-hidden rounded-lg border border-line bg-surface-2">
            <ProductThumb name={entry.thumb.name} imageUrl={entry.thumb.url} style={{ fontSize: 11 }} />
          </span>
        ) : entry.icon ? (
          <span
            className={cn('icon-tile h-8 w-8 rounded-lg [&_svg]:h-4 [&_svg]:w-4', isActive ? 'tone-brand' : 'tone-muted')}
            aria-hidden
          >
            <entry.icon />
          </span>
        ) : null}

        <span className={cn('min-w-0 flex-1', entry.disabled && 'opacity-60')}>
          <span className="block truncate text-sm font-medium text-ink">
            <Highlighted text={entry.label} ranges={ranges} />
          </span>
          <span className="block truncate text-xs text-muted">
            {entry.hint}
            {alt ? <span className="text-ink-soft">{` · ${alt}`}</span> : null}
          </span>
        </span>

        {entry.badge ? (
          <span className="shrink-0 rounded-md bg-brand/10 px-1.5 py-0.5 text-2xs font-semibold text-brand-ink">
            {entry.badge}
          </span>
        ) : null}
        {isCurrent ? (
          <span className="meta-chip hidden shrink-0 gap-1 px-2 py-0.5 text-2xs text-brand-ink sm:inline-flex">
            <span className="h-1.5 w-1.5 rounded-full bg-brand" aria-hidden />
            {t('badge.current')}
          </span>
        ) : null}
        {entry.selected ? (
          <span className="meta-chip shrink-0 gap-1 px-2 py-0.5 text-2xs text-brand-ink">
            <Check className="h-3 w-3" />
            {t('badge.selected')}
          </span>
        ) : null}
        {entry.lock ? (
          <span
            className="meta-chip shrink-0 gap-1 px-2 py-0.5 text-2xs"
            title={entry.lock === 'preview' ? t('plan.preview') : t('plan.locked')}
          >
            <Lock className="h-3 w-3" />
            {t(entry.lock === 'preview' ? 'lock.preview' : 'lock.off')}
          </span>
        ) : null}
        {entry.archived ? <span className="meta-chip shrink-0 px-2 py-0.5 text-2xs">{t('product.archived')}</span> : null}
        {entry.stock !== undefined ? (
          <span className="meta-chip tnum hidden shrink-0 px-2 py-0.5 text-2xs sm:inline-flex">
            {t('product.stock', { n: f.num(entry.stock) })}
          </span>
        ) : null}
        {/* Joy doim band: faol qator almashganda matn kengligi sakramasin */}
        <CornerDownLeft
          className={cn('hidden h-3.5 w-3.5 shrink-0 text-muted sm:block', !isActive && 'invisible')}
          aria-hidden
        />
      </div>
    );
  };

  const placeholder = canSearchProducts ? t('input.placeholder') : t('input.placeholderPages');
  const nothing = searching && options.length === 0;

  return createPortal(
    <div className="fixed inset-0 z-[150] flex items-start justify-center sm:px-4 sm:pt-[10vh]" data-palette="">
      <motion.div
        aria-hidden
        className="absolute inset-0 hidden bg-black/55 backdrop-blur-sm sm:block"
        initial={reduceMotion ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.15 }}
        onClick={onClose}
      />
      <motion.div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={t('dialog.label')}
        data-palette=""
        onKeyDown={onPanelKeyDown}
        onMouseUp={onPanelMouseUp}
        initial={reduceMotion ? false : { opacity: 0, y: -8, scale: 0.985 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
        /*
         * Telefonda — butun ekranli varaq (h-dvh: brauzer panellari hisobga
         * olinadi), kattada — markazda oyna. Ro‘yxat balandligi kattada QAT’IY:
         * natija soni o‘zgarganda oyna cho‘zilib-qisqarib "sakramaydi".
         */
        className="relative flex h-dvh w-full flex-col overflow-hidden bg-surface sm:h-auto sm:max-w-[600px] sm:rounded-2xl sm:border sm:border-line sm:shadow-pop"
      >
        <div className="flex shrink-0 items-center gap-2 border-b border-line pl-4 pr-2 pt-[env(safe-area-inset-top)] sm:pr-3 sm:pt-0">
          {productPending ? (
            <Loader2 className="h-5 w-5 shrink-0 animate-spin text-muted" />
          ) : (
            <Search className="h-5 w-5 shrink-0 text-muted" />
          )}
          <input
            ref={inputRef}
            type="text"
            role="combobox"
            aria-expanded="true"
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={activeIndex >= 0 ? optionId(activeIndex) : undefined}
            aria-label={t('dialog.label')}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            enterKeyHint="go"
            placeholder={placeholder}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActiveKey(null);
            }}
            onKeyDown={onInputKeyDown}
            // 16 px — iOS kichikroq shriftli maydonga fokusda sahifani kattalashtirib yuboradi
            className="h-14 min-w-0 flex-1 bg-transparent text-base text-ink outline-none placeholder:text-muted sm:text-[15px]"
          />
          {query ? (
            <button
              type="button"
              onClick={clear}
              aria-label={t('input.clear')}
              title={t('input.clear')}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/60"
            >
              <X className="h-4 w-4" />
            </button>
          ) : null}
          <button
            type="button"
            onClick={onClose}
            aria-label={t('btn.close')}
            className="flex h-9 shrink-0 items-center rounded-lg px-2 text-sm font-medium text-brand-ink transition-colors hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/60 sm:h-8 sm:px-1.5 sm:text-muted"
          >
            <span className="sm:hidden">{t('btn.close')}</span>
            <span className="hidden sm:inline-flex">
              <Kbd>Esc</Kbd>
            </span>
          </button>
        </div>

        <div
          ref={listRef}
          // Telefonda ro‘yxat aylantirilganda klaviatura yopiladi — ko‘proq natija ko‘rinadi
          onTouchMove={() => {
            if (document.activeElement === inputRef.current) inputRef.current?.blur();
          }}
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-1 sm:h-[min(26rem,calc(100dvh-16rem))] sm:flex-none sm:pb-2"
        >
          <div id={listId} role="listbox" aria-label={t('dialog.label')}>
            {sections.map((s) => {
              const headId = `${baseId}-h-${s.key}`;
              return (
                <div key={s.key} role="group" aria-labelledby={headId} className="pb-1">
                  <div id={headId} aria-hidden className="eyebrow flex items-center gap-1.5 px-5 pb-1 pt-3">
                    {s.title}
                    {s.loading ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                  </div>
                  {s.items.map(({ entry, match }) => renderRow({ key: `${s.key}|${entry.key}`, entry, match }))}
                  {s.error ? <p className="mx-2 px-2.5 py-2 text-xs text-muted">{s.error}</p> : null}
                </div>
              );
            })}
          </div>

          {nothing && productPending ? (
            <div className="flex items-center justify-center gap-2 px-6 py-14 text-sm text-muted">
              <Loader2 className="h-4 w-4 animate-spin" />
              {t('products.loading')}
            </div>
          ) : nothing ? (
            <div className="flex flex-col items-center px-6 py-12 text-center">
              <span className="icon-tile tone-muted mb-3 h-11 w-11 rounded-xl [&_svg]:h-5 [&_svg]:w-5" aria-hidden>
                <Search />
              </span>
              <p className="max-w-full break-words text-sm font-semibold text-ink">{t('empty.title', { q: trimmed })}</p>
              <p className="mt-1 max-w-xs text-xs leading-5 text-muted">
                {canSearchProducts ? t('empty.hint') : t('empty.hintPages')}
              </p>
            </div>
          ) : null}
        </div>

        <div className="hidden shrink-0 items-center gap-4 border-t border-line bg-surface-2/60 px-4 py-2.5 text-2xs text-muted sm:flex">
          <span className="flex items-center gap-1.5">
            <Kbd>↑</Kbd>
            <Kbd>↓</Kbd>
            {t('hint.move')}
          </span>
          <span className="flex items-center gap-1.5">
            <Kbd>↵</Kbd>
            {t('hint.open')}
          </span>
          <span className="flex items-center gap-1.5">
            <Kbd>{mac ? '⌘' : 'Ctrl'}</Kbd>
            <Kbd>↵</Kbd>
            {t('hint.newTab')}
          </span>
          <span className="ml-auto flex items-center gap-1.5">
            <Kbd>Esc</Kbd>
            {t('hint.close')}
          </span>
        </div>

        <div aria-live="polite" className="sr-only">
          {live}
        </div>
      </motion.div>
    </div>,
    document.body,
  );
}
