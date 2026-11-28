import {
  bumpOrganizationalUnitCatalogRevision,
  invalidateOrganizationalUnitScopeCache,
} from '../../common/cache/scope-catalog-cache';
import type { Prisma } from '../../generated/prisma/client';
import type { PrismaService } from '../../common/prisma/prisma.service';
import { auditLogActions } from '../audit-log/audit-log.constants';
import {
  isLastActiveSuperAdminOrganizationalUnitAssignment,
  lockActiveSuperAdminInvariant,
} from '../users/super-admin-invariant';
import type { AuditLogWriteClient } from '../audit-log/audit-log.types';
import { OrganizationalUnitError } from './organizational-unit.error';
import { countOrganizationalUnitDeleteBlockers } from './count-organizational-unit-delete-blockers';
import type {
  OrganizationalUnitAuditContext,
  OrganizationalUnitDeleteBlocker,
  OrganizationalUnitDeleteOutcome,
} from './organizational-unit-delete.types';
import { organizationalUnitDeleteErrorCode } from './organizational-unit.error';
import { recordOrganizationalUnitChange } from './record-organizational-unit-change';
import { recordManualDirectoryCatalogChange } from '../directory-sync/record-manual-directory-catalog-change';

export async function deleteOrganizationalUnit(
  prisma: PrismaService,
  organizationalUnitId: string,
  context: OrganizationalUnitAuditContext = { actorUserId: null, requestId: null },
): Promise<OrganizationalUnitDeleteOutcome> {
  const outcome = await prisma.$transaction((transaction) =>
    deleteOrganizationalUnitInTransaction(
      transaction as unknown as PrismaService,
      organizationalUnitId,
      context,
    ),
  );
  invalidateOrganizationalUnitScopeCache();
  return outcome;
}

/** Used by the direct OU route and by manual-catalog deletion's encompassing transaction. */
export async function deleteOrganizationalUnitInTransaction(
  transaction: PrismaService,
  organizationalUnitId: string,
  context: OrganizationalUnitAuditContext,
  source: 'organizational_units' | 'manual_directory_catalog' = 'organizational_units',
): Promise<OrganizationalUnitDeleteOutcome> {
  // Serialize OU cascades with role removals, deactivation and account deletion.
  await lockActiveSuperAdminInvariant(transaction as unknown as Prisma.TransactionClient);
  const unit = await transaction.organizationalUnit.findUnique({
    where: { id: organizationalUnitId },
    select: {
      id: true,
      name: true,
      type: true,
      distinguishedName: true,
      ouPath: true,
      parentId: true,
      company: true,
      department: true,
    },
  });
  if (unit === null) {
    throw new OrganizationalUnitError('NOT_FOUND');
  }

  const blockers = await countOrganizationalUnitDeleteBlockers(transaction, {
    id: organizationalUnitId,
    ouPath: unit.ouPath,
  });
  if (blockers.length > 0) {
    throw blockerError(blockers);
  }
  if (
    await isLastActiveSuperAdminOrganizationalUnitAssignment(
      transaction as unknown as Prisma.TransactionClient,
      organizationalUnitId,
    )
  ) {
    throw new OrganizationalUnitError('LAST_SUPER_ADMIN_REQUIRED');
  }

  const roleAssignments = await transaction.userRole.findMany({
    where: { organizationalUnitId },
    select: { userId: true },
  });
  const affectedUserIds = [...new Set(roleAssignments.map((assignment) => assignment.userId))];

  await removeMirroredCatalogEntries(
    transaction,
    { distinguishedName: unit.distinguishedName, ouPath: unit.ouPath },
    context,
  );

  await transaction.organizationalUnit.delete({ where: { id: organizationalUnitId } });
  await recordOrganizationalUnitChange(
    transaction as unknown as AuditLogWriteClient,
    {
      action: auditLogActions.organizationalUnitDeleted,
      entityId: unit.id,
      actorUserId: context.actorUserId,
      requestId: context.requestId,
      metadata: {
        source,
        before: {
          name: unit.name,
          type: unit.type,
          distinguishedName: unit.distinguishedName,
          ouPath: unit.ouPath,
          parentId: unit.parentId,
          company: unit.company,
          department: unit.department,
        },
        removedRoleAssignments: roleAssignments.length,
        affectedUserIds,
        blockers: [] as readonly OrganizationalUnitDeleteBlocker[],
      },
    },
  );
  // W2.11: a deleted unit must disappear from every instance's catalogue in the
  // same commit that removes it.
  await bumpOrganizationalUnitCatalogRevision(transaction);

  return {
    affectedUserIds,
    warnings:
      roleAssignments.length > 0
        ? [{ code: 'ROLE_ASSIGNMENTS_REMOVED', count: roleAssignments.length }]
        : [],
  };
}

/**
 * W2.37b: a unit that exists in both the tree and the manual-only catalogue must
 * lose both rows in one commit. Before this the tree row went away and the
 * catalogue row stayed, so the unit was still offered as a parent and re-creating
 * the same path failed with `DUPLICATE_PATH`.
 *
 * Rows are matched by path (and by DN as a fallback, because a mirrored row may
 * carry the other namespace) for this unit and everything below it — the delete
 * preflight already refused the request when catalogue children, users or groups
 * hang under the path, so what is left describes units that no longer exist.
 * Each removed row is audited as a catalogue change, keeping the audit trail
 * readable from the catalogue side too.
 */
async function removeMirroredCatalogEntries(
  transaction: Prisma.TransactionClient,
  unit: { readonly distinguishedName: string; readonly ouPath: string },
  context: OrganizationalUnitAuditContext,
): Promise<void> {
  const rows = await transaction.manualDirectoryOrganizationalUnit.findMany({
    where: {
      OR: [
        { organizationalUnitPath: unit.ouPath },
        { organizationalUnitPath: { startsWith: `${unit.ouPath}/` } },
        { distinguishedName: unit.distinguishedName },
      ],
    },
    select: {
      id: true,
      externalId: true,
      displayName: true,
      distinguishedName: true,
      organizationalUnitPath: true,
      parentExternalId: true,
      type: true,
    },
  });
  for (const row of rows) {
    await recordManualDirectoryCatalogChange(
      transaction as unknown as AuditLogWriteClient,
      {
        action: auditLogActions.directoryCatalogUnitDeleted,
        entityId: row.id,
        actorUserId: context.actorUserId,
        requestId: context.requestId,
        metadata: {
          source: 'organizational_units',
          before: {
            name: row.displayName,
            distinguishedName: row.distinguishedName,
            organizationalUnitPath: row.organizationalUnitPath,
            parentExternalId: row.parentExternalId,
            type: row.type,
          },
          removedRoleAssignments: 0,
          affectedUserCount: 0,
        },
      },
    );
    await transaction.manualDirectoryOrganizationalUnit.delete({
      where: { externalId: row.externalId },
    });
  }
}

function blockerError(blockers: readonly OrganizationalUnitDeleteBlocker[]): OrganizationalUnitError {
  const first = blockers[0];
  if (first === undefined) {
    return new OrganizationalUnitError('RESOURCE_IN_USE');
  }
  return new OrganizationalUnitError(
    organizationalUnitDeleteErrorCode(first.kind),
    'Organizational unit is still in use',
    blockers,
  );
}
