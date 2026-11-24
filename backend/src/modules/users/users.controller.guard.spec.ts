import {
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import {
  AUTHORIZATION_ORGANIZATIONAL_UNIT_SCOPE_KEY,
  AUTHORIZATION_REQUIRED_PERMISSIONS_KEY,
  permissionKeys,
} from '../authorization/authorization.constants';
import { RoleGuard } from '../authorization/role.guard';
import { UsersController } from './users.controller';

jest.mock('../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

function createContext(request: Record<string, unknown>): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => UsersController.prototype.assignRole,
    getClass: () => UsersController,
  } as unknown as ExecutionContext;
}

function guardNames(target: object): string[] {
  const guards = Reflect.getMetadata(GUARDS_METADATA, target) as unknown[] | undefined;
  return (guards ?? []).map((guard) => (guard as { name: string }).name);
}

function scopeLocator(handler: object): unknown {
  return Reflect.getMetadata(AUTHORIZATION_ORGANIZATIONAL_UNIT_SCOPE_KEY, handler);
}

describe('UsersController guards', () => {
  it('gates the control plane on the explicit user.manage permission', () => {
    expect(guardNames(UsersController)).toEqual(
      expect.arrayContaining(['SessionAuthenticationGuard', 'RoleGuard']),
    );
    expect(
      Reflect.getMetadata(AUTHORIZATION_REQUIRED_PERMISSIONS_KEY, UsersController),
    ).toEqual([permissionKeys.userManage]);
  });

  it('keeps the list route unscoped in the guard, because it has no id to scope', () => {
    // The service narrows the list (`listSummaryPageForActor`); a scope locator
    // here would resolve to null and deny every scoped caller instead.
    expect(Reflect.getMetadata(GUARDS_METADATA, UsersController.prototype.listSummary)).toBeUndefined();
    expect(scopeLocator(UsersController.prototype.listSummary)).toBeUndefined();
  });

  it('scopes the write routes to the caller organizational units', () => {
    expect(guardNames(UsersController.prototype.create)).toContain('OuAccessGuard');
    expect(scopeLocator(UsersController.prototype.create)).toEqual({
      field: 'organizationalUnitId',
    });

    for (const handler of [
      UsersController.prototype.update,
      UsersController.prototype.delete,
      UsersController.prototype.listRoles,
      UsersController.prototype.assignRole,
      UsersController.prototype.removeRole,
      UsersController.prototype.resetTemporaryPassword,
    ]) {
      expect(guardNames(handler)).toContain('OuAccessGuard');
      expect(scopeLocator(handler)).toEqual({ field: 'userId', resource: 'user' });
    }
  });

  it('gates credential actions on user.security.manage, not on user.manage', () => {
    expect(
      Reflect.getMetadata(
        AUTHORIZATION_REQUIRED_PERMISSIONS_KEY,
        UsersController.prototype.resetTemporaryPassword,
      ),
    ).toEqual([permissionKeys.userSecurityManage]);
    // Other admin routes inherit the control-plane permission from the class.
    expect(
      Reflect.getMetadata(AUTHORIZATION_REQUIRED_PERMISSIONS_KEY, UsersController.prototype.update),
    ).toBeUndefined();
  });

  it('rejects requests without an authenticated principal', async () => {
    const authorizeWithDecision = jest.fn();
    const guard = new RoleGuard(new Reflector(), {
      authorizeWithDecision,
    } as never);
    await expect(guard.canActivate(createContext({}))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(authorizeWithDecision).not.toHaveBeenCalled();
  });
});
