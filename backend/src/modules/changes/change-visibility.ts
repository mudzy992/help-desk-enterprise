import type { Prisma } from '../../generated/prisma/client';
import { unitScopeWhere } from '../assets/asset-viewer';
import type { ChangeScope } from './change-access.service';

/**
 * §15: a change is visible inside the unit scope of the permission, to its
 * requester and owner, and to the members of its CAB group (who vote on it).
 * null = no restriction.
 */
export function changeVisibilityWhere(scope: ChangeScope, userId: string): Prisma.ChangeRequestWhereInput | null {
  const unitWhere = unitScopeWhere(scope);
  if (unitWhere === null) return null;
  return {
    OR: [
      { organizationalUnit: unitWhere as Prisma.OrganizationalUnitWhereInput },
      { requesterUserId: userId },
      { ownerUserId: userId },
      { cabGroup: { members: { some: { userId } } } },
    ],
  };
}

/**
 * W7.65 (`BA-changes-09`): visibility is not a boolean. A change outside the
 * reader's unit scope stays visible to its requester, its owner and the members
 * of its CAB group — but those roles need different slices of the record, not
 * the whole planning document with foreign assets, problem links, event diffs
 * and vote comments.
 *
 * - `full`        the change is inside the unit scope of `change.read`
 * - `participant` requester or owner outside the scope: they own the plan
 * - `voter`       CAB member outside the scope **with** `change.approve`
 * - `observer`    CAB member outside the scope without `change.approve`
 *
 * `observer` is also the fail-closed fallback: if the row is readable through
 * none of the clauses above, the least privileged projection is the safe one.
 */
export type ChangeDetailLevel = 'full' | 'participant' | 'voter' | 'observer';

export function changeDetailLevel(input: {
  readonly inScope: boolean;
  readonly isRequester: boolean;
  readonly isOwner: boolean;
  readonly isCabMember: boolean;
  readonly canApprove: boolean;
}): ChangeDetailLevel {
  if (input.inScope) return 'full';
  if (input.isRequester || input.isOwner) return 'participant';
  if (input.isCabMember) return input.canApprove ? 'voter' : 'observer';
  return 'observer';
}

/**
 * W7.65: events are readable by every participant, but the raw `detail` is a
 * field-level diff of the planning record (`changes`, `textChanged`, service and
 * asset link lists), approval comments and the frozen voter snapshot. Outside
 * the change's scope only the lifecycle facts survive.
 */
const participantEventDetailKeys = [
  'from',
  'to',
  'action',
  'outcome',
  'reason',
  'round',
  'decision',
  'quorum',
  'approvals',
  'created',
  'updated',
  'deleted',
  'frozen',
] as const;

export function projectChangeEventDetail(
  detail: Prisma.JsonValue,
  level: ChangeDetailLevel,
): Prisma.JsonValue {
  if (typeof detail !== 'object' || detail === null || Array.isArray(detail)) {
    return {};
  }
  const source = detail as { readonly [key: string]: Prisma.JsonValue };
  if (level === 'full') return source;
  const projected: { [key: string]: Prisma.JsonValue } = {};
  for (const key of participantEventDetailKeys) {
    const value = source[key];
    if (value !== undefined && value !== null) projected[key] = value;
  }
  return projected;
}
