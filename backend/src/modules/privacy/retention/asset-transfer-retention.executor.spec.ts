import { createAssetTransferRetentionExecutor } from './asset-transfer-retention.executor';

type Candidate = {
  readonly id: string;
  readonly number: string;
  readonly scenario: 'WAREHOUSE_TO_USER' | 'USER_TO_USER' | 'USER_TO_WAREHOUSE';
  readonly issuedAt: Date;
  readonly terminalAt: Date;
  readonly signedStoragePath: string | null;
  readonly signedSizeBytes: number | null;
  readonly signedFilePurgeRequestedAt: Date | null;
};

function setup(rows: Candidate[]) {
  const transaction = {
    $queryRaw: jest.fn(),
    assetTransfer: {
      update: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    assetTransferItem: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
  };
  const prisma = {
    $queryRaw: jest.fn(),
    $transaction: jest.fn(async (callback: (tx: typeof transaction) => unknown) => callback(transaction)),
    assetTransfer: { count: jest.fn().mockResolvedValue(0) },
  };
  const storage = { remove: jest.fn().mockResolvedValue(undefined) };
  transaction.$queryRaw.mockResolvedValueOnce(rows);
  return { prisma, transaction, storage };
}

const candidate = (overrides: Partial<Candidate> = {}): Candidate => ({
  id: 'transfer-1',
  number: '26-0001-2026',
  scenario: 'WAREHOUSE_TO_USER',
  issuedAt: new Date('2025-01-01T00:00:00Z'),
  terminalAt: new Date('2025-02-01T00:00:00Z'),
  signedStoragePath: null,
  signedSizeBytes: null,
  signedFilePurgeRequestedAt: null,
  ...overrides,
});

describe('createAssetTransferRetentionExecutor', () => {
  const cutoff = new Date('2026-01-01T00:00:00Z');

  it('registers the assetTransfers category', () => {
    expect(createAssetTransferRetentionExecutor({} as never, {} as never).category).toBe('assetTransfers');
  });

  it('previews terminal record and signed-file volume without executing deletion', async () => {
    const { prisma, storage } = setup([]);
    const oldestAt = new Date('2025-01-01T00:00:00Z');
    const newestAt = new Date('2025-03-01T00:00:00Z');
    prisma.$queryRaw.mockResolvedValueOnce([{
      count: 2n,
      bytes: 2048n,
      oldestAt,
      newestAt,
    }]);
    const executor = createAssetTransferRetentionExecutor(prisma as never, storage as never);

    await expect(executor.preview(cutoff)).resolves.toEqual({
      count: 2,
      bytes: 2048n,
      oldestAt,
      newestAt,
    });
    expect(storage.remove).not.toHaveBeenCalled();
  });

  it('redacts terminal snapshots, removes asset references and retains the transfer shell', async () => {
    const { prisma, transaction, storage } = setup([candidate()]);
    transaction.$queryRaw.mockResolvedValueOnce([]);
    prisma.$queryRaw.mockResolvedValueOnce([{ count: 0n }]);
    const executor = createAssetTransferRetentionExecutor(prisma as never, storage as never);

    const batch = await executor.executeBatch(cutoff);

    expect(batch).toMatchObject({ items: 1, refs: ['26-0001-2026'], done: true, failures: 0 });
    expect(transaction.assetTransfer.update).toHaveBeenCalledWith({
      where: { id: 'transfer-1' },
      data: expect.objectContaining({
        snapshot: expect.objectContaining({
          number: '26-0001-2026',
          note: '[redacted]',
          items: [],
        }),
        fromUserId: null,
        toUserId: null,
        signatoryUserId: null,
        issuedByUserId: null,
        signedByUserId: null,
        cancelledByUserId: null,
        note: null,
        cancelReason: null,
        templateId: null,
        signedFileName: null,
        signedMimeType: null,
        retentionRedactedAt: expect.any(Date),
      }),
    });
    expect(transaction.assetTransferItem.updateMany).toHaveBeenCalledWith({
      where: { transferId: 'transfer-1' },
      data: { assetId: null },
    });
    expect(storage.remove).not.toHaveBeenCalled();
  });

  it('queues a signed file durably before retryable deletion and reports freed bytes', async () => {
    const signedPath = 'assets/transfers/transfer-1/signed.pdf';
    const row = candidate({ signedStoragePath: signedPath, signedSizeBytes: 2048 });
    const { prisma, transaction, storage } = setup([row]);
    transaction.$queryRaw
      .mockResolvedValueOnce([{
        id: row.id,
        number: row.number,
        signedStoragePath: signedPath,
        signedSizeBytes: 2048,
      }])
      .mockResolvedValueOnce([]);
    prisma.$queryRaw.mockResolvedValueOnce([{ count: 0n }]);
    const executor = createAssetTransferRetentionExecutor(prisma as never, storage as never);

    const batch = await executor.executeBatch(cutoff);

    expect(batch).toMatchObject({ items: 1, bytes: 2048n, refs: ['26-0001-2026'], done: true, failures: 0 });
    expect(transaction.assetTransfer.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'transfer-1' },
      data: expect.objectContaining({
        signedFilePurgeRequestedAt: expect.any(Date),
        retentionRedactedAt: expect.any(Date),
      }),
    }));
    expect(storage.remove).toHaveBeenCalledWith(signedPath);
    expect(transaction.assetTransfer.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        id: 'transfer-1',
        signedStoragePath: signedPath,
        signedFilePurgeRequestedAt: { not: null },
      }),
      data: {
        signedStoragePath: null,
        signedFileName: null,
        signedMimeType: null,
        signedSizeBytes: null,
      },
    }));
  });

  it('leaves a failed signed-file purge queued for a later run', async () => {
    const signedPath = 'assets/transfers/transfer-1/signed.pdf';
    const row = candidate({ signedStoragePath: signedPath, signedSizeBytes: 12 });
    const { prisma, transaction, storage } = setup([row]);
    transaction.$queryRaw.mockResolvedValueOnce([{
      id: row.id,
      number: row.number,
      signedStoragePath: signedPath,
      signedSizeBytes: 12,
    }]);
    storage.remove.mockRejectedValueOnce(new Error('storage unavailable'));
    prisma.assetTransfer.count.mockResolvedValueOnce(1);
    prisma.$queryRaw.mockResolvedValueOnce([{ count: 0n }]);
    const executor = createAssetTransferRetentionExecutor(prisma as never, storage as never);

    const batch = await executor.executeBatch(cutoff);

    expect(batch).toMatchObject({ items: 1, failures: 1, done: true });
    expect(transaction.assetTransfer.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ signedFilePurgeRequestedAt: expect.any(Date) }),
    }));
    expect(transaction.assetTransfer.updateMany).not.toHaveBeenCalled();
    expect(storage.remove).toHaveBeenCalledWith(signedPath);
  });
});
