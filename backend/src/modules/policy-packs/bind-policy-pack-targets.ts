import { PrismaService } from '../../common/prisma/prisma.service';
import type { PolicyPackApplyTarget } from './policy-pack.types';

export async function bindPolicyPackTargets(
  prisma: PrismaService,
  policyPackId: string,
  target: PolicyPackApplyTarget,
): Promise<void> {
  if (target.organizationalUnitId !== null) {
    await prisma.organizationalUnit.update({
      where: { id: target.organizationalUnitId },
      data: { policyPackId },
    });
  }
  if (target.serviceId !== null) {
    await prisma.service.update({
      where: { id: target.serviceId },
      data: { policyPackId },
    });
  }
}
