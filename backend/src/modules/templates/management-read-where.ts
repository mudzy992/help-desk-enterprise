import type { Prisma } from '../../generated/prisma/client';
import type { AuthorizationContext } from '../authorization/authorization.types';
import { managedSharedServiceIds } from './template-scope';

/**
 * Database predicates for shared management reads. `some` excludes global
 * records; `every` prevents a template spanning both allowed and foreign
 * services from leaking; category/group scopes remain global-manager only.
 * These predicates are attached to `where`, before the service applies its
 * deterministic order and bounded `take`.
 */
export function responseTemplateSharedReadScopeWhere(
  context: AuthorizationContext,
): Prisma.ResponseTemplateWhereInput | null {
  const serviceIds = managedSharedServiceIds(context);
  if (serviceIds === null) return null;
  const allowed = [...serviceIds];
  return {
    services: {
      some: { serviceId: { in: allowed } },
      every: { serviceId: { in: allowed } },
    },
    categories: { none: {} },
    groups: { none: {} },
  };
}

/** Playbooks use the same service/category rules but do not have group scope. */
export function playbookSharedReadScopeWhere(
  context: AuthorizationContext,
): Prisma.PlaybookWhereInput | null {
  const serviceIds = managedSharedServiceIds(context);
  if (serviceIds === null) return null;
  const allowed = [...serviceIds];
  return {
    services: {
      some: { serviceId: { in: allowed } },
      every: { serviceId: { in: allowed } },
    },
    categories: { none: {} },
  };
}
