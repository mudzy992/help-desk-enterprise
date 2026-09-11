import { PrismaService } from '../../../common/prisma/prisma.service';
import type { TicketAttachmentRecord } from '../attachments/attachments.types';
import { TicketsError } from '../tickets.error';
import type { TicketRecord } from '../tickets.types';
import type { SplitTicketChildInput, TicketSplitConfiguration } from './split.types';

export async function transferSplitAttachments(input: {
  readonly prisma: PrismaService;
  readonly parent: TicketRecord;
  readonly child: TicketRecord;
  readonly request: SplitTicketChildInput;
  readonly configuration: TicketSplitConfiguration;
}): Promise<void> {
  const selected = uniqueIds(input.request.attachmentIds);
  if (selected.length === 0) {
    return;
  }
  const records = (await input.prisma.ticketAttachment.findMany({
    where: { ticketId: input.parent.id, id: { in: [...selected] } },
  })) as TicketAttachmentRecord[];
  if (records.length !== selected.length) {
    throw new TicketsError('ATTACHMENT_NOT_FOUND');
  }
  const move = input.request.moveAttachments === true;
  if (move && !input.configuration.allowAttachmentMove) {
    throw new TicketsError('SPLIT_NOT_ALLOWED');
  }
  for (const record of records) {
    if (move) {
      await input.prisma.ticketAttachment.update({
        where: { id: record.id },
        data: { ticketId: input.child.id, messageId: null },
      });
      continue;
    }
    await input.prisma.ticketAttachment.create({
      data: {
        ticketId: input.child.id,
        messageId: null,
        storagePath: `split-link/${record.id}/${input.child.id}`,
        originalName: record.originalName,
        mimeType: record.mimeType,
        extension: record.extension,
        sizeBytes: record.sizeBytes,
        classification: input.child.classification,
        uploadedByUserId: record.uploadedByUserId,
      },
    });
  }
}

function uniqueIds(ids: readonly string[] | undefined): readonly string[] {
  return [...new Set((ids ?? []).map((id) => id.trim()).filter(Boolean))];
}
