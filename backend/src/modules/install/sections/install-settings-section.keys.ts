/**
 * Install wizard v2 (F5): the settings sections of the Full package.
 *
 * The key list is a **leaf** module on purpose (no imports, no side effects): the
 * settings module declares one marker pair per section step and the install
 * module derives the wizard steps from the sections, so both would otherwise have
 * to import each other. A section key is stable once released — it is part of the
 * step key (`section.<key>`), of the markers and of the i18n keys.
 */
export const installSettingsSectionKeys = [
  'inboundEmail',
  'directory',
  'knowledgeBase',
  'statusPage',
  'onCall',
  'announcements',
  'security',
  'privacy',
  'auditWebhook',
  'itsm',
  'integrations',
] as const;

export type InstallSettingsSectionKey = (typeof installSettingsSectionKeys)[number];

/** Wizard step key of a section: `section.inboundEmail`, … */
export type InstallSectionStepKey = `section.${InstallSettingsSectionKey}`;

export const installSectionStepPrefix = 'section.' as const;

export function resolveInstallSectionStepKey(
  sectionKey: InstallSettingsSectionKey,
): InstallSectionStepKey {
  return `${installSectionStepPrefix}${sectionKey}`;
}

export const installSectionStepKeys: readonly InstallSectionStepKey[] =
  installSettingsSectionKeys.map(resolveInstallSectionStepKey);

export function isInstallSettingsSectionKey(value: unknown): value is InstallSettingsSectionKey {
  return (
    typeof value === 'string' && (installSettingsSectionKeys as readonly string[]).includes(value)
  );
}

/** The section a step key belongs to, or `null` for every other step. */
export function readInstallSectionKeyFromStep(stepKey: string): InstallSettingsSectionKey | null {
  if (!stepKey.startsWith(installSectionStepPrefix)) {
    return null;
  }
  const sectionKey = stepKey.slice(installSectionStepPrefix.length);
  return isInstallSettingsSectionKey(sectionKey) ? sectionKey : null;
}
