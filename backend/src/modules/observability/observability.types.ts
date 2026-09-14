export type SupportBundleConfiguration = {
  readonly auditRetentionDays: number;
  readonly requestLogRetentionDays: number;
  readonly supportBundleEnabled: boolean;
  readonly includeConfigSnapshot: boolean;
  readonly includeRecentLogs: boolean;
  readonly includeAuditExport: boolean;
  readonly recentLogsMinutes: number;
};

export type SupportBundleManifest = {
  readonly generatedAt: string;
  readonly requestId: string;
  readonly actorUserId: string;
  readonly flags: {
    readonly includeConfigSnapshot: boolean;
    readonly includeRecentLogs: boolean;
    readonly includeAuditExport: boolean;
    readonly recentLogsMinutes: number;
  };
  readonly parts: readonly string[];
};

export type SupportBundleArchive = {
  readonly fileName: string;
  readonly contentType: string;
  readonly buffer: Buffer;
};
