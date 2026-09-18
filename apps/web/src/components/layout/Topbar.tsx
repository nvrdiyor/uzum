import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Bell, ChevronDown, Globe, LogOut, Menu, Moon, Settings, Sun, User as UserIcon, Zap } from 'lucide-react';
import { useUi } from '@/store/ui';
import { useSession } from '@/store/session';
import { useLangStore, useT, type Lang } from '@/i18n';
import { PeriodPicker, StoreSwitcher } from '@/components/filters';
import { Avatar } from '@/components/ui';
import { findNavItem } from '@/lib/nav';
import { cn } from '@/lib/utils';

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
        className="flex h-10 items-center gap-2 rounded-xl border border-line bg-surface px-3 text-sm font-medium text-ink transition-colors hover:border-line-strong"
      >
        <span className="text-base leading-none">{current.flag}</span>
        <span className="hidden sm:inline">{current.label}</span>
        <ChevronDown className={cn('h-3.5 w-3.5 text-muted transition-transform', open && 'rotate-180')} />
      </button>
      {open ? (
        <div className="absolute right-0 top-12 z-50 w-44 rounded-2xl border border-line bg-surface p-1.5 shadow-pop">
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
              <span className="text-base">{l.flag}</span>
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

  const name = [me?.user.firstName, me?.user.lastName].filter(Boolean).join(' ') || me?.user.username || 'Foydalanuvchi';

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex h-10 items-center gap-2.5 rounded-xl border border-line bg-surface pl-1.5 pr-3 transition-colors hover:border-line-strong"
      >
        <Avatar src={me?.user.photoUrl} name={name} size={28} />
        <span className="hidden max-w-[130px] truncate text-sm font-semibold text-ink md:inline">{name}</span>
        <ChevronDown className={cn('h-3.5 w-3.5 text-muted transition-transform', open && 'rotate-180')} />
      </button>

      {open ? (
        <div className="absolute right-0 top-12 z-50 w-64 overflow-hidden rounded-2xl border border-line bg-surface shadow-pop">
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
            <Link
              to="/settings#uzum"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm text-ink-soft transition-colors hover:bg-surface-2"
            >
              <UserIcon className="h-4 w-4" /> Uzum kabinet
            </Link>
            <button
              onClick={async () => {
                setOpen(false);
                await logout();
                navigate('/login');
              }}
              className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm text-danger-ink transition-colors hover:bg-danger/10"
            >
              <LogOut className="h-4 w-4" /> Chiqish
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

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-bg/85 backdrop-blur-xl">
      <div className="flex h-16 items-center gap-3 px-4 sm:px-6">
        <button
          onClick={() => setMobileNav(true)}
          className="flex h-10 w-10 items-center justify-center rounded-xl border border-line text-muted lg:hidden"
          aria-label="Menyu"
        >
          <Menu className="h-5 w-5" />
        </button>

        <div className="hidden min-w-0 flex-1 md:block">
          <p className="truncate font-display text-base font-bold text-ink">{item ? t(item.labelKey) : 'SavdoIQ'}</p>
        </div>

        <div className="flex flex-1 items-center justify-end gap-2 md:flex-none">
          <StoreSwitcher className="hidden sm:block" />
          <PeriodPicker />
          {/* Til tanlash telefonda yashiriladi — Sozlamalarda ham bor */}
          <span className="hidden sm:block">
            <LangMenu />
          </span>

          <button
            onClick={toggleTheme}
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-line bg-surface text-muted transition-colors hover:text-ink"
            aria-label={theme === 'dark' ? t('theme.light') : t('theme.dark')}
          >
            {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>

          <Link
            to="/settings#notifications"
            className="relative flex h-10 w-10 items-center justify-center rounded-xl border border-line bg-surface text-muted transition-colors hover:text-ink"
          >
            <Bell className="h-4 w-4" />
            {unread > 0 ? (
              <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-2xs font-bold text-white">
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
