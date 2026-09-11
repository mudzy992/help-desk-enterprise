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

export const ticketAttachmentUploadHardLimitBytes = 100 * 1024 * 1024;
export const uploadRootEnvironmentKey = 'UPLOAD_ROOT';
export const defaultUploadRoot = './uploads';

export const dataClassificationRank: Readonly<
  Record<DataClassification, number>
> = {
  INTERNAL: 1,
  CONFIDENTIAL: 2,
  RESTRICTED: 3,
};
