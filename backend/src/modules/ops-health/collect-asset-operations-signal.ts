import type { PrismaService } from '../../common/prisma/prisma.service';
import {
  overAllocatedLicenses,
  type AssetLicenseRecord,
} from '../reports/packs/build-asset-reports';
import { loadAssetReportData } from '../reports/packs/load-asset-report-data';
import {
  assetReminderEmailClaimStaleAfterMs,
  assetReminderEmailDeliveryStatuses,
} from '../assets/reminders/asset-reminder-email-delivery';
import {
  assetImportStuckLeaseGraceMs,
  assetOperationsMetricWindowMinutes,
  assetTransferFilePurgeStaleAfterMs,
  type AssetOperationsSignal,
  type AssetTransferFileIntegrity,
} from '../assets/asset-operations.types';
import { AssetOperationsMetricStore } from '../assets/asset-operations-metrics';

export type AssetOperationsPrisma = Pick<
  PrismaService,
  'assetImportJob' | 'assetReminderEmailDelivery' | 'assetTransfer' | 'softwareLicense' | 'organizationalUnit'
>;

/**
 * Read-only, privacy-safe metrics for the W7 assets operational signal set.
 * Database state remains separate from the short-lived Redis event counters.
 */
export async function collectAssetOperationsSignal(
  prisma: AssetOperationsPrisma,
  metrics: AssetOperationsMetricStore,
  now: Date,
  fileIntegrity: Promise<AssetTransferFileIntegrity>,
  redisAvailable = true,
): Promise<AssetOperationsSignal> {
  const importLeaseCutoff = new Date(now.getTime() - assetImportStuckLeaseGraceMs);
  const reminderClaimCutoff = new Date(now.getTime() - assetReminderEmailClaimStaleAfterMs);
  const transferPurgeCutoff = new Date(now.getTime() - assetTransferFilePurgeStaleAfterMs);
  const overAllocatedLicenseRowsPromise: Promise<AssetLicenseRecord[]> = loadAssetReportData(
    prisma as unknown as PrismaService,
    {
      unitIds: null,
      parts: new Set(['licenses']),
      window: { from: now, to: now },
      now,
      locale: 'bs',
      horizonDays: 0,
    },
  ).then(overAllocatedLicenses);
  const [
    importStuckClaims,
    overAllocatedLicenseRows,
    failedReminderDeliveries,
    staleReminderClaims,
    pendingTransferFilePurges,
    staleTransferFilePurges,
    oldestTransferFilePurge,
    metricCounts,
    fileIntegrityResult,
  ] = await Promise.all([
    prisma.assetImportJob.count({
      where: {
        status: 'APPLYING',
        OR: [{ applyLeaseUntil: null }, { applyLeaseUntil: { lt: importLeaseCutoff } }],
      },
    }),
    overAllocatedLicenseRowsPromise,
    prisma.assetReminderEmailDelivery.count({
      where: { status: assetReminderEmailDeliveryStatuses.failed },
    }),
    prisma.assetReminderEmailDelivery.count({
      where: {
        status: assetReminderEmailDeliveryStatuses.claimed,
        updatedAt: { lt: reminderClaimCutoff },
      },
    }),
    prisma.assetTransfer.count({
      where: {
        signedFilePurgeRequestedAt: { not: null },
        signedStoragePath: { not: null },
      },
    }),
    prisma.assetTransfer.count({
      where: {
        signedFilePurgeRequestedAt: { lt: transferPurgeCutoff },
        signedStoragePath: { not: null },
      },
    }),
    prisma.assetTransfer.findFirst({
      where: {
        signedFilePurgeRequestedAt: { not: null },
        signedStoragePath: { not: null },
      },
      orderBy: { signedFilePurgeRequestedAt: 'asc' },
      select: { signedFilePurgeRequestedAt: true },
    }),
    redisAvailable ? metrics.readLastHour(now).catch(() => null) : Promise.resolve(null),
    fileIntegrity.catch(() => unavailableFileIntegrity()),
  ]);

  const overAllocated = overAllocatedLicenseRows.reduce<{ licenses: number; seats: number }>(
    (
      total: { licenses: number; seats: number },
      license: AssetLicenseRecord,
    ) => {
      const seats = license.seats;
      const used = license.used;
      if (seats === null || used <= seats) return total;
      return { licenses: total.licenses + 1, seats: total.seats + used - seats };
    },
    { licenses: 0, seats: 0 },
  );

  return {
    directorySyncOverlapsLastHour: metricCounts?.directorySyncOverlapsLastHour ?? null,
    auditWriteFailuresLastHour: metricCounts?.auditWriteFailuresLastHour ?? null,
    importStuckClaims,
    overAllocatedLicenseCount: overAllocated.licenses,
    overAllocatedSeatCount: overAllocated.seats,
    failedReminderDeliveries,
    staleReminderClaims,
    pendingTransferFilePurges,
    staleTransferFilePurges,
    oldestTransferFilePurgeAgeMinutes:
      oldestTransferFilePurge?.signedFilePurgeRequestedAt == null
        ? null
        : Math.max(0, Math.floor((now.getTime() - oldestTransferFilePurge.signedFilePurgeRequestedAt.getTime()) / 60_000)),
    transferFileScanState: fileIntegrityResult.scanState,
    scannedTransferFiles: fileIntegrityResult.scannedFiles,
    referencedTransferFiles: fileIntegrityResult.referencedFiles,
    orphanedTransferFiles: fileIntegrityResult.orphanedFiles,
    missingTransferFiles: fileIntegrityResult.missingFiles,
  };
}

function unavailableFileIntegrity(): AssetTransferFileIntegrity {
  return {
    scanState: 'unavailable',
    scannedFiles: null,
    referencedFiles: null,
    orphanedFiles: null,
    missingFiles: null,
  };
}

export const assetOperationsSignalWindowMinutes = assetOperationsMetricWindowMinutes;
