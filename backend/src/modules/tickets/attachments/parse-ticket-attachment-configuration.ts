import {
  defaultTicketAttachmentConfiguration,
  ticketAttachmentUploadHardLimitBytes,
} from './attachments.constants';
import type { TicketAttachmentConfiguration } from './attachments.types';

export function parseTicketAttachmentConfiguration(input: {
  readonly enabled: unknown;
  readonly maxFileSizeMb: unknown;
  readonly allowedMimeTypesCsv: unknown;
  readonly allowedExtensionsCsv: unknown;
  readonly maxFilesPerTicket: unknown;
  readonly maxFilesPerMessage: unknown;
  readonly dangerousExtensionsCsv: unknown;
  readonly retentionDays: unknown;
}): TicketAttachmentConfiguration {
  if (typeof input.enabled !== 'boolean') {
    return { ...defaultTicketAttachmentConfiguration };
  }
  return {
    enabled: input.enabled,
    maxFileSizeBytes: parseSizeBytes(input.maxFileSizeMb),
    allowedMimeTypes: parseCsv(
      input.allowedMimeTypesCsv,
      defaultTicketAttachmentConfiguration.allowedMimeTypes,
    ).map((item) => item.toLowerCase()),
    allowedExtensions: parseCsv(
      input.allowedExtensionsCsv,
      defaultTicketAttachmentConfiguration.allowedExtensions,
    ).map(normalizeExtension),
    maxFilesPerTicket: parsePositiveInteger(
      input.maxFilesPerTicket,
      defaultTicketAttachmentConfiguration.maxFilesPerTicket,
    ),
    maxFilesPerMessage: parsePositiveInteger(
      input.maxFilesPerMessage,
      defaultTicketAttachmentConfiguration.maxFilesPerMessage,
    ),
    dangerousExtensions: parseCsv(
      input.dangerousExtensionsCsv,
      defaultTicketAttachmentConfiguration.dangerousExtensions,
    ).map(normalizeExtension),
    retentionDays: parsePositiveInteger(
      input.retentionDays,
      defaultTicketAttachmentConfiguration.retentionDays,
    ),
  };
}

function parseSizeBytes(value: unknown): number {
  const megabytes = parsePositiveInteger(
    value,
    defaultTicketAttachmentConfiguration.maxFileSizeBytes / (1024 * 1024),
  );
  return Math.min(megabytes * 1024 * 1024, ticketAttachmentUploadHardLimitBytes);
}

function parsePositiveInteger(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) {
    return fallback;
  }
  return value;
}

function parseCsv(
  value: unknown,
  fallback: readonly string[],
): readonly string[] {
  if (typeof value !== 'string') {
    return fallback;
  }
  const parsed = value
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
  return parsed.length > 0 ? parsed : fallback;
}

function normalizeExtension(value: string): string {
  return value.replace(/^\./, '').toLowerCase();
}
