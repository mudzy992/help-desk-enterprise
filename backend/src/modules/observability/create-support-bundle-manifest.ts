import {
  supportBundleAuditExportFileName,
  supportBundleConfigSnapshotFileName,
  supportBundleManifestFileName,
  supportBundleRecentLogsFileName,
} from './observability.constants';
import type {
  SupportBundleConfiguration,
  SupportBundleManifest,
} from './observability.types';

export function listSupportBundleParts(input: {
  readonly configSnapshotJson: string | null;
  readonly auditExportJson: string | null;
  readonly recentLogsJsonl: string | null;
}): readonly string[] {
  const parts = [supportBundleManifestFileName];
  if (input.configSnapshotJson !== null) {
    parts.push(supportBundleConfigSnapshotFileName);
  }
  if (input.auditExportJson !== null) {
    parts.push(supportBundleAuditExportFileName);
  }
  if (input.recentLogsJsonl !== null) {
    parts.push(supportBundleRecentLogsFileName);
  }
  return parts;
}

export function createSupportBundleManifest(input: {
  readonly generatedAt: Date;
  readonly requestId: string;
  readonly actorUserId: string;
  readonly configuration: SupportBundleConfiguration;
  readonly parts: readonly string[];
}): SupportBundleManifest {
  return {
    generatedAt: input.generatedAt.toISOString(),
    requestId: input.requestId,
    actorUserId: input.actorUserId,
    flags: {
      includeConfigSnapshot: input.configuration.includeConfigSnapshot,
      includeRecentLogs: input.configuration.includeRecentLogs,
      includeAuditExport: input.configuration.includeAuditExport,
      recentLogsMinutes: input.configuration.recentLogsMinutes,
    },
    parts: input.parts,
  };
}
