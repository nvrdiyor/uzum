import type { CSSProperties } from 'react';
import { Check, Globe, Moon, Palette, PanelLeftClose, Sun } from 'lucide-react';
import type { Lang } from '@savdoiq/shared';
import { Card, CardBody, CardHeader, Divider, Select, Toggle } from '@/components/ui';
import { useUi } from '@/store/ui';
import { useLangStore, useT } from '@/i18n';
import { cn } from '@/lib/utils';

const LANGS: { id: Lang; label: string; flag: string }[] = [
  { id: 'uz', label: "O'zbek", flag: '🇺🇿' },
  { id: 'ru', label: 'Русский', flag: '🇷🇺' },
  { id: 'en', label: 'English', flag: '🇬🇧' },
];

/**
 * Oldindan ko'rish kartochkalari haqiqiy mavzu tokenlari bilan chiziladi
 * (qiymatlar `styles/index.css` dagi `:root` va `.dark` bloklaridan olingan),
 * shuning uchun ikkala variant ham joriy mavzudan qat'i nazar to'g'ri ko'rinadi.
 */
const LIGHT_VARS = {
  '--c-bg': '247 248 250',
  '--c-surface': '255 255 255',
  '--c-surface-2': '246 248 250',
  '--c-surface-3': '238 241 245',
  '--c-border': '226 230 236',
  '--c-text': '16 21 30',
  '--c-muted': '108 118 132',
  '--c-brand': '0 168 118',
} as unknown as CSSProperties;

const DARK_VARS = {
  '--c-bg': '15 17 21',
  '--c-surface': '23 26 33',
  '--c-surface-2': '29 33 41',
  '--c-surface-3': '36 41 51',
  '--c-border': '42 47 58',
  '--c-text': '233 236 242',
  '--c-muted': '143 153 170',
  '--c-brand': '16 208 148',
} as unknown as CSSProperties;

/** Mini "ilova oynasi" — mavzuni jonli ko'rsatadi */
function ThemePreview({ vars }: { vars: CSSProperties }) {
  const t = useT('settings');
  return (
    <div style={vars} className="overflow-hidden rounded-xl border border-line bg-bg p-2.5">
      <div className="flex gap-2">
        {/* yon menyu */}
        <div className="hidden w-10 shrink-0 space-y-1.5 rounded-lg bg-surface p-1.5 sm:block">
          <div className="h-2 w-full rounded-full bg-brand" />
          <div className="h-2 w-full rounded-full bg-surface-3" />
          <div className="h-2 w-full rounded-full bg-surface-3" />
          <div className="h-2 w-2/3 rounded-full bg-surface-3" />
        </div>
        {/* mazmun */}
        <div className="min-w-0 flex-1 space-y-2">
          <div className="rounded-lg bg-surface p-2">
            <p className="truncate text-2xs font-semibold text-muted">{t('appear.previewMetric')}</p>
            <p className="tnum mt-0.5 text-xs font-extrabold text-ink">128 400 000</p>
            <div className="mt-1.5 flex h-6 items-end gap-1">
              {[40, 65, 30, 80, 55, 95, 70].map((h, i) => (
                <span key={i} className="flex-1 rounded-sm bg-brand" style={{ height: `${h}%`, opacity: 0.85 }} />
              ))}
            </div>
          </div>
          <div className="space-y-1 rounded-lg bg-surface p-2">
            <div className="h-1.5 w-3/4 rounded-full bg-surface-3" />
            <div className="h-1.5 w-full rounded-full bg-surface-3" />
            <div className="h-1.5 w-1/2 rounded-full bg-surface-3" />
          </div>
        </div>
      </div>
    </div>
  );
}

/** 6-bo'lim: ko'rinish — mavzu, ixcham menyu, til */
export function AppearanceSection() {
  const t = useT('settings');
  const theme = useUi((s) => s.theme);
  const setTheme = useUi((s) => s.setTheme);
  const rail = useUi((s) => s.rail);
  const toggleRail = useUi((s) => s.toggleRail);
  const lang = useLangStore((s) => s.lang);
  const setLang = useLangStore((s) => s.setLang);

  const options: { id: 'light' | 'dark'; label: string; icon: typeof Sun; vars: CSSProperties }[] = [
    { id: 'light', label: t('appear.light'), icon: Sun, vars: LIGHT_VARS },
    { id: 'dark', label: t('appear.dark'), icon: Moon, vars: DARK_VARS },
  ];

  return (
    <Card>
      <CardHeader icon={<Palette className="h-4 w-4" />} title={t('appear.title')} subtitle={t('appear.subtitle')} />
      <CardBody className="space-y-5">
        {/* ── Mavzu ── */}
        <div>
          <span className="label">{t('appear.theme')}</span>
          <div className="grid gap-3 sm:grid-cols-2">
            {options.map((o) => {
              const on = theme === o.id;
              const Icon = o.icon;
              return (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => setTheme(o.id)}
                  className={cn(
                    'group rounded-2xl border p-3 text-left transition-all duration-200 ease-spring',
                    on ? 'border-brand shadow-glow' : 'border-line hover:border-line-strong',
                  )}
                >
                  <ThemePreview vars={o.vars} />
                  <div className="mt-3 flex items-center gap-2 px-1">
                    <span
                      className={cn(
                        'flex h-7 w-7 items-center justify-center rounded-lg',
                        on ? 'bg-brand/15 text-brand-ink' : 'bg-surface-2 text-muted',
                      )}
                    >
                      <Icon className="h-3.5 w-3.5" />
                    </span>
                    <span className={cn('flex-1 text-sm font-semibold', on ? 'text-brand' : 'text-ink')}>
                      {o.label}
                    </span>
                    {on ? <Check className="h-4 w-4 text-brand" /> : null}
                  </div>
                </button>
              );
            })}
          </div>
          <p className="mt-2 text-xs text-muted">{t('appear.themeHint')}</p>
        </div>

        <Divider />

        {/* ── Ixcham menyu ── */}
        <div className="flex items-center gap-3 rounded-xl px-1 py-1">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand/10 text-brand-ink">
            <PanelLeftClose className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <Toggle checked={rail} onChange={() => toggleRail()} label={t('appear.rail')} hint={t('appear.railHint')} />
          </div>
        </div>

        <Divider />

        {/* ── Til ── */}
        <div className="max-w-sm">
          <span className="label flex items-center gap-1.5">
            <Globe className="h-3.5 w-3.5" />
            {t('appear.lang')}
          </span>
          <Select value={lang} onChange={(e) => setLang(e.target.value as Lang)}>
            {LANGS.map((l) => (
              <option key={l.id} value={l.id}>
                {l.flag} {l.label}
              </option>
            ))}
          </Select>
          <p className="mt-1.5 text-xs text-muted">{t('appear.langHint')}</p>
        </div>
      </CardBody>
    </Card>
  );
}
