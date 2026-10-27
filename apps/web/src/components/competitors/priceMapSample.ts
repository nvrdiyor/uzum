/**
 * "Narxlar xaritasi" namunasi — xarita faqat pullik tarifda (price_map,
 * 2026-10-27), sinovda esa qulf oynasi ostida shu xira namuna ko'rinadi.
 * So'rov yuborilmaydi: 402 javobi qulf ostida xato kartochkasini chizardi
 * (Vgh.tsx, Categories.tsx bilan bir xil). Nomlar va narxlar o'ylab topilgan,
 * holat (arzonroq / teng / qimmatroq) esa shared qoidasining o'zidan.
 */
import {
  COMPETITOR_LIMITS,
  competitorPosition,
  type PriceMapEntry,
  type PriceMapResponse,
  type PriceMapRow,
} from '@savdoiq/shared';

const pct = (a: number, b: number) => Math.round(((a - b) / b) * 1000) / 10;

function row(id: number, title: string, category: string, ourPrice: number, breakEven: number, prices: number[], daysAgo = 3): PriceMapRow {
  const sorted = [...prices].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)]!;
  const gapPct = pct(ourPrice, median);
  const stale = daysAgo > COMPETITOR_LIMITS.staleDays;
  const entries: PriceMapEntry[] = sorted.map((price, i) => ({
    id: `sample-${id}-${i}`,
    title: `Raqobatchi ${String.fromCharCode(65 + i)}`,
    url: null,
    price,
    prevPrice: null,
    change: null,
    ourPrice,
    diffPct: pct(price, ourPrice),
    checkedAt: '2026-10-24T09:00:00.000Z',
    daysAgo,
    stale,
    belowBreakEven: price < breakEven,
  }));
  return {
    productId: `sample-${id}`,
    title,
    category,
    imageUrl: null,
    storeId: 'sample',
    storeTitle: '',
    uzumProductId: null,
    our: {
      minPrice: ourPrice,
      maxPrice: ourPrice,
      breakEvenPrice: breakEven,
      margin: Math.round(((ourPrice - breakEven) / ourPrice) * 1000) / 10,
      price: ourPrice,
      costMissing: false,
    },
    stats: {
      count: sorted.length,
      minPrice: sorted[0]!,
      medianPrice: median,
      maxPrice: sorted[sorted.length - 1]!,
      lastCheckedAt: '2026-10-24T09:00:00.000Z',
      daysSinceCheck: daysAgo,
      stale,
      staleCount: stale ? sorted.length : 0,
      comparePrice: ourPrice,
      gapPct,
      position: competitorPosition(gapPct),
      belowBreakEven: sorted[0]! < breakEven,
    },
    entries,
  };
}

const ROWS: PriceMapRow[] = [
  row(1, 'Simsiz quloqchin Pro', 'Elektronika', 289_000, 214_000, [249_000, 265_000, 279_000]),
  row(2, 'Termos 0,75 l', 'Uy-ro‘zg‘or', 119_000, 81_000, [118_000, 125_000]),
  row(3, 'Powerbank 20 000 mAh', 'Elektronika', 239_000, 176_000, [169_000, 255_000, 269_000, 289_000]),
  row(4, 'USB-C kabel 2 m', 'Aksessuarlar', 39_000, 24_000, [45_000, 49_000], 19),
];

const count = (p: string) => ROWS.filter((r) => r.stats.position === p).length;

export const PRICE_MAP_SAMPLE: PriceMapResponse = {
  period: { from: '2026-10-01', to: '2026-10-26' },
  sort: 'gap',
  order: 'desc',
  summary: {
    products: ROWS.length,
    cheaper: count('cheaper'),
    similar: count('similar'),
    pricier: count('pricier'),
    unknown: 0,
    belowBreakEven: ROWS.filter((r) => r.stats.belowBreakEven).length,
    stale: ROWS.filter((r) => r.stats.stale).length,
  },
  categories: ['Aksessuarlar', 'Elektronika', 'Uy-ro‘zg‘or'],
  rows: ROWS,
  limits: { ...COMPETITOR_LIMITS },
};
