import { PrismaService } from '../../common/prisma/prisma.service';
import { isServiceOfferedToRequesters } from '../service-catalog/assert-service-lifecycle-transition';
import { installSeedConstants } from './install-seed.constants';
import { findInstallRoutingRule } from './find-install-routing-rule';
import type { InstallSeedService } from './install-seed.types';

export async function findInstallSeedServiceCandidate(
  prisma: PrismaService,
  originUnitId: string,
  seedHandlerGroupId: string | null,
): Promise<InstallSeedService | null> {
  const bySlug = await prisma.service.findUnique({
    where: { slug: installSeedConstants.serviceSlug },
  });
  if (
    bySlug !== null &&
    (await canReuseSeedHandlerGroup(
      prisma,
      originUnitId,
      bySlug.id,
      seedHandlerGroupId,
    ))
  ) {
    return toSeedService(bySlug);
  }
  const offered = await prisma.service.findMany({
    where: { lifecycle: 'ACTIVE' },
  });
  for (const service of offered) {
    if (
      await canReuseSeedHandlerGroup(
        prisma,
        originUnitId,
        service.id,
        seedHandlerGroupId,
      )
    ) {
      return toSeedService(service);
    }
  }
  return null;
}

export async function canReuseSeedHandlerGroup(
  prisma: PrismaService,
  originUnitId: string,
  serviceId: string,
  seedHandlerGroupId: string | null,
): Promise<boolean> {
  const rule = await findInstallRoutingRule(prisma, originUnitId, serviceId);
  if (rule === null) {
    return true;
  }
  return seedHandlerGroupId !== null && rule.groupId === seedHandlerGroupId;
}

export function toSeedService(service: {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
  readonly lifecycle: InstallSeedService['lifecycle'];
}): InstallSeedService {
  return {
    id: service.id,
    name: service.name,
    slug: service.slug,
    lifecycle: service.lifecycle,
  };
}

export function isOfferedInstallSeedService(
  service: InstallSeedService,
): boolean {
  return isServiceOfferedToRequesters(service.lifecycle);
}
