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
import { ServiceFormsController } from './service-forms.controller';

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
    getClass: () => ServiceFormsController,
  } as unknown as ExecutionContext;
}

describe('service forms authorization compatibility', () => {
  const createGuard = () => {
    const harness = createTestAuthorizationHarness();
    harness.findService.mockResolvedValue({ id: 'service-hr' });
    return {
      harness,
      guard: new RoleGuard(new Reflector(), harness.authorizationService),
    };
  };

  it('uses RoleGuard + service.forms.write without a second evaluator', async () => {
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
            permissionKeys: [permissionKeys.serviceFormsWrite],
          }),
        ],
      }),
    );
    const request = {
      [AUTHENTICATED_PRINCIPAL_REQUEST_KEY]: createPrincipal('local-admin'),
      params: { serviceId: 'service-hr' },
    };
    await expect(
      guard.canActivate(
        createContext(request, ServiceFormsController.prototype.createForm),
      ),
    ).resolves.toBe(true);
  });

  it('scopes form writes to the requested service id', async () => {
    const { harness, guard } = createGuard();
    harness.findService.mockImplementation(({ where }: { where: { id: string } }) =>
      Promise.resolve({ id: where.id }),
    );
    harness.loadBySubjectId.mockResolvedValue(
      createAuthorizationContext({
        id: 'entra-admin',
        isActive: true,
        isLocalOnly: false,
        entraObjectId: 'entra-oid',
        assignments: [
          createTestAssignment({
            roleKey: authorizationRoleKeys.admin,
            permissionKeys: [permissionKeys.serviceFormsWrite],
            serviceId: 'service-hr',
          }),
        ],
      }),
    );
    const allowed = {
      [AUTHENTICATED_PRINCIPAL_REQUEST_KEY]: createPrincipal('entra-admin'),
      params: { serviceId: 'service-hr' },
    };
    const denied = {
      ...allowed,
      params: { serviceId: 'service-it' },
    };
    await expect(
      guard.canActivate(
        createContext(allowed, ServiceFormsController.prototype.createFormVersion),
      ),
    ).resolves.toBe(true);
    await expect(
      guard.canActivate(
        createContext(denied, ServiceFormsController.prototype.activateFormVersion),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('does not treat catalog write as forms write', async () => {
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
      params: { serviceId: 'service-hr' },
    };
    await expect(
      guard.canActivate(
        createContext(request, ServiceFormsController.prototype.createForm),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
