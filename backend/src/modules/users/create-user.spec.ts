import { authorizationRoleKeys } from '../authorization/authorization.constants';
import { createUser } from './create-user';
import { UsersError } from './users.error';

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
  settingsService: {} as never,
  mailTransport: { send: jest.fn() } as never,
});

describe('createUser', () => {
  it('sets local credentials via temporary password issue and returns UI secret', async () => {
    const create = jest.fn().mockResolvedValue({
      id: 'user-1',
      displayName: 'Test User',
      email: 'user@example.com',
    });
    const prisma = {
      organizationalUnit: { findUnique: jest.fn() },
      user: {
        findUnique: jest.fn().mockResolvedValue(null),
        create,
      },
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
    expect(assignUserRole).toHaveBeenCalled();
    expect(response.temporaryPasswordDelivery).toBe('ui');
    expect(response.temporaryPassword).toBe('TempPassword!23456');
  });

  it('omits temporary password from response when emailed', async () => {
    (issueTemporaryPasswordForUser as jest.Mock).mockResolvedValueOnce({
      temporaryPassword: null,
      temporaryPasswordDelivery: 'email',
    });
    const prisma = {
      organizationalUnit: { findUnique: jest.fn() },
      user: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({
          id: 'user-1',
          displayName: 'Test User',
          email: 'user@example.com',
        }),
      },
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
      user: { findUnique: jest.fn(), create: jest.fn() },
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
