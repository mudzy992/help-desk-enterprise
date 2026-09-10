import { PrismaService } from '../../common/prisma/prisma.service';
import { loadOrganizationalUnit } from './load-organizational-unit';
import { organizationalUnitUserSelect } from './organizational-unit-user-select';
import type { OrganizationalUnitDetailResponse } from './organizational-unit.types';
import { toOrganizationalUnitResponse } from './to-organizational-unit-response';
import { toOrganizationalUnitUserResponse } from './to-organizational-unit-user-response';

export async function getOrganizationalUnit(
  prisma: PrismaService,
  organizationalUnitId: string,
): Promise<OrganizationalUnitDetailResponse> {
  const record = await loadOrganizationalUnit(prisma, organizationalUnitId);
  const [children, users] = await Promise.all([
    prisma.organizationalUnit.findMany({
      where: { parentId: organizationalUnitId },
      orderBy: { name: 'asc' },
    }),
    prisma.user.findMany({
      where: { organizationalUnitId },
      select: organizationalUnitUserSelect,
      orderBy: { displayName: 'asc' },
    }),
  ]);
  return {
    ...toOrganizationalUnitResponse(record),
    children: children.map(toOrganizationalUnitResponse),
    users: users.map(toOrganizationalUnitUserResponse),
  };
}
