import type { PrismaService } from '../../common/prisma/prisma.service';
import {
  mapPrincipalUser,
  principalContextInclude,
} from '../../common/principal-context/load-principal-context';
import type { PrincipalContext } from '../../common/principal-context/principal-context.types';
import type { AssetScope } from '../assets/asset-viewer';
import {
  assetViewerFromContext,
  isPathInScope,
  resolveAssetScope,
} from '../assets/asset-viewer';
import { permissionKeys } from '../authorization/authorization.constants';

/**
 * W7.66 (`BA-changes-10`): an owner is not "anybody who holds `change.manage`
 * somewhere" — the assignment has to cover the organizational unit of the
 * change. The scope is resolved with the very same functions the access layer
 * uses for `canManage`, so the picker, the write validation and the drift
 * reconciler cannot drift away from the authorization decision.
 */
export type ChangeOwnerEligibilityReason =
  | 'eligible'
  | 'missing'
  | 'inactive'
  | 'anonymized'
  | 'out_of_scope';

export type ChangeOwnerEligibility = {
  readonly eligible: boolean;
  readonly reason: ChangeOwnerEligibilityReason;
};

const ineligible = (reason: ChangeOwnerEligibilityReason): ChangeOwnerEligibility => ({
  eligible: false,
  reason,
});

/** The `change.manage` unit scope of one principal (same rule as `canManage`). */
export function changeManageScope(
  context: PrincipalContext | null,
  userId: string,
  homeUnitPath: string | null,
): AssetScope {
  return resolveAssetScope(
    assetViewerFromContext(context, userId, 'change.'),
    permissionKeys.changeManage,
    homeUnitPath,
  );
}

/** Pure decision; the caller supplies the already-resolved scope. */
export function ownerEligibilityFrom(input: {
  readonly isActive: boolean;
  readonly anonymized: boolean;
  readonly scope: AssetScope;
  readonly unitPath: string | null;
}): ChangeOwnerEligibility {
  if (!input.isActive) return ineligible('inactive');
  if (input.anonymized) return ineligible('anonymized');
  // A change without a unit path can never be covered by a unit scope.
  if (input.unitPath === null || input.unitPath.trim().length === 0) {
    return ineligible('out_of_scope');
  }
  if (!input.scope.all && input.scope.paths.length === 0) {
    return ineligible('out_of_scope');
  }
  if (!isPathInScope(input.scope, input.unitPath)) return ineligible('out_of_scope');
  return { eligible: true, reason: 'eligible' };
}

/** Everything the eligibility decision needs, loaded once per user. */
export type ChangeOwnerProfile = {
  readonly displayName: string;
  readonly isActive: boolean;
  readonly anonymized: boolean;
  readonly scope: AssetScope;
};

export type ChangeOwnerCandidate = {
  readonly eligibility: ChangeOwnerEligibility;
  /** Null when the user row does not exist at all. */
  readonly displayName: string | null;
};

type CandidateRow = {
  readonly id: string;
  readonly displayName: string;
  readonly isActive: boolean;
  readonly anonymizedAt: Date | null;
  readonly organizationalUnit: { readonly ouPath: string } | null;
};

/**
 * Loads the eligibility inputs for a whole page of users in **one** query, so
 * neither the picker nor the reconciler pays a principal load per row.
 */
export async function changeOwnerProfiles(
  prisma: PrismaService,
  userIds: readonly string[],
): Promise<Map<string, ChangeOwnerProfile>> {
  const result = new Map<string, ChangeOwnerProfile>();
  const unique = [...new Set(userIds)];
  if (unique.length === 0) return result;
  const users = (await prisma.user.findMany({
    where: { id: { in: unique } },
    include: {
      ...principalContextInclude,
      organizationalUnit: { select: { ouPath: true } },
    },
  })) as unknown as readonly CandidateRow[];
  for (const user of users) {
    const context = mapPrincipalUser(user as never);
    result.set(user.id, {
      displayName: user.displayName,
      isActive: user.isActive,
      anonymized: user.anonymizedAt !== null,
      scope: changeManageScope(context, user.id, user.organizationalUnit?.ouPath ?? null),
    });
  }
  return result;
}

/** The per-change half of the decision, given a profile loaded above. */
export function profileEligibility(
  profile: ChangeOwnerProfile | undefined,
  unitPath: string | null,
): ChangeOwnerEligibility {
  if (profile === undefined) return ineligible('missing');
  return ownerEligibilityFrom({
    isActive: profile.isActive,
    anonymized: profile.anonymized,
    scope: profile.scope,
    unitPath,
  });
}

export async function changeOwnerCandidates(
  prisma: PrismaService,
  userIds: readonly string[],
  unitPath: string | null,
): Promise<Map<string, ChangeOwnerCandidate>> {
  const profiles = await changeOwnerProfiles(prisma, userIds);
  const result = new Map<string, ChangeOwnerCandidate>();
  for (const [id, profile] of profiles) {
    result.set(id, {
      displayName: profile.displayName,
      eligibility: profileEligibility(profile, unitPath),
    });
  }
  return result;
}

export async function changeOwnerEligibility(
  prisma: PrismaService,
  ownerUserId: string,
  unitPath: string | null,
): Promise<ChangeOwnerEligibility> {
  const candidates = await changeOwnerCandidates(prisma, [ownerUserId], unitPath);
  return candidates.get(ownerUserId)?.eligibility ?? ineligible('missing');
}

export async function eligibleChangeOwnerIds(
  prisma: PrismaService,
  userIds: readonly string[],
  unitPath: string | null,
): Promise<Set<string>> {
  const candidates = await changeOwnerCandidates(prisma, userIds, unitPath);
  const eligible = new Set<string>();
  for (const [id, candidate] of candidates) {
    if (candidate.eligibility.eligible) eligible.add(id);
  }
  return eligible;
}
