import { parseSupportBundleConfiguration } from './parse-support-bundle-configuration';
import { observabilityErrorCodes } from './observability.constants';

describe('parseSupportBundleConfiguration', () => {
  it('accepts the default numeric retention window', () => {
    expect(
      parseSupportBundleConfiguration({
        auditRetentionDays: 90,
        requestLogRetentionDays: 14,
        supportBundleEnabled: true,
        includeConfigSnapshot: true,
        includeRecentLogs: true,
        includeAuditExport: false,
        recentLogsMinutes: 60,
      }),
    ).toMatchObject({
      supportBundleEnabled: true,
      includeAuditExport: false,
      recentLogsMinutes: 60,
    });
  });

  it('rejects a non-positive recentLogsMinutes', () => {
    expect(() =>
      parseSupportBundleConfiguration({
        auditRetentionDays: 90,
        requestLogRetentionDays: 14,
        supportBundleEnabled: true,
        includeConfigSnapshot: true,
        includeRecentLogs: true,
        includeAuditExport: true,
        recentLogsMinutes: 0,
      }),
    ).toThrow(observabilityErrorCodes.invalidConfiguration);
  });
});
