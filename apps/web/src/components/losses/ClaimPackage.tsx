import { useEffect, useId, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ClaimRequisites, ClaimRequisitesResponse } from '@savdoiq/shared';
import { AlertTriangle, Archive, CheckCircle2, Download, Pencil, Send } from '@/components/icons';
import { registerNamespace, useFormat, useT } from '@/i18n';
import { ApiError, api } from '@/lib/api';
import { cn, downloadBlob } from '@/lib/utils';
import { useSession } from '@/store/session';
import { Button, Input, Modal, Skeleton, toast } from '@/components/ui';

/*
 * Uzum shablonidagi da'vo paketi (qo'llanma 6.8): Претензия, qo'shimcha
 * kelishuv va pozitsiyalar jadvali — bitta ZIP. Rekvizitlar bir marta
 * kiritiladi (server kompaniya sozlamasida saqlaydi) va har paketga
 * avtomatik yoziladi. Bank rekvizitlari — faqat ega va menejer uchun.
 */
registerNamespace('claimPackage', {
  uz: {
    title: 'Uzum shablonidagi da’vo paketi',
    desc: 'Претензия, qo‘shimcha kelishuv va pozitsiyalar jadvali — bitta ZIP faylda. Rekvizitlaringiz avtomatik yoziladi.',
    'req.ok': 'Rekvizitlar to‘ldirilgan',
    'req.missing': 'Rekvizitlar to‘ldirilmagan: {fields}. Blankada bo‘sh joy qoladi, Uzum uni qaytarishi mumkin.',
    'btn.requisites': 'Rekvizitlar',
    'btn.download': 'ZIP yuklab olish',
    'btn.downloadN': 'ZIP yuklab olish ({n} ta yozuv)',
    'btn.markSent': 'Da’vo yuborildi deb belgilash',
    'done.title': '{file} yuklandi',
    'done.body': '{n} dona · narx bo‘yicha {total}. Uzum komissiyasini ayirib to‘laydi.',
    'done.next':
      'Претензия va jadvalni Biznes-qo‘llab-quvvatlash xizmatiga (yoki shaxsiy menejerga) yuboring, qo‘shimcha kelishuvni imzolab Uzum ofisiga olib boring.',
    'marked': '{n} ta yozuv «Da’vo yuborilgan» deb belgilandi',
    'markedNone': 'Paketdagi yozuvlar allaqachon belgilangan',
    'noRole': 'Da’vo paketini faqat kompaniya egasi yoki menejeri tayyorlaydi — bank rekvizitlari kerak.',
    'failed': 'Paketni yuklab bo‘lmadi',
    'modal.title': 'Da’vo uchun rekvizitlar',
    'modal.desc': 'Претензия va qo‘shimcha kelishuvga yoziladi. SavdoIQ’da saqlanadi, bir marta kiritiladi.',
    'modal.agreement': 'Qo‘shimcha kelishuv uchun',
    'modal.save': 'Saqlash',
    'modal.cancel': 'Bekor qilish',
    'modal.saved': 'Rekvizitlar saqlandi',
    'f.fio': 'F.I.Sh.',
    'f.entity': 'YaTT / MChJ nomi',
    'f.tin': 'STIR / JShShIR',
    'f.account': 'Hisob raqami',
    'f.mfo': 'MFO',
    'f.bank': 'Bank nomi',
    'f.license': 'YaTT guvohnomasi / MChJ litsenziya raqami',
    'f.address': 'Tashkilot manzili',
    'f.contractNo': 'Uzum bilan shartnoma (oferta) raqami',
    'f.contractDate': 'Shartnoma sanasi',
    'p.fio': 'Aliyev Vali Valiyevich',
    'p.entity': 'YaTT Aliyev / MChJ «Savdo»',
    'p.tin': '9 yoki 14 raqam',
    'p.account': '20 raqam',
    'p.mfo': '5 raqam',
    'p.bank': 'AKB Kapitalbank',
    'p.license': 'guvohnomadan',
    'p.address': 'shahar, ko‘cha, uy',
    'p.contractNo': 'shartnomangizdan',
    'p.contractDate': 'KK.OO.YYYY',
  },
  ru: {
    title: 'Пакет претензии по шаблону Uzum',
    desc: 'Претензия, дополнительное соглашение и таблица позиций — одним ZIP-файлом. Ваши реквизиты подставляются автоматически.',
    'req.ok': 'Реквизиты заполнены',
    'req.missing': 'Не заполнены реквизиты: {fields}. В бланке останутся пропуски, Uzum может его вернуть.',
    'btn.requisites': 'Реквизиты',
    'btn.download': 'Скачать ZIP',
    'btn.downloadN': 'Скачать ZIP ({n} записей)',
    'btn.markSent': 'Отметить претензию отправленной',
    'done.title': '{file} скачан',
    'done.body': '{n} шт. · по цене {total}. Uzum выплатит за вычетом комиссии.',
    'done.next':
      'Отправьте претензию и таблицу в Бизнес-поддержку (или персональному менеджеру), подписанное доп. соглашение отнесите в офис Uzum.',
    'marked': '{n} записей отмечены как «Претензия отправлена»',
    'markedNone': 'Записи из пакета уже отмечены',
    'noRole': 'Пакет претензии готовит только владелец или менеджер компании — нужны банковские реквизиты.',
    'failed': 'Не удалось скачать пакет',
    'modal.title': 'Реквизиты для претензии',
    'modal.desc': 'Подставляются в претензию и доп. соглашение. Хранятся в SavdoIQ, вводятся один раз.',
    'modal.agreement': 'Для дополнительного соглашения',
    'modal.save': 'Сохранить',
    'modal.cancel': 'Отмена',
    'modal.saved': 'Реквизиты сохранены',
    'f.fio': 'ФИО',
    'f.entity': 'ИП / ООО',
    'f.tin': 'ИНН / ПИНФЛ',
    'f.account': 'Расчётный счёт',
    'f.mfo': 'МФО',
    'f.bank': 'Банк',
    'f.license': 'Номер свидетельства ИП / лицензии ООО',
    'f.address': 'Адрес организации',
    'f.contractNo': 'Номер договора (оферты) с Uzum',
    'f.contractDate': 'Дата договора',
    'p.fio': 'Алиев Вали Валиевич',
    'p.entity': 'ИП Алиев / ООО «Савдо»',
    'p.tin': '9 или 14 цифр',
    'p.account': '20 цифр',
    'p.mfo': '5 цифр',
    'p.bank': 'АКБ Капиталбанк',
    'p.license': 'из свидетельства',
    'p.address': 'город, улица, дом',
    'p.contractNo': 'из вашего договора',
    'p.contractDate': 'ДД.ММ.ГГГГ',
  },
  en: {
    title: 'Claim package in Uzum’s template',
    desc: 'The claim, the additional agreement and the item table in one ZIP. Your details are filled in automatically.',
    'req.ok': 'Company details are filled in',
    'req.missing': 'Missing details: {fields}. The form will have blanks and Uzum may send it back.',
    'btn.requisites': 'Company details',
    'btn.download': 'Download ZIP',
    'btn.downloadN': 'Download ZIP ({n} records)',
    'btn.markSent': 'Mark the claim as sent',
    'done.title': '{file} downloaded',
    'done.body': '{n} units · {total} at price. Uzum pays it minus its commission.',
    'done.next':
      'Send the claim and the table to Business Support (or your personal manager); sign the additional agreement and take it to Uzum’s office.',
    'marked': '{n} records marked as “Claim sent”',
    'markedNone': 'The records in this package are already marked',
    'noRole': 'Only the company owner or a manager can prepare the claim package — it needs bank details.',
    'failed': 'Could not download the package',
    'modal.title': 'Details for the claim',
    'modal.desc': 'Filled into the claim and the additional agreement. Stored in SavdoIQ, entered once.',
    'modal.agreement': 'For the additional agreement',
    'modal.save': 'Save',
    'modal.cancel': 'Cancel',
    'modal.saved': 'Details saved',
    'f.fio': 'Full name',
    'f.entity': 'Sole trader / LLC name',
    'f.tin': 'TIN / PINFL',
    'f.account': 'Bank account',
    'f.mfo': 'MFO (bank code)',
    'f.bank': 'Bank',
    'f.license': 'Registration certificate / licence number',
    'f.address': 'Company address',
    'f.contractNo': 'Uzum contract (offer) number',
    'f.contractDate': 'Contract date',
    'p.fio': 'Aliyev Vali Valiyevich',
    'p.entity': 'Sole trader Aliyev / LLC Savdo',
    'p.tin': '9 or 14 digits',
    'p.account': '20 digits',
    'p.mfo': '5 digits',
    'p.bank': 'AKB Kapitalbank',
    'p.license': 'from the certificate',
    'p.address': 'city, street, building',
    'p.contractNo': 'from your contract',
    'p.contractDate': 'DD.MM.YYYY',
  },
});

const MAIN_FIELDS: (keyof ClaimRequisites)[] = ['fio', 'entity', 'tin', 'account', 'mfo', 'bank'];
const AGREEMENT_FIELDS: (keyof ClaimRequisites)[] = ['license', 'address', 'contractNo', 'contractDate'];
const EMPTY: ClaimRequisites = {
  fio: '',
  entity: '',
  tin: '',
  account: '',
  mfo: '',
  bank: '',
  license: '',
  address: '',
  contractNo: '',
  contractDate: '',
};

const REQUISITES_KEY = ['losses-claim-requisites'] as const;

/** Da'vo oynasining yuqorisi: rekvizitlar holati va ZIP paket */
export function ClaimPackagePanel({ open, ids }: { open: boolean; ids: string[] }) {
  const t = useT('claimPackage');
  const f = useFormat();
  const qc = useQueryClient();
  const role = useSession((s) => s.me?.company?.role);
  const allowed = role === 'owner' || role === 'manager';
  const [editing, setEditing] = useState(false);
  const [done, setDone] = useState<{ number: number; file: string; qty: number; total: number } | null>(null);

  useEffect(() => {
    if (!open) setDone(null);
  }, [open]);

  const req = useQuery({
    queryKey: REQUISITES_KEY,
    queryFn: () => api.get<ClaimRequisitesResponse>('/warehouse/losses/requisites'),
    enabled: open && allowed,
  });

  const download = useMutation({
    mutationFn: () => api.download('/warehouse/losses/claim-package', { ids }),
    onSuccess: ({ blob, headers }) => {
      const number = Number(headers.get('X-Claim-Number')) || 0;
      const file = `pretenziya-${number || 'uzum'}.zip`;
      downloadBlob(blob, file);
      setDone({ number, file, qty: Number(headers.get('X-Claim-Qty')) || 0, total: Number(headers.get('X-Claim-Total')) || 0 });
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : t('failed')),
  });

  const mark = useMutation({
    mutationFn: (number: number) => api.post<{ claimed: number }>('/warehouse/losses/claim-bulk', { number }),
    onSuccess: (r) => {
      toast.success(r.claimed > 0 ? t('marked', { n: r.claimed }) : t('markedNone'));
      setDone(null);
      void qc.invalidateQueries({ queryKey: ['warehouse-losses'] });
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : t('failed')),
  });

  if (!allowed) {
    return <p className="mb-4 rounded-xl border border-line bg-surface-2 p-3 text-xs text-muted">{t('noRole')}</p>;
  }

  const missing = req.data?.missing ?? [];

  return (
    <div className="mb-4 rounded-2xl border border-brand/25 bg-brand/5 p-4">
      <div className="flex items-start gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-brand/15 text-brand-ink">
          <Archive className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-ink">{t('title')}</p>
          <p className="mt-0.5 text-xs text-muted">{t('desc')}</p>
          {req.isLoading ? (
            <Skeleton className="mt-2 h-4 w-48" />
          ) : req.data ? (
            <p className={cn('mt-2 flex items-start gap-1.5 text-xs', req.data.filled ? 'text-brand-ink' : 'text-warn-ink')}>
              {req.data.filled ? (
                <CheckCircle2 className="mt-px h-3.5 w-3.5 shrink-0" />
              ) : (
                <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" />
              )}
              {req.data.filled
                ? t('req.ok')
                : t('req.missing', { fields: missing.map((k) => t(`f.${k}`)).join(', ') })}
            </p>
          ) : null}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
        <Button variant="outline" size="sm" icon={<Pencil className="h-3.5 w-3.5" />} onClick={() => setEditing(true)}>
          {t('btn.requisites')}
        </Button>
        <Button size="sm" icon={<Download className="h-3.5 w-3.5" />} loading={download.isPending} onClick={() => download.mutate()}>
          {ids.length ? t('btn.downloadN', { n: ids.length }) : t('btn.download')}
        </Button>
      </div>

      {done ? (
        <div className="mt-3 rounded-xl border border-line bg-surface p-3">
          <p className="flex items-center gap-1.5 text-sm font-medium text-ink">
            <CheckCircle2 className="h-4 w-4 text-brand-ink" />
            {t('done.title', { file: done.file })}
          </p>
          <p className="mt-1 text-xs text-ink-soft">{t('done.body', { n: f.num(done.qty), total: f.money(done.total) })}</p>
          <p className="mt-1 text-xs text-muted">{t('done.next')}</p>
          {done.number ? (
            <div className="mt-2 flex justify-end">
              <Button
                variant="outline"
                size="sm"
                icon={<Send className="h-3.5 w-3.5" />}
                loading={mark.isPending}
                onClick={() => mark.mutate(done.number)}
              >
                {t('btn.markSent')}
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}

      <RequisitesModal open={editing} onClose={() => setEditing(false)} initial={req.data?.requisites ?? EMPTY} />
    </div>
  );
}

/** Rekvizitlar oynasi — saqlangach paket holati yangilanadi */
function RequisitesModal({ open, onClose, initial }: { open: boolean; onClose: () => void; initial: ClaimRequisites }) {
  const t = useT('claimPackage');
  const qc = useQueryClient();
  const baseId = useId();
  const [form, setForm] = useState<ClaimRequisites>(initial);

  /** Server qaytargan maydon xatolari (masalan "STIR — 9 ta, JShShIR — 14 ta raqam") */
  const [errors, setErrors] = useState<Partial<Record<keyof ClaimRequisites, string>>>({});

  useEffect(() => {
    if (open) {
      setForm(initial);
      setErrors({});
    }
  }, [open, initial]);

  const save = useMutation({
    mutationFn: (body: ClaimRequisites) => api.put<ClaimRequisitesResponse>('/warehouse/losses/requisites', body),
    onSuccess: (r) => {
      qc.setQueryData(REQUISITES_KEY, r);
      toast.success(t('modal.saved'));
      onClose();
    },
    onError: (e) => {
      const details = e instanceof ApiError && Array.isArray(e.details) ? (e.details as { path?: string; message?: string }[]) : [];
      const next: Partial<Record<keyof ClaimRequisites, string>> = {};
      for (const d of details) if (d.path && d.message && d.path in EMPTY) next[d.path as keyof ClaimRequisites] = d.message;
      setErrors(next);
      toast.error(details[0]?.message ?? (e instanceof ApiError ? e.message : t('failed')));
    },
  });

  const field = (key: keyof ClaimRequisites) => (
    <div key={key}>
      <label htmlFor={`${baseId}-${key}`} className="label">
        {t(`f.${key}`)}
      </label>
      <Input
        id={`${baseId}-${key}`}
        value={form[key]}
        placeholder={t(`p.${key}`)}
        inputMode={key === 'tin' || key === 'account' || key === 'mfo' ? 'numeric' : undefined}
        autoComplete="off"
        aria-invalid={errors[key] ? true : undefined}
        className={errors[key] ? 'border-danger' : undefined}
        onChange={(e) => {
          const value = e.target.value;
          setForm((cur) => ({ ...cur, [key]: value }));
          if (errors[key]) setErrors((cur) => ({ ...cur, [key]: undefined }));
        }}
      />
      {errors[key] ? <p className="mt-1 text-xs text-danger-ink">{errors[key]}</p> : null}
    </div>
  );

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="md"
      title={t('modal.title')}
      description={t('modal.desc')}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            {t('modal.cancel')}
          </Button>
          <Button loading={save.isPending} onClick={() => save.mutate(form)}>
            {t('modal.save')}
          </Button>
        </div>
      }
    >
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate(form);
        }}
      >
        {MAIN_FIELDS.map(field)}
        <p className="eyebrow pt-2">{t('modal.agreement')}</p>
        {AGREEMENT_FIELDS.map(field)}
        <button type="submit" className="hidden" aria-hidden tabIndex={-1} />
      </form>
    </Modal>
  );
}
