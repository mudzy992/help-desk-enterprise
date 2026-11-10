import { AssetOperationsMetricStore } from '../assets/asset-operations-metrics';
import type { AssetTransferFileIntegrity } from '../assets/asset-operations.types';
import { collectAssetOperationsSignal } from './collect-asset-operations-signal';

const now = new Date('2026-10-31T12:00:45.000Z');

function setup() {
  const prisma = {
    assetImportJob: { count: jest.fn().mockResolvedValue(2) },
    assetReminderEmailDelivery: { count: jest.fn().mockResolvedValueOnce(3).mockResolvedValueOnce(4) },
    assetTransfer: {
      count: jest.fn().mockResolvedValueOnce(5).mockResolvedValueOnce(6),
      findFirst: jest.fn().mockResolvedValue({ signedFilePurgeRequestedAt: new Date('2026-10-31T11:15:45.000Z') }),
    },
    organizationalUnit: { findMany: jest.fn().mockResolvedValue([{ id: 'unit-1', name: 'Unit', ouPath: '/unit' }]) },
    softwareLicense: {
      findMany: jest.fn().mockResolvedValue([
        { productName: 'over', vendor: null, kind: 'PER_USER', seats: 2, validUntil: null, organizationalUnitId: 'unit-1', _count: { assignments: 5 } },
        { productName: 'within', vendor: null, kind: 'PER_DEVICE', seats: 10, validUntil: null, organizationalUnitId: 'unit-1', _count: { assignments: 8 } },
        { productName: 'site', vendor: null, kind: 'SITE', seats: null, validUntil: null, organizationalUnitId: 'unit-1', _count: { assignments: 20 } },
      ]),
    },
  };
  const metrics = { readLastHour: jest.fn().mockResolvedValue({
    directorySyncOverlapsLastHour: 7,
    auditWriteFailuresLastHour: 1,
  }) };
  const fileIntegrity: AssetTransferFileIntegrity = {
    scanState: 'complete',
    scannedFiles: 8,
    referencedFiles: 6,
    orphanedFiles: 2,
    missingFiles: 0,
  };
  return { prisma, metrics, fileIntegrity };
}

describe('collectAssetOperationsSignal', () => {
  it('collects durable counts and reuses the report-pack licence aggregation', async () => {
    const { prisma, metrics, fileIntegrity } = setup();

    const result = await collectAssetOperationsSignal(
      prisma as never,
      metrics as unknown as AssetOperationsMetricStore,
      now,
      Promise.resolve(fileIntegrity),
    );

    expect(result).toEqual({
      directorySyncOverlapsLastHour: 7,
      auditWriteFailuresLastHour: 1,
      importStuckClaims: 2,
      overAllocatedLicenseCount: 1,
      overAllocatedSeatCount: 3,
      failedReminderDeliveries: 3,
      staleReminderClaims: 4,
      pendingTransferFilePurges: 5,
      staleTransferFilePurges: 6,
      oldestTransferFilePurgeAgeMinutes: 45,
      transferFileScanState: 'complete',
      scannedTransferFiles: 8,
      referencedTransferFiles: 6,
      orphanedTransferFiles: 2,
      missingTransferFiles: 0,
    });
    expect(prisma.softwareLicense.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 5000 }));
    expect(metrics.readLastHour).toHaveBeenCalledWith(now);
  });

  it('skips Redis reads when Redis is unavailable and preserves unknown metric counts', async () => {
    const { prisma, metrics, fileIntegrity } = setup();

    const result = await collectAssetOperationsSignal(
      prisma as never,
      metrics as unknown as AssetOperationsMetricStore,
      now,
      Promise.resolve(fileIntegrity),
      false,
    );

    expect(metrics.readLastHour).not.toHaveBeenCalled();
    expect(result.directorySyncOverlapsLastHour).toBeNull();
    expect(result.auditWriteFailuresLastHour).toBeNull();
  });

  it('reports incomplete filesystem and Redis reads as unknown, not as zero', async () => {
    const { prisma, metrics } = setup();
    metrics.readLastHour.mockRejectedValueOnce(new Error('redis unavailable'));
    const limitedScan: AssetTransferFileIntegrity = {
      scanState: 'limited',
      scannedFiles: null,
      referencedFiles: null,
      orphanedFiles: null,
      missingFiles: null,
    };

    const result = await collectAssetOperationsSignal(
      prisma as never,
      metrics as unknown as AssetOperationsMetricStore,
      now,
      Promise.resolve(limitedScan),
    );

    expect(result.directorySyncOverlapsLastHour).toBeNull();
    expect(result.auditWriteFailuresLastHour).toBeNull();
    expect(result.transferFileScanState).toBe('limited');
    expect(result.orphanedTransferFiles).toBeNull();
    expect(result.missingTransferFiles).toBeNull();
  });
});
