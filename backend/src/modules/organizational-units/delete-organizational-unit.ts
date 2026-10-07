import { invalidateOrganizationalUnitScopeCache } from '../../common/cache/scope-catalog-cache';
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

  const blockers = await countOrganizationalUnitDeleteBlockers(
    transaction,
    organizationalUnitId,
  );
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

  return {
    affectedUserIds,
    warnings:
      roleAssignments.length > 0
        ? [{ code: 'ROLE_ASSIGNMENTS_REMOVED', count: roleAssignments.length }]
        : [],
  };
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
