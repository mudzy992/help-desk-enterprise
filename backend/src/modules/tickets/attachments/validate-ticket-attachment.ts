import { TicketsError } from '../tickets.error';
import type {
  TicketAttachmentConfiguration,
  TicketAttachmentUploadInput,
  ValidatedTicketAttachment,
} from './attachments.types';
import { detectFileSignature } from './detect-file-signature';
import { inheritAttachmentClassification } from './inherit-attachment-classification';
import { sanitizeAttachmentFilename } from './sanitize-attachment-filename';
import type { DataClassification } from '../../../generated/prisma/enums';

export function validateTicketAttachment(input: {
  readonly file: TicketAttachmentUploadInput | undefined;
  readonly configuration: TicketAttachmentConfiguration;
  readonly ticketClassification: DataClassification;
  readonly existingCount: number;
}): ValidatedTicketAttachment {
  const configuration = input.configuration;
  if (!configuration.enabled) {
    throw new TicketsError('ATTACHMENTS_DISABLED');
  }
  const file = input.file;
  if (file === undefined || file.buffer.length === 0) {
    throw new TicketsError('ATTACHMENT_REQUIRED');
  }
  if (
    file.size !== file.buffer.length ||
    file.buffer.length > configuration.maxFileSizeBytes
  ) {
    throw new TicketsError('ATTACHMENT_TOO_LARGE');
  }
  if (input.existingCount >= configuration.maxFilesPerTicket) {
    throw new TicketsError('ATTACHMENT_LIMIT_REACHED');
  }
  const sanitized = sanitizeAttachmentFilename(file.originalName);
  if (configuration.dangerousExtensions.includes(sanitized.extension)) {
    throw new TicketsError('ATTACHMENT_TYPE_NOT_ALLOWED');
  }
  if (!configuration.allowedExtensions.includes(sanitized.extension)) {
    throw new TicketsError('ATTACHMENT_TYPE_NOT_ALLOWED');
  }
  const detected = detectFileSignature(file.buffer);
  if (
    detected === null ||
    !configuration.allowedMimeTypes.includes(detected.mimeType) ||
    !detected.extensions.includes(sanitized.extension)
  ) {
    throw new TicketsError('ATTACHMENT_TYPE_NOT_ALLOWED');
  }
  return {
    originalName: sanitized.originalName,
    extension: sanitized.extension,
    mimeType: detected.mimeType,
    sizeBytes: file.buffer.length,
    classification: inheritAttachmentClassification({
      ticketClassification: input.ticketClassification,
      requestedClassification: file.requestedClassification,
    }),
  };
}
