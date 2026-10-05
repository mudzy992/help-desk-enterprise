import { invalidateOrganizationalUnitScopeCache } from '../../common/cache/scope-catalog-cache';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { PolicyPackApplyTarget } from './policy-pack.types';

export interface PolicyPackUnbindResult {
  readonly unboundOrganizationalUnit: boolean;
  readonly unboundService: boolean;
}

/**
 * M5 B5 (val 5): the bind half of `bindPolicyPackTargets`. A target keeps the
 * pack it points at unless that pack is the one being removed — unapplying
 * pack A must never silently unhook pack B from the same unit or service.
 */
export async function unbindPolicyPackTargets(
  prisma: PrismaService,
  policyPackId: string,
  target: PolicyPackApplyTarget,
): Promise<PolicyPackUnbindResult> {
  let unboundOrganizationalUnit = false;
  let unboundService = false;
  if (target.organizationalUnitId !== null) {
    const unit = await prisma.organizationalUnit.findUnique({
      where: { id: target.organizationalUnitId },
      select: { id: true, policyPackId: true },
    });
    if (unit !== null && unit.policyPackId === policyPackId) {
      await prisma.organizationalUnit.update({
        where: { id: target.organizationalUnitId },
        data: { policyPackId: null },
      });
      invalidateOrganizationalUnitScopeCache();
      unboundOrganizationalUnit = true;
    }
  }
  if (target.serviceId !== null) {
    const service = await prisma.service.findUnique({
      where: { id: target.serviceId },
      select: { id: true, policyPackId: true },
    });
    if (service !== null && service.policyPackId === policyPackId) {
      await prisma.service.update({
        where: { id: target.serviceId },
        data: { policyPackId: null },
      });
      unboundService = true;
    }
  }
  return { unboundOrganizationalUnit, unboundService };
}
