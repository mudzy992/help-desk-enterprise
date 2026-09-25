import { TicketsError } from '../tickets.error';

const maximumOriginalNameLength = 200;

/**
 * Review 2026-09-25: names were limited to `[A-Za-z0-9._-]`, so everyday files
 * like `Izvještaj mart.pdf` or `Scan 001.pdf` were rejected. The disk path is
 * `<uuid>.<ext>` (never the user's name), so the name is display metadata only:
 * keep the original (NFC, control characters removed) for display and derive
 * the extension from the normalized ASCII form. `asciiAttachmentFilename` is
 * the fallback for the `Content-Disposition` header (UTF-8 goes in filename*).
 */
export function sanitizeAttachmentFilename(originalName: string): {
  readonly originalName: string;
  readonly extension: string;
} {
  // Path-like names are rejected, not cleaned: a browser never sends them, so
  // they are a traversal attempt (tickets.attachments.spec).
  if (/[\\/]/.test(originalName) || originalName.includes('..')) {
    throw new TicketsError('ATTACHMENT_FILENAME_INVALID');
  }
  // eslint-disable-next-line no-control-regex
  const cleaned = originalName.normalize('NFC').replace(/[\u0000-\u001f\u007f]/g, '').trim();
  if (
    cleaned.length === 0 ||
    cleaned.length > maximumOriginalNameLength ||
    cleaned.startsWith('.')
  ) {
    throw new TicketsError('ATTACHMENT_FILENAME_INVALID');
  }
  const ascii = asciiAttachmentFilename(cleaned);
  const lastDot = ascii.lastIndexOf('.');
  if (lastDot <= 0 || lastDot === ascii.length - 1) {
    throw new TicketsError('ATTACHMENT_FILENAME_INVALID');
  }
  const extension = ascii.slice(lastDot + 1).toLowerCase();
  if (!/^[a-z0-9]+$/.test(extension)) {
    throw new TicketsError('ATTACHMENT_FILENAME_INVALID');
  }
  const displayDot = cleaned.lastIndexOf('.');
  return {
    originalName: `${cleaned.slice(0, displayDot)}.${extension}`,
    extension,
  };
}

const transliteration: Readonly<Record<string, string>> = {
  đ: 'dj', Đ: 'Dj', ß: 'ss', æ: 'ae', Æ: 'AE', ø: 'o', Ø: 'O', ł: 'l', Ł: 'L',
};

/** `Izvještaj mart 2026.pdf` → `Izvjestaj_mart_2026.pdf`. */
export function asciiAttachmentFilename(name: string): string {
  const folded = [...name]
    .map((character) => transliteration[character] ?? character)
    .join('')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '');
  return folded
    .replace(/[^A-Za-z0-9._-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/\.{2,}/g, '.')
    .replace(/^[._]+/, '')
    .replace(/_+(\.[^.]+)$/, '$1');
}

/**
 * Multer/busboy decode multipart filenames as latin1; a UTF-8 name like
 * `Izvještaj.pdf` then arrives as `IzvjeÅ¡taj.pdf`. Re-decode when the bytes
 * form valid UTF-8, otherwise keep the input.
 */
export function decodeMultipartFilename(name: string): string {
  // eslint-disable-next-line no-control-regex -- stripping control characters is the point
  if (!/[\u0080-\u00ff]/.test(name) || /[^\u0000-\u00ff]/.test(name)) {
    return name;
  }
  const decoded = Buffer.from(name, 'latin1').toString('utf8');
  return decoded.includes('\ufffd') ? name : decoded;
}

/** `attachment; filename="ascii"; filename*=UTF-8''…` (RFC 6266 / 5987). */
export function attachmentContentDisposition(name: string): string {
  const fallback = asciiAttachmentFilename(name).replace(/"/g, '') || 'attachment';
  const encoded = encodeURIComponent(name).replace(
    /['()*]/g,
    (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}
