import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  TodayAction,
  TodayActionRequest,
  TodayActionResponse,
  TodayResponse,
  TodayTask,
  TodayTaskLevel,
} from '@savdoiq/shared';
import { api } from '@/lib/api';
import { useUi } from '@/store/ui';

export const TODAY_QUERY_KEY = 'dashboard-today';

/**
 * Bugungi vazifalar. Davr tanlagichiga bog'liq EMAS — kalitda davr yo'q.
 *
 * Umumiy standart (1 daqiqa yangi, oynaga qaytganda so'ralmaydi) bu yerda
 * ATAYLAB o'chirilgan: sotuvchi "Tannarx kiritish" ni bosib, tannarxni
 * kiritib, yarim daqiqada qaytadi — tuzatilgan ish ro'yxatda turib qolsa,
 * ro'yxatga ishonch yo'qoladi. Da'vo esa Uzum kabinetida, boshqa varaqda
 * yuboriladi — varaqqa qaytganda ham qayta so'raladi.
 */
export function useToday() {
  const storeId = useUi((s) => s.storeId);
  return useQuery({
    queryKey: [TODAY_QUERY_KEY, storeId],
    queryFn: () => api.get<TodayResponse>('/dashboard/today', { storeId: storeId === 'all' ? undefined : storeId }),
    staleTime: 0,
    refetchOnWindowFocus: true,
  });
}

const LEVEL_RANK: Record<TodayTaskLevel, number> = { danger: 0, warn: 1, info: 2 };

/** Server tartibi (routes/today.ts compareTasks): summa kamayishi bo'yicha, summasizlar oxirida */
function compareTasks(a: TodayTask, b: TodayTask): number {
  if (a.amount !== null && b.amount !== null && a.amount !== b.amount) return b.amount - a.amount;
  if ((a.amount === null) !== (b.amount === null)) return a.amount === null ? 1 : -1;
  return LEVEL_RANK[a.level] - LEVEL_RANK[b.level] || b.count - a.count;
}

function hide(data: TodayResponse, task: TodayTask): TodayResponse {
  return {
    ...data,
    items: data.items.filter((it) => it.key !== task.key),
    hidden: data.hidden + task.keys.length,
  };
}

function restore(data: TodayResponse, task: TodayTask): TodayResponse {
  if (data.items.some((it) => it.key === task.key)) return data;
  return {
    ...data,
    items: [...data.items, task].sort(compareTasks),
    hidden: Math.max(0, data.hidden - task.keys.length),
  };
}

interface ActionVars {
  task: TodayTask;
  action: TodayAction;
}

/**
 * "Bajarildi" / "Keyinroq" / "Qaytarish". Qator darhol yo'qoladi (yoki
 * qaytadi) — server javobini kutib turgan ro'yxat sekin ko'rinadi; xato
 * bo'lsa ro'yxat oldingi holiga qaytadi. Tugagach hamma do'kon filtri
 * qayta so'raladi: boshqa filtrda shu obyekt boshqa guruh qatorida turadi.
 */
export function useTodayAction() {
  const qc = useQueryClient();
  const storeId = useUi((s) => s.storeId);
  const key = [TODAY_QUERY_KEY, storeId];

  return useMutation({
    mutationFn: ({ task, action }: ActionVars) =>
      api.patch<TodayActionResponse>(`/dashboard/today/${encodeURIComponent(task.key)}`, {
        action,
        // Guruh qatori: amal undagi har bir obyektga
        keys: task.keys,
      } satisfies TodayActionRequest),
    onMutate: async ({ task, action }) => {
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<TodayResponse>(key);
      if (prev) qc.setQueryData<TodayResponse>(key, action === 'reset' ? restore(prev, task) : hide(prev, task));
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(key, ctx.prev);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: [TODAY_QUERY_KEY] }),
  });
}
