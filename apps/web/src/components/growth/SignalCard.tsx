/**
 * Radar signali kartochkasi — sarlavha, qoida (chegaralar serverdan), SKU
 * qatorlari va holatlar: bo'sh, tarix yetmaydi, sinxron kechikkan, tarifda yopiq.
 *
 * Bo'sh karta ATAYLAB yashirilmaydi: "keskin sekinlashgan tovar yo'q" ham
 * javob — sotuvchi tekshiruv bajarilganini ko'radi (Boshqaruv panelidagi
 * "Hammasi nazoratda" kabi). Qulflangan kartada SKU soni aytiladi, qatorlar
 * esa serverdan kelmaydi.
 */
import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { RadarSignal, RadarSkuRef } from '@savdoiq/shared';
import { ArrowRight, CalendarOff, ChevronDown, Clock, Lock, Sparkles } from '@/components/icons';
import { Badge, Button, Card, CardHeader, ProductThumb, Sparkline, type Tone } from '@/components/ui';
import { useFormat, useT } from '@/i18n';
import { cn } from '@/lib/utils';
import './radarTexts';

/** Kartochkada boshida ko'rinadigan qatorlar — qolgani "Yana N ta" bilan */
const INITIAL_ROWS = 5;

export function SignalCard<R extends RadarSkuRef>({
  id,
  icon,
  tone,
  title,
  rule,
  signal,
  renderRow,
  link,
  empty,
  emptyHint,
  noHistoryHint,
  lockedHint,
  wide,
  className,
}: {
  /** Sahifadagi langar — yuqoridagi sanoq kartochkasi shunga aylantiradi */
  id: string;
  icon: ReactNode;
  tone: Tone;
  title: string;
  /** Signal qoidasi — chegaralar bilan */
  rule: string;
  signal: RadarSignal<R>;
  renderRow: (row: R) => ReactNode;
  link?: { to: string; label: string };
  empty: string;
  emptyHint: string;
  noHistoryHint: string;
  lockedHint?: string;
  /** Butun kenglikdagi karta: keng ekranda qatorlar ikki ustunda */
  wide?: boolean;
  className?: string;
}) {
  const t = useT('radar');
  const f = useFormat();
  const [open, setOpen] = useState(false);
  const rows = signal.rows;
  const initial = wide ? INITIAL_ROWS * 2 : INITIAL_ROWS;
  const visible = open ? rows : rows.slice(0, initial);
  const rest = rows.length - visible.length;

  let body: ReactNode;
  if (signal.state === 'locked') {
    body = <LockedState count={signal.count} hint={lockedHint} />;
  } else if (signal.state === 'noHistory') {
    body = <StateNote icon={<CalendarOff />} title={t('noHistory.title')} hint={noHistoryHint} />;
  } else if (signal.state === 'stale') {
    body = <StateNote icon={<Clock />} title={t('stale.title')} hint={t('stale.hint')} />;
  } else if (rows.length === 0) {
    body = <StateNote icon={icon} title={empty} hint={emptyHint} />;
  } else {
    body = (
      <>
        <ul className={cn(wide ? 'grid xl:grid-cols-2' : 'divide-y divide-line/60')}>
          {visible.map((r) => (
            <li
              key={r.skuId}
              // Ikki ustunda divide-y ishlamaydi — har qator o'z chizig'i bilan, chap ustunda o'ng chegara
              // Toq sonli ro'yxatda oxirgi chap katakning o'ng chizig'i bo'sh joyga tiralib qolmasin
              className={cn(wide && 'border-b border-line/60 xl:[&:nth-child(odd):not(:last-child)]:border-r')}
            >
              {renderRow(r)}
            </li>
          ))}
        </ul>
        {rest > 0 || (open && rows.length > initial) ? (
          <div className="flex flex-wrap items-center justify-between gap-2 px-5 pt-3">
            <Button
              size="sm"
              variant="ghost"
              iconRight={<ChevronDown className={cn('h-3.5 w-3.5 transition-transform', open && 'rotate-180')} />}
              onClick={() => setOpen((v) => !v)}
            >
              {open ? t('card.less') : t('card.more', { n: f.num(rest) })}
            </Button>
          </div>
        ) : null}
        {signal.limited ? (
          // Tarifda faqat ko'rish uchun: eng muhim bir nechtasi ochiq, qolgani — pullik tarifda
          <div className="pt-3">
            <LockedState count={signal.count - rows.length} hint={lockedHint} more />
          </div>
        ) : signal.count > rows.length ? (
          <p className="tnum px-5 pt-2 text-2xs text-muted">{t('card.top', { shown: f.num(rows.length) })}</p>
        ) : null}
      </>
    );
  }

  const counted = signal.state === 'ready' || signal.state === 'locked';

  return (
    <Card tone={tone} id={id} className={cn('flex scroll-mt-24 flex-col overflow-hidden pb-4', className)}>
      <CardHeader
        icon={icon}
        // Sanoq sarlavha yonida: uzun qoida matni bilan "actions" alohida qatorga tushib, chapda osilib qolardi
        title={
          <span className="flex min-w-0 items-center gap-2">
            <span className="truncate">{title}</span>
            {counted ? (
              <Badge tone={signal.count > 0 ? tone : 'muted'} className="tnum shrink-0 px-2 py-0.5 text-2xs">
                {signal.state === 'locked' || signal.limited ? <Lock className="h-3 w-3" /> : null}
                {t('card.count', { n: f.num(signal.count) })}
              </Badge>
            ) : null}
          </span>
        }
        subtitle={<span className="text-xs leading-relaxed">{rule}</span>}
      />
      <div className="mt-3 flex-1">{body}</div>
      {link && signal.state !== 'locked' ? (
        <div className="mt-3 flex justify-end px-5">
          <Link to={link.to} className="inline-flex items-center gap-1 text-xs font-semibold text-brand-ink hover:underline">
            {link.label}
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      ) : null}
    </Card>
  );
}

/** Kichik holat bloki: bo'sh signal, tarix yetmaydi, sinxron kechikkan */
function StateNote({ icon, title, hint }: { icon: ReactNode; title: string; hint: string }) {
  return (
    <div className="mx-5 flex items-start gap-3 rounded-xl border border-line/70 bg-surface-2/50 px-4 py-4">
      <span className="mt-0.5 shrink-0 text-muted [&_svg]:h-4 [&_svg]:w-4">{icon}</span>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-ink">{title}</p>
        <p className="mt-0.5 text-xs leading-relaxed text-muted">{hint}</p>
      </div>
    </div>
  );
}

/**
 * Tarifda yopiq karta (yoki faqat ko'rish uchun ochiq kartaning qolgani):
 * nechta SKU ekani va tarif sahifasiga havola. `more` — yuqorida bir nechtasi
 * ko'rsatilgan, bu "yana N ta".
 */
function LockedState({ count, hint, more }: { count: number; hint?: string; more?: boolean }) {
  const t = useT('radar');
  const f = useFormat();
  return (
    <div className="mx-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line/70 bg-surface-2/50 px-4 py-4">
      <div className="flex min-w-0 items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand/10 text-brand-ink">
          <Lock className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-ink">
            {count > 0
              ? t(more ? 'locked.more' : 'locked.title', { n: f.num(count) })
              : t('locked.titleNone')}
          </p>
          {hint ? <p className="mt-0.5 text-xs leading-relaxed text-muted">{hint}</p> : null}
        </div>
      </div>
      <Link to="/pricing" className="shrink-0">
        <Button size="sm" icon={<Sparkles className="h-3.5 w-3.5" />}>
          {t('locked.cta')}
        </Button>
      </Link>
    </div>
  );
}

/**
 * Bitta SKU qatori: rasm, nom va variant, signal ortidagi raqamlar, 35
 * kunlik kichik grafik va asosiy ko'rsatkich. Butun qator — havola
 * (mahsulot sahifasi yoki Rejalashtiruvchi).
 */
export function RadarRowShell({
  item,
  href,
  main,
  facts,
  badges,
  sparkTone,
}: {
  item: RadarSkuRef;
  href: string;
  main: ReactNode;
  facts?: ReactNode;
  badges?: ReactNode;
  sparkTone: 'brand' | 'danger' | 'info' | 'warn';
}) {
  return (
    <Link
      to={href}
      className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-surface-2/60 focus-visible:bg-surface-2/60 focus-visible:outline-none"
    >
      <span className="h-10 w-10 shrink-0 overflow-hidden rounded-lg border border-line bg-surface-2">
        <ProductThumb name={item.title} imageUrl={item.imageUrl} style={{ fontSize: 13 }} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-ink" title={item.title}>
          {item.title}
        </span>
        <span className="tnum block truncate text-2xs text-muted">{[item.variant, item.sku].filter(Boolean).join(' · ')}</span>
        {facts ? <span className="tnum mt-1 block text-2xs leading-snug text-ink-soft">{facts}</span> : null}
        {badges ? <span className="mt-1.5 flex flex-wrap gap-1">{badges}</span> : null}
      </span>
      {/* 35 kunlik sotuv shakli — 7 kunlik o'zgarish shu fonda ko'rinadi; telefonda joy yetmaydi */}
      <Sparkline data={item.daily} tone={sparkTone} width={76} height={28} className="hidden shrink-0 sm:block" />
      <span className="flex shrink-0 flex-col items-end text-right">{main}</span>
    </Link>
  );
}
