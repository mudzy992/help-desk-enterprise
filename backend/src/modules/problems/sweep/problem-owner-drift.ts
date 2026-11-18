import type { PrismaService } from '../../../common/prisma/prisma.service';
import {
  mapPrincipalUser,
  principalContextInclude,
} from '../../../common/principal-context/load-principal-context';
import type { PrincipalContext } from '../../../common/principal-context/principal-context.types';
import {
  evaluateProblemOwnerEligibility,
  type ProblemOwnerIneligibilityReason,
} from '../problem-owner-eligibility';
import { problemOpenTargetStatuses } from './problem-operations';

/**
 * W7.33 (BA-problems-15): the revoke-drift reconciliation.
 *
 * A grant can be taken away after the fact: the manager changes role, leaves the
 * group, moves to another unit or is deactivated. Nothing rewrites the problem,
 * on purpose — the record of *who was working on it* stays true — so the drift
 * has to be found by reading. Three readers share the rule
 * (`problem-owner-eligibility`):
 *
 * - the problem detail says why the recorded owner no longer qualifies,
 * - the notifier stops sending owner-directed notices to that owner and lets the
 *   group managers take over,
 * - this scan counts the drift across all open problems, so the operator hears
 *   about it on the health page instead of discovering it one problem at a time.
 *
 * The scan is bounded and read-only: one page of open owned problems, then one
 * query each for their owners and groups (no per-problem round trip). The
 * `capped` flag says the bound was reached, so a count is never mistaken for the
 * whole picture.
 */
export type ProblemOwnerDriftPrisma = Pick<PrismaService, 'problem' | 'user' | 'group'>;

/** Open owned problems per scan; a page, not a full sweep. */
export const problemOwnerDriftScanLimit = 500;

export type ProblemOwnerDriftSignal = {
  /** Open owned problems the scan looked at. */
  readonly scannedProblems: number;
  /** How many of them have an owner who no longer qualifies. */
  readonly ineligibleOwners: number;
  /** The page bound was reached, so more problems may be affected. */
  readonly capped: boolean;
  /** Counts per reason, in the order the rule checks them. */
  readonly reasons: Readonly<Record<ProblemOwnerIneligibilityReason, number>>;
};

const reasonOrder: readonly ProblemOwnerIneligibilityReason[] = [
  'inactive',
  'not_manager',
  'not_member',
  'out_of_scope',
];

/** The owner's principal, read the same way every authorization decision reads it. */
const ownerPrincipalInclude = {
  ...principalContextInclude,
  organizationalUnit: { select: { ouPath: true } },
} as const;

type ScannedOwner = {
  readonly ownerUserId: string;
  readonly groupId: string | null;
  readonly unitPath: string | null;
};

export async function scanProblemOwnerDrift(
  prisma: ProblemOwnerDriftPrisma,
  options: { readonly limit?: number } = {},
): Promise<ProblemOwnerDriftSignal> {
  const limit = options.limit ?? problemOwnerDriftScanLimit;
  const rows = await prisma.problem.findMany({
    where: { ownerUserId: { not: null }, status: { in: [...problemOpenTargetStatuses] } },
    select: {
      ownerUserId: true,
      groupId: true,
      organizationalUnit: { select: { ouPath: true } },
    },
    orderBy: { updatedAt: 'desc' },
    take: limit,
  });
  const reasons: Record<ProblemOwnerIneligibilityReason, number> = {
    inactive: 0,
    not_manager: 0,
    not_member: 0,
    out_of_scope: 0,
  };
  const scanned: ScannedOwner[] = rows.flatMap((row) =>
    row.ownerUserId === null
      ? []
      : [{ ownerUserId: row.ownerUserId, groupId: row.groupId, unitPath: row.organizationalUnit?.ouPath ?? null }],
  );
  if (scanned.length === 0) {
    return { scannedProblems: 0, ineligibleOwners: 0, capped: false, reasons };
  }

  const ownerIds = [...new Set(scanned.map((owner) => owner.ownerUserId))];
  const groupIds = [...new Set(scanned.flatMap((owner) => (owner.groupId === null ? [] : [owner.groupId])))];
  const [owners, groups] = await Promise.all([
    prisma.user.findMany({ where: { id: { in: ownerIds } }, include: ownerPrincipalInclude }),
    groupIds.length === 0
      ? Promise.resolve([] as { id: string; organizationalUnit: { ouPath: string } | null }[])
      : prisma.group.findMany({
          where: { id: { in: groupIds } },
          select: { id: true, organizationalUnit: { select: { ouPath: true } } },
        }),
  ]);

  // Deactivated and anonymised accounts are dropped here on purpose: a missing
  // principal is exactly what the rule reports as `inactive`, so both paths end
  // in the same verdict without a second lookup.
  const ownersById = new Map<string, PrincipalContext & { homeUnitPath: string | null }>();
  for (const owner of owners) {
    if (!owner.isActive || owner.anonymizedAt !== null) continue;
    ownersById.set(owner.id, {
      ...mapPrincipalUser(owner),
      homeUnitPath: owner.organizationalUnit?.ouPath ?? null,
    });
  }
  const groupUnitPaths = new Map<string, string>();
  for (const group of groups) {
    if (group.organizationalUnit !== null) groupUnitPaths.set(group.id, group.organizationalUnit.ouPath);
  }

  let ineligibleOwners = 0;
  for (const owner of scanned) {
    const principal = ownersById.get(owner.ownerUserId) ?? null;
    const eligibility = evaluateProblemOwnerEligibility({
      userId: owner.ownerUserId,
      groupId: owner.groupId ?? '',
      // A legacy problem without its own unit falls back to the group's unit; the
      // rule needs the unit the owner's grant has to cover.
      unitPath: owner.unitPath ?? (owner.groupId === null ? null : (groupUnitPaths.get(owner.groupId) ?? null)),
      isActive: principal !== null,
      anonymizedAt: null,
      principal,
      homeUnitPath: principal?.homeUnitPath ?? null,
    });
    if (eligibility.eligible) continue;
    // A missing, deactivated or anonymised owner row has no principal, and the
    // rule reports that as `inactive`; nothing else can be null here.
    if (eligibility.reason !== null) reasons[eligibility.reason] += 1;
    ineligibleOwners += 1;
  }

  return {
    scannedProblems: scanned.length,
    ineligibleOwners,
    capped: rows.length === limit,
    reasons,
  };
}

/** Reasons in the rule's order, for a stable detail payload. */
export function problemOwnerDriftReasonCounts(
  reasons: Readonly<Record<ProblemOwnerIneligibilityReason, number>>,
): Readonly<Record<string, number>> {
  const detail: Record<string, number> = {};
  for (const reason of reasonOrder) {
    if (reasons[reason] > 0) detail[reason] = reasons[reason];
  }
  return detail;
}
