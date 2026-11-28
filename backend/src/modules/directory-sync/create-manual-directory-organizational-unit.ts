import type { PrismaService } from '../../common/prisma/prisma.service';
import { auditLogActions } from '../audit-log/audit-log.constants';
import type { AuditLogWriteClient } from '../audit-log/audit-log.types';
import { createManualDirectoryOrganizationalUnitExternalId } from './create-manual-directory-organizational-unit-external-id';
import {
  buildManualDirectoryOrganizationalUnitDistinguishedName,
  defaultManualDirectoryCatalogRootDistinguishedName,
} from './manual-directory-organizational-unit-path';
import { ManualDirectoryCatalogError } from './manual-directory-catalog.error';
import { recordManualDirectoryCatalogChange } from './record-manual-directory-catalog-change';
import type {
  CreateManualDirectoryOrganizationalUnitInput,
  ManualDirectoryCatalogAuditContext,
  ManualDirectoryOrganizationalUnitResponse,
} from './manual-directory-catalog.types';
import {
  defaultManualDirectoryOrganizationalUnitType,
  parseManualDirectoryOrganizationalUnitType,
} from './parse-manual-directory-organizational-unit-type';
import { toManualDirectoryOrganizationalUnitResponse } from './to-manual-directory-organizational-unit-response';

export async function createManualDirectoryOrganizationalUnit(
  prisma: PrismaService,
  input: CreateManualDirectoryOrganizationalUnitInput,
  context: ManualDirectoryCatalogAuditContext = { actorUserId: null, requestId: null },
): Promise<ManualDirectoryOrganizationalUnitResponse> {
  const displayName = input.displayName.trim();
  if (displayName.length === 0) {
    throw new ManualDirectoryCatalogError('INVALID_INPUT');
  }
  const parentExternalId = input.parentExternalId?.trim() || null;
  const parent = parentExternalId === null
    ? null
    : await prisma.manualDirectoryOrganizationalUnit.findUnique({ where: { externalId: parentExternalId } });
  if (parentExternalId !== null && parent === null) {
    throw new ManualDirectoryCatalogError('PARENT_NOT_FOUND');
  }
  const organizationalUnitPath = parent
    ? `${parent.organizationalUnitPath}/${displayName}`
    : `/${displayName}`;
  // W2.37: escape the name and rewrite the fallback's first RDN by RDN
  // boundaries, so a name with a DN special cannot produce a second RDN.
  const distinguishedName =
    input.distinguishedName?.trim() ||
    buildManualDirectoryOrganizationalUnitDistinguishedName(
      parent?.distinguishedName ?? null,
      displayName,
      defaultManualDirectoryCatalogRootDistinguishedName,
    );
  const type = parseManualDirectoryOrganizationalUnitType(
    typeof input.type === 'string' ? input.type : input.type ?? null,
    defaultManualDirectoryOrganizationalUnitType(parentExternalId),
  );
  const externalId = createManualDirectoryOrganizationalUnitExternalId(organizationalUnitPath);

  try {
    const created = await prisma.$transaction(async (transaction) => {
      const unit = await transaction.manualDirectoryOrganizationalUnit.create({
        data: {
          externalId,
          displayName,
          distinguishedName,
          organizationalUnitPath,
          parentExternalId,
          type,
        },
      });
      await recordManualDirectoryCatalogChange(
        transaction as unknown as AuditLogWriteClient,
        {
          action: auditLogActions.directoryCatalogUnitCreated,
          entityId: unit.id,
          actorUserId: context.actorUserId,
          requestId: context.requestId,
          metadata: {
            source: 'manual_directory_catalog',
            after: {
              name: unit.displayName,
              distinguishedName: unit.distinguishedName,
              organizationalUnitPath: unit.organizationalUnitPath,
              parentExternalId: unit.parentExternalId,
              type: unit.type,
            },
          },
        },
      );
      return unit;
    });
    return toManualDirectoryOrganizationalUnitResponse(created);
  } catch (error) {
    if (isPrismaUniqueConstraintError(error)) {
      throw new ManualDirectoryCatalogError('IDENTITY_CONFLICT');
    }
    throw error;
  }
}

function isPrismaUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { readonly code?: unknown }).code === 'P2002'
  );
}
