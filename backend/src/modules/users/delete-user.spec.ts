import { auditLogActions } from '../audit-log/audit-log.constants';
import { deleteUser } from './delete-user';

jest.mock('./record-user-change', () => ({
  recordUserChange: jest.fn().mockResolvedValue(undefined),
}));

import { recordUserChange } from './record-user-change';

describe('deleteUser', () => {
  beforeEach(() => jest.mocked(recordUserChange).mockClear());

  it('audits user removal in the deletion transaction without password fields', async () => {
    const user = {
      id: 'user-1',
      displayName: 'Agent One',
      email: 'agent@example.com',
      isActive: true,
      isLocalOnly: false,
      organizationalUnitId: 'ou-1',
      _count: { assignedTickets: 0, requestedTickets: 0 },
    };
    const transaction = {
      $executeRaw: jest.fn().mockResolvedValue(1),
      userRole: { findFirst: jest.fn().mockResolvedValue(null) },
      knowledgeFeedback: { findMany: jest.fn().mockResolvedValue([]) },
      user: {
        findUnique: jest.fn().mockResolvedValue(user),
        delete: jest.fn().mockResolvedValue(user),
      },
    };
    const prisma = {
      $transaction: jest.fn(async (callback: (client: unknown) => Promise<void>) => callback(transaction)),
    };
    const invalidatePrincipal = jest.fn().mockResolvedValue(null);
    await deleteUser(
      prisma as never,
      'user-1',
      invalidatePrincipal,
      { actorUserId: 'admin-1', requestId: 'req-1' },
    );
    expect(recordUserChange).toHaveBeenCalledWith(transaction, expect.objectContaining({
      action: auditLogActions.userDeleted,
      entityId: 'user-1',
      actorUserId: 'admin-1',
      requestId: 'req-1',
      organizationalUnitId: 'ou-1',
      metadata: {
        before: {
          displayName: 'Agent One',
          email: 'agent@example.com',
          isActive: true,
          isLocalOnly: false,
          organizationalUnitId: 'ou-1',
        },
      },
    }));
    expect(JSON.stringify(jest.mocked(recordUserChange).mock.calls)).not.toContain('passwordHash');
    expect(transaction.user.delete).toHaveBeenCalledWith({ where: { id: 'user-1' } });
    expect(invalidatePrincipal).toHaveBeenCalledWith('user-1');
  });

  it('does not delete or invalidate a user when the audit insert fails', async () => {
    const auditFailure = new Error('audit insert failed');
    const transaction = {
      $executeRaw: jest.fn().mockResolvedValue(1),
      userRole: { findFirst: jest.fn().mockResolvedValue(null) },
      knowledgeFeedback: { findMany: jest.fn().mockResolvedValue([]) },
      user: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'user-1',
          displayName: 'Agent One',
          email: 'agent@example.com',
          isActive: true,
          isLocalOnly: true,
          organizationalUnitId: null,
          _count: { assignedTickets: 0, requestedTickets: 0 },
        }),
        delete: jest.fn(),
      },
    };
    const prisma = {
      $transaction: jest.fn(async (callback: (client: unknown) => Promise<void>) => callback(transaction)),
    };
    const invalidatePrincipal = jest.fn();
    jest.mocked(recordUserChange).mockRejectedValueOnce(auditFailure);

    await expect(deleteUser(prisma as never, 'user-1', invalidatePrincipal)).rejects.toBe(auditFailure);
    expect(transaction.user.delete).not.toHaveBeenCalled();
    expect(invalidatePrincipal).not.toHaveBeenCalled();
  });

  it('repairs the rating totals of the articles the removed votes no longer rate', async () => {
    const transaction = {
      $executeRaw: jest.fn().mockResolvedValue(1),
      userRole: { findFirst: jest.fn().mockResolvedValue(null) },
      // W7.81: only rated votes change `ratingCount`/`ratingSum`; thumbs-only votes are not collected.
      knowledgeFeedback: {
        findMany: jest
          .fn()
          .mockResolvedValue([
            { articleId: 'article-a' },
            { articleId: 'article-b' },
            { articleId: 'article-a' },
          ]),
        aggregate: jest
          .fn()
          .mockImplementation(async (args: { where: { articleId: string } }) =>
            args.where.articleId === 'article-a'
              ? { _count: { rating: 1 }, _sum: { rating: 5 } }
              : { _count: { rating: 0 }, _sum: { rating: null } },
          ),
      },
      knowledgeArticle: { update: jest.fn().mockResolvedValue(undefined) },
      user: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'user-1',
          displayName: 'Agent One',
          email: 'agent@example.com',
          isActive: true,
          isLocalOnly: false,
          organizationalUnitId: null,
          _count: { assignedTickets: 0, requestedTickets: 0 },
        }),
        delete: jest.fn().mockResolvedValue(undefined),
      },
    };
    const prisma = {
      $transaction: jest.fn(async (callback: (client: unknown) => Promise<void>) => callback(transaction)),
    };

    await deleteUser(prisma as never, 'user-1');

    // The votes leave with the account, so the articles they rated are recounted — once each, after the delete.
    expect(transaction.knowledgeFeedback.findMany).toHaveBeenCalledWith({
      where: { userId: 'user-1', rating: { not: null } },
      select: { articleId: true },
      distinct: ['articleId'],
    });
    expect(transaction.user.delete).toHaveBeenCalledTimes(1);
    expect(transaction.knowledgeArticle.update).toHaveBeenCalledTimes(2);
    expect(transaction.knowledgeArticle.update).toHaveBeenCalledWith({
      where: { id: 'article-a' },
      data: { ratingCount: 1, ratingSum: 5 },
    });
    expect(transaction.knowledgeArticle.update).toHaveBeenCalledWith({
      where: { id: 'article-b' },
      data: { ratingCount: 0, ratingSum: 0 },
    });
    expect(transaction.user.delete.mock.invocationCallOrder[0]).toBeLessThan(
      transaction.knowledgeArticle.update.mock.invocationCallOrder[0],
    );
  });

  it('blocks deleting the only active SuperAdmin', async () => {
    const deleteUserRow = jest.fn();
    const roleFindFirst = jest
      .fn()
      .mockResolvedValueOnce({ id: 'super-role-1' })
      .mockResolvedValueOnce(null);
    const transaction = {
      $executeRaw: jest.fn().mockResolvedValue(1),
      userRole: { findFirst: roleFindFirst },
      knowledgeFeedback: { findMany: jest.fn().mockResolvedValue([]) },
      user: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'user-1',
          displayName: 'Admin',
          email: 'admin@example.com',
          isActive: true,
          isLocalOnly: true,
          organizationalUnitId: null,
          _count: { assignedTickets: 0, requestedTickets: 0 },
        }),
        delete: deleteUserRow,
      },
    };
    const prisma = {
      $transaction: jest.fn(async (callback: (client: unknown) => Promise<void>) => callback(transaction)),
    };

    await expect(deleteUser(prisma as never, 'user-1')).rejects.toMatchObject({
      code: 'LAST_SUPER_ADMIN_REQUIRED',
    });
    expect(deleteUserRow).not.toHaveBeenCalled();
    expect(recordUserChange).not.toHaveBeenCalled();
  });

  it('does not audit or delete a user with open tickets', async () => {
    const transaction = {
      $executeRaw: jest.fn().mockResolvedValue(1),
      userRole: { findFirst: jest.fn().mockResolvedValue(null) },
      knowledgeFeedback: { findMany: jest.fn().mockResolvedValue([]) },
      user: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'user-1',
          _count: { assignedTickets: 1, requestedTickets: 0 },
        }),
        delete: jest.fn(),
      },
    };
    const prisma = {
      $transaction: jest.fn(async (callback: (client: unknown) => Promise<void>) => callback(transaction)),
    };
    await expect(deleteUser(prisma as never, 'user-1')).rejects.toMatchObject({
      code: 'HAS_OPEN_TICKETS',
    });
    expect(recordUserChange).not.toHaveBeenCalled();
    expect(transaction.user.delete).not.toHaveBeenCalled();
  });
});
