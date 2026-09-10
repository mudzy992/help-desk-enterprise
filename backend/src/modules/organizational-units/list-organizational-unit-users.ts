import { PrismaService } from '../../common/prisma/prisma.service';
import { loadOrganizationalUnit } from './load-organizational-unit';
import { organizationalUnitUserSelect } from './organizational-unit-user-select';
import type { OrganizationalUnitUserResponse } from './organizational-unit.types';
import { toOrganizationalUnitUserResponse } from './to-organizational-unit-user-response';

export async function listOrganizationalUnitUsers(
  prisma: PrismaService,
  organizationalUnitId: string,
): Promise<readonly OrganizationalUnitUserResponse[]> {
  await loadOrganizationalUnit(prisma, organizationalUnitId);
  const users = await prisma.user.findMany({
    where: { organizationalUnitId },
    select: organizationalUnitUserSelect,
    orderBy: { displayName: 'asc' },
  });
  return users.map(toOrganizationalUnitUserResponse);
}
