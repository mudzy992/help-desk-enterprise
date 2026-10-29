import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { applyPolicyPack } from '../policy-packs/apply-policy-pack';
import { listPolicyPackDefinitions } from '../policy-packs/policy-pack.registry';
import { readDisabledPolicyPackKeys } from '../policy-packs/read-disabled-policy-pack-keys';
import type { PolicyPackApplyResult } from '../policy-packs/policy-pack.types';
import { settingKeys } from '../settings/setting-keys';
import { SETTINGS_REGISTRY } from '../settings/settings.registry-token';
import { SettingsService } from '../settings/settings.service';
import type { SettingsRegistry } from '../settings/settings.types';
import { installBlueprintConstants } from './blueprints/install-blueprint.constants';
import { getInstallBlueprint } from './blueprints/install-blueprint.registry';
import { findInstallSuperAdmin } from './find-install-super-admin';
import {
  installPolicyPackErrorCodes,
} from './install-policy-pack.constants';
import { InstallPolicyPackError } from './install-policy-pack.error';
import type {
  InstallPolicyPackApplyResult,
  InstallPolicyPackStatus,
} from './install-policy-pack.types';
import { mapInstallPolicyPackError } from './map-install-policy-pack-error';
import { persistInstallMarker } from './persist-install-marker';
import { readInstallMarker } from './read-install-marker';
import { readInstallSeedStatus } from './read-install-seed-status';

/**
 * F4.3: the policy pack step. The wizard offers the packs of the blueprint the
 * catalog step applied and applies the chosen one to the organizational unit from
 * the structure step — through `applyPolicyPack`, the same domain function the
 * Settings screen and `POST /policy-packs/apply` use, so grants, the service
 * policy and the audit entry are identical.
 *
 * It deliberately calls the function instead of injecting `PolicyPacksService`:
 * that module imports Authentication, and importing it here would close the cycle
 * the install module already avoids (see `install.module.ts`). The one thing the
 * domain service adds — refusing a switched-off pack — is done below with the same
 * helper the service uses.
 */
@Injectable()
export class InstallPolicyPackService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settingsService: SettingsService,
    @Inject(SETTINGS_REGISTRY) private readonly registry: SettingsRegistry,
  ) {}

  async getStatus(): Promise<InstallPolicyPackStatus> {
    return this.execute(async () => {
      const offeredKeys = await this.offeredPackKeys();
      return {
        applied: await readInstallMarker(
          this.settingsService,
          settingKeys.privateInstallPolicyPack,
        ),
        blueprint: await this.readAppliedBlueprintKey(),
        packs: listPolicyPackDefinitions()
          .filter((pack) => offeredKeys.includes(pack.key))
          .map((pack) => ({
            key: pack.key,
            name: pack.name,
            description: pack.description,
            defaultClassification: pack.defaultClassification,
            requiresApproval: pack.requiresApproval,
            slaProfileKey: pack.slaProfileKey,
            grantCount: pack.grants.length,
          })),
      };
    });
  }

  async apply(input: {
    readonly policyPackKey: string;
  }): Promise<InstallPolicyPackApplyResult> {
    return this.execute(async () => {
      const offeredKeys = await this.offeredPackKeys();
      if (!offeredKeys.includes(input.policyPackKey)) {
        throw new InstallPolicyPackError(
          installPolicyPackErrorCodes.unknownPack,
        );
      }
      await this.assertPackEnabled(input.policyPackKey);
      const superAdmin = await findInstallSuperAdmin(this.prisma);
      if (superAdmin === null) {
        throw new InstallPolicyPackError(
          installPolicyPackErrorCodes.superAdminRequired,
        );
      }
      const seed = await readInstallSeedStatus(this.prisma);
      if (seed.organizationalUnit === null) {
        throw new InstallPolicyPackError(
          installPolicyPackErrorCodes.structureRequired,
        );
      }
      const result = await applyPolicyPack(
        this.prisma,
        {
          packKey: input.policyPackKey,
          organizationalUnitId: seed.organizationalUnit.id,
          serviceId: seed.service?.id ?? null,
        },
        { actorUserId: superAdmin.id, requestId: null },
      );
      await persistInstallMarker(this.prisma, this.registry, {
        key: settingKeys.privateInstallPolicyPack,
        value: result.packKey,
        actorUserId: superAdmin.id,
        reason: installBlueprintConstants.changeLogReason,
      });
      return toApplyResult(result);
    });
  }

  /** Packs of the applied blueprint; without one, every pack is offered. */
  private async offeredPackKeys(): Promise<readonly string[]> {
    const blueprintKey = await this.readAppliedBlueprintKey();
    if (blueprintKey === null) {
      return listPolicyPackDefinitions().map((pack) => pack.key);
    }
    const blueprint = getInstallBlueprint(blueprintKey);
    return blueprint?.policyPackKeys ?? [];
  }

  private readAppliedBlueprintKey(): Promise<string | null> {
    return readInstallMarker(
      this.settingsService,
      settingKeys.privateInstallBlueprint,
    );
  }

  /** Same rule as `PolicyPacksService.assertPackEnabled`. */
  private async assertPackEnabled(packKey: string): Promise<void> {
    const disabled = await readDisabledPolicyPackKeys(this.settingsService);
    if (disabled.includes(packKey.trim().toUpperCase())) {
      throw new InstallPolicyPackError(installPolicyPackErrorCodes.packDisabled);
    }
  }

  private async execute<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      throw mapInstallPolicyPackError(error);
    }
  }
}

function toApplyResult(
  result: PolicyPackApplyResult,
): InstallPolicyPackApplyResult {
  return {
    policyPackKey: result.packKey,
    name: result.name,
    organizationalUnitId: result.organizationalUnitId,
    serviceId: result.serviceId,
    createdUserRoleCount: result.createdUserRoleCount,
    existingUserRoleCount: result.existingUserRoleCount,
    createdRolePermissionCount: result.createdRolePermissionCount,
    existingRolePermissionCount: result.existingRolePermissionCount,
  };
}
