import { GUARDS_METADATA } from '@nestjs/common/constants';
import { AUTHORIZATION_REQUIRED_ROLES_KEY } from '../authorization/authorization.constants';
import { authorizationRoleKeys } from '../authorization/authorization.constants';
import { GroupsMineController } from './groups-mine.controller';

jest.mock('../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

describe('GroupsMineController guards', () => {
  it('requires session authentication and any authenticated role, not admin-only', () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, GroupsMineController) as unknown[];
    expect((guards as Array<{ name: string }>).map((guard) => guard.name)).toEqual(
      expect.arrayContaining(['SessionAuthenticationGuard', 'RoleGuard']),
    );
    const roles = Reflect.getMetadata(
      AUTHORIZATION_REQUIRED_ROLES_KEY,
      GroupsMineController,
    ) as readonly string[];
    expect(roles).toEqual(
      expect.arrayContaining([
        authorizationRoleKeys.user,
        authorizationRoleKeys.agent,
        authorizationRoleKeys.admin,
        authorizationRoleKeys.superAdmin,
      ]),
    );
  });
});
