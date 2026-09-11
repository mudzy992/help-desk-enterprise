import { PrismaService } from '../../../common/prisma/prisma.service';
import { changeLogActions } from '../../change-log/change-log.constants';
import { ticketSystemEventActions } from '../collaboration.constants';
import type { TicketPersistedMessageSink } from '../collaboration.types';
import { insertSystemTicketEvent } from '../insert-system-ticket-event';
import { recordTicketChange } from '../record-ticket-change';
import { ticketChangeLogReasons } from '../tickets.constants';
import type { TicketRecord } from '../tickets.types';
import type { DuplicateTicketMatch } from './guardrails.types';

export async function recordDuplicateTicketWarning(input: {
  readonly prisma: PrismaService;
  readonly ticket: TicketRecord;
  readonly actorUserId: string | null;
  readonly matches: readonly DuplicateTicketMatch[];
  readonly messages: TicketPersistedMessageSink;
}): Promise<void> {
  if (input.matches.length === 0) {
    return;
  }
  await recordTicketChange(input.prisma, {
    action: changeLogActions.update,
    reason: ticketChangeLogReasons.guardrailDuplicate,
    before: input.ticket,
    after: input.ticket,
    actorUserId: input.actorUserId,
  });
  input.messages.push(
    await insertSystemTicketEvent(input.prisma, {
      ticketId: input.ticket.id,
      action: `${ticketSystemEventActions.guardrailDuplicateWarned}:${input.matches
        .map((match) => match.ticketNumber)
        .join(',')}`,
      actorUserId: input.actorUserId,
    }),
  );
}

export async function recordGuardrailLoopSuppressed(input: {
  readonly prisma: PrismaService;
  readonly ticket: TicketRecord;
  readonly action: string;
  readonly messages?: TicketPersistedMessageSink;
}): Promise<void> {
  await recordTicketChange(input.prisma, {
    action: changeLogActions.update,
    reason: ticketChangeLogReasons.guardrailLoopSuppressed,
    before: input.ticket,
    after: input.ticket,
    actorUserId: null,
  });
  const event = await insertSystemTicketEvent(input.prisma, {
    ticketId: input.ticket.id,
    action: `${ticketSystemEventActions.guardrailLoopSuppressed}:${input.action}`,
    actorUserId: null,
  });
  input.messages?.push(event);
}
