/**
 * Litrovka kalkulyatori — sof hisob (React'siz, alohida sinab ko'rish uchun).
 * Barcha qoidalar shared tariffs.ts dan (Uzum qo'llanmasi, 01.06.2026 dan):
 * litr = U × E × B (mm) ÷ 1 000 000, butun songa YUQORIGA; logistika har
 * sotilgan donaga 5 250 + har qo'shimcha litr 250 (ko'pi bilan 50 000);
 * saqlash aylanma bo'yicha (60 kungacha bepul), bir dona uchun kunlik chegara
 * bilan (2026-10-24).
 */
import {
  LOGISTICS_FEE,
  STORAGE_TARIFF,
  billableLiters,
  logisticsFee,
  storageFeePerDay,
  storageRatePerLiterDay,
  volumeFromDims,
  type StorageTariffKind,
} from '@savdoiq/shared';
import { tierIndex } from './tariff';

export type LitrMode = 'mm' | 'l';
export type Dim = 'length' | 'width' | 'height';
export const DIMS: Dim[] = ['length', 'width', 'height'];

export interface LitrInput {
  /** O'lcham millimetrda (U × E × B) yoki to'g'ridan-to'g'ri litr */
  mode: LitrMode;
  length: number;
  width: number;
  height: number;
  liters: number;
  /** Uzum omboridagi dona */
  units: number;
  /** Kutilgan aylanma, kun */
  turnover: number;
  kind: StorageTariffKind;
}

/**
 * Boshlang'ich qiymat — qo'llanmadagi misolning o'zi (500 × 380 × 300 mm =
 * 57 l → 19 250 so'm): sotuvchi natijani qo'llanma bilan darhol solishtiradi.
 * Aylanma 90 kun — pullik guruh ham ko'rinsin.
 */
export const LITR_EXAMPLE: LitrInput = {
  mode: 'mm',
  length: 500,
  width: 380,
  height: 300,
  liters: 57,
  units: 100,
  turnover: 90,
  kind: 'standard',
};

/** Aylanma uchun tezkor tanlov, kun */
export const TURNOVER_CHIPS = [30, 60, 90, 180, 365] as const;
/** "Oyiga" — 30 kun */
export const MONTH_DAYS = 30;
/** Maydon chegaralari */
export const MAX_DIM_MM = 10_000;
export const MAX_LITERS = 10_000;
export const MAX_TURNOVER = 999;

/** Logistika chegarasi (50 000) qaysi litrdan boshlanadi: 1 + (50 000 − 5 250) ÷ 250 = 180 */
export const LOGISTICS_CAP_LITERS =
  1 + Math.ceil((LOGISTICS_FEE.max - LOGISTICS_FEE.base) / LOGISTICS_FEE.perExtraLiter);

export interface LitrTip {
  /** Qaysi o'lcham kichraytiriladi */
  dim: Dim;
  from: number;
  to: number;
  /** Necha mm */
  cut: number;
}

export interface LitrSaving {
  /** Hozir va keyin hisoblanadigan litr */
  fromL: number;
  toL: number;
  /** Litr rejimida: hajmdan shuncha litr kamaytirish kerak */
  needL: number;
  /** Har sotilgan (yetkazilgan) donaga logistikadan tejash */
  logistics: number;
  /** Berilgan qoldiq uchun oyiga saqlashdan tejash */
  storageMonth: number;
  /** mm rejimida — eng kichik qisqartirish */
  tip: LitrTip | null;
}

export interface LitrResult {
  /** Aniq hajm, litr (0 — kiritilmagan) */
  volume: number;
  /** Uzum hisoblaydigan litr (0 — hajm yo'q) */
  billable: number;
  /** Bir dona logistikasi; hajm yo'q — null */
  logistics: number | null;
  /** Chegaragacha bo'lgan "xom" summa — formula qatori arifmetik jihatdan to'g'ri chiqsin */
  logisticsRaw: number;
  /** 50 000 chegarasiga yetdi */
  logisticsCapped: boolean;
  /** Aylanma guruhi (0 — bepul) va stavka, so'm/l/kun */
  tier: number;
  rate: number;
  /** Bir dona uchun kunlik saqlash (chegara bilan) */
  perItemDay: number;
  /** litr × stavka chegaradan oshdi */
  perItemCapped: boolean;
  /** Bir dona omborda aylanma kunicha turadi: kunlik × aylanma */
  perItemStay: number;
  /** Butun qoldiq: kuniga va oyiga */
  perDayAll: number;
  perMonthAll: number;
  units: number;
  /** Bir litr kamaytirish foydasi; 1 litrgacha yoki hajm yo'q bo'lsa null */
  saving: LitrSaving | null;
}

const positive = (v: number): number => (Number.isFinite(v) && v > 0 ? v : 0);

export function litrVolume(inp: LitrInput): number {
  return inp.mode === 'mm' ? volumeFromDims(inp.length, inp.width, inp.height) : positive(inp.liters);
}

function storagePerItemDay(volumeL: number, turnover: number, kind: StorageTariffKind): number {
  return storageFeePerDay({ units: 1, volumeL, turnover, kind });
}

/**
 * Bitta o'lchamni eng kam qancha kichraytirsa, hisoblanadigan litr bittaga
 * tushadi. Butun millimetrda: shu o'lcham uchun `billable(…) ≤ L − 1` bo'ladigan
 * eng KATTA butun qiymat. Har o'lcham alohida, qolgan ikkitasi o'zgarmaydi.
 */
export function smallestCut(inp: LitrInput, targetL: number): LitrTip | null {
  if (targetL < 1) return null;
  let best: LitrTip | null = null;
  for (const dim of DIMS) {
    const from = inp[dim];
    const others = DIMS.filter((d) => d !== dim).reduce((p, d) => p * inp[d], 1);
    if (!(from > 0) || !(others > 0)) continue;
    const volWith = (v: number) => volumeFromDims(...(DIMS.map((d) => (d === dim ? v : inp[d])) as [number, number, number]));
    // Tenglamadan taxmin (+1 — tariffs.ts dagi 1e-6 litr bardoshi), keyin aniq tekshiruv bilan tuzatiladi
    let to = Math.floor((targetL * 1_000_000 + 1) / others);
    while (to > 0 && billableLiters(volWith(to)) > targetL) to -= 1;
    while (to + 1 < from && billableLiters(volWith(to + 1)) <= targetL) to += 1;
    if (to <= 0 || to >= from) continue;
    const cut = from - to;
    if (!best || cut < best.cut) best = { dim, from, to, cut };
  }
  return best;
}

export function computeLitrovka(inp: LitrInput): LitrResult {
  const volume = litrVolume(inp);
  const billable = billableLiters(volume);
  const logistics = logisticsFee(volume);
  const logisticsRaw = billable > 0 ? LOGISTICS_FEE.base + (billable - 1) * LOGISTICS_FEE.perExtraLiter : 0;
  const turnover = Math.max(0, inp.turnover || 0);
  const kind = inp.kind;
  const rate = storageRatePerLiterDay(turnover, kind);
  const perItemDay = storagePerItemDay(volume, turnover, kind);
  const units = Math.max(0, Math.floor(inp.units || 0));

  let saving: LitrSaving | null = null;
  if (billable >= 2) {
    const toL = billable - 1;
    const newLogistics = logisticsFee(toL) ?? 0;
    const newPerItemDay = storagePerItemDay(toL, turnover, kind);
    saving = {
      fromL: billable,
      toL,
      needL: Math.max(0, volume - toL),
      logistics: Math.max(0, (logistics ?? 0) - newLogistics),
      storageMonth: Math.max(0, units * MONTH_DAYS * (perItemDay - newPerItemDay)),
      tip: inp.mode === 'mm' ? smallestCut(inp, toL) : null,
    };
  }

  return {
    volume,
    billable,
    logistics,
    logisticsRaw,
    logisticsCapped: logistics !== null && logisticsRaw > LOGISTICS_FEE.max,
    tier: tierIndex(turnover),
    rate,
    perItemDay,
    perItemCapped: billable * rate > STORAGE_TARIFF[kind].capPerItemDay,
    perItemStay: perItemDay * turnover,
    perDayAll: units * perItemDay,
    perMonthAll: units * perItemDay * MONTH_DAYS,
    units,
    saving,
  };
}
