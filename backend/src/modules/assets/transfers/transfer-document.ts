import Docxtemplater from 'docxtemplater';
import InspectModule from 'docxtemplater/js/inspect-module';
import PizZip from 'pizzip';

/**
 * Paket 3.2 (§7a.4): DOCX transfer records with docxtemplater. The
 * organization designs the document in Word (header, logo, fonts); the
 * application only fills the placeholders. Nothing branded lives in code.
 */

export type TransferLocale = 'bs' | 'en';

/** Placeholders the application fills (docxtemplater `{name}` syntax). */
export const transferTopLevelTags = [
  'broj',
  'datum',
  'vrijeme',
  'mjesto',
  'scenarij',
  'jeZaduzenje',
  'jePrezaduzenje',
  'jeRazduzenje',
  'predaje_ime',
  'predaje_funkcija',
  'predaje_oj',
  'predaje_email',
  'preuzima_ime',
  'preuzima_funkcija',
  'preuzima_oj',
  'preuzima_email',
  'potpisnik_ime',
  'potpisnik_funkcija',
  'stavke',
  'broj_stavki',
  'napomena',
  'izdao_ime',
] as const;

export const transferItemTags = ['rb', 'naziv', 'inventarni_broj', 'serijski_broj', 'tip', 'proizvodjac', 'model', 'lokacija', 'napomena_stavke'] as const;

export type TransferItemData = Record<(typeof transferItemTags)[number], string>;
export type TransferDocumentData = Omit<Record<(typeof transferTopLevelTags)[number], string>, 'stavke' | 'jeZaduzenje' | 'jePrezaduzenje' | 'jeRazduzenje'> & {
  readonly stavke: readonly TransferItemData[];
  readonly jeZaduzenje: boolean;
  readonly jePrezaduzenje: boolean;
  readonly jeRazduzenje: boolean;
};

export type TemplateInspection =
  | { readonly ok: true; readonly tags: readonly string[]; readonly unknownTags: readonly string[] }
  | { readonly ok: false; readonly errors: readonly string[] };

export const transferTemplateLimits = { maxBytes: 2 * 1024 * 1024 } as const;

function openZip(content: Buffer): PizZip {
  return new PizZip(content);
}

function createDocument(zip: PizZip, modules: InspectModule[] = []): Docxtemplater {
  return new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true,
    // A missing value prints nothing instead of "undefined".
    nullGetter: () => '',
    // Errors are returned to the caller (upload validation), not printed.
    errorLogging: false,
    modules,
  });
}

/** Human-readable messages of a docxtemplater (multi) error. */
function templateErrors(error: unknown): string[] {
  const nested = (error as { properties?: { errors?: { properties?: { explanation?: string; xtag?: string }; message?: string }[] } })?.properties?.errors;
  if (Array.isArray(nested) && nested.length > 0) {
    return nested.slice(0, 20).map((item) => item.properties?.explanation ?? item.message ?? 'template error');
  }
  const explanation = (error as { properties?: { explanation?: string } })?.properties?.explanation;
  return [explanation ?? (error instanceof Error ? error.message : 'template error')];
}

/** Parses a template: syntax errors block the upload, unknown tags are warnings. */
export function inspectTransferTemplate(content: Buffer): TemplateInspection {
  let zip: PizZip;
  try {
    zip = openZip(content);
  } catch {
    return { ok: false, errors: ['not a valid .docx (zip) file'] };
  }
  if (zip.file('word/document.xml') === null) return { ok: false, errors: ['not a Word document (word/document.xml missing)'] };
  if (zip.file('word/vbaProject.bin') !== null) return { ok: false, errors: ['documents with macros are not allowed'] };
  const inspect = new InspectModule();
  try {
    createDocument(zip, [inspect]);
  } catch (error) {
    return { ok: false, errors: templateErrors(error) };
  }
  const tags = collectTags(inspect.getAllTags());
  return { ok: true, tags, unknownTags: tags.filter((tag) => !isKnownTag(tag)) };
}

const topLevel = new Set<string>(transferTopLevelTags);
const itemLevel = new Set<string>(transferItemTags);

/** Inner tags resolve from the enclosing scopes too ({#predaje_oj}{predaje_oj}{/predaje_oj}). */
function isKnownTag(tag: string): boolean {
  const segments = tag.split('.');
  const last = segments[segments.length - 1];
  if (!segments.slice(0, -1).every((segment) => topLevel.has(segment))) return false;
  return topLevel.has(last) || (segments.includes('stavke') && itemLevel.has(last));
}

function collectTags(tree: Record<string, unknown>, prefix = ''): string[] {
  const result: string[] = [];
  for (const [key, value] of Object.entries(tree)) {
    const name = `${prefix}${key}`;
    result.push(name);
    if (value && typeof value === 'object' && Object.keys(value).length > 0) {
      result.push(...collectTags(value as Record<string, unknown>, `${name}.`));
    }
  }
  return [...new Set(result)].sort();
}

export class TransferRenderError extends Error {
  constructor(readonly errors: readonly string[]) {
    super('TRANSFER_TEMPLATE_RENDER_FAILED');
    this.name = 'TransferRenderError';
  }
}

export function renderTransferDocument(template: Buffer, data: TransferDocumentData): Buffer {
  try {
    const document = createDocument(openZip(template));
    document.render({ ...data, stavke: data.stavke.map((item) => ({ ...item })) });
    return document.getZip().generate({ type: 'nodebuffer', compression: 'DEFLATE' });
  } catch (error) {
    throw new TransferRenderError(templateErrors(error));
  }
}

// ------------------------------------------------------------ built-in default template

const labels = {
  bs: {
    title: 'PRENOSNICA br.',
    placeDate: 'Mjesto i datum:',
    kind: 'Vrsta:',
    from: 'Predaje:',
    to: 'Preuzima:',
    items: 'Oprema',
    rb: 'R. br.',
    name: 'Naziv',
    tag: 'Inventarni broj',
    serial: 'Serijski broj',
    note: 'Napomena:',
    returned: 'Oprema je vraćena na skladište.',
    handedOver: 'Oprema je predana na korištenje i čuvanje.',
    signFrom: 'Predao',
    signTo: 'Preuzeo',
    signatory: 'Odobrio',
    issuedBy: 'Izdao:',
  },
  en: {
    title: 'TRANSFER RECORD No.',
    placeDate: 'Place and date:',
    kind: 'Type:',
    from: 'Handed over by:',
    to: 'Received by:',
    items: 'Equipment',
    rb: 'No.',
    name: 'Name',
    tag: 'Asset tag',
    serial: 'Serial number',
    note: 'Note:',
    returned: 'The equipment was returned to the warehouse.',
    handedOver: 'The equipment was handed over for use and safekeeping.',
    signFrom: 'Handed over',
    signTo: 'Received',
    signatory: 'Approved',
    issuedBy: 'Issued by:',
  },
} as const;

function escapeXml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function run(text: string, bold = false, size?: number): string {
  const properties = bold || size ? `<w:rPr>${bold ? '<w:b/>' : ''}${size ? `<w:sz w:val="${size}"/>` : ''}</w:rPr>` : '';
  return `<w:r>${properties}<w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r>`;
}

function paragraph(content: string, options: { center?: boolean; spacingAfter?: number } = {}): string {
  const properties = `<w:pPr>${options.center ? '<w:jc w:val="center"/>' : ''}<w:spacing w:after="${options.spacingAfter ?? 120}"/></w:pPr>`;
  return `<w:p>${properties}${content}</w:p>`;
}

function cell(content: string, width: number, bold = false): string {
  return `<w:tc><w:tcPr><w:tcW w:w="${width}" w:type="dxa"/></w:tcPr>${paragraph(run(content, bold), { spacingAfter: 0 })}</w:tc>`;
}

function table(rows: string[], widths: number[], borders = true): string {
  const border = borders
    ? '<w:tblBorders><w:top w:val="single" w:sz="4"/><w:left w:val="single" w:sz="4"/><w:bottom w:val="single" w:sz="4"/><w:right w:val="single" w:sz="4"/><w:insideH w:val="single" w:sz="4"/><w:insideV w:val="single" w:sz="4"/></w:tblBorders>'
    : '';
  const grid = `<w:tblGrid>${widths.map((width) => `<w:gridCol w:w="${width}"/>`).join('')}</w:tblGrid>`;
  return `<w:tbl><w:tblPr><w:tblW w:w="${widths.reduce((sum, width) => sum + width, 0)}" w:type="dxa"/>${border}</w:tblPr>${grid}${rows.join('')}</w:tbl>`;
}

/** A plain, editable Word document with every placeholder; organizations restyle it. */
export function buildDefaultTransferTemplate(locale: TransferLocale = 'bs'): Buffer {
  const text = labels[locale];
  const itemWidths = [900, 4100, 2000, 2000];
  const signWidths = [3000, 3000, 3000];
  const body = [
    paragraph(run(`${text.title} {broj}`, true, 32), { center: true, spacingAfter: 240 }),
    paragraph(run(`${text.placeDate} {mjesto}, {datum}`)),
    paragraph(run(`${text.kind} {scenarij}`)),
    paragraph(run(`${text.from} `, true) + run('{predaje_ime}{#predaje_oj} ({predaje_oj}){/predaje_oj}')),
    paragraph(run(`${text.to} `, true) + run('{preuzima_ime}{#preuzima_oj} ({preuzima_oj}){/preuzima_oj}'), { spacingAfter: 240 }),
    paragraph(run(text.items, true)),
    table(
      [
        `<w:tr>${cell(text.rb, itemWidths[0], true)}${cell(text.name, itemWidths[1], true)}${cell(text.tag, itemWidths[2], true)}${cell(text.serial, itemWidths[3], true)}</w:tr>`,
        `<w:tr>${cell('{#stavke}{rb}', itemWidths[0])}${cell('{naziv}', itemWidths[1])}${cell('{inventarni_broj}', itemWidths[2])}${cell('{serijski_broj}{/stavke}', itemWidths[3])}</w:tr>`,
      ],
      itemWidths,
    ),
    paragraph('', { spacingAfter: 120 }),
    paragraph(run('{#jeRazduzenje}') + run(text.returned) + run('{/jeRazduzenje}{^jeRazduzenje}') + run(text.handedOver) + run('{/jeRazduzenje}')),
    paragraph(run('{#napomena}') + run(`${text.note} `, true) + run('{napomena}{/napomena}'), { spacingAfter: 480 }),
    table(
      [
        `<w:tr>${cell(text.signFrom, signWidths[0], true)}${cell(text.signTo, signWidths[1], true)}${cell(text.signatory, signWidths[2], true)}</w:tr>`,
        `<w:tr>${cell('', signWidths[0])}${cell('', signWidths[1])}${cell('', signWidths[2])}</w:tr>`,
        `<w:tr>${cell('______________________', signWidths[0])}${cell('______________________', signWidths[1])}${cell('______________________', signWidths[2])}</w:tr>`,
        `<w:tr>${cell('{predaje_ime}', signWidths[0])}${cell('{preuzima_ime}', signWidths[1])}${cell('{potpisnik_ime}', signWidths[2])}</w:tr>`,
        `<w:tr>${cell('', signWidths[0])}${cell('', signWidths[1])}${cell('{potpisnik_funkcija}', signWidths[2])}</w:tr>`,
      ],
      signWidths,
      false,
    ),
    paragraph('', { spacingAfter: 240 }),
    paragraph(run(`${text.issuedBy} {izdao_ime}, {datum} {vrijeme}`, false, 18)),
  ].join('');

  const zip = new PizZip();
  zip.file(
    '[Content_Types].xml',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
  );
  zip.file(
    '_rels/.rels',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
  );
  zip.file(
    'word/document.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr></w:body></w:document>`,
  );
  return zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' });
}
