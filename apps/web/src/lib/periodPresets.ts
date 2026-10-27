/**
 * Davr presetlari — YAGONA ro'yxat va tartib. Yuqori paneldagi davr
 * tanlagichi (components/filters.tsx PeriodPicker) va buyruq oynasi
 * (components/palette, "Davr: …" amallari) shu yerdan oladi. Ilgari ro'yxat
 * ikki joyda qo'lda takrorlanardi, faqat "yangi preset qo'shilsa,
 * ikkalasiga" degan izoh bog'lab turardi (2026-10-24).
 *
 * Fayl ATAYLAB alohida va bog'liqliksiz (faqat tip importi — u yig'ishda
 * o'chib ketadi): buyruq oynasi alohida bo'lak bo'lib yuklanadi
 * (palette/PaletteHost.tsx), filters.tsx esa React komponentlari, ikonkalar
 * va sessiya holatini olib keladi — bitta ro'yxat uchun ularni oyna
 * bo'lagiga tortmaslik kerak.
 */
import type { PresetKey } from '@/store/ui';

/** Tanlagichdagi tartib: kun → hafta → sirpanuvchi oynalar → kalendar oy va yil */
export const PERIOD_PRESETS: readonly Exclude<PresetKey, 'custom'>[] = [
  'today',
  'yesterday',
  // Kalendar haftasi (dushanbadan) — "7 kun" dan farqli, hafta boshidan sanaladi
  'thisWeek',
  'lastWeek',
  'last7',
  'last14',
  'last30',
  'last90',
  'thisMonth',
  'lastMonth',
  'thisYear',
];
