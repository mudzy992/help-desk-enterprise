import { PrismaService } from '../../common/prisma/prisma.service';
import { assembleOrganizationalUnitTree } from './assemble-organizational-unit-tree';
import type { OrganizationalUnitTreeNodeResponse } from './organizational-unit.types';

export async function getOrganizationalUnitTree(
  prisma: PrismaService,
): Promise<readonly OrganizationalUnitTreeNodeResponse[]> {
  const records = await prisma.organizationalUnit.findMany({
    orderBy: [{ ouPath: 'asc' }, { name: 'asc' }],
  });
  return assembleOrganizationalUnitTree(records);
}
