import type { PrismaService } from '../../common/prisma/prisma.service';
import { ManualDirectoryCatalogError } from './manual-directory-catalog.error';
import type {
  ManualDirectoryOrganizationalUnitResponse,
  UpdateManualDirectoryOrganizationalUnitInput,
} from './manual-directory-catalog.types';
import { toManualDirectoryOrganizationalUnitResponse } from './to-manual-directory-organizational-unit-response';

export async function updateManualDirectoryOrganizationalUnit(
  prisma: PrismaService,
  externalId: string,
  input: UpdateManualDirectoryOrganizationalUnitInput,
): Promise<ManualDirectoryOrganizationalUnitResponse> {
  const existing = await prisma.manualDirectoryOrganizationalUnit.findUnique({
    where: { externalId },
  });
  if (existing === null) {
    throw new ManualDirectoryCatalogError('NOT_FOUND');
  }
  const displayName = input.displayName?.trim() ?? existing.displayName;
  if (displayName.length === 0) {
    throw new ManualDirectoryCatalogError('INVALID_INPUT');
  }
  const parentExternalId =
    input.parentExternalId === undefined
      ? existing.parentExternalId
      : input.parentExternalId?.trim() || null;
  if (parentExternalId === externalId) {
    throw new ManualDirectoryCatalogError('INVALID_INPUT');
  }
  const parent =
    parentExternalId === null
      ? null
      : await prisma.manualDirectoryOrganizationalUnit.findUnique({
          where: { externalId: parentExternalId },
        });
  if (parentExternalId !== null && parent === null) {
    throw new ManualDirectoryCatalogError('PARENT_NOT_FOUND');
  }
  const organizationalUnitPath = parent
    ? `${parent.organizationalUnitPath}/${displayName}`
    : `/${displayName}`;
  const distinguishedName =
    input.distinguishedName?.trim() ||
    (parent
      ? `OU=${displayName},${parent.distinguishedName}`
      : existing.distinguishedName);
  try {
    const updated = await prisma.manualDirectoryOrganizationalUnit.update({
      where: { externalId },
      data: {
        displayName,
        parentExternalId,
        organizationalUnitPath,
        distinguishedName,
      },
    });
    return toManualDirectoryOrganizationalUnitResponse(updated);
  } catch {
    throw new ManualDirectoryCatalogError('IDENTITY_CONFLICT');
  }
}
