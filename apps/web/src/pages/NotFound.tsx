import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, Compass, LifeBuoy } from 'lucide-react';
import { Button } from '@/components/ui';
import { registerNamespace, useT } from '@/i18n';
import { useSession } from '@/store/session';
import { EASE } from '@/components/landing/primitives';
import { AuthShell } from '@/components/auth/primitives';

registerNamespace('notfound', {
  uz: {
    badge: 'Sahifa topilmadi',
    title: 'Bu manzilda hech narsa yo‘q',
    text: 'Havola eskirgan, noto‘g‘ri yozilgan yoki sahifa boshqa bo‘limga ko‘chirilgan bo‘lishi mumkin.',
    dashboard: 'Boshqaruv paneliga',
    home: 'Bosh sahifaga',
    back: 'Orqaga qaytish',
    help: 'Muammo takrorlansa — Telegram’dagi qo‘llab-quvvatlash xizmatiga yozing.',
  },
  ru: {
    badge: 'Страница не найдена',
    title: 'По этому адресу ничего нет',
    text: 'Ссылка могла устареть, быть набрана с ошибкой или страница переехала в другой раздел.',
    dashboard: 'В дашборд',
    home: 'На главную',
    back: 'Вернуться назад',
    help: 'Если повторяется — напишите в поддержку в Telegram.',
  },
  en: {
    badge: 'Page not found',
    title: 'There is nothing at this address',
    text: 'The link may be outdated, mistyped, or the page has moved to another section.',
    dashboard: 'Go to dashboard',
    home: 'Go to home page',
    back: 'Go back',
    help: 'If this keeps happening, message our support in Telegram.',
  },
});

export default function NotFound() {
  const t = useT('notfound');
  const navigate = useNavigate();
  const me = useSession((s) => s.me);

  const primaryTo = me ? '/dashboard' : '/';
  const primaryLabel = me ? t('dashboard') : t('home');

  return (
    <AuthShell className="justify-center">
      <motion.div
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.55, ease: EASE }}
        className="mx-auto w-full max-w-xl text-center"
      >
        <div className="relative inline-block">
          <span
            aria-hidden
            className="pointer-events-none absolute left-1/2 top-1/2 h-40 w-72 -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand/10 blur-[90px] sm:h-56 sm:w-[420px]"
          />
          <p className="tnum relative bg-brand-grad bg-clip-text font-display text-[104px] font-extrabold leading-none tracking-tighter text-transparent sm:text-[148px]">
            404
          </p>
        </div>

        <span className="chip mt-2 bg-brand/10 text-brand-ink ring-1 ring-inset ring-brand/20">
          <Compass className="h-3.5 w-3.5" />
          {t('badge')}
        </span>

        <h1 className="text-balance mt-5 font-display text-[26px] font-extrabold leading-tight tracking-tight text-ink sm:text-[34px]">
          {t('title')}
        </h1>
        <p className="text-balance mx-auto mt-3.5 max-w-md text-base leading-relaxed text-muted">{t('text')}</p>

        <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link to={primaryTo} className="w-full sm:w-auto">
            <Button size="lg" className="w-full sm:w-auto">
              {primaryLabel}
            </Button>
          </Link>
          <Button
            size="lg"
            variant="outline"
            className="w-full sm:w-auto"
            icon={<ArrowLeft className="h-4 w-4" />}
            onClick={() => navigate(-1)}
          >
            {t('back')}
          </Button>
        </div>

        <p className="mt-8 flex items-center justify-center gap-2 text-xs text-muted">
          <LifeBuoy className="h-4 w-4 shrink-0" />
          {t('help')}
        </p>
      </motion.div>
    </AuthShell>
  );
}
