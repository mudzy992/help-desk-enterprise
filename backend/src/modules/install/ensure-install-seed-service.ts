import { PrismaService } from '../../common/prisma/prisma.service';
import {
  findInstallSeedServiceCandidate,
  isOfferedInstallSeedService,
} from './find-install-seed-service-candidate';
import { ensureInstallSeedFormVersion } from './ensure-install-seed-form-version';
import type { InstallSeedContext, InstallSeedService } from './install-seed.types';
import {
  activateInstallSeedService,
  persistInstallSeedService,
} from './persist-install-seed-service';

export type EnsuredInstallSeedService = {
  readonly service: InstallSeedService;
  readonly categoryCreated: boolean;
  readonly serviceCreated: boolean;
  readonly formVersionCreated: boolean;
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
    return withTicketReadyForm(prisma, service, context, {
      categoryCreated: false,
      serviceCreated: false,
    });
  }
  const persisted = await persistInstallSeedService(
    prisma,
    context.actorUserId,
    context.lifecycle,
  );
  return withTicketReadyForm(
    prisma,
    await activateInstallSeedService(
      prisma,
      persisted.service,
      context.actorUserId,
      context.lifecycle,
    ),
    context,
    {
      categoryCreated: persisted.categoryCreated,
      serviceCreated: persisted.serviceCreated,
    },
  );
}

async function withTicketReadyForm(
  prisma: PrismaService,
  service: InstallSeedService,
  context: InstallSeedContext,
  flags: { readonly categoryCreated: boolean; readonly serviceCreated: boolean },
): Promise<EnsuredInstallSeedService> {
  const formVersion = await ensureInstallSeedFormVersion(prisma, {
    serviceId: service.id,
    actorUserId: context.actorUserId,
    forms: context.forms,
  });
  return {
    service: { ...service, activeFormVersionRef: formVersion.formVersionRef },
    categoryCreated: flags.categoryCreated,
    serviceCreated: flags.serviceCreated,
    formVersionCreated: formVersion.created,
  };
}
