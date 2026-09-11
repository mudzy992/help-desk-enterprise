import type { DataClassification } from '../../../generated/prisma/enums';

export type TicketAttachmentRecord = {
  readonly id: string;
  readonly ticketId: string;
  readonly messageId: string | null;
  readonly storagePath: string;
  readonly originalName: string;
  readonly mimeType: string;
  readonly extension: string;
  readonly sizeBytes: number;
  readonly classification: DataClassification;
  readonly uploadedByUserId: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
};

export type TicketAttachmentResponse = {
  readonly id: string;
  readonly ticketId: string;
  readonly originalName: string;
  readonly mimeType: string;
  readonly extension: string;
  readonly sizeBytes: number;
  readonly classification: DataClassification;
  readonly uploadedByUserId: string;
  readonly createdAt: string;
  readonly updatedAt: string;
};

export type TicketAttachmentUploadInput = {
  readonly originalName: string;
  readonly declaredMimeType?: string;
  readonly size: number;
  readonly buffer: Buffer;
  readonly requestedClassification?: DataClassification;
};

export type TicketAttachmentConfiguration = {
  readonly enabled: boolean;
  readonly maxFileSizeBytes: number;
  readonly allowedMimeTypes: readonly string[];
  readonly allowedExtensions: readonly string[];
  readonly maxFilesPerTicket: number;
  readonly maxFilesPerMessage: number;
  readonly dangerousExtensions: readonly string[];
  readonly retentionDays: number;
};

export type TicketAttachmentStorage = {
  write(input: {
    readonly ticketId: string;
    readonly extension: string;
    readonly contents: Buffer;
  }): Promise<string>;
  read(storagePath: string): Promise<Buffer>;
  remove(storagePath: string): Promise<void>;
};

export type ValidatedTicketAttachment = {
  readonly originalName: string;
  readonly extension: string;
  readonly mimeType: string;
  readonly sizeBytes: number;
  readonly classification: DataClassification;
};
