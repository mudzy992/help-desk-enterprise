import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { of } from 'rxjs';
import { AUTHENTICATED_PRINCIPAL_REQUEST_KEY } from '../authentication/authenticated-request';
import { AdminReadOnlyInterceptor } from './admin-read-only.interceptor';
import { authorizationRoleKeys, permissionKeys } from './authorization.constants';
import { AuthorizationContextLoader } from './authorization-context.loader';
import { AuthorizationService } from './authorization.service';
import { createTestAuthorizationContext } from './create-test-authorization-context';
import { parseReadOnlyModeConfiguration } from './parse-read-only-mode-configuration';
import {
  adminReadOnlyModuleKeys,
  defaultAdminReadOnlyLockableModulesCsv,
  readOnlyModeErrorCodes,
} from './read-only-mode.constants';
import { ReadOnlyModeConfigurationLoader } from './read-only-mode.configuration-loader';
import { RequirePermissions } from './require-permissions.decorator';
import { RequireRoles } from './require-roles.decorator';
import { RoleGuard } from './role.guard';

jest.mock('../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

class ApplyPolicyHandler {
  @RequireRoles(authorizationRoleKeys.admin)
  @RequirePermissions(permissionKeys.settingsWrite)
  apply(): void {}
}

function createContext(
  request: Record<string, unknown>,
  handler: () => void = ApplyPolicyHandler.prototype.apply,
): ExecutionContext {
  return {
    getType: () => 'http',
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => handler,
    getClass: () => ApplyPolicyHandler,
  } as unknown as ExecutionContext;
}

describe('AdminReadOnlyInterceptor', () => {
  const load = jest.fn();
  const loadBySubjectId = jest.fn();
  const authorize = jest.fn();
  const interceptor = new AdminReadOnlyInterceptor(
    new Reflector(),
    { load } as unknown as ReadOnlyModeConfigurationLoader,
    { loadBySubjectId } as unknown as AuthorizationContextLoader,
  );
  const roleGuard = new RoleGuard(new Reflector(), {
    authorize,
  } as unknown as AuthorizationService);
  const next = { handle: () => of('ok') };

  beforeEach(() => {
    load.mockReset();
    loadBySubjectId.mockReset();
    authorize.mockReset();
    load.mockResolvedValue(
      parseReadOnlyModeConfiguration({
        enabled: true,
        modulesCsv: defaultAdminReadOnlyLockableModulesCsv,
        activeModulesCsv: adminReadOnlyModuleKeys.admin,
        bypassRolesCsv: authorizationRoleKeys.superAdmin,
      }),
    );
    loadBySubjectId.mockResolvedValue(createTestAuthorizationContext());
    authorize.mockResolvedValue(true);
  });

  it('allows reads and still uses RoleGuard for authorization', async () => {
    const request = {
      method: 'GET',
      path: '/policy-packs',
      [AUTHENTICATED_PRINCIPAL_REQUEST_KEY]: {
        subjectId: 'user-1',
        email: 'admin@example.com',
        displayName: 'Admin',
        isLocalOnly: false,
      },
    };
    await expect(
      interceptor.intercept(createContext(request), next),
    ).resolves.toBeDefined();
    await expect(roleGuard.canActivate(createContext(request))).resolves.toBe(
      true,
    );
    expect(authorize).toHaveBeenCalled();
    expect(load).not.toHaveBeenCalled();
  });

  it('blocks apply after RoleGuard allows the same request', async () => {
    const request = {
      method: 'POST',
      path: '/policy-packs/apply',
      [AUTHENTICATED_PRINCIPAL_REQUEST_KEY]: {
        subjectId: 'user-1',
        email: 'admin@example.com',
        displayName: 'Admin',
        isLocalOnly: false,
      },
    };
    await expect(roleGuard.canActivate(createContext(request))).resolves.toBe(
      true,
    );
    await expect(
      interceptor.intercept(createContext(request), next),
    ).rejects.toMatchObject({
      response: { code: readOnlyModeErrorCodes.forbidden },
    });
    await expect(
      interceptor.intercept(createContext(request), next),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
