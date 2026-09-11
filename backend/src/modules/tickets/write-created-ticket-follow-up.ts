import { PrismaService } from '../../common/prisma/prisma.service';
import { changeLogActions } from '../change-log/change-log.constants';
import { createPendingTicketApproval } from './approvals/create-pending-ticket-approval';
import { ticketSystemEventActions } from './collaboration.constants';
import type { TicketPersistedMessageSink } from './collaboration.types';
import { insertSystemTicketEvent } from './insert-system-ticket-event';
import { recordRedactionWarning } from './redaction/record-redaction-warning';
import type {
  RedactionScanResult,
  TicketRedactionConfiguration,
} from './redaction/redaction.types';
import { recordTicketChange } from './record-ticket-change';
import { seedDefaultTicketParticipants } from './seed-default-ticket-participants';
import { ticketChangeLogReasons } from './tickets.constants';
import type { TicketMutationContext, TicketRecord } from './tickets.types';

export async function writeCreatedTicketFollowUp(
  prisma: PrismaService,
  record: TicketRecord,
  context: TicketMutationContext,
  messages: TicketPersistedMessageSink,
  scan: RedactionScanResult,
  redaction?: TicketRedactionConfiguration,
): Promise<void> {
  await recordTicketChange(prisma, {
    action: changeLogActions.create,
    reason: ticketChangeLogReasons.create,
    before: null,
    after: record,
    actorUserId: context.actorUserId,
    redaction,
    safeLogging: context.safeLogging,
  });
  await seedDefaultTicketParticipants(prisma, record);
  messages.push(
    await insertSystemTicketEvent(prisma, {
      ticketId: record.id,
      action: ticketSystemEventActions.created,
      actorUserId: context.actorUserId,
    }),
  );
  await recordRedactionWarning({
    prisma,
    ticketId: record.id,
    actorUserId: context.actorUserId,
    scan,
    messages,
  });
  if (record.status !== 'PENDING_APPROVAL') {
    return;
  }
  await createPendingTicketApproval(prisma, record);
  messages.push(
    await insertSystemTicketEvent(prisma, {
      ticketId: record.id,
      action: ticketSystemEventActions.approvalRequested,
      actorUserId: context.actorUserId,
    }),
  );
}
