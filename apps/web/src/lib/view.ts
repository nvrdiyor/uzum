/**
 * Ko'rinish shabloni saytda (Membership.view, @savdoiq/shared views.ts).
 *
 * Bitta qoida uch joyda: yon menyu va mobil menyu (`useNavGroups`), Ctrl+K
 * oynasi va sahifa qo'riqchisi (`ViewGate`). Server ham aynan shu ro'yxat
 * bilan 403 qaytaradi va pulni `null` qiladi — sayt faqat yopiq bo'limni
 * ko'rsatmaydi va "—" chizadi.
 */
import { useCallback, useMemo } from 'react';
import {
  asMemberView,
  viewAllowsApi,
  viewAllowsPage,
  viewAllowsSettings,
  viewHomePath,
  viewSeesMoney,
  type MemberView,
  type ViewSettingsSection,
} from '@savdoiq/shared';
import { NAV, type NavGroup } from '@/lib/nav';
import { useSession } from '@/store/session';

/** Joriy kompaniyadagi shablon; egasida va shablonsiz a'zoda null */
export function useView(): MemberView | null {
  return useSession((s) => (s.me?.company?.role === 'owner' ? null : asMemberView(s.me?.company?.view)));
}

/** Tannarx, foyda, marja, to'lov ko'rinadimi (yo'q bo'lsa server ularni null qiladi) */
export function useSeesMoney(): boolean {
  return viewSeesMoney(useView());
}

/** Kirgandan keyingi bosh sahifa: Omborchida — Qoldiqlar */
export function useHomePath(): string {
  return viewHomePath(useView());
}

/** Sahifa shablonda ochiqmi — havola yoki tugmani ko'rsatishdan oldin */
export function useCanOpen(): (path: string) => boolean {
  const view = useView();
  return useCallback((path: string) => viewAllowsPage(view, path), [view]);
}

/**
 * GET so'rov (masalan, Excel eksporti) shablonda ochiqmi. Pulli eksport
 * pulsiz shablonga yopiq — tugmani ko'rsatib, bosilganda 403 berish o'rniga
 * uni umuman chizmaymiz.
 */
export function useCanFetch(path: string): boolean {
  const view = useView();
  return viewAllowsApi(view, 'GET', path);
}

export function useCanSeeSettings(): (section: ViewSettingsSection) => boolean {
  const view = useView();
  return useCallback((section: ViewSettingsSection) => viewAllowsSettings(view, section), [view]);
}

/** Menyu guruhlari shablon bo'yicha: yopiq sahifa ko'rinmaydi, bo'sh guruh tushib qoladi */
export function navForView(view: MemberView | null): NavGroup[] {
  if (!view) return NAV;
  return NAV.map((g) => ({ ...g, items: g.items.filter((i) => viewAllowsPage(view, i.to)) })).filter(
    (g) => g.items.length > 0,
  );
}

export function useNavGroups(): NavGroup[] {
  const view = useView();
  return useMemo(() => navForView(view), [view]);
}
