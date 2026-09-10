import { PrismaService } from '../../common/prisma/prisma.service';
import { OrganizationalUnitError } from './organizational-unit.error';

export async function assertRewrittenPathsAreAvailable(
  prisma: PrismaService,
  input: {
    readonly excludedIds: readonly string[];
    readonly nextPaths: readonly string[];
  },
): Promise<void> {
  if (input.nextPaths.length === 0) {
    return;
  }
  if (new Set(input.nextPaths).size !== input.nextPaths.length) {
    throw new OrganizationalUnitError('DUPLICATE_OU_PATH');
  }
  const conflict = await prisma.organizationalUnit.findFirst({
    where: {
      ouPath: { in: [...input.nextPaths] },
      NOT: { id: { in: [...input.excludedIds] } },
    },
    select: { id: true },
  });
  if (conflict !== null) {
    throw new OrganizationalUnitError('DUPLICATE_OU_PATH');
  }
}
