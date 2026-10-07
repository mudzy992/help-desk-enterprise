jest.mock(
  './record-user-change',
  () => ({ recordUserChange: jest.fn().mockResolvedValue(undefined) }),
  { virtual: true },
);
jest.mock('./list-users-summary', () => ({ listUsersSummary: jest.fn().mockResolvedValue([]) }));

import { authenticationConstants } from '../authentication/authentication.constants';
import { linkUserDirectoryIdentity } from './link-user-directory-identity';

describe('linkUserDirectoryIdentity SuperAdmin invariant (5.2.1 M3 B5)', () => {
  it('rechecks the role after acquiring the shared invariant lock and writes no link', async () => {
    const update = jest.fn();
    const transactionFindUnique = jest.fn().mockResolvedValueOnce({
      id: 'user-1',
      isLocalOnly: true,
      entraObjectId: null,
      directoryObjectGuid: null,
      organizationalUnitId: 'ou-1',
      userRoles: [{ role: { key: authenticationConstants.superAdminRoleKey } }],
    });
    const transaction = {
      $executeRaw: jest.fn().mockResolvedValue(1),
      user: { findUnique: transactionFindUnique, update },
    };
    const findUnique = jest
      .fn()
      .mockResolvedValueOnce({
        id: 'user-1',
        isLocalOnly: true,
        entraObjectId: null,
        directoryObjectGuid: null,
        organizationalUnitId: 'ou-1',
        userRoles: [{ role: { key: 'USER' } }],
      })
      .mockResolvedValueOnce(null);
    const prisma = {
      user: { findUnique },
      $transaction: jest.fn(async (operation: (client: unknown) => Promise<unknown>) =>
        operation(transaction),
      ),
    };
    const directorySyncService = {
      listDirectoryUsersForLinking: jest.fn().mockResolvedValue([
        {
          externalId: 'directory-user-1',
          email: null,
          displayName: 'Directory User',
          login: null,
          distinguishedName: null,
          organizationalUnitPath: null,
        },
      ]),
    };

    await expect(
      linkUserDirectoryIdentity({
        prisma: prisma as never,
        directorySyncService: directorySyncService as never,
        userId: 'user-1',
        directoryExternalId: 'directory-user-1',
      }),
    ).rejects.toMatchObject({ code: 'SUPER_ADMIN_DIRECTORY_LINK_FORBIDDEN' });

    expect(transaction.$executeRaw).toHaveBeenCalledTimes(1);
    expect(update).not.toHaveBeenCalled();
  });
});
