import {
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AUTHENTICATED_PRINCIPAL_REQUEST_KEY } from '../authentication/authenticated-request';
import type { AuthorizationPrincipal } from '../authentication/authentication.types';
import { authorizationRoleKeys } from '../authorization/authorization.constants';
import { createAuthorizationContext } from '../authorization/create-authorization-context';
import { createTestAssignment } from '../authorization/create-test-authorization-context';
import { createTestAuthorizationHarness } from '../authorization/create-test-authorization-harness';
import { RoleGuard } from '../authorization/role.guard';
import { TicketsController } from './tickets.controller';

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
    getClass: () => TicketsController,
  } as unknown as ExecutionContext;
}

describe('tickets authorization compatibility', () => {
  const createGuard = () => {
    const harness = createTestAuthorizationHarness();
    return {
      harness,
      guard: new RoleGuard(new Reflector(), harness.authorizationService),
    };
  };

  it('rejects missing principals', async () => {
    const { guard } = createGuard();
    await expect(
      guard.canActivate(
        createContext({}, TicketsController.prototype.create),
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('allows USER, AGENT, and ADMIN ticket create without extra permissions', async () => {
    const { harness, guard } = createGuard();
    harness.loadBySubjectId.mockResolvedValue(
      createAuthorizationContext({
        id: 'user-1',
        isActive: true,
        isLocalOnly: false,
        entraObjectId: 'entra-oid',
        assignments: [
          createTestAssignment({
            roleKey: authorizationRoleKeys.user,
            permissionKeys: [],
          }),
        ],
      }),
    );
    const request = {
      [AUTHENTICATED_PRINCIPAL_REQUEST_KEY]: createPrincipal('user-1'),
      body: { serviceId: 'service-vpn', originUnitId: 'ou-it' },
    };
    await expect(
      guard.canActivate(
        createContext(request, TicketsController.prototype.create),
      ),
    ).resolves.toBe(true);
  });

  it('does not invent a ticket-specific permission key', async () => {
    const { harness, guard } = createGuard();
    harness.loadBySubjectId.mockResolvedValue(
      createAuthorizationContext({
        id: 'user-1',
        isActive: true,
        isLocalOnly: false,
        entraObjectId: 'entra-oid',
        assignments: [],
      }),
    );
    const request = {
      [AUTHENTICATED_PRINCIPAL_REQUEST_KEY]: createPrincipal('user-1'),
    };
    await expect(
      guard.canActivate(
        createContext(request, TicketsController.prototype.list),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
