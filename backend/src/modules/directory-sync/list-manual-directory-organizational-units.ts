import type { PrismaService } from '../../common/prisma/prisma.service';
import type { ManualDirectoryOrganizationalUnitResponse } from './manual-directory-catalog.types';
import { toManualDirectoryOrganizationalUnitResponse } from './to-manual-directory-organizational-unit-response';

export async function listManualDirectoryOrganizationalUnits(
  prisma: PrismaService,
): Promise<readonly ManualDirectoryOrganizationalUnitResponse[]> {
  const rows = await prisma.manualDirectoryOrganizationalUnit.findMany({
    orderBy: { organizationalUnitPath: 'asc' },
  });
  return rows.map(toManualDirectoryOrganizationalUnitResponse);
}
