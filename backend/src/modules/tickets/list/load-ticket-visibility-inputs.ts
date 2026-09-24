import { PrismaService } from '../../../common/prisma/prisma.service';
import {
  loadActorGroupIds,
  loadOrganizationalUnitScopeRows,
} from '../../../common/cache/scope-catalog-cache';
import type { OrganizationalUnitScopeRow } from './build-manage-scope-where';

/**
 * Everything the visibility predicate needs, in two queries for the whole
 * list (the per-ticket check used to look these up again for every ticket).
 */
export async function loadTicketVisibilityInputs(
  prisma: PrismaService,
  actorUserId: string,
): Promise<{
  readonly units: readonly OrganizationalUnitScopeRow[];
  readonly actorGroupIds: readonly string[];
}> {
  // Both catalogues are cached per process for a few seconds inside a request
  // (`common/cache/scope-catalog-cache.ts`); outside a request they are read here.
  const [units, actorGroupIds] = await Promise.all([
    loadOrganizationalUnitScopeRows(prisma),
    loadActorGroupIds(prisma, actorUserId),
  ]);
  return { units, actorGroupIds };
}
