import type { PrismaService } from '../../common/prisma/prisma.service';
import { permissionKeys } from '../authorization/authorization.constants';
import { ChangeError, changeErrorCodes, changeLimits } from './changes.constants';

/**
 * Ceiling the loader refuses to cross. Kept as an exported constant because the
 * snapshot reader checks the same bound, and the two must never disagree: a
 * snapshot the writer accepts but the reader rejects would silently fall back to
 * today's membership — the very drift W7.47 removed and W7.70 had to finish.
 */
export const cabVotersMax = changeLimits.cabVotersMax;

/**
 * §8: members of a CAB group who can vote (active, change.approve through a
 * role), read one keyset page at a time.
 *
 * W7.70 (`BA-changes-14`): this used to be a single `take: 100` whose comment
 * ("more = misconfigured group") was documentation, not a guard. A group with
 * 101 eligible members therefore produced a voter set of 100 and a quorum of
 * `min(setting, 100)`: the round could approve with fewer approvals than the
 * configuration asked for, and nothing said so. Now the whole eligible set is
 * read, and crossing `changeLimits.cabVotersMax` raises
 * `CHANGE_CAB_GROUP_TOO_LARGE` naming the group — the round stops and somebody
 * fixes the CAB, instead of governance quietly loosening.
 *
 * The query keeps the permission/active/anonymized predicate in the database and
 * pages by `id asc`, so the cost is one round trip per hundred voters and the
 * result is ordered, which keeps the frozen snapshot byte-comparable.
 */
export async function loadCabVoterIds(prisma: PrismaService, groupId: string): Promise<string[]> {
  const voters: string[] = [];
  let cursor: string | null = null;
  for (;;) {
    const page = await prisma.user.findMany({
      where: {
        isActive: true,
        anonymizedAt: null,
        groupMembers: { some: { groupId } },
        userRoles: {
          some: { role: { rolePermissions: { some: { permission: { key: permissionKeys.changeApprove } } } } },
        },
        ...(cursor === null ? {} : { id: { gt: cursor } }),
      },
      select: { id: true },
      orderBy: { id: 'asc' },
      // One row more than a page proves there is a next page without a count query.
      take: changeLimits.cabVoterPageSize + 1,
    });
    const complete = page.length <= changeLimits.cabVoterPageSize;
    for (const user of complete ? page : page.slice(0, changeLimits.cabVoterPageSize)) {
      voters.push(user.id);
      if (voters.length > cabVotersMax) throw new ChangeError(changeErrorCodes.cabGroupTooLarge, groupId);
    }
    if (complete) return voters;
    const last = voters[voters.length - 1];
    if (last === undefined) return voters;
    cursor = last;
  }
}
