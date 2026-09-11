import { PrismaService } from '../../common/prisma/prisma.service';
import {
  findInstallSeedServiceCandidate,
  isOfferedInstallSeedService,
} from './find-install-seed-service-candidate';
import type { InstallSeedContext, InstallSeedService } from './install-seed.types';
import {
  activateInstallSeedService,
  persistInstallSeedService,
} from './persist-install-seed-service';

export type EnsuredInstallSeedService = {
  readonly service: InstallSeedService;
  readonly categoryCreated: boolean;
  readonly serviceCreated: boolean;
};

export async function ensureInstallSeedService(
  prisma: PrismaService,
  originUnitId: string,
  fallbackGroupId: string | null,
  context: InstallSeedContext,
): Promise<EnsuredInstallSeedService> {
  const existing = await findInstallSeedServiceCandidate(
    prisma,
    originUnitId,
    fallbackGroupId,
  );
  if (existing !== null) {
    const service = isOfferedInstallSeedService(existing)
      ? existing
      : await activateInstallSeedService(
          prisma,
          existing,
          context.actorUserId,
          context.lifecycle,
        );
    return { service, categoryCreated: false, serviceCreated: false };
  }
  const persisted = await persistInstallSeedService(
    prisma,
    context.actorUserId,
    context.lifecycle,
  );
  return {
    service: await activateInstallSeedService(
      prisma,
      persisted.service,
      context.actorUserId,
      context.lifecycle,
    ),
    categoryCreated: persisted.categoryCreated,
    serviceCreated: persisted.serviceCreated,
  };
}
