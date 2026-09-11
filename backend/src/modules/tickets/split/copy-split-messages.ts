import { PrismaService } from '../../../common/prisma/prisma.service';
import type { TicketPersistedMessageSink } from '../collaboration.types';
import { TicketsError } from '../tickets.error';
import type { TicketRecord } from '../tickets.types';
import type { TicketSplitConfiguration } from './split.types';

export async function copySplitMessages(input: {
  readonly prisma: PrismaService;
  readonly parent: TicketRecord;
  readonly child: TicketRecord;
  readonly messageIds: readonly string[] | undefined;
  readonly configuration: TicketSplitConfiguration;
  readonly messages: TicketPersistedMessageSink;
}): Promise<void> {
  const selected = uniqueIds(input.messageIds);
  if (selected.length === 0) {
    return;
  }
  if (!input.configuration.allowMessageCopy) {
    throw new TicketsError('SPLIT_NOT_ALLOWED');
  }
  const records = await input.prisma.ticketMessage.findMany({
    where: { ticketId: input.parent.id, id: { in: [...selected] } },
  });
  if (records.length !== selected.length) {
    throw new TicketsError('NOT_FOUND');
  }
  for (const record of records) {
    input.messages.push(
      await input.prisma.ticketMessage.create({
        data: {
          ticketId: input.child.id,
          type: record.type,
          body: record.body,
          authorUserId: record.authorUserId,
        },
      }),
    );
  }
}

function uniqueIds(ids: readonly string[] | undefined): readonly string[] {
  return [...new Set((ids ?? []).map((id) => id.trim()).filter(Boolean))];
}
