import { recordUserChange } from './record-user-change';
import { linkUserDirectoryIdentity } from './link-user-directory-identity';
import { unlinkUserDirectoryIdentity } from './unlink-user-directory-identity';
import type {
  AccountSecurityBoundaryPort,
  AccountSecurityCut,
} from '../authentication/security/account-security-boundary.service';

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
jest.mock('./super-admin-invariant', () => ({
  lockActiveSuperAdminInvariant: jest.fn(async () => undefined),
  hasActiveSuperAdminRole: jest.fn(async () => false),
  assertAnotherActiveSuperAdminExists: jest.fn(async () => undefined),
}));
jest.mock('./issue-temporary-password-for-user', () => ({
  issueTemporaryPasswordForUser: jest.fn(async (input: {
    beforePasswordUpdate?: (transaction: unknown) => Promise<void>;
  }) => {
    const transaction = { user: { update: jest.fn(async () => ({})) } };
    await input.beforePasswordUpdate?.(transaction);
    return { temporaryPassword: 'Temp-1234', temporaryPasswordDelivery: 'ui' };
  }),
}));

/*
  W2.22 (`BA-users-03`): both identity transitions move "who may authenticate".
  The cut has to happen on the transition's own transaction, and it has to name the
  transition so the audit says which direction the account moved.
*/
describe('identity transitions cut the credential boundary', () => {
  const cut: AccountSecurityCut = {
    transition: 'directory_linked',
    cutoffAt: '2026-10-29T10:00:00.000Z',
    sessions: 1,
    passkeys: 0,
    mfaFactors: 1,
    recoveryCodes: 8,
  };

  function boundary(transition: AccountSecurityCut['transition']): AccountSecurityBoundaryPort & {
    cutWithinTransaction: jest.Mock;
    afterCommit: jest.Mock;
  } {
    return {
      cutWithinTransaction: jest.fn(async () => ({ ...cut, transition })),
      afterCommit: jest.fn(async () => undefined),
    } as unknown as AccountSecurityBoundaryPort & {
      cutWithinTransaction: jest.Mock;
      afterCommit: jest.Mock;
    };
  }

  const localUser = {
    id: 'user-1',
    isLocalOnly: true,
    entraObjectId: null,
    directoryObjectGuid: null,
    organizationalUnitId: 'ou-1',
    userRoles: [{ role: { key: 'USER' } }],
  };

  it('cuts on link, inside the linking transaction', async () => {
    const update = jest.fn(async () => ({}));
    const transaction = {
      $executeRaw: jest.fn(async () => 1),
      user: {
        findUnique: jest.fn(async () => localUser),
        update,
      },
    };
    const prisma = {
      user: { findUnique: jest.fn(async () => localUser) },
      $transaction: jest.fn(async (callback: (client: unknown) => Promise<void>) => callback(transaction)),
    };
    const port = boundary('directory_linked');

    await linkUserDirectoryIdentity({
      prisma: prisma as never,
      directorySyncService: {
        listDirectoryUsersForLinking: jest.fn(async () => [
          { externalId: 'entra-oid-1', email: 'local@example.com', displayName: 'Local User' },
        ]),
      } as never,
      userId: 'user-1',
      directoryExternalId: 'entra-oid-1',
      context: { actorUserId: 'admin-1', requestId: 'req-1' },
      securityBoundary: port,
    });

    expect(port.cutWithinTransaction).toHaveBeenCalledWith(transaction, {
      userId: 'user-1',
      actorUserId: 'admin-1',
      transition: 'directory_linked',
    });
    expect(port.afterCommit).toHaveBeenCalledWith({
      userId: 'user-1',
      actorUserId: 'admin-1',
      cut: expect.objectContaining({ transition: 'directory_linked', sessions: 1 }),
    });
    // The local factor lifecycle dies with the local identity.
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ isLocalOnly: false, localPasswordHash: null }),
      }),
    );
    expect(jest.mocked(recordUserChange)).toHaveBeenCalled();
  });

  it('cuts on unlink, inside the password transaction', async () => {
    const port = boundary('directory_unlinked');
    const prisma = {
      user: {
        findUnique: jest.fn(async () => ({
          id: 'user-1',
          email: 'local@example.com',
          displayName: 'Local User',
          isActive: true,
          isLocalOnly: false,
          entraObjectId: 'entra-oid-1',
          directoryObjectGuid: null,
          organizationalUnitId: 'ou-1',
        })),
      },
      $transaction: jest.fn(),
    };

    await unlinkUserDirectoryIdentity(
      prisma as never,
      'user-1',
      {
        settingsService: {} as never,
        mailTransport: {} as never,
        securityBoundary: port,
      },
      { actorUserId: 'admin-1', requestId: 'req-1' },
    );

    // The hook runs inside `issueTemporaryPasswordForUser`'s transaction.
    expect(port.cutWithinTransaction).toHaveBeenCalledWith(expect.anything(), {
      userId: 'user-1',
      actorUserId: 'admin-1',
      transition: 'directory_unlinked',
    });
    expect(port.afterCommit).toHaveBeenCalledWith({
      userId: 'user-1',
      actorUserId: 'admin-1',
      cut: expect.objectContaining({ transition: 'directory_unlinked' }),
    });
  });
});
