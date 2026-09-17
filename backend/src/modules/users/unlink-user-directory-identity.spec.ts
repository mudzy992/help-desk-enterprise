import { unlinkUserDirectoryIdentity } from './unlink-user-directory-identity';
import { UsersError } from './users.error';

jest.mock('./list-users-summary', () => ({
  listUsersSummary: jest.fn().mockResolvedValue([
    {
      id: 'user-1',
      displayName: 'Linked User',
      email: 'linked@example.com',
      isActive: true,
      isLocalOnly: true,
      roleKey: 'USER',
      roleName: 'User',
      roleTone: 'user',
      organizationalUnitId: null,
      organizationalUnitName: null,
      groupName: null,
      policyPackKey: null,
      openTicketCount: 0,
      mfa: null,
    },
  ]),
}));

jest.mock('./issue-temporary-password-for-user', () => ({
  issueTemporaryPasswordForUser: jest.fn().mockResolvedValue({
    temporaryPassword: 'TempPassword!23456',
    temporaryPasswordDelivery: 'ui',
  }),
}));

import { issueTemporaryPasswordForUser } from './issue-temporary-password-for-user';

describe('unlinkUserDirectoryIdentity', () => {
  it('clears directory binding and issues a temporary password', async () => {
    const update = jest.fn().mockResolvedValue({});
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'user-1',
          email: 'linked@example.com',
          displayName: 'Linked User',
          isActive: true,
          isLocalOnly: false,
          entraObjectId: 'manual_only:user:dev-reader',
        }),
        update,
      },
    };
    const result = await unlinkUserDirectoryIdentity(prisma as never, 'user-1', {
      settingsService: {} as never,
      mailTransport: { send: jest.fn() } as never,
    });
    expect(update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { entraObjectId: null },
    });
    expect(issueTemporaryPasswordForUser).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-1' }),
    );
    expect(result.temporaryPassword).toBe('TempPassword!23456');
    expect(result.user.isLocalOnly).toBe(true);
  });

  it('rejects already-local accounts', async () => {
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'user-1',
          email: 'local@example.com',
          displayName: 'Local',
          isActive: true,
          isLocalOnly: true,
          entraObjectId: null,
        }),
        update: jest.fn(),
      },
    };
    await expect(
      unlinkUserDirectoryIdentity(prisma as never, 'user-1', {
        settingsService: {} as never,
        mailTransport: { send: jest.fn() } as never,
      }),
    ).rejects.toBeInstanceOf(UsersError);
  });
});
