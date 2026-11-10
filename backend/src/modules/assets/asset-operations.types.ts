export const assetOperationsMetricWindowMinutes = 60;
export const assetImportStuckLeaseGraceMs = 10 * 60_000;
export const assetTransferFilePurgeStaleAfterMs = 30 * 60_000;
export const assetAuditWriteFailureCriticalPerHour = 5;
export const assetTransferFileScanIntervalMs = 15 * 60_000;
export const assetTransferFileScanMaxReferences = 20_000;
export const assetTransferFileScanMaxEntries = 20_000;

export type AssetTransferFileScanState = 'complete' | 'limited' | 'unavailable';

/** Counts only; never includes recipient hashes, file paths, or business data. */
export type AssetOperationsSignal = {
  /** Redis-backed counters over the previous 60 complete minute buckets. */
  readonly directorySyncOverlapsLastHour: number | null;
  readonly auditWriteFailuresLastHour: number | null;
  /** Persisted database states. */
  readonly importStuckClaims: number;
  readonly overAllocatedLicenseCount: number;
  readonly overAllocatedSeatCount: number;
  readonly failedReminderDeliveries: number;
  readonly staleReminderClaims: number;
  readonly pendingTransferFilePurges: number;
  readonly staleTransferFilePurges: number;
  readonly oldestTransferFilePurgeAgeMinutes: number | null;
  /** Read-only filesystem comparison, cached for at most 15 minutes. */
  readonly transferFileScanState: AssetTransferFileScanState;
  readonly scannedTransferFiles: number | null;
  readonly referencedTransferFiles: number | null;
  readonly orphanedTransferFiles: number | null;
  readonly missingTransferFiles: number | null;
};

export type AssetTransferFileIntegrity = {
  readonly scanState: AssetTransferFileScanState;
  readonly scannedFiles: number | null;
  readonly referencedFiles: number | null;
  readonly orphanedFiles: number | null;
  readonly missingFiles: number | null;
};

export type AssetOperationsMetricCounts = {
  readonly directorySyncOverlapsLastHour: number;
  readonly auditWriteFailuresLastHour: number;
};
