import { PrismaService } from '../../common/prisma/prisma.service';
import type { TicketStatus } from '../../generated/prisma/enums';
import { TicketsError } from './tickets.error';

export async function resolveCreateTicketHandlerGroup(
  prisma: PrismaService,
  routing: {
    readonly status: TicketStatus;
    readonly assignedGroupId: string | null;
  },
  assignedGroupId: string | undefined,
): Promise<{
  readonly status: TicketStatus;
  readonly assignedGroupId: string | null;
}> {
  if (assignedGroupId === undefined) {
    return routing;
  }
  const groupId = assignedGroupId.trim();
  if (groupId.length === 0) {
    throw new TicketsError('HANDLER_GROUP_NOT_FOUND');
  }
  const group = await prisma.group.findUnique({
    where: { id: groupId },
    select: { id: true },
  });
  if (group === null) {
    throw new TicketsError('HANDLER_GROUP_NOT_FOUND');
  }
  return { status: 'PENDING', assignedGroupId: group.id };
}
