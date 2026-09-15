import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, ShieldAlert } from 'lucide-react';
import { Button, Card } from '@/components/ui';
import { registerNamespace, useT } from '@/i18n';
import { useSession } from '@/store/session';
import { EASE } from '@/components/landing/primitives';
import { AuthShell, PulseLogo } from '@/components/auth/primitives';

/** Sahifaga xos kalitlar (asosiy 'auth' lug'ati components/auth/primitives.tsx da) */
registerNamespace('auth', {
  uz: { 'cb.steps': 'Token tekshirilmoqda · Sessiya ochilmoqda · Panel tayyorlanmoqda' },
  ru: { 'cb.steps': 'Проверяем токен · Открываем сессию · Готовим панель' },
  en: { 'cb.steps': 'Verifying token · Opening session · Preparing dashboard' },
});

/** Faqat ichki manzillarga o'tkazamiz */
function safePath(path: string | null): string {
  if (!path || !path.startsWith('/') || path.startsWith('//')) return '/dashboard';
  if (path.startsWith('/login') || path.startsWith('/auth')) return '/dashboard';
  return path;
}

export default function AuthCallback() {
  const t = useT('auth');
  const navigate = useNavigate();
  const location = useLocation();
  const login = useSession((s) => s.login);

  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    // Token hash (#token=...) yoki query (?token=...) orqali kelishi mumkin
    const hash = new URLSearchParams(location.hash.replace(/^#/, ''));
    const query = new URLSearchParams(location.search);
    const token = (hash.get('token') ?? query.get('token') ?? '').trim();

    if (!token) {
      setError(t('cb.errNoToken'));
      return;
    }

    void (async () => {
      try {
        const me = await login(token);
        if (!me) {
          setError(t('cb.errInvalid'));
          return;
        }
        navigate(safePath(query.get('next') ?? hash.get('next')), { replace: true });
      } catch {
        setError(t('cb.errInvalid'));
      }
    })();
    // Faqat bir marta — token URL'dan olinadi
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <AuthShell className="justify-center">
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: EASE }}
        className="mx-auto w-full max-w-[420px]"
      >
        {error ? (
          <Card className="p-6 text-center sm:p-8">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-danger/[0.12] text-danger">
              <ShieldAlert className="h-6 w-6" />
            </div>
            <h1 className="mt-5 font-display text-xl font-extrabold tracking-tight text-ink">{t('cb.errTitle')}</h1>
            <p className="mt-2.5 text-sm leading-relaxed text-muted">{error}</p>

            <div className="mt-7 flex flex-col gap-2.5">
              <Link to="/login">
                <Button className="w-full">{t('cb.toLogin')}</Button>
              </Link>
              <Link to="/">
                <Button variant="ghost" className="w-full" icon={<ArrowLeft className="h-4 w-4" />}>
                  {t('cb.home')}
                </Button>
              </Link>
            </div>
          </Card>
        ) : (
          <div className="flex flex-col items-center text-center">
            <PulseLogo size={68} />

            <h1 className="mt-7 font-display text-xl font-extrabold tracking-tight text-ink sm:text-2xl">
              {t('cb.title')}
            </h1>
            <p className="mt-2.5 max-w-xs text-sm leading-relaxed text-muted">{t('cb.subtitle')}</p>

            {/* Noaniq davomiylikdagi progress chizig'i */}
            <div className="mt-7 h-1 w-48 overflow-hidden rounded-full bg-surface-3">
              <motion.div
                className="h-full w-1/3 rounded-full bg-brand"
                animate={{ x: ['-120%', '320%'] }}
                transition={{ duration: 1.3, repeat: Infinity, ease: 'easeInOut' }}
              />
            </div>

            <p className="mt-5 max-w-xs text-2xs leading-relaxed text-muted">{t('cb.steps')}</p>
          </div>
        )}
      </motion.div>
    </AuthShell>
  );
}
