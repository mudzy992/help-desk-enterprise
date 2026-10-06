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

  it('does not audit or delete a user with open tickets', async () => {
    const transaction = {
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
