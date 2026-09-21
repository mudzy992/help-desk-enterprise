import type { Prisma } from '../../../generated/prisma/client';
import type { AuthorizationContext } from '../../authorization/authorization.types';
import { authorizationRoleKeys } from '../../authorization/authorization.constants';
import {
  doesOrganizationalUnitScopeCover,
  isNonEmptyScopeValue,
} from '../../authorization/does-organizational-unit-scope-cover';

export type OrganizationalUnitScopeRow = {
  readonly id: string;
  readonly ouPath: string;
};

/** Matches no ticket (`IN ()` is false in SQL). */
export const matchesNoTicket: Prisma.TicketWhereInput = { id: { in: [] } };

function isManagingRole(roleKey: string): boolean {
  return (
    roleKey === authorizationRoleKeys.agent ||
    roleKey === authorizationRoleKeys.admin
  );
}

/**
 * `where` counterpart of `canManageTicketsInScope`. The OU part is resolved
 * here with the same `doesOrganizationalUnitScopeCover` the per-ticket check
 * uses, against the already loaded units, and becomes `originUnitId IN (...)`.
 * It deliberately avoids SQL `LIKE` on `ouPath`, where `_` and `%` in a unit
 * name would act as wildcards and widen the scope.
 *
 * A service-scoped assignment only covers its service; a null service scope
 * covers every service; a blank one covers nothing.
 */
export function buildManageScopeWhere(
  context: AuthorizationContext,
  units: readonly OrganizationalUnitScopeRow[],
): Prisma.TicketWhereInput {
  if (context.isSuperAdmin) {
    return context.isLocalOnly ? {} : matchesNoTicket;
  }
  const unitIdsByService = new Map<string | null, Set<string>>();
  for (const assignment of context.assignments) {
    if (!isManagingRole(assignment.roleKey)) {
      continue;
    }
    const serviceKey = toServiceKey(assignment.serviceId);
    if (serviceKey === undefined) {
      continue;
    }
    const covered = units
      .filter((unit) =>
        doesOrganizationalUnitScopeCover({
          assignedPath: assignment.organizationalUnitPath,
          requestedPath: unit.ouPath,
        }),
      )
      .map((unit) => unit.id);
    if (covered.length === 0) {
      continue;
    }
    const known = unitIdsByService.get(serviceKey) ?? new Set<string>();
    covered.forEach((id) => known.add(id));
    unitIdsByService.set(serviceKey, known);
  }
  const clauses: Prisma.TicketWhereInput[] = [...unitIdsByService].map(
    ([serviceKey, ids]) =>
      serviceKey === null
        ? { originUnitId: { in: [...ids] } }
        : { serviceId: serviceKey, originUnitId: { in: [...ids] } },
  );
  if (clauses.length === 0) {
    return matchesNoTicket;
  }
  return clauses.length === 1 ? clauses[0] : { OR: clauses };
}

/** `null` = any service; `undefined` = this assignment can never match. */
function toServiceKey(serviceId: string | null): string | null | undefined {
  if (serviceId === null) {
    return null;
  }
  return isNonEmptyScopeValue(serviceId) ? serviceId.trim() : undefined;
}
