import type { Prisma, PrismaClient } from '../../generated/prisma/client';
import { recordAuditEntry } from '../audit-log/record-audit-entry';
import { withAssetAuditTransaction } from './asset-audit-transaction';

jest.mock('../audit-log/record-audit-entry', () => ({ recordAuditEntry: jest.fn() }));

const recordAuditEntryMock = jest.mocked(recordAuditEntry);

type FakeTransaction = Prisma.TransactionClient & { stagedWrites: string[] };

function setup() {
  const committedWrites: string[] = [];
  const transactions: FakeTransaction[] = [];
  const prisma = {
    $transaction: jest.fn(async (callback: (transaction: Prisma.TransactionClient) => Promise<unknown>) => {
      const transaction = { stagedWrites: [] } as unknown as FakeTransaction;
      transactions.push(transaction);
      const result = await callback(transaction);
      committedWrites.push(...transaction.stagedWrites);
      return result;
    }),
  } as unknown as Pick<PrismaClient, '$transaction'>;
  return { prisma, committedWrites, transactions };
}

const audit = (entityId: string) => ({
  action: 'asset.location.saved',
  entityType: 'asset_location',
  entityId,
  metadata: { created: true },
  actorUserId: null,
});

describe('withAssetAuditTransaction', () => {
  beforeEach(() => {
    recordAuditEntryMock.mockReset().mockResolvedValue(undefined);
  });

  it('passes the active business transaction to the audit writer before commit', async () => {
    const { prisma, committedWrites, transactions } = setup();
    const result = await withAssetAuditTransaction(
      prisma,
      async (transaction) => {
        (transaction as FakeTransaction).stagedWrites.push('asset-location-created');
        return { id: 'location-1' };
      },
      ({ id }) => audit(id),
    );

    expect(result).toEqual({ id: 'location-1' });
    expect(recordAuditEntryMock).toHaveBeenCalledWith(transactions[0], expect.objectContaining({ entityId: 'location-1' }));
    expect(committedWrites).toEqual(['asset-location-created']);
  });

  it('does not commit the business write when audit persistence fails', async () => {
    const { prisma, committedWrites } = setup();
    const failure = new Error('audit unavailable');
    recordAuditEntryMock.mockRejectedValueOnce(failure);

    await expect(withAssetAuditTransaction(
      prisma,
      async (transaction) => {
        (transaction as FakeTransaction).stagedWrites.push('asset-location-created');
        return { id: 'location-2' };
      },
      ({ id }) => audit(id),
    )).rejects.toBe(failure);

    expect(committedWrites).toEqual([]);
  });

  it('skips audit insertion only when the operation explicitly returns no audit event', async () => {
    const { prisma, committedWrites } = setup();
    await withAssetAuditTransaction(
      prisma,
      async (transaction) => {
        (transaction as FakeTransaction).stagedWrites.push('asset-moved-without-transfer-document');
        return null;
      },
      () => null,
    );

    expect(recordAuditEntryMock).not.toHaveBeenCalled();
    expect(committedWrites).toEqual(['asset-moved-without-transfer-document']);
  });
});
