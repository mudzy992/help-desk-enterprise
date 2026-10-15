/**
 * Install wizard v2 (F5): one change-log reason for everything the sections
 * write, so „who changed this and why“ reads the same in the audit trail as the
 * other wizard steps, and one ceiling for the payload — the biggest section has
 * seven fields, and a save never carries more keys than a section owns.
 */
export const installSettingsSectionConstants = {
  changeLogReason: 'install_wizard',
  maxValuesPerSave: 24,
} as const;

export const installSettingsSectionErrorCodes = {
  /** The section key is not in the registry (a typo, or an older client). */
  unknownSection: 'INSTALL_SETTINGS_SECTION_UNKNOWN',
  /** The wizard may only write the keys its section declares. */
  keyNotAllowed: 'INSTALL_SETTINGS_SECTION_KEY_NOT_ALLOWED',
  /** No founder account yet: nothing may be written before it exists. */
  superAdminRequired: 'SUPER_ADMIN_REQUIRED',
  /** The section's main switch cannot be turned on while a dependency is unmet. */
  dependencyUnmet: 'INSTALL_SETTINGS_SECTION_DEPENDENCY_UNMET',
  /** The registry rejected a value (type, range, `requires` of the definition). */
  invalidValues: 'INSTALL_SETTINGS_SECTION_INVALID_VALUES',
} as const;
