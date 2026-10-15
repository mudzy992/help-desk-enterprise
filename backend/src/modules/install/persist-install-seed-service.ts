import { PrismaService } from '../../common/prisma/prisma.service';
import { assertCategoryParentIsValid } from '../service-catalog/assert-category-parent-is-valid';
import { assertServiceCategoryExists } from '../service-catalog/assert-service-category-exists';
import {
  assertServiceLifecycleTransition,
  isAllowedServiceLifecycleState,
} from '../service-catalog/assert-service-lifecycle-transition';
import {
  assertServiceCategorySlugIsAvailable,
  assertServiceSlugIsAvailable,
} from '../service-catalog/assert-slug-is-available';
import { normalizeServiceName } from '../service-catalog/normalize-service-name';
import { normalizeServiceSlug } from '../service-catalog/normalize-service-slug';
import {
  recordServiceCatalogChange,
  serviceCategoryChangeLogEntityType,
  serviceChangeLogEntityType,
} from '../service-catalog/record-service-catalog-change';
import { ServiceCatalogError } from '../service-catalog/service-catalog.error';
import type { ServiceLifecycleConfiguration } from '../service-catalog/service-catalog.types';
import { toSeedService } from './find-install-seed-service-candidate';
import { defaultInstallSeedNames, type InstallSeedNames } from './install-seed.names';
import type { InstallSeedSlaContext } from './install-seed.types';
import type { InstallSeedService } from './install-seed.types';

export type PersistedInstallSeedService = {
  readonly service: InstallSeedService;
  /** F2: the category that was used — an existing one keeps its own name. */
  readonly categoryName: string;
  readonly categoryCreated: boolean;
  readonly serviceCreated: boolean;
};

export async function persistInstallSeedService(
  prisma: PrismaService,
  actorUserId: string,
  configuration: ServiceLifecycleConfiguration,
  input: {
    readonly names?: InstallSeedNames;
    readonly slaProfile?: InstallSeedSlaContext;
  } = {},
): Promise<PersistedInstallSeedService> {
  const names = input.names ?? defaultInstallSeedNames;
  const category = await ensureSeedCategory(prisma, actorUserId, names);
  if (
    !isAllowedServiceLifecycleState(
      configuration.defaultStateOnCreate,
      configuration.allowedStates,
    )
  ) {
    throw new ServiceCatalogError('INVALID_LIFECYCLE_STATE');
  }
  await assertServiceCategoryExists(prisma, category.id);
  const name = normalizeServiceName(names.serviceName);
  const slug = normalizeServiceSlug(names.serviceSlug);
  await assertServiceSlugIsAvailable(prisma, slug);
  const created = await prisma.service.create({
    data: {
      name,
      slug,
      categoryId: category.id,
      lifecycle: configuration.defaultStateOnCreate,
      classification: 'INTERNAL',
      requiresApproval: false,
      isConfidentialDefault: false,
      autoAssignStrategy: 'NONE',
      policyPackId: null,
      // F2: a service without SLA has no response clock — the wizard attaches
      // the standard profile (when the deployment seeded one).
      slaProfileId: input.slaProfile?.id ?? null,
    },
  });
  await recordServiceCatalogChange(prisma, {
    entityType: serviceChangeLogEntityType(),
    entityId: created.id,
    reason: 'create',
    diff: {
      after: {
        name,
        slug,
        categoryId: category.id,
        lifecycle: created.lifecycle,
      },
    },
    actorUserId,
  });
  return {
    service: {
      ...toSeedService(created),
      slaProfileKey: input.slaProfile?.key ?? null,
    },
    categoryName: category.name,
    categoryCreated: category.created,
    serviceCreated: true,
  };
}

export async function activateInstallSeedService(
  prisma: PrismaService,
  service: InstallSeedService,
  actorUserId: string,
  configuration: ServiceLifecycleConfiguration,
): Promise<InstallSeedService> {
  if (service.lifecycle === 'ACTIVE') {
    return service;
  }
  assertServiceLifecycleTransition({
    from: service.lifecycle,
    to: 'ACTIVE',
    configuration,
  });
  const updated = await prisma.service.update({
    where: { id: service.id },
    data: { lifecycle: 'ACTIVE' },
  });
  await recordServiceCatalogChange(prisma, {
    entityType: serviceChangeLogEntityType(),
    entityId: updated.id,
    reason: 'lifecycle_transition',
    diff: {
      before: { lifecycle: service.lifecycle, id: service.id, slug: service.slug },
      after: { lifecycle: updated.lifecycle, id: updated.id, slug: updated.slug },
    },
    actorUserId,
  });
  // The activation reloads the row, which only carries `slaProfileId`; the key
  // the seed already resolved is kept so the wizard can show it.
  return { ...toSeedService(updated), slaProfileKey: service.slaProfileKey ?? null };
}

async function ensureSeedCategory(
  prisma: PrismaService,
  actorUserId: string,
  names: InstallSeedNames,
): Promise<{ id: string; name: string; created: boolean }> {
  const bySlug = await prisma.serviceCategory.findUnique({
    where: { slug: names.categorySlug },
    select: { id: true, name: true },
  });
  if (bySlug !== null) {
    return { id: bySlug.id, name: bySlug.name, created: false };
  }
  const existing = await prisma.serviceCategory.findMany();
  if (existing[0] !== undefined) {
    return { id: existing[0].id, name: existing[0].name, created: false };
  }
  const name = normalizeServiceName(names.categoryName);
  const slug = normalizeServiceSlug(names.categorySlug);
  await assertCategoryParentIsValid(prisma, { parentId: null });
  await assertServiceCategorySlugIsAvailable(prisma, slug);
  const created = await prisma.serviceCategory.create({
    data: { name, slug, sortOrder: 0, parentId: null },
  });
  await recordServiceCatalogChange(prisma, {
    entityType: serviceCategoryChangeLogEntityType(),
    entityId: created.id,
    reason: 'create',
    diff: { after: { name, slug, parentId: null } },
    actorUserId,
  });
  return { id: created.id, name: created.name, created: true };
}
