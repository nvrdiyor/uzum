import { useState } from 'react';
import { LOGISTICS_FEE, billableLiters, logisticsFee, volumeFromDims } from '@savdoiq/shared';
import { Calculator } from '@/components/icons';
import { Amount, Card, CardBody, CardHeader } from '@/components/ui';
import { NumberField } from '@/components/unit/NumberField';
import { useFormat, useT } from '@/i18n';
import { cn } from '@/lib/utils';
import { fractionDigits } from './format';
import './texts';

type Dim = 'length' | 'width' | 'height';

/**
 * Boshlang'ich qiymat — Uzum qo'llanmasidagi misolning o'zi (500 × 380 × 300
 * mm = 57 l → 19 250 so'm): sotuvchi natijani qo'llanma bilan darhol
 * solishtira oladi.
 */
const EXAMPLE: Record<Dim, number> = { length: 500, width: 380, height: 300 };

const DIMS: Dim[] = ['length', 'width', 'height'];

/**
 * "Hajmni tekshirish" — o'lchamdan Uzum logistika yig'imini hisoblaydi.
 * Hisob tariffs.ts dagi o'sha funksiyalar bilan (server tekshiruvi ham
 * shular bilan), hech narsa saqlanmaydi — kartochkaga o'lcham kiritishdan
 * oldin tekshirib ko'rish uchun.
 */
export function VolumeCalculator({ className }: { className?: string }) {
  const t = useT('vgh');
  const f = useFormat();
  const [dims, setDims] = useState<Record<Dim, number>>(EXAMPLE);

  const volume = volumeFromDims(dims.length, dims.width, dims.height);
  const liters = billableLiters(volume);
  const fee = logisticsFee(volume);
  // Chegaragacha bo'lgan "xom" summa — formula qatori arifmetik jihatdan to'g'ri chiqsin
  const raw = LOGISTICS_FEE.base + Math.max(0, liters - 1) * LOGISTICS_FEE.perExtraLiter;
  const capped = fee !== null && raw > LOGISTICS_FEE.max;

  const formula =
    fee === null
      ? t('calc.empty', { fee: f.money(LOGISTICS_FEE.noDimensions) })
      : liters <= 1
        ? t('calc.formulaBase', { fee: f.money(LOGISTICS_FEE.base) })
        : t('calc.formula', {
            base: f.num(LOGISTICS_FEE.base),
            l: f.num(liters),
            extra: f.num(LOGISTICS_FEE.perExtraLiter),
            fee: f.money(raw),
          });

  const unitL = t('unit.l');

  return (
    <Card className={className}>
      <CardHeader icon={<Calculator />} tone="info" title={t('calc.title')} subtitle={t('calc.sub')} />
      <CardBody>
        <div className="grid grid-cols-3 gap-2.5">
          {DIMS.map((d) => (
            <NumberField
              key={d}
              label={t(`calc.${d}`)}
              suffix={t('unit.mm')}
              value={dims[d]}
              min={0}
              max={100_000}
              step={10}
              onChange={(v) => setDims((cur) => ({ ...cur, [d]: v }))}
            />
          ))}
        </div>

        <dl className="well mt-4 divide-y divide-line/70">
          <div className="flex items-center justify-between gap-3 px-4 py-2.5">
            <dt className="text-sm text-muted">{t('calc.volume')}</dt>
            <dd className="tnum text-sm font-medium text-ink">
              {volume > 0 ? `${f.num(volume, fractionDigits(volume))} ${unitL}` : '—'}
            </dd>
          </div>
          <div className="flex items-center justify-between gap-3 px-4 py-2.5">
            <dt className="text-sm text-muted">{t('calc.billable')}</dt>
            <dd className="tnum text-sm font-medium text-ink">{liters > 0 ? `${f.num(liters)} ${unitL}` : '—'}</dd>
          </div>
          <div className="flex items-center justify-between gap-3 px-4 py-3">
            <dt className="text-sm font-medium text-ink-soft">{t('calc.fee')}</dt>
            <dd className="tnum font-display text-lg font-bold text-ink">
              {fee !== null ? <Amount value={f.money(fee)} nowrap /> : '—'}
            </dd>
          </div>
        </dl>

        <p className={cn('tnum mt-3 text-xs', fee === null ? 'text-warn-ink' : 'text-muted')}>{formula}</p>
        {capped ? (
          <p className="mt-1 text-xs font-medium text-warn-ink">{t('calc.cap', { max: f.money(LOGISTICS_FEE.max) })}</p>
        ) : null}
        <p className="mt-3 text-2xs leading-relaxed text-muted">{t('calc.hint')}</p>
      </CardBody>
    </Card>
  );
}
