import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { GoalsResponse, GoalsUpdateRequest, GoalsUpdateResponse } from '@savdoiq/shared';
import { api } from '@/lib/api';
import { useUi } from '@/store/ui';

export const GOALS_QUERY_KEY = 'dashboard-goals';

/**
 * Joriy oy natijasi va maqsadlar. Davr tanlagichiga bog'liq EMAS — kalitda
 * davr yo'q, panelda "7 kun" tanlansa ham qayta so'ralmaydi. Oy natijasi
 * sinxron bilan (15–60 daqiqada) o'zgaradi, shuning uchun 5 daqiqa yangi
 * hisoblanadi. `storeId` server tomonida e'tiborsiz (maqsad kompaniya
 * darajasida), lekin kalitda turadi — filtr almashsa javobdagi `scope` ham
 * yangidan o'qiladi.
 */
export function useGoals() {
  const storeId = useUi((s) => s.storeId);
  const query = useQuery({
    queryKey: [GOALS_QUERY_KEY, storeId],
    queryFn: () => api.get<GoalsResponse>('/dashboard/goals', { storeId: storeId === 'all' ? undefined : storeId }),
    staleTime: 5 * 60_000,
  });
  return { ...query, storeFiltered: storeId !== 'all' };
}

export function useSaveGoals() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: GoalsUpdateRequest) => api.put<GoalsUpdateResponse>('/dashboard/goals', body),
    // Hamma do'kon filtri kalitlari — maqsad kompaniya darajasida, hammasida bir xil
    onSuccess: () => qc.invalidateQueries({ queryKey: [GOALS_QUERY_KEY] }),
  });
}
