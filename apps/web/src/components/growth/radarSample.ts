/**
 * "Mening radarim" namunasi — radar faqat pullik tarifda (growth_radar,
 * 2026-10-27), sinovda esa qulf oynasi ostida shu xira namuna ko'rinadi.
 * So'rov yuborilmaydi: 402 javobi qulf ostida xato kartochkasini chizardi
 * (Vgh.tsx, Categories.tsx bilan bir xil). Nomlar o'ylab topilgan, chegaralar
 * esa server (apps/api routes/radar.ts) bilan bir xil.
 */
import type {
  RadarNewStarRow,
  RadarResponse,
  RadarReturnsRow,
  RadarSkuRef,
  RadarStockoutRow,
  RadarVelocityRow,
} from '@savdoiq/shared';

/** 35 kunlik sotuv chizig'i: oxirgi 7 kunda `recent`, undan oldin `base` atrofida */
function daily(base: number, recent: number): number[] {
  return Array.from({ length: 35 }, (_, i) => {
    const level = i < 28 ? base : recent;
    return Math.max(0, Math.round(level + Math.sin(i * 1.7) * level * 0.25));
  });
}

function ref(id: number, title: string, category: string, base: number, recent: number): RadarSkuRef {
  return {
    skuId: `sample-${id}`,
    productId: `sample-${id}`,
    sku: `SMP-${String(id).padStart(4, '0')}`,
    title,
    variant: null,
    imageUrl: null,
    category,
    daily: daily(base, recent),
  };
}

function velocity(id: number, title: string, category: string, prevRate: number, recentRate: number, price: number, stock: number): RadarVelocityRow {
  return {
    ...ref(id, title, category, prevRate, recentRate),
    recentUnits: Math.round(recentRate * 7),
    recentRate,
    prevUnits: Math.round(prevRate * 28),
    prevRate,
    prevInStockDays: 28,
    changePct: Math.round(((recentRate - prevRate) / prevRate) * 100),
    revenuePerDay: Math.round((recentRate - prevRate) * price),
    stock,
    daysLeft: recentRate > 0 ? Math.round(stock / recentRate) : null,
  };
}

const ACCELERATING: RadarVelocityRow[] = [
  velocity(1, 'Simsiz quloqchin Pro', 'Elektronika', 3.1, 7.4, 289_000, 96),
  velocity(2, 'Termos 0,75 l', 'Uy-ro‘zg‘or', 2.2, 4.9, 119_000, 140),
  velocity(3, 'Sport shishasi 1 l', 'Sport', 1.6, 3.3, 69_000, 58),
];

const SLOWING: RadarVelocityRow[] = [
  velocity(4, 'USB-C kabel 2 m', 'Aksessuarlar', 6.2, 2.9, 39_000, 410),
  velocity(5, 'Planshet g‘ilofi', 'Aksessuarlar', 2.4, 1.1, 89_000, 120),
];

const NEW_STARS: RadarNewStarRow[] = [
  {
    ...ref(6, 'Aqlli lampa E27', 'Aqlli uy', 0, 4.1),
    firstSaleDate: '2026-10-09',
    daysOnSale: 18,
    units: 62,
    revenue: 62 * 149_000,
    rate: 3.4,
    stock: 85,
    daysLeft: 25,
  },
];

const STOCKOUT: RadarStockoutRow[] = [
  {
    ...ref(7, 'Powerbank 20 000 mAh', 'Elektronika', 4.5, 4.8),
    status: 'critical',
    stock: 14,
    inbound: 0,
    avgDaily: 4.7,
    daysLeft: 3,
    stockoutDate: '2026-10-30',
    orderBy: '2026-10-20',
    orderInDays: 0,
    recommendedQty: 180,
    lostRevenue: 4_100_000,
  },
  {
    ...ref(8, 'Avtomobil ushlagichi', 'Avto tovarlar', 2.0, 2.3),
    status: 'ending',
    stock: 31,
    inbound: 0,
    avgDaily: 2.2,
    daysLeft: 14,
    stockoutDate: '2026-11-10',
    orderBy: '2026-10-31',
    orderInDays: 4,
    recommendedQty: 90,
    lostRevenue: 0,
  },
];

const RETURNS: RadarReturnsRow[] = [
  {
    ...ref(9, 'Smart-soat S8', 'Elektronika', 1.8, 1.7),
    recentRate: 14.3,
    prevRate: 5.2,
    deltaPp: 9.1,
    recentReturned: 7,
    recentBase: 49,
    prevReturned: 3,
    prevBase: 58,
    returnedAmount: 7 * 349_000,
    topReason: 'Mahsulot tavsifga mos emas',
  },
];

export const RADAR_SAMPLE: RadarResponse = {
  asOf: '2026-10-26',
  windows: {
    recent: { from: '2026-10-20', to: '2026-10-26' },
    previous: { from: '2026-09-22', to: '2026-10-19' },
    returnsRecent: { from: '2026-09-29', to: '2026-10-26' },
    returnsPrevious: { from: '2026-09-01', to: '2026-09-28' },
    newSince: '2026-09-27',
  },
  leadDays: 10,
  skus: 64,
  sellingSkus: 47,
  accelerating: { state: 'ready', count: ACCELERATING.length, rows: ACCELERATING },
  slowing: { state: 'ready', count: SLOWING.length, rows: SLOWING },
  newStars: { state: 'ready', count: NEW_STARS.length, rows: NEW_STARS },
  stockout: { state: 'ready', count: STOCKOUT.length, rows: STOCKOUT },
  returnsRising: { state: 'ready', count: RETURNS.length, rows: RETURNS },
  thresholds: {
    accelMinUnits: 10,
    accelMinPct: 50,
    slowMinPrevUnits: 21,
    slowMinPct: 40,
    minInStockDays: 14,
    newDays: 30,
    newMinUnits: 10,
    newMinRate: 1.5,
    returnsMinBase: 10,
    returnsMinReturned: 3,
    returnsMinPp: 5,
    maxRows: 20,
  },
};
