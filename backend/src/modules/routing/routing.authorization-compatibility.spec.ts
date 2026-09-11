import {
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AUTHENTICATED_PRINCIPAL_REQUEST_KEY } from '../authentication/authenticated-request';
import type { AuthorizationPrincipal } from '../authentication/authentication.types';
import {
  authorizationRoleKeys,
  permissionKeys,
} from '../authorization/authorization.constants';
import { createAuthorizationContext } from '../authorization/create-authorization-context';
import { createTestAssignment } from '../authorization/create-test-authorization-context';
import { createTestAuthorizationHarness } from '../authorization/create-test-authorization-harness';
import { RoleGuard } from '../authorization/role.guard';
import { RoutingController } from './routing.controller';

jest.mock('../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

function createPrincipal(subjectId: string): AuthorizationPrincipal {
  return {
    subjectId,
    email: `${subjectId}@example.com`,
    displayName: subjectId,
    isLocalOnly: subjectId === 'local-admin',
  };
}

function createContext(
  request: Record<string, unknown>,
  handler: (...args: never[]) => unknown,
): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => handler,
    getClass: () => RoutingController,
  } as unknown as ExecutionContext;
}

describe('routing authorization compatibility', () => {
  const createGuard = () => {
    const harness = createTestAuthorizationHarness();
    harness.findOrganizationalUnit.mockImplementation(
      ({ where }: { where: { id: string } }) =>
        Promise.resolve(
          where.id === 'ou-it'
            ? { ouPath: '/Korisnici/IT' }
            : { ouPath: '/Korisnici/HR' },
        ),
    );
    harness.findService.mockImplementation(({ where }: { where: { id: string } }) =>
      Promise.resolve({ id: where.id }),
    );
    return {
      harness,
      guard: new RoleGuard(new Reflector(), harness.authorizationService),
    };
  };

  it('requires routing.write to create a rule', async () => {
    const { harness, guard } = createGuard();
    harness.loadBySubjectId.mockResolvedValue(
      createAuthorizationContext({
        id: 'local-admin',
        isActive: true,
        isLocalOnly: true,
        entraObjectId: null,
        assignments: [
          createTestAssignment({
            roleKey: authorizationRoleKeys.admin,
            permissionKeys: [permissionKeys.serviceCatalogWrite],
          }),
        ],
      }),
    );
    const request = {
      [AUTHENTICATED_PRINCIPAL_REQUEST_KEY]: createPrincipal('local-admin'),
      body: {
        originUnitId: 'ou-it',
        serviceId: 'service-vpn',
        groupId: 'group-it',
      },
    };
    await expect(
      guard.canActivate(
        createContext(request, RoutingController.prototype.createRule),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('enforces OU and service scopes on routing mutations', async () => {
    const { harness, guard } = createGuard();
    harness.loadBySubjectId.mockResolvedValue(
      createAuthorizationContext({
        id: 'entra-admin',
        isActive: true,
        isLocalOnly: false,
        entraObjectId: 'entra-oid',
        assignments: [
          createTestAssignment({
            roleKey: authorizationRoleKeys.admin,
            permissionKeys: [permissionKeys.routingWrite],
            organizationalUnitId: 'ou-it',
            organizationalUnitPath: '/Korisnici/IT',
            serviceId: 'service-vpn',
          }),
        ],
      }),
    );
    const allowed = {
      [AUTHENTICATED_PRINCIPAL_REQUEST_KEY]: createPrincipal('entra-admin'),
      body: {
        originUnitId: 'ou-it',
        serviceId: 'service-vpn',
        groupId: 'group-it',
      },
    };
    await expect(
      guard.canActivate(
        createContext(allowed, RoutingController.prototype.createRule),
      ),
    ).resolves.toBe(true);
    await expect(
      guard.canActivate(
        createContext(
          {
            ...allowed,
            body: { ...allowed.body, originUnitId: 'ou-hr' },
          },
          RoutingController.prototype.createRule,
        ),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      guard.canActivate(
        createContext(
          {
            ...allowed,
            body: { ...allowed.body, serviceId: 'service-hr' },
          },
          RoutingController.prototype.createRule,
        ),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('lets an admin read coverage without routing.write', async () => {
    const { harness, guard } = createGuard();
    harness.loadBySubjectId.mockResolvedValue(
      createAuthorizationContext({
        id: 'local-admin',
        isActive: true,
        isLocalOnly: true,
        entraObjectId: null,
        assignments: [
          createTestAssignment({
            roleKey: authorizationRoleKeys.admin,
            permissionKeys: [permissionKeys.serviceCatalogWrite],
          }),
        ],
      }),
    );
    const request = {
      [AUTHENTICATED_PRINCIPAL_REQUEST_KEY]: createPrincipal('local-admin'),
    };
    await expect(
      guard.canActivate(
        createContext(request, RoutingController.prototype.coverage),
      ),
    ).resolves.toBe(true);
  });
});
