import type { JsonValue } from '../change-log/change-log.types';
import { PrismaService } from '../../common/prisma/prisma.service';
import { fanOutInAppNotifications } from '../notifications/fan-out/fan-out-in-app-notifications';
import { insertSystemTicketEvent } from '../tickets/insert-system-ticket-event';
import { toTicketRealtimePayload } from '../tickets/to-collaboration-response';
import { changeLogActions, recordSlaChange } from './record-sla-change';
import { slaChangeLogEntityTypes } from './sla.constants';
import { toTicketSlaStateSnapshot } from './to-ticket-sla-state-snapshot';
import type { TicketSlaStateRecord } from './ticket-sla.types';

export async function recordTicketSlaRuntimeEvent(
  prisma: PrismaService,
  input: {
    readonly ticketId: string;
    readonly reason: string;
    readonly action: string;
    readonly before: TicketSlaStateRecord;
    readonly after: TicketSlaStateRecord;
    readonly extraAfter?: { readonly [key: string]: JsonValue };
  },
): Promise<void> {
  await recordSlaChange(prisma, {
    action: changeLogActions.update,
    entityType: slaChangeLogEntityTypes.ticketSlaState,
    entityId: input.after.id,
    reason: input.reason,
    before: toTicketSlaStateSnapshot(input.before) as JsonValue,
    after: {
      ...toTicketSlaStateSnapshot(input.after),
      ...(input.extraAfter ?? {}),
    } as JsonValue,
    actorUserId: null,
  });
  const message = await insertSystemTicketEvent(prisma, {
    ticketId: input.ticketId,
    action: input.action,
    actorUserId: null,
  });
  const ticket = await prisma.ticket.findUnique({
    where: { id: input.ticketId },
  });
  if (ticket !== null) {
    await fanOutInAppNotifications(
      prisma,
      toTicketRealtimePayload(message, ticket),
    );
  }
}
