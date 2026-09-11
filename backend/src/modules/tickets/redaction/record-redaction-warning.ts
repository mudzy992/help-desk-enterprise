import { PrismaService } from '../../../common/prisma/prisma.service';
import { ticketSystemEventActions } from '../collaboration.constants';
import type { TicketPersistedMessageSink } from '../collaboration.types';
import { insertSystemTicketEvent } from '../insert-system-ticket-event';
import type { RedactionScanResult } from './redaction.types';

export async function recordRedactionWarning(input: {
  readonly prisma: PrismaService;
  readonly ticketId: string;
  readonly actorUserId: string | null;
  readonly scan: RedactionScanResult;
  readonly messages: TicketPersistedMessageSink;
}): Promise<void> {
  if (input.scan.matches.length === 0) {
    return;
  }
  input.messages.push(
    await insertSystemTicketEvent(input.prisma, {
      ticketId: input.ticketId,
      action: `${ticketSystemEventActions.redactionWarned}:${input.scan.matches
        .map((match) => match.patternId)
        .join(',')}`,
      actorUserId: input.actorUserId,
    }),
  );
}
