import {
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { AUTHENTICATED_PRINCIPAL_REQUEST_KEY } from '../authentication/authenticated-request';
import type { AuthorizationPrincipal } from '../authentication/authentication.types';
import {
  AUTHORIZATION_REQUIRED_ROLES_KEY,
  authorizationRoleKeys,
} from '../authorization/authorization.constants';
import { createAuthorizationContext } from '../authorization/create-authorization-context';
import { createTestAssignment } from '../authorization/create-test-authorization-context';
import { createTestAuthorizationHarness } from '../authorization/create-test-authorization-harness';
import { RoleGuard } from '../authorization/role.guard';
import { organizationalUnitTreeReadRoles } from './organizational-unit-tree-read-roles';
import { OrganizationalUnitsController } from './organizational-units.controller';

jest.mock('../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

type ControllerHandler = (...args: never[]) => unknown;

function createContext(
  request: Record<string, unknown>,
  handler: ControllerHandler = OrganizationalUnitsController.prototype.getTree,
): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => handler,
    getClass: () => OrganizationalUnitsController,
  } as unknown as ExecutionContext;
}

function createPrincipal(subjectId: string): AuthorizationPrincipal {
  return {
    subjectId,
    email: `${subjectId}@example.com`,
    displayName: subjectId,
    isLocalOnly: false,
  };
}

function readMethodRoles(
  handler: ControllerHandler,
): readonly string[] | undefined {
  return Reflect.getMetadata(AUTHORIZATION_REQUIRED_ROLES_KEY, handler) as
    | readonly string[]
    | undefined;
}

const adminOnlyHandlers: readonly ControllerHandler[] = [
  OrganizationalUnitsController.prototype.create,
  OrganizationalUnitsController.prototype.update,
  OrganizationalUnitsController.prototype.delete,
  OrganizationalUnitsController.prototype.assignUser,
  OrganizationalUnitsController.prototype.listUsers,
  OrganizationalUnitsController.prototype.getById,
];

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

  it('overrides only GET /tree for ticket-create read roles', () => {
    expect(readMethodRoles(OrganizationalUnitsController.prototype.getTree)).toEqual(
      [...organizationalUnitTreeReadRoles],
    );
    for (const handler of adminOnlyHandlers) {
      expect(readMethodRoles(handler)).toBeUndefined();
    }
  });

  it('rejects requests without an authenticated principal', async () => {
    const authorize = jest.fn();
    const guard = new RoleGuard(new Reflector(), { authorize } as never);
    await expect(guard.canActivate(createContext({}))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(authorize).not.toHaveBeenCalled();
  });

  it('evaluates authorization when a principal is present', async () => {
    const authorize = jest.fn().mockResolvedValue(false);
    const guard = new RoleGuard(new Reflector(), { authorize } as never);
    const request = {
      [AUTHENTICATED_PRINCIPAL_REQUEST_KEY]: {
        subjectId: 'admin-1',
        email: 'admin@example.com',
        displayName: 'Admin',
        isLocalOnly: true,
      },
    };
    await expect(guard.canActivate(createContext(request))).rejects.toMatchObject({
      response: { code: 'FORBIDDEN' },
    });
    expect(authorize).toHaveBeenCalled();
  });

  describe('USER and AGENT access', () => {
    const createGuard = () => {
      const harness = createTestAuthorizationHarness();
      return {
        harness,
        guard: new RoleGuard(new Reflector(), harness.authorizationService),
      };
    };

    const stubRole = (
      harness: ReturnType<typeof createTestAuthorizationHarness>,
      roleKey: string,
    ): Record<string, unknown> => {
      const subjectId = `subject-${roleKey}`;
      harness.loadBySubjectId.mockResolvedValue(
        createAuthorizationContext({
          id: subjectId,
          isActive: true,
          isLocalOnly: false,
          entraObjectId: 'entra-oid',
          assignments: [
            createTestAssignment({ roleKey, permissionKeys: [] }),
          ],
        }),
      );
      return {
        [AUTHENTICATED_PRINCIPAL_REQUEST_KEY]: createPrincipal(subjectId),
      };
    };

    it.each([authorizationRoleKeys.user, authorizationRoleKeys.agent])(
      'allows %s to GET /organizational-units/tree',
      async (roleKey) => {
        const { harness, guard } = createGuard();
        await expect(
          guard.canActivate(
            createContext(
              stubRole(harness, roleKey),
              OrganizationalUnitsController.prototype.getTree,
            ),
          ),
        ).resolves.toBe(true);
      },
    );

    it.each([authorizationRoleKeys.user, authorizationRoleKeys.agent])(
      'denies %s on OU write, GET by id, and user-list routes',
      async (roleKey) => {
        const { harness, guard } = createGuard();
        const request = stubRole(harness, roleKey);
        for (const handler of adminOnlyHandlers) {
          await expect(
            guard.canActivate(createContext(request, handler)),
          ).rejects.toBeInstanceOf(ForbiddenException);
        }
      },
    );
  });
});
