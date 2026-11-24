jest.mock('../../common/prisma/prisma.service', () => ({ PrismaService: class PrismaService {} }));
jest.mock('../../common/cache/scope-catalog-cache', () => ({ invalidateActorGroupsCache: jest.fn() }));
jest.mock('./record-group-change', () => ({ recordGroupChange: jest.fn().mockResolvedValue(undefined) }));
jest.mock('./assert-group-deletable', () => ({
  assertGroupDeletable: jest
    .fn()
    .mockResolvedValue({ blockers: [], detached: [], cascaded: [] }),
}));
jest.mock('./load-group-record', () => ({ loadGroupRecord: jest.fn() }));

import { invalidateActorGroupsCache } from '../../common/cache/scope-catalog-cache';
import { recordGroupChange } from './record-group-change';
import { loadGroupRecord } from './load-group-record';
import { deleteGroup } from './delete-group';

const group = {
  id: 'group-1', name: 'Support', key: 'support', organizationalUnitId: 'ou-trusted',
  isFallback: false, isProblemGroup: false, isCabGroup: false,
  members: [{ userId: 'user-1' }],
};

describe('group deletion scope for a future scoped invalidation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(loadGroupRecord).mockResolvedValue(group as never);
  });

  it('returns the deleted group scope from the committed transaction', async () => {
    const transaction = { group: { delete: jest.fn().mockResolvedValue({}) } };
    const prisma = { $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(transaction)) };
    const outcome = await deleteGroup(prisma as never, 'group-1');
    expect(loadGroupRecord).toHaveBeenCalledWith(transaction, 'group-1');
    expect(recordGroupChange).toHaveBeenCalledWith(transaction, expect.objectContaining({ organizationalUnitId: 'ou-trusted' }));
    expect(outcome).toEqual({
      affectedUserIds: ['user-1'],
      organizationalUnitId: 'ou-trusted',
      impact: { blockers: [], detached: [], cascaded: [] },
    });
    expect(invalidateActorGroupsCache).toHaveBeenCalledTimes(1);
  });

  it('does not return a scope or invalidate cache if the transaction fails to commit', async () => {
    const transaction = { group: { delete: jest.fn().mockResolvedValue({}) } };
    const prisma = { $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => {
      await fn(transaction);
      throw new Error('commit failed');
    }) };
    await expect(deleteGroup(prisma as never, 'group-1')).rejects.toThrow('commit failed');
    expect(invalidateActorGroupsCache).not.toHaveBeenCalled();
  });
});
