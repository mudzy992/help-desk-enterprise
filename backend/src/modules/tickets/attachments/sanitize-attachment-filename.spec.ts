import {
  asciiAttachmentFilename,
  attachmentContentDisposition,
  decodeMultipartFilename,
  sanitizeAttachmentFilename,
} from './sanitize-attachment-filename';

describe('attachment filenames (review 2026-09-25)', () => {
  it('accepts spaces and Bosnian letters, keeps them for display', () => {
    expect(sanitizeAttachmentFilename('Izvještaj mart 2026.PDF')).toEqual({
      originalName: 'Izvještaj mart 2026.pdf',
      extension: 'pdf',
    });
    expect(sanitizeAttachmentFilename('Scan 001.pdf').extension).toBe('pdf');
  });
  it('rejects path-like names and strips control characters', () => {
    expect(() => sanitizeAttachmentFilename('C:\\fakepath\\a.png')).toThrow();
    expect(() => sanitizeAttachmentFilename('../../etc/passwd.txt')).toThrow();
    expect(() => sanitizeAttachmentFilename('.env.txt')).toThrow();
    expect(sanitizeAttachmentFilename('a\u0007b.png').originalName).toBe('ab.png');
  });
  it('still rejects names without a usable extension', () => {
    expect(() => sanitizeAttachmentFilename('README')).toThrow();
    expect(() => sanitizeAttachmentFilename('slika.')).toThrow();
    expect(() => sanitizeAttachmentFilename('   ')).toThrow();
    expect(() => sanitizeAttachmentFilename('x.pdf/')).toThrow();
  });
  it('builds an ASCII fallback', () => {
    expect(asciiAttachmentFilename('Đurđa čćšž Ž.docx')).toBe('Djurdja_ccsz_Z.docx');
  });
  it('re-decodes latin1-mangled UTF-8 from multer', () => {
    const mangled = Buffer.from('Izvještaj.pdf', 'utf8').toString('latin1');
    expect(decodeMultipartFilename(mangled)).toBe('Izvještaj.pdf');
    expect(decodeMultipartFilename('plain.pdf')).toBe('plain.pdf');
  });
  it('encodes Content-Disposition with filename*', () => {
    expect(attachmentContentDisposition('Izvještaj "mart".pdf')).toBe(
      `attachment; filename="Izvjestaj_mart.pdf"; filename*=UTF-8''Izvje%C5%A1taj%20%22mart%22.pdf`,
    );
  });
});
