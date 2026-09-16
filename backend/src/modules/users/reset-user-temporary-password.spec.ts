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

import { issueTemporaryPasswordForUser } from './issue-temporary-password-for-user';

describe('resetUserTemporaryPassword', () => {
  it('reissues a temporary password for an active user', async () => {
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'user-1',
          email: 'user@example.com',
          displayName: 'Test User',
          isActive: true,
        }),
      },
    };
    const response = await resetUserTemporaryPassword(
      prisma as never,
      'user-1',
      {
        settingsService: {} as never,
        mailTransport: { send: jest.fn() } as never,
      },
    );
    expect(issueTemporaryPasswordForUser).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-1' }),
    );
    expect(response.temporaryPassword).toBe('ResetPassword!23456');
    expect(response.temporaryPasswordDelivery).toBe('ui');
  });

  it('rejects missing users', async () => {
    const prisma = {
      user: { findUnique: jest.fn().mockResolvedValue(null) },
    };
    await expect(
      resetUserTemporaryPassword(prisma as never, 'missing', {
        settingsService: {} as never,
        mailTransport: { send: jest.fn() } as never,
      }),
    ).rejects.toBeInstanceOf(UsersError);
  });
});
