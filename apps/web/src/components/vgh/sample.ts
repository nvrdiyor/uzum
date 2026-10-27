import {
  LOGISTICS_FEE,
  TARIFF_EFFECTIVE_FROM,
  billableLiters,
  litersFromLogistics,
  logisticsFee,
  type VghResponse,
  type VghRow,
  type VghStatus,
} from '@savdoiq/shared';

/**
 * Sinov tarifidagi (vgh_report — 'preview') xira NAMUNA. Haqiqiy so'rov
 * yuborilmaydi: 402 javobi qulf oynasi ostida xato holatini chizardi.
 * Nomlar o'ylab topilgan, yig'imlar esa tarifning o'zidan hisoblanadi —
 * namuna ham haqiqiy hisob qoidasi bilan bir xil ko'rinadi.
 */
function sampleRow(id: number, title: string, volumeL: number, weightGr: number, actualFee: number, units: number): VghRow {
  const hasDims = volumeL > 0;
  const expectedFee = hasDims ? (logisticsFee(volumeL) ?? LOGISTICS_FEE.noDimensions) : LOGISTICS_FEE.noDimensions;
  const diff = actualFee - expectedFee;
  const status: VghStatus = !hasDims ? 'no_dimensions' : Math.abs(diff) < LOGISTICS_FEE.perExtraLiter / 2 ? 'ok' : 'mismatch';
  const extraPerUnit = status === 'ok' ? 0 : status === 'mismatch' ? diff : null;
  return {
    skuId: `sample-${id}`,
    sku: `SMP-${String(id).padStart(4, '0')}`,
    title,
    imageUrl: null,
    storeTitle: '',
    volumeL,
    billableL: billableLiters(volumeL),
    weightGr,
    expectedFee,
    actualFee,
    actualL: actualFee >= LOGISTICS_FEE.max ? null : litersFromLogistics(actualFee),
    lines: Math.max(3, Math.round(units * 0.8)),
    units,
    status,
    direction: status === 'mismatch' ? (diff > 0 ? 'over' : 'under') : null,
    extraPerUnit,
    extraTotal: extraPerUnit === null ? null : extraPerUnit * units,
  };
}

const ROWS: VghRow[] = [
  sampleRow(1, 'Elektr choynak 1,8 l', 5.5, 1100, 9_250, 64),
  sampleRow(2, 'Simsiz quloqchin TWS', 0, 120, LOGISTICS_FEE.noDimensions, 41),
  sampleRow(3, 'Gilam 160×230', 28, 7800, 11_250, 9),
  sampleRow(4, 'Paxta choyshab to‘plami', 8, 1600, 7_000, 37),
  sampleRow(5, 'Termos vakuumli 1,2 l', 2.5, 700, 5_750, 52),
];

const count = (s: VghStatus): number => ROWS.filter((r) => r.status === s).length;
const overRows = ROWS.filter((r) => r.direction === 'over');

export const VGH_SAMPLE: VghResponse = {
  period: { from: TARIFF_EFFECTIVE_FROM, to: TARIFF_EFFECTIVE_FROM },
  rules: { minLines: 3, effectiveFrom: TARIFF_EFFECTIVE_FROM },
  totals: {
    skuCount: ROWS.length,
    byStatus: {
      ok: count('ok'),
      mismatch: count('mismatch'),
      no_dimensions: count('no_dimensions'),
      insufficient: count('insufficient'),
    },
    over: overRows.length,
    extraPaid: overRows.reduce((s, r) => s + (r.extraTotal ?? 0), 0),
    extraUnits: overRows.reduce((s, r) => s + r.units, 0),
  },
  rows: { items: ROWS, total: ROWS.length, page: 1, pageSize: ROWS.length, pages: 1 },
};
