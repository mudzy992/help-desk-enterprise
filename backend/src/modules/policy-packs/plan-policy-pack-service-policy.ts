import type { PrismaService } from '../../common/prisma/prisma.service';
import type {
  PolicyPackApplyTarget,
  PolicyPackServicePolicyPlan,
} from './policy-pack.types';

export interface PolicyPackServicePolicyPlanResult {
  readonly plan: PolicyPackServicePolicyPlan | null;
  /** The profile id the plan resolved to, or null when there is no profile. */
  readonly slaProfileId: string | null;
}

/**
 * M5 B1 (val 5): plans the bundle part of a pack for a *service* target.
 * Organisational units carry no classification, approval flag or SLA profile,
 * so a pack applied to an OU alone has nothing to write here.
 *
 * The SLA profile is resolved by key against the profiles this installation
 * actually has (the wizard seeds `INCIDENT`, `ACCESS`, `STANDARD_REQUEST`,
 * `FINANCE`, `HR`). A missing profile does not fail the apply — the plan says
 * `slaProfileResolved: false` and the service keeps the profile it had.
 */
export async function planPolicyPackServicePolicy(
  prisma: PrismaService,
  target: PolicyPackApplyTarget,
): Promise<PolicyPackServicePolicyPlanResult> {
  if (target.serviceId === null) {
    return { plan: null, slaProfileId: null };
  }
  const slaProfileKey = target.pack.slaProfileKey;
  let slaProfileId: string | null = null;
  if (slaProfileKey !== null) {
    const profile = await prisma.slaProfile.findUnique({
      where: { key: slaProfileKey },
      select: { id: true },
    });
    slaProfileId = profile?.id ?? null;
  }
  return {
    plan: {
      classification: target.pack.defaultClassification,
      requiresApproval: target.pack.requiresApproval,
      slaProfileKey,
      slaProfileResolved: slaProfileKey === null || slaProfileId !== null,
    },
    slaProfileId,
  };
}
