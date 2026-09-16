import type { PrismaService } from '../../common/prisma/prisma.service';
import { UsersError } from './users.error';

const closedTicketStatuses = ['RESOLVED', 'CLOSED', 'ARCHIVED'] as const;

export async function deleteUser(
  prisma: PrismaService,
  userId: string,
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
}
