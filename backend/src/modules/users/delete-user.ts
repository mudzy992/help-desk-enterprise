import type { PrismaService } from '../../common/prisma/prisma.service';
import type { PrincipalInvalidationHook } from './users.types';
import { UsersError } from './users.error';

const closedTicketStatuses = ['RESOLVED', 'CLOSED', 'ARCHIVED'] as const;

export async function deleteUser(
  prisma: PrismaService,
  userId: string,
  invalidatePrincipal: PrincipalInvalidationHook = async () => {},
): Promise<void> {
  const existing = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      _count: {
        select: {
          assignedTickets: {
            where: { status: { notIn: [...closedTicketStatuses] } },
          },
          requestedTickets: {
            where: { status: { notIn: [...closedTicketStatuses] } },
          },
        },
      },
    },
  });
  if (existing === null) {
    throw new UsersError('USER_NOT_FOUND');
  }
  if (
    existing._count.assignedTickets > 0 ||
    existing._count.requestedTickets > 0
  ) {
    throw new UsersError('HAS_OPEN_TICKETS');
  }
  try {
    await prisma.user.delete({ where: { id: userId } });
  } catch {
    throw new UsersError('DELETE_RESTRICTED');
  }
  // The row is gone, so the version can no longer be bumped (there is nothing to
  // increment). Deleting the pointer is what matters: a session token of a
  // deleted user must stop working now, not after the TTL. `invalidateUser`
  // logs "record not found" for the bump and drops the pointer regardless.
  await invalidatePrincipal(userId);
}
