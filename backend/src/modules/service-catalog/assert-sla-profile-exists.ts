import { PrismaService } from '../../common/prisma/prisma.service';
import { ServiceCatalogError } from './service-catalog.error';

export async function assertSlaProfileExists(
  prisma: PrismaService,
  slaProfileId: string | null,
): Promise<void> {
  if (slaProfileId === null) {
    return;
  }
  const profile = await prisma.slaProfile.findUnique({
    where: { id: slaProfileId },
    select: { id: true },
  });
  if (profile === null) {
    throw new ServiceCatalogError('SLA_PROFILE_NOT_FOUND');
  }
}
