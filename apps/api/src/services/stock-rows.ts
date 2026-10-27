/**
 * Qoldiqlar ro'yxati — Qoldiqlar sahifasi (GET /stocks) va uning Excel'i
 * (GET /export/stocks) uchun BITTA manba (2026-10-27).
 *
 * Ilgari sahifa GET /stocks dan 500 qatorni olib, qidiruv, holat, tartib va
 * sahifalashni o'zi qilardi, eksport esa qatorlarni o'zicha qayta yig'ardi
 * (10 000 tagacha). 500 dan ortiq SKU'li do'konda jadval kesilib, fayl bilan
 * farq qilardi. Endi hammasi serverda: qatorlarni shu yerdagi bir funksiya
 * yig'adi, bittasi filtrlaydi, bittasi saralaydi — sahifa ham, fayl ham
 * aynan shu qatorlar, shu tartibda.
 */
import { round, type SkuQuery, type StockRow, type StockStatus } from '@savdoiq/shared';
import {
  daysSince,
  getAvgDaily,
  getLastSaleDates,
  getSkuCatalog,
  skuInfoMatches,
  stockState,
  type SkuInfo,
  type StockInfo,
} from './common.js';
import { loadPlanData, planSku, planSkuSummary, planStockStatus } from './plan.js';
import { estimateStockValue, stockLineValue } from './stock-value.js';

/** O'rtacha kunlik sotuvni hisoblash oynasi (kun) — rejada yo'q SKU uchun */
const AVG_WINDOW = 30;

const EMPTY_STOCK: StockInfo = { fbo: 0, fbs: 0, own: 0, reserved: 0, inTransit: 0, total: 0, date: null };

export interface StockListItem {
  /** Katalog yozuvi — qidiruv shu bilan (services/common.ts skuInfoMatches, server qoidasi) */
  info: SkuInfo;
  row: StockRow;
}

/**
 * Do'konlardagi BARCHA SKU (arxivdagisi ham, yashirilgan mahsulotsiz) uchun
 * qoldiq qatori, katalog tartibida — filtr va tartibsiz.
 */
export async function loadStockList(companyId: string, taxRate: number, storeIds: string[]): Promise<StockListItem[]> {
  const [catalog, planData, avgDaily, lastSale] = await Promise.all([
    getSkuCatalog(storeIds, true),
    /*
     * Yon paneldagi "Tavsiya" — Rejalashtiruvchining o'zi (services/plan.ts,
     * kompaniyaning yetkazish muddati). Ilgari sayt uni o'zi hisoblardi:
     * 30 + 7 kun qat'iy, oddiy o'rtacha bilan, yo'ldagi tovarsiz — son
     * Rejalashtiruvchidagidan farq qilardi (2026-10-24). Qoldiq ham rejadan —
     * u `getLatestStocks` ni o'zi yuklaydi.
     */
    loadPlanData(companyId, storeIds),
    getAvgDaily(storeIds, AVG_WINDOW),
    getLastSaleDates(storeIds),
  ]);
  const stocks = planData.stocks;

  // Hammasi sotilsa qancha tushadi — komissiya va logistika SKU'ning haqiqiy sotuvidan
  const { lines } = await estimateStockValue(
    storeIds,
    [...catalog.values()],
    (skuId) => stocks.get(skuId)?.total ?? 0,
    taxRate,
  );

  const out: StockListItem[] = [];
  for (const [skuId, info] of catalog) {
    const st = stocks.get(skuId) ?? EMPTY_STOCK;
    const avg = avgDaily.get(skuId) ?? 0;
    /*
     * "Yetadi" va holat — Rejalashtiruvchining o'zi (planStockStatus): yetkazish
     * muddati, yo'ldagi tovar va tugab turgan kunlarsiz tezlik bilan. Ilgari
     * jadval 7/14 kunlik qat'iy chegara va oddiy o'rtacha bilan hisoblardi,
     * shu qatorning yon panelidagi tavsiya esa Rejalashtiruvchidan kelardi:
     * yetkazish 14 kun bo'lsa 12 kunlik SKU jadvalda "Tugayapti", tavsiyada
     * esa shoshilinch edi (2026-10-24). Sotuvi yo'q va arxivdagi SKU — eski
     * qoldiq qoidasi (harakatsiz, tugagan).
     */
    const planned = planSku(planData, skuId);
    const state = planStockStatus(
      planned,
      stockState(st.total, avg, daysSince(lastSale.get(skuId)), daysSince(info.createdAt)),
    );
    const line = lines.get(skuId);
    const value = stockLineValue(info, st.total, line, taxRate);
    const summary = planSkuSummary(planData, skuId);

    out.push({
      info,
      row: {
        skuId,
        sku: info.sku,
        title: info.title,
        imageUrl: info.imageUrl,
        storeTitle: info.storeTitle,
        // Qidiruv kalitlari (SkuSearchKeys) — qatorni server qoidasi bilan qayta tekshirish mumkin bo'lsin (shared search.ts)
        productId: info.productId,
        productTitle: info.productTitle,
        uzumProductId: info.uzumProductId,
        barcode: info.barcode,
        uzumSkuId: info.uzumSkuId,
        fbo: st.fbo,
        fbs: st.fbs,
        own: st.own,
        reserved: st.reserved,
        inTransit: st.inTransit,
        total: st.total,
        // Tannarx bo'yicha qiymat — omborda "muzlab turgan" pul
        costValue: round(st.total * (info.purchasePrice + info.extraCost)),
        // Sotuv narxi bo'yicha qiymat — potentsial tushum
        retailValue: round(st.total * info.price),
        payoutValue: round(value.payout),
        payoutPerUnit: round(line?.payoutPerUnit ?? 0),
        payoutSource: line?.source ?? 'estimate',
        profitValue: value.profit === null ? null : round(value.profit),
        // "Yetadi" shu tezlikdan chiqadi — ikkalasi bir manbadan bo'lsin (mahsulot sahifasidagi kabi)
        avgDaily: planned && planned.status !== 'no_action' ? planned.avgDaily : round(avg, 2),
        daysLeft: state.daysLeft,
        status: state.status,
        ...(summary ? { plan: summary } : {}),
      },
    });
  }
  return out;
}

/**
 * Qidiruv (umumiy qoida — skuInfoMatches: nom, mahsulot nomi, SKU kodi,
 * shtrix-kod, Uzum ID, havola) va holat filtri; null — o'sha filtr yo'q.
 */
export function filterStockList(
  items: StockListItem[],
  query: SkuQuery | null,
  status: StockStatus | null,
): StockListItem[] {
  if (query === null && status === null) return items;
  return items.filter(
    (x) => (query === null || skuInfoMatches(x.info, query)) && (status === null || x.row.status === status),
  );
}

/** Standart tartib — tannarx qiymati, kamayish (sahifa ham, Excel ham) */
export const DEFAULT_STOCK_SORT = 'costValue';

/** `?sort=` kalitlari. Matn — alifbo bo'yicha, son — kattaligi bo'yicha */
export const STOCK_SORT: Record<string, (r: StockRow) => number | string> = {
  total: (r) => r.total,
  fbo: (r) => r.fbo,
  fbs: (r) => r.fbs,
  own: (r) => r.own,
  reserved: (r) => r.reserved,
  inTransit: (r) => r.inTransit,
  costValue: (r) => r.costValue,
  retailValue: (r) => r.retailValue,
  payoutValue: (r) => r.payoutValue,
  profitValue: (r) => r.profitValue ?? Number.NEGATIVE_INFINITY,
  avgDaily: (r) => r.avgDaily,
  daysLeft: (r) => r.daysLeft ?? Number.MAX_SAFE_INTEGER,
  // Sahifadagi "Holat · yetadi" ustuni: kamayish — eng shoshilinchi tepada, "Sotuv yo'q" pastda
  status: (r) => -(r.daysLeft ?? Number.MAX_SAFE_INTEGER),
  title: (r) => r.title,
  sku: (r) => r.sku,
};

/**
 * Qatorlar tartibi. Teng qiymatlar SKU id bo'yicha ajratiladi: sahifalash
 * serverda bo'lgach, tartib so'rovdan so'rovga o'zgarmasligi shart — ilgari
 * teng qatorlar (masalan, qoldig'i 0, qiymati 0 bo'lgan yuzlab SKU) bazaning
 * qaytargan tartibida qolardi va keyingi sahifada bir SKU takrorlanib,
 * boshqasi tushib qolishi mumkin edi. Ayirma emas, taqqoslash: −∞ − (−∞) = NaN
 * tartibni buzardi.
 */
export function compareStockRows(sort: string | undefined, order: 'asc' | 'desc'): (a: StockRow, b: StockRow) => number {
  const value = STOCK_SORT[sort ?? DEFAULT_STOCK_SORT] ?? STOCK_SORT[DEFAULT_STOCK_SORT];
  const dir = order === 'asc' ? 1 : -1;
  return (a, b) => {
    const va = value(a);
    const vb = value(b);
    const c =
      typeof va === 'string' || typeof vb === 'string'
        ? String(va).localeCompare(String(vb))
        : va < vb
          ? -1
          : va > vb
            ? 1
            : 0;
    if (c !== 0) return c * dir;
    return a.skuId < b.skuId ? -1 : a.skuId > b.skuId ? 1 : 0;
  };
}
