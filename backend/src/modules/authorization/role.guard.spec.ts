import {
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AUTHENTICATED_PRINCIPAL_REQUEST_KEY } from '../authentication/authenticated-request';
import type { AuthorizationPrincipal } from '../authentication/authentication.types';
import { permissionKeys } from './authorization.constants';
import { AuthorizationService } from './authorization.service';
import { createTestAuthorizationEvaluation } from './create-test-authorization-evaluation';
import { RequirePermissions } from './require-permissions.decorator';
import { RequireRoles } from './require-roles.decorator';
import { RequireServiceScope } from './require-service-scope.decorator';
import { RoleGuard } from './role.guard';

jest.mock('../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

const principal: AuthorizationPrincipal = {
  subjectId: 'user-1',
  email: 'agent@example.com',
  displayName: 'Agent',
  isLocalOnly: false,
};

class PermissionHandler {
  @RequireRoles('ADMIN')
  @RequirePermissions(permissionKeys.routingWrite)
  @RequireServiceScope({ field: 'serviceId' })
  handle(): void {}
}

function createContext(
  request: Record<string, unknown>,
  handler: () => void = PermissionHandler.prototype.handle,
): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => handler,
    getClass: () => PermissionHandler,
  } as unknown as ExecutionContext;
}

describe('RoleGuard', () => {
  const authorizeWithDecision = jest.fn();
  const guard = new RoleGuard(new Reflector(), {
    authorizeWithDecision,
  } as unknown as AuthorizationService);

  beforeEach(() => {
    authorizeWithDecision.mockReset();
    authorizeWithDecision.mockResolvedValue(
      createTestAuthorizationEvaluation(true),
    );
  });

  it('rejects a missing principal', async () => {
    await expect(guard.canActivate(createContext({}))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(authorizeWithDecision).not.toHaveBeenCalled();
  });

  it('evaluates roles, permissions, and service scope together', async () => {
    const request = {
      [AUTHENTICATED_PRINCIPAL_REQUEST_KEY]: principal,
      params: { serviceId: 'service-hr' },
      body: { roles: ['SUPER_ADMIN'], oid: 'entra-oid' },
    };
    await expect(guard.canActivate(createContext(request))).resolves.toBe(true);
    expect(authorizeWithDecision).toHaveBeenCalledWith({
      principal,
      requirements: expect.objectContaining({
        requiredRoles: ['ADMIN'],
        requiredPermissions: [permissionKeys.routingWrite],
        requireServiceScope: true,
        requireOrganizationalUnitScope: false,
      }),
      organizationalUnitId: null,
      serviceId: 'service-hr',
    });
  });

  it('maps a denied decision to FORBIDDEN without echoing identity', async () => {
    authorizeWithDecision.mockResolvedValue(
      createTestAuthorizationEvaluation(false),
    );
    const request = {
      [AUTHENTICATED_PRINCIPAL_REQUEST_KEY]: principal,
      params: { serviceId: 'service-hr' },
    };
    await expect(guard.canActivate(createContext(request))).rejects.toMatchObject({
      response: { code: 'FORBIDDEN' },
    });
    await expect(guard.canActivate(createContext(request))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(JSON.stringify(authorizeWithDecision.mock.calls)).not.toContain(
      'entra-oid',
    );
  });
});
