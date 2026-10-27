import { LOGISTICS_FEE, TARIFF_EFFECTIVE_FROM, billableLiters } from '@savdoiq/shared';
import { ExternalLink, Lightbulb } from '@/components/icons';
import { Card, CardBody, CardHeader } from '@/components/ui';
import { useFormat, useT } from '@/i18n';
import { cn } from '@/lib/utils';
import { keepTogether } from './format';
import './texts';

/**
 * Qo'llanmaning o'zbekcha sahifasi — rus va ingliz tilida alohida sahifasi
 * yo'q (/manual/ru/3.tariffs/ 404 qaytaradi, 2026-10-24), shuning uchun
 * havola matnida til aytiladi.
 */
export const UZUM_TARIFFS_MANUAL = 'https://seller.uzum.uz/manual/uz/3.tariffs/';

/**
 * Logistika yig'imi formulasi. Raqamlar matnga qotirilmagan — tariffs.ts
 * `LOGISTICS_FEE` dan: tarif o'zgarsa izoh ham, server tekshiruvi ham bir
 * joydan yangilanadi. Jarima haqida ATAYLAB hech narsa yo'q: Uzum VGH
 * jarimasini e'lon qilmagan (2026-10-24).
 */
export function TariffExplainer({
  minLines,
  effectiveFrom = TARIFF_EFFECTIVE_FROM,
  className,
}: {
  minLines: number;
  effectiveFrom?: string;
  className?: string;
}) {
  const t = useT('vgh');
  const f = useFormat();
  const money = (v: number): string => keepTogether(f.money(v));
  const unitL = t('unit.l');

  const points = [
    t('how.base', {
      base: money(LOGISTICS_FEE.base),
      extra: money(LOGISTICS_FEE.perExtraLiter),
      max: money(LOGISTICS_FEE.max),
    }),
    t('how.volume', {
      million: keepTogether(f.num(1_000_000)),
      // Qo'llanmadagi misol: 1,6 l → 2 l
      example: keepTogether(`${f.num(1.6, 1)} ${unitL} → ${f.num(billableLiters(1.6))} ${unitL}`),
    }),
    t('how.noDims', {
      fee: money(LOGISTICS_FEE.noDimensions),
      times: f.num(LOGISTICS_FEE.noDimensions / LOGISTICS_FEE.base, 1),
    }),
    t('how.once'),
    t('how.weight'),
  ];
  const steps = [t('how.fix1'), t('how.fix2'), t('how.fix3')];

  return (
    <Card className={cn('flex flex-col', className)}>
      <CardHeader
        icon={<Lightbulb />}
        tone="info"
        title={t('how.title')}
        subtitle={t('how.sub', { date: f.date(effectiveFrom) })}
      />
      <CardBody className="flex flex-1 flex-col">
        <ul className="space-y-2.5">
          {points.map((p) => (
            <li key={p} className="flex items-start gap-2.5 text-sm leading-relaxed text-ink-soft">
              <span className="mt-[0.55rem] h-1.5 w-1.5 shrink-0 rounded-full bg-info" aria-hidden />
              <span className="tnum min-w-0">{p}</span>
            </li>
          ))}
        </ul>
        <p className="mt-4 text-sm leading-relaxed text-muted">{t('how.check', { min: minLines })}</p>

        <div className="well mt-4 p-4">
          <p className="eyebrow">{t('how.fixTitle')}</p>
          <ol className="mt-2.5 space-y-2">
            {steps.map((s, i) => (
              <li key={s} className="flex items-start gap-2.5 text-sm leading-relaxed text-ink-soft">
                <span className="tnum mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-info/10 text-2xs font-bold text-info-ink">
                  {i + 1}
                </span>
                <span className="min-w-0">{s}</span>
              </li>
            ))}
          </ol>
        </div>

        <div className="mt-auto pt-4">
          <a
            href={UZUM_TARIFFS_MANUAL}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-outline px-3.5 py-2 text-sm"
          >
            <ExternalLink className="h-4 w-4" />
            {t('how.manual')}
          </a>
        </div>
      </CardBody>
    </Card>
  );
}
