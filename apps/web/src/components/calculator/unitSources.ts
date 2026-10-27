/**
 * Unit kalkulyatordagi avtomatik (standart) qiymatlar va ularning manbai.
 *
 * Har maydonning yonida belgi turadi: "Uzum tarifi" — qo'llanmadagi tarif
 * (tariffs.ts) yoki Uzum kartochkasidagi qiymat, "Sizning ma'lumotingiz" —
 * sotuv va to'lovlaringizdan, "Taxmin" — ma'lumot yetarli emas. Izohda
 * formula. Belgi maydon avtomatik qiymatga teng tursagina ko'rinadi:
 * qo'lda yozilgan raqam endi hech qaysi manbadan emas (2026-10-24).
 *
 * Saqlash stavkasi Uzumda AYLANMAGA bog'liq: tarif bo'yicha hisoblanganda
 * "Saqlash kunlari" aylanma deb olinadi va kunlik to'lov shundan qayta
 * hisoblanadi (server ham kunlarni aylanmaning o'zidan beradi).
 */
import {
  DEFAULTS,
  FREE_TURNOVER_DAYS,
  LOGISTICS_FEE,
  STORAGE_TARIFF,
  billableLiters,
  logisticsFee,
  storageFeePerDay,
  storageRatePerLiterDay,
  type StorageTariffKind,
  type UnitCalcInput,
} from '@savdoiq/shared';
import type { TFunc } from '@/i18n';
import { literDigits, tierIndex, tierLabel } from './tariff';

export type SourceKind = 'tariff' | 'data' | 'estimate';

export interface FieldSource {
  kind: SourceKind;
  /** Izoh — formula yoki manba tavsifi (tarjima qilingan) */
  formula: string;
}

/** Manba belgisi ko'rsatiladigan maydonlar */
export type AutoField = 'commissionPct' | 'logistics' | 'storagePerDay' | 'storageDays' | 'buyoutPct';
export const AUTO_FIELDS: AutoField[] = ['commissionPct', 'logistics', 'storagePerDay', 'storageDays', 'buyoutPct'];

export interface UnitAuto {
  values: Partial<Record<AutoField, number>>;
  sources: Partial<Record<AutoField, FieldSource>>;
}

/** GET /unit/defaults `basis` (routes/unit.ts UnitDefaultsBasis) */
export interface UnitDefaultsBasis {
  volumeL: number;
  billableL: number;
  category: string | null;
  tariffKind: StorageTariffKind;
  logisticsTariff: number | null;
  units30: number;
  fbo: number;
  stock: number;
  turnoverDays: number | null;
  avgStock15: number;
  avgDaily15: number;
  storagePerItemMonth: number;
  /** Yangi SKU bepul davri va undan qolgan kun (yoshi noma'lum yoki o'tib ketgan — 0) */
  newSkuFreeDays: number;
  newSkuFreeLeft: number;
}

/** GET /unit/defaults — kalkulyatorga kerakli qismi */
export interface UnitDefaultsFull {
  skuId?: string;
  title?: string | null;
  input?: Partial<UnitCalcInput>;
  source?: Partial<{
    commission: 'sales' | 'company' | 'catalogue' | 'default';
    logistics: 'sales' | 'tariff' | 'company' | 'default';
    storage: 'fees' | 'catalogue' | 'tariff' | 'none' | 'default';
    storageDays: 'turnover' | 'stock' | 'default';
    buyout: 'sales' | 'default';
  }>;
  basis?: UnitDefaultsBasis;
}

export interface Fmt {
  money: (v: number) => string;
  num: (v: number, digits?: number) => string;
  pct: (v: number, digits?: number) => string;
}

export interface AutoArgs {
  /** Tanlangan SKU uchun server javobi (bo'lmasa — qo'lda rejim) */
  sku: UnitDefaultsFull | null;
  /** Qo'lda rejimda Litrovka bo'limida kiritilgan hajm; kiritilmagan bo'lsa null */
  manualVolume: number | null;
  manualKind: StorageTariffKind;
  /** Formadagi joriy "Saqlash kunlari" — tarif stavkasi shundan */
  storageDays: number;
  /** Qo'lda rejimdagi namunaviy qiymatlar (components/unit DEFAULT_INPUT) */
  base: UnitCalcInput;
}

const liters = (f: Fmt, v: number): string => f.num(v, literDigits(v));

/** Logistika formulasi (tariffs.ts): 5 250 + (litr − 1) × 250, ko'pi bilan 50 000 */
export function logisticsFormula(t: TFunc, f: Fmt, volumeL: number): string {
  const l = billableLiters(volumeL);
  const fee = logisticsFee(volumeL) ?? LOGISTICS_FEE.noDimensions;
  const raw = LOGISTICS_FEE.base + Math.max(0, l - 1) * LOGISTICS_FEE.perExtraLiter;
  const v = liters(f, volumeL);
  if (l <= 1) return t('logistics.tariffBase', { v, fee: f.money(fee) });
  const common = { v, l, base: f.num(LOGISTICS_FEE.base), extra: f.num(LOGISTICS_FEE.perExtraLiter) };
  return raw > LOGISTICS_FEE.max
    ? t('logistics.tariffCap', { ...common, raw: f.money(raw), max: f.money(LOGISTICS_FEE.max) })
    : t('logistics.tariff', { ...common, fee: f.money(fee) });
}

/** Saqlash formulasi: aylanma guruhi, litr × stavka, bir dona uchun chegara */
export function storageFormula(t: TFunc, f: Fmt, volumeL: number, days: number, kind: StorageTariffKind): string {
  const rate = storageRatePerLiterDay(days, kind);
  const suffix = kind === 'reduced' ? ` · ${t('storage.reduced')}` : '';
  if (rate === 0) return t('storage.tariffFree', { d: f.num(days), free: FREE_TURNOVER_DAYS }) + suffix;
  const l = Math.max(1, billableLiters(volumeL));
  const raw = l * rate;
  const cap = STORAGE_TARIFF[kind].capPerItemDay;
  const common = { d: f.num(days), tier: tierLabel(tierIndex(days)), l, rate: f.num(rate) };
  const text =
    raw > cap
      ? t('storage.tariffCap', { ...common, raw: f.money(raw), cap: f.money(cap) })
      : t('storage.tariffPaid', { ...common, fee: f.money(raw) });
  return `${text}${suffix}. ${t('storage.follow')}`;
}

/** Tarif bo'yicha bir dona kunlik saqlash; hajm noma'lum — 1 litr (eng kichik) deb */
function tariffPerDay(volumeL: number | null, days: number, kind: StorageTariffKind): number {
  return storageFeePerDay({ units: 1, volumeL: volumeL && volumeL > 0 ? volumeL : 1, turnover: days, kind });
}

export function buildUnitAuto(a: AutoArgs, t: TFunc, f: Fmt): UnitAuto {
  const values: UnitAuto['values'] = {};
  const sources: UnitAuto['sources'] = {};
  const set = (field: AutoField, value: number | undefined, kind: SourceKind, formula: string) => {
    if (value === undefined || !Number.isFinite(value)) return;
    values[field] = value;
    sources[field] = { kind, formula };
  };

  const sku = a.sku;
  const basis = sku?.basis;
  if (sku && basis && sku.input) {
    const input = sku.input;
    const src = sku.source ?? {};

    // ── Komissiya ──
    switch (src.commission) {
      case 'sales':
        set('commissionPct', input.commissionPct, 'data', t('commission.sales', { n: f.num(basis.units30) }));
        break;
      case 'company':
        set('commissionPct', input.commissionPct, 'data', t('commission.company'));
        break;
      case 'catalogue':
        set('commissionPct', input.commissionPct, 'tariff', t('commission.catalogue'));
        break;
      default:
        set('commissionPct', input.commissionPct, 'estimate', t('commission.default', { pct: f.pct(DEFAULTS.commissionPct, 0) }));
    }

    // ── Logistika ──
    switch (src.logistics) {
      case 'sales': {
        const tariff = basis.logisticsTariff;
        const diff =
          tariff !== null && input.logistics !== undefined && Math.abs(input.logistics - tariff) >= LOGISTICS_FEE.perExtraLiter / 2;
        set(
          'logistics',
          input.logistics,
          'data',
          `${t('logistics.sales', { n: f.num(basis.units30) })}${diff && tariff !== null ? `. ${t('logistics.salesDiff', { fee: f.money(tariff) })}` : ''}`,
        );
        break;
      }
      case 'tariff':
        set('logistics', input.logistics, 'tariff', `${logisticsFormula(t, f, basis.volumeL)}. ${t('logistics.fromCard')}`);
        break;
      case 'company':
        set('logistics', input.logistics, 'data', t('logistics.company'));
        break;
      default:
        set('logistics', input.logistics, 'estimate', t('logistics.default', { fee: f.money(DEFAULTS.logisticsPerUnit) }));
    }

    // ── Saqlash (kuniga) ──
    switch (src.storage) {
      case 'fees':
        set('storagePerDay', input.storagePerDay, 'data', t('storage.fees'));
        break;
      case 'catalogue':
        set('storagePerDay', input.storagePerDay, 'tariff', t('storage.catalogue', { m: f.money(basis.storagePerItemMonth) }));
        break;
      case 'tariff': {
        /*
         * Yangi SKU bepul davri (server `newSkuFreeLeft`): shuncha kun to'lov
         * olinmaydi, kunlik summa butun muddatga o'rtacha — kalkulyator
         * "kunlik × kunlar" ni oladi (routes/unit.ts bilan bir xil).
         */
        const perDay = tariffPerDay(basis.volumeL, a.storageDays, basis.tariffKind);
        const freeLeft = Math.min(a.storageDays, basis.newSkuFreeLeft ?? 0);
        const formula = storageFormula(t, f, basis.volumeL, a.storageDays, basis.tariffKind);
        if (freeLeft > 0 && perDay > 0 && a.storageDays > 0) {
          const paid = a.storageDays - freeLeft;
          set(
            'storagePerDay',
            Math.round((perDay * paid) / a.storageDays),
            'tariff',
            `${formula}. ${t('storage.newSku', { d: basis.newSkuFreeDays, left: f.num(freeLeft), paid: f.num(paid), days: f.num(a.storageDays) })}`,
          );
        } else set('storagePerDay', perDay, 'tariff', formula);
        break;
      }
      case 'none':
        set('storagePerDay', input.storagePerDay, 'tariff', t('storage.none'));
        break;
      default:
        set('storagePerDay', input.storagePerDay, 'estimate', t('storage.noVolume'));
    }

    // ── Saqlash kunlari ──
    switch (src.storageDays) {
      case 'turnover':
        set(
          'storageDays',
          input.storageDays,
          'data',
          basis.turnoverDays === null
            ? t('days.noSales')
            : t('days.turnover', { stock: f.num(basis.avgStock15, 1), daily: f.num(basis.avgDaily15, 2) }),
        );
        break;
      case 'stock':
        set(
          'storageDays',
          input.storageDays,
          'data',
          t('days.stock', { stock: f.num(basis.stock), daily: f.num(basis.units30 / 30, 2) }),
        );
        break;
      default:
        set('storageDays', input.storageDays, 'estimate', t('days.default'));
    }

    // ── Sotib olish ulushi ──
    if (src.buyout === 'sales') set('buyoutPct', input.buyoutPct, 'data', t('buyout.sales'));
    else set('buyoutPct', input.buyoutPct, 'estimate', t('buyout.default'));
    return { values, sources };
  }

  // ── Qo'lda rejim: namunaviy qiymatlar va (kiritilgan bo'lsa) Litrovka hajmi ──
  const base = a.base;
  const volume = a.manualVolume && a.manualVolume > 0 ? a.manualVolume : null;
  set('commissionPct', base.commissionPct, 'estimate', t('commission.default', { pct: f.pct(DEFAULTS.commissionPct, 0) }));
  if (volume !== null) {
    set('logistics', logisticsFee(volume) ?? undefined, 'tariff', `${logisticsFormula(t, f, volume)}. ${t('logistics.fromLitr')}`);
  } else {
    set('logistics', base.logistics, 'estimate', t('logistics.default', { fee: f.money(base.logistics) }));
  }
  const free = storageRatePerLiterDay(a.storageDays, a.manualKind) === 0;
  if (volume !== null || free) {
    // Aylanma ≤ 60 bo'lsa hajmdan qat'i nazar bepul — bu tarifning o'zi, taxmin emas
    set(
      'storagePerDay',
      tariffPerDay(volume, a.storageDays, a.manualKind),
      'tariff',
      storageFormula(t, f, volume ?? 1, a.storageDays, a.manualKind),
    );
  } else {
    set(
      'storagePerDay',
      tariffPerDay(null, a.storageDays, a.manualKind),
      'estimate',
      `${t('storage.guess1l')}. ${storageFormula(t, f, 1, a.storageDays, a.manualKind)}`,
    );
  }
  set('storageDays', base.storageDays, 'estimate', t('manual.sample'));
  set('buyoutPct', base.buyoutPct, 'estimate', t('buyout.default'));
  return { values, sources };
}
