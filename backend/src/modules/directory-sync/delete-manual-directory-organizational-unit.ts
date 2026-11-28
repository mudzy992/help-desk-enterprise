import { invalidateOrganizationalUnitScopeCache } from '../../common/cache/scope-catalog-cache';
import type { PrismaService } from '../../common/prisma/prisma.service';
import { auditLogActions } from '../audit-log/audit-log.constants';
import type { AuditLogWriteClient } from '../audit-log/audit-log.types';
import { deleteOrganizationalUnitInTransaction } from '../organizational-units/delete-organizational-unit';
import type { OrganizationalUnitDeleteOutcome } from '../organizational-units/organizational-unit-delete.types';
import { ManualDirectoryCatalogError } from './manual-directory-catalog.error';
import { recordManualDirectoryCatalogChange } from './record-manual-directory-catalog-change';
import type { ManualDirectoryCatalogAuditContext } from './manual-directory-catalog.types';

export async function deleteManualDirectoryOrganizationalUnit(
  prisma: PrismaService,
  externalId: string,
  context: ManualDirectoryCatalogAuditContext = { actorUserId: null, requestId: null },
): Promise<OrganizationalUnitDeleteOutcome> {
  const outcome = await prisma.$transaction(async (transaction) => {
    const existing = await transaction.manualDirectoryOrganizationalUnit.findUnique({
      where: { externalId },
    });
    if (existing === null) {
      throw new ManualDirectoryCatalogError('NOT_FOUND');
    }

    const [childCount, catalogUserCount, catalogGroupCount] = await Promise.all([
      transaction.manualDirectoryOrganizationalUnit.count({
        where: { parentExternalId: externalId },
      }),
      transaction.manualDirectoryUser.count({
        where: { organizationalUnitPath: existing.organizationalUnitPath },
      }),
      transaction.manualDirectoryGroup.count({
        where: { organizationalUnitPath: existing.organizationalUnitPath },
      }),
    ]);
    if (childCount > 0) {
      throw new ManualDirectoryCatalogError('HAS_CHILDREN', [
        { kind: 'directoryChildren', count: childCount },
      ]);
    }
    if (catalogUserCount > 0) {
      throw new ManualDirectoryCatalogError('HAS_MAPPED_USERS', [
        { kind: 'directoryUsers', count: catalogUserCount },
      ]);
    }
    if (catalogGroupCount > 0) {
      throw new ManualDirectoryCatalogError('HAS_GROUPS', [
        { kind: 'directoryGroups', count: catalogGroupCount },
      ]);
    }

    const materialized = await transaction.organizationalUnit.findUnique({
      where: { distinguishedName: existing.distinguishedName },
      select: { id: true },
    });
    let deletion: OrganizationalUnitDeleteOutcome = {
      warnings: [],
      affectedUserIds: [],
    };
    if (materialized !== null) {
      deletion = await deleteOrganizationalUnitInTransaction(
        transaction as unknown as PrismaService,
        materialized.id,
        context,
        'manual_directory_catalog',
      );
    }
    // W2.35b: the catalog row itself is always audited as a catalog change. When a
    // real OU had been materialized, the line above already wrote its own
    // entity-scoped `organizational_unit.deleted`; this entry says that the
    // directory row is gone, which is what the next sync sees.
    await recordManualDirectoryCatalogChange(
      transaction as unknown as AuditLogWriteClient,
      {
        action: auditLogActions.directoryCatalogUnitDeleted,
        entityId: existing.id,
        actorUserId: context.actorUserId,
        requestId: context.requestId,
        metadata: {
          source: 'manual_directory_catalog',
          before: {
            name: existing.displayName,
            distinguishedName: existing.distinguishedName,
            organizationalUnitPath: existing.organizationalUnitPath,
            parentExternalId: existing.parentExternalId,
            type: existing.type,
          },
          removedRoleAssignments:
            deletion.warnings.find((warning) => warning.code === 'ROLE_ASSIGNMENTS_REMOVED')?.count ?? 0,
          affectedUserCount: deletion.affectedUserIds.length,
        },
      },
    );

    await transaction.manualDirectoryOrganizationalUnit.delete({ where: { externalId } });
    return deletion;
  });
  invalidateOrganizationalUnitScopeCache();
  return outcome;
}
