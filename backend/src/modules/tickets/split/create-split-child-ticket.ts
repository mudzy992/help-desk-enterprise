import { PrismaService } from '../../../common/prisma/prisma.service';
import { AuthorizationContextLoader } from '../../authorization/authorization-context.loader';
import { RoutingService } from '../../routing/routing.service';
import type { TicketApprovalsConfigurationLoader } from '../approvals/ticket-approvals-configuration.loader';
import { ticketSystemEventActions } from '../collaboration.constants';
import type { TicketPersistedMessageSink } from '../collaboration.types';
import { createTicket } from '../create-ticket';
import { applyTicketSlaTimers } from '../apply-ticket-sla-timers';
import { insertSystemTicketEvent } from '../insert-system-ticket-event';
import type { TicketMutationContext, TicketRecord } from '../tickets.types';
import type { SplitTicketChildInput } from './split.types';

export async function createSplitChildTicket(input: {
  readonly prisma: PrismaService;
  readonly routingService: RoutingService;
  readonly authorizationContextLoader: AuthorizationContextLoader;
  readonly approvalsConfigurationLoader: TicketApprovalsConfigurationLoader;
  readonly parent: TicketRecord;
  readonly child: SplitTicketChildInput;
  readonly context: TicketMutationContext;
  readonly messages: TicketPersistedMessageSink;
}): Promise<TicketRecord> {
  const serviceId = input.child.serviceId?.trim() || input.parent.serviceId;
  const created = await createTicket(
    input.prisma,
    input.routingService,
    input.authorizationContextLoader,
    input.approvalsConfigurationLoader,
    {
      title: input.child.title?.trim() || input.parent.title,
      description: input.child.description?.trim() || input.parent.description,
      impact: input.parent.impact,
      urgency: input.parent.urgency,
      serviceId,
      originUnitId: input.parent.originUnitId,
      formVersionRef:
        serviceId === input.parent.serviceId
          ? input.parent.formVersionId
          : undefined,
      formData: input.parent.formData,
      requesterUserId: input.parent.requesterId,
      parentTicketId: input.parent.id,
      assignedGroupId: input.child.assignedGroupId,
      classification: input.parent.classification,
      isConfidential: input.parent.isConfidential,
    },
    input.context,
    input.messages,
  );
  await applyTicketSlaTimers(input.context, {
    ticket: created,
    event: 'created',
    now: created.createdAt,
  });
  input.messages.push(
    await insertSystemTicketEvent(input.prisma, {
      ticketId: created.id,
      action: `${ticketSystemEventActions.ticketSplitChild}:${input.parent.ticketNumber}`,
      actorUserId: input.context.actorUserId,
    }),
  );
  return created;
}
