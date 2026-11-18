import type { Prisma } from '../../generated/prisma/client';
import type { PrismaService } from '../../common/prisma/prisma.service';
import { loadPrincipalContext } from '../../common/principal-context/load-principal-context';
import type { PrincipalContext } from '../../common/principal-context/principal-context.types';
import { assetViewerFromContext, isPathInScope, resolveAssetScope, viewerHasPermission } from '../assets/asset-viewer';
import { authorizationRoleKeys, permissionKeys } from '../authorization/authorization.constants';

/**
 * W7.33 (BA-problems-15): who may own a problem.
 *
 * Before this module the rule was "active, not anonymised, member of the group
 * and `problem.manage` **somewhere**". A manager whose grant covers a different
 * unit could therefore own — and be reminded about — a problem of a unit they
 * cannot manage. The owner rule is now the authority rule of this module: the
 * `problem.manage` assignment must cover the problem's organizational unit (or be
 * a cross-unit assignment of ADMIN/SUPER_ADMIN/PROBLEM_MANAGER), plus the group
 * membership the decision of 2026-10-01 asks for.
 *
 * The rule exists twice on purpose, and both copies are tested together:
 *
 * - `evaluateProblemOwnerEligibility` — the exact check. It runs the canonical
 *   viewer/scope resolver (`resolveAssetScope` + `isPathInScope`) that every read
 *   and write path already uses, so a recorded owner cannot pass here and fail
 *   there.
 * - `eligibleProblemOwnerWhere` — the same rule as one Prisma filter, for the
 *   bounded queries (owner picker, group managers, handoff target). Every branch
 *   mirrors one line of `resolveAssetScope`; `problem-owner-eligibility.spec.ts`
 *   pins that mapping.
 */
export type ProblemOwnerIneligibilityReason = 'inactive' | 'not_manager' | 'not_member' | 'out_of_scope';

export type ProblemOwnerEligibility = {
  readonly eligible: boolean;
  readonly reason: ProblemOwnerIneligibilityReason | null;
};

/** Roles whose **global** (unscoped) assignment is cross-unit for problems. */
export const problemCrossUnitRoleKeys = [
  authorizationRoleKeys.admin,
  authorizationRoleKeys.superAdmin,
  authorizationRoleKeys.problemManager,
] as const;

export type ProblemOwnerScope = {
  readonly groupId: string;
  /** The problem's own unit path; the unit whose scope the owner must reach. */
  readonly unitPath: string | null;
  /** Assignment id of the group's unit, when the caller already knows it. */
  readonly groupUnitPath?: string | null;
};

/**
 * The unit and all of its parents in the **stored** format: `ouPath` rows keep
 * their leading slash (`/korisnici`, `/korisnici/it`), so the ancestors must
 * keep it too — `/a/b/c` -> `/a`, `/a/b`, `/a/b/c`.
 *
 * W7.33 shipped this without the prefix and every unit-scoped `problem.manage`
 * grant fell out of the picker, the handoff managers and the notices while the
 * in-memory rule kept accepting the same person (W7.35 fix).
 */
export function problemUnitAncestors(unitPath: string | null): readonly string[] {
  if (unitPath === null) return [];
  const trimmed = unitPath.trim();
  if (trimmed.length === 0 || trimmed === '/') return [];
  const rooted = trimmed.startsWith('/');
  const parts = trimmed.split('/').map((part) => part.trim()).filter((part) => part.length > 0);
  return parts.map((_, index) => `${rooted ? '/' : ''}${parts.slice(0, index + 1).join('/')}`);
}

/**
 * The eligibility rule as a Prisma filter. `unitPath === null` (a problem without
 * a unit) leaves only the cross-unit assignments: nobody else can prove scope.
 */
export function eligibleProblemOwnerWhere(scope: ProblemOwnerScope): Prisma.UserWhereInput {
  const ancestors = problemUnitAncestors(scope.unitPath ?? null);
  const scopeBranches: Prisma.UserRoleWhereInput[] = [
    // A cross-unit role assigned without a unit covers everything.
    {
      AND: [
        { organizationalUnitId: null },
        { serviceId: null },
        { role: { key: { in: [...problemCrossUnitRoleKeys] } } },
      ],
    },
  ];
  if (ancestors.length > 0) {
    // A unit-scoped assignment covers that unit and everything below it.
    scopeBranches.push({
      AND: [{ serviceId: null }, { organizationalUnit: { ouPath: { in: [...ancestors] } } }],
    });
    // An assignment without its own unit falls back to the user's home unit.
    scopeBranches.push({
      AND: [{ organizationalUnitId: null }, { user: { organizationalUnit: { ouPath: { in: [...ancestors] } } } }],
    });
  }
  return {
    isActive: true,
    anonymizedAt: null,
    groupMembers: { some: { groupId: scope.groupId } },
    userRoles: {
      some: {
        role: { rolePermissions: { some: { permission: { key: permissionKeys.problemManage } } } },
        OR: scopeBranches,
      },
    },
  };
}

export type ProblemOwnerEligibilityInput = {
  readonly userId: string;
  readonly groupId: string;
  readonly unitPath: string | null;
  readonly isActive: boolean;
  readonly anonymizedAt: Date | null;
  /** Fresh principal of the recorded owner; null = the account no longer exists. */
  readonly principal: PrincipalContext | null;
  /** Home unit path; the fallback of an assignment that carries no unit. */
  readonly homeUnitPath: string | null;
};

/** The exact rule, evaluated in memory from one fresh principal. */
export function evaluateProblemOwnerEligibility(
  input: ProblemOwnerEligibilityInput,
): ProblemOwnerEligibility {
  if (!input.isActive || input.anonymizedAt !== null || input.principal === null) {
    return { eligible: false, reason: 'inactive' };
  }
  const viewer = assetViewerFromContext(input.principal, input.userId, 'problem.');
  if (!viewerHasPermission(viewer, permissionKeys.problemManage)) {
    return { eligible: false, reason: 'not_manager' };
  }
  if (!input.principal.groupIds.includes(input.groupId)) {
    return { eligible: false, reason: 'not_member' };
  }
  const scope = resolveAssetScope(viewer, permissionKeys.problemManage, input.homeUnitPath);
  if (!isPathInScope(scope, input.unitPath)) {
    return { eligible: false, reason: 'out_of_scope' };
  }
  return { eligible: true, reason: null };
}

/**
 * Fresh check of one recorded owner — the write path and the revoke drift share
 * it, so a revoked grant is seen by both the picker and the reminder.
 */
export async function problemOwnerEligibility(
  prisma: PrismaService,
  input: { readonly userId: string; readonly groupId: string | null; readonly unitPath: string | null },
): Promise<ProblemOwnerEligibility> {
  const [principal, record] = await Promise.all([
    loadPrincipalContext(prisma, input.userId),
    prisma.user.findUnique({
      where: { id: input.userId },
      select: { isActive: true, anonymizedAt: true, organizationalUnit: { select: { ouPath: true } } },
    }),
  ]);
  if (record === null) return { eligible: false, reason: 'inactive' };
  return evaluateProblemOwnerEligibility({
    userId: input.userId,
    groupId: input.groupId ?? '',
    unitPath: input.unitPath,
    isActive: record.isActive,
    anonymizedAt: record.anonymizedAt,
    principal,
    homeUnitPath: record.organizationalUnit?.ouPath ?? null,
  });
}
