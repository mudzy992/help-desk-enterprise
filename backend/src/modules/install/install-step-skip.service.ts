import { Injectable } from '@nestjs/common';
import type { PrismaService } from '../../common/prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import type { SettingsMutationInput } from '../settings/settings.types';
import { findInstallSuperAdmin } from './find-install-super-admin';
import {
  installStepSkipConstants,
  installStepSkipErrorCodes,
} from './install-profile.constants';
import { InstallStepSkipError } from './install-profile.error';
import { mapInstallStepSkipError } from './map-install-profile-error';
import {
  installStepDefinitionByKey,
  resolveInstallStepSkippedKey,
} from './steps/install-step.registry';
import type { InstallStepKey } from './steps/install-step.types';

export type InstallStepSkipStatus = {
  readonly stepKey: InstallStepKey;
  readonly skipped: boolean;
};

/**
 * Install wizard v2 (F1) + owner decision D4: "Podesi kasnije" is a server-side
 * fact (`private.install.steps.<stepKey>.skipped`), not a UI-only toggle — the
 * step must not come back on every refresh, and the post-install checklist reads
 * the same key. Only steps the registry marks `skippable` accept the flag, so the
 * rule lives in one place instead of in the form.
 */
@Injectable()
export class InstallStepSkipService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settingsService: SettingsService,
  ) {}

  skip(stepKey: string): Promise<InstallStepSkipStatus> {
    return this.setSkipped(stepKey, true);
  }

  unskip(stepKey: string): Promise<InstallStepSkipStatus> {
    return this.setSkipped(stepKey, false);
  }

  private async setSkipped(
    stepKey: string,
    skipped: boolean,
  ): Promise<InstallStepSkipStatus> {
    return this.execute(async () => {
      const definition = readDefinition(stepKey);
      if (!definition.skippable) {
        throw new InstallStepSkipError(installStepSkipErrorCodes.notSkippable);
      }
      const superAdmin = await findInstallSuperAdmin(this.prisma);
      if (superAdmin === null) {
        throw new InstallStepSkipError(installStepSkipErrorCodes.superAdminRequired);
      }
      const mutation: SettingsMutationInput = {
        reason: installStepSkipConstants.changeLogReason,
        actorUserId: superAdmin.id,
      };
      await this.settingsService.setSettingValue(
        resolveInstallStepSkippedKey(definition.key),
        skipped,
        mutation,
      );
      return { stepKey: definition.key, skipped };
    });
  }

  private async execute<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      throw mapInstallStepSkipError(error);
    }
  }
}

function readDefinition(stepKey: string) {
  const definition = installStepDefinitionByKey[stepKey as InstallStepKey];
  if (definition === undefined) {
    throw new InstallStepSkipError(installStepSkipErrorCodes.unknownStep);
  }
  return definition;
}
