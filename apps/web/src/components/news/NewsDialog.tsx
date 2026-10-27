import { useId, useMemo, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { FeatureAccess, FeatureId, ViewSettingsSection } from '@savdoiq/shared';
import {
  ArrowRight,
  BadgeCheck,
  ExternalLink,
  Eye,
  Gauge,
  History,
  Info,
  LayoutDashboard,
  Lock,
  Package,
  Search,
  Send,
  UserPlus,
  Wallet,
  Warehouse,
  type AppIcon,
} from '@/components/icons';
import { Button, Modal, type Tone } from '@/components/ui';
import { isMacLike } from '@/components/palette/PaletteTrigger';
import { BOT_URL } from '@/lib/bot';
import { prefetchPage } from '@/lib/lazyPage';
import { cn } from '@/lib/utils';
import { useCanOpen, useCanSeeSettings, useView } from '@/lib/view';
import { useSession } from '@/store/session';
import { useUi } from '@/store/ui';
import { translate, useLang, useT } from '@/i18n';
import '@/components/team/i18n';
import './i18n';

/**
 * "Yangiliklar" oynasi — 2026-10-27 relizi.
 *
 * Har qator o'z sahifasiga olib boradi. Qaysi qator qanday ko'rinishi yon
 * menyu bilan BIR XIL qoidadan:
 *  • ko'rinish shablonida yopiq sahifa (useCanOpen / useCanSeeSettings) —
 *    qator umuman chiqmaydi, xuddi menyuda chiqmagani kabi;
 *  • tarifda 'off' — qator ko'rinadi, lekin havola emas va "Tarifda yo'q"
 *    qulfi bilan; 'preview' — havola, "Namuna" belgisi bilan (sahifada PlanGate
 *    namunani ko'rsatadi). Ruxsat lib/nav.ts dagi `feature` dan olinadi.
 *
 * Matnlar faqat haqiqatda chiqqan narsalar: bozor o'qilmaydi, tarix 365
 * kundan oshmaydi (plans.ts).
 */

export interface NewsDialogProps {
  open: boolean;
  onClose: () => void;
}

type Target =
  | { kind: 'page'; to: string }
  | { kind: 'settings'; section: ViewSettingsSection }
  | { kind: 'bot' }
  | { kind: 'palette' }
  | { kind: 'none' };

/**
 * Tarif tekshiruvi. `fullOnly` — sahifada namuna rejimi yo'q bo'lim:
 * boshqaruv panelidagi ABC kartasi abc_analysis to'liq bo'lmasa umuman
 * chizilmaydi (server uni yubormaydi), shuning uchun 'preview' ham "yo'q".
 * `team` — jamoa: 1 kishilik tarifda taklif qilib bo'lmaydi (limits.members).
 */
type Gate = { feature: FeatureId; fullOnly?: boolean } | { team: true };

interface NewsItem {
  k: string;
  target: Target;
  gate?: Gate;
}

interface NewsGroup {
  k: string;
  icon: AppIcon;
  tone: Tone;
  /** Guruh sarlavhasi ostida izoh (`g.<k>.note`) */
  note?: boolean;
  items: NewsItem[];
}

const page = (to: string): Target => ({ kind: 'page', to });
const settings = (section: ViewSettingsSection): Target => ({ kind: 'settings', section });
const feat = (feature: FeatureId, fullOnly = false): Gate => ({ feature, fullOnly });
const TEAM: Gate = { team: true };

const GROUPS: NewsGroup[] = [
  {
    k: 'finance',
    icon: Wallet,
    tone: 'brand',
    items: [
      { k: 'compare', target: page('/finance'), gate: feat('unit_economics') },
      { k: 'waterfall', target: page('/finance'), gate: feat('unit_economics') },
      { k: 'funnel', target: page('/funnel'), gate: feat('sales_analytics') },
      { k: 'economics', target: page('/product-profit'), gate: feat('unit_economics') },
      { k: 'report', target: page('/reports'), gate: feat('monthly_reports') },
      { k: 'basis', target: page('/finance'), gate: feat('unit_economics') },
    ],
  },
  {
    k: 'products',
    icon: Package,
    tone: 'info',
    items: [
      { k: 'cards', target: page('/products'), gate: feat('products_assortment') },
      { k: 'search', target: page('/products'), gate: feat('products_assortment') },
      { k: 'reorder', target: page('/planner'), gate: feat('planner') },
      { k: 'split', target: page('/planner'), gate: feat('planner') },
    ],
  },
  {
    k: 'warehouse',
    icon: Warehouse,
    tone: 'warn',
    note: true,
    items: [
      { k: 'storage', target: page('/storage'), gate: feat('paid_storage') },
      { k: 'vgh', target: page('/vgh'), gate: feat('vgh_report') },
      { k: 'calc', target: page('/calculator?tab=litr'), gate: feat('unit_calculator') },
      { k: 'returns', target: page('/calculator'), gate: feat('unit_calculator') },
      { k: 'alerts', target: settings('notifications'), gate: feat('telegram_notifications') },
    ],
  },
  {
    k: 'growth',
    icon: Gauge,
    tone: 'violet',
    note: true,
    items: [
      { k: 'categories', target: page('/categories'), gate: feat('abc_analysis') },
      // Radar va narxlar xaritasi — faqat pullik tarifda, sinovda namuna (2026-10-27)
      { k: 'radar', target: page('/radar'), gate: feat('growth_radar') },
      { k: 'prices', target: page('/price-map'), gate: feat('price_map') },
    ],
  },
  {
    k: 'team',
    icon: UserPlus,
    tone: 'brand',
    items: [
      { k: 'invite', target: page('/team'), gate: TEAM },
      { k: 'views', target: page('/team'), gate: TEAM },
      // Almashtirgich profil menyusida (2+ kompaniyada) — sahifasi yo'q
      { k: 'switcher', target: { kind: 'none' } },
    ],
  },
  {
    k: 'telegram',
    icon: Send,
    tone: 'info',
    items: [
      { k: 'digests', target: settings('notifications'), gate: feat('telegram_notifications') },
      { k: 'reports', target: { kind: 'bot' }, gate: feat('telegram_notifications') },
      { k: 'orders', target: settings('notifications'), gate: feat('telegram_notifications') },
    ],
  },
  {
    k: 'dashboard',
    icon: LayoutDashboard,
    tone: 'brand',
    items: [
      { k: 'abc', target: page('/dashboard'), gate: feat('abc_analysis', true) },
      { k: 'top', target: page('/dashboard'), gate: feat('dashboard_realtime') },
      { k: 'palette', target: { kind: 'palette' } },
    ],
  },
  {
    k: 'history',
    icon: History,
    tone: 'violet',
    items: [{ k: 'backfill', target: settings('uzum') }],
  },
  {
    k: 'accuracy',
    icon: BadgeCheck,
    tone: 'muted',
    items: [
      { k: 'ads', target: page('/product-profit'), gate: feat('unit_economics') },
      { k: 'returns', target: page('/returns'), gate: feat('returns_report') },
      { k: 'excel', target: page('/stocks'), gate: feat('stocks_fbo_fbs') },
    ],
  },
];

interface Row {
  key: string;
  text: string;
  target: Target;
  access: FeatureAccess;
}

const ROW =
  'flex w-full items-start gap-2.5 rounded-lg px-2 py-1.5 text-left text-sm leading-5 transition-colors';
const ROW_LINK = cn(ROW, 'group/row text-ink-soft hover:bg-surface hover:text-ink focusable');

function Bullet() {
  return <span aria-hidden className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-[rgb(var(--tone))]" />;
}

export function NewsDialog({ open, onClose }: NewsDialogProps) {
  const t = useT('news');
  const lang = useLang();
  const titleBase = useId();
  const canOpen = useCanOpen();
  const canSee = useCanSeeSettings();
  const view = useView();
  const features = useSession((s) => s.me?.features);
  const members = useSession((s) => s.me?.limits.members ?? 1);
  const keys = isMacLike() ? '⌘K' : 'Ctrl+K';

  const { groups, hiddenCount, anyLocked } = useMemo(() => {
    const accessOf = (gate?: Gate): FeatureAccess => {
      if (!gate) return 'full';
      if ('team' in gate) return members > 1 ? 'full' : 'off';
      const a: FeatureAccess = features?.[gate.feature] ?? 'off';
      return gate.fullOnly && a !== 'full' ? 'off' : a;
    };
    const visible = (target: Target): boolean => {
      if (target.kind === 'page') return canOpen(target.to);
      if (target.kind === 'settings') return canSee(target.section);
      return true;
    };
    let hidden = 0;
    let locked = false;
    const out = GROUPS.map((g) => {
      const rows: Row[] = [];
      for (const item of g.items) {
        if (!visible(item.target)) {
          hidden += 1;
          continue;
        }
        const access = accessOf(item.gate);
        if (access === 'off') locked = true;
        rows.push({
          key: `${g.k}.${item.k}`,
          text: translate('news', `${g.k}.${item.k}`, lang, { keys }),
          target: item.target,
          access,
        });
      }
      return { group: g, rows };
    }).filter((g) => g.rows.length > 0);
    return { groups: out, hiddenCount: hidden, anyLocked: locked };
  }, [features, members, canOpen, canSee, lang, keys]);

  const openPalette = () => {
    onClose();
    /*
     * Keyingi aylanishda: oyna yopilganda fokusni ochgan tugmaga qaytaradi
     * (Modal'ning effekt tozalashi). Ctrl+K oynasi shu bilan bir vaqtda
     * ochilsa, uning qidiruv maydonidagi fokusni o'g'irlab ketardi.
     */
    window.setTimeout(() => useUi.getState().setCommandOpen(true), 60);
  };

  const chip = (access: FeatureAccess) =>
    access === 'off' ? (
      <span className="meta-chip shrink-0 gap-1 px-2 py-0.5 text-2xs">
        <Lock className="h-3 w-3" aria-hidden />
        {t('lock.off')}
      </span>
    ) : access === 'preview' ? (
      <span className="meta-chip shrink-0 gap-1 px-2 py-0.5 text-2xs text-warn-ink">
        <Eye className="h-3 w-3" aria-hidden />
        {t('lock.preview')}
      </span>
    ) : null;

  const renderRow = (row: Row) => {
    const { target, access } = row;
    // Tarifda yo'q — havola emas: bosilsa baribir "tarifni yangilang" chiqardi
    if (access === 'off' || target.kind === 'none') {
      return (
        <div className={cn(ROW, access === 'off' ? 'text-muted' : 'text-ink-soft')} aria-disabled={access === 'off' || undefined}>
          <Bullet />
          <span className="min-w-0 flex-1">{row.text}</span>
          {chip(access)}
        </div>
      );
    }
    const body = (trail: ReactNode) => (
      <>
        <Bullet />
        <span className="min-w-0 flex-1">{row.text}</span>
        {chip(access)}
        {trail}
      </>
    );
    const arrow = (
      <ArrowRight
        aria-hidden
        className="mt-0.5 h-4 w-4 shrink-0 text-muted transition-transform duration-150 group-hover/row:translate-x-0.5 group-hover/row:text-ink-soft"
      />
    );
    if (target.kind === 'bot') {
      return (
        <a href={BOT_URL} target="_blank" rel="noreferrer" className={ROW_LINK} onClick={onClose}>
          {body(<ExternalLink aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-muted" />)}
          <span className="sr-only">{t('newTab')}</span>
        </a>
      );
    }
    if (target.kind === 'palette') {
      return (
        <button type="button" className={ROW_LINK} onClick={openPalette}>
          {body(<Search aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-muted" />)}
        </button>
      );
    }
    const to = target.kind === 'settings' ? `/settings#${target.section}` : target.to;
    const path = to.split(/[?#]/)[0];
    return (
      <Link
        to={to}
        className={ROW_LINK}
        onClick={onClose}
        // Sahifa fayli bosishdan oldin kelib turadi (yon menyudagidek)
        onMouseEnter={() => prefetchPage(path)}
        onFocus={() => prefetchPage(path)}
      >
        {body(arrow)}
      </Link>
    );
  };

  const viewName = view ? translate('team', `view.${view}`, lang) : '';

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="xl"
      title={t('title')}
      description={t('subtitle')}
      footer={
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 text-xs leading-5 text-muted">
            {anyLocked ? (
              <p>
                {t('locked.note')}{' '}
                <Link to="/pricing" onClick={onClose} className="focusable rounded font-semibold text-brand-ink hover:underline">
                  {t('locked.cta')}
                </Link>
              </p>
            ) : null}
            <p>{t('reopen', { keys })}</p>
          </div>
          <Button className="w-full shrink-0 sm:w-auto" onClick={onClose}>
            {t('btn.ok')}
          </Button>
        </div>
      }
    >
      {view && hiddenCount > 0 ? (
        <p className="mb-4 flex items-start gap-2 rounded-xl border border-line bg-surface-2/60 px-3 py-2.5 text-xs leading-5 text-muted">
          <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          {t('hidden', { view: viewName })}
        </p>
      ) : null}

      {/* Ustunlar (masonry): guruhlar har xil uzunlikda — to'r qatorlarida bo'sh joy qolmasin */}
      <div className="md:columns-2 md:gap-3">
        {groups.map(({ group, rows }) => {
          const headId = `${titleBase}-${group.k}`;
          return (
            <section
              key={group.k}
              aria-labelledby={headId}
              className={cn('well mb-3 break-inside-avoid p-2.5', `tone-${group.tone}`)}
            >
              <div className="flex items-start gap-2.5 px-1.5 pb-1.5 pt-0.5">
                <span className="icon-tile mt-0.5 h-8 w-8 rounded-lg [&_svg]:h-4 [&_svg]:w-4" aria-hidden>
                  <group.icon />
                </span>
                <div className="min-w-0">
                  <h4 id={headId} className="font-display text-sm font-bold leading-5 text-ink">
                    {t(`g.${group.k}`)}
                  </h4>
                  {group.note ? <p className="text-xs leading-4 text-muted">{t(`g.${group.k}.note`)}</p> : null}
                </div>
              </div>
              <ul className="space-y-px">
                {rows.map((row) => (
                  <li key={row.key}>{renderRow(row)}</li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </Modal>
  );
}
