import { PrismaService } from '../../common/prisma/prisma.service';
import { OrganizationalUnitError } from './organizational-unit.error';
import { wouldCreateCircularHierarchy } from './would-create-circular-hierarchy';

export async function assertParentChangeIsValid(
  prisma: PrismaService,
  input: {
    readonly organizationalUnitId: string;
    readonly nextParentId: string | null;
  },
): Promise<void> {
  if (input.nextParentId === input.organizationalUnitId) {
    throw new OrganizationalUnitError('SELF_PARENT');
  }
  const links = await prisma.organizationalUnit.findMany({
    select: { id: true, parentId: true },
  });
  const parentIdById = new Map(
    links.map((link) => [link.id, link.parentId] as const),
  );
  if (
    wouldCreateCircularHierarchy({
      organizationalUnitId: input.organizationalUnitId,
      nextParentId: input.nextParentId,
      parentIdById,
    })
  ) {
    throw new OrganizationalUnitError('CIRCULAR_HIERARCHY');
  }
}
