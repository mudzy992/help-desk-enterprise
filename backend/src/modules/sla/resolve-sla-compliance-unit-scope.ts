import { PrismaService } from '../../common/prisma/prisma.service';
import { selectOrganizationalUnitIdsInScope } from '../audit-log/select-organizational-unit-ids-in-scope';

/** Resolve the selected authorized OU to its full descendant reporting scope. */
export async function resolveSlaComplianceUnitScope(
  prisma: PrismaService,
  organizationalUnitId: string,
): Promise<readonly string[]> {
  const units = await prisma.organizationalUnit.findMany({
    select: { id: true, ouPath: true },
  });
  const selected = units.find((unit) => unit.id === organizationalUnitId);
  if (selected === undefined) {
    return [];
  }
  return selectOrganizationalUnitIdsInScope(units, selected.ouPath);
}
