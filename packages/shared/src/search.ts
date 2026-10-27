/**
 * SKU va mahsulot qidiruvi — butun ilovada BITTA qoida (2026-10-24).
 *
 * Ilgari har sahifa o'zicha qidirardi: Mahsulotlar — nom, kategoriya va SKU
 * kodi bo'yicha; Qoldiqlar, ABC, Rejalashtiruvchi — nom va SKU kodi; "SKU
 * holati" esa bazadagi `contains` bilan (PostgreSQL'da registrga sezgir:
 * "naushnik" "Naushnik"ni topmasdi). Kartochkada "ID: 701009" yozilgan,
 * qidiruv maydonida "ID bo'yicha" deyilgan, lekin shu ID hech qayerda
 * topilmasdi — na Uzum mahsulot ID'si, na SKU ID, na shtrix-kod qidiruvga
 * kirmagan edi.
 *
 * QOIDA:
 *  - matn (mahsulot va SKU nomi, SKU kodi, kategoriya) — qism bo'yicha;
 *    registr, o'zbek apostrofining shakli (o‘, oʻ, o') va bo'shliqlar farq
 *    qilmaydi (card-seo.ts normalizeCardText);
 *  - shtrix-kod — qism bo'yicha (skaner to'liq kodni yozadi, sotuvchi
 *    ko'pincha oxirgi raqamlarini), lekin kamida SKU_QUERY_MIN_CODE belgi:
 *    "12" yozilganda deyarli har bir shtrix-kod mos kelib, ro'yxat to'lib
 *    ketardi;
 *  - Uzum mahsulot ID, Uzum SKU ID va ichki id — ANIQ moslik: "7010"
 *    yozilganda 701009, 701010 … hammasi chiqib ketmasin. Kartochkadagi
 *    "ID: 701009" yozuvini nusxalab qo'yish ham ishlaydi ("ID:", "#" tashlanadi);
 *  - uzum.uz havolasi — undagi mahsulot ID'si (…/product/nom-701009 yoki
 *    …/product/701009) va `?skuId=` olinadi; havola matn sifatida qidirilmaydi.
 *
 * Server (apps/api services/common.ts skuMatches) va sayt (mahalliy
 * qidiruvli jadvallar) AYNAN shu funksiyalarni chaqiradi — natija bir xil.
 */
import { normalizeCardText } from './card-seo.js';

/** Shtrix-kod qism bo'yicha shundan qisqa so'rovda solishtirilmaydi */
export const SKU_QUERY_MIN_CODE = 4;

/** Tahlil qilingan qidiruv so'rovi — har qatorda qayta tahlil qilinmasin */
export interface SkuQuery {
  /** Normallashtirilgan matn: kichik harf, apostrof va bo'shliqlar bir xil */
  text: string;
  /** Aniq solishtiriladigan ID'lar: yozilgan qiymat ("ID:" siz) yoki havoladagi mahsulot / SKU ID */
  ids: string[];
  /** uzum.uz havolasi — nom va kodlar bo'yicha qidirilmaydi, faqat undagi ID'lar */
  url: boolean;
}

/** SKU (variant) bo'yicha qidiriladigan maydonlar — bo'lmaganini bermaslik mumkin */
export interface SkuSearchFields {
  /** Ichki id — kartochkada Uzum ID bo'lmasa shu ko'rsatiladi */
  id?: string | null;
  /** Sotuvchining SKU kodi */
  sku?: string | null;
  title?: string | null;
  barcode?: string | null;
  uzumSkuId?: string | null;
}

/** Mahsulot bo'yicha qidiriladigan maydonlar */
export interface ProductSearchFields {
  id?: string | null;
  title?: string | null;
  category?: string | null;
  uzumProductId?: string | null;
}

/** Havola: protokol yoki www bilan, yoki to'g'ridan-to'g'ri uzum.uz domeni bilan boshlanadi */
const URL_LIKE = /^(?:https?:\/\/|www\.)|^(?:[a-z0-9-]+\.)*uzum\.uz(?:[/?#]|$)/i;
/** Havoladagi variant: ?skuId=1234567 */
const URL_SKU = /[?&#]skuId=(\d+)/i;
/**
 * Havoladagi mahsulot ID'si: /product/nom-701009, /product/701009 yoki
 * sotuvchi kabinetidagi /products/701009. Nom ichidagi raqamlar
 * ("iphone-15-pro-256gb-555871") olinmaydi — faqat oxiridagi bo'lak.
 */
const URL_PRODUCT = /\/products?\/(?:[^/?#]*?-)?(\d+)(?=[/?#]|$)/i;
/**
 * Kartochkadagi yozuvni nusxalab qo'yish: "ID: 701009", "id 701009", "#701009",
 * "№701009". "id" dan keyin ajratgich yoki raqam bo'lishi shart — "idish"
 * so'zi "ish" bo'lib qolmasin.
 */
const ID_PREFIX = /^(?:id(?=[\s:#№]|\d)\s*[:#№]?|#|№)\s*/i;

/**
 * So'rovni tahlil qiladi. Bo'sh (yoki faqat bo'shliq) bo'lsa null —
 * chaqiruvchi filtrlamaydi.
 */
export function parseSkuQuery(raw: string | null | undefined): SkuQuery | null {
  const value = (raw ?? '').trim();
  if (!value) return null;

  if (URL_LIKE.test(value)) {
    const ids: string[] = [];
    const product = URL_PRODUCT.exec(value)?.[1];
    const sku = URL_SKU.exec(value)?.[1];
    if (product) ids.push(product);
    if (sku && sku !== product) ids.push(sku);
    return { text: '', ids, url: true };
  }

  const bare = value.replace(ID_PREFIX, '').trim();
  return { text: normalizeCardText(value), ids: bare ? [bare] : [], url: false };
}

const contains = (value: string | null | undefined, text: string): boolean =>
  Boolean(value) && normalizeCardText(value as string).includes(text);

/**
 * Bitta SKU (va uning mahsuloti) so'rovga mos keladimi. Mahsulot maydonlari
 * mos kelsa — uning har bir varianti mos: "701009" qidirilganda
 * Rejalashtiruvchida shu mahsulotning barcha ranglari chiqadi.
 */
export function matchesSkuQuery(
  query: SkuQuery,
  sku: SkuSearchFields | null | undefined,
  product?: ProductSearchFields | null,
): boolean {
  for (const id of query.ids) {
    if (sku && (sku.uzumSkuId === id || sku.id === id)) return true;
    if (product && (product.uzumProductId === id || product.id === id)) return true;
  }
  if (query.url || !query.text) return false;

  const text = query.text;
  if (sku && (contains(sku.title, text) || contains(sku.sku, text))) return true;
  if (product && (contains(product.title, text) || contains(product.category, text))) return true;
  return Boolean(sku?.barcode) && text.length >= SKU_QUERY_MIN_CODE && contains(sku?.barcode, text);
}

/** So'rov "№" yoki "#" bilan boshlanadimi — hujjat raqamini nusxalab qo'yish ("№12345", "#SP-2026-001") */
export function isNumberMarked(query: SkuQuery): boolean {
  return query.text.startsWith('№') || query.text.startsWith('#');
}

/**
 * Hujjatning o'z matn maydonlari — buyurtma raqami, qaytarish sababi,
 * yetkazma kodi, manzili, izohi: qism bo'yicha, registr va apostrof
 * shaklidan qat'i nazar. "№12345" yoki "#SP-2026-001" ham ishlaydi —
 * belgisi tashlangan qiymat ham solishtiriladi. "ID: 701009" esa ATAYLAB
 * yo'q: bu kartochkadagi tovar ID'si, uni buyurtma raqami ichidan qidirish
 * tasodifiy moslik beradi. uzum.uz havolasi ham bu maydonlarda
 * qidirilmaydi — u tovarni ko'rsatadi.
 *
 * SKU qoidasining (matchesSkuQuery) o'rnini bosmaydi, unga QO'SHILADI:
 * Sotuvlar, Qaytarishlar va Yetkazmalarda bitta so'rov ham tovarni, ham
 * hujjatni topadi. Ilgari bu maydonlar `toLowerCase().includes` bilan
 * solishtirilardi va "№12345" topilmasdi (2026-10-24).
 */
export function matchesQueryText(query: SkuQuery, ...values: (string | null | undefined)[]): boolean {
  if (query.url) return false;
  const bare = isNumberMarked(query) ? query.ids.map((id) => normalizeCardText(id)) : [];
  const needles = [query.text, ...bare].filter((n) => n.length > 0);
  return values.some((v) => needles.some((n) => contains(v, n)));
}

/**
 * Mahsulot (kartochka) so'rovga mos keladimi: o'zining maydonlari yoki
 * birorta varianti bo'yicha — masalan, ikkinchi rangning shtrix-kodi.
 */
export function matchesProductQuery(
  query: SkuQuery,
  product: ProductSearchFields,
  skus: Iterable<SkuSearchFields>,
): boolean {
  if (matchesSkuQuery(query, null, product)) return true;
  for (const s of skus) if (matchesSkuQuery(query, s, null)) return true;
  return false;
}
