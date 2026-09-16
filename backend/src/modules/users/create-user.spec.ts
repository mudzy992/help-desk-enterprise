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
      openTicketCount: 0,
    },
  ]),
}));

import { ensureSystemRole } from './ensure-system-role';
import { assignUserRole } from './assign-user-role';

describe('createUser', () => {
  it('ensures USER role exists before assign', async () => {
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
    const summary = await createUser(prisma as never, {
      displayName: 'Test User',
      email: 'user@example.com',
      roleKey: authorizationRoleKeys.user,
      actorUserId: 'actor-1',
      actorIsSuperAdmin: true,
      requestId: 'req-1',
    });
    expect(ensureSystemRole).toHaveBeenCalledWith(
      prisma,
      authorizationRoleKeys.user,
    );
    expect(assignUserRole).toHaveBeenCalled();
    expect(summary.id).toBe('user-1');
  });

  it('rejects empty display name', async () => {
    const prisma = {
      organizationalUnit: { findUnique: jest.fn() },
      user: { findUnique: jest.fn(), create: jest.fn() },
    };
    await expect(
      createUser(prisma as never, {
        displayName: '  ',
        email: 'user@example.com',
        roleKey: authorizationRoleKeys.user,
        actorUserId: 'actor-1',
        actorIsSuperAdmin: true,
        requestId: 'req-1',
      }),
    ).rejects.toBeInstanceOf(UsersError);
  });
});
