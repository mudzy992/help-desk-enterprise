import {
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AUTHENTICATED_PRINCIPAL_REQUEST_KEY } from '../authentication/authenticated-request';
import type { AuthorizationPrincipal } from '../authentication/authentication.types';
import { authorizationRoleKeys, permissionKeys } from '../authorization/authorization.constants';
import { AuthorizationService } from '../authorization/authorization.service';
import { createAuthorizationContext } from '../authorization/create-authorization-context';
import { createTestAuthorizationRequirements } from '../authorization/create-test-authorization-harness';
import { OuAccessGuard } from '../authorization/ou-access.guard';
import { RequireOrganizationalUnitScope } from '../authorization/require-organizational-unit-scope.decorator';
import { RequirePermissions } from '../authorization/require-permissions.decorator';
import { RequireRoles } from '../authorization/require-roles.decorator';
import { RoleGuard } from '../authorization/role.guard';
import { ShadowAuthorizationService } from '../authorization/shadow-authorization.service';
import { policyPackKeys } from './policy-pack.constants';
import {
  createPolicyPackTestWorld,
  policyPackTestIds,
} from './create-policy-pack-test-world';

jest.mock('../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

function createPrincipal(subjectId: string): AuthorizationPrincipal {
  return {
    subjectId,
    email: `${subjectId}@example.com`,
    displayName: subjectId,
    isLocalOnly: subjectId === policyPackTestIds.localUser,
  };
}

function createAuthorization(memory: ReturnType<
  typeof createPolicyPackTestWorld
>['memory']) {
  const loadBySubjectId = async (subjectId: string) => {
    const user = memory.getUser(subjectId);
    if (user === undefined) {
      return null;
    }
    return createAuthorizationContext({
      id: user.id,
      isActive: user.isActive,
      isLocalOnly: user.isLocalOnly,
      entraObjectId: user.entraObjectId,
      assignments: memory.assignmentsForUser(user.id),
    });
  };
  const authorizationService = new AuthorizationService(
    { loadBySubjectId } as never,
    memory.prisma as never,
  );
  return {
    authorizationService,
    shadowAuthorizationService: new ShadowAuthorizationService(
      { loadBySubjectId } as never,
      memory.prisma as never,
    ),
    roleGuard: new RoleGuard(new Reflector(), authorizationService),
    ouAccessGuard: new OuAccessGuard(new Reflector(), authorizationService),
  };
}

function createContext(
  request: Record<string, unknown>,
  handler: () => void,
  handlerClass: new () => unknown,
): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => handler,
    getClass: () => handlerClass,
  } as unknown as ExecutionContext;
}

class SettingsWriteHandler {
  @RequireRoles(authorizationRoleKeys.admin)
  @RequirePermissions(permissionKeys.settingsWrite)
  handle(): void {}
}

class OuSettingsWriteHandler {
  @RequirePermissions(permissionKeys.settingsWrite)
  @RequireOrganizationalUnitScope({ field: 'organizationalUnitId' })
  handle(): void {}
}

describe('policy pack authorization compatibility', () => {
  it('lets RoleGuard, OuAccessGuard, authorize, and shadow agree after IT apply', async () => {
    const { memory, service } = createPolicyPackTestWorld();
    await service.apply({
      packKey: policyPackKeys.itStandard,
      organizationalUnitId: policyPackTestIds.organizationalUnit,
      userIds: [policyPackTestIds.localUser, policyPackTestIds.entraUser],
    });
    const authz = createAuthorization(memory);
    const requirements = createTestAuthorizationRequirements({
      requiredPermissions: [permissionKeys.settingsWrite],
      requireOrganizationalUnitScope: true,
      organizationalUnitScope: { field: 'organizationalUnitId' },
    });
    const input = {
      principal: createPrincipal(policyPackTestIds.entraUser),
      requirements,
      organizationalUnitId: policyPackTestIds.organizationalUnit,
      serviceId: null,
    };
    const allowed = await authz.authorizationService.authorize(input);
    const shadow = await authz.shadowAuthorizationService.evaluate(input);
    expect(allowed).toBe(true);
    expect(shadow.decision).toBe('ALLOW');
    expect(shadow.isEnforcing).toBe(false);
    expect(
      memory
        .assignmentsForUser(policyPackTestIds.entraUser)
        .some((item) => item.roleKey === authorizationRoleKeys.superAdmin),
    ).toBe(false);

    const request = {
      [AUTHENTICATED_PRINCIPAL_REQUEST_KEY]: createPrincipal(
        policyPackTestIds.localUser,
      ),
      params: { organizationalUnitId: policyPackTestIds.organizationalUnit },
    };
    await expect(
      authz.roleGuard.canActivate(
        createContext(
          request,
          SettingsWriteHandler.prototype.handle,
          SettingsWriteHandler,
        ),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      authz.ouAccessGuard.canActivate(
        createContext(
          request,
          OuSettingsWriteHandler.prototype.handle,
          OuSettingsWriteHandler,
        ),
      ),
    ).resolves.toBe(true);
  });

  it('keeps HR service-scoped grants out of sibling OU and other services', async () => {
    const { memory, service } = createPolicyPackTestWorld();
    await service.apply({
      packKey: policyPackKeys.hrRestricted,
      organizationalUnitId: policyPackTestIds.siblingOrganizationalUnit,
      serviceId: policyPackTestIds.otherService,
      userIds: [policyPackTestIds.localUser],
    });
    const authz = createAuthorization(memory);
    const requirements = createTestAuthorizationRequirements({
      requiredPermissions: [permissionKeys.ticketAttachmentsUpload],
      requireOrganizationalUnitScope: true,
      requireServiceScope: true,
      organizationalUnitScope: { field: 'organizationalUnitId' },
      serviceScope: { field: 'serviceId' },
    });
    const allowed = await authz.authorizationService.authorize({
      principal: createPrincipal(policyPackTestIds.localUser),
      requirements,
      organizationalUnitId: policyPackTestIds.siblingOrganizationalUnit,
      serviceId: policyPackTestIds.otherService,
    });
    const deniedService = await authz.authorizationService.authorize({
      principal: createPrincipal(policyPackTestIds.localUser),
      requirements,
      organizationalUnitId: policyPackTestIds.siblingOrganizationalUnit,
      serviceId: policyPackTestIds.service,
    });
    const deniedOu = await authz.authorizationService.authorize({
      principal: createPrincipal(policyPackTestIds.localUser),
      requirements,
      organizationalUnitId: policyPackTestIds.organizationalUnit,
      serviceId: policyPackTestIds.otherService,
    });
    const settingsDenied = await authz.authorizationService.authorize({
      principal: createPrincipal(policyPackTestIds.localUser),
      requirements: createTestAuthorizationRequirements({
        requiredPermissions: [permissionKeys.settingsWrite],
        requireOrganizationalUnitScope: true,
        requireServiceScope: true,
        organizationalUnitScope: { field: 'organizationalUnitId' },
        serviceScope: { field: 'serviceId' },
      }),
      organizationalUnitId: policyPackTestIds.siblingOrganizationalUnit,
      serviceId: policyPackTestIds.otherService,
    });
    expect(allowed).toBe(true);
    expect(deniedService).toBe(false);
    expect(deniedOu).toBe(false);
    expect(settingsDenied).toBe(false);
  });

  it('grants Finance audit.export only inside the target OU and service', async () => {
    const { memory, service } = createPolicyPackTestWorld();
    await service.apply({
      packKey: policyPackKeys.financeRestricted,
      organizationalUnitId: policyPackTestIds.organizationalUnit,
      serviceId: policyPackTestIds.service,
      userIds: [policyPackTestIds.entraUser],
    });
    const authz = createAuthorization(memory);
    const input = {
      principal: createPrincipal(policyPackTestIds.entraUser),
      requirements: createTestAuthorizationRequirements({
        requiredRoles: [authorizationRoleKeys.admin],
        requiredPermissions: [permissionKeys.auditExport],
        requireOrganizationalUnitScope: true,
        requireServiceScope: true,
        organizationalUnitScope: { field: 'organizationalUnitId' },
        serviceScope: { field: 'serviceId' },
      }),
      organizationalUnitId: policyPackTestIds.organizationalUnit,
      serviceId: policyPackTestIds.service,
    };
    const allowed = await authz.authorizationService.authorize(input);
    const shadow = await authz.shadowAuthorizationService.evaluate(input);
    expect(allowed).toBe(true);
    expect(shadow.decision).toBe('ALLOW');
    expect(shadow.reason).toBe('ASSIGNMENT_ALLOWED');
  });
});
