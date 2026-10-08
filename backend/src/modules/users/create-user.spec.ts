import { auditLogActions } from '../audit-log/audit-log.constants';
import { recordUserChange } from './record-user-change';
import { authorizationRoleKeys } from '../authorization/authorization.constants';
import { createUser } from './create-user';
import { UsersError } from './users.error';

jest.mock('./record-user-change', () => ({
  recordUserChange: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('./ensure-system-role', () => ({
  ensureSystemRole: jest.fn().mockResolvedValue('role-user'),
}));

jest.mock('./assign-user-role', () => ({
  assignUserRole: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('./list-users-summary', () => ({
  listUsersSummary: jest.fn().mockResolvedValue([
    {
      id: 'user-1',
      displayName: 'Test User',
      email: 'user@example.com',
      roleKey: 'USER',
      roleName: 'User',
      roleTone: 'user',
      organizationalUnitName: null,
      groupName: null,
      policyPackKey: null,
      isActive: true,
      isLocalOnly: true,
      openTicketCount: 0,
    },
  ]),
}));

jest.mock('./issue-temporary-password-for-user', () => ({
  issueTemporaryPasswordForUser: jest.fn().mockResolvedValue({
    temporaryPassword: 'TempPassword!23456',
    temporaryPasswordDelivery: 'ui',
  }),
}));

import { ensureSystemRole } from './ensure-system-role';
import { assignUserRole } from './assign-user-role';
import { issueTemporaryPasswordForUser } from './issue-temporary-password-for-user';

const createDependencies = () => ({
  // 5.3.2: the summary marks a policy pack as inactive when settings switch it
  // off, so user creation reads the disabled-key CSV through the same service.
  settingsService: {
    getSecretForInternalUse: jest.fn(async () => null),
  } as never,
  mailTransport: { send: jest.fn() } as never,
});

describe('createUser', () => {
  it('sets local credentials via temporary password issue and returns UI secret', async () => {
    const create = jest.fn().mockResolvedValue({
      id: 'user-1',
      displayName: 'Test User',
      email: 'user@example.com',
      organizationalUnitId: null,
      isLocalOnly: true,
      isActive: true,
      mustChangePassword: true,
    });
    const transaction = { user: { create } };
    const prisma = {
      organizationalUnit: { findUnique: jest.fn() },
      user: { findUnique: jest.fn().mockResolvedValue(null) },
      $transaction: jest.fn(async (callback: (client: unknown) => Promise<unknown>) => callback(transaction)),
    };
    const response = await createUser(
      prisma as never,
      {
        displayName: 'Test User',
        email: 'user@example.com',
        roleKey: authorizationRoleKeys.user,
        actorUserId: 'actor-1',
        actorIsSuperAdmin: true,
        requestId: 'req-1',
      },
      createDependencies(),
    );
    expect(ensureSystemRole).toHaveBeenCalledWith(
      prisma,
      authorizationRoleKeys.user,
    );
    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        isLocalOnly: true,
        mustChangePassword: true,
      }),
    });
    expect(issueTemporaryPasswordForUser).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        email: 'user@example.com',
      }),
    );
    expect(recordUserChange).toHaveBeenCalledWith(
      transaction,
      expect.objectContaining({
        action: auditLogActions.userCreated,
        entityId: 'user-1',
        actorUserId: 'actor-1',
        requestId: 'req-1',
        metadata: expect.objectContaining({
          after: expect.objectContaining({ displayName: 'Test User', isLocalOnly: true }),
        }),
      }),
    );
    expect(assignUserRole).toHaveBeenCalled();
    expect(response.temporaryPasswordDelivery).toBe('ui');
    expect(response.temporaryPassword).toBe('TempPassword!23456');
  });

  it('rolls back user creation when the audit insert fails', async () => {
    jest.mocked(issueTemporaryPasswordForUser).mockClear();
    jest.mocked(assignUserRole).mockClear();
    jest.mocked(recordUserChange).mockClear();
    const auditFailure = new Error('audit insert failed');
    let persistedUserIds: string[] = [];
    const createdUser = {
      id: 'user-rollback',
      displayName: 'Rollback User',
      email: 'rollback@example.com',
      organizationalUnitId: null,
      isLocalOnly: true,
      isActive: true,
      mustChangePassword: true,
    };
    const prisma = {
      organizationalUnit: { findUnique: jest.fn() },
      user: { findUnique: jest.fn().mockResolvedValue(null) },
      $transaction: jest.fn(async (callback: (client: unknown) => Promise<unknown>) => {
        let stagedUserIds = [...persistedUserIds];
        const transaction = {
          user: {
            create: jest.fn(async () => {
              stagedUserIds = [...stagedUserIds, createdUser.id];
              return createdUser;
            }),
          },
        };
        const result = await callback(transaction);
        persistedUserIds = stagedUserIds;
        return result;
      }),
    };
    jest.mocked(recordUserChange).mockRejectedValueOnce(auditFailure);

    await expect(
      createUser(
        prisma as never,
        {
          displayName: 'Rollback User',
          email: 'rollback@example.com',
          roleKey: authorizationRoleKeys.user,
          actorUserId: 'actor-1',
          actorIsSuperAdmin: true,
          requestId: 'req-rollback',
        },
        createDependencies(),
      ),
    ).rejects.toBe(auditFailure);
    expect(persistedUserIds).toEqual([]);
    expect(issueTemporaryPasswordForUser).not.toHaveBeenCalled();
    expect(assignUserRole).not.toHaveBeenCalled();
  });

  it('omits temporary password from response when emailed', async () => {
    (issueTemporaryPasswordForUser as jest.Mock).mockResolvedValueOnce({
      temporaryPassword: null,
      temporaryPasswordDelivery: 'email',
    });
    const transaction = {
      user: {
        create: jest.fn().mockResolvedValue({
          id: 'user-1',
          displayName: 'Test User',
          email: 'user@example.com',
          organizationalUnitId: null,
          isLocalOnly: true,
          isActive: true,
          mustChangePassword: true,
        }),
      },
    };
    const prisma = {
      organizationalUnit: { findUnique: jest.fn() },
      user: { findUnique: jest.fn().mockResolvedValue(null) },
      $transaction: jest.fn(async (callback: (client: unknown) => Promise<unknown>) => callback(transaction)),
    };
    const response = await createUser(
      prisma as never,
      {
        displayName: 'Test User',
        email: 'user@example.com',
        roleKey: authorizationRoleKeys.user,
        actorUserId: 'actor-1',
        actorIsSuperAdmin: true,
        requestId: 'req-1',
      },
      createDependencies(),
    );
    expect(response.temporaryPasswordDelivery).toBe('email');
    expect(response.temporaryPassword).toBeNull();
  });

  it('rejects empty display name', async () => {
    const prisma = {
      organizationalUnit: { findUnique: jest.fn() },
      user: { findUnique: jest.fn() },
    };
    await expect(
      createUser(
        prisma as never,
        {
          displayName: '  ',
          email: 'user@example.com',
          roleKey: authorizationRoleKeys.user,
          actorUserId: 'actor-1',
          actorIsSuperAdmin: true,
          requestId: 'req-1',
        },
        createDependencies(),
      ),
    ).rejects.toBeInstanceOf(UsersError);
  });
});
