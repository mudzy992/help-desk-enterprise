import { PrismaService } from '../../common/prisma/prisma.service';
import { OrganizationalUnitError } from './organizational-unit.error';
import type { OrganizationalUnitRecord } from './organizational-unit.types';

export async function loadOrganizationalUnit(
  prisma: PrismaService,
  organizationalUnitId: string,
): Promise<OrganizationalUnitRecord> {
  const record = await prisma.organizationalUnit.findUnique({
    where: { id: organizationalUnitId },
  });
  if (record === null) {
    throw new OrganizationalUnitError('NOT_FOUND');
  }
  return record;
}
