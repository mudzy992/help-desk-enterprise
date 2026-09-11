import { TicketsError } from '../tickets.error';

const maximumOriginalNameLength = 200;
const allowedNamePattern = /^[A-Za-z0-9._-]+$/;

export function sanitizeAttachmentFilename(originalName: string): {
  readonly originalName: string;
  readonly extension: string;
} {
  const trimmed = originalName.trim();
  if (
    trimmed.length === 0 ||
    trimmed.length > maximumOriginalNameLength ||
    trimmed.includes('\0') ||
    trimmed.includes('..') ||
    trimmed.includes('/') ||
    trimmed.includes('\\') ||
    trimmed.startsWith('.')
  ) {
    throw new TicketsError('ATTACHMENT_FILENAME_INVALID');
  }
  const lastDot = trimmed.lastIndexOf('.');
  if (lastDot <= 0 || lastDot === trimmed.length - 1) {
    throw new TicketsError('ATTACHMENT_FILENAME_INVALID');
  }
  const baseName = trimmed.slice(0, lastDot);
  const extension = trimmed.slice(lastDot + 1).toLowerCase();
  if (
    !allowedNamePattern.test(trimmed) ||
    baseName.length === 0 ||
    extension.length === 0
  ) {
    throw new TicketsError('ATTACHMENT_FILENAME_INVALID');
  }
  return { originalName: `${baseName}.${extension}`, extension };
}
