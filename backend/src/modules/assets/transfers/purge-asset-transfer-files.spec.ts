import { purgePendingAssetTransferFiles } from "./purge-asset-transfer-files";

describe("purgePendingAssetTransferFiles", () => {
  const pending = {
    id: "transfer-1",
    number: "26-0001-2026",
    signedStoragePath: "assets/transfers/transfer-1/signed.pdf",
    signedSizeBytes: 23,
  };

  function setup() {
    const transaction = {
      $queryRaw: jest.fn(),
      assetTransfer: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    };
    const prisma = {
      $transaction: jest.fn(
        async (callback: (client: typeof transaction) => unknown) =>
          callback(transaction),
      ),
      assetTransfer: { count: jest.fn().mockResolvedValue(1) },
    };
    const storage = { remove: jest.fn() };
    return { prisma, transaction, storage };
  }

  it("keeps the durable marker after a storage failure and retries idempotently", async () => {
    const { prisma, transaction, storage } = setup();
    transaction.$queryRaw.mockResolvedValueOnce([pending]);
    storage.remove.mockRejectedValueOnce(new Error("disk unavailable"));

    const failed = await purgePendingAssetTransferFiles(
      prisma as never,
      storage as never,
      { limit: 1 },
    );
    expect(failed).toMatchObject({
      attempted: 1,
      purged: 0,
      failures: 1,
      remaining: 1,
      refs: [],
    });
    expect(transaction.assetTransfer.updateMany).not.toHaveBeenCalled();

    transaction.$queryRaw
      .mockResolvedValueOnce([pending])
      .mockResolvedValueOnce([]);
    storage.remove.mockResolvedValueOnce(undefined);
    prisma.assetTransfer.count.mockResolvedValueOnce(0);

    const retried = await purgePendingAssetTransferFiles(
      prisma as never,
      storage as never,
      { limit: 2 },
    );
    expect(retried).toMatchObject({
      attempted: 1,
      purged: 1,
      failures: 0,
      remaining: 0,
      refs: ["26-0001-2026"],
    });
    expect(retried.bytesFreed).toBe(23n);
    expect(transaction.assetTransfer.updateMany).toHaveBeenCalledWith({
      where: {
        id: pending.id,
        signedStoragePath: pending.signedStoragePath,
        signedFilePurgeRequestedAt: { not: null },
      },
      data: {
        signedStoragePath: null,
        signedFileName: null,
        signedMimeType: null,
        signedSizeBytes: null,
      },
    });
  });

  it("is a no-op for an empty targeted transfer set", async () => {
    const { prisma, storage } = setup();
    await expect(
      purgePendingAssetTransferFiles(prisma as never, storage as never, {
        transferIds: [],
      }),
    ).resolves.toMatchObject({
      attempted: 0,
      purged: 0,
      remaining: 0,
      failures: 0,
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(storage.remove).not.toHaveBeenCalled();
  });
});
