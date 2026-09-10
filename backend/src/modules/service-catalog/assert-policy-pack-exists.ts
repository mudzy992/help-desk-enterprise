import { PrismaService } from '../../common/prisma/prisma.service';
import { ServiceCatalogError } from './service-catalog.error';

export async function assertPolicyPackExists(
  prisma: PrismaService,
  policyPackId: string | null | undefined,
): Promise<void> {
  if (policyPackId === null || policyPackId === undefined) {
    return;
  }
  const policyPack = await prisma.policyPack.findUnique({
    where: { id: policyPackId },
    select: { id: true },
  });
  if (policyPack === null) {
    throw new ServiceCatalogError('POLICY_PACK_NOT_FOUND');
  }
}
