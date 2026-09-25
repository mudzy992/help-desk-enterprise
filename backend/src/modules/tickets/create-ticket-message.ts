import { PrismaService } from '../../common/prisma/prisma.service';
import { AuthorizationContextLoader } from '../authorization/authorization-context.loader';
import type {
  CreateTicketMessageInput,
  TicketCollaborationConfiguration,
  TicketMessageRecord,
} from './collaboration.types';
import { loadAccessibleTicket } from './load-accessible-ticket';
import { assertTicketNotMerged } from './merge/assert-ticket-editable';
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
    { writable: true },
  );
  // Package 1.2 (M7): a merged child is answered on its parent.
  assertTicketNotMerged(ticket);
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
  const responseTemplateId = await countTemplateUse(
    prisma,
    input.responseTemplateId,
    context.actorUserId,
  );
  const message = (await prisma.ticketMessage.create({
    data: {
      ticketId: ticket.id,
      type: normalized.type,
      body: normalized.body,
      authorUserId: context.actorUserId,
      ...(responseTemplateId === null ? {} : { responseTemplateId }),
    },
  })) as TicketMessageRecord;
  return { ticket, message, scan };
}

/**
 * Package 1.4 (T4): counts a use of a shared or own template when the reply
 * is sent. An unknown, deleted or foreign template is ignored: statistics must
 * never stop a reply from going out.
 */
async function countTemplateUse(
  prisma: PrismaService,
  templateId: string | undefined,
  actorUserId: string,
): Promise<string | null> {
  const id = templateId?.trim() ?? '';
  if (id.length === 0) {
    return null;
  }
  try {
    const updated = await prisma.responseTemplate.updateMany({
      where: {
        id,
        deletedAt: null,
        OR: [{ ownerUserId: null }, { ownerUserId: actorUserId }],
      },
      data: { usageCount: { increment: 1 }, lastUsedAt: new Date() },
    });
    return updated.count > 0 ? id : null;
  } catch {
    return null;
  }
}
