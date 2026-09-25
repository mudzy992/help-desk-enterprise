import { PrismaService } from '../../common/prisma/prisma.service';
import { AuthorizationContextLoader } from '../authorization/authorization-context.loader';
import { loadOrganizationalUnitPath } from '../authorization/load-authorization-scope';
import { assertTicketVisible } from './authorize-ticket-actor';
import {
  assertConfidentialTicketAccess,
  resolveConfidentialTicketAccess,
} from './confidential/assert-confidential-ticket-access';
import { recordConfidentialAccessAudit } from './confidential/record-confidential-access-audit';
import { defaultTicketConfidentialConfiguration } from './confidential/confidential.constants';
import { loadTicketRecord } from './load-ticket-record';
import { TicketsError } from './tickets.error';
import type { TicketMutationContext, TicketRecord } from './tickets.types';

export async function getTicket(
  prisma: PrismaService,
  authorizationContextLoader: AuthorizationContextLoader,
  ticketId: string,
  context: TicketMutationContext,
  options: { readonly auditView?: boolean } = {},
): Promise<TicketRecord> {
  const authContext = await authorizationContextLoader.loadBySubjectId(
    context.actorUserId,
  );
  if (authContext === null) {
    throw new TicketsError('FORBIDDEN');
  }
  const ticket = await loadTicketRecord(prisma, ticketId);
  const originUnitPath = await loadOrganizationalUnitPath(
    prisma,
    ticket.originUnitId,
  );
  if (originUnitPath === null) {
    throw new TicketsError('ORIGIN_UNIT_NOT_FOUND');
  }
  const configuration =
    context.confidential ?? defaultTicketConfidentialConfiguration;
  try {
    await assertTicketVisibleOrMergedRequester(prisma, {
      context: authContext,
      requesterId: ticket.requesterId,
      originUnitId: ticket.originUnitId,
      originUnitPath,
      serviceId: ticket.serviceId,
      assignedGroupId: ticket.assignedGroupId,
    }, ticket.id);
    await assertConfidentialTicketAccess(prisma, {
      context: authContext,
      ticket,
      originUnitPath,
      configuration,
    });
  } catch (error) {
    if (
      error instanceof TicketsError &&
      ticket.isConfidential &&
      configuration.enabled &&
      (error.code === 'FORBIDDEN' || error.code === 'CONFIDENTIAL_ACCESS_DENIED')
    ) {
      await recordConfidentialAccessAudit(prisma, {
        ticketId: ticket.id,
        organizationalUnitId: ticket.originUnitId,
        actorUserId: context.actorUserId,
        result: 'denied',
        configuration,
        writeSystemEvent: false,
      });
    }
    throw error;
  }
  if (options.auditView === true && ticket.isConfidential && configuration.enabled) {
    const decision = await resolveConfidentialTicketAccess(prisma, {
      context: authContext,
      ticket,
      originUnitPath,
      configuration,
    });
    if (decision.allowed) {
      await recordConfidentialAccessAudit(prisma, {
        ticketId: ticket.id,
        organizationalUnitId: ticket.originUnitId,
        actorUserId: context.actorUserId,
        result: 'allowed',
        via: decision.via,
        configuration,
        writeSystemEvent: false,
      });
    }
  }
  return ticket;
}

/**
 * Package 1.2 (M2): the requester of a ticket merged into this one reads it
 * as a MERGED_REQUESTER participant (public messages only, enforced by
 * `resolveTicketActorAccess`). Edits still go through `assertTicketVisible`
 * in `updateTicket`, so read access never turns into write access.
 */
async function assertTicketVisibleOrMergedRequester(
  prisma: PrismaService,
  input: Parameters<typeof assertTicketVisible>[1],
  ticketId: string,
): Promise<void> {
  try {
    await assertTicketVisible(prisma, input);
  } catch (error) {
    if (!(error instanceof TicketsError) || error.code !== 'FORBIDDEN') {
      throw error;
    }
    const participant = await prisma.ticketParticipant.findFirst({
      where: {
        ticketId,
        userId: input.context.subjectId,
        role: 'MERGED_REQUESTER',
      },
      select: { id: true },
    });
    if (participant === null) {
      throw error;
    }
  }
}
