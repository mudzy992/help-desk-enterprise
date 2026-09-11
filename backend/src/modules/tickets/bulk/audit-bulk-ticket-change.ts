import { PrismaService } from '../../../common/prisma/prisma.service';
import { changeLogActions } from '../../change-log/change-log.constants';
import { ticketSystemEventActions } from '../collaboration.constants';
import type { TicketPersistedMessageSink } from '../collaboration.types';
import { insertSystemTicketEvent } from '../insert-system-ticket-event';
import { recordTicketChange } from '../record-ticket-change';
import { ticketChangeLogReasons } from '../tickets.constants';
import type { TicketMutationContext, TicketRecord } from '../tickets.types';

export async function auditBulkTicketChange(input: {
  readonly prisma: PrismaService;
  readonly before: TicketRecord;
  readonly after: TicketRecord;
  readonly context: TicketMutationContext;
  readonly reason: string;
  readonly action: string;
  readonly batchId: string | null;
  readonly messages: TicketPersistedMessageSink;
}): Promise<void> {
  await recordTicketChange(input.prisma, {
    action: changeLogActions.update,
    reason: input.reason,
    before: input.before,
    after: input.after,
    actorUserId: input.context.actorUserId,
  });
  const suffix = input.batchId === null ? '' : `:${input.batchId}`;
  input.messages.push(
    await insertSystemTicketEvent(input.prisma, {
      ticketId: input.after.id,
      action: `${input.action}${suffix}`,
      actorUserId: input.context.actorUserId,
    }),
  );
}

export { ticketSystemEventActions, ticketChangeLogReasons };
