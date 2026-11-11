import type { ServiceLifecycle } from '../../generated/prisma/enums';
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
