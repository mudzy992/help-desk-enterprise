import JSZip from 'jszip';
import { buildSupportBundleArchive } from './build-support-bundle-archive';
import { createSupportBundleManifest } from './create-support-bundle-manifest';
import {
  supportBundleAuditExportFileName,
  supportBundleConfigSnapshotFileName,
  supportBundleManifestFileName,
  supportBundleRecentLogsFileName,
} from './observability.constants';
import type { SupportBundleConfiguration } from './observability.types';

const generatedAt = new Date('2026-09-14T10:00:00.000Z');

function configuration(
  overrides: Partial<SupportBundleConfiguration> = {},
): SupportBundleConfiguration {
  return {
    auditRetentionDays: 90,
    requestLogRetentionDays: 14,
    supportBundleEnabled: true,
    includeConfigSnapshot: true,
    includeRecentLogs: true,
    includeAuditExport: true,
    recentLogsMinutes: 60,
    ...overrides,
  };
}

describe('buildSupportBundleArchive', () => {
  it('includes only the parts allowed by flags', async () => {
    const allOn = await buildSupportBundleArchive({
      generatedAt,
      manifest: createSupportBundleManifest({
        generatedAt,
        requestId: 'req-1',
        actorUserId: 'super-1',
        configuration: configuration(),
        parts: [
          supportBundleManifestFileName,
          supportBundleConfigSnapshotFileName,
          supportBundleAuditExportFileName,
          supportBundleRecentLogsFileName,
        ],
      }),
      configSnapshotJson: '{}\n',
      auditExportJson: '[]\n',
      recentLogsJsonl: '{"message":"hi"}\n',
    });
    const allFiles = Object.keys(await JSZip.loadAsync(allOn.buffer).then((zip) => zip.files));
    expect(allFiles).toEqual(
      expect.arrayContaining([
        supportBundleManifestFileName,
        supportBundleConfigSnapshotFileName,
        supportBundleAuditExportFileName,
        supportBundleRecentLogsFileName,
      ]),
    );

    const flagsOff = await buildSupportBundleArchive({
      generatedAt,
      manifest: createSupportBundleManifest({
        generatedAt,
        requestId: 'req-1',
        actorUserId: 'super-1',
        configuration: configuration({
          includeConfigSnapshot: false,
          includeRecentLogs: false,
          includeAuditExport: false,
        }),
        parts: [supportBundleManifestFileName],
      }),
      configSnapshotJson: null,
      auditExportJson: null,
      recentLogsJsonl: null,
    });
    expect(Object.keys(await JSZip.loadAsync(flagsOff.buffer).then((zip) => zip.files))).toEqual([
      supportBundleManifestFileName,
    ]);
  });
});
