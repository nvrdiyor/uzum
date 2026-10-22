/**
 * Kartochka SEO sahifasining umumiy bo'laklari: audit kirishini yig'ish,
 * ball halqasi, kamchiliklar ro'yxati, HTML ko'rinishi va nusxalash.
 *
 * Tarjimalar `cardDetail` nomlar fazosida (pages/CardDetail.tsx da ro'yxatga
 * olinadi) — bu fayldagi komponentlar faqat o'sha sahifa ichida chiziladi.
 */
import { useMemo, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  auditCard,
  CARD_LANGS,
  sanitizeCardHtml,
  stripCardHtml,
  type CardAuditResult,
  type CardContentDto,
  type CardDetailResponse,
  type CardIssue,
  type CardIssueLevel,
  type CardKeywordInput,
  type CardLang,
} from '@savdoiq/shared';
import { AlertTriangle, ArrowRight, Copy, Info, XCircle } from '@/components/icons';
import { Button, toast } from '@/components/ui';
import { ApiError } from '@/lib/api';
import { useSession } from '@/store/session';
import { useFormat, useT } from '@/i18n';
import { cn } from '@/lib/utils';

export const CARD_NS = 'cardDetail';

// ─────────────────────────── Matnlar va audit ───────────────────────────

/** Kartochkaning tillar bo'yicha nomi va tavsifi (audit va AI so'rovi uchun) */
export interface CardTexts {
  titles: Partial<Record<CardLang, string>>;
  descriptions: Partial<Record<CardLang, string>>;
}

/** Sotuvchi tahrirlayotgan, hali saqlanmagan matn (til bo'yicha) */
export type ContentEdits = Partial<Record<CardLang, { title: string; descriptionHtml: string }>>;

const hasText = (html: string) => stripCardHtml(html).trim().length > 0;

/**
 * Saqlangan matnlardan audit kirishi. Bo'sh teglardan iborat tavsif
 * ("<p></p>") "yuklanmagan" deb sanaladi — aks holda bo'sh tavsif ham
 * ballga kirib, past baho olardi.
 */
export function textsFromContents(contents: CardContentDto[]): CardTexts {
  const titles: CardTexts['titles'] = {};
  const descriptions: CardTexts['descriptions'] = {};
  for (const c of contents) {
    if (c.title.trim()) titles[c.lang] = c.title;
    if (hasText(c.descriptionHtml)) descriptions[c.lang] = c.descriptionHtml;
  }
  return { titles, descriptions };
}

/** Bitta tilning matnini to'liq almashtiradi (bo'sh qiymat — o'sha til yo'q) */
export function replaceLang(texts: CardTexts, lang: CardLang, title: string, html: string): CardTexts {
  const titles = { ...texts.titles };
  const descriptions = { ...texts.descriptions };
  if (title.trim()) titles[lang] = title;
  else delete titles[lang];
  if (hasText(html)) descriptions[lang] = html;
  else delete descriptions[lang];
  return { titles, descriptions };
}

/** Qoralama qo'yilsa: bo'sh maydon joriy matnni o'chirmaydi, faqat to'ldirilgani almashadi */
export function overlayLang(texts: CardTexts, lang: CardLang, title: string, html: string): CardTexts {
  return replaceLang(
    texts,
    lang,
    title.trim() ? title : (texts.titles[lang] ?? ''),
    hasText(html) ? html : (texts.descriptions[lang] ?? ''),
  );
}

export function activeKeywords(detail: CardDetailResponse): CardKeywordInput[] {
  return detail.keywords.filter((k) => k.status === 'active').map((k) => ({ text: k.text, demand: k.demand }));
}

/** Server bergan kontekst (kategoriya, sharhlar, holat) bilan jonli audit */
export function auditFor(
  detail: CardDetailResponse,
  texts: CardTexts,
  keywords: CardKeywordInput[] = activeKeywords(detail),
): CardAuditResult {
  const ctx = detail.auditContext;
  return auditCard({
    titles: texts.titles,
    descriptions: texts.descriptions,
    keywords,
    category: ctx.category,
    reviews: ctx.reviews,
    health: ctx.health,
  });
}

/** AI "o'ylab topgan" sonlarni tekshirish uchun manba: haqiqiy nom, tavsif va variantlar */
export function sourceText(detail: CardDetailResponse, texts: CardTexts): string {
  const parts: string[] = [];
  for (const lang of CARD_LANGS) {
    if (texts.titles[lang]) parts.push(texts.titles[lang] ?? '');
    if (texts.descriptions[lang]) parts.push(stripCardHtml(texts.descriptions[lang] ?? ''));
  }
  parts.push(...detail.product.skuTitles);
  return parts.join('\n');
}

export const charLen = (value: string) => [...value.trim()].length;

// ─────────────────────────── Ruxsat va so'rovlar ───────────────────────────

/** Matn, kalit so'z va qoralamani faqat egasi yoki menejer o'zgartiradi (API ham shuni talab qiladi) */
export function useCanEditCards(): boolean {
  return useSession((s) => {
    const role = s.me?.company?.role;
    return role === 'owner' || role === 'manager';
  });
}

/** Har o'zgarishdan keyin kartochka va ro'yxat qayta yuklanadi (ro'yxatdagi ball ham o'zgaradi) */
export function useInvalidateCard(id: string) {
  const qc = useQueryClient();
  return () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: ['card', id] }),
      qc.invalidateQueries({ queryKey: ['cards'] }),
    ]);
}

/**
 * Javobdagi yangi qiymatni darhol keshga yozish — qayta yuklash tugaguncha
 * eski matn yoki ro'yxat bir lahza qaytib chiqmasin.
 */
export function useCardCache(id: string) {
  const qc = useQueryClient();
  return (update: (d: CardDetailResponse) => CardDetailResponse) =>
    qc.setQueryData<CardDetailResponse>(['card', id], (old) => (old ? update(old) : old));
}

export function errorText(err: unknown): string | undefined {
  if (err instanceof ApiError || err instanceof Error) return err.message;
  return undefined;
}

// ─────────────────────────── Nusxalash ───────────────────────────

/** Eski brauzerlar va http sahifa uchun: yashirin maydonni belgilab nusxalash */
function legacyCopy(text: string): boolean {
  const el = document.createElement('textarea');
  el.value = text;
  el.setAttribute('readonly', '');
  el.style.position = 'fixed';
  el.style.top = '0';
  el.style.opacity = '0';
  document.body.appendChild(el);
  el.select();
  let ok = false;
  try {
    ok = document.execCommand('copy');
  } catch {
    ok = false;
  }
  el.remove();
  return ok;
}

/** Avval Clipboard API, rad etilsa (ruxsat yo'q, xavfsiz bo'lmagan sahifa) — eski usul */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* pastdagi zaxira yo'l */
  }
  return legacyCopy(text);
}

/**
 * Formatli nusxa: HTML (ro'yxat va qalin matn saqlanadi) va oddiy matn birga.
 * Uzum kabinetidagi tahrirlagich formatni qabul qilsa — ro'yxat bo'lib tushadi,
 * qabul qilmasa — oddiy matn. Brauzer qo'llamasa faqat oddiy matn.
 */
export async function copyRich(html: string, plain: string): Promise<boolean> {
  try {
    if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
      await navigator.clipboard.write([
        new ClipboardItem({
          'text/html': new Blob([html], { type: 'text/html' }),
          'text/plain': new Blob([plain], { type: 'text/plain' }),
        }),
      ]);
      return true;
    }
  } catch {
    /* oddiy matnga o'tiladi */
  }
  return copyText(plain);
}

export function useCopy() {
  const t = useT(CARD_NS);
  return async (text: string, opts: { html?: string; title?: string; body?: string } = {}): Promise<boolean> => {
    const ok = opts.html ? await copyRich(opts.html, text) : await copyText(text);
    if (ok) toast.success(opts.title ?? t('copy.ok'), opts.body);
    else toast.error(t('copy.err'), t('copy.errHint'));
    return ok;
  };
}

/** Nom, tavsif (formatli + oddiy matn) va tavsif HTML kodini nusxalash tugmalari */
export function CopyTextButtons({ title, descriptionHtml }: { title: string; descriptionHtml: string }) {
  const t = useT(CARD_NS);
  const copy = useCopy();
  const html = previewHtml(descriptionHtml);
  const plain = stripCardHtml(html);
  return (
    <>
      <Button
        variant="outline"
        size="sm"
        icon={<Copy className="h-3.5 w-3.5" />}
        disabled={!title.trim()}
        onClick={() => void copy(title.trim(), { title: t('copy.titleOk') })}
      >
        {t('copy.title')}
      </Button>
      <Button
        variant="outline"
        size="sm"
        icon={<Copy className="h-3.5 w-3.5" />}
        disabled={!plain}
        onClick={() => void copy(plain, { html, title: t('copy.descOk'), body: t('copy.descOkBody') })}
      >
        {t('copy.desc')}
      </Button>
      <Button
        variant="ghost"
        size="sm"
        icon={<Copy className="h-3.5 w-3.5" />}
        disabled={!plain}
        onClick={() => void copy(html, { title: t('copy.htmlOk') })}
      >
        {t('copy.html')}
      </Button>
    </>
  );
}

// ─────────────────────────── Ball ───────────────────────────

export type ScoreTone = 'brand' | 'warn' | 'danger';

/** 80+ yaxshi, 60..79 o'rtacha, 60 dan past — zaif (ro'yxatdagi "past ball" bilan bir xil chegara) */
export function scoreTone(score: number): ScoreTone {
  if (score >= 80) return 'brand';
  if (score >= 60) return 'warn';
  return 'danger';
}

export const SCORE_TEXT: Record<ScoreTone, string> = {
  brand: 'text-brand-ink',
  warn: 'text-warn-ink',
  danger: 'text-danger-ink',
};

const SCORE_LABEL: Record<ScoreTone, string> = {
  brand: 'score.good',
  warn: 'score.mid',
  danger: 'score.low',
};

export function useScoreLabel() {
  const t = useT(CARD_NS);
  return (score: number) => t(SCORE_LABEL[scoreTone(score)]);
}

/** Rangli ball halqasi: rang chegaraga qarab (yashil / sariq / qizil) */
export function ScoreRing({
  score,
  size = 96,
  stroke = 9,
  caption,
}: {
  score: number;
  size?: number;
  stroke?: number;
  caption?: ReactNode;
}) {
  const pct = Math.max(0, Math.min(100, Math.round(score)));
  const tone = scoreTone(pct);
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div
      className="relative inline-flex shrink-0 items-center justify-center"
      style={{ width: size, height: size }}
      role="img"
      aria-label={`${pct} / 100`}
    >
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgb(var(--c-surface-3))" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={`rgb(var(--c-${tone}))`}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c - (pct / 100) * c}
          style={{ transition: 'stroke-dashoffset 700ms cubic-bezier(0.22,1,0.36,1)' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span
          className={cn('tnum font-display font-extrabold leading-none', SCORE_TEXT[tone])}
          style={{ fontSize: Math.round(size * 0.3) }}
        >
          {pct}
        </span>
        {caption ? <span className="mt-1 text-2xs text-muted">{caption}</span> : null}
      </div>
    </div>
  );
}

/** "62 → 81 (+19)" */
export function ScoreShift({ before, after, className }: { before: number; after: number; className?: string }) {
  const diff = after - before;
  return (
    <span className={cn('tnum inline-flex flex-wrap items-center gap-1.5 text-sm font-bold', className)}>
      <span className={SCORE_TEXT[scoreTone(before)]}>{before}</span>
      <ArrowRight className="h-3.5 w-3.5 text-muted" />
      <span className={SCORE_TEXT[scoreTone(after)]}>{after}</span>
      {diff !== 0 ? (
        <span className={cn('chip', diff > 0 ? 'bg-brand/10 text-brand-ink' : 'bg-danger/10 text-danger-ink')}>
          {`${diff > 0 ? '+' : ''}${diff}`}
        </span>
      ) : null}
    </span>
  );
}

// ─────────────────────────── Kichik belgilar ───────────────────────────

export function LangTag({ lang, className }: { lang: CardLang; className?: string }) {
  return <span className={cn('chip bg-surface-3 font-bold uppercase text-ink-soft', className)}>{lang}</span>;
}

/** Kichik ko'rsatkich qutisi (sotuv, ta'sir) */
export function Metric({
  label,
  value,
  hint,
  tone,
}: {
  label: ReactNode;
  value: ReactNode;
  hint?: ReactNode;
  tone?: 'brand' | 'danger' | 'warn';
}) {
  return (
    <div className="min-w-0 rounded-xl border border-line bg-surface-2 px-3 py-2.5">
      <p className="truncate eyebrow">{label}</p>
      <p
        className={cn(
          'tnum mt-0.5 truncate text-sm font-bold',
          tone === 'brand' && 'text-brand-ink',
          tone === 'danger' && 'text-danger',
          tone === 'warn' && 'text-warn-ink',
          !tone && 'text-ink',
        )}
      >
        {value}
      </p>
      {hint ? <p className="mt-0.5 truncate text-2xs text-muted">{hint}</p> : null}
    </div>
  );
}

/** Ko'k izoh qutisi */
export function Hint({ children, tone = 'info', className }: { children: ReactNode; tone?: 'info' | 'warn'; className?: string }) {
  return (
    <div
      className={cn(
        'flex items-start gap-2.5 rounded-xl border p-3 text-xs leading-5',
        tone === 'info' ? 'border-info/25 bg-info/10 text-info-ink' : 'border-warn/25 bg-warn/10 text-warn-ink',
        className,
      )}
    >
      {tone === 'info' ? <Info className="mt-0.5 h-4 w-4 shrink-0" /> : <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />}
      <div className="min-w-0">{children}</div>
    </div>
  );
}

// ─────────────────────────── HTML ko'rinishi ───────────────────────────

/**
 * Tavsifning ko'rinishi. XAVFSIZ: `sanitizeCardHtml` faqat p/br/ul/ol/li/b/
 * strong/i/em teglarini atributsiz qoldiradi — skript, havola va hodisalar
 * o'tmaydi. Teg umuman bo'lmasa (kabinetdan oddiy matn nusxalangan),
 * qator ko'chishlari <br> ga aylantiriladi.
 */
export function previewHtml(html: string): string {
  const src = /<\s*\/?\s*[a-z]/i.test(html) ? html : html.replace(/\r?\n/g, '<br>');
  return sanitizeCardHtml(src);
}

export function HtmlPreview({ html, empty, className }: { html: string; empty: ReactNode; className?: string }) {
  const safe = useMemo(() => previewHtml(html), [html]);
  if (!hasText(safe)) return <p className="text-sm text-muted">{empty}</p>;
  return (
    <div
      className={cn(
        'break-words text-sm leading-6 text-ink-soft',
        '[&_b]:font-semibold [&_b]:text-ink [&_strong]:font-semibold [&_strong]:text-ink',
        '[&_li]:mb-1 [&_ol]:mb-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:mb-2 [&_ul]:mb-2 [&_ul]:list-disc [&_ul]:pl-5',
        className,
      )}
      dangerouslySetInnerHTML={{ __html: safe }}
    />
  );
}

// ─────────────────────────── Kamchiliklar ───────────────────────────

const LEVEL_ICON = { error: XCircle, warn: AlertTriangle, info: Info } as const;
const LEVEL_CLASS: Record<CardIssueLevel, string> = {
  error: 'text-danger',
  warn: 'text-warn',
  info: 'text-info',
};
const LEVEL_ORDER: Record<CardIssueLevel, number> = { error: 0, warn: 1, info: 2 };

/** Kamchilik kodi → tarjima qilingan matn (sonlar til bo'yicha formatlanadi) */
export function useIssueText() {
  const t = useT(CARD_NS);
  const f = useFormat();
  return (issue: CardIssue): string => {
    const vars: Record<string, string | number> = {};
    for (const [k, v] of Object.entries(issue.params ?? {})) {
      vars[k] = typeof v === 'number' ? f.num(v, Number.isInteger(v) ? 0 : 1) : v;
    }
    const key = `issue.${issue.code}`;
    const out = t(key, vars);
    return out === key ? issue.code : out;
  };
}

export function IssueList({ issues, empty, className }: { issues: CardIssue[]; empty?: ReactNode; className?: string }) {
  const t = useT(CARD_NS);
  const text = useIssueText();
  if (issues.length === 0) {
    return empty ? <p className={cn('text-sm text-muted', className)}>{empty}</p> : null;
  }
  const sorted = [...issues].sort((a, b) => LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level]);
  return (
    <ul className={cn('space-y-2', className)}>
      {sorted.map((issue, i) => {
        const Icon = LEVEL_ICON[issue.level];
        return (
          <li key={`${issue.code}-${issue.lang ?? ''}-${i}`} className="flex items-start gap-2.5 text-sm">
            <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', LEVEL_CLASS[issue.level])} aria-label={t(`level.${issue.level}`)} />
            <span className="min-w-0 flex-1 text-ink-soft">{text(issue)}</span>
            {issue.lang ? <LangTag lang={issue.lang} /> : null}
          </li>
        );
      })}
    </ul>
  );
}
