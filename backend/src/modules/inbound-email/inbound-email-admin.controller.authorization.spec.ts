import 'reflect-metadata';
import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { AUTHENTICATED_PRINCIPAL_REQUEST_KEY } from '../authentication/authenticated-request';
import type { AuthorizationPrincipal } from '../authentication/authentication.types';
import { SessionAuthenticationGuard } from '../authentication/session-authentication.guard';
import {
  authorizationRoleKeys,
  permissionKeys,
} from '../authorization/authorization.constants';
import {
  createTestAssignment,
  createTestAuthorizationContext,
} from '../authorization/create-test-authorization-context';
import { createTestAuthorizationHarness } from '../authorization/create-test-authorization-harness';
import type { AuthorizationAssignment } from '../authorization/authorization.types';
import { RoleGuard } from '../authorization/role.guard';
import { InboundEmailAdminController } from './inbound-email-admin.controller';

jest.mock('../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

jest.mock('./inbound-email-admin.service', () => ({
  InboundEmailAdminService: class InboundEmailAdminService {},
}));

type InboundEmailAdminHandler =
  | InboundEmailAdminController['getStatus']
  | InboundEmailAdminController['testConnection'];

type ProtectedRoute = {
  readonly method: 'GET' | 'POST';
  readonly path: string;
  readonly handler: InboundEmailAdminHandler;
};

const protectedRoutes: readonly ProtectedRoute[] = [
  {
    method: 'GET',
    path: '/status',
    handler: InboundEmailAdminController.prototype.getStatus,
  },
  {
    method: 'POST',
    path: '/test-connection',
    handler: InboundEmailAdminController.prototype.testConnection,
  },
];

function createPrincipal(subjectId: string): AuthorizationPrincipal {
  return {
    subjectId,
    email: `${subjectId}@example.test`,
    displayName: subjectId,
    isLocalOnly: true,
  };
}

function createExecutionContext(input: {
  readonly subjectId: string;
  readonly method: 'GET' | 'POST';
  readonly path: string;
  readonly handler: InboundEmailAdminHandler;
}): ExecutionContext {
  const request = {
    method: input.method,
    baseUrl: '/admin/inbound-email',
    route: { path: input.path },
    headers: {},
    params: {},
    [AUTHENTICATED_PRINCIPAL_REQUEST_KEY]: createPrincipal(input.subjectId),
  };
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => input.handler,
    getClass: () => InboundEmailAdminController,
  } as unknown as ExecutionContext;
}

function createGuard(assignments: readonly AuthorizationAssignment[]) {
  const harness = createTestAuthorizationHarness();
  harness.loadBySubjectId.mockResolvedValue(
    createTestAuthorizationContext({
      subjectId: 'inbound-admin',
      isLocalOnly: true,
      assignments,
    }),
  );
  return new RoleGuard(new Reflector(), harness.authorizationService);
}

function adminAssignment(
  overrides: Partial<AuthorizationAssignment> = {},
): AuthorizationAssignment {
  return createTestAssignment({
    roleKey: authorizationRoleKeys.admin,
    permissionKeys: [permissionKeys.settingsRead],
    ...overrides,
  });
}

describe('InboundEmailAdminController authorization', () => {
  it('uses the session and canonical RoleGuard for the status and connection routes', () => {
    const guards = Reflect.getMetadata(
      GUARDS_METADATA,
      InboundEmailAdminController,
    ) as unknown[];

    expect(guards).toContain(SessionAuthenticationGuard);
    expect(guards).toContain(RoleGuard);
  });

  it('denies OU- and service-scoped ADMIN grants on both global status routes', async () => {
    const scopedAssignments = [
      adminAssignment({
        organizationalUnitId: 'ou-a',
        organizationalUnitPath: '/a',
      }),
      adminAssignment({ serviceId: 'service-a' }),
    ];

    for (const assignment of scopedAssignments) {
      const guard = createGuard([assignment]);
      for (const route of protectedRoutes) {
        await expect(
          guard.canActivate(
            createExecutionContext({
              subjectId: 'inbound-admin',
              method: route.method,
              path: route.path,
              handler: route.handler,
            }),
          ),
        ).rejects.toBeInstanceOf(ForbiddenException);
      }
    }
  });

  it('allows a global ADMIN with settings.read on both routes', async () => {
    const guard = createGuard([adminAssignment()]);

    for (const route of protectedRoutes) {
      await expect(
        guard.canActivate(
          createExecutionContext({
            subjectId: 'inbound-admin',
            method: route.method,
            path: route.path,
            handler: route.handler,
          }),
        ),
      ).resolves.toBe(true);
    }
  });

  it('denies an ADMIN without settings.read and a non-ADMIN with that permission', async () => {
    const assignments = [
      adminAssignment({ permissionKeys: [] }),
      adminAssignment({ roleKey: authorizationRoleKeys.agent }),
    ];

    for (const assignment of assignments) {
      const guard = createGuard([assignment]);
      await expect(
        guard.canActivate(
          createExecutionContext({
            subjectId: 'inbound-admin',
            method: 'GET',
            path: '/status',
            handler: InboundEmailAdminController.prototype.getStatus,
          }),
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
    }
  });
});
