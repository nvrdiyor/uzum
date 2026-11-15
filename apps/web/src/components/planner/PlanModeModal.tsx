import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  addDays,
  parseISODate,
  parseSeasonMonths,
  seasonWindow,
  toBusinessDate,
  toISODate,
  type SkuPlanMode,
} from '@savdoiq/shared';
import { Ban, Calendar, CalendarClock, RefreshCw } from '@/components/icons';
import { Button, Input, Modal, toast } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { registerNamespace, useFormat, useT } from '@/i18n';
import { cn } from '@/lib/utils';

registerNamespace('planMode', {
  uz: {
    title: 'Buyurtma rejimi',
    'title.sub': '{name} — Rejalashtiruvchi bu tovarga qanday qarasin',
    'mode.auto': 'Avtomatik',
    'mode.autoHint': 'Sotuvga qarab buyurtma tavsiya qilinadi (odatdagidek)',
    'mode.pause': 'Hozircha buyurtma berilmaydi',
    'mode.pauseHint': 'Qoldiq sotilaveradi, sotib olish tavsiya qilinmaydi va “tugayapti” deb bezovta qilinmaydi',
    'mode.stop': 'Endi sotib olinmaydi',
    'mode.stopHint': 'Qoldiq sotib tugatiladi. Tugaganda ham buyurtma tavsiya qilinmaydi',
    'mode.seasonal': 'Mavsumiy tovar',
    'mode.seasonalHint': 'Faqat tanlangan oylarda sotiladi: mavsum tugashiga ulgurmaydigan partiya tavsiya qilinmaydi, keyingi mavsumdan oldin o‘z vaqtida eslatiladi',
    'pause.until': 'Qachongacha (ixtiyoriy)',
    'pause.untilHint': 'Shu kuni tovar o‘zi avtomatik rejimga qaytadi. Bo‘sh — o‘zingiz qaytarguningizcha',
    'pause.m1': '1 oy',
    'pause.m3': '3 oy',
    'pause.clear': 'Muddatsiz',
    'season.months': 'Sotiladigan oylar',
    'season.winter': 'Qish (noy–fev)',
    'season.summer': 'Yoz (may–avg)',
    'season.spring': 'Bahor (mar–may)',
    'season.autumn': 'Kuz (sen–noy)',
    'season.now': 'Hozir mavsum: {end} gacha',
    'season.next': 'Keyingi mavsum: {start} – {end}',
    'season.pick': 'Kamida bitta oy tanlang (hammasi emas)',
    save: 'Saqlash',
    cancel: 'Bekor qilish',
    saved: 'Saqlandi',
    'saved.body': '{n} ta SKU uchun',
    error: 'Saqlab bo‘lmadi',
    readonly: 'Rejimni egasi yoki menejer o‘zgartiradi',
  },
  ru: {
    title: 'Режим заказа',
    'title.sub': '{name} — как планировщику относиться к этому товару',
    'mode.auto': 'Автоматически',
    'mode.autoHint': 'Заказ рекомендуется по продажам (как обычно)',
    'mode.pause': 'Пока не заказываем',
    'mode.pauseHint': 'Остаток продаётся, закупка не рекомендуется, предупреждений «заканчивается» нет',
    'mode.stop': 'Больше не закупаем',
    'mode.stopHint': 'Остаток распродаётся. Даже когда закончится — заказ не рекомендуется',
    'mode.seasonal': 'Сезонный товар',
    'mode.seasonalHint': 'Продаётся только в выбранные месяцы: партия, которая не успеет к концу сезона, не рекомендуется; перед следующим сезоном — напоминание вовремя',
    'pause.until': 'До какого числа (необязательно)',
    'pause.untilHint': 'В этот день товар сам вернётся в автоматический режим. Пусто — пока не вернёте сами',
    'pause.m1': '1 месяц',
    'pause.m3': '3 месяца',
    'pause.clear': 'Бессрочно',
    'season.months': 'Месяцы продаж',
    'season.winter': 'Зима (ноя–фев)',
    'season.summer': 'Лето (май–авг)',
    'season.spring': 'Весна (мар–май)',
    'season.autumn': 'Осень (сен–ноя)',
    'season.now': 'Сейчас сезон: до {end}',
    'season.next': 'Следующий сезон: {start} – {end}',
    'season.pick': 'Выберите хотя бы один месяц (не все)',
    save: 'Сохранить',
    cancel: 'Отмена',
    saved: 'Сохранено',
    'saved.body': 'Для {n} SKU',
    error: 'Не удалось сохранить',
    readonly: 'Режим меняет владелец или менеджер',
  },
  en: {
    title: 'Reorder mode',
    'title.sub': '{name} — how the planner should treat this product',
    'mode.auto': 'Automatic',
    'mode.autoHint': 'Reorders are suggested from sales (default)',
    'mode.pause': 'Not reordering for now',
    'mode.pauseHint': 'Stock keeps selling, no purchase is suggested and no “running out” warnings',
    'mode.stop': 'Discontinued',
    'mode.stopHint': 'Sell off the remaining stock. No reorder is suggested even when it runs out',
    'mode.seasonal': 'Seasonal product',
    'mode.seasonalHint': 'Sells only in the chosen months: no batch that would arrive after the season ends; a timely reminder before the next season',
    'pause.until': 'Until (optional)',
    'pause.untilHint': 'On this day it returns to automatic by itself. Empty — until you change it',
    'pause.m1': '1 month',
    'pause.m3': '3 months',
    'pause.clear': 'No end date',
    'season.months': 'Selling months',
    'season.winter': 'Winter (Nov–Feb)',
    'season.summer': 'Summer (May–Aug)',
    'season.spring': 'Spring (Mar–May)',
    'season.autumn': 'Autumn (Sep–Nov)',
    'season.now': 'In season until {end}',
    'season.next': 'Next season: {start} – {end}',
    'season.pick': 'Pick at least one month (not all)',
    save: 'Save',
    cancel: 'Cancel',
    saved: 'Saved',
    'saved.body': 'For {n} SKUs',
    error: 'Could not save',
    readonly: 'Only the owner or a manager can change the mode',
  },
});

export interface PlanModeValue {
  mode: SkuPlanMode;
  pauseUntil: string | null;
  seasonMonths: number[];
}

export interface PlanModeTarget {
  /** Mahsulotning barcha SKU'lari */
  productId?: string;
  /** Yoki aniq SKU'lar */
  skuIds?: string[];
  name: string;
  current: PlanModeValue;
}

const SEASON_PRESETS: { key: string; months: number[] }[] = [
  { key: 'season.winter', months: [11, 12, 1, 2] },
  { key: 'season.summer', months: [5, 6, 7, 8] },
  { key: 'season.spring', months: [3, 4, 5] },
  { key: 'season.autumn', months: [9, 10, 11] },
];

const MODE_ICON: Record<SkuPlanMode, JSX.Element> = {
  auto: <RefreshCw className="h-4 w-4" />,
  pause: <CalendarClock className="h-4 w-4" />,
  stop: <Ban className="h-4 w-4" />,
  seasonal: <Calendar className="h-4 w-4" />,
};

/**
 * Tovarning buyurtma rejimi: avtomatik, pauza (sana bilan), endi olinmaydi,
 * mavsumiy (oylar bilan). Rejalashtiruvchi qatori va mahsulot sahifasidan
 * ochiladi; saqlangach reja, mahsulotlar va qoldiqlar qayta yuklanadi.
 */
export function PlanModeModal({
  target,
  canEdit,
  onClose,
}: {
  target: PlanModeTarget | null;
  canEdit: boolean;
  onClose: () => void;
}) {
  const t = useT('planMode');
  const f = useFormat();
  const qc = useQueryClient();
  const [mode, setMode] = useState<SkuPlanMode>('auto');
  const [until, setUntil] = useState('');
  const [months, setMonths] = useState<number[]>([]);

  useEffect(() => {
    if (!target) return;
    setMode(target.current.mode);
    setUntil(target.current.pauseUntil ?? '');
    setMonths(target.current.seasonMonths);
  }, [target]);

  const today = toBusinessDate(new Date());
  const tomorrow = toISODate(addDays(parseISODate(today), 1));
  const inMonths = (n: number) => {
    const d = parseISODate(today);
    return toISODate(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, d.getUTCDate())));
  };
  const validMonths = parseSeasonMonths(months);
  const window = useMemo(() => (validMonths.length ? seasonWindow(validMonths, parseISODate(today)) : null), [validMonths, today]);
  const seasonInvalid = mode === 'seasonal' && validMonths.length === 0;

  const save = useMutation({
    mutationFn: () =>
      api.put<{ updated: number }>('/products/plan-mode', {
        ...(target?.productId ? { productId: target.productId } : { skuIds: target?.skuIds ?? [] }),
        mode,
        ...(mode === 'pause' ? { pauseUntil: until || null } : {}),
        ...(mode === 'seasonal' ? { seasonMonths: validMonths } : {}),
      }),
    onSuccess: (res) => {
      toast.success(t('saved'), t('saved.body', { n: f.num(res.updated) }));
      // Reja hamma joyda (Rejalashtiruvchi, Mahsulotlar, Qoldiqlar, Bugun) — barchasi yangilansin
      void qc.invalidateQueries();
      onClose();
    },
    onError: (err) => {
      toast.error(t('error'), err instanceof ApiError ? err.message : undefined);
    },
  });

  const options: SkuPlanMode[] = ['auto', 'pause', 'stop', 'seasonal'];

  return (
    <Modal
      open={target !== null}
      onClose={onClose}
      title={t('title')}
      description={target ? t('title.sub', { name: target.name }) : undefined}
      size="md"
      footer={
        <div className="flex flex-wrap items-center justify-end gap-2">
          {!canEdit ? <span className="mr-auto text-xs text-muted">{t('readonly')}</span> : null}
          <Button variant="ghost" onClick={onClose}>
            {t('cancel')}
          </Button>
          <Button
            disabled={!canEdit || seasonInvalid || save.isPending}
            loading={save.isPending}
            onClick={() => save.mutate()}
          >
            {t('save')}
          </Button>
        </div>
      }
    >
      <div className="space-y-2" role="radiogroup" aria-label={t('title')}>
        {options.map((m) => {
          const on = mode === m;
          return (
            <div
              key={m}
              className={cn(
                'rounded-2xl border transition-colors',
                on ? 'border-brand/60 bg-brand/[0.06]' : 'border-line bg-surface hover:border-line-strong',
              )}
            >
              <button
                type="button"
                role="radio"
                aria-checked={on}
                disabled={!canEdit}
                onClick={() => setMode(m)}
                className="focusable flex w-full items-start gap-3 rounded-2xl px-4 py-3 text-left disabled:cursor-default"
              >
                <span
                  className={cn(
                    'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl',
                    on ? 'bg-brand/15 text-brand-ink' : 'bg-surface-3 text-muted',
                  )}
                >
                  {MODE_ICON[m]}
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-ink">{t(`mode.${m}`)}</span>
                  <span className="mt-0.5 block text-xs leading-relaxed text-muted">{t(`mode.${m}Hint`)}</span>
                </span>
              </button>

              {on && m === 'pause' ? (
                <div className="space-y-2 border-t border-line/70 px-4 py-3">
                  <label className="label" htmlFor="plan-pause-until">
                    {t('pause.until')}
                  </label>
                  <div className="flex flex-wrap items-center gap-2">
                    <Input
                      id="plan-pause-until"
                      type="date"
                      value={until}
                      min={tomorrow}
                      disabled={!canEdit}
                      onChange={(e) => setUntil(e.target.value)}
                      className="w-44"
                    />
                    <Button size="sm" variant="soft" disabled={!canEdit} onClick={() => setUntil(inMonths(1))}>
                      {t('pause.m1')}
                    </Button>
                    <Button size="sm" variant="soft" disabled={!canEdit} onClick={() => setUntil(inMonths(3))}>
                      {t('pause.m3')}
                    </Button>
                    <Button size="sm" variant="ghost" disabled={!canEdit || !until} onClick={() => setUntil('')}>
                      {t('pause.clear')}
                    </Button>
                  </div>
                  <p className="text-2xs text-muted">{t('pause.untilHint')}</p>
                </div>
              ) : null}

              {on && m === 'seasonal' ? (
                <div className="space-y-3 border-t border-line/70 px-4 py-3">
                  <div className="flex flex-wrap gap-1.5">
                    {SEASON_PRESETS.map((p) => (
                      <Button key={p.key} size="sm" variant="soft" disabled={!canEdit} onClick={() => setMonths(p.months)}>
                        {t(p.key)}
                      </Button>
                    ))}
                  </div>
                  <div>
                    <p className="label">{t('season.months')}</p>
                    <div className="mt-1.5 grid grid-cols-6 gap-1.5">
                      {Array.from({ length: 12 }, (_, i) => i + 1).map((mo) => {
                        const picked = months.includes(mo);
                        return (
                          <button
                            key={mo}
                            type="button"
                            aria-pressed={picked}
                            disabled={!canEdit}
                            onClick={() =>
                              setMonths((prev) => (prev.includes(mo) ? prev.filter((x) => x !== mo) : [...prev, mo]))
                            }
                            className={cn(
                              'focusable rounded-lg border px-1 py-1.5 text-xs font-semibold capitalize transition-colors',
                              picked
                                ? 'border-brand/60 bg-brand/15 text-brand-ink'
                                : 'border-line bg-surface-2 text-ink-soft hover:border-line-strong',
                            )}
                          >
                            {f.monthShort(new Date(Date.UTC(2026, mo - 1, 1)))}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <p className={cn('text-xs', seasonInvalid ? 'font-medium text-danger-ink' : 'text-muted')}>
                    {seasonInvalid
                      ? t('season.pick')
                      : window
                        ? window.inSeason
                          ? t('season.now', { end: f.dateShort(window.end) })
                          : t('season.next', { start: f.dateShort(window.start), end: f.dateShort(window.end) })
                        : null}
                  </p>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </Modal>
  );
}
