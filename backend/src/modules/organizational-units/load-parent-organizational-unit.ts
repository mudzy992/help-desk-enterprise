import { PrismaService } from '../../common/prisma/prisma.service';
import { OrganizationalUnitError } from './organizational-unit.error';
import type { OrganizationalUnitRecord } from './organizational-unit.types';

export async function loadParentOrganizationalUnit(
  prisma: PrismaService,
  parentId: string | null | undefined,
): Promise<OrganizationalUnitRecord | null> {
  if (parentId === undefined || parentId === null) {
    return null;
  }
  const parent = await prisma.organizationalUnit.findUnique({
    where: { id: parentId },
  });
  if (parent === null) {
    throw new OrganizationalUnitError('INVALID_PARENT');
  }
  return parent;
}
