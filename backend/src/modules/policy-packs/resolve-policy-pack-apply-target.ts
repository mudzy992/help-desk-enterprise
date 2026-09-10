import { PrismaService } from '../../common/prisma/prisma.service';
import { PolicyPackError } from './policy-pack.error';
import { assertPolicyPackDefinition } from './assert-policy-pack-definition';
import {
  readPolicyPackApplyTargetInput,
  resolvePolicyPackFromInput,
} from './plan-policy-pack-apply';
import type {
  PolicyPackApplyInput,
  PolicyPackApplyTarget,
} from './policy-pack.types';

export async function resolvePolicyPackApplyTarget(
  prisma: PrismaService,
  input: PolicyPackApplyInput,
): Promise<PolicyPackApplyTarget> {
  const pack = resolvePolicyPackFromInput(input);
  assertPolicyPackDefinition(pack);
  const parsed = readPolicyPackApplyTargetInput(pack, input);
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
