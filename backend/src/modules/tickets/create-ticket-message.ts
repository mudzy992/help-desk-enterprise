import { PrismaService } from '../../common/prisma/prisma.service';
import { AuthorizationContextLoader } from '../authorization/authorization-context.loader';
import type {
  CreateTicketMessageInput,
  TicketCollaborationConfiguration,
  TicketMessageRecord,
} from './collaboration.types';
import { loadAccessibleTicket } from './load-accessible-ticket';
import { normalizeTicketMessageInput } from './normalize-ticket-message-input';
import {
  assertRedactionAllowed,
  scanTicketContent,
} from './redaction/assert-ticket-content-redaction';
import type { TicketRedactionConfiguration } from './redaction/redaction.types';
import type { RedactionScanResult } from './redaction/redaction.types';
import type { TicketMutationContext, TicketRecord } from './tickets.types';

export async function createTicketMessage(
  prisma: PrismaService,
  authorizationContextLoader: AuthorizationContextLoader,
  configuration: TicketCollaborationConfiguration,
  ticketId: string,
  input: CreateTicketMessageInput,
  context: TicketMutationContext,
  redaction?: TicketRedactionConfiguration,
): Promise<{
  ticket: TicketRecord;
  message: TicketMessageRecord;
  scan: RedactionScanResult;
}> {
  const { ticket, access } = await loadAccessibleTicket(
    prisma,
    authorizationContextLoader,
    ticketId,
    context,
  );
  const normalized = normalizeTicketMessageInput(input, access, configuration);
  const scan = scanTicketContent({
    configuration: redaction ?? {
      enabled: false,
      mode: 'warn_only',
      applyToFields: [],
      patterns: [],
    },
    message: normalized.body,
  });
  assertRedactionAllowed(scan);
  const message = (await prisma.ticketMessage.create({
    data: {
      ticketId: ticket.id,
      type: normalized.type,
      body: normalized.body,
      authorUserId: context.actorUserId,
    },
  })) as TicketMessageRecord;
  return { ticket, message, scan };
}
