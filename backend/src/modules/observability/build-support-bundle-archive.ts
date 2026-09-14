import JSZip from 'jszip';
import {
  supportBundleAuditExportFileName,
  supportBundleConfigSnapshotFileName,
  supportBundleManifestFileName,
  supportBundleRecentLogsFileName,
} from './observability.constants';
import type {
  SupportBundleArchive,
  SupportBundleManifest,
} from './observability.types';

export async function buildSupportBundleArchive(input: {
  readonly generatedAt: Date;
  readonly manifest: SupportBundleManifest;
  readonly configSnapshotJson: string | null;
  readonly auditExportJson: string | null;
  readonly recentLogsJsonl: string | null;
}): Promise<SupportBundleArchive> {
  const zip = new JSZip();
  zip.file(
    supportBundleManifestFileName,
    `${JSON.stringify(input.manifest, null, 2)}\n`,
  );
  if (input.configSnapshotJson !== null) {
    zip.file(supportBundleConfigSnapshotFileName, input.configSnapshotJson);
  }
  if (input.auditExportJson !== null) {
    zip.file(supportBundleAuditExportFileName, input.auditExportJson);
  }
  if (input.recentLogsJsonl !== null) {
    zip.file(supportBundleRecentLogsFileName, input.recentLogsJsonl);
  }
  return {
    fileName: `support-bundle-${formatBundleTimestamp(input.generatedAt)}.zip`,
    contentType: 'application/zip',
    buffer: await zip.generateAsync({
      type: 'nodebuffer',
      compression: 'DEFLATE',
    }),
  };
}

function formatBundleTimestamp(value: Date): string {
  return value.toISOString().replaceAll(/[:.]/g, '-');
}
