import type { PrismaService } from '../../../common/prisma/prisma.service';
import { assertServiceCategoryExists } from '../../service-catalog/assert-service-category-exists';
import { isAllowedServiceLifecycleState } from '../../service-catalog/assert-service-lifecycle-transition';
import { assertServiceSlugIsAvailable } from '../../service-catalog/assert-slug-is-available';
import { normalizeServiceName } from '../../service-catalog/normalize-service-name';
import { normalizeServiceSlug } from '../../service-catalog/normalize-service-slug';
import {
  recordServiceCatalogChange,
  serviceChangeLogEntityType,
} from '../../service-catalog/record-service-catalog-change';
import { ServiceCatalogError } from '../../service-catalog/service-catalog.error';
import type { ServiceLifecycleConfiguration } from '../../service-catalog/service-catalog.types';
import type { ServiceFormsConfiguration } from '../../service-catalog/service-forms.types';
import { ensureInstallSeedFormVersion } from '../ensure-install-seed-form-version';
import { toSeedService } from '../find-install-seed-service-candidate';
import { activateInstallSeedService } from '../persist-install-seed-service';
import type { InstallSeedSlaProfile } from '../install-seed-sla-profile';
import type { InstallSeedService } from '../install-seed.types';
import type {
  InstallBlueprintLocale,
  InstallBlueprintServiceDefinition,
} from './install-blueprint.types';

export type EnsuredInstallBlueprintService = {
  readonly service: InstallSeedService;
  readonly name: string;
  readonly created: boolean;
  readonly formVersionCreated: boolean;
};

/**
 * F4.2: a request type is matched by slug, so the F2 seed's „Opšti zahtjev“
 * (`opsti-zahtjev`) is recognised instead of created twice. An existing service
 * keeps its name and category; it only gains the SLA profile when it has none and
 * an ACTIVE form version when it has no form yet — the same idempotent rules the
 * seed step follows.
 */
export async function ensureInstallBlueprintService(
  prisma: PrismaService,
  input: {
    readonly definition: InstallBlueprintServiceDefinition;
    readonly locale: InstallBlueprintLocale;
    readonly categoryId: string;
    readonly slaProfile: InstallSeedSlaProfile | null;
    readonly actorUserId: string;
    readonly lifecycle: ServiceLifecycleConfiguration;
    readonly forms: ServiceFormsConfiguration;
  },
): Promise<EnsuredInstallBlueprintService> {
  const existing = await prisma.service.findUnique({
    where: { slug: input.definition.slug },
  });
  const service =
    existing === null
      ? await createBlueprintService(prisma, input)
      : await activateInstallSeedService(
          prisma,
          await withSlaProfile(prisma, toSeedService(existing), input.slaProfile),
          input.actorUserId,
          input.lifecycle,
        );
  const formVersion = await ensureInstallSeedFormVersion(prisma, {
    serviceId: service.id,
    actorUserId: input.actorUserId,
    forms: input.forms,
  });
  return {
    service: { ...service, activeFormVersionRef: formVersion.formVersionRef },
    name: service.name,
    created: existing === null,
    formVersionCreated: formVersion.created,
  };
}

async function createBlueprintService(
  prisma: PrismaService,
  input: Parameters<typeof ensureInstallBlueprintService>[1],
): Promise<InstallSeedService> {
  if (
    !isAllowedServiceLifecycleState(
      input.lifecycle.defaultStateOnCreate,
      input.lifecycle.allowedStates,
    )
  ) {
    throw new ServiceCatalogError('INVALID_LIFECYCLE_STATE');
  }
  await assertServiceCategoryExists(prisma, input.categoryId);
  const name = normalizeServiceName(input.definition.names[input.locale]);
  const slug = normalizeServiceSlug(input.definition.slug);
  await assertServiceSlugIsAvailable(prisma, slug);
  const created = await prisma.service.create({
    data: {
      name,
      slug,
      categoryId: input.categoryId,
      lifecycle: input.lifecycle.defaultStateOnCreate,
      classification: 'INTERNAL',
      requiresApproval: false,
      isConfidentialDefault: false,
      autoAssignStrategy: 'NONE',
      policyPackId: null,
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
        categoryId: input.categoryId,
        lifecycle: created.lifecycle,
      },
    },
    actorUserId: input.actorUserId,
  });
  return { ...toSeedService(created), slaProfileKey: input.slaProfile?.key ?? null };
}

async function withSlaProfile(
  prisma: PrismaService,
  service: InstallSeedService,
  slaProfile: InstallSeedSlaProfile | null,
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
