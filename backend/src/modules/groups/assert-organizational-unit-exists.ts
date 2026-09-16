import { PrismaService } from '../../common/prisma/prisma.service';
import { GroupsError } from './groups.error';

export async function assertOrganizationalUnitExists(
  prisma: PrismaService,
  organizationalUnitId: string,
): Promise<{ readonly id: string; readonly ouPath: string }> {
  const unit = await prisma.organizationalUnit.findUnique({
    where: { id: organizationalUnitId },
    select: { id: true, ouPath: true },
  });
  if (unit === null) {
    throw new GroupsError('ORGANIZATIONAL_UNIT_NOT_FOUND');
  }
  return unit;
}
