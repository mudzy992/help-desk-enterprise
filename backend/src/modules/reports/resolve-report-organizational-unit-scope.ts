import { PrismaService } from '../../common/prisma/prisma.service';
import { selectOrganizationalUnitIdsInScope } from '../audit-log/select-organizational-unit-ids-in-scope';
import { reportErrorCodes } from './reports.constants';
import { ReportsError } from './reports.error';

export async function resolveReportOrganizationalUnitScope(
  prisma: PrismaService,
  organizationalUnitId: string,
): Promise<readonly string[]> {
  const units = await prisma.organizationalUnit.findMany({
    select: { id: true, ouPath: true },
  });
  const requested = units.find((unit) => unit.id === organizationalUnitId);
  if (requested === undefined) {
    throw new ReportsError(reportErrorCodes.organizationalUnitNotFound);
  }
  return selectOrganizationalUnitIdsInScope(units, requested.ouPath);
}
