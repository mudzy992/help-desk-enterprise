import { PrismaService } from '../../common/prisma/prisma.service';
import type { GroupListItemResponse, ListGroupsQuery } from './groups.types';
import { toGroupListItemResponse } from './to-group-response';

const listSelect = {
  id: true,
  name: true,
  key: true,
  organizationalUnitId: true,
  isFallback: true,
  createdAt: true,
  updatedAt: true,
  organizationalUnit: { select: { ouPath: true } },
  members: {
    select: { id: true },
    take: 0,
  },
  _count: { select: { members: true } },
} as const;

export async function listGroups(
  prisma: PrismaService,
  query: ListGroupsQuery = {},
): Promise<readonly GroupListItemResponse[]> {
  const groups = await prisma.group.findMany({
    where:
      query.organizationalUnitId === undefined
        ? undefined
        : { organizationalUnitId: query.organizationalUnitId },
    select: listSelect,
    orderBy: [{ organizationalUnit: { ouPath: 'asc' } }, { name: 'asc' }],
  });
  return groups
    .map((group) => toGroupListItemResponse(group))
    .sort((left, right) => {
      const pathCompare = left.organizationalUnitPath.localeCompare(
        right.organizationalUnitPath,
      );
      return pathCompare !== 0 ? pathCompare : left.name.localeCompare(right.name);
    });
}
