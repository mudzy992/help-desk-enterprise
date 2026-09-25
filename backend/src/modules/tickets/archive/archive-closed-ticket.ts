import { stopActiveTicketTimeLogs } from '../time-tracking/stop-active-ticket-time-logs';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { changeLogActions } from '../../change-log/change-log.constants';
import { applyTicketLifecycleTimestamps } from '../apply-ticket-lifecycle-timestamps';
import { ticketSystemEventActions } from '../collaboration.constants';
import type { TicketPersistedMessageSink } from '../collaboration.types';
import { insertSystemTicketEvent } from '../insert-system-ticket-event';
import { recordTicketChange } from '../record-ticket-change';
import { ticketChangeLogReasons } from '../tickets.constants';
import type { TicketRecord } from '../tickets.types';

export async function archiveClosedTicket(input: {
  readonly prisma: PrismaService;
  readonly ticket: TicketRecord;
  readonly now: Date;
  readonly messages?: TicketPersistedMessageSink;
}): Promise<TicketRecord> {
  const timestamps = applyTicketLifecycleTimestamps({
    current: input.ticket,
    nextStatus: 'ARCHIVED',
    now: input.now,
  });
  const updated = (await input.prisma.ticket.update({
    where: { id: input.ticket.id },
    data: {
      status: 'ARCHIVED',
      ...timestamps,
    },
  })) as TicketRecord;
  await recordTicketChange(input.prisma, {
    action: changeLogActions.update,
    reason: ticketChangeLogReasons.archived,
    before: input.ticket,
    after: updated,
    actorUserId: null,
  });
  input.messages?.push(
    await insertSystemTicketEvent(input.prisma, {
      ticketId: updated.id,
      action: ticketSystemEventActions.ticketArchived,
      actorUserId: null,
    }),
  );
  await stopActiveTicketTimeLogs(input.prisma, {
    ticketIds: [updated.id],
    actorUserId: null,
    now: input.now,
    messages: input.messages,
  });
  return updated;
}
