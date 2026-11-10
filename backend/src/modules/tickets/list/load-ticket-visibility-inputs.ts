import { PrismaService } from '../../../common/prisma/prisma.service';
import {
  loadActorGroupIds,
  loadOrganizationalUnitScopeRows,
} from '../../../common/cache/scope-catalog-cache';
import type { OrganizationalUnitScopeRow } from './build-manage-scope-where';

/**
 * Inputs used by page-wide visibility predicates, not per-ticket lookups.
 * Ticket-level group membership can be expressed directly in the query, so the
 * actor-group catalogue is optional. Only actor-global viewer-group policy
 * checks need those ids explicitly.
 */
export async function loadTicketVisibilityInputs(
  prisma: PrismaService,
  actorUserId: string,
  options: { readonly includeActorGroupIds?: boolean } = {},
): Promise<{
  readonly units: readonly OrganizationalUnitScopeRow[];
  readonly actorGroupIds: readonly string[];
}> {
  // Both catalogues are cached per process for a few seconds inside a request
  // (`common/cache/scope-catalog-cache.ts`); outside a request they are read here.
  const [units, actorGroupIds] = await Promise.all([
    loadOrganizationalUnitScopeRows(prisma),
    options.includeActorGroupIds === false
      ? Promise.resolve([] as readonly string[])
      : loadActorGroupIds(prisma, actorUserId),
  ]);
  return { units, actorGroupIds };
}
