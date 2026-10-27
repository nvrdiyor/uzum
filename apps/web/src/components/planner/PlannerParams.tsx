/**
 * Hisob parametrlari — yetkazib berish muddati va zaxira davri. Qiymatlar
 * KOMPANIYA sozlamasi (usePlannerSettings): hamma ko'radi, faqat owner/manager
 * o'zgartiradi. O'zgarish butun kompaniyaga tegadi — Mahsulotlar, Qoldiqlar va
 * "Bugun nima qilish kerak" ham shu muddat bilan qayta hisoblanadi.
 */
import { useEffect, useState } from 'react';
import { Lock, Timer } from '@/components/icons';
import { Select, toast } from '@/components/ui';
import { registerNamespace, useT } from '@/i18n';
import { cn } from '@/lib/utils';
import { useCanEditPlanner, usePlannerSettings, useSavePlannerSettings } from './usePlannerSettings';

registerNamespace('planner', {
  uz: {
    'ctrl.cover': 'Zaxira davri',
    'ctrl.coverHint': 'Qoldiq necha kunga yetishi kerak',
    'ctrl.lead': 'Yetkazib berish muddati',
    'ctrl.leadHint': 'Buyurtmadan omborga tushgunicha o‘tadigan vaqt',
    'ctrl.days': 'kun',
    'ctrl.company': 'Kompaniya sozlamasi — Mahsulotlar, Qoldiqlar va «Bugun» ham shu bilan hisoblaydi',
    'ctrl.readonly': 'Faqat egasi yoki menejer o‘zgartira oladi',
    'ctrl.saveError': 'Sozlamani saqlab bo‘lmadi',
  },
  ru: {
    'ctrl.cover': 'Период запаса',
    'ctrl.coverHint': 'На сколько дней должно хватить остатка',
    'ctrl.lead': 'Срок поставки',
    'ctrl.leadHint': 'Время от заказа до приёмки на склад',
    'ctrl.days': 'дн.',
    'ctrl.company': 'Настройка компании — Товары, Остатки и «Сегодня» считают с ней же',
    'ctrl.readonly': 'Изменить может только владелец или менеджер',
    'ctrl.saveError': 'Не удалось сохранить настройку',
  },
  en: {
    'ctrl.cover': 'Cover period',
    'ctrl.coverHint': 'How many days the stock should last',
    'ctrl.lead': 'Lead time',
    'ctrl.leadHint': 'Time from ordering to arrival at the warehouse',
    'ctrl.days': 'days',
    'ctrl.company': 'Company setting — Products, Stocks and “Today” use it too',
    'ctrl.readonly': 'Only the owner or a manager can change it',
    'ctrl.saveError': 'Could not save the setting',
  },
});

const LEAD_OPTIONS = [1, 3, 5, 7, 10, 14, 21, 30];

/** Zaxira davri slayderi: chegaralari va ostidagi belgilar (server: services/plan.ts COVER_MIN/MAX) */
const COVER_MIN = 7;
const COVER_MAX = 90;
const COVER_MARKS = [7, 30, 60, 90];
/** Slayder dumalog'ining kengligi (px) — pastdagi `h-4 w-4` bilan bir xil bo'lishi shart */
const THUMB_PX = 16;
/** Slayder to'xtagach shuncha ms kutib saqlanadi — har piksel uchun so'rov ketmasin */
const SAVE_DELAY_MS = 400;

/**
 * Belgining gorizontal o'rni — dumaloq shu qiymatda turgandagi MARKAZI.
 *
 * Belgilar ilgari teng oraliqda (0, ⅓, ⅔, 1) turardi, slayder esa chiziqli:
 * 30 kun yo'lakning ⅓ qismida emas, (30 − 7) / (90 − 7) ≈ 28% ida. Shu sababli
 * dumaloq "30" yozuviga yetmasdan 30 kunni ko'rsatardi. Bundan tashqari
 * dumaloq markazi yo'lak chetidan emas, o'z yarim kengligidan boshlanadi.
 */
function markLeft(value: number): string {
  const share = (value - COVER_MIN) / (COVER_MAX - COVER_MIN);
  return `calc(${(share * 100).toFixed(2)}% + ${((0.5 - share) * THUMB_PX).toFixed(2)}px)`;
}

export function PlannerParams({ className }: { className?: string }) {
  const t = useT('planner');
  const settings = usePlannerSettings();
  const canEdit = useCanEditPlanner();
  const save = useSavePlannerSettings();

  const saved = settings.data;
  const lead = saved?.leadDays ?? 7;
  /** Slayder surilayotgandagi qiymat; server qiymati bilan tenglashgach yana serverniki ko'rsatiladi */
  const [coverDraft, setCoverDraft] = useState<number | null>(null);
  const cover = coverDraft ?? saved?.coverDays ?? 30;

  useEffect(() => {
    if (coverDraft === null || !saved) return undefined;
    if (coverDraft === saved.coverDays) {
      setCoverDraft(null);
      return undefined;
    }
    const id = setTimeout(() => {
      save.mutate(
        { coverDays: coverDraft },
        {
          onError: (err) => {
            setCoverDraft(null);
            toast.error(t('ctrl.saveError'), err instanceof Error ? err.message : undefined);
          },
        },
      );
    }, SAVE_DELAY_MS);
    return () => clearTimeout(id);
    // save/t — har chizishda yangi; saqlash faqat qiymat o'zgarganda
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coverDraft, saved]);

  const onLead = (value: number) => {
    save.mutate(
      { leadDays: value },
      { onError: (err) => toast.error(t('ctrl.saveError'), err instanceof Error ? err.message : undefined) },
    );
  };

  // API orqali ro'yxatda yo'q qiymat (masalan, 12 kun) saqlangan bo'lsa ham tanlovda ko'rinsin
  const leadOptions = LEAD_OPTIONS.includes(lead) ? LEAD_OPTIONS : [...LEAD_OPTIONS, lead].sort((a, b) => a - b);
  const disabled = !canEdit || !saved;

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-6">
        <label className="flex items-center gap-2.5" title={t('ctrl.leadHint')}>
          <span className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap text-xs font-medium text-muted">
            <Timer className="h-3.5 w-3.5" />
            {t('ctrl.lead')}
          </span>
          <Select
            className="h-9 w-28 py-1.5 text-sm"
            value={lead}
            disabled={disabled}
            onChange={(e) => onLead(Number(e.target.value))}
          >
            {leadOptions.map((d) => (
              <option key={d} value={d}>
                {d} {t('ctrl.days')}
              </option>
            ))}
          </Select>
        </label>
        <div className="min-w-0 sm:w-60" title={t('ctrl.coverHint')}>
          <div className="flex items-baseline justify-between gap-3">
            <span className="whitespace-nowrap text-xs font-medium text-muted">{t('ctrl.cover')}</span>
            <span className="tnum font-display text-sm font-bold text-brand-ink">
              {cover} {t('ctrl.days')}
            </span>
          </div>
          <input
            type="range"
            min={COVER_MIN}
            max={COVER_MAX}
            step={1}
            value={cover}
            disabled={disabled}
            onChange={(e) => setCoverDraft(Number(e.target.value))}
            aria-label={t('ctrl.cover')}
            // Dumaloq o'lchami aniq berilgan (brauzerlarda standarti har xil) — belgilar shunga tayanadi
            className="mt-1.5 h-2 w-full cursor-pointer appearance-none rounded-full bg-surface-3 accent-brand disabled:cursor-not-allowed disabled:opacity-60 [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-brand [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-brand"
          />
          <div className="tnum relative mt-1 h-4 text-2xs text-muted">
            {COVER_MARKS.map((v) => (
              <span key={v} className="absolute -translate-x-1/2" style={{ left: markLeft(v) }}>
                {v}
              </span>
            ))}
          </div>
        </div>
      </div>
      <p className="inline-flex items-center gap-1 text-2xs text-muted sm:justify-end">
        {canEdit ? null : <Lock className="h-3 w-3 shrink-0" />}
        {canEdit ? t('ctrl.company') : t('ctrl.readonly')}
      </p>
    </div>
  );
}
