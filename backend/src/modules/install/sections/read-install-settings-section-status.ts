import type { PrismaService } from '../../../common/prisma/prisma.service';
import type { SettingRegistryEntry } from '../../settings/settings.types';
import type { SettingsService } from '../../settings/settings.service';
import { resolveInstallAddonDefaults } from '../resolve-install-addon-defaults';
import { readInstallProfile } from '../read-install-step-states';
import { resolveInstallSectionStepKey } from './install-settings-section.keys';
import type { InstallSettingsSectionDefinition } from './install-settings-section.registry';
import { readInstallSectionDependencies } from './read-install-section-dependencies';
import { readInstallSectionFieldOptions } from './read-install-section-field-options';
import type {
  InstallSettingsSectionField,
  InstallSettingsSectionStatus,
  InstallSettingsSectionSummary,
} from './install-settings-section.types';
import { resolveInstallStepSavedKey } from '../steps/install-step.registry';

/**
 * Install wizard v2 (F5): one reader for every section — the wizard shows the
 * **definition metadata** the Settings screen shows (title and help from the same
 * i18n slots), so a section never invents a second wording for a setting. Two
 * things are section-specific: the package defaults (Full switches CMDB, problems
 * and changes on) and the allowed values this deployment knows (the service list).
 */
export async function readInstallSettingsSectionStatus(
  prisma: PrismaService,
  settingsService: SettingsService,
  definition: InstallSettingsSectionDefinition,
): Promise<InstallSettingsSectionStatus> {
  const [entries, profile, answered, dependencies] = await Promise.all([
    settingsService.listRegistry(),
    readInstallProfile(settingsService),
    readSectionAnswered(settingsService, definition),
    readInstallSectionDependencies(prisma, settingsService, definition.requires),
  ]);
  const byKey = new Map(entries.map((entry) => [entry.key, entry] as const));
  const packageDefaults = resolveInstallAddonDefaults(profile);
  const fields = await Promise.all(
    definition.settingKeys.map(async (key) =>
      toField(prisma, byKey.get(key), key, definition, packageDefaults),
    ),
  );
  return {
    sectionKey: definition.sectionKey,
    stepKey: resolveInstallSectionStepKey(definition.sectionKey),
    titleKey: titleKeyOf(definition),
    answered,
    dependencies,
    fields,
  };
}

export function toInstallSettingsSectionSummary(
  definition: InstallSettingsSectionDefinition,
  answered: boolean,
): InstallSettingsSectionSummary {
  return {
    sectionKey: definition.sectionKey,
    stepKey: resolveInstallSectionStepKey(definition.sectionKey),
    titleKey: titleKeyOf(definition),
    answered,
    requires: definition.requires,
  };
}

export function titleKeyOf(definition: InstallSettingsSectionDefinition): string {
  return `install.section.${definition.sectionKey}.title`;
}

export async function readSectionAnswered(
  settingsService: SettingsService,
  definition: InstallSettingsSectionDefinition,
): Promise<boolean> {
  const stored = await settingsService.getSetting(
    resolveInstallStepSavedKey(resolveInstallSectionStepKey(definition.sectionKey)),
  );
  return stored === true;
}

async function toField(
  prisma: PrismaService,
  entry: SettingRegistryEntry | undefined,
  key: string,
  definition: InstallSettingsSectionDefinition,
  packageDefaults: Readonly<Record<string, boolean>>,
): Promise<InstallSettingsSectionField> {
  if (entry === undefined) {
    // A definition that is no longer registered is a programming error, not an
    // operator error: the allowlist is checked against the registry in a spec.
    throw new Error(`Unknown setting in section ${definition.sectionKey}: ${key}`);
  }
  const isPackageDefault = definition.packageDefaultKeys?.includes(key) === true && !entry.isSet;
  const packageValue = isPackageDefault
    ? (packageDefaults[addonKeyOf(key)] ?? entry.defaultValue)
    : undefined;
  const options = await readInstallSectionFieldOptions(prisma, key);
  return {
    key,
    valueType: entry.valueType,
    visibility: entry.visibility === 'secret' ? 'secret' : 'private',
    titleKey: entry.titleKey,
    helpKey: entry.helpKey,
    description: entry.description,
    value: packageValue ?? entry.value,
    defaultValue: packageValue ?? entry.defaultValue,
    isSet: entry.isSet,
    isRequired: entry.isRequired,
    group: entry.group,
    definitionRequires: entry.requires,
    ...(entry.allowedValues === undefined ? {} : { allowedValues: entry.allowedValues }),
    ...(entry.inactiveValue === undefined ? {} : { inactiveValue: entry.inactiveValue }),
    ...(options === undefined ? {} : { options }),
  };
}

function addonKeyOf(key: string): string {
  const prefix = 'private.addons.';
  return key.startsWith(prefix) ? key.slice(prefix.length) : key;
}
