import {
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { AUTHENTICATED_PRINCIPAL_REQUEST_KEY } from '../authentication/authenticated-request';
import {
  AUTHORIZATION_REQUIRED_ROLES_KEY,
  authorizationRoleKeys,
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

describe('UsersController guards', () => {
  it('requires session authentication and admin or super-admin role metadata', () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, UsersController) as unknown[];
    expect(
      (guards as Array<{ name: string }>).map((guard) => guard.name),
    ).toEqual(
      expect.arrayContaining(['SessionAuthenticationGuard', 'RoleGuard']),
    );
    const roles = Reflect.getMetadata(
      AUTHORIZATION_REQUIRED_ROLES_KEY,
      UsersController,
    ) as readonly string[];
    expect(roles).toEqual([
      authorizationRoleKeys.admin,
      authorizationRoleKeys.superAdmin,
    ]);
  });

  it('rejects requests without an authenticated principal', async () => {
    const authorize = jest.fn();
    const guard = new RoleGuard(new Reflector(), {
      authorize,
    } as never);
    await expect(guard.canActivate(createContext({}))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(authorize).not.toHaveBeenCalled();
  });
});
