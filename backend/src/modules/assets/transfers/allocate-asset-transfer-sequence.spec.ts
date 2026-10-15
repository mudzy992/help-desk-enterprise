import { allocateAssetTransferSequence } from './allocate-asset-transfer-sequence';

describe('allocateAssetTransferSequence', () => {
  it('returns the counter from INSERT … ON CONFLICT when it is ahead of issued transfers', async () => {
    const transaction = {
      $queryRaw: jest.fn().mockResolvedValue([{ lastNumber: 7 }]),
      assetTransfer: { aggregate: jest.fn().mockResolvedValue({ _max: { sequence: 3 } }) },
      assetTransferSequence: { update: jest.fn() },
    };
    await expect(allocateAssetTransferSequence(transaction as never, 2026, 3)).resolves.toBe(7);
    expect(transaction.assetTransferSequence.update).not.toHaveBeenCalled();
  });

  it('realigns when the counter lags behind transfers already issued this month', async () => {
    const transaction = {
      $queryRaw: jest.fn().mockResolvedValue([{ lastNumber: 2 }]),
      assetTransfer: { aggregate: jest.fn().mockResolvedValue({ _max: { sequence: 41 } }) },
      assetTransferSequence: { update: jest.fn().mockResolvedValue({}) },
    };
    await expect(allocateAssetTransferSequence(transaction as never, 2026, 10)).resolves.toBe(42);
    expect(transaction.assetTransferSequence.update).toHaveBeenCalledWith({
      where: { year_month: { year: 2026, month: 10 } },
      data: { lastNumber: 42 },
    });
  });
});
