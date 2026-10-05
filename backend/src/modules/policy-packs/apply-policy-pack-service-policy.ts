import type { PrismaService } from '../../common/prisma/prisma.service';
import type {
  PolicyPackApplyTarget,
  PolicyPackServicePolicyPlan,
} from './policy-pack.types';

// A type alias, not an interface: interfaces get no implicit index signature and
// would not be assignable to the audit log's `JsonValue` metadata.
export type PolicyPackServicePolicyBefore = {
  readonly classification: string | null;
  readonly requiresApproval: boolean | null;
  readonly slaProfileId: string | null;
}

export type PolicyPackServicePolicyApplied = {
  readonly plan: PolicyPackServicePolicyPlan;
  readonly before: PolicyPackServicePolicyBefore;
}

/**
 * M5 B1 (val 5): writes the bundle fields onto the target service. The previous
 * values are returned so the audit entry can show what the apply replaced —
 * unapply does not roll these back (see the docs), so the audit is the only
 * record of the old configuration.
 */
export async function applyPolicyPackServicePolicy(
  prisma: PrismaService,
  target: PolicyPackApplyTarget,
  plan: PolicyPackServicePolicyPlan,
  slaProfileId: string | null,
): Promise<PolicyPackServicePolicyApplied | null> {
  if (target.serviceId === null) {
    return null;
  }
  const before = await prisma.service.findUnique({
    where: { id: target.serviceId },
    select: { classification: true, requiresApproval: true, slaProfileId: true },
  });
  await prisma.service.update({
    where: { id: target.serviceId },
    data: {
      classification: plan.classification,
      requiresApproval: plan.requiresApproval,
      // Only overwrite the SLA binding when the pack's profile exists here;
      // otherwise the service keeps the profile an admin gave it.
      ...(slaProfileId === null ? {} : { slaProfileId }),
    },
  });
  return {
    plan,
    before: {
      classification: before?.classification ?? null,
      requiresApproval: before?.requiresApproval ?? null,
      slaProfileId: before?.slaProfileId ?? null,
    },
  };
}
