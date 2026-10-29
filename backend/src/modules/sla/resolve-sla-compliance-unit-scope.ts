import { PrismaService } from '../../common/prisma/prisma.service';

/**
 * Resolve one selected OU to its reporting subtree without materializing the
 * deployment-wide OU directory in application memory.
 */
export async function resolveSlaComplianceUnitScope(
  prisma: PrismaService,
  organizationalUnitId: string,
): Promise<readonly string[]> {
  const selected = await prisma.organizationalUnit.findUnique({
    where: { id: organizationalUnitId },
    select: { ouPath: true },
  });
  if (selected === null) return [];
  const descendantPrefix = selected.ouPath.endsWith('/')
    ? selected.ouPath
    : `${selected.ouPath}/`;
  const units = await prisma.organizationalUnit.findMany({
    where: {
      OR: [
        { id: organizationalUnitId },
        { ouPath: { startsWith: descendantPrefix } },
      ],
    },
    select: { id: true },
    orderBy: { id: 'asc' },
  });
  return units.map((unit) => unit.id);
}
