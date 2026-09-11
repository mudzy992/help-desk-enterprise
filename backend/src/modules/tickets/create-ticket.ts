import { PrismaService } from '../../common/prisma/prisma.service';
import { AuthorizationContextLoader } from '../authorization/authorization-context.loader';
import { changeLogActions } from '../change-log/change-log.constants';
import { RoutingService } from '../routing/routing.service';
import { applyCreateTicketRouting } from './apply-create-ticket-routing';
import { createPendingTicketApproval } from './approvals/create-pending-ticket-approval';
import {
  resolveCreateTicketApprovalStatus,
  resolveTicketApprovalRequirement,
} from './approvals/resolve-ticket-approval-requirement';
import type { TicketApprovalsConfigurationLoader } from './approvals/ticket-approvals-configuration.loader';
import {
  assertCanCreateTicket,
  resolveCreateOriginUnitId,
} from './assert-can-create-ticket';
import { calculateTicketPriority } from './calculate-ticket-priority';
import { nextTicketNumber } from './generate-ticket-number';
import {
  loadOfferedService,
  mapCreateDependencyError,
} from './load-ticket-record';
import {
  normalizeTicketDescription,
  normalizeTicketTitle,
} from './normalize-ticket-text';
import { recordTicketChange } from './record-ticket-change';
import { resolveCreateFormVersionRef } from './resolve-create-form-version-ref';
import { ticketChangeLogReasons } from './tickets.constants';
import { TicketsError } from './tickets.error';
import { toTicketFormDataInput } from './to-ticket-form-data-input';
import { seedDefaultTicketParticipants } from './seed-default-ticket-participants';
import { insertSystemTicketEvent } from './insert-system-ticket-event';
import { ticketSystemEventActions } from './collaboration.constants';
import type { TicketPersistedMessageSink } from './collaboration.types';
import type {
  CreateTicketInput,
  TicketMutationContext,
  TicketRecord,
} from './tickets.types';

export async function createTicket(
  prisma: PrismaService,
  routingService: RoutingService,
  authorizationContextLoader: AuthorizationContextLoader,
  approvalsConfigurationLoader: TicketApprovalsConfigurationLoader,
  input: CreateTicketInput,
  context: TicketMutationContext,
  messages: TicketPersistedMessageSink = [],
): Promise<TicketRecord> {
  const authContext = await authorizationContextLoader.loadBySubjectId(
    context.actorUserId,
  );
  if (authContext === null) {
    throw new TicketsError('FORBIDDEN');
  }
  const requester = await prisma.user.findUnique({
    where: { id: context.actorUserId },
    select: { id: true, organizationalUnitId: true },
  });
  if (requester === null) {
    throw new TicketsError('REQUESTER_NOT_FOUND');
  }
  const originUnitId = await resolveCreateOriginUnitId(prisma, {
    requestedOriginUnitId: input.originUnitId,
    actorUserId: context.actorUserId,
  });
  const serviceId = input.serviceId.trim();
  if (serviceId.length === 0) {
    throw new TicketsError('SERVICE_REQUIRED');
  }
  await assertCanCreateTicket({
    prisma,
    context: authContext,
    originUnitId,
    serviceId,
    actorHomeUnitId: requester.organizationalUnitId,
  });
  const service = await loadOfferedService(prisma, serviceId);
  const formVersionRef = await resolveCreateFormVersionRef(prisma, {
    serviceId,
    formVersionRef: input.formVersionRef,
  });
  const routing = await applyCreateTicketRouting(routingService, {
    originUnitId,
    serviceId,
  }).catch(mapCreateDependencyError);
  const approvalsConfiguration = await approvalsConfigurationLoader.load();
  const status = resolveCreateTicketApprovalStatus({
    routingStatus: routing.status,
    requiresApproval: resolveTicketApprovalRequirement({
      configuration: approvalsConfiguration,
      serviceId,
      serviceRequiresApproval: service.requiresApproval,
    }),
  });
  const created = await prisma.$transaction(async (transaction) => {
    const ticketNumber = await nextTicketNumber(() =>
      transaction.ticket.count(),
    );
    const record = (await transaction.ticket.create({
      data: {
        ticketNumber,
        title: normalizeTicketTitle(input.title),
        description: normalizeTicketDescription(input.description),
        status,
        priority: calculateTicketPriority(input.impact, input.urgency),
        impact: input.impact,
        urgency: input.urgency,
        classification: service.classification,
        isConfidential: service.isConfidentialDefault,
        formData: toTicketFormDataInput(input.formData),
        originUnitId,
        serviceId,
        formVersionId: formVersionRef,
        requesterId: requester.id,
        assignedGroupId: routing.assignedGroupId,
        assignedUserId: null,
      },
    })) as TicketRecord;
    await recordTicketChange(transaction as PrismaService, {
      action: changeLogActions.create,
      reason: ticketChangeLogReasons.create,
      before: null,
      after: record,
      actorUserId: context.actorUserId,
    });
    await seedDefaultTicketParticipants(transaction as PrismaService, record);
    messages.push(
      await insertSystemTicketEvent(transaction as PrismaService, {
        ticketId: record.id,
        action: ticketSystemEventActions.created,
        actorUserId: context.actorUserId,
      }),
    );
    if (record.status === 'PENDING_APPROVAL') {
      await createPendingTicketApproval(transaction as PrismaService, record);
      messages.push(
        await insertSystemTicketEvent(transaction as PrismaService, {
          ticketId: record.id,
          action: ticketSystemEventActions.approvalRequested,
          actorUserId: context.actorUserId,
        }),
      );
    }
    return record;
  });
  return created;
}
