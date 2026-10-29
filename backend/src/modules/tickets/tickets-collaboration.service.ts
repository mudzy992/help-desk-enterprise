import { Injectable, Optional } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../common/prisma/prisma.service';
import { RequestIdempotencyService } from '../../common/idempotency/request-idempotency.service';
import { TransactionalOutboxService } from '../../common/outbox/transactional-outbox.service';
import { recordAuditEntry } from '../audit-log/record-audit-entry';
import type { AuditLogTransactionalClient } from '../audit-log/audit-log.types';
import { auditLogActions, auditLogEntityTypes } from '../audit-log/audit-log.constants';
import { AuthorizationContextLoader } from '../authorization/authorization-context.loader';
import { addTicketParticipant } from './add-ticket-participant';
import type {
  AddTicketParticipantInput,
  CreateTicketMessageInput,
  TicketActorAccess,
  TicketMessageResponse,
  TicketParticipantResponse,
  TicketPersistedMessageSink,
} from './collaboration.types';
import { createTicketMessage } from './create-ticket-message';
import { executeTicketOperation } from './execute-ticket-operation';
import {
  listTicketMessages,
  type ListTicketMessagesOptions,
} from './list-ticket-messages';
import { listTicketParticipants } from './list-ticket-participants';
import { loadAccessibleTicket } from './load-accessible-ticket';
import { publishForTicketId } from './publish-for-ticket-id';
import { copyMessageToMergedTickets } from './merge/copy-message-to-merged-tickets';
import { publishPersistedTicketMessages } from './publish-persisted-ticket-messages';
import { removeTicketParticipant } from './remove-ticket-participant';
import { TicketCollaborationConfigurationLoader } from './ticket-collaboration-configuration.loader';
import { TicketRedactionConfigurationLoader } from './redaction/ticket-redaction-configuration.loader';
import { TicketAccessPolicyBinder } from './ticket-access-policy-binder';
import type { TicketAccessPolicyContext } from './with-ticket-access-policies';
import { TicketRealtimeHub } from './ticket-realtime.hub';
import { toTicketMessageResponse } from './to-collaboration-response';
import type { TicketMutationContext } from './tickets.types';
import { resumeWaitingForUserOnReply } from './waiting-for-user/resume-waiting-for-user-on-reply';
import { applyTicketSlaTimers } from './apply-ticket-sla-timers';
import { WaitingForUserConfigurationLoader } from './waiting-for-user/waiting-for-user-configuration.loader';
import { recordRedactionWarning } from './redaction/record-redaction-warning';
import { TicketsAgentCollaborationService } from './collaboration-extras/tickets-agent-collaboration.service';

@Injectable()
export class TicketsCollaborationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorizationContextLoader: AuthorizationContextLoader,
    private readonly configurationLoader: TicketCollaborationConfigurationLoader,
    private readonly waitingForUserConfigurationLoader: WaitingForUserConfigurationLoader,
    private readonly redactionConfigurationLoader: TicketRedactionConfigurationLoader,
    private readonly accessPolicies: TicketAccessPolicyBinder,
    private readonly realtimeHub: TicketRealtimeHub,
    // Paket 2.4: absent in the worker (inbound e-mail replies carry no @mentions).
    @Optional() private readonly agentCollaboration?: TicketsAgentCollaborationService,
  ) {
    this.idempotency = new RequestIdempotencyService(prisma);
    this.outbox = new TransactionalOutboxService(prisma);
  }

  private readonly idempotency: RequestIdempotencyService;
  private readonly outbox: TransactionalOutboxService;

  listParticipants(ticketId: string, context: TicketMutationContext) {
    return executeTicketOperation(async () =>
      listTicketParticipants(
        this.prisma,
        this.authorizationContextLoader,
        ticketId,
        await this.accessPolicies.bind(context),
      ),
    );
  }

  addParticipant(
    ticketId: string,
    input: AddTicketParticipantInput,
    context: TicketMutationContext,
  ): Promise<TicketParticipantResponse> {
    return executeTicketOperation(async () => {
      const result = await addTicketParticipant(
        this.prisma,
        this.authorizationContextLoader,
        await this.configurationLoader.load(),
        ticketId,
        input,
        await this.accessPolicies.bind(context),
      );
      await publishForTicketId(
        this.prisma,
        this.realtimeHub,
        ticketId,
        result.messages,
      );
      return result.participant;
    });
  }

  removeParticipant(
    ticketId: string,
    participantId: string,
    context: TicketMutationContext,
  ): Promise<void> {
    return executeTicketOperation(async () => {
      const messages = await removeTicketParticipant(
        this.prisma,
        this.authorizationContextLoader,
        await this.configurationLoader.load(),
        ticketId,
        participantId,
        await this.accessPolicies.bind(context),
      );
      await publishForTicketId(
        this.prisma,
        this.realtimeHub,
        ticketId,
        messages,
      );
    });
  }

  listMessages(
    ticketId: string,
    context: TicketMutationContext,
    options: ListTicketMessagesOptions = {},
  ) {
    return executeTicketOperation(async () =>
      listTicketMessages(
        this.prisma,
        this.authorizationContextLoader,
        ticketId,
        await this.accessPolicies.bind(context),
        options,
      ),
    );
  }

  createMessage(
    ticketId: string,
    input: CreateTicketMessageInput,
    context: TicketMutationContext,
  ): Promise<TicketMessageResponse> {
    return executeTicketOperation(async () => {
      const gated = await this.accessPolicies.bind(context);
      if (input.idempotencyKey === undefined) {
        return this.createMessageLegacy(ticketId, input, context, gated);
      }
      const configuration = await this.configurationLoader.load();
      const redaction = await this.redactionConfigurationLoader.load();
      const waiting = await this.waitingForUserConfigurationLoader.load();
      const idempotencyKey = input.idempotencyKey ?? randomUUID();
      const committed: { value: { ticket: Parameters<typeof publishPersistedTicketMessages>[1]; messages: TicketPersistedMessageSink; messageType: string } | null } = { value: null };
      const result = await this.idempotency.execute({
        namespace: `ticket.message.${ticketId}`,
        key: idempotencyKey,
        request: { ticketId, actorUserId: context.actorUserId, type: input.type, body: input.body,
          alsoToMerged: input.alsoToMerged ?? false, responseTemplateId: input.responseTemplateId ?? null },
        operation: async (transaction) => {
          const { ticket, message, scan, mentionUserIds } = await createTicketMessage(
            transaction as never, this.authorizationContextLoader, configuration, ticketId,
            { ...input, idempotencyKey }, gated, redaction,
            this.agentCollaboration === undefined ? undefined
              : (loaded, body) => this.agentCollaboration!.prepareNoteMentions(loaded, body, gated),
          );
          if (mentionUserIds.length > 0) {
            await transaction.ticketMessageMention.createMany({
              data: mentionUserIds.map((userId) => ({ messageId: message.id, ticketId: message.ticketId, userId })),
              skipDuplicates: true,
            });
          }
          const messages: TicketPersistedMessageSink = [message];
          if (scan.matches.length > 0) {
            await recordRedactionWarning({ prisma: transaction as never, ticketId,
              actorUserId: context.actorUserId, scan, messages });
          }
          const resumed = await resumeWaitingForUserOnReply({
            prisma: transaction as never, ticket, message, configuration: waiting,
            context: gated, messages, applySla: false,
          });
          if (message.type === 'AGENT_REPLY' && input.alsoToMerged === true) {
            await copyMessageToMergedTickets({ prisma: transaction as never, parent: resumed, message, messages });
          }
          await recordAuditEntry(transaction as unknown as AuditLogTransactionalClient, {
            action: auditLogActions.ticketMessageCreated,
            entityType: auditLogEntityTypes.ticket,
            entityId: ticket.id,
            organizationalUnitId: ticket.originUnitId,
            actorUserId: context.actorUserId,
            metadata: { idempotencyKey, messageId: message.id, messageType: message.type, source: message.source ?? 'APP' },
          });
          await this.outbox.enqueue(transaction, {
            topic: 'ticket.message.effects', dedupeKey: message.id,
            payload: { ticketId: ticket.id, messageId: message.id, messageType: message.type,
              actorUserId: context.actorUserId, waitingResumed: resumed.status !== ticket.status },
          });
          const response = toTicketMessageResponse(message, scan.matches);
          committed.value = { ticket: resumed, messages, messageType: message.type };
          return { statusCode: 201, body: response as never };
        },
      });
      if (!result.replayed && committed.value !== null) {
        publishPersistedTicketMessages(this.realtimeHub, committed.value.ticket, committed.value.messages);
        if (committed.value.messageType === 'AGENT_REPLY') {
          await applyTicketSlaTimers(gated, { ticket: committed.value.ticket, event: 'agent_replied' }).catch(() => undefined);
        }
      }
      return result.body as unknown as TicketMessageResponse;
    });
  }

  private async createMessageLegacy(
    ticketId: string,
    input: CreateTicketMessageInput,
    context: TicketMutationContext,
    gated: TicketAccessPolicyContext,
  ): Promise<TicketMessageResponse> {
    const { ticket, message, scan, mentionUserIds } = await createTicketMessage(
      this.prisma, this.authorizationContextLoader, await this.configurationLoader.load(), ticketId,
      input, gated, await this.redactionConfigurationLoader.load(),
      this.agentCollaboration === undefined ? undefined
        : (loaded, body) => this.agentCollaboration!.prepareNoteMentions(loaded, body, gated),
    );
    if (this.agentCollaboration !== undefined) {
      await this.agentCollaboration.recordNoteMentions(message, mentionUserIds);
      if (message.type === 'AGENT_REPLY' || message.type === 'INTERNAL_NOTE') {
        await this.agentCollaboration.followOnReply(ticket, context.actorUserId);
      }
    }
    const messages: TicketPersistedMessageSink = [message];
    if (scan.matches.length > 0) {
      await recordRedactionWarning({ prisma: this.prisma, ticketId, actorUserId: context.actorUserId, scan, messages });
    }
    const resumed = await resumeWaitingForUserOnReply({
      prisma: this.prisma, ticket, message,
      configuration: await this.waitingForUserConfigurationLoader.load(), context: gated, messages,
    });
    if (message.type === 'AGENT_REPLY') {
      await applyTicketSlaTimers(gated, { ticket: resumed, event: 'agent_replied' });
      if (input.alsoToMerged === true) {
        await copyMessageToMergedTickets({ prisma: this.prisma, parent: resumed, message, messages });
      }
    }
    publishPersistedTicketMessages(this.realtimeHub, resumed, messages);
    return toTicketMessageResponse(message, scan.matches);
  }

  authorizeSocketJoin(
    ticketId: string,
    context: TicketMutationContext,
  ): Promise<TicketActorAccess> {
    return executeTicketOperation(async () => {
      const loaded = await loadAccessibleTicket(
        this.prisma,
        this.authorizationContextLoader,
        ticketId,
        await this.accessPolicies.bind(context),
      );
      return loaded.access;
    });
  }
}
