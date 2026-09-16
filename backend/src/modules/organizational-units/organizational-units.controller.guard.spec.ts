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
import { OrganizationalUnitsController } from './organizational-units.controller';

jest.mock('../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

function createContext(request: Record<string, unknown>): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => OrganizationalUnitsController.prototype.getTree,
    getClass: () => OrganizationalUnitsController,
  } as unknown as ExecutionContext;
}

describe('OrganizationalUnitsController guards', () => {
  it('requires session authentication and admin role metadata', () => {
    const guards = Reflect.getMetadata(
      GUARDS_METADATA,
      OrganizationalUnitsController,
    ) as unknown[];
    expect(
      (guards as Array<{ name: string }>).map((guard) => guard.name),
    ).toEqual(
      expect.arrayContaining(['SessionAuthenticationGuard', 'RoleGuard']),
    );
    const roles = Reflect.getMetadata(
      AUTHORIZATION_REQUIRED_ROLES_KEY,
      OrganizationalUnitsController,
    ) as readonly string[];
    expect(roles).toEqual([authorizationRoleKeys.admin]);
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

  it('evaluates authorization when a principal is present', async () => {
    const authorize = jest.fn().mockResolvedValue(false);
    const guard = new RoleGuard(new Reflector(), {
      authorize,
    } as never);
    const request = {
      [AUTHENTICATED_PRINCIPAL_REQUEST_KEY]: {
        subjectId: 'admin-1',
        email: 'admin@example.com',
        displayName: 'Admin',
        isLocalOnly: true,
      },
    };
    await expect(
      guard.canActivate(createContext(request)),
    ).rejects.toMatchObject({ response: { code: 'FORBIDDEN' } });
    expect(authorize).toHaveBeenCalled();
  });
});
