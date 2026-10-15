import type { PrismaService } from '../../../common/prisma/prisma.service';
import { invalidateConfigurationCachesAfter } from '../../settings/invalidate-configuration-caches';
import type { ServiceLifecycleConfiguration } from '../../service-catalog/service-catalog.types';
import type { ServiceFormsConfiguration } from '../../service-catalog/service-forms.types';
import { ensureInstallSeedRouting } from '../ensure-install-seed-routing';
import type { InstallSeedSlaProfile } from '../install-seed-sla-profile';
import type { RoutingConfiguration } from '../../routing/routing.types';
import { assertInstallBlueprintRouting } from './assert-install-blueprint-routing';
import { ensureInstallBlueprintCategory } from './ensure-install-blueprint-category';
import {
  ensureInstallBlueprintGroup,
  type EnsuredInstallBlueprintGroup,
} from './ensure-install-blueprint-group';
import { ensureInstallBlueprintService } from './ensure-install-blueprint-service';
import { installBlueprintErrorCodes } from './install-blueprint.constants';
import { InstallBlueprintError } from './install-blueprint.error';
import type {
  InstallBlueprint,
  InstallBlueprintAppliedService,
  InstallBlueprintApplyResult,
  InstallBlueprintCategoryDefinition,
  InstallBlueprintLocale,
  InstallBlueprintServiceDefinition,
} from './install-blueprint.types';

/**
 * F4.2: applies a blueprint in one transaction — categories, request types with
 * an ACTIVE form version and their SLA profile, an optional L1 group, and a
 * routing rule for every created request type. Everything is matched by slug or
 * group key, so the step is idempotent (acceptance criterion: „Ponovno
 * primjenjivanje blueprinta ne duplira zapise“).
 */
export async function applyInstallBlueprint(
  prisma: PrismaService,
  input: {
    readonly blueprint: InstallBlueprint;
    readonly locale: InstallBlueprintLocale;
    readonly includeServices?: readonly string[];
    readonly createTierGroups: boolean;
    readonly originUnitId: string;
    readonly handlerGroupId: string;
    readonly actorUserId: string;
    readonly lifecycle: ServiceLifecycleConfiguration;
    readonly routing: RoutingConfiguration;
    readonly forms: ServiceFormsConfiguration;
    readonly slaProfile: InstallSeedSlaProfile | null;
  },
): Promise<InstallBlueprintApplyResult> {
  const selection = selectBlueprintServices(input.blueprint, input.includeServices);
  return invalidateConfigurationCachesAfter(
    prisma.$transaction(async (transaction) => {
      const client = transaction as PrismaService;
      const tierGroups = input.createTierGroups
        ? await createBlueprintTierGroups(client, input)
        : [];
      // Every request type of the selected set routes to tier 1 when the operator
      // asked for tier groups, otherwise straight to the seeded handler group.
      const routingGroupId = tierGroups[0]?.id ?? input.handlerGroupId;
      const services: InstallBlueprintAppliedService[] = [];
      let createdCategoryCount = 0;
      for (const [index, category] of selection.categories.entries()) {
        const ensuredCategory = await ensureInstallBlueprintCategory(client, {
          definition: category.definition,
          locale: input.locale,
          sortOrder: index + 1,
          actorUserId: input.actorUserId,
        });
        if (ensuredCategory.created) {
          createdCategoryCount += 1;
        }
        for (const serviceDefinition of category.services) {
          const ensuredService = await ensureInstallBlueprintService(client, {
            definition: serviceDefinition,
            locale: input.locale,
            categoryId: ensuredCategory.id,
            slaProfile: input.slaProfile,
            actorUserId: input.actorUserId,
            lifecycle: input.lifecycle,
            forms: input.forms,
          });
          await ensureInstallSeedRouting(client, {
            originUnitId: input.originUnitId,
            serviceId: ensuredService.service.id,
            groupId: routingGroupId,
            actorUserId: input.actorUserId,
            routing: input.routing,
          });
          services.push({
            key: serviceDefinition.key,
            categoryKey: category.definition.key,
            serviceId: ensuredService.service.id,
            name: ensuredService.service.name,
            slug: ensuredService.service.slug,
            created: ensuredService.created,
            routed: true,
          });
        }
      }
      await assertInstallBlueprintRouting(client, {
        originUnitId: input.originUnitId,
        serviceIds: services.map((service) => service.serviceId),
        routing: input.routing,
      });
      return {
        blueprintKey: input.blueprint.key,
        locale: input.locale,
        createdCategoryCount,
        createdServiceCount: services.filter((service) => service.created).length,
        existingServiceCount: services.filter((service) => !service.created).length,
        createdTierGroupCount: tierGroups.filter((group) => group.created).length,
        tierGroupKeys: tierGroups.map((group) => group.groupKey),
        services,
      };
    }),
  );
}

async function createBlueprintTierGroups(
  prisma: PrismaService,
  input: {
    readonly blueprint: InstallBlueprint;
    readonly locale: InstallBlueprintLocale;
    readonly originUnitId: string;
    readonly actorUserId: string;
  },
) {
  const ensured: EnsuredInstallBlueprintGroup[] = [];
  for (const definition of input.blueprint.tierGroups) {
    ensured.push(
      await ensureInstallBlueprintGroup(prisma, {
        definition,
        locale: input.locale,
        organizationalUnitId: input.originUnitId,
        actorUserId: input.actorUserId,
      }),
    );
  }
  return ensured;
}

type BlueprintSelection = {
  readonly categories: readonly {
    readonly definition: InstallBlueprintCategoryDefinition;
    readonly services: readonly InstallBlueprintServiceDefinition[];
  }[];
};

/**
 * `includeServices` is the UI's per-service switch. An unknown key is an error,
 * not a silent no-op: the wizard would otherwise report a catalog it never built.
 */
function selectBlueprintServices(
  blueprint: InstallBlueprint,
  includeServices: readonly string[] | undefined,
): BlueprintSelection {
  const known = new Set(
    blueprint.categories.flatMap((category) =>
      category.services.map((service) => service.key),
    ),
  );
  for (const key of includeServices ?? []) {
    if (!known.has(key)) {
      throw new InstallBlueprintError(
        installBlueprintErrorCodes.unknownService,
      );
    }
  }
  const wanted = includeServices === undefined ? null : new Set(includeServices);
  const categories = blueprint.categories
    .map((category) => ({
      definition: category,
      services: category.services.filter(
        (service) => wanted === null || wanted.has(service.key),
      ),
    }))
    .filter((category) => category.services.length > 0);
  if (categories.length === 0) {
    throw new InstallBlueprintError(installBlueprintErrorCodes.unknownService);
  }
  return { categories };
}
