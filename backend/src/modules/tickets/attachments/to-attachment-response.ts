import { effectiveAttachmentClassification } from './inherit-attachment-classification';
import type {
  TicketAttachmentRecord,
  TicketAttachmentResponse,
} from './attachments.types';
import type { TicketRecord } from '../tickets.types';

export function toTicketAttachmentResponse(
  record: TicketAttachmentRecord,
  ticket: TicketRecord,
): TicketAttachmentResponse {
  return {
    id: record.id,
    ticketId: record.ticketId,
    originalName: record.originalName,
    mimeType: record.mimeType,
    extension: record.extension,
    sizeBytes: record.sizeBytes,
    classification: effectiveAttachmentClassification({
      ticketClassification: ticket.classification,
      storedClassification: record.classification,
    }),
    uploadedByUserId: record.uploadedByUserId,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}
