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
  AUTHORIZATION_ORGANIZATIONAL_UNIT_SCOPE_KEY,
  AUTHORIZATION_REQUIRED_PERMISSIONS_KEY,
  AUTHORIZATION_REQUIRED_ROLES_KEY,
  authorizationRoleKeys,
  permissionKeys,
} from '../authorization/authorization.constants';
import { createAuthorizationContext } from '../authorization/create-authorization-context';
import { createTestAssignment } from '../authorization/create-test-authorization-context';
import { createTestAuthorizationHarness } from '../authorization/create-test-authorization-harness';
import {
  createTestAuthorizationEvaluation,
} from '../authorization/create-test-authorization-evaluation';
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

  it('scopes every control-plane route to the actor OU and the manage permission', () => {
    for (const handler of adminOnlyHandlers) {
      const guards = (Reflect.getMetadata(GUARDS_METADATA, handler) ?? []) as Array<{
        name: string;
      }>;
      expect(guards.map((guard) => guard.name)).toContain('OuAccessGuard');
      expect(
        Reflect.getMetadata(AUTHORIZATION_REQUIRED_PERMISSIONS_KEY, handler),
      ).toEqual(expect.arrayContaining([permissionKeys.organizationalUnitManage]));
      expect(
        Reflect.getMetadata(AUTHORIZATION_ORGANIZATIONAL_UNIT_SCOPE_KEY, handler),
      ).toBeDefined();
    }
  });

  it('names the scope field the guard must resolve on each route', () => {
    type ScopeLocator = { field: string; resource?: string };
    const locatorOf = (handler: ControllerHandler): ScopeLocator | undefined =>
      Reflect.getMetadata(
        AUTHORIZATION_ORGANIZATIONAL_UNIT_SCOPE_KEY,
        handler,
      ) as ScopeLocator | undefined | undefined;

    expect(locatorOf(OrganizationalUnitsController.prototype.create)?.field).toBe('parentId');
    expect(locatorOf(OrganizationalUnitsController.prototype.assignUser)?.field).toBe(
      'organizationalUnitId',
    );
    for (const handler of [
      OrganizationalUnitsController.prototype.getById,
      OrganizationalUnitsController.prototype.update,
      OrganizationalUnitsController.prototype.delete,
      OrganizationalUnitsController.prototype.listUsers,
    ]) {
      expect(locatorOf(handler)?.field).toBe('organizationalUnitId');
    }
    // The tree stays open to every role; the service narrows it by scope instead.
    expect(locatorOf(OrganizationalUnitsController.prototype.getTree)).toBeUndefined();
    expect(
      Reflect.getMetadata(
        AUTHORIZATION_REQUIRED_PERMISSIONS_KEY,
        OrganizationalUnitsController.prototype.getTree,
      ),
    ).toBeUndefined();
  });

  it('rejects requests without an authenticated principal', async () => {
    const authorizeWithDecision = jest.fn();
    const guard = new RoleGuard(new Reflector(), { authorizeWithDecision } as never);
    await expect(guard.canActivate(createContext({}))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(authorizeWithDecision).not.toHaveBeenCalled();
  });

  it('evaluates authorization when a principal is present', async () => {
    const authorizeWithDecision = jest
      .fn()
      .mockResolvedValue(createTestAuthorizationEvaluation(false));
    const guard = new RoleGuard(new Reflector(), { authorizeWithDecision } as never);
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
    expect(authorizeWithDecision).toHaveBeenCalled();
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
