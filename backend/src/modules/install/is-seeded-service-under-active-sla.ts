import type { PrismaService } from '../../common/prisma/prisma.service';
import { defaultInstallSeedNames } from './install-seed.names';

/**
 * Install wizard v2 (F2): readiness `slaProfile` used to be satisfied by any
 * active profile in the deployment, which says nothing about whether the ticket
 * the operator is about to create has a clock. The check now follows the seeded
 * service: it has to be bound to an active profile.
 */
export async function isSeededServiceUnderActiveSla(
  prisma: PrismaService,
): Promise<boolean> {
  const service = await findSeededService(prisma);
  if (service === null || service.slaProfileId === null) {
    return false;
  }
  const profile = await prisma.slaProfile.findUnique({
    where: { id: service.slaProfileId },
    select: { isActive: true },
  });
  return profile?.isActive === true;
}

async function findSeededService(
  prisma: PrismaService,
): Promise<{ readonly slaProfileId: string | null } | null> {
  const bySlug = await prisma.service.findUnique({
    where: { slug: defaultInstallSeedNames.serviceSlug },
    select: { slaProfileId: true },
  });
  if (bySlug !== null) {
    return bySlug;
  }
  return (
    (
      await prisma.service.findMany({
        where: { lifecycle: 'ACTIVE' },
        select: { slaProfileId: true },
      })
    )[0] ?? null
  );
}
