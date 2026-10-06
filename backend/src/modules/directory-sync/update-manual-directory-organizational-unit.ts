import type { PrismaService } from '../../common/prisma/prisma.service';
import { auditLogActions } from '../audit-log/audit-log.constants';
import type { AuditLogWriteClient } from '../audit-log/audit-log.types';
import { recordOrganizationalUnitChange } from '../organizational-units/record-organizational-unit-change';
import { ManualDirectoryCatalogError } from './manual-directory-catalog.error';
import type {
  ManualDirectoryCatalogAuditContext,
  ManualDirectoryOrganizationalUnitResponse,
  UpdateManualDirectoryOrganizationalUnitInput,
} from './manual-directory-catalog.types';
import {
  buildManualDirectoryOrganizationalUnitDistinguishedName,
  buildManualDirectoryOrganizationalUnitPath,
  isCircularManualDirectoryParent,
  listManualDirectoryDescendantsTopDown,
  type ManualDirectoryUnitLink,
} from './manual-directory-organizational-unit-path';
import { parseManualDirectoryOrganizationalUnitType } from './parse-manual-directory-organizational-unit-type';
import { toManualDirectoryOrganizationalUnitResponse } from './to-manual-directory-organizational-unit-response';

export async function updateManualDirectoryOrganizationalUnit(
  prisma: PrismaService,
  externalId: string,
  input: UpdateManualDirectoryOrganizationalUnitInput,
  context: ManualDirectoryCatalogAuditContext = { actorUserId: null, requestId: null },
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
  const type =
    input.type === undefined
      ? existing.type
      : parseManualDirectoryOrganizationalUnitType(
          typeof input.type === 'string' ? input.type : input.type,
          existing.type,
        );
  const catalogUnits = await prisma.manualDirectoryOrganizationalUnit.findMany({
    select: {
      externalId: true,
      displayName: true,
      parentExternalId: true,
      organizationalUnitPath: true,
      distinguishedName: true,
    },
  });
  const parentExternalIdByExternalId = new Map(
    catalogUnits.map((unit) => [unit.externalId, unit.parentExternalId] as const),
  );
  if (
    isCircularManualDirectoryParent({
      externalId,
      nextParentExternalId: parentExternalId,
      parentExternalIdByExternalId,
    })
  ) {
    throw new ManualDirectoryCatalogError('CIRCULAR_REFERENCE');
  }
  const parent =
    parentExternalId === null
      ? null
      : catalogUnits.find((unit) => unit.externalId === parentExternalId) ?? null;
  if (parentExternalId !== null && parent === null) {
    throw new ManualDirectoryCatalogError('PARENT_NOT_FOUND');
  }
  const organizationalUnitPath = buildManualDirectoryOrganizationalUnitPath(
    parent?.organizationalUnitPath ?? null,
    displayName,
  );
  const distinguishedName =
    input.distinguishedName?.trim() ||
    (parent === null && displayName === existing.displayName
      ? existing.distinguishedName
      : buildManualDirectoryOrganizationalUnitDistinguishedName(
          parent?.distinguishedName ?? null,
          displayName,
          existing.distinguishedName,
        ));
  const shouldCascade =
    displayName !== existing.displayName ||
    parentExternalId !== existing.parentExternalId;
  const identityByExternalId = new Map<string, ManualDirectoryUnitLink>(
    catalogUnits.map((unit) => [unit.externalId, unit]),
  );
  identityByExternalId.set(externalId, {
    externalId,
    displayName,
    parentExternalId,
    organizationalUnitPath,
    distinguishedName,
  });
  const descendantUpdates = shouldCascade
    ? listManualDirectoryDescendantsTopDown(externalId, catalogUnits).map(
        (descendant) => {
          const parentIdentity = identityByExternalId.get(
            descendant.parentExternalId ?? '',
          );
          if (parentIdentity === undefined) {
            return descendant;
          }
          const nextIdentity: ManualDirectoryUnitLink = {
            ...descendant,
            organizationalUnitPath: buildManualDirectoryOrganizationalUnitPath(
              parentIdentity.organizationalUnitPath,
              descendant.displayName,
            ),
            distinguishedName:
              buildManualDirectoryOrganizationalUnitDistinguishedName(
                parentIdentity.distinguishedName,
                descendant.displayName,
                descendant.distinguishedName,
              ),
          };
          identityByExternalId.set(descendant.externalId, nextIdentity);
          return nextIdentity;
        },
      )
    : [];
  try {
    const updated = await prisma.$transaction(async (transaction) => {
      const root = await transaction.manualDirectoryOrganizationalUnit.update({
        where: { externalId },
        data: {
          displayName,
          parentExternalId,
          organizationalUnitPath,
          distinguishedName,
          type,
        },
      });
      for (const descendant of descendantUpdates) {
        await transaction.manualDirectoryOrganizationalUnit.update({
          where: { externalId: descendant.externalId },
          data: {
            organizationalUnitPath: descendant.organizationalUnitPath,
            distinguishedName: descendant.distinguishedName,
          },
        });
      }
      await recordOrganizationalUnitChange(
        transaction as unknown as AuditLogWriteClient,
        {
          action: auditLogActions.organizationalUnitUpdated,
          entityId: existing.id,
          actorUserId: context.actorUserId,
          requestId: context.requestId,
          metadata: {
            source: 'manual_directory_catalog',
            before: {
              displayName: existing.displayName,
              parentExternalId: existing.parentExternalId,
              organizationalUnitPath: existing.organizationalUnitPath,
              distinguishedName: existing.distinguishedName,
              type: existing.type,
            },
            after: {
              displayName: root.displayName,
              parentExternalId: root.parentExternalId,
              organizationalUnitPath: root.organizationalUnitPath,
              distinguishedName: root.distinguishedName,
              type: root.type,
            },
            affectedDescendantCount: descendantUpdates.length,
          },
        },
      );
      return root;
    });
    return toManualDirectoryOrganizationalUnitResponse(updated);
  } catch (error) {
    if (error instanceof ManualDirectoryCatalogError) {
      throw error;
    }
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
