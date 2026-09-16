import { authorizationRoleKeys } from '../authorization/authorization.constants';
import { ensureSystemRole } from './ensure-system-role';
import { UsersError } from './users.error';

describe('ensureSystemRole', () => {
  it('creates a missing USER role', async () => {
    const created = { id: 'role-user' };
    const prisma = {
      role: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue(created),
      },
    };
    const roleId = await ensureSystemRole(prisma as never, authorizationRoleKeys.user);
    expect(roleId).toBe('role-user');
    expect(prisma.role.create).toHaveBeenCalledWith({
      data: {
        key: 'USER',
        name: 'User',
        isSystem: true,
      },
      select: { id: true },
    });
  });

  it('rejects unknown role keys', async () => {
    const prisma = {
      role: {
        findUnique: jest.fn(),
        create: jest.fn(),
      },
    };
    await expect(ensureSystemRole(prisma as never, 'UNKNOWN')).rejects.toBeInstanceOf(
      UsersError,
    );
  });
});
