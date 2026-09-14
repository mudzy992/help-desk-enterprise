import {
  defaultObservabilityAuditRetentionDays,
  defaultObservabilityRequestLogRetentionDays,
  defaultSupportBundleRecentLogsMinutes,
} from '../settings/definitions/observability-settings';
import { observabilityErrorCodes } from './observability.constants';
import { ObservabilityError } from './observability.error';
import type { SupportBundleConfiguration } from './observability.types';

export function parseSupportBundleConfiguration(input: {
  readonly auditRetentionDays: unknown;
  readonly requestLogRetentionDays: unknown;
  readonly supportBundleEnabled: unknown;
  readonly includeConfigSnapshot: unknown;
  readonly includeRecentLogs: unknown;
  readonly includeAuditExport: unknown;
  readonly recentLogsMinutes: unknown;
}): SupportBundleConfiguration {
  if (
    typeof input.supportBundleEnabled !== 'boolean' ||
    typeof input.includeConfigSnapshot !== 'boolean' ||
    typeof input.includeRecentLogs !== 'boolean' ||
    typeof input.includeAuditExport !== 'boolean'
  ) {
    throw new ObservabilityError(observabilityErrorCodes.invalidConfiguration);
  }
  return {
    auditRetentionDays: readPositiveInteger(
      input.auditRetentionDays,
      defaultObservabilityAuditRetentionDays,
    ),
    requestLogRetentionDays: readPositiveInteger(
      input.requestLogRetentionDays,
      defaultObservabilityRequestLogRetentionDays,
    ),
    supportBundleEnabled: input.supportBundleEnabled,
    includeConfigSnapshot: input.includeConfigSnapshot,
    includeRecentLogs: input.includeRecentLogs,
    includeAuditExport: input.includeAuditExport,
    recentLogsMinutes: readPositiveInteger(
      input.recentLogsMinutes,
      defaultSupportBundleRecentLogsMinutes,
    ),
  };
}

function readPositiveInteger(value: unknown, fallback: number): number {
  const resolved = typeof value === 'number' ? value : fallback;
  if (!Number.isInteger(resolved) || resolved < 1) {
    throw new ObservabilityError(observabilityErrorCodes.invalidConfiguration);
  }
  return resolved;
}
