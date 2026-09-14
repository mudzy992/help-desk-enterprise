export const observabilityErrorCodes = {
  disabled: 'SUPPORT_BUNDLE_DISABLED',
  forbidden: 'FORBIDDEN',
  invalidConfiguration: 'SUPPORT_BUNDLE_INVALID_CONFIGURATION',
} as const;

export type ObservabilityErrorCode =
  (typeof observabilityErrorCodes)[keyof typeof observabilityErrorCodes];

export const observabilityErrorMessages: Record<ObservabilityErrorCode, string> =
  {
    SUPPORT_BUNDLE_DISABLED: 'Support bundle export is disabled',
    FORBIDDEN: 'Authorization failed',
    SUPPORT_BUNDLE_INVALID_CONFIGURATION:
      'Support bundle configuration is invalid',
  };

export const supportBundleManifestFileName = 'manifest.json';
export const supportBundleConfigSnapshotFileName = 'config-snapshot.json';
export const supportBundleAuditExportFileName = 'audit-export.json';
export const supportBundleRecentLogsFileName = 'recent-logs.jsonl';
