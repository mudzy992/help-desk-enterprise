import { PrismaService } from '../../../common/prisma/prisma.service';
import { effectiveAttachmentClassification } from './inherit-attachment-classification';
import type { TicketAttachmentRecord } from './attachments.types';
import type { TicketRecord } from '../tickets.types';

export async function raiseStoredAttachmentClassification(
  prisma: PrismaService,
  ticket: TicketRecord,
  record: TicketAttachmentRecord,
): Promise<TicketAttachmentRecord> {
  const classification = effectiveAttachmentClassification({
    ticketClassification: ticket.classification,
    storedClassification: record.classification,
  });
  if (classification === record.classification) {
    return record;
  }
  return (await prisma.ticketAttachment.update({
    where: { id: record.id },
    data: { classification },
  })) as TicketAttachmentRecord;
}
