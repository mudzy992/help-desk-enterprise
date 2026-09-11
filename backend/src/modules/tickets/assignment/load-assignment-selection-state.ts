import { PrismaService } from '../../../common/prisma/prisma.service';
import { assignmentBusyTicketStatuses } from './assignment.constants';

export async function loadBusyCountByUserId(
  prisma: PrismaService,
  eligibleUserIds: readonly string[],
): Promise<Record<string, number>> {
  const busyCountByUserId: Record<string, number> = {};
  for (const userId of eligibleUserIds) {
    busyCountByUserId[userId] = await prisma.ticket.count({
      where: {
        assignedUserId: userId,
        status: { in: [...assignmentBusyTicketStatuses] },
      },
    });
  }
  return busyCountByUserId;
}

export async function loadLastAssignedUserIdInGroup(
  prisma: PrismaService,
  groupId: string,
): Promise<string | null> {
  const lastAssigned = await prisma.ticket.findFirst({
    where: {
      assignedGroupId: groupId,
      assignedUserId: { not: null },
    },
    orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
    select: { assignedUserId: true },
  });
  return lastAssigned?.assignedUserId ?? null;
}
