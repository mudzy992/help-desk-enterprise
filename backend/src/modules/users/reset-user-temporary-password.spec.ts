import { auditLogActions } from '../audit-log/audit-log.constants';
import { resetUserTemporaryPassword } from './reset-user-temporary-password';
import { UsersError } from './users.error';

jest.mock('./list-users-summary', () => ({
  listUsersSummary: jest.fn().mockResolvedValue([
    {
      id: 'user-1',
      displayName: 'Test User',
      email: 'user@example.com',
      isActive: true,
      isLocalOnly: true,
    },
  ]),
}));

jest.mock('./issue-temporary-password-for-user', () => ({
  issueTemporaryPasswordForUser: jest.fn().mockResolvedValue({
    temporaryPassword: 'ResetPassword!23456',
    temporaryPasswordDelivery: 'ui',
  }),
}));
jest.mock('./record-user-change', () => ({
  recordUserChange: jest.fn().mockResolvedValue(undefined),
}));

import { issueTemporaryPasswordForUser } from './issue-temporary-password-for-user';
import { recordUserChange } from './record-user-change';

describe('resetUserTemporaryPassword', () => {
  const dependencies = {
    settingsService: {} as never,
    mailTransport: { send: jest.fn() } as never,
  };

  beforeEach(() => {
    jest.mocked(issueTemporaryPasswordForUser).mockClear();
    jest.mocked(recordUserChange).mockClear();
  });

  it('audits and reissues a temporary password for an active local account', async () => {
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'user-1',
          email: 'user@example.com',
          displayName: 'Test User',
          isActive: true,
          isLocalOnly: true,
          organizationalUnitId: 'ou-1',
        }),
      },
    };
    const response = await resetUserTemporaryPassword(prisma as never, 'user-1', dependencies, {
      actorUserId: 'admin-1',
      requestId: 'req-1',
    });
    expect(issueTemporaryPasswordForUser).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        audit: {
          action: auditLogActions.userPasswordReset,
          actorUserId: 'admin-1',
          requestId: 'req-1',
          organizationalUnitId: 'ou-1',
          metadata: { reason: 'admin_reset', mustChangePassword: true },
        },
      }),
    );
    expect(response.temporaryPassword).toBe('ResetPassword!23456');
    expect(response.temporaryPasswordDelivery).toBe('ui');
  });

  it('audits and rejects a reset attempt for a directory account', async () => {
    const transaction = {};
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'user-1',
          email: 'user@example.com',
          displayName: 'Directory User',
          isActive: true,
          isLocalOnly: false,
          organizationalUnitId: 'ou-1',
        }),
      },
      $transaction: jest.fn(async (callback: (client: unknown) => Promise<void>) => callback(transaction)),
    };
    await expect(
      resetUserTemporaryPassword(prisma as never, 'user-1', dependencies, {
        actorUserId: 'admin-1',
        requestId: 'req-2',
      }),
    ).rejects.toMatchObject({ code: 'DIRECTORY_ACCOUNT_NOT_LOCAL' });
    expect(recordUserChange).toHaveBeenCalledWith(transaction, {
      action: auditLogActions.userPasswordResetRejected,
      entityId: 'user-1',
      actorUserId: 'admin-1',
      requestId: 'req-2',
      organizationalUnitId: 'ou-1',
      metadata: { reason: 'DIRECTORY_ACCOUNT_NOT_LOCAL', isLocalOnly: false },
    });
    expect(issueTemporaryPasswordForUser).not.toHaveBeenCalled();
  });

  it('returns USER_INACTIVE without issuing or changing a password', async () => {
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'user-1',
          email: 'user@example.com',
          displayName: 'Inactive User',
          isActive: false,
          isLocalOnly: true,
          organizationalUnitId: 'ou-1',
        }),
      },
    };
    await expect(
      resetUserTemporaryPassword(prisma as never, 'user-1', dependencies),
    ).rejects.toMatchObject({ code: 'USER_INACTIVE' });
    expect(issueTemporaryPasswordForUser).not.toHaveBeenCalled();
  });

  it('rejects missing users', async () => {
    const prisma = { user: { findUnique: jest.fn().mockResolvedValue(null) } };
    await expect(
      resetUserTemporaryPassword(prisma as never, 'missing', dependencies),
    ).rejects.toBeInstanceOf(UsersError);
  });
});
