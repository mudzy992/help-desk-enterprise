import { PrismaService } from '../../../common/prisma/prisma.service';
import { AuthorizationContextLoader } from '../../authorization/authorization-context.loader';
import { loadOrganizationalUnitPath } from '../../authorization/load-authorization-scope';
import { loadAccessibleTicket } from '../load-accessible-ticket';
import { TicketsError } from '../tickets.error';
import type { TicketMutationContext } from '../tickets.types';
import type {
  TicketCandidatesResponse,
  TicketPersonRef,
} from './context.types';

export const ticketCandidateLimit = 500;

/**
 * People a staff member can pick when assigning a ticket or adding a
 * participant. Replaces the admin-only organizational-unit user directory:
 * assignees are members of the ticket's handler group, watchers are active
 * users of the ticket's origin unit and its sub-units.
 */
export async function loadTicketCandidates(
  prisma: PrismaService,
  authorizationContextLoader: AuthorizationContextLoader,
  ticketId: string,
  context: TicketMutationContext,
): Promise<TicketCandidatesResponse> {
  const { ticket, access } = await loadAccessibleTicket(
    prisma,
    authorizationContextLoader,
    ticketId,
    context,
  );
  if (access.visibility !== 'staff') {
    throw new TicketsError('FORBIDDEN');
  }
  const originUnitPath = await loadOrganizationalUnitPath(
    prisma,
    ticket.originUnitId,
  );
  if (originUnitPath === null) {
    throw new TicketsError('ORIGIN_UNIT_NOT_FOUND');
  }
  const memberRows =
    ticket.assignedGroupId === null
      ? []
      : await prisma.groupMember.findMany({
          where: { groupId: ticket.assignedGroupId },
          select: { userId: true },
        });
  const memberIds = memberRows.map((row) => row.userId);
  const [assignees, watchers] = await Promise.all([
    memberIds.length === 0
      ? Promise.resolve([] as TicketPersonRef[])
      : (prisma.user.findMany({
          where: { id: { in: memberIds }, isActive: true },
          select: { id: true, displayName: true },
          orderBy: { displayName: 'asc' },
          take: ticketCandidateLimit,
        }) as Promise<TicketPersonRef[]>),
    prisma.user.findMany({
      where: {
        isActive: true,
        organizationalUnit: {
          OR: [
            { ouPath: originUnitPath },
            { ouPath: { startsWith: `${originUnitPath}/` } },
          ],
        },
      },
      select: { id: true, displayName: true },
      orderBy: { displayName: 'asc' },
      take: ticketCandidateLimit,
    }) as Promise<TicketPersonRef[]>,
  ]);
  const toRef = (row: TicketPersonRef): TicketPersonRef => ({
    id: row.id,
    displayName: row.displayName,
  });
  return { assignees: assignees.map(toRef), watchers: watchers.map(toRef) };
}
