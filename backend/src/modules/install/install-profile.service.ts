import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { changeLogEntityTypes } from '../change-log/change-log.constants';
import type { ChangeLogPrismaClient } from '../change-log/change-log.types';
import { recordChangeLog } from '../change-log/record-change-log';
import { buildSettingChangeLogDiff } from '../settings/build-setting-change-log-diff';
import { invalidateConfigurationCachesAfter } from '../settings/invalidate-configuration-caches';
import { settingKeys } from '../settings/setting-keys';
import { SETTINGS_REGISTRY } from '../settings/settings.registry-token';
import { getSettingDefaultValue, validateSettingValue } from '../settings/settings-value';
import type { SettingsRegistry } from '../settings/settings.types';
import { SettingsService } from '../settings/settings.service';
import { findInstallSuperAdmin } from './find-install-super-admin';
import { installProfilePackages } from './install-profile.catalog';
import {
  installProfileConstants,
  installProfileErrorCodes,
} from './install-profile.constants';
import { InstallProfileError } from './install-profile.error';
import { mapInstallProfileError } from './map-install-profile-error';
import type {
  InstallProfilePrisma,
  InstallProfileStatus,
  InstallProfileWriteTransaction,
  SaveInstallProfileInput,
} from './install-profile.types';
import {
  planInstallProfileReset,
  type InstallProfileResetPlan,
} from './plan-install-profile-reset';
import {
  readInstallProfile,
  readInstallStepProgress,
} from './read-install-step-states';
import {
  isPackageDowngrade,
  type InstallProfile,
  type InstallStepKey,
} from './steps/install-step.types';
import { resolveInstallStepSkippedKey } from './steps/install-step.registry';
import { upsertInstallSetting } from './upsert-install-setting';

/**
 * Install wizard v2 (F1): the package step. It reads the catalogue
 * (`install-profile.catalog.ts`) and stores the choice in
 * `private.install.profile`.
 *
 * Owner decision 5 lives in `save()`: the package may change as long as the
 * operator is back on the step, and the state of the steps the **new** package
 * does not contain is reset. The reset plan comes from the step registry —
 * nothing is guessed here, and credentials, identity records and seeded data are
 * never erased. Once the initial data exists only an upgrade is accepted.
 */
@Injectable()
export class InstallProfileService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settingsService: SettingsService,
    @Inject(SETTINGS_REGISTRY) private readonly registry: SettingsRegistry,
  ) {}

  async getStatus(): Promise<InstallProfileStatus> {
    return {
      profile: await readInstallProfile(this.settingsService),
      packages: installProfilePackages,
      // Only a package change reopens steps; a plain read never does.
      reopenedSteps: [],
    };
  }

  async save(input: SaveInstallProfileInput): Promise<InstallProfileStatus> {
    try {
      return await this.executeSave(input);
    } catch (error) {
      throw mapInstallProfileError(error);
    }
  }

  private async executeSave(
    input: SaveInstallProfileInput,
  ): Promise<InstallProfileStatus> {
    const { profile: currentProfile, progress } = await readInstallStepProgress(
      this.prisma,
      this.settingsService,
    );
    if (progress.seed.completed && isPackageDowngrade(currentProfile, input.profile)) {
      throw new InstallProfileError(installProfileErrorCodes.downgradeLockedAfterSeed);
    }
    if (currentProfile === input.profile) {
      return this.getStatus();
    }
    const plan = planInstallProfileReset({
      nextProfile: input.profile,
      previousProfile: currentProfile,
    });
    // IN19: only a flag that is actually set reopens a step — the plan lists the
    // steps the new package requires, `progress` says which of them was deferred.
    const reopenedSteps = plan.reopenedStepKeys.filter(
      (stepKey) => progress[stepKey].skipped,
    );
    await this.persistProfile(input.profile, plan, reopenedSteps);
    return { ...(await this.getStatus()), reopenedSteps: [...reopenedSteps] };
  }

  private async persistProfile(
    profile: InstallProfile,
    plan: InstallProfileResetPlan,
    reopenedSteps: readonly InstallStepKey[],
  ): Promise<void> {
    const definition = this.registry.requireDefinition(settingKeys.privateInstallProfile);
    const superAdmin = await findInstallSuperAdmin(this.prisma);
    // The deferrals the change cancels are dropped in the same transaction as the
    // choice itself, so a step can never be "deferred" under a package that asks
    // for it.
    const clearedSkippedKeys = [
      ...plan.clearSkippedKeys,
      ...reopenedSteps.map((stepKey) => resolveInstallStepSkippedKey(stepKey)),
    ];
    await invalidateConfigurationCachesAfter(
      (this.prisma as unknown as InstallProfilePrisma).$transaction(
        async (transaction) => {
          const stored = await transaction.appSetting.findUnique({
            where: { key: definition.key },
            select: { value: true },
          });
          const beforeValue = validateSettingValue(
            definition,
            stored === null
              ? (getSettingDefaultValue(definition) ?? '')
              : stored.value,
          );
          await upsertInstallSetting(transaction, definition, profile);
          await deleteResettableRows(transaction, [
            ...clearedSkippedKeys,
            ...plan.resetSettingKeys,
          ]);
          await recordChangeLog(transaction as unknown as ChangeLogPrismaClient, {
            entityType: changeLogEntityTypes.setting,
            entityId: definition.key,
            reason: installProfileConstants.changeLogReason,
            actorUserId: superAdmin?.id ?? null,
            diff: buildSettingChangeLogDiff({
              definition,
              action: stored === null ? 'create' : 'update',
              beforeValue,
              afterValue: profile,
              // One logical change: the entry names every key the switch drops.
              resetDependents: [
                ...clearedSkippedKeys.map((key) => ({
                  key,
                  action: 'delete' as const,
                })),
                ...plan.resetSettingKeys.map((key) => ({
                  key,
                  action: 'delete' as const,
                })),
              ],
            }),
          });
        },
      ),
    );
  }
}

async function deleteResettableRows(
  transaction: InstallProfileWriteTransaction,
  keys: readonly string[],
): Promise<void> {
  if (keys.length === 0) {
    return;
  }
  await transaction.appSetting.deleteMany({ where: { key: { in: keys } } });
}
