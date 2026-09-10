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
import { OuAccessGuard } from './ou-access.guard';
import { RequireOrganizationalUnitScope } from './require-organizational-unit-scope.decorator';
import { RequirePermissions } from './require-permissions.decorator';

jest.mock('../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

const principal: AuthorizationPrincipal = {
  subjectId: 'user-1',
  email: 'admin@example.com',
  displayName: 'Admin',
  isLocalOnly: false,
};

class OuHandler {
  @RequirePermissions(permissionKeys.routingWrite)
  @RequireOrganizationalUnitScope({ field: 'organizationalUnitId' })
  handle(): void {}
}

function createContext(request: Record<string, unknown>): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => OuHandler.prototype.handle,
    getClass: () => OuHandler,
  } as unknown as ExecutionContext;
}

describe('OuAccessGuard', () => {
  const authorize = jest.fn();
  const guard = new OuAccessGuard(new Reflector(), {
    authorize,
  } as unknown as AuthorizationService);

  beforeEach(() => {
    authorize.mockReset();
    authorize.mockResolvedValue(true);
  });

  it('rejects a missing principal', async () => {
    await expect(
      guard.canActivate(
        createContext({ params: { organizationalUnitId: 'ou-zenica' } }),
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('requires OU scope even when the decorator is omitted', async () => {
    class BareHandler {
      handle(): void {}
    }
    const context = {
      switchToHttp: () => ({
        getRequest: () => ({
          [AUTHENTICATED_PRINCIPAL_REQUEST_KEY]: principal,
          params: { organizationalUnitId: 'ou-zenica' },
        }),
      }),
      getHandler: () => BareHandler.prototype.handle,
      getClass: () => BareHandler,
    } as unknown as ExecutionContext;
    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(authorize).toHaveBeenCalledWith({
      principal,
      requirements: expect.objectContaining({
        requireOrganizationalUnitScope: true,
        organizationalUnitScope: { field: 'organizationalUnitId' },
      }),
      organizationalUnitId: 'ou-zenica',
      serviceId: null,
    });
  });

  it('forwards permission and OU identity for same-assignment evaluation', async () => {
    await expect(
      guard.canActivate(
        createContext({
          [AUTHENTICATED_PRINCIPAL_REQUEST_KEY]: principal,
          params: { organizationalUnitId: 'ou-zenica' },
        }),
      ),
    ).resolves.toBe(true);
    expect(authorize).toHaveBeenCalledWith({
      principal,
      requirements: expect.objectContaining({
        requiredPermissions: [permissionKeys.routingWrite],
        requireOrganizationalUnitScope: true,
      }),
      organizationalUnitId: 'ou-zenica',
      serviceId: null,
    });
  });

  it('fails closed when OU identity is missing', async () => {
    authorize.mockResolvedValue(false);
    await expect(
      guard.canActivate(
        createContext({
          [AUTHENTICATED_PRINCIPAL_REQUEST_KEY]: principal,
          params: {},
        }),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(authorize).toHaveBeenCalledWith(
      expect.objectContaining({ organizationalUnitId: null }),
    );
  });
});
