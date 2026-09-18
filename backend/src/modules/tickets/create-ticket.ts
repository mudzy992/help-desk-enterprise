import { PrismaService } from '../../common/prisma/prisma.service';
import { AuthorizationContextLoader } from '../authorization/authorization-context.loader';
import { RoutingService } from '../routing/routing.service';
import { applyCreateTicketRouting } from './apply-create-ticket-routing';
import {
  resolveCreateTicketApprovalStatus,
  resolveTicketApprovalRequirement,
} from './approvals/resolve-ticket-approval-requirement';
import type { TicketApprovalsConfigurationLoader } from './approvals/ticket-approvals-configuration.loader';
import {
  assertCanCreateTicket,
  resolveCreateOriginUnitId,
} from './assert-can-create-ticket';
import { resolveTicketPriority } from './resolve-ticket-priority';
import { nextTicketNumber } from './generate-ticket-number';
import {
  loadOfferedService,
  mapCreateDependencyError,
} from './load-ticket-record';
import {
  normalizeTicketDescription,
  normalizeTicketTitle,
} from './normalize-ticket-text';
import { resolveCreateFormVersionRef } from './resolve-create-form-version-ref';
import { resolveCreateTicketHandlerGroup } from './resolve-create-ticket-handler-group';
import { TicketsError } from './tickets.error';
import { toTicketFormDataInput } from './to-ticket-form-data-input';
import type { TicketPersistedMessageSink } from './collaboration.types';
import type { TicketRedactionConfiguration } from './redaction/redaction.types';
import {
  assertRedactionAllowed,
  scanTicketContent,
} from './redaction/assert-ticket-content-redaction';
import { defaultTicketConfidentialConfiguration } from './confidential/confidential.constants';
import { resolveCreateConfidentialFlag } from './confidential/resolve-create-confidential-flag';
import {
  applyCreateTicketGuardrails,
  duplicateGuardrailSubjectKey,
} from './guardrails/apply-create-ticket-guardrails';
import { runExclusiveGuardrail } from './guardrails/run-exclusive-guardrail';
import type {
  DuplicateTicketMatch,
  TicketGuardrailsConfiguration,
} from './guardrails/guardrails.types';
import { writeCreatedTicketFollowUp } from './write-created-ticket-follow-up';
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
  redaction?: TicketRedactionConfiguration,
  guardrails?: TicketGuardrailsConfiguration,
  duplicateWarnings: DuplicateTicketMatch[] = [],
): Promise<TicketRecord> {
  const authContext = await authorizationContextLoader.loadBySubjectId(
    context.actorUserId,
  );
  if (authContext === null) {
    throw new TicketsError('FORBIDDEN');
  }
  const actor = await prisma.user.findUnique({
    where: { id: context.actorUserId },
    select: { id: true, organizationalUnitId: true },
  });
  if (actor === null) {
    throw new TicketsError('REQUESTER_NOT_FOUND');
  }
  const requesterId = input.requesterUserId ?? actor.id;
  const requester =
    requesterId === actor.id
      ? actor
      : await prisma.user.findUnique({
          where: { id: requesterId },
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
    actorHomeUnitId: actor.organizationalUnitId,
  });
  const service = await loadOfferedService(prisma, serviceId);
  const formVersionRef = await resolveCreateFormVersionRef(prisma, {
    serviceId,
    formVersionRef: input.formVersionRef,
  });
  const routing = await resolveCreateTicketHandlerGroup(
    prisma,
    await applyCreateTicketRouting(routingService, {
      originUnitId,
      serviceId,
    }).catch(mapCreateDependencyError),
    input.assignedGroupId,
  );
  const approvalsConfiguration = await approvalsConfigurationLoader.load();
  const status = resolveCreateTicketApprovalStatus({
    routingStatus: routing.status,
    requiresApproval: resolveTicketApprovalRequirement({
      configuration: approvalsConfiguration,
      serviceId,
      serviceRequiresApproval: service.requiresApproval,
    }),
  });
  const title = normalizeTicketTitle(input.title);
  const description = normalizeTicketDescription(input.description);
  const scan = scanTicketContent({
    configuration: redaction ?? {
      enabled: false,
      mode: 'warn_only',
      applyToFields: [],
      patterns: [],
    },
    title,
    description,
  });
  assertRedactionAllowed(scan);
  const guardrailNow = new Date();
  const created = await runExclusiveGuardrail(
    duplicateGuardrailSubjectKey(requester.id, serviceId),
    async () => {
      await applyCreateTicketGuardrails({
        prisma,
        createInput: input,
        requesterId: requester.id,
        serviceId,
        description,
        configuration: guardrails,
        sink: duplicateWarnings,
        now: guardrailNow,
      });
      return prisma.$transaction(async (transaction) => {
        const ticketNumber = await nextTicketNumber(() =>
          transaction.ticket.count(),
        );
        const record = (await transaction.ticket.create({
          data: {
            ticketNumber,
            title,
            description,
            status,
            priority: await resolveTicketPriority(
              transaction as PrismaService,
              input.impact,
              input.urgency,
            ),
            impact: input.impact,
            urgency: input.urgency,
            classification: input.classification ?? service.classification,
            isConfidential: resolveCreateConfidentialFlag({
              requested: input.isConfidential,
              serviceId,
              serviceDefault: service.isConfidentialDefault,
              configuration:
                context.confidential ?? defaultTicketConfidentialConfiguration,
            }),
            formData: toTicketFormDataInput(input.formData),
            originUnitId,
            serviceId,
            formVersionId: formVersionRef,
            requesterId: requester.id,
            assignedGroupId: routing.assignedGroupId,
            assignedUserId: null,
            parentTicketId: input.parentTicketId ?? null,
            reopenedFromTicketId: input.reopenedFromTicketId ?? null,
          },
        })) as TicketRecord;
        await writeCreatedTicketFollowUp(
          transaction as PrismaService,
          record,
          context,
          messages,
          scan,
          redaction,
          duplicateWarnings,
        );
        return record;
      });
    },
  );
  return created;
}
