import type { MessageType } from '../../generated/prisma/enums';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuthorizationContextLoader } from '../authorization/authorization-context.loader';
import {
  assertResponseTemplateUsable,
  templateKindForMessageType,
} from '../templates/assert-response-template-usable';
import { TemplatesError } from '../templates/templates.error';
import { TicketsError } from './tickets.error';
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
  /** Paket 2.4: validates/rewrites the @mentions of an internal note before it is stored. */
  prepareNoteMentions?: (
    ticket: TicketRecord,
    body: string,
  ) => Promise<{ readonly body: string; readonly userIds: readonly string[] }>,
): Promise<{
  ticket: TicketRecord;
  message: TicketMessageRecord;
  scan: RedactionScanResult;
  mentionUserIds: readonly string[];
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
  const normalizedInput = normalizeTicketMessageInput(input, access, configuration);
  const mentions =
    normalizedInput.type === 'INTERNAL_NOTE' && prepareNoteMentions !== undefined
      ? await prepareNoteMentions(ticket, normalizedInput.body)
      : { body: normalizedInput.body, userIds: [] as readonly string[] };
  const normalized = { ...normalizedInput, body: mentions.body };
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
  // Val 2 (M13/B1): the id used to be trusted for statistics only, so a
  // deactivated template — or an `INTERNAL` one in a public reply — went out as
  // a normal message. The template must now exist, be active and fit the
  // message type; only after that does it count as a use.
  const responseTemplateId = await countTemplateUse(
    prisma,
    await assertTemplateUsableForMessage(
      prisma,
      input.responseTemplateId,
      context.actorUserId,
      normalized.type,
    ),
    context.actorUserId,
  );
  const message = (await prisma.ticketMessage.create({
    data: {
      ticketId: ticket.id,
      type: normalized.type,
      body: normalized.body,
      authorUserId: context.actorUserId,
      ...(context.messageSource === 'EMAIL' || context.messageSource === 'TEAMS' ? { source: context.messageSource } : {}),
      ...(responseTemplateId === null ? {} : { responseTemplateId }),
    },
  })) as TicketMessageRecord;
  // Val 2 (M10/B4): `firstResponseAt` used to be written only by the SLA module
  // (after its clock recorded a response), so with SLA disabled — or without a
  // profile/rule/calendar — the "first response" metric stayed empty although
  // agents had replied. The first agent reply now records it here, regardless
  // of SLA; the SLA module keeps its own (idempotent) write.
  const withFirstResponse =
    normalized.type === 'AGENT_REPLY' && ticket.firstResponseAt === null
      ? ((await prisma.ticket.update({
          where: { id: ticket.id },
          data: { firstResponseAt: new Date() },
        })) as TicketRecord)
      : ticket;
  return {
    ticket: withFirstResponse,
    message,
    scan,
    mentionUserIds: mentions.userIds,
  };
}

/**
 * Val 2 (M13/B1): template errors are raised by the templates module; the
 * ticket path maps them onto its own codes so the API answer stays in the
 * ticket error contract (400/404 with a code the UI already knows how to show).
 */
async function assertTemplateUsableForMessage(
  prisma: PrismaService,
  templateId: string | undefined,
  actorUserId: string,
  messageType: MessageType,
): Promise<string | undefined> {
  try {
    const template = await assertResponseTemplateUsable(prisma, {
      templateId,
      actorUserId,
      kind: templateKindForMessageType(messageType),
    });
    return template?.id;
  } catch (error) {
    if (!(error instanceof TemplatesError)) {
      throw error;
    }
    if (error.code === 'TEMPLATE_NOT_FOUND') {
      throw new TicketsError('RESPONSE_TEMPLATE_NOT_FOUND');
    }
    if (error.code === 'TEMPLATE_INACTIVE') {
      throw new TicketsError('RESPONSE_TEMPLATE_INACTIVE', undefined, error.details);
    }
    if (error.code === 'TEMPLATE_KIND_MISMATCH') {
      throw new TicketsError(
        'RESPONSE_TEMPLATE_KIND_MISMATCH',
        undefined,
        error.details,
      );
    }
    throw error;
  }
}

/**
 * Package 1.4 (T4): counts a use of a shared or own template when the reply
 * is sent. The template was validated just before, so a failure here can only
 * be a storage hiccup: statistics must never stop a reply from going out.
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
