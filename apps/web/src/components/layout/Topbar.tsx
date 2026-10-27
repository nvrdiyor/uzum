import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Bell, ChevronDown, ChevronRight, Globe, LogOut, Menu, Moon, Settings, Sun, User as UserIcon, Zap } from '@/components/icons';
import { useUi } from '@/store/ui';
import { useSession } from '@/store/session';
import { useLangStore, useT, type Lang } from '@/i18n';
import { PeriodPicker, StoreSwitcher } from '@/components/filters';
import { Avatar } from '@/components/ui';
import { NAV, findNavItem } from '@/lib/nav';
import { cn } from '@/lib/utils';
import { useCanSeeSettings } from '@/lib/view';
import { PaletteTrigger } from '@/components/palette/PaletteTrigger';
import { CompanySwitcher } from '@/components/team/CompanySwitcher';

const LANGS: { id: Lang; label: string; flag: string }[] = [
  { id: 'uz', label: "O'zbek", flag: '🇺🇿' },
  { id: 'ru', label: 'Русский', flag: '🇷🇺' },
  { id: 'en', label: 'English', flag: '🇬🇧' },
];

function useClose(onClose: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [onClose]);
  return ref;
}

function LangMenu() {
  const [open, setOpen] = useState(false);
  const { lang, setLang } = useLangStore();
  const ref = useClose(() => setOpen(false));
  const current = LANGS.find((l) => l.id === lang) ?? LANGS[0];

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex h-9 items-center gap-2 rounded-lg px-2.5 text-sm font-medium text-ink-soft transition-colors hover:bg-surface-2 hover:text-ink"
      >
        <Globe className="h-4 w-4 text-muted" />
        {/*
          Til nomi faqat xl dan: 640–1279 px da yuqori panel to'lib, qator 4–17 px
          ga toshardi (2026-10-24). Tilni Ctrl+K oynasidan ham almashtirish mumkin.
        */}
        <span className="hidden xl:inline">{current.label}</span>
        <ChevronDown className={cn('h-3.5 w-3.5 text-muted transition-transform', open && 'rotate-180')} />
      </button>
      {open ? (
        <div className="absolute right-0 top-11 z-50 w-44 rounded-xl border border-line bg-surface p-1.5 shadow-pop">
          {LANGS.map((l) => (
            <button
              key={l.id}
              onClick={() => {
                setLang(l.id);
                setOpen(false);
              }}
              className={cn(
                'flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors',
                l.id === lang ? 'bg-brand/10 text-brand-ink' : 'text-ink-soft hover:bg-surface-2',
              )}
            >
              <span className="w-6 text-2xs font-semibold uppercase text-muted">{l.id}</span>
              {l.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function ProfileMenu() {
  const [open, setOpen] = useState(false);
  const t = useT('common');
  const me = useSession((s) => s.me);
  const logout = useSession((s) => s.logout);
  const navigate = useNavigate();
  const ref = useClose(() => setOpen(false));

  const name = [me?.user.firstName, me?.user.lastName].filter(Boolean).join(' ') || me?.user.username || t('menu.user');
  // Uzum kabinetini boshqarish — faqat shablonsiz a'zo va egasiga (views.ts: Sozlamalar bo'limlari)
  const canSee = useCanSeeSettings();

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex h-9 items-center gap-2 rounded-lg pl-1 pr-2 transition-colors hover:bg-surface-2"
      >
        <Avatar src={me?.user.photoUrl} name={name} size={28} />
        <span className="hidden max-w-[130px] truncate text-sm font-semibold text-ink md:inline">{name}</span>
        <ChevronDown className={cn('h-3.5 w-3.5 text-muted transition-transform', open && 'rotate-180')} />
      </button>

      {open ? (
        // w-72: kompaniya nomi rol nishoni yonida kesilmasin (almashtirgich shu menyuda)
        <div className="absolute right-0 top-11 z-50 w-72 max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-line bg-surface shadow-pop">
          <div className="border-b border-line p-4">
            <div className="flex items-center gap-3">
              <Avatar src={me?.user.photoUrl} name={name} size={40} />
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-ink">{name}</p>
                <p className="truncate text-xs text-muted">
                  {me?.user.username ? `@${me.user.username}` : me?.company?.name}
                </p>
              </div>
            </div>
          </div>
          {/* Kompaniya almashtirgich — yuqori panelda alohida tugma emas: u ba'zi kengliklarda allaqachon to'la */}
          <CompanySwitcher className="border-b border-line p-1.5" onDone={() => setOpen(false)} />
          <div className="p-1.5">
            <Link
              to="/settings"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm text-ink-soft transition-colors hover:bg-surface-2"
            >
              <Settings className="h-4 w-4" /> {t('nav.settings')}
            </Link>
            <Link
              to="/pricing"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm text-ink-soft transition-colors hover:bg-surface-2"
            >
              <Zap className="h-4 w-4" /> {t('nav.pricing')}
            </Link>
            {canSee('uzum') ? (
              <Link
                to="/settings#uzum"
                onClick={() => setOpen(false)}
                className="flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm text-ink-soft transition-colors hover:bg-surface-2"
              >
                <UserIcon className="h-4 w-4" /> {t('menu.uzum')}
              </Link>
            ) : null}
            <button
              onClick={async () => {
                setOpen(false);
                await logout();
                navigate('/login');
              }}
              className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm text-danger-ink transition-colors hover:bg-danger/10"
            >
              <LogOut className="h-4 w-4" /> {t('menu.logout')}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function Topbar() {
  const t = useT('common');
  const location = useLocation();
  const setMobileNav = useUi((s) => s.setMobileNav);
  const theme = useUi((s) => s.theme);
  const toggleTheme = useUi((s) => s.toggleTheme);
  const unread = useSession((s) => s.me?.unreadNotifications ?? 0);
  const item = findNavItem(location.pathname);
  const group = item ? NAV.find((g) => g.items.includes(item)) : undefined;

  return (
    <header className="sticky top-0 z-30 border-b border-line/70 bg-bg/80 backdrop-blur-md">
      <div className="flex h-16 items-center gap-2 px-4 sm:px-6">
        <button
          onClick={() => setMobileNav(true)}
          className="flex h-9 w-9 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-ink lg:hidden"
          aria-label="Menyu"
        >
          <Menu className="h-5 w-5" />
        </button>

        {/*
          Sahifa yo'li — katta sarlavha sahifaning o'zida turadi.
          overflow-hidden: tor panelda (768–840 px) yo'l 0 px gacha qisiladi, guruh
          nomi esa qisqarmaydi — ilgari u o'ngga toshib, qo'shni tugmalar ostidan
          "M…" bo'lib chiqib turardi (qidiruv belgisi ostida ham).
        */}
        <div className="hidden min-w-0 flex-1 items-center gap-1.5 overflow-hidden text-sm md:flex">
          {group ? (
            <>
              <span className="shrink-0 text-muted">{t(group.titleKey)}</span>
              <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted/60" />
            </>
          ) : null}
          <span className="truncate font-semibold text-ink">{item ? t(item.labelKey) : 'SavdoIQ'}</span>
        </div>

        {/*
          Qidiruv (Ctrl K). Qatordagi bo‘sh joyga qarab o‘zi kichrayadi va sig‘masa
          yashirinadi — panel hech qachon ekrandan chiqmaydi (PaletteTrigger izohi).
        */}
        <PaletteTrigger />

        <div className="flex flex-1 items-center justify-end gap-1.5 md:flex-none">
          <StoreSwitcher className="hidden sm:block" />
          <PeriodPicker />
          {/* Til tanlash telefonda yashiriladi — Sozlamalarda ham bor */}
          <span className="hidden sm:block">
            <LangMenu />
          </span>

          <span className="mx-1 hidden h-5 w-px bg-line sm:block" />

          <button
            onClick={toggleTheme}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-ink"
            aria-label={theme === 'dark' ? t('theme.light') : t('theme.dark')}
          >
            {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>

          <Link
            to="/settings#notifications"
            className="relative flex h-9 w-9 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-ink"
          >
            <Bell className="h-4 w-4" />
            {unread > 0 ? (
              <span className="absolute right-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-2xs font-bold text-white ring-2 ring-bg">
                {unread > 9 ? '9+' : unread}
              </span>
            ) : null}
          </Link>

          <ProfileMenu />
        </div>
      </div>
    </header>
  );
}

export { Globe };
