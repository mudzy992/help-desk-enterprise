import { PrismaService } from '../../common/prisma/prisma.service';
import { OrganizationalUnitError } from './organizational-unit.error';

export async function deleteOrganizationalUnit(
  prisma: PrismaService,
  organizationalUnitId: string,
): Promise<void> {
  const record = await prisma.organizationalUnit.findUnique({
    where: { id: organizationalUnitId },
    include: {
      _count: {
        select: { children: true, users: true },
      },
    },
  });
  if (record === null) {
    throw new OrganizationalUnitError('NOT_FOUND');
  }
  if (record._count.children > 0) {
    throw new OrganizationalUnitError('HAS_CHILDREN');
  }
  if (record._count.users > 0) {
    throw new OrganizationalUnitError('HAS_MAPPED_USERS');
  }
  await prisma.organizationalUnit.delete({
    where: { id: organizationalUnitId },
  });
}
