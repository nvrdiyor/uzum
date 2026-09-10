import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { LogIn, Menu, Moon, Sun, X } from 'lucide-react';
import { Button, IconButton } from '@/components/ui';
import { useLangStore, useT, type Lang } from '@/i18n';
import { useUi } from '@/store/ui';
import { cn } from '@/lib/utils';
import { EASE, LandingLogo, scrollToId } from './primitives';

const LINKS: { id: string; key: string }[] = [
  { id: 'features', key: 'nav.features' },
  { id: 'how', key: 'nav.how' },
  { id: 'pricing', key: 'nav.pricing' },
  { id: 'faq', key: 'nav.faq' },
];

const LANGS: Lang[] = ['uz', 'ru', 'en'];

function LangSwitch({ className }: { className?: string }) {
  const lang = useLangStore((s) => s.lang);
  const setLang = useLangStore((s) => s.setLang);
  return (
    <div className={cn('inline-flex items-center rounded-xl border border-line bg-surface-2 p-0.5', className)}>
      {LANGS.map((l) => (
        <button
          key={l}
          type="button"
          onClick={() => setLang(l)}
          className={cn(
            'rounded-lg px-2 py-1 text-2xs font-bold uppercase tracking-wide transition-all duration-200',
            lang === l ? 'bg-surface text-ink shadow-card' : 'text-muted hover:text-ink',
          )}
        >
          {l}
        </button>
      ))}
    </div>
  );
}

/** Landing sahifasining shaffof, "yopishqoq" headeri */
export function LandingHeader() {
  const t = useT('landing');
  const tc = useT('common');
  const theme = useUi((s) => s.theme);
  const toggleTheme = useUi((s) => s.toggleTheme);
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 10);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  const go = (id: string) => {
    setOpen(false);
    window.setTimeout(() => scrollToId(id), 60);
  };

  return (
    <header
      className={cn(
        'sticky top-0 z-50 border-b transition-all duration-300 ease-spring',
        scrolled || open ? 'glass border-line' : 'border-transparent',
      )}
    >
      <div className="mx-auto flex h-16 w-full max-w-[1200px] items-center justify-between gap-4 px-5 sm:px-8">
        <LandingLogo />

        <nav className="hidden items-center gap-0.5 lg:flex">
          {LINKS.map((l) => (
            <button
              key={l.id}
              type="button"
              onClick={() => go(l.id)}
              className="rounded-lg px-3.5 py-2 text-sm font-medium text-ink-soft transition-colors hover:bg-surface-2 hover:text-ink"
            >
              {t(l.key)}
            </button>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <LangSwitch className="hidden sm:inline-flex" />
          <IconButton
            onClick={toggleTheme}
            label={theme === 'dark' ? tc('theme.light') : tc('theme.dark')}
            className="hidden sm:inline-flex"
          >
            {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </IconButton>
          <Link to="/login" className="hidden sm:inline-flex">
            <Button size="sm" icon={<LogIn className="h-3.5 w-3.5" />}>
              {t('nav.login')}
            </Button>
          </Link>
          <IconButton
            className="lg:hidden"
            label={t('nav.menu')}
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
          >
            {open ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </IconButton>
        </div>
      </div>

      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            key="mobile-menu"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.28, ease: EASE }}
            className="overflow-hidden border-t border-line lg:hidden"
          >
            <div className="mx-auto w-full max-w-[1200px] space-y-1.5 px-5 py-4 sm:px-8">
              {LINKS.map((l) => (
                <button
                  key={l.id}
                  type="button"
                  onClick={() => go(l.id)}
                  className="block w-full rounded-xl px-3.5 py-2.5 text-left text-sm font-medium text-ink-soft transition-colors hover:bg-surface-2 hover:text-ink"
                >
                  {t(l.key)}
                </button>
              ))}
              <div className="flex items-center justify-between gap-3 pt-2">
                <LangSwitch />
                <IconButton onClick={toggleTheme} label={theme === 'dark' ? tc('theme.light') : tc('theme.dark')}>
                  {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                </IconButton>
              </div>
              <Link to="/login" className="block pt-1">
                <Button className="w-full" icon={<LogIn className="h-4 w-4" />}>
                  {t('nav.login')}
                </Button>
              </Link>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </header>
  );
}
