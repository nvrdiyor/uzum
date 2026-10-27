import { useMemo, type ReactNode } from 'react';
import {
  FREE_TURNOVER_DAYS,
  LOGISTICS_FEE,
  STORAGE_TARIFF,
  TARIFF_EFFECTIVE_FROM,
  type StorageTariffKind,
} from '@savdoiq/shared';
import { Box, Boxes, Calculator, ExternalLink, Lightbulb, Truck, Warehouse } from '@/components/icons';
import { Amount, Badge, Button, Card, CardBody, CardHeader, Segmented, Select, Skeleton, type Tone } from '@/components/ui';
import { NumberField } from '@/components/unit/NumberField';
import { useFormat, useT } from '@/i18n';
import { cn } from '@/lib/utils';
import {
  DIMS,
  LOGISTICS_CAP_LITERS,
  MAX_DIM_MM,
  MAX_LITERS,
  MAX_TURNOVER,
  TURNOVER_CHIPS,
  computeLitrovka,
  type LitrInput,
  type LitrMode,
} from './litrovka';
import { MANUAL_STORAGE_URL, MANUAL_TARIFFS_URL, TIER_COUNT, literDigits, tierLabel, tierRate } from './tariff';
import type { UnitDefaultsBasis } from './unitSources';
import './texts';

export interface LitrovkaSkuOption {
  id: string;
  label: string;
}

const KINDS: StorageTariffKind[] = ['standard', 'reduced'];

/**
 * "Litrovka" — tovar hajmi Uzumda qancha turadi: hisoblanadigan litr,
 * logistika yig'imi, aylanma bo'yicha saqlash va bitta o'lchamni qancha
 * kichraytirsa bir litr tushishi. Hamma qoida shared tariffs.ts dan
 * (`computeLitrovka`), hech narsa saqlanmaydi.
 *
 * Kartochkalar telefonda kiritish–natija juftligida tiziladi (`order`):
 * o'lcham → logistika → saqlash kiritish → saqlash natijasi → maslahat.
 */
export function LitrovkaTab({
  value,
  onChange,
  skuOptions,
  skuId,
  onSelectSku,
  skuListLoading,
  basis,
  basisLoading,
  onUseInUnit,
}: {
  value: LitrInput;
  onChange: (next: LitrInput) => void;
  skuOptions: LitrovkaSkuOption[];
  skuId: string;
  onSelectSku: (id: string) => void;
  skuListLoading: boolean;
  /** Tanlangan SKU kartochkasidan (GET /unit/defaults `basis`) */
  basis: UnitDefaultsBasis | null;
  basisLoading: boolean;
  /** Natijani unit kalkulyatorga o'tkazish */
  onUseInUnit: () => void;
}) {
  const t = useT('litrovka');
  const f = useFormat();
  const r = useMemo(() => computeLitrovka(value), [value]);
  const patch = (p: Partial<LitrInput>) => onChange({ ...value, ...p });
  const fmtL = (v: number) => f.num(v, literDigits(v));
  const unitL = t('unit.l');
  const kindLong = (k: StorageTariffKind) => t(k === 'reduced' ? 'kind.reducedLong' : 'kind.standardLong');

  const setMode = (mode: LitrMode) => {
    // mm → litr: hisoblangan hajm litr maydoniga o'tadi — raqam yo'qolmasin
    if (mode === 'l' && value.mode === 'mm' && r.volume > 0) patch({ mode, liters: Math.round(r.volume * 1000) / 1000 });
    else patch({ mode });
  };

  const saving = r.saving;
  const noDimsTimes = r.logistics ? LOGISTICS_FEE.noDimensions / r.logistics : 0;

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(360px,440px)] lg:gap-5 xl:grid-cols-[minmax(0,1fr)_480px]">
      {/* ── Chap ustun: kiritish ── */}
      <div className="contents lg:block lg:space-y-4">
        <Card className="order-1">
          <CardBody className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="flex shrink-0 items-center gap-2.5 text-sm font-semibold text-ink">
              <span className="icon-tile h-9 w-9 rounded-[10px] [&_svg]:h-4 [&_svg]:w-4" aria-hidden>
                <Boxes />
              </span>
              {t('sku.label')}
            </div>
            <div className="min-w-0 flex-1">
              {skuListLoading ? (
                <Skeleton className="h-11 w-full" />
              ) : (
                <Select value={skuId} onChange={(e) => onSelectSku(e.target.value)} aria-label={t('sku.label')}>
                  <option value="">{t('sku.manual')}</option>
                  {skuOptions.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.label}
                    </option>
                  ))}
                </Select>
              )}
            </div>
          </CardBody>
          <p className="-mt-2 px-5 pb-4 text-xs leading-relaxed text-muted">
            {basisLoading ? (
              t('common.loading')
            ) : basis ? (
              <>
                {basis.volumeL > 0 ? (
                  <span className="tnum text-brand-ink">{t('sku.loaded', { v: fmtL(basis.volumeL), n: f.num(basis.fbo) })}</span>
                ) : (
                  <span className="text-warn-ink">{t('sku.noDims', { fee: f.money(LOGISTICS_FEE.noDimensions) })}</span>
                )}
                {basis.category ? ` · ${t('sku.kind', { c: basis.category, kind: kindLong(basis.tariffKind) })}` : null}
              </>
            ) : (
              t('sku.hint')
            )}
          </p>
        </Card>

        <Card className="order-2">
          <Section
            icon={<Box />}
            title={t('section.size')}
            actions={
              <Segmented<LitrMode>
                size="sm"
                value={value.mode}
                onChange={setMode}
                options={[
                  { value: 'mm', label: t('mode.mm') },
                  { value: 'l', label: t('mode.l') },
                ]}
              />
            }
          >
            {value.mode === 'mm' ? (
              <div className="grid grid-cols-3 gap-2.5">
                {DIMS.map((d) => (
                  <NumberField
                    key={d}
                    label={t(`fld.${d}`)}
                    suffix={t('unit.mm')}
                    value={value[d]}
                    min={0}
                    max={MAX_DIM_MM}
                    step={10}
                    onChange={(v) => patch({ [d]: v })}
                  />
                ))}
              </div>
            ) : (
              <NumberField
                label={t('fld.liters')}
                hint={t('fld.litersHint')}
                hintOnFocus
                suffix={unitL}
                value={value.liters}
                min={0}
                max={MAX_LITERS}
                step={0.1}
                onChange={(v) => patch({ liters: v })}
              />
            )}

            <dl className="well mt-4 divide-y divide-line/70">
              <ResultRow label={t('vol.exact')} value={r.volume > 0 ? `${fmtL(r.volume)} ${unitL}` : '—'} />
              <ResultRow label={t('vol.billable')} value={r.billable > 0 ? `${f.num(r.billable)} ${unitL}` : '—'} strong />
            </dl>
            <p className="tnum mt-2 text-xs leading-relaxed text-muted">
              {r.volume <= 0
                ? t('vol.empty')
                : value.mode === 'mm'
                  ? t('vol.formula', {
                      l: fmtL(value.length),
                      w: fmtL(value.width),
                      h: fmtL(value.height),
                      v: fmtL(r.volume),
                    })
                  : null}
              {r.volume > 0 && r.billable !== r.volume ? ` ${t('vol.rounding', { v: fmtL(r.volume), b: f.num(r.billable) })}` : null}
            </p>
          </Section>
        </Card>

        <Card className="order-4">
          <Section icon={<Warehouse />} title={t('section.storage')}>
            <div className="grid grid-cols-2 gap-3.5">
              <NumberField
                label={t('fld.units')}
                hint={t('fld.unitsHint')}
                hintOnFocus
                suffix={t('unit.pcs')}
                value={value.units}
                min={0}
                max={10_000_000}
                step={1}
                onChange={(v) => patch({ units: Math.round(v) })}
              />
              <NumberField
                label={t('fld.turnover')}
                hint={t('fld.turnoverHint')}
                hintOnFocus
                suffix={t('unit.days')}
                value={value.turnover}
                min={0}
                max={MAX_TURNOVER}
                step={1}
                onChange={(v) => patch({ turnover: Math.round(v) })}
              />
            </div>
            {/* Tezkor tanlov: guruh chegaralari atrofidagi odatiy aylanmalar */}
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {TURNOVER_CHIPS.map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => patch({ turnover: d })}
                  aria-pressed={value.turnover === d}
                  className={cn(
                    'chip tnum border transition-colors',
                    value.turnover === d
                      ? 'border-brand/40 bg-brand/10 text-brand-ink'
                      : 'border-line bg-surface text-muted hover:border-line-strong hover:text-ink',
                  )}
                >
                  {d} {t('unit.days')}
                </button>
              ))}
            </div>
            <div className="mt-4">
              <p className="label">{t('fld.kind')}</p>
              <Segmented<StorageTariffKind>
                size="sm"
                value={value.kind}
                onChange={(kind) => patch({ kind })}
                options={KINDS.map((k) => ({ value: k, label: t(`kind.${k}`) }))}
              />
              <p className="mt-1.5 text-2xs leading-relaxed text-muted">{t('kind.hint')}</p>
            </div>
          </Section>
        </Card>
      </div>

      {/* ── O'ng ustun: natija ── */}
      <div className="contents lg:sticky lg:top-20 lg:block lg:space-y-4 lg:self-start">
        <Card tone="info" className="order-3">
          <CardHeader icon={<Truck />} title={t('log.title')} subtitle={t('log.sub')} />
          <CardBody>
            {r.logistics === null ? (
              <p className="text-sm text-muted">{t('log.empty')}</p>
            ) : (
              <>
                <p className="tnum font-title text-[32px] font-semibold leading-none tracking-[-0.03em] text-ink">
                  <Amount value={f.money(r.logistics)} />
                </p>
                <p className="tnum mt-2.5 text-sm text-ink-soft">
                  {r.billable <= 1
                    ? t('log.base', { fee: f.money(LOGISTICS_FEE.base) })
                    : t('log.formula', {
                        base: f.num(LOGISTICS_FEE.base),
                        l: f.num(r.billable),
                        extra: f.num(LOGISTICS_FEE.perExtraLiter),
                        fee: f.money(r.logisticsCapped ? r.logisticsRaw : r.logistics),
                      })}
                </p>
                <p className={cn('tnum mt-1 text-xs', r.logisticsCapped ? 'font-medium text-warn-ink' : 'text-muted')}>
                  {r.logisticsCapped
                    ? t('log.capped', {
                        raw: f.money(r.logisticsRaw),
                        max: f.money(LOGISTICS_FEE.max),
                        capL: f.num(LOGISTICS_CAP_LITERS),
                      })
                    : t('log.cap', { max: f.num(LOGISTICS_FEE.max), capL: f.num(LOGISTICS_CAP_LITERS) })}
                </p>
              </>
            )}
            <div className="well mt-4 flex items-center justify-between gap-3 px-4 py-2.5">
              <span className="tnum text-xs leading-snug text-ink-soft">
                {t('log.noDims', { fee: f.money(LOGISTICS_FEE.noDimensions) })}
              </span>
              {noDimsTimes > 1 ? (
                <Badge tone="warn" className="shrink-0">
                  <span className="tnum">{t('log.noDimsTimes', { x: f.num(noDimsTimes, 1) })}</span>
                </Badge>
              ) : null}
            </div>
          </CardBody>
        </Card>

        <Card className="order-5">
          <CardHeader
            icon={<Warehouse />}
            tone="info"
            title={t('st.title')}
            subtitle={t('st.sub', { d: f.num(value.turnover), tier: tierLabel(r.tier), kind: kindLong(value.kind) })}
          />
          <CardBody>
            {r.billable === 0 ? (
              <p className="text-sm text-muted">{t('st.noVolume')}</p>
            ) : r.rate === 0 ? (
              <div className="well p-4">
                <p className="font-display text-lg font-bold text-brand-ink">{t('st.free')}</p>
                <p className="tnum mt-1 text-xs leading-relaxed text-muted">
                  {t('st.freeWhy', {
                    free: FREE_TURNOVER_DAYS,
                    from: FREE_TURNOVER_DAYS + 1,
                    rate: f.num(tierRate(1, value.kind)),
                  })}
                </p>
              </div>
            ) : (
              <dl className="well divide-y divide-line/70">
                <ResultRow
                  label={t('st.perItem')}
                  note={
                    r.perItemCapped
                      ? t('st.perItemCap', { cap: f.money(STORAGE_TARIFF[value.kind].capPerItemDay) })
                      : t('st.perItemFormula', { l: f.num(r.billable), rate: f.num(r.rate) })
                  }
                  value={<Amount value={f.money(r.perItemDay)} nowrap />}
                />
                <ResultRow
                  label={t('st.stay', { d: f.num(value.turnover) })}
                  note={`${f.money(r.perItemDay)} × ${f.num(value.turnover)}`}
                  value={<Amount value={f.money(r.perItemStay)} nowrap />}
                />
                <ResultRow
                  label={t('st.month', { n: f.num(r.units) })}
                  note={t('st.monthFormula', { n: f.num(r.units), fee: f.num(r.perItemDay) })}
                  value={<Amount value={f.money(r.perMonthAll)} nowrap />}
                  strong
                />
              </dl>
            )}

            {/* Qo'llanmadagi tariflar jadvali — joriy guruh va tarif turi belgilangan */}
            <div className="mt-4 overflow-hidden rounded-xl border border-line">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-surface-2 text-xs text-muted">
                    <th className="px-3 py-2 text-left font-semibold">{t('st.colTurnover')}</th>
                    {KINDS.map((k) => (
                      <th
                        key={k}
                        className={cn('px-3 py-2 text-right font-semibold', k === value.kind && 'text-brand-ink')}
                      >
                        {t(k === 'reduced' ? 'st.colReduced' : 'st.colStandard')}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="tnum">
                  {Array.from({ length: TIER_COUNT }, (_, i) => {
                    const active = i === r.tier;
                    return (
                      <tr
                        key={tierLabel(i)}
                        className={cn('border-t border-line/70', active && 'bg-brand/[0.06]')}
                        aria-current={active ? 'true' : undefined}
                      >
                        <td className={cn('px-3 py-1.5', active ? 'font-semibold text-brand-ink' : 'text-ink-soft')}>
                          {tierLabel(i)}
                        </td>
                        {KINDS.map((k) => {
                          const rate = tierRate(i, k);
                          return (
                            <td
                              key={k}
                              className={cn(
                                'px-3 py-1.5 text-right',
                                active && k === value.kind ? 'font-bold text-brand-ink' : 'text-ink',
                              )}
                            >
                              {rate > 0 ? f.num(rate) : t('st.freeCell')}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                  <tr className="border-t border-line/70 bg-surface-2/50">
                    <td className="px-3 py-1.5 text-ink-soft">{t('st.cap')}</td>
                    {KINDS.map((k) => (
                      <td key={k} className="px-3 py-1.5 text-right text-ink">
                        {f.num(STORAGE_TARIFF[k].capPerItemDay)}
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
              <p className="border-t border-line/70 px-3 py-1.5 text-right text-2xs text-muted">{t('st.unit')}</p>
            </div>

            <Button
              variant="outline"
              size="sm"
              className="mt-4 w-full"
              icon={<Calculator className="h-3.5 w-3.5" />}
              disabled={r.logistics === null}
              onClick={onUseInUnit}
            >
              {t('use.button')}
            </Button>
          </CardBody>
        </Card>

        <Card className="order-6">
          <CardHeader icon={<Lightbulb />} tone="warn" title={t('tip.title')} />
          <CardBody>
            {r.billable === 0 ? (
              <p className="text-sm text-muted">{t('tip.empty')}</p>
            ) : !saving ? (
              <p className="tnum text-sm text-muted">{t('tip.small', { fee: f.money(LOGISTICS_FEE.base) })}</p>
            ) : (
              <>
                <p className="tnum text-sm leading-relaxed text-ink">
                  {saving.tip
                    ? t('tip.cut', {
                        dim: t(`dim.${saving.tip.dim}`),
                        from: fmtL(saving.tip.from),
                        to: fmtL(saving.tip.to),
                        cut: fmtL(saving.tip.cut),
                        fromL: f.num(saving.fromL),
                        toL: f.num(saving.toL),
                      })
                    : t('tip.litre', {
                        need: fmtL(Math.round(saving.needL * 1000) / 1000),
                        v: fmtL(r.volume),
                        fromL: f.num(saving.fromL),
                        toL: f.num(saving.toL),
                      })}
                </p>
                {value.mode === 'l' ? <p className="mt-1 text-xs text-muted">{t('tip.litreHint')}</p> : null}
                <dl className="well mt-3 divide-y divide-line/70">
                  <ResultRow
                    label={t('tip.saveLog')}
                    note={saving.logistics > 0 ? undefined : t('tip.noLogSave')}
                    value={saving.logistics > 0 ? <Saving value={f.money(saving.logistics)} /> : '—'}
                  />
                  <ResultRow
                    label={t('tip.saveStorage', { n: f.num(r.units) })}
                    note={
                      saving.storageMonth > 0
                        ? undefined
                        : r.rate === 0
                          ? t('tip.noStorageSave')
                          : r.perItemCapped
                            ? t('tip.capStorage')
                            : undefined
                    }
                    value={saving.storageMonth > 0 ? <Saving value={f.money(saving.storageMonth)} /> : '—'}
                  />
                </dl>
              </>
            )}
          </CardBody>
        </Card>

        {/* Manba: qo'llanma sahifalari (faqat o'zbekcha bor) */}
        <div className="order-7 flex flex-wrap items-center gap-x-4 gap-y-2 px-1 text-xs">
          <span className="meta-chip">{t('src.title', { date: f.date(TARIFF_EFFECTIVE_FROM) })}</span>
          <ManualLink href={MANUAL_TARIFFS_URL}>{t('src.logistics')}</ManualLink>
          <ManualLink href={MANUAL_STORAGE_URL}>{t('src.storage')}</ManualLink>
        </div>
      </div>
    </div>
  );
}

/** Kartochka ichidagi bo'lim: kichik sarlavha, o'ngda ixtiyoriy boshqaruv */
function Section({
  icon,
  title,
  actions,
  tone = 'info',
  children,
}: {
  icon: ReactNode;
  title: string;
  actions?: ReactNode;
  tone?: Tone;
  children: ReactNode;
}) {
  return (
    <section className="p-5">
      <div className="mb-3.5 flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2.5 text-sm font-semibold text-ink">
          <span className={cn('icon-tile h-7 w-7 rounded-lg [&_svg]:h-3.5 [&_svg]:w-3.5', `tone-${tone}`)} aria-hidden>
            {icon}
          </span>
          {title}
        </h3>
        {actions}
      </div>
      {children}
    </section>
  );
}

/** Natija qatori: chapda nom (ostida formula), o'ngda qiymat — tor ustunda ham sig'adi */
function ResultRow({
  label,
  note,
  value,
  strong,
}: {
  label: string;
  note?: string;
  value: ReactNode;
  strong?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-2.5">
      <dt className="min-w-0">
        <span className={cn('block text-sm', strong ? 'font-medium text-ink-soft' : 'text-muted')}>{label}</span>
        {note ? <span className="tnum mt-0.5 block text-2xs leading-snug text-muted">{note}</span> : null}
      </dt>
      <dd className={cn('tnum shrink-0 text-right', strong ? 'font-display text-base font-bold text-ink' : 'text-sm font-semibold text-ink')}>
        {value}
      </dd>
    </div>
  );
}

function Saving({ value }: { value: string }) {
  return <span className="text-brand-ink">−{value}</span>;
}

function ManualLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      className="inline-flex items-center gap-1.5 font-semibold text-brand-ink hover:underline"
      href={href}
      target="_blank"
      rel="noreferrer noopener"
    >
      {children}
      <ExternalLink className="h-3.5 w-3.5" />
    </a>
  );
}
