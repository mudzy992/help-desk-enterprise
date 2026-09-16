import { PrismaService } from '../../common/prisma/prisma.service';
import { closedGroupTicketStatuses } from './groups.constants';
import { GroupsError } from './groups.error';
import type { LoadedGroupRecord } from './load-group-record';

export async function assertGroupDeletable(
  prisma: PrismaService,
  group: LoadedGroupRecord,
): Promise<void> {
  if (group.isFallback) {
    const fallbackCount = await prisma.group.count({
      where: {
        organizationalUnitId: group.organizationalUnitId,
        isFallback: true,
      },
    });
    if (fallbackCount <= 1) {
      throw new GroupsError('SOLE_FALLBACK_GROUP');
    }
  }
  const activeTicketCount = await prisma.ticket.count({
    where: {
      assignedGroupId: group.id,
      status: { notIn: [...closedGroupTicketStatuses] },
    },
  });
  if (activeTicketCount > 0) {
    throw new GroupsError('HAS_ACTIVE_TICKETS');
  }
}
