import { GUARDS_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import {
  AUTHORIZATION_ORGANIZATIONAL_UNIT_SCOPE_KEY,
  AUTHORIZATION_REQUIRED_PERMISSIONS_KEY,
  permissionKeys,
} from '../authorization/authorization.constants';
import { UserSecurityController } from './user-security.controller';

jest.mock('../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

function guardNames(handler: object): string[] {
  const guards = Reflect.getMetadata(GUARDS_METADATA, handler) as unknown[] | undefined;
  return (guards ?? []).map((guard) => (guard as { name: string }).name);
}

describe('UserSecurityController guards (W2.10)', () => {
  it('gates account security on user.security.manage', () => {
    expect(
      Reflect.getMetadata(AUTHORIZATION_REQUIRED_PERMISSIONS_KEY, UserSecurityController),
    ).toEqual([permissionKeys.userSecurityManage]);
  });

  it('resolves the target user organizational unit on every security route', () => {
    for (const handler of [
      UserSecurityController.prototype.security,
      UserSecurityController.prototype.revokeAll,
      UserSecurityController.prototype.resetMfa,
    ]) {
      expect(guardNames(handler)).toContain('OuAccessGuard');
      expect(
        Reflect.getMetadata(AUTHORIZATION_ORGANIZATIONAL_UNIT_SCOPE_KEY, handler),
      ).toEqual({ field: 'userId', resource: 'user' });
    }
  });

  it('applies the class-level permission on routes without their own decorator', () => {
    // `getAllAndOverride` walks handler-then-class, which is how the class-level
    // permission still applies on routes without their own decorator.
    expect(new Reflector().getAllAndOverride(AUTHORIZATION_REQUIRED_PERMISSIONS_KEY, [
      UserSecurityController.prototype.security,
      UserSecurityController,
    ])).toEqual([permissionKeys.userSecurityManage]);
  });
});
