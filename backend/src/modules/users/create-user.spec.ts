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

jest.mock('../authentication/hash-local-password', () => ({
  hashLocalPassword: jest.fn().mockResolvedValue('$2b$04$hashed-temporary'),
}));

jest.mock('./send-temporary-password-email', () => ({
  sendTemporaryPasswordEmail: jest.fn().mockResolvedValue(false),
}));

import { hashLocalPassword } from '../authentication/hash-local-password';
import { ensureSystemRole } from './ensure-system-role';
import { assignUserRole } from './assign-user-role';
import { sendTemporaryPasswordEmail } from './send-temporary-password-email';

const createDependencies = () => ({
  settingsService: {} as never,
  mailTransport: { send: jest.fn() } as never,
});

describe('createUser', () => {
  it('sets localPasswordHash, isLocalOnly, and mustChangePassword', async () => {
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
    expect(hashLocalPassword).toHaveBeenCalled();
    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        isLocalOnly: true,
        mustChangePassword: true,
        localPasswordHash: '$2b$04$hashed-temporary',
      }),
    });
    expect(create.mock.calls[0][0].data.localPasswordHash).not.toBeNull();
    expect(assignUserRole).toHaveBeenCalled();
    expect(response.user.id).toBe('user-1');
    expect(response.temporaryPasswordDelivery).toBe('ui');
    expect(response.temporaryPassword).toEqual(expect.any(String));
    expect(response.temporaryPassword!.length).toBeGreaterThanOrEqual(12);
  });

  it('omits temporary password from response when emailed', async () => {
    (sendTemporaryPasswordEmail as jest.Mock).mockResolvedValueOnce(true);
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
