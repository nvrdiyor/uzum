import { create } from 'zustand';
import type { MeResponse, FeatureId, FeatureAccess, PlanId } from '@savdoiq/shared';
import { api, getCompanyId, setCompanyId, setToken, getToken } from '@/lib/api';

interface SessionState {
  me: MeResponse | null;
  loading: boolean;
  error: string | null;
  /** Sessiya tekshirildimi (ilova yuklanganda) */
  ready: boolean;
  load: () => Promise<MeResponse | null>;
  login: (token: string) => Promise<MeResponse | null>;
  logout: () => Promise<void>;
  switchCompany: (companyId: string) => Promise<void>;
  patchMe: (patch: Partial<MeResponse>) => void;
}

export const useSession = create<SessionState>((set, get) => ({
  me: null,
  loading: false,
  error: null,
  ready: false,

  load: async () => {
    if (!getToken()) {
      set({ ready: true, me: null });
      return null;
    }
    set({ loading: true, error: null });
    try {
      const me = await api.get<MeResponse>('/auth/me');
      if (me.company && me.company.id !== getCompanyId()) setCompanyId(me.company.id);
      set({ me, loading: false, ready: true });
      return me;
    } catch (err) {
      set({
        me: null,
        loading: false,
        ready: true,
        error: err instanceof Error ? err.message : 'error',
      });
      return null;
    }
  },

  login: async (token: string) => {
    setToken(token);
    return get().load();
  },

  logout: async () => {
    try {
      await api.post('/auth/logout');
    } catch {
      /* noop */
    }
    setToken(null);
    setCompanyId(null);
    set({ me: null, ready: true });
  },

  switchCompany: async (companyId: string) => {
    setCompanyId(companyId);
    await get().load();
  },

  patchMe: (patch) => {
    const me = get().me;
    if (me) set({ me: { ...me, ...patch } });
  },
}));

// ─────────────────────────── Yordamchi selektorlar ───────────────────────────

export function useFeature(feature: FeatureId): FeatureAccess {
  return useSession((s) => s.me?.features?.[feature] ?? 'off');
}

/** Obuna hozir amal qiladimi (holati faol va muddati o'tmagan) */
function isSubActive(sub: { status?: string; expiresAt?: string | null } | null | undefined): boolean {
  if (!sub) return false;
  if (sub.status && sub.status !== 'active') return false;
  if (sub.expiresAt && new Date(sub.expiresAt).getTime() <= Date.now()) return false;
  return true;
}

/**
 * Joriy tarif. Muddati tugagan bo'lsa `trial` qaytariladi — server ham shunday
 * ishlaydi. Ilgari sayt eski tarifni amaldagi deb hisoblab, davr tanlagichi
 * va bo'limlarni serverdan kengroq ochib berardi.
 */
export function usePlan(): PlanId {
  return useSession((s) => (isSubActive(s.me?.subscription) ? (s.me!.subscription!.plan as PlanId) : 'trial'));
}

export function useIsAdmin(): boolean {
  return useSession((s) => s.me?.user.role === 'admin');
}

export function useStores() {
  return useSession((s) => s.me?.stores ?? []);
}

export function useSubscription() {
  return useSession((s) => s.me?.subscription ?? null);
}

/** Onboarding tugallanganmi (API kalit ulangan va sinxron tugagan) */
export function useNeedsOnboarding(): boolean {
  return useSession((s) => {
    if (!s.me) return false;
    // Administrator kompaniyasiz ishlaydi — uni onboardingga yubormaymiz
    if (s.me.user.role === 'admin') return false;
    if (!s.me.company) return true;
    if (s.me.company.onboardStep !== 'done') return true;
    return false;
  });
}
