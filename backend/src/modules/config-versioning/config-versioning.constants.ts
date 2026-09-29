export const configSnapshotSchemaVersion = 1;

export const configVersioningScopes = {
  settings: 'settings',
  routing: 'routing',
  sla: 'sla',
  serviceCatalog: 'service_catalog',
  serviceForms: 'service_forms',
  /** Package 1.4 — shared response templates and playbooks. */
  templates: 'templates',
} as const;

export const configVersioningScopeValues = Object.values(
  configVersioningScopes,
);

export const configVersioningShadowSampleSize = 200;

export { auditLogGenesisHash } from '../audit-log/audit-log.constants';

export const configVersioningErrorCodes = {
  disabled: 'CONFIG_VERSIONING_DISABLED',
  rollbackDisabled: 'ROLLBACK_DISABLED',
  shadowDisabled: 'SHADOW_MODE_DISABLED',
  notFound: 'CONFIG_VERSION_NOT_FOUND',
  againstNotFound: 'CONFIG_VERSION_AGAINST_NOT_FOUND',
  invalidSnapshot: 'INVALID_CONFIG_SNAPSHOT',
  validationFailed: 'CONFIG_VALIDATION_FAILED',
  alreadyActive: 'CONFIG_VERSION_ALREADY_ACTIVE',
  noPreviousVersion: 'NO_PREVIOUS_CONFIG_VERSION',
  reasonRequired: 'REASON_REQUIRED',
  applyFailed: 'CONFIG_APPLY_FAILED',
  // Paket 2.9 (K4): config packages.
  packageInvalid: 'CONFIG_PACKAGE_INVALID',
  packageChecksumMismatch: 'CONFIG_PACKAGE_CHECKSUM_MISMATCH',
  packageSignatureInvalid: 'CONFIG_PACKAGE_SIGNATURE_INVALID',
  packageUnsignedNotConfirmed: 'CONFIG_PACKAGE_UNSIGNED_NOT_CONFIRMED',
  packageBlocked: 'CONFIG_PACKAGE_UNRESOLVED_REFERENCES',
  packageSourceInconsistent: 'CONFIG_PACKAGE_SOURCE_INCONSISTENT',
} as const;

export type ConfigVersioningErrorCode =
  (typeof configVersioningErrorCodes)[keyof typeof configVersioningErrorCodes];

export const configVersioningErrorMessages: Record<
  ConfigVersioningErrorCode,
  string
> = {
  CONFIG_VERSIONING_DISABLED: 'Config versioning is disabled',
  ROLLBACK_DISABLED: 'Config version rollback is disabled',
  SHADOW_MODE_DISABLED: 'Config version shadow mode is disabled',
  CONFIG_VERSION_NOT_FOUND: 'Config version was not found',
  CONFIG_VERSION_AGAINST_NOT_FOUND:
    'The comparison config version was not found',
  INVALID_CONFIG_SNAPSHOT: 'Config version snapshot is invalid',
  CONFIG_VALIDATION_FAILED: 'Config version validation failed',
  CONFIG_VERSION_ALREADY_ACTIVE: 'Config version is already active',
  NO_PREVIOUS_CONFIG_VERSION: 'No previous config version is available to restore',
  REASON_REQUIRED: 'A reason is required for this config version change',
  CONFIG_APPLY_FAILED: 'Config version could not be applied to live state',
  CONFIG_PACKAGE_INVALID: 'The file is not a valid configuration package',
  CONFIG_PACKAGE_CHECKSUM_MISMATCH: 'The configuration package was modified after export (checksum mismatch)',
  CONFIG_PACKAGE_SIGNATURE_INVALID: 'The configuration package signature is invalid',
  CONFIG_PACKAGE_UNSIGNED_NOT_CONFIRMED: 'The configuration package is not signed; confirm the import explicitly',
  CONFIG_PACKAGE_UNRESOLVED_REFERENCES: 'The configuration package references entities that do not exist here',
  CONFIG_PACKAGE_SOURCE_INCONSISTENT: 'The source configuration references entities without a natural key',
};
