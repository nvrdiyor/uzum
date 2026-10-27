/**
 * Rejalashtiruvchi sozlamasi — KOMPANIYA darajasida (server: GET/PUT
 * /planner/settings, CompanySetting 'planner.leadDays' / 'planner.coverDays').
 *
 * Ilgari yetkazish muddati va zaxira davri faqat shu brauzerda (localStorage
 * 'sq-planner') saqlanardi: server esa "Bugun nima qilish kerak", Mahsulotlar
 * va Qoldiqlarda doim 7 kun deb olardi — sotuvchi 14 kun tanlasa ham boshqa
 * sahifalar boshqa son ko'rsatardi (2026-10-24).
 */
import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { PlannerSettings, PlannerSettingsResponse } from '@savdoiq/shared';
import { api } from '@/lib/api';
import { useFeature, useSession } from '@/store/session';

export const PLANNER_SETTINGS_KEY = 'planner-settings';

/** Eski brauzerdagi tanlov — bir marta kompaniya sozlamasiga ko'chiriladi */
const LEGACY_KEY = 'sq-planner';

export function usePlannerSettings() {
  const access = useFeature('planner');
  return useQuery({
    queryKey: [PLANNER_SETTINGS_KEY],
    queryFn: () => api.get<PlannerSettingsResponse>('/planner/settings'),
    // Muddati tugagan obunada bo'lim yopiq — server 402 qaytaradi
    enabled: access !== 'off',
  });
}

/** Kuzatuvchi faqat ko'radi — server ham PUT'ni 403 qiladi (GoalsCard'dagi kabi) */
export function useCanEditPlanner(): boolean {
  return useSession((st) => st.me?.company?.role !== 'viewer');
}

export function useSavePlannerSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: Partial<PlannerSettings>) => api.put<PlannerSettingsResponse>('/planner/settings', patch),
    onSuccess: (data) => {
      qc.setQueryData([PLANNER_SETTINGS_KEY], data);
      // Muddat butun kompaniyaniki: reja, Mahsulotlar, Qoldiqlar, "Bugun" — hammasi yangi son bilan
      void qc.invalidateQueries({ predicate: (q) => q.queryKey[0] !== PLANNER_SETTINGS_KEY });
    },
  });
}

function readLegacy(): Partial<PlannerSettings> | null {
  try {
    const raw = localStorage.getItem(LEGACY_KEY);
    if (!raw) return null;
    const saved = JSON.parse(raw) as { cover?: unknown; lead?: unknown };
    const out: Partial<PlannerSettings> = {};
    const lead = Number(saved.lead);
    const cover = Number(saved.cover);
    if (Number.isInteger(lead) && lead >= 0 && lead <= 120) out.leadDays = lead;
    if (Number.isInteger(cover) && cover >= 7 && cover <= 90) out.coverDays = cover;
    return out;
  } catch {
    return null;
  }
}

function dropLegacy(): void {
  try {
    localStorage.removeItem(LEGACY_KEY);
  } catch {
    // xotira yopiq (maxfiy rejim) — ko'chiradigan narsa ham yo'q
  }
}

/**
 * Brauzerda qolgan eski tanlov (masalan, 14 kun) kompaniya hali o'z
 * sozlamasini saqlamagan bo'lsa — BIR MARTA serverga ko'chiriladi. Aks holda
 * 14 kun tanlagan sotuvchi sahifani ochganda jimgina 7 kun bilan hisob ko'rardi.
 * Standart qiymatlar (7 / 30) ko'chirilmaydi — ular baribir shunday.
 */
export function useMigrateLegacyPlannerParams(settings: PlannerSettingsResponse | undefined): void {
  const canEdit = useCanEditPlanner();
  const save = useSavePlannerSettings();
  const saved = settings?.saved;
  useEffect(() => {
    if (!settings || saved || !canEdit) return;
    const legacy = readLegacy();
    if (!legacy) return;
    const patch: Partial<PlannerSettings> = {};
    if (legacy.leadDays !== undefined && legacy.leadDays !== settings.defaults.leadDays) patch.leadDays = legacy.leadDays;
    if (legacy.coverDays !== undefined && legacy.coverDays !== settings.defaults.coverDays) patch.coverDays = legacy.coverDays;
    dropLegacy();
    if (patch.leadDays !== undefined || patch.coverDays !== undefined) save.mutate(patch);
    // save — har chizishda yangi obyekt; ko'chirish faqat sozlama kelganda bir marta
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings, saved, canEdit]);
}
