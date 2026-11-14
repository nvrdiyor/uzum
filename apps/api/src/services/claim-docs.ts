/**
 * Uzum'ga kompensatsiya da'vosi paketi (2026-11-15).
 *
 * Sotuvchi qo'llanmasi 6.8: yo'qolgan yoki shikastlangan tovar uchun Uzum
 * Word shablonidagi PRETENZIYA (elektron, Biznes-qo'llab-quvvatlash yoki
 * shaxsiy menejerga) va imzolangan QO'SHIMCHA KELISHUV (bosh ofisga)
 * talab qiladi. Bu modul shu ikki hujjatni va pozitsiyalar jadvalini
 * (Excel) yaratadi — sotuvchining rekvizitlari avtomatik yoziladi, bo'sh
 * maydon "______" bo'lib qoladi (qo'lda to'ldirsa bo'ladi).
 *
 * Hujjatlar ruscha — Uzum shablonlari ruscha. .docx qo'lda yig'iladi
 * (WordprocessingML + JSZip): tashqi shablon fayli yo'q, matn Uzum
 * shablonidagidek. Summa: "Размер возмещения" ustunida tovarning haqiqiy
 * narxi (6.8: o'rtacha sotuv narxi) — komissiyani Uzum o'zi ayiradi
 * (shablondagi izoh formulasi), aks holda u ikki marta ayrilishi mumkin edi.
 */
import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import type { ClaimRequisites } from '@savdoiq/shared';

/** Da'vodagi bitta satr (bir xil tovar, sabab va narx — bitta satr) */
export interface ClaimLine {
  /** Tovar nomi (mahsulot nomi, variant bilan) */
  name: string;
  /** Uzum shtrix-kodi */
  barcode: string;
  reason: 'loss' | 'damage';
  /** Bir dona uchun da'vo summasi — haqiqiy narx (6.8) */
  unitPrice: number;
  qty: number;
}

export interface ClaimPackageInput {
  /** Da'vo raqami — fayl nomlarida */
  number: number;
  /** Hujjat sanasi (Toshkent kuni), YYYY-MM-DD */
  date: string;
  requisites: ClaimRequisites;
  lines: ClaimLine[];
}

const BLANK = '______';
const REASON_RU: Record<ClaimLine['reason'], string> = { loss: 'Утеря', damage: 'Повреждение' };
const MONTHS_RU = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];

/** 1322000 → "1 322 000" (oddiy bo'shliq: Word va Excel'da bir xil ko'rinsin) */
export const rub = (n: number): string => Math.round(n).toLocaleString('ru-RU').replace(/\s/g, ' ');
const val = (s: string | undefined): string => (s ?? '').trim() || BLANK;
const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export const lineTotal = (l: ClaimLine): number => Math.round(l.unitPrice) * l.qty;

/** Bir xil tovar, sabab va narxdagi satrlar bittaga qo'shiladi; tartib — nom, keyin sabab */
export function mergeClaimLines(lines: ClaimLine[]): ClaimLine[] {
  const map = new Map<string, ClaimLine>();
  for (const l of lines) {
    if (l.qty <= 0) continue;
    const key = `${l.barcode}|${l.name}|${l.reason}|${Math.round(l.unitPrice)}`;
    const cur = map.get(key);
    if (cur) cur.qty += l.qty;
    else map.set(key, { ...l, unitPrice: Math.round(l.unitPrice) });
  }
  // Nom bo'yicha; bir tovarda avval yo'qotish, keyin shikastlanish (Uzum shablonidagidek)
  const reasonRank = (r: ClaimLine['reason']) => (r === 'loss' ? 0 : 1);
  return [...map.values()].sort(
    (a, b) =>
      a.name.localeCompare(b.name, 'ru') || reasonRank(a.reason) - reasonRank(b.reason) || a.barcode.localeCompare(b.barcode),
  );
}

// ─────────────────────────── WordprocessingML ───────────────────────────

interface RunOpts {
  bold?: boolean;
  /** Yarim punktlarda (22 = 11 pt) */
  size?: number;
}

const run = (text: string, o: RunOpts = {}): string => {
  const props = `${o.bold ? '<w:b/><w:bCs/>' : ''}${o.size ? `<w:sz w:val="${o.size}"/><w:szCs w:val="${o.size}"/>` : ''}`;
  // Satr ko'chishi — <w:br/>
  const parts = text.split('\n').map((p) => `<w:t xml:space="preserve">${esc(p)}</w:t>`);
  return `<w:r>${props ? `<w:rPr>${props}</w:rPr>` : ''}${parts.join('<w:br/>')}</w:r>`;
};

interface ParaOpts {
  align?: 'left' | 'center' | 'right' | 'both';
  after?: number;
  before?: number;
  indent?: number;
}

const para = (runs: string, o: ParaOpts = {}): string => {
  const spacing = `<w:spacing w:before="${o.before ?? 0}" w:after="${o.after ?? 0}"/>`;
  const ind = o.indent ? `<w:ind w:firstLine="${o.indent}"/>` : '';
  const jc = o.align ? `<w:jc w:val="${o.align}"/>` : '';
  return `<w:p><w:pPr>${spacing}${ind}${jc}</w:pPr>${runs}</w:p>`;
};

const empty = (): string => '<w:p/>';

const BORDERS =
  '<w:tblBorders>' +
  ['top', 'left', 'bottom', 'right', 'insideH', 'insideV']
    .map((s) => `<w:${s} w:val="single" w:sz="4" w:space="0" w:color="000000"/>`)
    .join('') +
  '</w:tblBorders>';

interface Cell {
  text: string;
  bold?: boolean;
  align?: 'left' | 'center' | 'right';
  span?: number;
}

function table(widths: number[], rows: Cell[][], o: { borders?: boolean; size?: number } = {}): string {
  const grid = `<w:tblGrid>${widths.map((w) => `<w:gridCol w:w="${w}"/>`).join('')}</w:tblGrid>`;
  const body = rows
    .map((cells) => {
      let col = 0;
      const tcs = cells
        .map((c) => {
          const span = c.span ?? 1;
          const w = widths.slice(col, col + span).reduce((a, b) => a + b, 0);
          col += span;
          const span$ = span > 1 ? `<w:gridSpan w:val="${span}"/>` : '';
          const runs = run(c.text, { bold: c.bold, size: o.size });
          return `<w:tc><w:tcPr><w:tcW w:w="${w}" w:type="dxa"/>${span$}<w:vAlign w:val="center"/></w:tcPr>${para(runs, { align: c.align })}</w:tc>`;
        })
        .join('');
      return `<w:tr><w:trPr><w:cantSplit/></w:trPr>${tcs}</w:tr>`;
    })
    .join('');
  const total = widths.reduce((a, b) => a + b, 0);
  const borders = o.borders === false ? '<w:tblBorders><w:top w:val="nil"/><w:left w:val="nil"/><w:bottom w:val="nil"/><w:right w:val="nil"/><w:insideH w:val="nil"/><w:insideV w:val="nil"/></w:tblBorders>' : BORDERS;
  return (
    `<w:tbl><w:tblPr><w:tblW w:w="${total}" w:type="dxa"/>${borders}<w:tblLayout w:type="fixed"/>` +
    `<w:tblCellMar><w:left w:w="80" w:type="dxa"/><w:right w:w="80" w:type="dxa"/></w:tblCellMar></w:tblPr>${grid}${body}</w:tbl>`
  );
}

/** A4, chetlar: yuqori/past 2 sm, chap 2,5 sm, o'ng 1,5 sm */
const SECTION =
  '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="850" w:bottom="1134" w:left="1418" w:header="709" w:footer="709" w:gutter="0"/></w:sectPr>';
/** Matn kengligi, twip: 11906 − 1418 − 850 */
const TEXT_WIDTH = 9638;

const DOC_NS =
  'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" ' +
  'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';

const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:eastAsia="Times New Roman" w:cs="Times New Roman"/><w:sz w:val="24"/><w:szCs w:val="24"/><w:lang w:val="ru-RU"/></w:rPr></w:rPrDefault>
<w:pPrDefault><w:pPr><w:spacing w:after="0" w:line="252" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>
<w:style w:type="table" w:default="1" w:styleId="TableNormal"><w:name w:val="Normal Table"/><w:tblPr><w:tblInd w:w="0" w:type="dxa"/><w:tblCellMar><w:top w:w="0" w:type="dxa"/><w:left w:w="108" w:type="dxa"/><w:bottom w:w="0" w:type="dxa"/><w:right w:w="108" w:type="dxa"/></w:tblCellMar></w:tblPr></w:style>
</w:styles>`;

const SETTINGS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:defaultTabStop w:val="708"/><w:characterSpacingControl w:val="doNotCompress"/><w:compat><w:compatSetting w:name="compatibilityMode" w:uri="http://schemas.microsoft.com/office/word" w:val="15"/></w:compat></w:settings>`;

async function docx(title: string, body: string, createdIso: string): Promise<Buffer> {
  const zip = new JSZip();
  zip.file(
    '[Content_Types].xml',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
      '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>' +
      '<Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/>' +
      '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>' +
      '<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>' +
      '</Types>',
  );
  zip.file(
    '_rels/.rels',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
      '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>' +
      '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>' +
      '</Relationships>',
  );
  zip.file(
    'word/_rels/document.xml.rels',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
      '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/>' +
      '</Relationships>',
  );
  zip.file(
    'word/document.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ${DOC_NS}><w:body>${body}${SECTION}</w:body></w:document>`,
  );
  zip.file('word/styles.xml', STYLES);
  zip.file('word/settings.xml', SETTINGS);
  zip.file(
    'docProps/core.xml',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" ' +
      'xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" ' +
      'xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">' +
      `<dc:title>${esc(title)}</dc:title><dc:creator>SavdoIQ</dc:creator>` +
      `<dcterms:created xsi:type="dcterms:W3CDTF">${createdIso}</dcterms:created>` +
      `<dcterms:modified xsi:type="dcterms:W3CDTF">${createdIso}</dcterms:modified>` +
      '</cp:coreProperties>',
  );
  zip.file(
    'docProps/app.xml',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>SavdoIQ</Application></Properties>',
  );
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}

/** "2026-11-15" → «15» ноября 2026 г. */
export function russianDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return `«${String(d).padStart(2, '0')}» ${MONTHS_RU[m - 1]} ${y} г.`;
}

const dotDate = (iso: string): string => iso.split('-').reverse().join('.');

// ─────────────────────────── Претензия ───────────────────────────

export async function buildClaimDocx(input: ClaimPackageInput): Promise<Buffer> {
  const r = input.requisites;
  const lines = input.lines;
  const qty = lines.reduce((s, l) => s + l.qty, 0);
  const total = lines.reduce((s, l) => s + lineTotal(l), 0);

  const field = (label: string, value: string) => para(`${run(`${label}: `, { bold: true })}${run(val(value))}`);
  const widths = [3100, 1650, 1350, 1350, 800, 1388];
  const head: Cell[] = [
    { text: 'Название товара', bold: true, align: 'center' },
    { text: 'Штрих-код', bold: true, align: 'center' },
    { text: 'Причина\n(утеря/повреждение)', bold: true, align: 'center' },
    { text: 'Размер возмещения*', bold: true, align: 'center' },
    { text: 'Кол-во\n(шт.)', bold: true, align: 'center' },
    { text: 'Итого\n(стоим. кол-во)', bold: true, align: 'center' },
  ];
  const rows: Cell[][] = [
    head,
    ...lines.map((l) => [
      { text: l.name },
      { text: l.barcode || '—', align: 'center' as const },
      { text: REASON_RU[l.reason], align: 'center' as const },
      { text: rub(l.unitPrice), align: 'right' as const },
      { text: String(l.qty), align: 'center' as const },
      { text: rub(lineTotal(l)), align: 'right' as const },
    ]),
    [
      { text: 'Итого', bold: true, span: 4 },
      { text: String(qty), bold: true, align: 'center' },
      { text: rub(total), bold: true, align: 'right' },
    ],
  ];

  const body = [
    field('ОТ (ФИО)', r.fio),
    field('ИП/ООО', r.entity),
    field('ИНН/ПИНФЛ', r.tin),
    field('РАСЧЕТНЫЙ СЧЕТ', r.account),
    field('МФО', r.mfo),
    field('БАНК', r.bank),
    empty(),
    para(run('Претензия', { bold: true, size: 28 }), { align: 'center', after: 120 }),
    para(run('Прошу вас сделать возврат денежных средств за потерянные/поврежденные товары:'), { align: 'center', after: 160 }),
    table(widths, rows, { size: 19 }),
    para(run('*Размер возмещения = Действительная стоимость товара − Комиссия маркетплейса.', { size: 20 }), { before: 120 }),
    para(run('Подробнее смотрите в Инструкции, пункт 6.8.', { size: 20 })),
    empty(),
    para(run(`Итоговая сумма к выплате ${rub(total)} сум.`, { bold: true })),
    empty(),
    para(run(`Дата: ${dotDate(input.date)}`)),
    empty(),
    para(run(`Подпись: ____________________ / ${val(r.fio)}`)),
  ].join('');

  return docx(`Претензия № ${input.number}`, body, `${input.date}T00:00:00Z`);
}

// ─────────────────────────── Дополнительное соглашение ───────────────────────────

/** Uzum rekvizitlari — shablondagi "Сторона 1" (qo'llanma 6.8 shabloni, 2026-11) */
const UZUM_PARTY = [
  'ИП ООО «UZUM MARKET»',
  'Адрес: Республика Узбекистан, г. Ташкент, Яккасарайский район, улица Кичик Бешагач, 132А',
  'ИНН: 309376127',
  'ОКЭД: 62090',
  'Р/С: 20208000005504983001',
  'Банк: ТОШКЕНТ Ш., "КАПИТАЛБАНК" АТ БАНКИНИНГ АМАЛИЁТ БОШКАРМАСИ',
  'МФО: 00974',
];

const AGREEMENT_POINTS = [
  'В соответствии с пунктами 6.10, 6.12, и 6.13 Оферты, в связи с недостачей имущества Стороны 2 Сторона 1 возмещает разницу между ценой реализации Товара и комиссией по себестоимости Товара.',
  'Итоговая стоимость компенсации рассчитывается на основе установленных тарифов. Сведения о тарифах находятся в Инструкции в пункте 6.8, которая доступна по следующему адресу: https://seller.uzum.uz/manual',
  'Возмещение осуществляется согласно акту расхождения, либо акту дефектации зависимо от повреждения или недостачи Товаров.',
  'После возмещения, право собственности на поврежденный Товар переходит Стороне 1.',
  'В случае нахождения Товаров, по которым выплачено возмещение в связи с недостачей, Сторона 1 становится собственником данных Товаров.',
  'После возмещения Сторона 2 обязуется не выдвигать претензии по сумме компенсации и оспаривать права собственности на Товары.',
  'Наименование, количество, цена реализации, сумма недостачи имущества и т.п. указывается в Претензии.',
  'В случае нахождения товара при утере и в случае отсутствия дефектов при повреждении до выплаты компенсации, состав Претензии, а именно стоимость, наименование и количество товаров подлежит изменению Стороной 1.',
  'Стоимость компенсируемого товара может меняться Стороной 1 согласно пункту инструкции 6.8.',
  'Сторона 1 обязуется уведомить Сторону 2 об изменениях в Претензии направив уведомление с итоговой суммой компенсации на электронную почту Стороны 2 указанной в личном кабинете.',
  'Настоящее Соглашение является неотъемлемой частью Оферты и составлено в 2-х экземплярах по одному для каждой из Сторон.',
  'Все остальные условия Оферты, не затронутые настоящим Соглашением, остаются неизменными.',
  'Настоящее Соглашение вступает в силу с момента его подписания и является неотъемлемой частью Оферты.',
];

export async function buildAgreementDocx(input: ClaimPackageInput): Promise<Buffer> {
  const r = input.requisites;
  const contract = `№ ${val(r.contractNo)} от ${(r.contractDate ?? '').trim() || '__.__.____'}`;
  const basis = r.license.trim() ? `№ ${r.license.trim()}` : `№${BLANK}`;

  const party2 = [
    `«${val(r.entity)}»`,
    `Адрес: ${val(r.address)}`,
    `ИНН/ПИНФЛ: ${val(r.tin)}`,
    `Р/С: ${val(r.account)}`,
    `Банк: ${val(r.bank)}`,
    `МФО: ${val(r.mfo)}`,
  ];
  const sideCell = (title: string, rowsText: string[], sign: string): string =>
    [para(run(title, { bold: true }), { after: 60 }), ...rowsText.map((t) => para(run(t), { after: 40 })), empty(), para(run(sign))].join('');
  const half = TEXT_WIDTH / 2;
  const signTable =
    `<w:tbl><w:tblPr><w:tblW w:w="${TEXT_WIDTH}" w:type="dxa"/><w:tblLayout w:type="fixed"/></w:tblPr>` +
    `<w:tblGrid><w:gridCol w:w="${half}"/><w:gridCol w:w="${half}"/></w:tblGrid><w:tr>` +
    `<w:tc><w:tcPr><w:tcW w:w="${half}" w:type="dxa"/></w:tcPr>${sideCell('Сторона 1', UZUM_PARTY, '_______________________________')}</w:tc>` +
    `<w:tc><w:tcPr><w:tcW w:w="${half}" w:type="dxa"/></w:tcPr>${sideCell('Сторона 2', party2, `_______________ / ${val(r.fio)}`)}</w:tc>` +
    '</w:tr></w:tbl>';

  const body = [
    para(run(`Дополнительное соглашение № ${BLANK}`, { bold: true }), { align: 'center' }),
    para(run(`к Посредническому Договору ${contract} (Оферта)`, { bold: true }), { align: 'center', after: 200 }),
    // Shahar chapda, sana o'ngda — bitta qatorda (tab bilan)
    `<w:p><w:pPr><w:tabs><w:tab w:val="right" w:pos="${TEXT_WIDTH}"/></w:tabs><w:spacing w:after="200"/></w:pPr>${run('г. Ташкент')}<w:r><w:tab/></w:r>${run(russianDate(input.date))}</w:p>`,
    para(
      run(
        `ИП ООО «UZUM MARKET», в лице ______________________________, действующего на основании ______________________ ` +
          `с одной стороны далее Сторона 1 и «${val(r.entity)}» в лице ${val(r.fio)}, действующего на основании ${basis} ` +
          `с другой стороны далее Сторона 2 заключили настоящее Дополнительное соглашение №${BLANK} от __.__.____ ` +
          `(далее Соглашение) к посредническому договору ${contract} (далее Оферта) о нижеследующем:`,
      ),
      { align: 'both', indent: 567, after: 120 },
    ),
    ...AGREEMENT_POINTS.map((p, i) => para(run(`${i + 1}. ${p}`), { align: 'both', after: 80 })),
    empty(),
    signTable,
  ].join('');

  return docx('Дополнительное соглашение', body, `${input.date}T00:00:00Z`);
}

// ─────────────────────────── Отчет потерянных товаров ───────────────────────────

export async function buildLostGoodsXlsx(input: ClaimPackageInput): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'SavdoIQ';
  const ws = wb.addWorksheet('Отчет потерянных товаров');
  ws.columns = [
    { header: 'Название товара', key: 'name', width: 58 },
    { header: 'Штрих-код', key: 'barcode', width: 20 },
    { header: 'Причина', key: 'reason', width: 16 },
    { header: 'Размер возмещения', key: 'price', width: 20 },
    { header: 'Количество', key: 'qty', width: 14 },
    { header: 'Итого', key: 'total', width: 18 },
  ];
  ws.getRow(1).font = { bold: true };
  for (const l of input.lines) {
    ws.addRow({ name: l.name, barcode: l.barcode, reason: REASON_RU[l.reason], price: l.unitPrice, qty: l.qty, total: lineTotal(l) });
  }
  const qty = input.lines.reduce((s, l) => s + l.qty, 0);
  const total = input.lines.reduce((s, l) => s + lineTotal(l), 0);
  const last = ws.addRow({ name: 'Итого', qty, total });
  last.font = { bold: true };
  for (const key of ['price', 'total']) ws.getColumn(key).numFmt = '#,##0';
  // Shtrix-kod matn: Excel uni 1,00013E+12 qilib yubormasin
  ws.getColumn('barcode').numFmt = '@';
  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf as ArrayBuffer);
}

/** Uchala fayl bitta ZIP'da — Uzum Biznes-qo'llab-quvvatlashga yuborishga tayyor */
export async function buildClaimPackage(input: ClaimPackageInput): Promise<Buffer> {
  const [claim, agreement, xlsx] = await Promise.all([
    buildClaimDocx(input),
    buildAgreementDocx(input),
    buildLostGoodsXlsx(input),
  ]);
  const zip = new JSZip();
  zip.file(`Претензия-${input.number}.docx`, claim);
  zip.file(`Доп-соглашение-${input.number}.docx`, agreement);
  zip.file(`Отчет-потерянных-товаров-${input.number}.xlsx`, xlsx);
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}
