import { create } from 'zustand';

/**
 * "Yangiliklar" oynasi ochiqmi (2026-10-27). O'zi bir marta chiqadi, keyin
 * profil menyusi va Ctrl+K dan qayta ochiladi — shuning uchun holat umumiy.
 * Alohida kichik do'kon: store/ui.ts (davr, taqqoslash, do'kon) boshqa
 * ishlar bilan birga tez-tez o'zgaradi, bu holat esa unga bog'liq emas.
 */
interface NewsState {
  open: boolean;
  setOpen: (open: boolean) => void;
}

export const useNews = create<NewsState>((set) => ({
  open: false,
  setOpen: (open) => set({ open }),
}));
