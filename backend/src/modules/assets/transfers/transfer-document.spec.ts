import PizZip from 'pizzip';
import { sampleTransferSnapshot, transferDocumentData } from './plan-asset-transfer';
import { TransferRenderError, buildDefaultTransferTemplate, inspectTransferTemplate, renderTransferDocument } from './transfer-document';

function documentText(docx: Buffer): string {
  const xml = new PizZip(docx).file('word/document.xml')?.asText() ?? '';
  return xml.replace(/<[^>]+>/g, '');
}

function templateWith(body: string): Buffer {
  const zip = new PizZip(buildDefaultTransferTemplate('bs'));
  zip.file('word/document.xml', `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>${body}</w:t></w:r></w:p></w:body></w:document>`);
  return zip.generate({ type: 'nodebuffer' });
}

describe('transfer document (3.2 §7a.4)', () => {
  it('the built-in template uses only known placeholders', () => {
    for (const locale of ['bs', 'en'] as const) {
      const inspection = inspectTransferTemplate(buildDefaultTransferTemplate(locale));
      expect(inspection.ok).toBe(true);
      if (inspection.ok) {
        expect(inspection.unknownTags).toEqual([]);
        expect(inspection.tags).toEqual(expect.arrayContaining(['broj', 'predaje_ime', 'preuzima_ime', 'potpisnik_ime', 'stavke.naziv', 'stavke.inventarni_broj']));
      }
    }
  });

  it('renders number, parties, every item row and the scenario block', () => {
    const snapshot = sampleTransferSnapshot('bs', 'Europe/Sarajevo');
    const text = documentText(renderTransferDocument(buildDefaultTransferTemplate('bs'), transferDocumentData(snapshot)));
    expect(text).toContain('PRENOSNICA br. 09-0007-2026');
    expect(text).toContain('Skladište');
    expect(text).toContain('Amra Hodžić (Služba za IT)');
    expect(text).toContain('INV-2026-00001');
    expect(text).toContain('INV-2026-00002');
    expect(text).toContain('Edin Primjer');
    expect(text).toContain('predana na korištenje');
    expect(text).not.toContain('vraćena na skladište');
    expect(text).not.toContain('{');
  });

  it('a return prints the return sentence', () => {
    const snapshot = { ...sampleTransferSnapshot('en', 'UTC'), scenario: 'USER_TO_WAREHOUSE' as const };
    const text = documentText(renderTransferDocument(buildDefaultTransferTemplate('en'), transferDocumentData(snapshot)));
    expect(text).toContain('returned to the warehouse');
  });

  it('reports unknown placeholders and blocks broken or foreign files', () => {
    const unknown = inspectTransferTemplate(templateWith('{broj} {nepoznato}'));
    expect(unknown).toEqual({ ok: true, tags: ['broj', 'nepoznato'], unknownTags: ['nepoznato'] });
    const broken = inspectTransferTemplate(templateWith('{#stavke} {naziv}'));
    expect(broken.ok).toBe(false);
    expect(inspectTransferTemplate(Buffer.from('not a zip')).ok).toBe(false);
    const macro = new PizZip(buildDefaultTransferTemplate('bs'));
    macro.file('word/vbaProject.bin', 'x');
    expect(inspectTransferTemplate(macro.generate({ type: 'nodebuffer' }))).toEqual({ ok: false, errors: ['documents with macros are not allowed'] });
  });

  it('render errors are typed', () => {
    expect(() => renderTransferDocument(templateWith('{#a}'), transferDocumentData(sampleTransferSnapshot('bs', 'UTC')))).toThrow(TransferRenderError);
  });
});
