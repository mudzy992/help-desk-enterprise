import { PrismaService } from '../../common/prisma/prisma.service';
import { AuthorizationContextLoader } from '../authorization/authorization-context.loader';
import { loadOrganizationalUnitPath } from '../authorization/load-authorization-scope';
import { resolveTicketActorAccess } from './resolve-ticket-actor-access';
import type { TicketActorAccess } from './collaboration.types';
import { loadTicketRecord } from './load-ticket-record';
import { TicketsError } from './tickets.error';
import type { TicketMutationContext, TicketRecord } from './tickets.types';
import { assertTicketWritable } from './archive/assert-ticket-writable';
import { assertProblemDelegation } from './problem-delegation';

export async function loadAccessibleTicket(
  prisma: PrismaService,
  authorizationContextLoader: AuthorizationContextLoader,
  ticketId: string,
  context: TicketMutationContext,
  options: { readonly writable?: boolean } = {},
): Promise<{ ticket: TicketRecord; access: TicketActorAccess }> {
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
  // Paket 3.3 / BA-problems-05: the problem resolution acts as staff only on
  // the non-confidential tickets still linked to that RESOLVED problem, and
  // only while the actor keeps the problem authority. Confidential tickets
  // fall back to their own access rules.
  const delegated = context.problemDelegation !== undefined && !ticket.isConfidential;
  if (delegated) {
    await assertProblemDelegation(prisma, {
      problemId: context.problemDelegation!.problemId,
      ticketId: ticket.id,
      actorUserId: context.actorUserId,
    });
  }
  const access: TicketActorAccess = delegated ? { visibility: 'staff' } : await resolveTicketActorAccess(prisma, {
    context: authContext,
    ticket,
    originUnitPath,
    confidential: context.confidential,
  });
  if (options.writable === true) {
    assertTicketWritable(ticket, context);
  }
  return { ticket, access };
}
