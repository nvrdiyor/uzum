import { CARD_PRODUCTS, DEBT_CARD_PRODUCTS, DEBT_KINDS, type DebtCardProduct, type DebtKind } from '@savdoiq/shared';
import { CreditCard, Landmark, Store, UserRound, type AppIcon } from '@/components/icons';
import { useT } from '@/i18n';
import { cn } from '@/lib/utils';
import './texts';

/** Qarz turi belgisi — kartochka, sahifa sarlavhasi va shakl plitkalarida bir xil */
export const KIND_ICON: Record<DebtKind, AppIcon> = {
  person: UserRound,
  bank: Landmark,
  card: CreditCard,
  installment: Store,
};

/** Tur va karta plitkasi — ikkala tanlovda bir xil ko'rinish */
const TILE =
  'focusable flex min-h-[76px] items-start gap-3 rounded-2xl border border-line bg-surface-2/60 p-4 text-left transition-colors hover:border-brand/50 hover:bg-surface-2';

/** "TBC Bank · Mastercard / Humo" — bank va to'lov tizimi (CARD_PRODUCTS dan) */
export const productSub = (p: DebtCardProduct): string => `${CARD_PRODUCTS[p].bank} · ${CARD_PRODUCTS[p].network}`;

/**
 * Kredit kartaning birinchi qadami: ko'p ishlatiladigan ikkita karta (bank shartlari bilan alohida hisob) va
 * "Boshqa karta" — umumiy hisob. Hech biri oldindan tanlanmagan: noto'g'ri tanlangan karta hisobni buzadi
 */
export function CardProductTiles({ onPick }: { onPick: (p: DebtCardProduct | 'other') => void }) {
  const t = useT('debts');
  const picks: (DebtCardProduct | 'other')[] = [...DEBT_CARD_PRODUCTS, 'other'];
  return (
    <div className="grid gap-3">
      {picks.map((p) => (
        <button key={p} type="button" onClick={() => onPick(p)} className={TILE}>
          <span className="icon-tile tone-muted h-10 w-10 rounded-xl [&_svg]:h-5 [&_svg]:w-5" aria-hidden>
            <CreditCard />
          </span>
          <span className="min-w-0">
            <span className="block font-semibold text-ink">{t(`prod.${p}`)}</span>
            <span className="mt-0.5 block text-xs leading-snug text-muted">
              {p === 'other' ? t('prod.other.hint') : productSub(p)}
            </span>
          </span>
        </button>
      ))}
    </div>
  );
}

/**
 * To'rtta tur plitkasi: bo'sh sahifada (bosilsa shakl shu tur bilan ochiladi) va
 * shaklning birinchi qadamida. Sotuvchi atama tanlamaydi — tur takrorlash,
 * kunlarni hisoblash va maydonlarni o'zi belgilaydi.
 */
export function KindTiles({ onPick, className }: { onPick: (kind: DebtKind) => void; className?: string }) {
  const t = useT('debts');
  return (
    <div className={cn('grid gap-3 sm:grid-cols-2', className)}>
      {DEBT_KINDS.map((kind) => {
        const Icon = KIND_ICON[kind];
        return (
          <button key={kind} type="button" onClick={() => onPick(kind)} className={TILE}>
            <span className="icon-tile tone-muted h-10 w-10 rounded-xl [&_svg]:h-5 [&_svg]:w-5" aria-hidden>
              <Icon />
            </span>
            <span className="min-w-0">
              <span className="block font-semibold text-ink">{t(`kind.${kind}`)}</span>
              <span className="mt-0.5 block text-xs leading-snug text-muted">{t(`kind.${kind}.hint`)}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
