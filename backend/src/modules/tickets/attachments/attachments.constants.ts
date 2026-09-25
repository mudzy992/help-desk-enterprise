import type { DataClassification } from '../../../generated/prisma/enums';

export const ticketAttachmentMimeTypes = {
  pdf: 'application/pdf',
  png: 'image/png',
  jpeg: 'image/jpeg',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
} as const;

export const ticketAttachmentExtensionByMime: Readonly<
  Record<string, readonly string[]>
> = {
  [ticketAttachmentMimeTypes.pdf]: ['pdf'],
  [ticketAttachmentMimeTypes.png]: ['png'],
  [ticketAttachmentMimeTypes.jpeg]: ['jpg', 'jpeg'],
  [ticketAttachmentMimeTypes.docx]: ['docx'],
  [ticketAttachmentMimeTypes.xlsx]: ['xlsx'],
};

export const defaultTicketAttachmentConfiguration = {
  enabled: true,
  maxFileSizeBytes: 25 * 1024 * 1024,
  allowedMimeTypes: [
    ticketAttachmentMimeTypes.pdf,
    ticketAttachmentMimeTypes.png,
    ticketAttachmentMimeTypes.jpeg,
    ticketAttachmentMimeTypes.docx,
    ticketAttachmentMimeTypes.xlsx,
  ],
  allowedExtensions: ['pdf', 'png', 'jpg', 'jpeg', 'docx', 'xlsx'],
  maxFilesPerTicket: 10,
  maxFilesPerMessage: 5,
  dangerousExtensions: [
    'exe',
    'msi',
    'bat',
    'cmd',
    'ps1',
    'vbs',
    'js',
    'jar',
    'com',
    'scr',
  ],
  retentionDays: 365,
} as const;

/**
 * Review 2026-09-25 (S7): uploads are buffered in memory, and the multer limit
 * was a fixed 100 MB regardless of the configured maximum. The hard limit is now
 * `ATTACHMENT_UPLOAD_MAX_MB` (default 25, allowed 1–100); the admin setting
 * `maxFileSizeMb` is clamped to it.
 */
export const attachmentUploadMaxMbEnvironmentKey = 'ATTACHMENT_UPLOAD_MAX_MB';
const attachmentUploadDefaultMb = 25;
const attachmentUploadCeilingMb = 100;

export function resolveAttachmentUploadHardLimitBytes(
  env: NodeJS.ProcessEnv = process.env,
): number {
  const parsed = Number.parseInt(env[attachmentUploadMaxMbEnvironmentKey] ?? '', 10);
  const megabytes =
    Number.isFinite(parsed) && parsed >= 1
      ? Math.min(parsed, attachmentUploadCeilingMb)
      : attachmentUploadDefaultMb;
  return megabytes * 1024 * 1024;
}

export const ticketAttachmentUploadHardLimitBytes =
  resolveAttachmentUploadHardLimitBytes();
export const uploadRootEnvironmentKey = 'UPLOAD_ROOT';
export const defaultUploadRoot = './uploads';

export const dataClassificationRank: Readonly<
  Record<DataClassification, number>
> = {
  INTERNAL: 1,
  CONFIDENTIAL: 2,
  RESTRICTED: 3,
};
