import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { settingKeys } from '../../settings/setting-keys';
import { SETTINGS_REGISTRY } from '../../settings/settings.registry-token';
import { SettingsService } from '../../settings/settings.service';
import type { SettingsRegistry } from '../../settings/settings.types';
import { resolveInstallSeedSlaProfile } from '../install-seed-sla-profile';
import { findInstallSuperAdmin } from '../find-install-super-admin';
import { persistInstallMarker } from '../persist-install-marker';
import { readInstallMarker } from '../read-install-marker';
import { readInstallSeedStatus } from '../read-install-seed-status';
import { installBlueprintConstants, installBlueprintErrorCodes } from './install-blueprint.constants';
import { InstallBlueprintError } from './install-blueprint.error';
import {
  getInstallBlueprint,
  listInstallBlueprints,
} from './install-blueprint.registry';
import {
  isInstallBlueprintLocale,
  type InstallBlueprintCatalog,
  type InstallBlueprintApplyInput,
  type InstallBlueprintApplyResult,
  type InstallBlueprintLocale,
} from './install-blueprint.types';
import { applyInstallBlueprint } from './apply-install-blueprint';
import { mapInstallBlueprintError } from './map-install-blueprint-error';
import { RoutingConfigurationLoader } from '../../routing/routing-configuration.loader';
import { ServiceFormsConfigurationLoader } from '../../service-catalog/service-forms-configuration.loader';
import { ServiceLifecycleConfigurationLoader } from '../../service-catalog/service-lifecycle-configuration.loader';

/**
 * F4.2: what the catalog step of the wizard talks to. The service resolves the
 * environment (founder, the unit and handler group from the structure step, the
 * SLA profile, the configuration loaders) and leaves the writing to
 * `apply-install-blueprint`, which stays a pure database function with its own
 * transaction.
 */
@Injectable()
export class InstallBlueprintService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settingsService: SettingsService,
    private readonly lifecycleConfigurationLoader: ServiceLifecycleConfigurationLoader,
    private readonly routingConfigurationLoader: RoutingConfigurationLoader,
    private readonly formsConfigurationLoader: ServiceFormsConfigurationLoader,
    @Inject(SETTINGS_REGISTRY) private readonly registry: SettingsRegistry,
  ) {}

  async getCatalog(locale?: string): Promise<InstallBlueprintCatalog> {
    return this.execute(async () => ({
      locale: coerceLocale(locale),
      applied: await readInstallMarker(
        this.settingsService,
        settingKeys.privateInstallBlueprint,
      ),
      blueprints: listInstallBlueprints(),
    }));
  }

  async apply(input: InstallBlueprintApplyInput): Promise<InstallBlueprintApplyResult> {
    return this.execute(async () => {
      const blueprint = getInstallBlueprint(input.blueprintKey);
      if (blueprint === null) {
        throw new InstallBlueprintError(
          installBlueprintErrorCodes.unknownBlueprint,
        );
      }
      const superAdmin = await findInstallSuperAdmin(this.prisma);
      if (superAdmin === null) {
        throw new InstallBlueprintError(
          installBlueprintErrorCodes.superAdminRequired,
        );
      }
      const seed = await readInstallSeedStatus(this.prisma);
      if (seed.organizationalUnit === null || seed.fallbackGroup === null) {
        throw new InstallBlueprintError(
          installBlueprintErrorCodes.structureRequired,
        );
      }
      const locale = coerceLocale(input.locale);
      const result = await applyInstallBlueprint(this.prisma, {
        blueprint,
        locale,
        includeServices: input.includeServices,
        createTierGroups: input.createTierGroups === true,
        originUnitId: seed.organizationalUnit.id,
        handlerGroupId: seed.fallbackGroup.id,
        actorUserId: superAdmin.id,
        lifecycle: await this.lifecycleConfigurationLoader.load(),
        routing: await this.routingConfigurationLoader.load(),
        forms: await this.formsConfigurationLoader.load(),
        slaProfile: await this.resolveSlaProfile(blueprint.slaProfileKey),
      });
      await persistInstallMarker(this.prisma, this.registry, {
        key: settingKeys.privateInstallBlueprint,
        value: blueprint.key,
        actorUserId: superAdmin.id,
        reason: installBlueprintConstants.changeLogReason,
      });
      return result;
    });
  }

  /** The blueprint names its profile; a different deployment falls back to the seed's. */
  private async resolveSlaProfile(slaProfileKey: string) {
    const preferred = await this.prisma.slaProfile.findFirst({
      where: { key: slaProfileKey, isActive: true },
      select: { id: true, key: true },
    });
    return preferred ?? (await resolveInstallSeedSlaProfile(this.prisma));
  }

  private async execute<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      throw mapInstallBlueprintError(error);
    }
  }
}

function coerceLocale(locale: unknown): InstallBlueprintLocale {
  return isInstallBlueprintLocale(locale) ? locale : 'bs';
}
