import type { PrismaService } from '../../common/prisma/prisma.service';
import { auditLogActions } from '../audit-log/audit-log.constants';
import type { AuditLogWriteClient } from '../audit-log/audit-log.types';
import { recordOrganizationalUnitChange } from '../organizational-units/record-organizational-unit-change';
import { createManualDirectoryOrganizationalUnitExternalId } from './create-manual-directory-organizational-unit-external-id';
import { ManualDirectoryCatalogError } from './manual-directory-catalog.error';
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
  const distinguishedName = input.distinguishedName?.trim() || (parent
    ? `OU=${displayName},${parent.distinguishedName}`
    : `OU=${displayName},DC=example,DC=com`);
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
      await recordOrganizationalUnitChange(
        transaction as unknown as AuditLogWriteClient,
        {
          action: auditLogActions.organizationalUnitCreated,
          entityId: unit.id,
          actorUserId: context.actorUserId,
          requestId: context.requestId,
          metadata: {
            source: 'manual_directory_catalog',
            after: {
              displayName: unit.displayName,
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
