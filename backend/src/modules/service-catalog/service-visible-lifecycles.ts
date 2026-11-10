import type { ServiceLifecycle } from '../../generated/prisma/enums';
import type { PrincipalContext } from '../../common/principal-context/principal-context.types';
import { authorizationRoleKeys } from '../authorization/authorization.constants';

/**
 * Val 2 (M6/B2): `GET /services` had no lifecycle filter at all for signed-in
 * callers, so every user could enumerate drafts (name, slug, open ticket count)
 * and download the complete form schema of a service that was never published
 * — RAW `:304` says `DRAFT` is admin-only. The routes stay role-gated as
 * before; on top of that, what a caller may see is decided here.
 *
 * - admin / super admin: every state (they edit drafts);
 * - agent: everything except drafts (`DEPRECATED` services still hold tickets);
 * - requester: only what is actually offered.
 *
 * `undefined` means an internal caller (worker, ticket creation, tests): no
 * filtering, exactly the behaviour before this change.
 */
export const allServiceLifecycles: readonly ServiceLifecycle[] = [
  'DRAFT',
  'ACTIVE',
  'DEPRECATED',
];

export function visibleServiceLifecycles(
  roleKeys: readonly string[] | undefined,
): readonly ServiceLifecycle[] {
  if (roleKeys === undefined) {
    return allServiceLifecycles;
  }
  if (
    roleKeys.includes(authorizationRoleKeys.admin) ||
    roleKeys.includes(authorizationRoleKeys.superAdmin)
  ) {
    return allServiceLifecycles;
  }
  if (roleKeys.includes(authorizationRoleKeys.agent)) {
    return ['ACTIVE', 'DEPRECATED'];
  }
  return ['ACTIVE'];
}

export type ServiceListVisibility = Readonly<{
  /** Lifecycles visible across the public catalog (not restricted to one service). */
  visibleLifecycles: readonly ServiceLifecycle[];
  /** Additional services for which a scoped ADMIN may see every lifecycle. */
  scopedServiceIds?: readonly string[];
}>;

/**
 * Resolve collection visibility without promoting a scoped ADMIN assignment to
 * catalog-wide draft access. A global ADMIN/SuperAdmin sees the full catalog;
 * a service-scoped ADMIN sees every lifecycle only for assigned services and
 * retains the public lifecycle visibility of any USER/AGENT role it also has.
 */
export function serviceListVisibilityForPrincipal(
  principal: Pick<PrincipalContext, 'isLocalOnly' | 'roleKeys' | 'assignments'> | null,
): ServiceListVisibility {
  if (principal === null) {
    return { visibleLifecycles: ['ACTIVE'] };
  }

  const hasGlobalSuperAdmin =
    principal.isLocalOnly &&
    principal.assignments.some(
      (assignment) =>
        assignment.roleKey === authorizationRoleKeys.superAdmin &&
        assignment.organizationalUnitId === null &&
        assignment.organizationalUnitPath === null &&
        assignment.serviceId === null,
    );
  if (hasGlobalSuperAdmin) {
    return { visibleLifecycles: allServiceLifecycles };
  }

  const adminAssignments = principal.assignments.filter(
    (assignment) => assignment.roleKey === authorizationRoleKeys.admin,
  );
  const hasGlobalAdmin = adminAssignments.some(
    (assignment) =>
      assignment.organizationalUnitId === null &&
      assignment.organizationalUnitPath === null &&
      assignment.serviceId === null,
  );
  if (hasGlobalAdmin) {
    return { visibleLifecycles: allServiceLifecycles };
  }

  const scopedServiceIds = [
    ...new Set(
      adminAssignments.flatMap((assignment) => {
        const serviceId = assignment.serviceId?.trim();
        return assignment.organizationalUnitId === null &&
          assignment.organizationalUnitPath === null &&
          serviceId !== undefined &&
          serviceId.length > 0
          ? [serviceId]
          : [];
      }),
    ),
  ].sort();
  const publicRoleKeys = principal.roleKeys.filter(
    (roleKey) =>
      roleKey !== authorizationRoleKeys.admin &&
      roleKey !== authorizationRoleKeys.superAdmin,
  );
  return {
    visibleLifecycles: visibleServiceLifecycles(publicRoleKeys),
    ...(scopedServiceIds.length === 0 ? {} : { scopedServiceIds }),
  };
}

export function isServiceLifecycleVisible(
  lifecycle: ServiceLifecycle,
  roleKeys: readonly string[] | undefined,
): boolean {
  if (roleKeys === undefined) {
    return true;
  }
  return visibleServiceLifecycles(roleKeys).includes(lifecycle);
}

/**
 * Lifecycles a query may return: the caller's visible set, narrowed by an
 * explicit `?lifecycle=` filter. A caller asking for a state they may not see
 * gets an empty list — the request is not an error, the state simply has no
 * visible rows.
 */
export function requestedServiceLifecycles(
  input: { readonly lifecycle?: ServiceLifecycle; readonly visibleLifecycles?: readonly ServiceLifecycle[] },
): readonly ServiceLifecycle[] {
  const allowed = input.visibleLifecycles ?? allServiceLifecycles;
  if (input.lifecycle === undefined) {
    return allowed;
  }
  return allowed.includes(input.lifecycle) ? [input.lifecycle] : [];
}
