import { PrismaService } from '../../common/prisma/prisma.service';
import type { RoutingHandlerGroupResponse } from './routing.types';

export async function listRoutingHandlerGroups(
  prisma: PrismaService,
): Promise<readonly RoutingHandlerGroupResponse[]> {
  const groups = await prisma.group.findMany({
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  });
  return [...groups].sort((left, right) => left.name.localeCompare(right.name));
}
