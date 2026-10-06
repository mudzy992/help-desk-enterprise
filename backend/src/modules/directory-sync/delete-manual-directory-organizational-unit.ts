import { invalidateOrganizationalUnitScopeCache } from '../../common/cache/scope-catalog-cache';
import type { PrismaService } from '../../common/prisma/prisma.service';
import { auditLogActions } from '../audit-log/audit-log.constants';
import type { AuditLogWriteClient } from '../audit-log/audit-log.types';
import { deleteOrganizationalUnitInTransaction } from '../organizational-units/delete-organizational-unit';
import type {
  OrganizationalUnitDeleteOutcome,
  OrganizationalUnitDeleteBlocker,
} from '../organizational-units/organizational-unit-delete.types';
import { recordOrganizationalUnitChange } from '../organizational-units/record-organizational-unit-change';
import { ManualDirectoryCatalogError } from './manual-directory-catalog.error';
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
    } else {
      await recordOrganizationalUnitChange(
        transaction as unknown as AuditLogWriteClient,
        {
          action: auditLogActions.organizationalUnitDeleted,
          entityId: existing.id,
          actorUserId: context.actorUserId,
          requestId: context.requestId,
          metadata: {
            source: 'manual_directory_catalog',
            before: {
              displayName: existing.displayName,
              distinguishedName: existing.distinguishedName,
              organizationalUnitPath: existing.organizationalUnitPath,
              parentExternalId: existing.parentExternalId,
              type: existing.type,
            },
            removedRoleAssignments: 0,
            affectedUserIds: [],
            blockers: [] as readonly OrganizationalUnitDeleteBlocker[],
          },
        },
      );
    }

    await transaction.manualDirectoryOrganizationalUnit.delete({ where: { externalId } });
    return deletion;
  });
  invalidateOrganizationalUnitScopeCache();
  return outcome;
}
