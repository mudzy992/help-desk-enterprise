import type { PrismaService } from '../../common/prisma/prisma.service';
import { collectGroupDeleteDependencies } from './collect-group-delete-dependencies';
import type { GroupDeleteImpact } from './group-delete.types';
import { GroupsError } from './groups.error';
import type { LoadedGroupRecord } from './load-group-record';

/**
 * W2.12 (`BA-groups-01`): the old guard asked two questions (sole fallback,
 * active tickets) and let the database decide the rest - which meant cascade
 * deletion of on-call rotations, Teams bindings, response-template scopes and
 * notifications, `SetNull` of history, and opaque 500s for the two `Restrict`
 * relations.
 *
 * The guard now answers with the full inventory and refuses with everything it
 * found, so the operator sees `{ kind, count }` per relation and can resolve it.
 * It returns the impact so the caller can audit what the delete *will* detach,
 * even when it is allowed.
 */
export async function assertGroupDeletable(
  prisma: PrismaService,
  group: LoadedGroupRecord,
): Promise<GroupDeleteImpact> {
  const impact = await collectGroupDeleteDependencies(prisma, {
    groupId: group.id,
    organizationalUnitId: group.organizationalUnitId,
    isFallback: group.isFallback,
  });
  if (impact.blockers.length > 0) {
    throw new GroupsError('HAS_DEPENDENCIES', 'HAS_DEPENDENCIES', impact.blockers);
  }
  return impact;
}
