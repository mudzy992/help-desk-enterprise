import { Inject, Injectable, Optional } from '@nestjs/common';
import { RequestIdempotencyService } from '../../../common/idempotency/request-idempotency.service';
import { DiskStagedStorageAdapter } from '../../../common/storage-write/disk-staged-storage.adapter';
import { TICKET_ATTACHMENT_STORAGE } from '../attachments/attachment-storage.token';
import type { TicketAttachmentStorage } from '../attachments/attachments.types';
import { resolveUploadRoot } from '../attachments/resolve-upload-root';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { AuthorizationContextLoader } from '../../authorization/authorization-context.loader';
import { RoutingService } from '../../routing/routing.service';
import { TicketApprovalsConfigurationLoader } from '../approvals/ticket-approvals-configuration.loader';
import { TicketAssignmentService } from '../assignment/ticket-assignment.service';
import type { TicketPersistedMessageSink } from '../collaboration.types';
import { executeTicketOperation } from '../execute-ticket-operation';
import { publishPersistedTicketMessages } from '../publish-persisted-ticket-messages';
import { TicketReopenConfigurationLoader } from '../reopen/ticket-reopen-configuration.loader';
import { TicketAccessPolicyBinder } from '../ticket-access-policy-binder';
import { TicketRealtimeHub } from '../ticket-realtime.hub';
import { toSingleTicketClientResponse } from '../to-ticket-client-responses';
import { TicketCloseCodesConfigurationLoader } from '../close-codes/ticket-close-codes-configuration.loader';
import type { TicketMutationContext } from '../tickets.types';
import { splitTicket } from './split-ticket';
import type { SplitTicketInput, SplitTicketResult } from './split.types';
import { TicketSplitConfigurationLoader } from './ticket-split-configuration.loader';
import { ServiceFormsConfigurationLoader } from '../../service-catalog/service-forms-configuration.loader';
import { defaultServiceFormsConfiguration } from '../../service-catalog/service-forms.constants';

@Injectable()
export class TicketsSplitService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly routingService: RoutingService,
    private readonly authorizationContextLoader: AuthorizationContextLoader,
    private readonly approvalsConfigurationLoader: TicketApprovalsConfigurationLoader,
    private readonly splitConfigurationLoader: TicketSplitConfigurationLoader,
    private readonly reopenConfigurationLoader: TicketReopenConfigurationLoader,
    private readonly closeCodesConfigurationLoader: TicketCloseCodesConfigurationLoader,
    private readonly ticketAssignmentService: TicketAssignmentService,
    private readonly accessPolicies: TicketAccessPolicyBinder,
    private readonly realtimeHub: TicketRealtimeHub,
    @Optional()
    private readonly serviceFormsConfigurationLoader?: ServiceFormsConfigurationLoader,
    @Optional() @Inject(TICKET_ATTACHMENT_STORAGE)
    private readonly attachmentStorage?: TicketAttachmentStorage,
  ) {}

  split(
    ticketId: string,
    input: SplitTicketInput,
    context: TicketMutationContext,
  ): Promise<SplitTicketResult> {
    return executeTicketOperation(async () => {
      const gated = await this.accessPolicies.bind(context);
      const configuration = await this.splitConfigurationLoader.load();
      const formsConfiguration =
        (await this.serviceFormsConfigurationLoader?.load()) ??
        defaultServiceFormsConfiguration;
      const reopen = await this.reopenConfigurationLoader.load();
      const closeCodes = await this.closeCodesConfigurationLoader.load();
      const messages: TicketPersistedMessageSink = [];
      const copiesAttachments = input.children.some((child) => (child.attachmentIds?.length ?? 0) > 0 && child.moveAttachments !== true);
      if (copiesAttachments && this.attachmentStorage === undefined) {
        throw new Error('TICKET_SPLIT_STORAGE_DEPENDENCIES_MISSING');
      }
      const adapter = new DiskStagedStorageAdapter(resolveUploadRoot());
      const promotions: import('./split-storage-promotion').SplitStoragePromotion[] = [];
      const operationId = input.operationId;
      let identifiers: { parentId: string; childIds: string[] };
      let replayed = false;
      if (operationId === undefined) {
        const legacy = await splitTicket({
          prisma: this.prisma, attachmentStorage: this.attachmentStorage ?? unavailableAttachmentStorage,
          stagedStorage: adapter, promotions, routingService: this.routingService,
          authorizationContextLoader: this.authorizationContextLoader,
          approvalsConfigurationLoader: this.approvalsConfigurationLoader, configuration, formsConfiguration,
          ticketId, body: input, context: gated, messages,
        });
        const assigned = [];
        for (const child of legacy.children) assigned.push(await this.ticketAssignmentService.applyAfterCreate(child, gated, messages));
        identifiers = { parentId: legacy.parent.id, childIds: assigned.map((child) => child.id) };
      } else {
        const idempotency = new RequestIdempotencyService(this.prisma);
        try {
          const command = await idempotency.execute({
            namespace: `ticket.split.${ticketId}`,
            key: operationId,
            request: { ticketId, actorUserId: gated.actorUserId, reason: input.reason ?? null, children: input.children } as never,
            operation: async (transaction) => {
              const result = await splitTicket({
                prisma: transaction as never, attachmentStorage: this.attachmentStorage ?? unavailableAttachmentStorage,
                stagedStorage: adapter, promotions, routingService: this.routingService,
                authorizationContextLoader: this.authorizationContextLoader,
                approvalsConfigurationLoader: this.approvalsConfigurationLoader, configuration, formsConfiguration,
                ticketId, body: input, context: gated, messages,
              });
              const childIds: string[] = [];
              for (const child of result.children) {
                const assigned = await this.ticketAssignmentService.applyAfterCreate(child, gated, messages, transaction as never);
                childIds.push(assigned.id);
              }
              return { statusCode: 201, body: { parentId: result.parent.id, childIds } };
            },
          });
          identifiers = command.body as { parentId: string; childIds: string[] };
          replayed = command.replayed;
        } catch (error) {
          await Promise.allSettled(promotions.map((promotion) => adapter.remove(promotion.stagingKey)));
          throw error;
        }
      }
      if (!replayed) {
        for (const promotion of promotions) {
          try {
            await adapter.promote(promotion.stagingKey, promotion.finalKey);
            await this.prisma.storageWriteIntent.updateMany({ where: { id: promotion.intentId, status: 'PENDING_PROMOTION' },
              data: { status: 'READY', readyAt: new Date() } });
          } catch { /* durable worker reconciliation owns retry */ }
        }
      }
      const parent = await this.prisma.ticket.findUniqueOrThrow({ where: { id: identifiers.parentId } }) as never;
      const persistedChildren = await this.prisma.ticket.findMany({ where: { id: { in: identifiers.childIds } } }) as never[];
      const children = [];
      for (const child of persistedChildren) {
        if (!replayed) publishPersistedTicketMessages(this.realtimeHub, child, messages);
        children.push(await toSingleTicketClientResponse(this.prisma, child, { reopen, closeCodes }));
      }
      if (!replayed) publishPersistedTicketMessages(this.realtimeHub, parent, messages);
      return {
        parent: await toSingleTicketClientResponse(this.prisma, parent, { reopen, closeCodes }),
        children,
      };
    });
  }
}

const unavailableAttachmentStorage: TicketAttachmentStorage = {
  write: async () => { throw new Error('TICKET_ATTACHMENT_STORAGE_UNAVAILABLE'); },
  read: async () => { throw new Error('TICKET_ATTACHMENT_STORAGE_UNAVAILABLE'); },
  remove: async () => { throw new Error('TICKET_ATTACHMENT_STORAGE_UNAVAILABLE'); },
};
