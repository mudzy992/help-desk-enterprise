import { PrismaService } from '../../../common/prisma/prisma.service';
import { AuthorizationContextLoader } from '../../authorization/authorization-context.loader';
import { changeLogActions } from '../../change-log/change-log.constants';
import { RoutingService } from '../../routing/routing.service';
import type { TicketApprovalsConfigurationLoader } from '../approvals/ticket-approvals-configuration.loader';
import { ticketSystemEventActions } from '../collaboration.constants';
import type { TicketPersistedMessageSink } from '../collaboration.types';
import { insertSystemTicketEvent } from '../insert-system-ticket-event';
import { loadAccessibleTicket } from '../load-accessible-ticket';
import { recordTicketChange } from '../record-ticket-change';
import { TicketsError } from '../tickets.error';
import { ticketChangeLogReasons } from '../tickets.constants';
import type { TicketMutationContext, TicketRecord } from '../tickets.types';
import { assertCanSplitTicket } from './assert-can-split-ticket';
import { copySplitMessages } from './copy-split-messages';
import { createSplitChildTicket } from './create-split-child-ticket';
import { normalizeSplitReason } from './normalize-split-reason';
import type { SplitTicketInput, TicketSplitConfiguration } from './split.types';
import { transferSplitAttachments } from './transfer-split-attachments';

export async function splitTicket(input: {
  readonly prisma: PrismaService;
  readonly routingService: RoutingService;
  readonly authorizationContextLoader: AuthorizationContextLoader;
  readonly approvalsConfigurationLoader: TicketApprovalsConfigurationLoader;
  readonly configuration: TicketSplitConfiguration;
  readonly ticketId: string;
  readonly body: SplitTicketInput;
  readonly context: TicketMutationContext;
  readonly messages: TicketPersistedMessageSink;
}): Promise<{ parent: TicketRecord; children: readonly TicketRecord[] }> {
  if (!input.configuration.enabled) {
    throw new TicketsError('SPLIT_DISABLED');
  }
  const loaded = await loadAccessibleTicket(
    input.prisma,
    input.authorizationContextLoader,
    input.ticketId,
    input.context,
  );
  const authContext = await input.authorizationContextLoader.loadBySubjectId(
    input.context.actorUserId,
  );
  if (authContext === null) {
    throw new TicketsError('FORBIDDEN');
  }
  assertCanSplitTicket({
    context: authContext,
    ticket: loaded.ticket,
    children: input.body.children,
  });
  const reason = normalizeSplitReason(input.body.reason, input.configuration);
  const children: TicketRecord[] = [];
  for (const childInput of input.body.children) {
    const child = await createSplitChildTicket({
      prisma: input.prisma,
      routingService: input.routingService,
      authorizationContextLoader: input.authorizationContextLoader,
      approvalsConfigurationLoader: input.approvalsConfigurationLoader,
      parent: loaded.ticket,
      child: childInput,
      context: input.context,
      messages: input.messages,
    });
    await copySplitMessages({
      prisma: input.prisma,
      parent: loaded.ticket,
      child,
      messageIds: childInput.messageIds,
      configuration: input.configuration,
      messages: input.messages,
    });
    await transferSplitAttachments({
      prisma: input.prisma,
      parent: loaded.ticket,
      child,
      request: childInput,
      configuration: input.configuration,
    });
    children.push(child);
  }
  const numbers = children.map((child) => child.ticketNumber).join(',');
  const action = `${ticketSystemEventActions.ticketSplit}:${reason ?? ''}:${numbers}`;
  input.messages.push(
    await insertSystemTicketEvent(input.prisma, {
      ticketId: loaded.ticket.id,
      action,
      actorUserId: input.context.actorUserId,
    }),
  );
  await recordTicketChange(input.prisma, {
    action: changeLogActions.update,
    reason: ticketChangeLogReasons.split,
    before: loaded.ticket,
    after: loaded.ticket,
    actorUserId: input.context.actorUserId,
  });
  return { parent: loaded.ticket, children };
}
