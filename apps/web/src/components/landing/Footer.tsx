import { Link } from 'react-router-dom';
import { useT } from '@/i18n';
import { BOT_LINK, BOT_USERNAME, LandingLogo, TelegramIcon, scrollToId } from './primitives';

const PRODUCT_LINKS: { id: string; key: string }[] = [
  { id: 'features', key: 'nav.features' },
  { id: 'how', key: 'nav.how' },
  { id: 'pricing', key: 'nav.pricing' },
  { id: 'faq', key: 'nav.faq' },
];

export function LandingFooter() {
  const t = useT('landing');

  return (
    <footer className="relative mt-24 border-t border-line bg-surface/40">
      <div className="mx-auto w-full max-w-[1200px] px-5 py-12 sm:px-8">
        <div className="grid gap-10 md:grid-cols-2 lg:grid-cols-4">
          <div className="lg:col-span-2">
            <LandingLogo />
            <p className="mt-4 max-w-sm text-sm leading-relaxed text-muted">{t('footer.about')}</p>
            <a
              href={BOT_LINK}
              target="_blank"
              rel="noreferrer noopener"
              className="mt-5 inline-flex items-center gap-2 rounded-xl border border-line bg-surface px-3.5 py-2 text-sm font-medium text-ink transition-colors hover:border-brand/40 hover:text-brand"
            >
              <TelegramIcon className="h-4 w-4" />
              {BOT_USERNAME ? `@${BOT_USERNAME}` : t('footer.bot')}
            </a>
          </div>

          <div>
            <p className="mb-3.5 text-2xs font-bold uppercase tracking-[0.12em] text-muted/80">{t('footer.product')}</p>
            <ul className="space-y-2.5">
              {PRODUCT_LINKS.map((l) => (
                <li key={l.id}>
                  <button
                    type="button"
                    onClick={() => scrollToId(l.id)}
                    className="text-sm text-ink-soft transition-colors hover:text-brand"
                  >
                    {t(l.key)}
                  </button>
                </li>
              ))}
              <li>
                <Link to="/login" className="text-sm text-ink-soft transition-colors hover:text-brand">
                  {t('nav.login')}
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <p className="mb-3.5 text-2xs font-bold uppercase tracking-[0.12em] text-muted/80">{t('footer.help')}</p>
            <ul className="space-y-2.5">
              <li>
                <a
                  href={BOT_LINK}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="text-sm text-ink-soft transition-colors hover:text-brand"
                >
                  {t('footer.support')}
                </a>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => scrollToId('faq')}
                  className="text-sm text-ink-soft transition-colors hover:text-brand"
                >
                  {t('footer.faq')}
                </button>
              </li>
              <li>
              </li>
              <li>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-10 flex flex-col items-center justify-between gap-3 border-t border-line pt-6 sm:flex-row">
          <p className="text-xs text-muted">{t('footer.rights')}</p>
          <p className="text-xs text-muted">{t('footer.madeIn')}</p>
        </div>
      </div>
    </footer>
  );
}
