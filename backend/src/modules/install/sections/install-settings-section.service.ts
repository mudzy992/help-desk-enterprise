import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { redactedSecretPlaceholder } from '../../settings/settings.redaction';
import { SETTINGS_REGISTRY } from '../../settings/settings.registry-token';
import { SettingsService } from '../../settings/settings.service';
import type {
  SettingsMutationInput,
  SettingsRegistry,
  SettingValue,
} from '../../settings/settings.types';
import { findInstallSuperAdmin } from '../find-install-super-admin';
import { persistInstallMarker } from '../persist-install-marker';
import { resolveInstallStepSavedKey } from '../steps/install-step.registry';
import {
  installSettingsSectionConstants,
  installSettingsSectionErrorCodes,
} from './install-settings-section.constants';
import { InstallSettingsSectionError } from './install-settings-section.error';
import {
  installSettingsSections,
  findInstallSettingsSection,
  type InstallSettingsSectionDefinition,
} from './install-settings-section.registry';
import { resolveInstallSectionStepKey } from './install-settings-section.keys';
import { mapInstallSettingsSectionError } from './map-install-settings-section-error';
import { readInstallSectionDependencies } from './read-install-section-dependencies';
import {
  readInstallSettingsSectionStatus,
  readSectionAnswered,
  toInstallSettingsSectionSummary,
} from './read-install-settings-section-status';
import type {
  InstallSettingsSectionInput,
  InstallSettingsSectionStatus,
  InstallSettingsSectionsList,
} from './install-settings-section.types';

/**
 * Install wizard v2 (F5): one generic mechanism for the Full package's content —
 * no service per feature. Reading and writing go through `SettingsService`, so
 * the section inherits every rule the Settings screen has: type and range
 * validation, `requires` of the definitions (with dependent resets), secrets that
 * are never returned readable, the change log and the cache invalidation.
 *
 * What the wizard adds is the boundary: only the allowlist of the section may be
 * read or written, and a dependency-bound section may not switch its main switch
 * on before that dependency exists.
 */
@Injectable()
export class InstallSettingsSectionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settingsService: SettingsService,
    @Inject(SETTINGS_REGISTRY) private readonly registry: SettingsRegistry,
  ) {}

  async list(): Promise<InstallSettingsSectionsList> {
    return this.execute(async () => ({
      sections: await Promise.all(
        installSettingsSections.map(async (definition) =>
          toInstallSettingsSectionSummary(
            definition,
            await readSectionAnswered(this.settingsService, definition),
          ),
        ),
      ),
    }));
  }

  getSection(sectionKey: string): Promise<InstallSettingsSectionStatus> {
    return this.execute(() =>
      readInstallSettingsSectionStatus(
        this.prisma,
        this.settingsService,
        requireSection(sectionKey),
      ),
    );
  }

  saveSection(
    sectionKey: string,
    input: InstallSettingsSectionInput,
  ): Promise<InstallSettingsSectionStatus> {
    return this.execute(async () => {
      const definition = requireSection(sectionKey);
      const superAdmin = await findInstallSuperAdmin(this.prisma);
      if (superAdmin === null) {
        throw new InstallSettingsSectionError(installSettingsSectionErrorCodes.superAdminRequired);
      }
      const values = normalizeValues(definition, input.values);
      await this.assertDependencies(definition, values);
      const mutation: SettingsMutationInput = {
        reason: installSettingsSectionConstants.changeLogReason,
        actorUserId: superAdmin.id,
      };
      // „Sačuvaj“ without a change is a real answer (the operator confirmed the
      // defaults), so an empty payload is allowed: it only writes the marker.
      if (values.length > 0) {
        await this.settingsService.setSettingValues(values, mutation);
      }
      await persistInstallMarker(this.prisma, this.registry, {
        key: resolveInstallStepSavedKey(resolveInstallSectionStepKey(definition.sectionKey)),
        value: true,
        actorUserId: superAdmin.id,
        reason: installSettingsSectionConstants.changeLogReason,
      });
      return readInstallSettingsSectionStatus(this.prisma, this.settingsService, definition);
    });
  }

  private async assertDependencies(
    definition: InstallSettingsSectionDefinition,
    values: readonly { readonly key: string; readonly value: SettingValue }[],
  ): Promise<void> {
    const mainSwitchKey = definition.mainSwitchKey;
    if (mainSwitchKey === undefined) {
      return;
    }
    const turningOn = values.some((entry) => entry.key === mainSwitchKey && entry.value === true);
    if (!turningOn) {
      return;
    }
    const unsatisfied = (
      await readInstallSectionDependencies(this.prisma, this.settingsService, definition.requires)
    ).filter((status) => !status.satisfied);
    if (unsatisfied.length > 0) {
      throw new InstallSettingsSectionError(
        installSettingsSectionErrorCodes.dependencyUnmet,
        `Section ${definition.sectionKey} cannot be switched on yet`,
        { dependencies: unsatisfied.map((status) => status.dependency) },
      );
    }
  }

  private async execute<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      throw mapInstallSettingsSectionError(error);
    }
  }
}

function requireSection(sectionKey: string): InstallSettingsSectionDefinition {
  const definition = findInstallSettingsSection(sectionKey);
  if (definition === undefined) {
    throw new InstallSettingsSectionError(installSettingsSectionErrorCodes.unknownSection);
  }
  return definition;
}

/**
 * The allowlist check and the secret rule in one place: an unknown key is an
 * error (never a silent write), a repeated key is ambiguous, and the redaction
 * placeholder the read handed out is not a value — an operator who did not retype
 * a secret must not overwrite it with „[REDACTED]“.
 */
function normalizeValues(
  definition: InstallSettingsSectionDefinition,
  input: InstallSettingsSectionInput['values'],
): readonly { readonly key: string; readonly value: SettingValue }[] {
  const allowed = new Set(definition.settingKeys);
  const seen = new Set<string>();
  const values: { key: string; value: SettingValue }[] = [];
  for (const entry of input) {
    if (!allowed.has(entry.key)) {
      throw new InstallSettingsSectionError(
        installSettingsSectionErrorCodes.keyNotAllowed,
        `Key ${entry.key} is not part of section ${definition.sectionKey}`,
        { key: entry.key },
      );
    }
    if (seen.has(entry.key)) {
      throw new InstallSettingsSectionError(
        installSettingsSectionErrorCodes.invalidValues,
        `Key ${entry.key} is sent twice`,
        { key: entry.key },
      );
    }
    seen.add(entry.key);
    if (entry.value === redactedSecretPlaceholder) {
      continue;
    }
    values.push({ key: entry.key, value: entry.value });
  }
  return values;
}
