import { PrismaService } from '../../../common/prisma/prisma.service';
import type { TicketPersistedMessageSink } from '../collaboration.types';
import type { TicketGuardrailsConfiguration } from '../guardrails/guardrails.types';
import type { TicketRecord } from '../tickets.types';
import type { TicketArchiveConfiguration } from './archive.types';
import { archiveClosedTicket } from './archive-closed-ticket';
import { claimTicketArchive } from './claim-ticket-archive';
import { isClosedTicketDueForArchive } from './evaluate-ticket-archive-action';

export async function processClosedTicketArchive(input: {
  readonly prisma: PrismaService;
  readonly ticket: TicketRecord;
  readonly configuration: TicketArchiveConfiguration;
  readonly guardrails: TicketGuardrailsConfiguration;
  readonly now: Date;
  readonly messages?: TicketPersistedMessageSink;
}): Promise<TicketRecord> {
  if (
    !isClosedTicketDueForArchive({
      status: input.ticket.status,
      closedAt: input.ticket.closedAt,
      configuration: input.configuration,
      now: input.now,
    })
  ) {
    return input.ticket;
  }
  const allowed = await claimTicketArchive({
    prisma: input.prisma,
    ticket: input.ticket,
    guardrails: input.guardrails,
    now: input.now,
  });
  if (!allowed) {
    return input.ticket;
  }
  return archiveClosedTicket(input);
}
