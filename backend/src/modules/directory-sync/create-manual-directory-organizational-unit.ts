import type { PrismaService } from '../../common/prisma/prisma.service';
import { createManualDirectoryOrganizationalUnitExternalId } from './create-manual-directory-organizational-unit-external-id';
import { ManualDirectoryCatalogError } from './manual-directory-catalog.error';
import type {
  CreateManualDirectoryOrganizationalUnitInput,
  ManualDirectoryOrganizationalUnitResponse,
} from './manual-directory-catalog.types';
import { toManualDirectoryOrganizationalUnitResponse } from './to-manual-directory-organizational-unit-response';

export async function createManualDirectoryOrganizationalUnit(
  prisma: PrismaService,
  input: CreateManualDirectoryOrganizationalUnitInput,
): Promise<ManualDirectoryOrganizationalUnitResponse> {
  const displayName = input.displayName.trim();
  if (displayName.length === 0) {
    throw new ManualDirectoryCatalogError('INVALID_INPUT');
  }
  const parentExternalId = input.parentExternalId?.trim() || null;
  let parent =
    parentExternalId === null
      ? null
      : await prisma.manualDirectoryOrganizationalUnit.findUnique({
          where: { externalId: parentExternalId },
        });
  if (parentExternalId !== null && parent === null) {
    throw new ManualDirectoryCatalogError('PARENT_NOT_FOUND');
  }
  if (parent === null) {
    parent = await prisma.manualDirectoryOrganizationalUnit.findFirst({
      where: {
        OR: [
          { organizationalUnitPath: '/Users' },
          { externalId: 'manual_only:ou:users' },
        ],
      },
    });
  }
  const organizationalUnitPath = parent
    ? `${parent.organizationalUnitPath}/${displayName}`
    : `/${displayName}`;
  const distinguishedName =
    input.distinguishedName?.trim() ||
    (parent
      ? `OU=${displayName},${parent.distinguishedName}`
      : `OU=${displayName},DC=example,DC=com`);
  const resolvedParentExternalId = parent?.externalId ?? null;
  const externalId =
    createManualDirectoryOrganizationalUnitExternalId(organizationalUnitPath);
  try {
    const created = await prisma.manualDirectoryOrganizationalUnit.create({
      data: {
        externalId,
        displayName,
        distinguishedName,
        organizationalUnitPath,
        parentExternalId: resolvedParentExternalId,
      },
    });
    return toManualDirectoryOrganizationalUnitResponse(created);
  } catch {
    throw new ManualDirectoryCatalogError('IDENTITY_CONFLICT');
  }
}
