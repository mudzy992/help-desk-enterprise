import { PrismaService } from '../../common/prisma/prisma.service';
import {
  findInstallSeedServiceCandidate,
  isOfferedInstallSeedService,
  toSeedService,
} from './find-install-seed-service-candidate';
import { ensureInstallSeedFormVersion } from './ensure-install-seed-form-version';
import { defaultInstallSeedNames } from './install-seed.names';
import type { InstallSeedContext, InstallSeedService } from './install-seed.types';
import type { InstallSeedSlaContext } from './install-seed.types';
import {
  activateInstallSeedService,
  persistInstallSeedService,
} from './persist-install-seed-service';

export type EnsuredInstallSeedService = {
  readonly service: InstallSeedService;
  /** F2: the category the service ended up in (may be an existing one). */
  readonly categoryName: string;
  readonly categoryCreated: boolean;
  readonly serviceCreated: boolean;
  readonly formVersionCreated: boolean;
};

/**
 * F2: the service is created with the operator's names and the standard SLA
 * profile; a service that already exists (repeated seed, pre-v2 installation)
 * is never renamed — it only gains the SLA profile when it has none.
 */
export async function ensureInstallSeedService(
  prisma: PrismaService,
  originUnitId: string,
  seedHandlerGroupId: string | null,
  context: InstallSeedContext,
  slaProfile: InstallSeedSlaContext = null,
): Promise<EnsuredInstallSeedService> {
  const names = context.names ?? defaultInstallSeedNames;
  const existing = await findInstallSeedServiceCandidate(
    prisma,
    originUnitId,
    seedHandlerGroupId,
    names,
  );
  if (existing !== null) {
    const activated = isOfferedInstallSeedService(existing)
      ? existing
      : await activateInstallSeedService(
          prisma,
          existing,
          context.actorUserId,
          context.lifecycle,
        );
    return withTicketReadyForm(
      prisma,
      await withSlaProfile(prisma, activated, slaProfile),
      context,
      {
        categoryName: await readCategoryName(prisma, activated.id),
        categoryCreated: false,
        serviceCreated: false,
      },
    );
  }
  const persisted = await persistInstallSeedService(
    prisma,
    context.actorUserId,
    context.lifecycle,
    { names, slaProfile },
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
      categoryName: persisted.categoryName,
      categoryCreated: persisted.categoryCreated,
      serviceCreated: persisted.serviceCreated,
    },
  );
}

/** F2: an existing service keeps its category; the step only reports the name. */
async function readCategoryName(
  prisma: PrismaService,
  serviceId: string,
): Promise<string> {
  const service = await prisma.service.findUnique({
    where: { id: serviceId },
    select: { categoryId: true },
  });
  if (service === null) {
    return '';
  }
  const category = await prisma.serviceCategory.findUnique({
    where: { id: service.categoryId },
    select: { name: true },
  });
  return category?.name ?? '';
}

async function withSlaProfile(
  prisma: PrismaService,
  service: InstallSeedService,
  slaProfile: InstallSeedSlaContext,
): Promise<InstallSeedService> {
  if (slaProfile === null || service.slaProfileId === slaProfile.id) {
    return service;
  }
  await prisma.service.update({
    where: { id: service.id },
    data: { slaProfileId: slaProfile.id },
  });
  return { ...service, slaProfileId: slaProfile.id, slaProfileKey: slaProfile.key };
}

async function withTicketReadyForm(
  prisma: PrismaService,
  service: InstallSeedService,
  context: InstallSeedContext,
  flags: {
    readonly categoryName: string;
    readonly categoryCreated: boolean;
    readonly serviceCreated: boolean;
  },
): Promise<EnsuredInstallSeedService> {
  const formVersion = await ensureInstallSeedFormVersion(prisma, {
    serviceId: service.id,
    actorUserId: context.actorUserId,
    forms: context.forms,
  });
  return {
    service: { ...service, activeFormVersionRef: formVersion.formVersionRef },
    categoryName: flags.categoryName,
    categoryCreated: flags.categoryCreated,
    serviceCreated: flags.serviceCreated,
    formVersionCreated: formVersion.created,
  };
}

export { toSeedService };
