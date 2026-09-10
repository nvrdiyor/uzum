import { create } from 'zustand';
import { presetPeriod, type Period } from '@savdoiq/shared';

export type PresetKey =
  | 'today'
  | 'yesterday'
  | 'last7'
  | 'last14'
  | 'last30'
  | 'last90'
  | 'thisMonth'
  | 'lastMonth'
  | 'thisYear'
  | 'custom';

const THEME_KEY = 'sq-theme';
const PERIOD_KEY = 'sq-period';
const STORE_KEY = 'sq-store';
const RAIL_KEY = 'sq-rail';

function readTheme(): 'dark' | 'light' {
  try {
    return (localStorage.getItem(THEME_KEY) as 'dark' | 'light') ?? 'dark';
  } catch {
    return 'dark';
  }
}

function readPreset(): PresetKey {
  try {
    return (localStorage.getItem(PERIOD_KEY) as PresetKey) ?? 'thisMonth';
  } catch {
    return 'thisMonth';
  }
}

function readStore(): string {
  try {
    return localStorage.getItem(STORE_KEY) ?? 'all';
  } catch {
    return 'all';
  }
}

function readRail(): boolean {
  try {
    return localStorage.getItem(RAIL_KEY) === '1';
  } catch {
    return false;
  }
}

interface UiState {
  theme: 'dark' | 'light';
  toggleTheme: () => void;
  setTheme: (t: 'dark' | 'light') => void;

  /** Sidebar ixchamlashgan (faqat ikonkalar) */
  rail: boolean;
  toggleRail: () => void;
  /** Mobil menyu ochiq */
  mobileNav: boolean;
  setMobileNav: (open: boolean) => void;

  preset: PresetKey;
  period: Period;
  setPreset: (p: PresetKey) => void;
  setCustomPeriod: (period: Period) => void;

  storeId: string;
  setStoreId: (id: string) => void;

  commandOpen: boolean;
  setCommandOpen: (open: boolean) => void;
}

const initialPreset = readPreset();

export const useUi = create<UiState>((set, get) => ({
  theme: readTheme(),
  setTheme: (theme) => {
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {
      /* noop */
    }
    document.documentElement.classList.toggle('dark', theme === 'dark');
    document.documentElement.dataset.theme = theme;
    set({ theme });
  },
  toggleTheme: () => get().setTheme(get().theme === 'dark' ? 'light' : 'dark'),

  rail: readRail(),
  toggleRail: () => {
    const rail = !get().rail;
    try {
      localStorage.setItem(RAIL_KEY, rail ? '1' : '0');
    } catch {
      /* noop */
    }
    set({ rail });
  },
  mobileNav: false,
  setMobileNav: (mobileNav) => set({ mobileNav }),

  preset: initialPreset,
  period: presetPeriod(initialPreset === 'custom' ? 'thisMonth' : initialPreset),
  setPreset: (preset) => {
    try {
      localStorage.setItem(PERIOD_KEY, preset);
    } catch {
      /* noop */
    }
    if (preset === 'custom') {
      set({ preset });
      return;
    }
    set({ preset, period: presetPeriod(preset) });
  },
  setCustomPeriod: (period) => set({ preset: 'custom', period }),

  storeId: readStore(),
  setStoreId: (storeId) => {
    try {
      localStorage.setItem(STORE_KEY, storeId);
    } catch {
      /* noop */
    }
    set({ storeId });
  },

  commandOpen: false,
  setCommandOpen: (commandOpen) => set({ commandOpen }),
}));

/** So'rovlar uchun umumiy query parametrlari */
export function usePeriodQuery(): { from: string; to: string; storeId?: string } {
  const period = useUi((s) => s.period);
  const storeId = useUi((s) => s.storeId);
  return { from: period.from, to: period.to, storeId: storeId === 'all' ? undefined : storeId };
}
