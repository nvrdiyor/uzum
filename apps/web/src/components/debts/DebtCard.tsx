/**
 * Ro'yxatdagi bitta qarz. Butun kartochka bosilsa qarz sahifasi ochiladi;
 * kundalik ikki amal — "To'ladim" va "Ishlatdim" — shu yerning o'zida
 * (faqat yozish huquqi bo'lsa: kuzatuvchiga tugma ko'rsatilmaydi).
 *
 * Chap tomonda — qancha qoldi va qanchasi to'landi, o'ngda — keyingi to'lov:
 * qachon, qancha va shundan foiz. Pastda — olingan pul nimaga ketgani
 * (kartada — limit va bo'sh qismi).
 *
 * Tayyor kartada (TBC Osmon, Infin Black) keyingi to'lov ostida — foizsiz qolish
 * uchun qancha va qachongacha (bo'lmasa — keyingi ko'chirma sanasi).
 */
import { useNavigate } from 'react-router-dom';
import { CARD_PRODUCTS, formatDebtMoney, isCardProduct, type DebtSummary } from '@savdoiq/shared';
import { ArrowRight, CircleCheck, Lock, ShoppingBag } from '@/components/icons';
import { Amount, Badge, Button, Card, ProgressBar } from '@/components/ui';
import { useFormat, useT } from '@/i18n';
import { KIND_ICON } from './kinds';
import { categoryLabel, dueChip, dueShown, graceView, interestFromDays, rateText, repaymentText } from './format';
import type { EntryMode } from './EntryModal';

export function DebtCard({
  debt,
  canEdit,
  isOwner,
  onAction,
}: {
  debt: DebtSummary;
  canEdit: boolean;
  isOwner: boolean;
  onAction: (debt: DebtSummary, mode: EntryMode) => void;
}) {
  const t = useT('debts');
  const f = useFormat();
  const navigate = useNavigate();
  const { calc, terms } = debt;
  const m = (v: number) => formatDebtMoney(v, terms.currency, f.lang);
  const isCard = debt.kind === 'card';
  const active = calc.state === 'active';
  const Icon = KIND_ICON[debt.kind];
  const chip = dueChip(calc, t);
  const next = active ? calc.next : null;
  const pct = Math.round(calc.progressPct);
  const open = () => navigate(`/debts/${debt.id}`);
  // Avvaldan bor kreditda ishlatish yozilmaguncha bu qator bo'sh qoladi
  const showUsage = isCard || calc.unused !== null || calc.used > 0 || debt.lastUse !== null;
  const product = isCard && isCardProduct(terms.cardProduct) ? CARD_PRODUCTS[terms.cardProduct] : null;
  const pc = product ? calc.card : undefined;
  // Foizsiz qolish holati: summa bugungi yopish summasidan oshmaydi (xavfsizlik to'ri, web-2); 'none' — qator yo'q
  const gv = pc ? graceView(calc) : null;
  // Tayyor kartada nom bo'sh qolsa karta nomi yoziladi — u holda takrorlanmasin
  const subtitle = product
    ? [debt.title && debt.title !== product.name ? debt.title : '', `${product.bank} ${product.name}`].filter(Boolean).join(' · ')
    : debt.title || t(`kind.${debt.kind}`);

  return (
    // Klaviatura uchun "Batafsil" tugmasi bor — kartochkaning o'zi fokuslanmaydi (ichida tugmalar bor)
    <Card hover onClick={open} className="flex min-w-0 cursor-pointer flex-col p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <span className="icon-tile tone-muted h-10 w-10 rounded-xl [&_svg]:h-5 [&_svg]:w-5" aria-hidden>
          <Icon />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold text-ink" title={debt.lender}>
            {debt.lender}
          </p>
          <p className="truncate text-xs text-muted" title={product ? subtitle : debt.title || undefined}>
            {subtitle}
          </p>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        <Badge tone="muted">{rateText(terms, t, f.lang)}</Badge>
        <Badge tone="muted">{repaymentText(terms, t, f.lang, calc)}</Badge>
        {terms.currency === 'USD' ? <Badge tone="muted">$</Badge> : null}
        {isOwner && debt.ownerOnly ? (
          <Badge tone="muted" title={t('onlyYou')}>
            <Lock className="h-3 w-3" />
            <span className="sr-only">{t('onlyYou')}</span>
          </Badge>
        ) : null}
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="min-w-0">
          <p className="eyebrow-lg">{t('card.left')}</p>
          <p className="tnum mt-0.5 font-display text-[22px] font-bold leading-tight tracking-[-0.02em] text-ink">
            <Amount value={m(calc.principal)} />
          </p>
          {/* To'langan qismi — brend; kartada limitdan band qismi — za'faron (bu qarz) */}
          <ProgressBar className="mt-2.5" value={calc.progressPct} tone={isCard ? 'warn' : 'brand'} />
          <p className="tnum mt-1.5 text-xs text-muted">{isCard ? t('card.usedPct', { pct }) : t('card.paidPct', { pct })}</p>
          {active && calc.accruedInterest > 0 ? (
            <p className="tnum mt-0.5 text-xs text-muted">{t('card.payoff', { sum: m(calc.payoff) })}</p>
          ) : null}
        </div>

        <div className="well min-w-0 p-3.5">
          <p className="eyebrow-lg">{t('card.next')}</p>
          {next ? (
            <>
              <p className="tnum mt-0.5 text-[15px] font-semibold leading-snug text-ink">
                {/* Ko'chirma hali chiqmagan — minimal taxminiy */}
                {f.dateShort(next.date)} — {next.card?.estimate ? '≈ ' : ''}
                <Amount value={m(dueShown(next.remaining, calc, pc !== undefined))} nowrap />
              </p>
              {/*
               * Tayyor kartada — foizsiz qolish uchun qancha (ochiq ko'chirma), bo'lmasa keyingi ko'chirma sanasi
               * (ko'chirmada foizsiz qism yo'q — 'none', yoki 5.7.3 — 'lost': ham ko'chirma sanasi).
               * Boshqasida foiz — butun to'lovniki: qisman to'langanda qolgan summa yonida ko'rsatilmaydi (to'lov avval
               * foizga tushadi, qolgani asosan asosiy qarz). Ilgari "825 299 · shundan foiz ≈ 1 150 685" chiqardi
               */}
              {pc ? (
                <p className="tnum mt-0.5 text-xs text-muted">
                  {gv?.kind === 'open'
                    ? t('card.grace', { sum: m(gv.left), date: f.dateShort(gv.due) })
                    : t('card.stmt', { date: f.dateShort(pc.nextStatement.date) })}
                </p>
              ) : next.interest > 0 && next.remaining === next.amount ? (
                <p className="tnum mt-0.5 text-xs text-muted">
                  {/* "(31 kun)" faqat foiz shu kunlardan chiqqanda: erta to'lov yoki xariddan keyin kunlar boshqa */}
                  {interestFromDays(next, terms.currency)
                    ? t('card.ofInterest', { sum: m(next.interest), n: next.explain.days })
                    : t('card.ofInterestNoDays', { sum: m(next.interest) })}
                </p>
              ) : next.paid > 0 ? (
                <p className="tnum mt-0.5 text-xs text-muted">{t('how.paid', { paid: m(next.paid), left: m(next.remaining) })}</p>
              ) : null}
            </>
          ) : (
            <p className="mt-0.5 text-sm text-muted">—</p>
          )}
          <Badge tone={chip.tone} className="mt-2">
            {chip.label}
          </Badge>
        </div>
      </div>

      {showUsage ? (
        <div className="tnum mt-3 space-y-0.5 border-t border-line/70 pt-3 text-xs text-muted">
          {isCard ? (
            <p>
              {t('card.limit', { limit: m(terms.amount) })} ·{' '}
              {/* Bo'sh limit — ko'k (neytral), qarz emas; kechikish sababli bank bloklagan bo'lsa — qizil */}
              {pc?.blocked ? (
                <span className="font-medium text-danger-ink">{t('stat.blocked')}</span>
              ) : (
                <span className="font-medium text-info-ink">{t('card.free', { sum: m(calc.freeLimit ?? 0) })}</span>
              )}
            </p>
          ) : calc.unused !== null || calc.used > 0 ? (
            <p>
              {t('card.used', { used: m(calc.used), received: m(calc.received) })}
              {calc.unused !== null ? (
                <>
                  {' · '}
                  {/* Sotuvchining hali ishlatilmagan puli — brend */}
                  <span className="font-medium text-brand-ink">{t('card.unused', { sum: m(calc.unused) })}</span>
                </>
              ) : null}
            </p>
          ) : null}
          {debt.lastUse ? (
            <p className="truncate">
              {t('card.last', {
                cat: categoryLabel(debt.lastUse.category, t),
                sum: m(debt.lastUse.amount),
                date: f.dateShort(debt.lastUse.date),
              })}
            </p>
          ) : null}
        </div>
      ) : null}

      {/* Tugmalar bosilganda kartochka ochilib ketmasin */}
      <div className="mt-auto flex flex-wrap items-center gap-2 pt-4" onClick={(e) => e.stopPropagation()}>
        {canEdit && active ? (
          <>
            <Button variant="soft" icon={<CircleCheck className="h-4 w-4" />} onClick={() => onAction(debt, 'pay')}>
              {t('btn.pay')}
            </Button>
            {/* Nasiya — bo'lib to'lab olingan tovar, "ishlatiladigan" naqd pul yo'q */}
            {debt.kind !== 'installment' ? (
              <Button variant="outline" icon={<ShoppingBag className="h-4 w-4" />} onClick={() => onAction(debt, 'use')}>
                {isCard ? t('btn.useCard') : t('btn.use')}
              </Button>
            ) : null}
          </>
        ) : null}
        <Button variant="ghost" className="ml-auto" iconRight={<ArrowRight className="h-4 w-4" />} onClick={open}>
          {t('btn.more')}
        </Button>
      </div>
    </Card>
  );
}
