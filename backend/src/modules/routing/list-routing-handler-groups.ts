import { PrismaService } from '../../common/prisma/prisma.service';
import type { AuthorizationContext } from '../authorization/authorization.types';
import { isRoutingTargetGroupEligible } from './routing-access-filter';
import type { RoutingHandlerGroupResponse } from './routing.types';

export async function listRoutingHandlerGroups(
  prisma: PrismaService,
  viewer: AuthorizationContext | null,
): Promise<readonly RoutingHandlerGroupResponse[]> {
  const groups = await prisma.group.findMany({
    select: {
      id: true,
      name: true,
      organizationalUnit: { select: { ouPath: true } },
    },
    orderBy: { name: 'asc' },
  });
  return groups
    .filter((group) =>
      isRoutingTargetGroupEligible(
        group.organizationalUnit.ouPath,
        null,
        viewer,
      ),
    )
    .map(({ id, name }) => ({ id, name }))
    .sort((left, right) => left.name.localeCompare(right.name));
}
