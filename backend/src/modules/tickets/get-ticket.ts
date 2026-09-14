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
    assertTicketVisible({
      context: authContext,
      requesterId: ticket.requesterId,
      originUnitId: ticket.originUnitId,
      originUnitPath,
      serviceId: ticket.serviceId,
    });
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
