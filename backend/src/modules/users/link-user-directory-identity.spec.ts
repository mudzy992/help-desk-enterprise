import { auditLogActions } from '../audit-log/audit-log.constants';
import { recordUserChange } from './record-user-change';
import { authenticationConstants } from '../authentication/authentication.constants';
import { linkUserDirectoryIdentity } from './link-user-directory-identity';
import { UsersError } from './users.error';

jest.mock('./record-user-change', () => ({
  recordUserChange: jest.fn().mockResolvedValue(undefined),
}));

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
  const transactionFindUnique = jest.fn();
  const transaction = {
    $executeRaw: jest.fn().mockResolvedValue(1),
    user: { findUnique: transactionFindUnique, update },
  };
  const prisma = {
    user: { findUnique },
    $transaction: jest.fn(async (callback: (client: unknown) => Promise<void>) => callback(transaction)),
  };
  const listDirectoryUsersForLinking = jest.fn();
  const directorySyncService = { listDirectoryUsersForLinking };

  beforeEach(() => {
    jest.mocked(recordUserChange).mockClear();
    findUnique.mockReset();
    transactionFindUnique.mockReset();
    transaction.$executeRaw.mockClear();
    update.mockReset();
    listDirectoryUsersForLinking.mockReset();
  });

  it('links a local user by explicit directory external id', async () => {
    findUnique
      .mockResolvedValueOnce({
        id: 'user-1',
        isLocalOnly: true,
        entraObjectId: null,
        directoryObjectGuid: null,
        organizationalUnitId: 'ou-1',
        userRoles: [{ role: { key: 'USER' } }],
      })
      .mockResolvedValueOnce(null);
    transactionFindUnique
      .mockResolvedValueOnce({
        id: 'user-1',
        isLocalOnly: true,
        entraObjectId: null,
        directoryObjectGuid: null,
        organizationalUnitId: 'ou-1',
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
    expect(recordUserChange).toHaveBeenCalledWith(transaction, expect.objectContaining({
      action: auditLogActions.userUpdated,
      entityId: 'user-1',
      organizationalUnitId: 'ou-1',
      metadata: {
        directoryIdentityLinked: true,
        directoryKind: 'entra',
        before: { isLocalOnly: true, directoryLinked: false },
        after: { isLocalOnly: false, directoryLinked: true },
      },
    }));
    expect(JSON.stringify(jest.mocked(recordUserChange).mock.calls)).not.toContain('manual_only:user:dev-reader');
    expect(result.isLocalOnly).toBe(false);
  });

  it('rechecks SuperAdmin roles inside the serialized link transaction', async () => {
    findUnique
      .mockResolvedValueOnce({
        id: 'user-1',
        isLocalOnly: true,
        entraObjectId: null,
        directoryObjectGuid: null,
        organizationalUnitId: 'ou-1',
        userRoles: [{ role: { key: 'USER' } }],
      })
      .mockResolvedValueOnce(null);
    transactionFindUnique.mockResolvedValueOnce({
      id: 'user-1',
      isLocalOnly: true,
      entraObjectId: null,
      directoryObjectGuid: null,
      organizationalUnitId: 'ou-1',
      userRoles: [
        { role: { key: authenticationConstants.superAdminRoleKey } },
      ],
    });
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
    ).rejects.toMatchObject({ code: 'SUPER_ADMIN_DIRECTORY_LINK_FORBIDDEN' });

    expect(transaction.$executeRaw).toHaveBeenCalledTimes(1);
    expect(update).not.toHaveBeenCalled();
    expect(recordUserChange).not.toHaveBeenCalled();
  });

  it('rechecks directory identity conflicts inside the serialized transaction', async () => {
    findUnique
      .mockResolvedValueOnce({
        id: 'user-1',
        isLocalOnly: true,
        entraObjectId: null,
        directoryObjectGuid: null,
        organizationalUnitId: 'ou-1',
        userRoles: [{ role: { key: 'USER' } }],
      })
      .mockResolvedValueOnce(null);
    transactionFindUnique
      .mockResolvedValueOnce({
        id: 'user-1',
        isLocalOnly: true,
        entraObjectId: null,
        directoryObjectGuid: null,
        organizationalUnitId: 'ou-1',
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
    expect(update).not.toHaveBeenCalled();
    expect(recordUserChange).not.toHaveBeenCalled();
  });

  it('rejects missing directory external id without email matching', async () => {
    findUnique.mockResolvedValueOnce({
      id: 'user-1',
      isLocalOnly: true,
      entraObjectId: null,
      directoryObjectGuid: null,
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
      directoryObjectGuid: null,
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
        directoryObjectGuid: null,
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
