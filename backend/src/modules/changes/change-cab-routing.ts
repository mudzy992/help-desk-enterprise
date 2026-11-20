import { ChangeError, changeErrorCodes } from './changes.constants';

/**
 * BA-changes-16: why the change ended up with this CAB group. Recorded in
 * `change.created` so the routing is provable afterwards - a change never lands
 * in a CAB body "because it came first alphabetically".
 *
 * - `explicit`            - the caller named the group,
 * - `single-covering`     - the change's unit (or its nearest ancestor) has
 *                           exactly one CAB group, so the routing is unambiguous,
 * - `single-installation` - the unit chain has none, and the installation has
 *                           exactly one CAB group.
 */
export type CabRoutingOrigin = 'explicit' | 'single-covering' | 'single-installation';

export interface CabRoutingDecision {
  readonly cabGroupId: string;
  readonly cabRouting: CabRoutingOrigin;
}

/**
 * Paths that cover the unit, nearest first: `/a/b/c` -> [`/a/b/c`, `/a/b`, `/a`].
 * `ouPath` values are built by `buildOrganizationalUnitPath`, so the leading
 * slash is present and every ancestor is a proper prefix.
 */
export function ancestorOuPaths(ouPath: string): readonly string[] {
  const segments = ouPath.split('/').filter((segment) => segment.length > 0);
  return segments.map((_, index) => `/${segments.slice(0, segments.length - index).join('/')}`);
}

/**
 * Decides the CAB group without guessing. `cabGroupIdsByLevel` lists the CAB
 * groups of each ancestor level, nearest first; `otherCabGroupIds` carries the
 * groups outside that chain (at most two - only "one or many" matters).
 *
 * Any ambiguity throws `CHANGE_CAB_GROUP_REQUIRED`: silently routing a change
 * to the wrong approval body is worse than asking the requester to pick.
 */
export function decideCabGroup(input: {
  readonly requestedCabGroupId: string | null;
  readonly cabGroupIdsByLevel: readonly (readonly string[])[];
  readonly otherCabGroupIds: readonly string[];
}): CabRoutingDecision {
  if (input.requestedCabGroupId !== null) {
    return { cabGroupId: input.requestedCabGroupId, cabRouting: 'explicit' };
  }
  for (const level of input.cabGroupIdsByLevel) {
    if (level.length === 1) return { cabGroupId: level[0], cabRouting: 'single-covering' };
    if (level.length > 1) throw new ChangeError(changeErrorCodes.cabGroupRequired, 'cabGroupId');
  }
  if (input.otherCabGroupIds.length === 1) {
    return { cabGroupId: input.otherCabGroupIds[0], cabRouting: 'single-installation' };
  }
  throw new ChangeError(changeErrorCodes.cabGroupRequired, 'cabGroupId');
}
