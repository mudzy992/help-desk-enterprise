import { auditLogActions } from '../audit-log/audit-log.constants';
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
  const dependencies = {
    settingsService: {} as never,
    mailTransport: { send: jest.fn() } as never,
  };

  beforeEach(() => jest.mocked(issueTemporaryPasswordForUser).mockClear());

  it('atomically clears an AD binding, issues a local password, and audits without identifiers or secrets', async () => {
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'user-1',
          email: 'linked@example.com',
          displayName: 'Linked User',
          isActive: true,
          isLocalOnly: false,
          entraObjectId: null,
          directoryObjectGuid: 'guid-secret-value',
          organizationalUnitId: 'ou-1',
        }),
      },
    };
    const result = await unlinkUserDirectoryIdentity(prisma as never, 'user-1', dependencies, {
      actorUserId: 'admin-1',
      requestId: 'req-1',
    });
    const issueInput = jest.mocked(issueTemporaryPasswordForUser).mock.calls[0]?.[0];
    expect(issueInput).toEqual(expect.objectContaining({
      userId: 'user-1',
      audit: {
        action: auditLogActions.userDirectoryUnlinked,
        actorUserId: 'admin-1',
        requestId: 'req-1',
        organizationalUnitId: 'ou-1',
        metadata: {
          directoryKind: 'ldaps',
          before: { directoryLinked: true, isLocalOnly: false },
          after: { directoryLinked: false, isLocalOnly: true, mustChangePassword: true },
        },
      },
    }));
    const transaction = { user: { update: jest.fn().mockResolvedValue({}) } };
    await issueInput?.beforePasswordUpdate?.(transaction as never);
    expect(transaction.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { entraObjectId: null, directoryObjectGuid: null, distinguishedName: null },
    });
    expect(JSON.stringify(issueInput?.audit?.metadata)).not.toContain('guid-secret-value');
    expect(JSON.stringify(issueInput?.audit?.metadata)).not.toContain('TempPassword!23456');
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
          directoryObjectGuid: null,
        }),
      },
    };
    await expect(
      unlinkUserDirectoryIdentity(prisma as never, 'user-1', dependencies),
    ).rejects.toBeInstanceOf(UsersError);
    expect(issueTemporaryPasswordForUser).not.toHaveBeenCalled();
  });
});
