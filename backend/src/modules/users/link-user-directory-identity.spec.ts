import { authenticationConstants } from '../authentication/authentication.constants';
import { linkUserDirectoryIdentity } from './link-user-directory-identity';
import { UsersError } from './users.error';

jest.mock('./list-users-summary', () => ({
  listUsersSummary: jest.fn().mockResolvedValue([
    {
      id: 'user-1',
      displayName: 'Local User',
      email: 'local@example.com',
      isActive: true,
      isLocalOnly: false,
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

describe('linkUserDirectoryIdentity', () => {
  const update = jest.fn();
  const findUnique = jest.fn();
  const prisma = {
    user: { findUnique, update },
  };
  const listDirectoryUsersForLinking = jest.fn();
  const directorySyncService = { listDirectoryUsersForLinking };

  beforeEach(() => {
    findUnique.mockReset();
    update.mockReset();
    listDirectoryUsersForLinking.mockReset();
  });

  it('links a local user by explicit directory external id', async () => {
    findUnique
      .mockResolvedValueOnce({
        id: 'user-1',
        isLocalOnly: true,
        entraObjectId: null,
        userRoles: [{ role: { key: 'USER' } }],
      })
      .mockResolvedValueOnce(null);
    listDirectoryUsersForLinking.mockResolvedValue([
      {
        externalId: 'manual_only:user:dev-reader',
        email: 'other@example.com',
        displayName: 'Directory User',
        login: null,
        distinguishedName: null,
        organizationalUnitPath: null,
      },
    ]);
    update.mockResolvedValue({});
    const result = await linkUserDirectoryIdentity({
      prisma: prisma as never,
      directorySyncService: directorySyncService as never,
      userId: 'user-1',
      directoryExternalId: 'manual_only:user:dev-reader',
    });
    expect(update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: {
        entraObjectId: 'manual_only:user:dev-reader',
        isLocalOnly: false,
        localPasswordHash: null,
        mustChangePassword: false,
      },
    });
    expect(result.isLocalOnly).toBe(false);
  });

  it('rejects missing directory external id without email matching', async () => {
    findUnique.mockResolvedValueOnce({
      id: 'user-1',
      isLocalOnly: true,
      entraObjectId: null,
      userRoles: [],
    });
    listDirectoryUsersForLinking.mockResolvedValue([
      {
        externalId: 'manual_only:user:other',
        email: 'local@example.com',
        displayName: 'Same Email',
        login: null,
        distinguishedName: null,
        organizationalUnitPath: null,
      },
    ]);
    await expect(
      linkUserDirectoryIdentity({
        prisma: prisma as never,
        directorySyncService: directorySyncService as never,
        userId: 'user-1',
        directoryExternalId: 'manual_only:user:missing',
      }),
    ).rejects.toBeInstanceOf(UsersError);
    expect(update).not.toHaveBeenCalled();
  });

  it('rejects SuperAdmin targets and occupied directory identities', async () => {
    findUnique.mockResolvedValueOnce({
      id: 'user-1',
      isLocalOnly: true,
      entraObjectId: null,
      userRoles: [
        { role: { key: authenticationConstants.superAdminRoleKey } },
      ],
    });
    await expect(
      linkUserDirectoryIdentity({
        prisma: prisma as never,
        directorySyncService: directorySyncService as never,
        userId: 'user-1',
        directoryExternalId: 'manual_only:user:dev-reader',
      }),
    ).rejects.toMatchObject({ code: 'SUPER_ADMIN_DIRECTORY_LINK_FORBIDDEN' });

    findUnique
      .mockResolvedValueOnce({
        id: 'user-1',
        isLocalOnly: true,
        entraObjectId: null,
        userRoles: [{ role: { key: 'USER' } }],
      })
      .mockResolvedValueOnce({ id: 'user-2' });
    listDirectoryUsersForLinking.mockResolvedValue([
      {
        externalId: 'manual_only:user:dev-reader',
        email: null,
        displayName: 'Directory User',
        login: null,
        distinguishedName: null,
        organizationalUnitPath: null,
      },
    ]);
    await expect(
      linkUserDirectoryIdentity({
        prisma: prisma as never,
        directorySyncService: directorySyncService as never,
        userId: 'user-1',
        directoryExternalId: 'manual_only:user:dev-reader',
      }),
    ).rejects.toMatchObject({ code: 'DIRECTORY_IDENTITY_CONFLICT' });
  });
});
