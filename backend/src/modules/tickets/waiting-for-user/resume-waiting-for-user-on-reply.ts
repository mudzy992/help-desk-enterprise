import { PrismaService } from '../../../common/prisma/prisma.service';
import { changeLogActions } from '../../change-log/change-log.constants';
import { applyTicketLifecycleTimestamps } from '../apply-ticket-lifecycle-timestamps';
import { ticketSystemEventActions } from '../collaboration.constants';
import type {
  TicketMessageRecord,
  TicketPersistedMessageSink,
} from '../collaboration.types';
import { insertSystemTicketEvent } from '../insert-system-ticket-event';
import { recordTicketChange } from '../record-ticket-change';
import { ticketChangeLogReasons } from '../tickets.constants';
import type { TicketMutationContext, TicketRecord } from '../tickets.types';
import type { WaitingForUserConfiguration } from './waiting-for-user.types';

export async function resumeWaitingForUserOnReply(input: {
  readonly prisma: PrismaService;
  readonly ticket: TicketRecord;
  readonly message: TicketMessageRecord;
  readonly configuration: WaitingForUserConfiguration;
  readonly context: TicketMutationContext;
  readonly messages?: TicketPersistedMessageSink;
  readonly now?: Date;
}): Promise<TicketRecord> {
  if (
    !input.configuration.enabled ||
    input.ticket.status !== 'WAITING_FOR_USER' ||
    input.message.type !== 'USER_REPLY'
  ) {
    return input.ticket;
  }
  const now = input.now ?? new Date();
  const timestamps = applyTicketLifecycleTimestamps({
    current: input.ticket,
    nextStatus: 'IN_PROGRESS',
    now,
  });
  const updated = (await input.prisma.ticket.update({
    where: { id: input.ticket.id },
    data: {
      status: 'IN_PROGRESS',
      ...timestamps,
    },
  })) as TicketRecord;
  await recordTicketChange(input.prisma, {
    action: changeLogActions.update,
    reason: ticketChangeLogReasons.update,
    before: input.ticket,
    after: updated,
    actorUserId: input.context.actorUserId,
  });
  input.messages?.push(
    await insertSystemTicketEvent(input.prisma, {
      ticketId: updated.id,
      action: ticketSystemEventActions.waitingForUserResumed,
      actorUserId: input.context.actorUserId,
    }),
  );
  return updated;
}
