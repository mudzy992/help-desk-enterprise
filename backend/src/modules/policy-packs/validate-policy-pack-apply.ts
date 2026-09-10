import { PrismaService } from '../../common/prisma/prisma.service';
import { planPolicyPackAssignments } from './plan-policy-pack-apply';
import { resolvePolicyPackApplyTarget } from './resolve-policy-pack-apply-target';
import type {
  PolicyPackApplyInput,
  PolicyPackValidateResult,
} from './policy-pack.types';

export async function validatePolicyPackApply(
  prisma: PrismaService,
  input: PolicyPackApplyInput,
): Promise<PolicyPackValidateResult> {
  const target = await resolvePolicyPackApplyTarget(prisma, input);
  return {
    packKey: target.pack.key,
    name: target.pack.name,
    valid: true,
    organizationalUnitId: target.organizationalUnitId,
    organizationalUnitPath: target.organizationalUnitPath,
    serviceId: target.serviceId,
    userIds: target.userIds,
    plannedAssignments: planPolicyPackAssignments(target),
  };
}
