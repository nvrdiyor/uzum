import type { FunnelResponse, FunnelStageDrop, FunnelStageId, FunnelStepId } from '@savdoiq/shared';
import {
  type AppIcon,
  Package,
  PackageCheck,
  PackageOpen,
  ShoppingBag,
  Truck,
  Undo2,
  XCircle,
} from '@/components/icons';
import { Amount, Badge, Delta, type Tone } from '@/components/ui';
import { useFormat, useT } from '@/i18n';
import { cn } from '@/lib/utils';
import { FUNNEL_LOSS_NS } from './i18n';

export type FunnelToken = 'info' | 'brand' | 'slate' | 'warn' | 'danger';

/*
 * Token rangi shaffofligi bilan. Ilgari `${CHART_COLORS.x}22` yozilardi —
 * "rgb(var(--c-info))22" yaroqsiz CSS, brauzer uni tashlab yuborardi va
 * bosqich chizig'i hamda belgi foni umuman chizilmasdi (2026-10-24).
 */
export const tokenColor = (token: FunnelToken, alpha?: number): string =>
  alpha === undefined ? `rgb(var(--c-${token}))` : `rgb(var(--c-${token}) / ${alpha})`;

/** Yo'ldagi dona chizig'i — shtrixli: yo'qotish ham, natija ham emas, hali kutilmoqda */
const PENDING_FILL =
  'repeating-linear-gradient(135deg, rgb(var(--c-slate) / 0.55) 0 4px, rgb(var(--c-slate) / 0.2) 4px 8px)';

/*
 * `toneClass` TO'LIQ yozilgan: Tailwind faqat manbada butun uchragan klassni
 * CSS'ga chiqaradi, `tone-${tone}` kabi yig'ilgani skanerdan o'tmaydi.
 * Ranglar kunlik grafik bilan bir xil: buyurtma — ko'k, sotildi — brend,
 * bekor — za'faron, qaytdi — qizil, yo'lda — kulrang.
 */
const STAGE: Record<FunnelStageId, { icon: AppIcon; toneClass: string; token: FunnelToken; badge: Tone }> = {
  ordered: { icon: ShoppingBag, toneClass: 'tone-info', token: 'info', badge: 'info' },
  shipped: { icon: Package, toneClass: 'tone-info', token: 'info', badge: 'info' },
  received: { icon: PackageOpen, toneClass: 'tone-info', token: 'info', badge: 'info' },
  // Voronka natijasi — sotuvchining puli
  kept: { icon: PackageCheck, toneClass: 'tone-brand', token: 'brand', badge: 'brand' },
};

const DROP: Record<FunnelStageDrop['id'], { icon: AppIcon; toneClass: string; token: FunnelToken; ink: string }> = {
  canceled: { icon: XCircle, toneClass: 'tone-warn', token: 'warn', ink: 'text-warn-ink' },
  // Yo'ldagi dona — neytral: na yutuq, na yo'qotish
  inTransit: { icon: Truck, toneClass: 'tone-muted', token: 'slate', ink: 'text-ink-soft' },
  returned: { icon: Undo2, toneClass: 'tone-danger', token: 'danger', ink: 'text-danger-ink' },
};

/**
 * O'zgarish foizi qaysi holatdan (`steps`): faqat birinchi va oxirgi bosqichda.
 * Oraliq bosqichlar (jo'natildi, qabul qildi) yo'qotishlar ayirmasi — ularning
 * o'zgarishi pastdagi "bekor qilindi" / "qaytarildi" qatorlarida ko'rinadi.
 */
const STAGE_STEP: Partial<Record<FunnelStageId, FunnelStepId>> = { ordered: 'ordered', kept: 'sold' };

/**
 * Yo'qotish voronkasi: buyurtma qilindi → bekor qilinmadi (jo'natildi) →
 * xaridor qabul qildi → qaytarilmadi (sotildi).
 *
 * Ilgari voronka bitta 100% lenta va to'rt natija plitkasi edi: har bir dona
 * nima bo'lgani ko'rinardi, lekin QAYERDA va QANCHA pul tushib qolgani —
 * yo'q. Endi har bosqich chizig'i buyurtma qilingan donaga nisbatan, undan
 * hozirgina ajralgan qism shu chiziqning davomida rangli (bekor — za'faron,
 * qaytdi — qizil), oldinroq ajralgani esa bo'sh qoladi. Yo'ldagi dona
 * shtrixli va kulrang: u yo'qotish emas, natija kutilmoqda (funnel.ts).
 */
export function LossFunnel({ data }: { data: Pick<FunnelResponse, 'stages' | 'steps' | 'currency'> }) {
  const t = useT(FUNNEL_LOSS_NS);
  const f = useFormat();
  const ordered = data.stages[0]?.units ?? 0;
  const widthOf = (units: number) => (ordered > 0 ? Math.min(100, (units / ordered) * 100) : 0);
  const deltaOf = (id: FunnelStepId) => data.steps.find((s) => s.id === id)?.deltaPct ?? null;

  return (
    <ol aria-label={t('list.label')} className="flex flex-col">
      {data.stages.map((stage, i) => {
        const meta = STAGE[stage.id];
        const Icon = meta.icon;
        const step = STAGE_STEP[stage.id];
        const drop = stage.drop;
        const dropMeta = drop ? DROP[drop.id] : null;
        return (
          <li key={stage.id} className="flex flex-col">
            {drop ? (
              <DropRow
                drop={drop}
                currency={data.currency}
                delta={drop.id === 'inTransit' ? null : deltaOf(drop.id)}
              />
            ) : null}

            <div className="well px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                <div className="flex min-w-0 items-center gap-3" title={t(`stage.${stage.id}.hint`)}>
                  <span
                    aria-hidden
                    className={cn('icon-tile h-8 w-8 rounded-[10px] [&_svg]:h-4 [&_svg]:w-4', meta.toneClass)}
                  >
                    <Icon />
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold leading-5 text-ink">{t(`stage.${stage.id}`)}</p>
                    <p className="line-clamp-1 text-2xs text-muted">{t(`stage.${stage.id}.hint`)}</p>
                  </div>
                </div>
                {/* Telefonda raqamlar nom ostiga tushadi va qatorni to'liq egallaydi */}
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 max-sm:w-full max-sm:justify-between">
                  <span className="tnum font-display text-lg font-bold leading-6 tracking-[-0.01em] text-ink">
                    {f.num(stage.units)}
                    <span className="ml-1 text-xs font-semibold text-muted">{t('unit')}</span>
                  </span>
                  <Amount
                    value={f.money(stage.amount, data.currency)}
                    nowrap
                    className="tnum text-sm font-semibold text-ink-soft"
                  />
                  {stage.share !== null ? (
                    <Badge tone={meta.badge} className="tnum" title={t('stage.share')}>
                      {f.pct(stage.share)}
                    </Badge>
                  ) : null}
                  {step ? <Delta value={deltaOf(step)} /> : null}
                </div>
              </div>

              {/*
                Chiziq buyurtma qilingan donaga nisbatan: to'q qism — shu bosqichda
                qolgani, uning davomidagi och qism — oldingi bosqichdan hozirgina
                ajralgani. Ikkalasi birga o'sadi (bitta animatsiya), aks holda och
                qism to'q qism yetib kelguncha havoda osilib turardi.
              */}
              <div aria-hidden className="mt-3 h-2 w-full overflow-hidden rounded-full bg-surface-3">
                <div
                  className="flex h-full w-full origin-left animate-grow-x"
                  style={{ animationDelay: `${80 + i * 80}ms` }}
                >
                  <div
                    className="h-full shrink-0"
                    style={{ width: `${widthOf(stage.units)}%`, background: tokenColor(meta.token) }}
                  />
                  {drop && dropMeta && drop.units > 0 ? (
                    <div
                      className="h-full min-w-[3px] shrink-0"
                      style={{
                        width: `${widthOf(drop.units)}%`,
                        background: drop.id === 'inTransit' ? PENDING_FILL : tokenColor(dropMeta.token, 0.4),
                      }}
                    />
                  ) : null}
                </div>
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/** Ikki bosqich orasidagi qator: nima ajraldi — dona, so'm, ulush va o'zgarish */
function DropRow({ drop, currency, delta }: { drop: FunnelStageDrop; currency: string; delta: number | null }) {
  const t = useT(FUNNEL_LOSS_NS);
  const f = useFormat();
  const meta = DROP[drop.id];
  const Icon = meta.icon;
  const pending = drop.id === 'inTransit';
  // Yo'qotish minus bilan; yo'ldagi dona va nol — belgisiz ("−0 dona" g'alati ko'rinardi)
  const sign = !pending && drop.units > 0 ? '−' : '';

  return (
    /*
      Chap chiziq bosqich belgisi markazi ostida (px-4 + 16px): ikki plitka
      bitta zanjirdek o'qiladi, ajralgan qism esa zanjirdan chetga chiqadi.
    */
    <div className="ml-8 flex flex-wrap items-center gap-x-2.5 gap-y-1 border-l-2 border-dashed border-line py-2 pl-4">
      <span aria-hidden className={cn('icon-tile h-6 w-6 rounded-md [&_svg]:h-3.5 [&_svg]:w-3.5', meta.toneClass)}>
        <Icon />
      </span>
      <span className={cn('text-xs font-semibold', meta.ink)}>{t(`drop.${drop.id}`)}</span>
      <span className="tnum text-xs text-ink-soft">
        {sign}
        {t('units', { n: f.num(drop.units) })} · {sign}
        {f.money(drop.amount, currency)}
      </span>
      {drop.rate !== null ? (
        <span className="tnum text-xs text-muted" title={t(`drop.${drop.id}.rate`)}>
          · {f.pct(drop.rate)}
        </span>
      ) : null}
      {/* Yo'ldagi dona baholanmaydi: o'zgarish chipi o'rnida neytral izoh (yashil/qizil emas) */}
      {pending ? (
        <span className="chip bg-surface-3 px-1.5 py-0.5 text-2xs text-muted">{t('drop.inTransit.note')}</span>
      ) : (
        <Delta value={delta} invert className="px-1.5 py-0.5 text-2xs" />
      )}
    </div>
  );
}
