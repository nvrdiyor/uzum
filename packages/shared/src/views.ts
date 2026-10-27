/**
 * Jamoa a'zosining ko'rinish shabloni (Membership.view) — YAGONA manba (2026-10-24).
 *
 * Rol (owner / manager / viewer) YOZISH huquqini belgilaydi, shablon esa a'zo
 * QAYSI bo'limlarni ko'rishini va pulni ko'ra olishini. Ikkalasi mustaqil:
 * "Omborchi + menejer" yetkazma yarata oladi, "Omborchi + kuzatuvchi" faqat
 * ko'radi. `null` — rol ruxsat bergan hamma narsa (avvalgidek). Egaga shablon
 * qo'yilmaydi: kompaniya egasidan biror narsani yashirish ma'nosiz.
 *
 * Bitta ro'yxat uch joyda ishlatiladi, shuning uchun ular bir-biridan
 * ajralib ketmaydi:
 *  • API (apps/api lib/views.ts): `requireCompany` shablondan tashqaridagi
 *    so'rovga 403 `view_forbidden` beradi, pulsiz shablonda JSON javobdagi pul
 *    maydonlari `null` bo'ladi (kalit va qatorlar joyida qoladi);
 *  • sayt: yon menyu, Ctrl+K, sahifa qo'riqchisi ("Bu bo'lim sizga yopiq");
 *  • Sozlamalar: qaysi bo'limlar ko'rinadi.
 *
 * Shablonlar (sahifalar — NAV `to`; ichki sahifalar prefiks bo'yicha, masalan
 * /products → /products/:id):
 *
 *  Omborchi (warehouse), pulsiz — qoldiq, ombor, yetkazmalar, yo'qotishlar,
 *    qaytarishlar, pullik saqlash, VGH, rejalashtiruvchi, mahsulotlar (o'qish),
 *    SKU holati. Chegaradagilar: "Nolikvidlar" va "Sotuv va qoldiq" ham shu
 *    yerda — ikkalasi ham "qaysi tovar qancha turibdi" savoli (tannarx
 *    qiymati baribir `null`). Sozlamalarda faqat o'z profili.
 *
 *  Buxgalter (accountant), pul ko'rinadi — boshqaruv paneli, moliya, mahsulot
 *    foydasi, unit-iqtisod, xarajatlar, pul kalendari, oylik hisobot, tannarx,
 *    partiyalar, ikkala kalkulyator, sotuv, mahsulotlar (o'qish). Chegaradagilar:
 *    MXIK (soliq kodi — buxgalter ishi) va "Nolikvidlar" (muzlagan pul).
 *    Kartochka SEO (yozish) va Uzum kalitlarini boshqarish YO'Q.
 *
 *  Marketolog (marketer), pulsiz — boshqaruv paneli, sotuv, voronka, kartochka
 *    SEO, sharhlar, aksiyalar, mahsulotlar, kategoriyalar, radar, ABC.
 *    Chegaradagilar: "SKU holati" (bloklangan kartochka, ko'p qaytish) va
 *    "Qaytarishlar" (sabablar — kartochka matni uchun), raqobatchi narxlari.
 *    Tannarx, foyda, marja va to'lov — `null`.
 *
 * "Pul" (pulsiz shablonda `null` bo'ladigan maydonlar) — tannarx (sotib olish
 * narxi, cogs, qoldiqning tannarx qiymati), har xil foyda, marja, ROI, ustama,
 * Uzum to'lovi va balansi, nol foyda narxi, soliq, sotuvchining o'z xarajatlari
 * jami. Tushum, sotuv narxi, Uzum komissiyasi va logistikasi, saqlash yig'imi,
 * yo'qotish da'vosi summasi ochiq: ombor va marketing ishi aynan shular bilan.
 * Excel fayllari ichidagi pulni `null` qilib bo'lmaydi — pulsiz shablonga faqat
 * pulsiz eksportlar (yo'qotishlar, qaytarishlar, saqlash) ochiq.
 */

export const MEMBER_VIEWS = ['warehouse', 'accountant', 'marketer'] as const;
export type MemberView = (typeof MEMBER_VIEWS)[number];

/** Bazadagi qiymatni shablonga keltiradi: notanish yoki bo'sh — `null` (hammasi ochiq) */
export function asMemberView(value: unknown): MemberView | null {
  return typeof value === 'string' && (MEMBER_VIEWS as readonly string[]).includes(value)
    ? (value as MemberView)
    : null;
}

/**
 * API hududlari — har bir so'rov `API_RULES` bo'yicha bittasiga tushadi.
 * `core` — kompaniya qobig'i (sinxron holati, kabinetlar ro'yxati, tarif):
 * har bir shablonga ochiq, aks holda yuqori panel va filtrlar ishlamaydi.
 */
export type ViewApiArea =
  | 'core'
  | 'dashboard'
  | 'sales'
  | 'funnel'
  | 'products'
  | 'productsWrite'
  | 'costPrice'
  | 'abc'
  | 'productProfit'
  | 'illiquid'
  | 'stocks'
  | 'salesStock'
  | 'planner'
  | 'shipments'
  | 'losses'
  | 'returns'
  | 'storage'
  | 'vgh'
  | 'skuHealth'
  | 'promos'
  | 'reviews'
  | 'cards'
  | 'cardsWrite'
  | 'categories'
  | 'radar'
  | 'competitors'
  | 'competitorsWrite'
  | 'finance'
  | 'unit'
  | 'payout'
  | 'reports'
  | 'batches'
  | 'mxik';

export type ViewSettingsSection = 'profile' | 'company' | 'uzum' | 'notifications' | 'team' | 'appearance';

export interface ViewTemplate {
  id: MemberView;
  /** Tannarx, foyda, marja, to'lov va soliq ko'rinadimi (yo'q bo'lsa API ularni `null` qiladi) */
  money: boolean;
  /** Kirgandan keyingi bosh sahifa (Boshqaruv paneli yopiq shablonda) */
  home: string;
  /** Sayt sahifalari — NAV `to`; ichki sahifalar shu prefiks bilan ochiladi */
  pages: readonly string[];
  areas: readonly ViewApiArea[];
  /** Sozlamalar bo'limlari (qolganlari ko'rinmaydi) */
  settings: readonly ViewSettingsSection[];
}

/** Har bir shablonga ochiq sahifalar: o'z sozlamasi, tariflar, hamkorlik dasturi */
export const VIEW_ALWAYS_PAGES: readonly string[] = ['/settings', '/pricing', '/referral'];

export const VIEW_TEMPLATES: Record<MemberView, ViewTemplate> = {
  warehouse: {
    id: 'warehouse',
    money: false,
    home: '/stocks',
    pages: [
      '/stocks',
      '/warehouse',
      '/shipments',
      '/losses',
      '/returns',
      '/storage',
      '/vgh',
      '/planner',
      '/products',
      '/sku-health',
      '/illiquid',
      '/sales-stock',
    ],
    areas: [
      'core',
      'products',
      'competitors',
      'stocks',
      'salesStock',
      'illiquid',
      'planner',
      'shipments',
      'losses',
      'returns',
      'storage',
      'vgh',
      'skuHealth',
    ],
    settings: ['profile', 'notifications', 'appearance'],
  },
  accountant: {
    id: 'accountant',
    money: true,
    home: '/dashboard',
    pages: [
      '/dashboard',
      '/sales',
      '/payout',
      '/reports',
      '/products',
      '/cost-price',
      '/batches',
      '/mxik',
      '/illiquid',
      '/finance',
      '/product-profit',
      '/unit-economics',
      '/expenses',
      '/calculator',
      '/import-calculator',
    ],
    areas: [
      'core',
      'dashboard',
      'sales',
      'products',
      'competitors',
      'costPrice',
      'productProfit',
      'illiquid',
      'finance',
      'unit',
      'payout',
      'reports',
      'batches',
      'mxik',
    ],
    settings: ['profile', 'company', 'notifications', 'appearance'],
  },
  marketer: {
    id: 'marketer',
    money: false,
    home: '/dashboard',
    pages: [
      '/dashboard',
      '/sales',
      '/funnel',
      '/products',
      '/sku-health',
      '/cards',
      '/abc',
      '/categories',
      '/radar',
      '/promos',
      '/returns',
      '/reviews',
      // Raqobatchi narxlari (narx xaritasi) — narx qo'yish marketing ishi
      '/price-map',
    ],
    areas: [
      'core',
      'dashboard',
      'sales',
      'funnel',
      'products',
      'productsWrite',
      'abc',
      'categories',
      'radar',
      'promos',
      'reviews',
      'cards',
      'cardsWrite',
      'skuHealth',
      'returns',
      'competitors',
      'competitorsWrite',
    ],
    settings: ['profile', 'notifications', 'appearance'],
  },
};

export function viewTemplate(view: MemberView | null | undefined): ViewTemplate | null {
  return view ? (VIEW_TEMPLATES[view] ?? null) : null;
}

/** Pul ko'rinadimi — shablonsiz (`null`) a'zo uchun doim ha */
export function viewSeesMoney(view: MemberView | null | undefined): boolean {
  return viewTemplate(view)?.money ?? true;
}

/** Bosh sahifa: shablonsiz — Boshqaruv paneli */
export function viewHomePath(view: MemberView | null | undefined): string {
  return viewTemplate(view)?.home ?? '/dashboard';
}

/** Yo'lni solishtirishga tayyorlaydi: so'rov qismi, ortiqcha va oxirgi '/' olib tashlanadi */
function normalizePath(path: string): string {
  const clean = path.split('?')[0]!.split('#')[0]!.toLowerCase();
  const parts = clean.split('/').filter(Boolean);
  return `/${parts.join('/')}`;
}

/** Sahifa shablonda ochiqmi: aniq mos yoki uning ichki sahifasi (/products → /products/abc123) */
export function viewAllowsPage(view: MemberView | null | undefined, pathname: string): boolean {
  const tpl = viewTemplate(view);
  if (!tpl) return true;
  const path = normalizePath(pathname);
  const pages = [...VIEW_ALWAYS_PAGES, ...tpl.pages];
  return pages.some((p) => path === p || path.startsWith(`${p}/`));
}

/** Sozlamalar bo'limi ko'rinadimi */
export function viewAllowsSettings(view: MemberView | null | undefined, section: ViewSettingsSection): boolean {
  const tpl = viewTemplate(view);
  return tpl ? tpl.settings.includes(section) : true;
}

type RuleMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | '*';

/**
 * [metod, yo'l, hudud, faqat pul ko'radigan shablonga]. Birinchi mos kelgani
 * hal qiladi — aniq yo'llar `/:id` dan OLDIN (Express marshrut tartibi bilan
 * bir xil: /products/abc va /products/profit — /products/:id emas).
 * `:x` — bitta bo'lak, oxiridagi `*` — shu yo'l va uning ichidagi hammasi.
 * Ro'yxatda yo'q yo'l shablonli a'zoga YOPIQ: yangi bo'lim qo'shilsa, u
 * shablonga ataylab qo'shilmaguncha ko'rinmaydi.
 *
 * Excel eksportlari "pul" belgisi bilan: fayl ichidagi tannarx va foydani
 * `null` qilib bo'lmaydi, shuning uchun pulsiz shablonga faqat pulsizlari.
 */
type ApiRule = readonly [RuleMethod, string, ViewApiArea, boolean?];

export const VIEW_API_RULES: readonly ApiRule[] = [
  // ── Kompaniya qobig'i ──
  ['GET', '/company', 'core'],
  ['GET', '/company/members', 'core'],
  ['GET', '/sync/status', 'core'],
  ['GET', '/sync/history', 'core'],
  ['POST', '/sync/start', 'core'],
  ['POST', '/sync/cancel', 'core'],
  ['GET', '/uzum', 'core'],
  ['GET', '/uzum/stores', 'core'],
  ['GET', '/billing/subscription', 'core'],
  ['GET', '/billing/invoices', 'core'],
  // "Tannarx: N% sotuvda" chipi — foyda ishonchliligi haqida, pulsiz shablonda ma'nosiz
  ['GET', '/analytics/cost-coverage', 'core', true],

  // ── Boshqaruv paneli ──
  ['GET', '/analytics/dashboard', 'dashboard'],
  ['GET', '/analytics/kpi', 'dashboard'],
  ['*', '/dashboard/today/*', 'dashboard'],
  ['GET', '/dashboard/goals', 'dashboard'],
  // Maqsadda sof foyda va marja bor — pulsiz shablon ularni ko'rmaydi, demak qo'ymaydi ham
  ['PUT', '/dashboard/goals', 'dashboard', true],
  ['GET', '/dashboard/returns', 'dashboard'],

  // ── Sotuv ──
  ['GET', '/sales/*', 'sales'],
  ['GET', '/export/sales', 'sales', true],
  ['GET', '/funnel', 'funnel'],

  // ── Mahsulotlar ──
  ['GET', '/products/abc', 'abc'],
  ['GET', '/export/abc', 'abc', true],
  ['GET', '/products/profit', 'productProfit'],
  ['GET', '/export/product-profit', 'productProfit', true],
  ['GET', '/products/illiquid', 'illiquid'],
  ['GET', '/export/illiquid', 'illiquid', true],
  ['PATCH', '/products/sku/:id', 'costPrice'],
  ['POST', '/products/sku/bulk-cost', 'costPrice'],
  ['POST', '/products/:id/hide', 'productsWrite'],
  ['POST', '/products/:id/restore', 'productsWrite'],
  ['GET', '/products', 'products'],
  ['GET', '/products/:id', 'products'],
  ['GET', '/export/products', 'products', true],
  // Mahsulotlar sahifasi "buyurtma kerak" ni kompaniyaning yetkazish muddati bilan hisoblaydi
  ['GET', '/planner/settings', 'products'],
  // Raqobatchi narxlari mahsulot sahifasida ham ko'rinadi (o'qish), yozish — marketing
  ['GET', '/competitors/*', 'competitors'],
  ['*', '/competitors/*', 'competitorsWrite'],

  // ── Qoldiq va ombor ──
  ['GET', '/stocks/sales-stock', 'salesStock'],
  ['GET', '/export/sales-stock', 'salesStock', true],
  ['GET', '/stocks/*', 'stocks'],
  ['GET', '/warehouse/turnover', 'stocks'],
  ['GET', '/export/stocks', 'stocks', true],
  ['GET', '/export/warehouse', 'stocks', true],
  ['*', '/planner/*', 'planner'],
  ['GET', '/export/planner', 'planner', true],
  ['*', '/warehouse/shipments/*', 'shipments'],
  ['*', '/warehouse/losses/*', 'losses'],
  ['GET', '/export/losses', 'losses'],
  ['GET', '/warehouse/returns', 'returns'],
  ['GET', '/export/returns', 'returns'],
  ['GET', '/warehouse/storage/*', 'storage'],
  ['GET', '/export/storage', 'storage'],
  ['GET', '/warehouse/vgh', 'vgh'],
  ['GET', '/marketing/sku-health', 'skuHealth'],

  // ── Marketing ──
  ['GET', '/marketing/promos', 'promos'],
  ['*', '/reviews/*', 'reviews'],
  ['GET', '/cards', 'cards'],
  ['GET', '/cards/:productId', 'cards'],
  ['*', '/cards/*', 'cardsWrite'],
  ['GET', '/growth/categories', 'categories'],
  ['GET', '/growth/radar', 'radar'],

  // ── Moliya ──
  ['*', '/finance/*', 'finance'],
  ['GET', '/export/expenses', 'finance', true],
  ['*', '/unit/*', 'unit'],
  ['GET', '/export/unit-economics', 'unit', true],
  ['*', '/payout/*', 'payout'],
  ['*', '/reports/*', 'reports'],
  ['GET', '/export/monthly', 'reports', true],
  ['*', '/batches/*', 'batches'],
  ['*', '/mxik/*', 'mxik'],
];

function patternMatches(pattern: string, path: string): boolean {
  const want = pattern.split('/').filter(Boolean);
  const got = path.split('/').filter(Boolean);
  for (let i = 0; i < want.length; i += 1) {
    const seg = want[i]!;
    if (seg === '*') return true;
    if (i >= got.length) return false;
    if (seg.startsWith(':')) continue;
    if (seg !== got[i]) return false;
  }
  return want.length === got.length;
}

/** So'rov qaysi qoidaga tushadi (API yo'li /api/v1 siz: "/products/abc") */
export function viewApiRule(method: string, path: string): ApiRule | null {
  // Express HEAD so'rovini GET marshrutiga yuboradi
  const m = method.toUpperCase() === 'HEAD' ? 'GET' : method.toUpperCase();
  const p = normalizePath(path);
  return VIEW_API_RULES.find(([rm, rp]) => (rm === '*' || rm === m) && patternMatches(rp, p)) ?? null;
}

/** API so'rovi shablonda ochiqmi. Shablonsiz a'zo — doim ha */
export function viewAllowsApi(view: MemberView | null | undefined, method: string, path: string): boolean {
  const tpl = viewTemplate(view);
  if (!tpl) return true;
  const rule = viewApiRule(method, path);
  if (!rule) return false;
  const [, , area, needsMoney] = rule;
  return tpl.areas.includes(area) && (!needsMoney || tpl.money);
}

// ─────────────────────────── Pulni yashirish (pulsiz shablon) ───────────────────────────

/**
 * Har qanday chuqurlikda pul bo'lgan kalitlar (packages/shared types.ts dagi
 * javob tiplaridan): qiymati son bo'lsa `null`, obyekt bo'lsa (MetricValue,
 * ProductProfitMoney) ichidagi hamma son `null` bo'ladi — kalitlar va tuzilma
 * qoladi, sahifa `.value` ni o'qiganda yiqilmaydi.
 */
export const MONEY_KEYS: ReadonlySet<string> = new Set([
  // Tannarx
  'purchasePrice',
  'extraCost',
  'totalCost',
  'costValue',
  'cogs',
  'otherCost',
  'cost',
  'costTotal',
  'costShare',
  'unitCost',
  'unitCostFull',
  'purchaseCost',
  'stockCost',
  'goodsCost',
  'cargoCost',
  'lossValue',
  'frozenCapital',
  'frozenValue',
  'totalFrozen',
  'estMissingCogs',
  // Foyda
  'profit',
  'netProfit',
  'itemProfit',
  'grossProfit',
  'operatingProfit',
  'totalProfit',
  'perUnitProfit',
  'netProfitPerUnit',
  'profitValue',
  'profitNow',
  'profitPromo',
  'profitDelta',
  'potentialProfit',
  'profit30',
  'prevProfit',
  'profitDeltaPct',
  'stockProfit',
  'shareOfProfit',
  // Mahsulotga bog'lanmagan davr xarajatlari — do'kon foydasi va mahsulotlar foydasi orasidagi farq
  'unallocated',
  // Nisbatlar
  'margin',
  'marginPct',
  'marginPromo',
  'grossMargin',
  'roi',
  'markup',
  // Uzum to'lovi va balans
  'payout',
  'payoutValue',
  'payoutPerUnit',
  'stockPayout',
  'payoutToday',
  'paidYesterday',
  'expectedToday',
  'uzumBalance',
  'withdrawn',
  'paidOut',
  // Nol foyda nuqtasi
  'breakEvenPrice',
  'breakEvenQty',
  // Soliq
  'tax',
  'taxAmount',
]);

/** Faqat shu ota-kalit ichida pul bo'lgan kalitlar */
const CONTEXT_MONEY: Readonly<Record<string, ReadonlySet<string>>> = {
  // Boshqaruv paneli: { units, amount (tannarx bo'yicha), fbo, fbs (dona) }
  stockValue: new Set(['amount']),
  // Boshqaruv paneli xarajatlari: komissiya, logistika, marketing, saqlash ochiq;
  // sotuvchining o'z xarajati (ish haqi, ijara) va jami — yo'q
  expenses: new Set(['other', 'total', 'periodOnly']),
};

/** Son bo'lsa pul (Kategoriya va Nolikvid qatorida tannarx qiymati), obyekt bo'lsa — CONTEXT_MONEY */
const NUMBER_MONEY: ReadonlySet<string> = new Set(['stockValue']);

/** Mahsulot belgilaridan foydani ochib qo'yadiganlari */
const MONEY_FLAGS: ReadonlySet<string> = new Set(['loss', 'lowMargin']);

/**
 * Xulosa matnidagi pul (Boshqaruv paneli "Davr xulosalari"): matnni `null`
 * qilib bo'lmaydi, shuning uchun bunday xulosa ro'yxatga kirmaydi.
 */
const MONEY_INSIGHT_METRICS: ReadonlySet<string> = new Set([
  'netProfit',
  'margin',
  'frozen',
  'stockValue',
  'tax',
  'expenses',
  'payout',
  'roi',
]);

function isPlainObject(v: unknown): v is Record<string, unknown> {
  if (v === null || typeof v !== 'object' || Array.isArray(v)) return false;
  // Date va toJSON'li obyektlar JSON.stringify'ga o'z holicha qoladi
  return typeof (v as { toJSON?: unknown }).toJSON !== 'function';
}

/** Ichidagi barcha sonlarni `null` qiladi, matn va mantiqiy qiymatlar qoladi */
function nullifyNumbers(v: unknown): unknown {
  if (typeof v === 'number') return null;
  if (Array.isArray(v)) return v.map(nullifyNumbers);
  if (isPlainObject(v)) {
    const out: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v)) out[k] = nullifyNumbers(x);
    return out;
  }
  return v;
}

function redactValue(v: unknown, parentKey: string | null): unknown {
  if (Array.isArray(v)) {
    if (parentKey === 'flags') return v.filter((f) => !(typeof f === 'string' && MONEY_FLAGS.has(f)));
    if (parentKey === 'insights') {
      return v
        .filter((i) => !(isPlainObject(i) && typeof i.metric === 'string' && MONEY_INSIGHT_METRICS.has(i.metric)))
        .map((i) => redactValue(i, null));
    }
    return v.map((x) => redactValue(x, parentKey));
  }
  if (!isPlainObject(v)) return v;
  const context = parentKey ? CONTEXT_MONEY[parentKey] : undefined;
  const out: Record<string, unknown> = {};
  for (const [k, x] of Object.entries(v)) {
    if (MONEY_KEYS.has(k) || context?.has(k)) out[k] = nullifyNumbers(x);
    else if (NUMBER_MONEY.has(k) && typeof x === 'number') out[k] = null;
    // ProductProfitRow.perUnit — bir donaga butun pul zanjiri; StorageRow.perUnit (son) — saqlash yig'imi
    else if (k === 'perUnit' && isPlainObject(x)) out[k] = nullifyNumbers(x);
    else out[k] = redactValue(x, k);
  }
  return out;
}

/**
 * Pulsiz shablon uchun javob nusxasi: pul maydonlari `null`, qolgani o'zgarmaydi.
 * Asl obyekt O'ZGARTIRILMAYDI — marshrutlar keshdagi obyektni qaytarishi
 * mumkin (kartochkalar ro'yxati), u egasi uchun buzilmasin.
 */
export function redactMoney<T>(body: T): T {
  return redactValue(body, null) as T;
}
