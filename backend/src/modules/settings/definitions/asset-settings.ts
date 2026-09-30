import { defaultTransferNumberFormat, validateTransferNumberFormat } from '../../assets/transfers/transfer-number';
import { definePrivateSetting } from '../registry/define-setting';
import { settingCategoryIds } from '../setting-categories';
import { settingKeys } from '../setting-keys';
import { SettingsError } from '../settings.error';
import type { SettingDefinition } from '../settings.types';

/**
 * Paket 3.2 (§15): CMDB defaults, also used when a value is missing. The
 * module itself is switched on by the `private.addons.cmdb` addon.
 */
export const assetDefaults = {
  ticketPickerEnabled: true,
  /** C9c: physical locations are optional; off = the unit path is the place. */
  locationsEnabled: false,
  tagAutoGenerate: true,
  tagPrefix: 'INV-',
  currency: 'BAM',
  frequentFailureCount: 3,
  frequentFailureDays: 90,
  remindersEnabled: true,
  remindersDaysBefore: '60,30,7',
  remindersRecipients: '',
  importMaxRows: 5000,
  importMaxFileMb: 5,
  transferEnabled: true,
  transferRequired: false,
  transferNumberFormat: defaultTransferNumberFormat,
  transferWarehouseLabel: '',
  transferPlace: '',
  transferDefaultSignatoryUserId: '',
  directorySyncEnabled: false,
  directorySyncIntervalHours: 6,
  directorySyncBaseDn: '',
  directorySyncIncludeDisabled: false,
  directorySyncTypeKey: 'computer',
  directorySyncServerTypeKey: 'server',
  directorySyncUserMatch: 'managedBy,namePattern',
  directorySyncNamePattern: '',
  directorySyncDefaultOrganizationalUnitId: '',
} as const;

export const assetUserMatchStrategies = ['managedBy', 'namePattern', 'description'] as const;

function integerIn(min: number, max: number, message: string) {
  return (value: unknown) => {
    if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) {
      throw new SettingsError(message);
    }
  };
}

function stringMax(max: number, message: string) {
  return (value: unknown) => {
    if (typeof value !== 'string' || value.length > max) throw new SettingsError(message);
  };
}

/** "60,30,7" -> [60, 30, 7] (unique, 1-365, descending); invalid input -> null. */
export function parseReminderDays(value: unknown): number[] | null {
  if (typeof value !== 'string') return null;
  const parts = value
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  if (parts.length === 0 || parts.length > 6) return null;
  const days = parts.map((part) => Number(part));
  if (days.some((day) => !Number.isInteger(day) || day < 1 || day > 365)) return null;
  return [...new Set(days)].sort((left, right) => right - left);
}

export function parseUserMatch(value: unknown): (typeof assetUserMatchStrategies)[number][] | null {
  if (typeof value !== 'string') return null;
  const parts = value
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  if (parts.some((part) => !(assetUserMatchStrategies as readonly string[]).includes(part))) return null;
  return [...new Set(parts)] as (typeof assetUserMatchStrategies)[number][];
}

/** Regex with a named group `login`; empty = not used. */
export function assertNamePattern(value: unknown): void {
  if (typeof value !== 'string' || value.length > 200) throw new SettingsError('Name pattern must be at most 200 characters');
  if (value === '') return;
  try {
    const pattern = new RegExp(value, 'i');
    if (!pattern.source.includes('(?<login>')) throw new SettingsError('Name pattern needs a named group (?<login>...)');
  } catch (error) {
    if (error instanceof SettingsError) throw error;
    throw new SettingsError('Name pattern is not a valid regular expression');
  }
}

const category = settingCategoryIds.privateAssets;

export const assetSettings: readonly SettingDefinition[] = [
  definePrivateSetting({
    key: settingKeys.privateAssetsTicketPickerEnabled,
    categoryId: category,
    valueType: 'boolean',
    description: 'Users may pick their own equipment when creating a ticket',
    isRequired: true,
    defaultValue: assetDefaults.ticketPickerEnabled,
  }),
  definePrivateSetting({
    key: settingKeys.privateAssetsLocationsEnabled,
    categoryId: category,
    valueType: 'boolean',
    description: 'Track physical locations (building, floor, room); off = the organizational unit path is shown as the place and stored locations are kept',
    isRequired: true,
    defaultValue: assetDefaults.locationsEnabled,
  }),
  definePrivateSetting({
    key: settingKeys.privateAssetsTagAutoGenerate,
    categoryId: category,
    valueType: 'boolean',
    description: 'Generate the inventory number when it is left empty ({prefix}{year}-{number})',
    isRequired: true,
    defaultValue: assetDefaults.tagAutoGenerate,
  }),
  definePrivateSetting({
    key: settingKeys.privateAssetsTagPrefix,
    categoryId: category,
    valueType: 'string',
    description: 'Prefix of generated inventory numbers (letters, digits, - or /; at most 12)',
    isRequired: true,
    defaultValue: assetDefaults.tagPrefix,
    assertValue: (value) => {
      if (typeof value !== 'string' || !/^[A-Za-z0-9/-]{0,12}$/.test(value)) {
        throw new SettingsError('Prefix: at most 12 letters, digits, - or /');
      }
    },
  }),
  definePrivateSetting({
    key: settingKeys.privateAssetsCurrency,
    categoryId: category,
    valueType: 'string',
    description: 'Currency of purchase prices (ISO 4217 code, e.g. BAM or EUR)',
    isRequired: true,
    defaultValue: assetDefaults.currency,
    assertValue: (value) => {
      if (typeof value !== 'string' || !/^[A-Z]{3}$/.test(value)) throw new SettingsError('Currency must be a 3-letter ISO code');
    },
  }),
  definePrivateSetting({
    key: settingKeys.privateAssetsFrequentFailureCount,
    categoryId: category,
    valueType: 'number',
    description: '"Frequent failures" warning: number of tickets (2-50)',
    isRequired: true,
    defaultValue: assetDefaults.frequentFailureCount,
    assertValue: integerIn(2, 50, 'Count must be 2-50'),
  }),
  definePrivateSetting({
    key: settingKeys.privateAssetsFrequentFailureDays,
    categoryId: category,
    valueType: 'number',
    description: '"Frequent failures" warning: within this many days (7-365)',
    isRequired: true,
    defaultValue: assetDefaults.frequentFailureDays,
    assertValue: integerIn(7, 365, 'Days must be 7-365'),
  }),
  definePrivateSetting({
    key: settingKeys.privateAssetsRemindersEnabled,
    categoryId: category,
    valueType: 'boolean',
    description: 'Remind before warranties, contracts and licences expire',
    isRequired: true,
    defaultValue: assetDefaults.remindersEnabled,
  }),
  definePrivateSetting({
    key: settingKeys.privateAssetsRemindersDaysBefore,
    categoryId: category,
    valueType: 'string',
    description: 'Reminder thresholds in days before expiry, comma separated (1-365, at most 6)',
    isRequired: true,
    defaultValue: assetDefaults.remindersDaysBefore,
    assertValue: (value) => {
      if (parseReminderDays(value) === null) throw new SettingsError('Thresholds: 1-6 whole numbers 1-365, comma separated');
    },
  }),
  definePrivateSetting({
    key: settingKeys.privateAssetsRemindersRecipients,
    categoryId: category,
    valueType: 'string',
    description: 'Extra internal e-mail recipients of expiry reminders, comma separated',
    isRequired: false,
    defaultValue: assetDefaults.remindersRecipients,
    assertValue: (value) => {
      if (typeof value !== 'string' || value.length > 2000) throw new SettingsError('Recipients: at most 2000 characters');
      const invalid = value
        .split(',')
        .map((part) => part.trim())
        .filter((part) => part.length > 0)
        .some((part) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(part));
      if (invalid) throw new SettingsError('Recipients must be e-mail addresses');
    },
  }),
  definePrivateSetting({
    key: settingKeys.privateAssetsImportMaxRows,
    categoryId: category,
    valueType: 'number',
    description: 'Largest number of rows in one import file (100-20000)',
    isRequired: true,
    defaultValue: assetDefaults.importMaxRows,
    assertValue: integerIn(100, 20_000, 'Rows must be 100-20000'),
  }),
  definePrivateSetting({
    key: settingKeys.privateAssetsImportMaxFileMb,
    categoryId: category,
    valueType: 'number',
    description: 'Largest import file in MB (1-20)',
    isRequired: true,
    defaultValue: assetDefaults.importMaxFileMb,
    assertValue: integerIn(1, 20, 'File size must be 1-20 MB'),
  }),
  definePrivateSetting({
    key: settingKeys.privateAssetsTransferEnabled,
    categoryId: category,
    valueType: 'boolean',
    description: 'Issue a transfer record (DOCX) when equipment moves; off = the move is only recorded in the history',
    isRequired: true,
    defaultValue: assetDefaults.transferEnabled,
  }),
  definePrivateSetting({
    key: settingKeys.privateAssetsTransferRequired,
    categoryId: category,
    valueType: 'boolean',
    description: 'Equipment can only move with a transfer record (assign/return without one is refused)',
    isRequired: true,
    defaultValue: assetDefaults.transferRequired,
  }),
  definePrivateSetting({
    key: settingKeys.privateAssetsTransferNumberFormat,
    categoryId: category,
    valueType: 'string',
    description: 'Transfer number format: {MM}, {YYYY} and {NNNN} (3-6 N) required, {DD} optional; the counter restarts every month',
    isRequired: true,
    defaultValue: assetDefaults.transferNumberFormat,
    assertValue: (value) => {
      const problem = validateTransferNumberFormat(value);
      if (problem !== null) throw new SettingsError(`Invalid transfer number format (${problem})`);
    },
  }),
  definePrivateSetting({
    key: settingKeys.privateAssetsTransferWarehouseLabel,
    categoryId: category,
    valueType: 'string',
    description: 'Text printed when the warehouse hands over or receives (empty = "Skladište"/"Warehouse")',
    isRequired: false,
    defaultValue: assetDefaults.transferWarehouseLabel,
    assertValue: stringMax(120, 'Warehouse label: at most 120 characters'),
  }),
  definePrivateSetting({
    key: settingKeys.privateAssetsTransferPlace,
    categoryId: category,
    valueType: 'string',
    description: 'Place of issue printed on the transfer record (e.g. the city)',
    isRequired: false,
    defaultValue: assetDefaults.transferPlace,
    assertValue: stringMax(120, 'Place: at most 120 characters'),
  }),
  definePrivateSetting({
    key: settingKeys.privateAssetsTransferDefaultSignatoryUserId,
    categoryId: category,
    valueType: 'string',
    description: 'User id of the signatory when no organizational unit in the chain defines one (empty = none)',
    isRequired: false,
    defaultValue: assetDefaults.transferDefaultSignatoryUserId,
    assertValue: stringMax(64, 'User id: at most 64 characters'),
  }),
  definePrivateSetting({
    key: settingKeys.privateAssetsDirectorySyncEnabled,
    categoryId: category,
    valueType: 'boolean',
    description: 'Synchronize computers from Active Directory (needs a working AD connection)',
    isRequired: true,
    defaultValue: assetDefaults.directorySyncEnabled,
  }),
  definePrivateSetting({
    key: settingKeys.privateAssetsDirectorySyncIntervalHours,
    categoryId: category,
    valueType: 'number',
    description: 'Hours between computer synchronizations (1-24)',
    isRequired: true,
    defaultValue: assetDefaults.directorySyncIntervalHours,
    assertValue: integerIn(1, 24, 'Interval must be 1-24 hours'),
  }),
  definePrivateSetting({
    key: settingKeys.privateAssetsDirectorySyncBaseDn,
    categoryId: category,
    valueType: 'string',
    description: 'Base DN searched for computers (empty = the directory base DN); environment-bound',
    isRequired: false,
    defaultValue: assetDefaults.directorySyncBaseDn,
    assertValue: stringMax(500, 'Base DN: at most 500 characters'),
  }),
  definePrivateSetting({
    key: settingKeys.privateAssetsDirectorySyncIncludeDisabled,
    categoryId: category,
    valueType: 'boolean',
    description: 'Also import disabled computer accounts',
    isRequired: true,
    defaultValue: assetDefaults.directorySyncIncludeDisabled,
  }),
  definePrivateSetting({
    key: settingKeys.privateAssetsDirectorySyncTypeKey,
    categoryId: category,
    valueType: 'string',
    description: 'Asset type key for computers from the directory',
    isRequired: true,
    defaultValue: assetDefaults.directorySyncTypeKey,
    assertValue: stringMax(48, 'Type key: at most 48 characters'),
  }),
  definePrivateSetting({
    key: settingKeys.privateAssetsDirectorySyncServerTypeKey,
    categoryId: category,
    valueType: 'string',
    description: 'Asset type key for directory computers whose operating system is a server',
    isRequired: true,
    defaultValue: assetDefaults.directorySyncServerTypeKey,
    assertValue: stringMax(48, 'Type key: at most 48 characters'),
  }),
  definePrivateSetting({
    key: settingKeys.privateAssetsDirectorySyncUserMatch,
    categoryId: category,
    valueType: 'string',
    description: 'Order of linking a computer to a user: managedBy, namePattern, description (comma separated)',
    isRequired: true,
    defaultValue: assetDefaults.directorySyncUserMatch,
    assertValue: (value) => {
      if (parseUserMatch(value) === null) throw new SettingsError('Use managedBy, namePattern and/or description');
    },
  }),
  definePrivateSetting({
    key: settingKeys.privateAssetsDirectorySyncNamePattern,
    categoryId: category,
    valueType: 'string',
    description: 'Regular expression on the computer name with a named group "login", e.g. ^PC-(?<login>[a-z.]+)$',
    isRequired: false,
    defaultValue: assetDefaults.directorySyncNamePattern,
    assertValue: assertNamePattern,
  }),
  definePrivateSetting({
    key: settingKeys.privateAssetsDirectorySyncDefaultOrganizationalUnitId,
    categoryId: category,
    valueType: 'string',
    description: 'Organizational unit id for directory computers whose OU is not mapped (empty = skip them)',
    isRequired: false,
    defaultValue: assetDefaults.directorySyncDefaultOrganizationalUnitId,
    assertValue: stringMax(64, 'Unit id: at most 64 characters'),
  }),
];
