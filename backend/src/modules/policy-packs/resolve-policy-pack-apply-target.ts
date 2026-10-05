import { PrismaService } from '../../common/prisma/prisma.service';
import { PolicyPackError } from './policy-pack.error';
import { assertPolicyPackDefinition } from './assert-policy-pack-definition';
import {
  readPolicyPackApplyTargetInput,
  readPolicyPackUnapplyTargetInput,
  resolvePolicyPackFromInput,
} from './plan-policy-pack-apply';
import type {
  PolicyPackApplyInput,
  PolicyPackApplyTarget,
} from './policy-pack.types';

async function resolveTarget(
  prisma: PrismaService,
  input: PolicyPackApplyInput,
  readTarget: (
    pack: ReturnType<typeof resolvePolicyPackFromInput>,
    input: PolicyPackApplyInput,
  ) => Pick<
    PolicyPackApplyTarget,
    'organizationalUnitId' | 'serviceId' | 'userIds'
  >,
): Promise<PolicyPackApplyTarget> {
  const pack = resolvePolicyPackFromInput(input);
  assertPolicyPackDefinition(pack);
  const parsed = readTarget(pack, input);
  let organizationalUnitPath: string | null = null;
  if (parsed.organizationalUnitId !== null) {
    const organizationalUnit = await prisma.organizationalUnit.findUnique({
      where: { id: parsed.organizationalUnitId },
      select: { id: true, ouPath: true },
    });
    if (
      organizationalUnit === null ||
      organizationalUnit.ouPath.trim().length === 0
    ) {
      throw new PolicyPackError('UNKNOWN_ORGANIZATIONAL_UNIT');
    }
    organizationalUnitPath = organizationalUnit.ouPath;
  }
  if (parsed.serviceId !== null) {
    const service = await prisma.service.findUnique({
      where: { id: parsed.serviceId },
      select: { id: true },
    });
    if (service === null) {
      throw new PolicyPackError('UNKNOWN_SERVICE');
    }
  }
  if (parsed.userIds.length > 0) {
    const users = await prisma.user.findMany({
      where: { id: { in: [...parsed.userIds] } },
      select: { id: true },
    });
    if (users.length !== parsed.userIds.length) {
      throw new PolicyPackError('UNKNOWN_USER');
    }
  }
  return {
    pack,
    organizationalUnitId: parsed.organizationalUnitId,
    organizationalUnitPath,
    serviceId: parsed.serviceId,
    userIds: parsed.userIds,
  };
}

export function resolvePolicyPackApplyTarget(
  prisma: PrismaService,
  input: PolicyPackApplyInput,
): Promise<PolicyPackApplyTarget> {
  return resolveTarget(prisma, input, readPolicyPackApplyTargetInput);
}

/**
 * M5 B5 (val 5): unapply mirrors apply, but decides nothing about what the pack
 * *needs* — it removes what the given target has got.
 */
export function resolvePolicyPackUnapplyTarget(
  prisma: PrismaService,
  input: PolicyPackApplyInput,
): Promise<PolicyPackApplyTarget> {
  return resolveTarget(prisma, input, readPolicyPackUnapplyTargetInput);
}
