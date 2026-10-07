import {
  ForbiddenException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AUTHENTICATED_PRINCIPAL_REQUEST_KEY } from '../authentication/authenticated-request';
import { authorizationDecisionReasons } from './authorization-decision-reason';
import { authorizeHttpExecution } from './authorize-http-execution';
import { permissionKeys, authorizationRoleKeys } from './authorization.constants';
import { RequireAllPermissions } from './require-all-permissions.decorator';
import { RequireOrganizationalUnitScope } from './require-organizational-unit-scope.decorator';
import { RequirePermissions } from './require-permissions.decorator';
import { readAuthorizationRequirements } from './read-authorization-requirements';
import { RequireRoles } from './require-roles.decorator';
import { RoleGuard } from './role.guard';
import { OuAccessGuard } from './ou-access.guard';

jest.mock('../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

@RequireRoles(authorizationRoleKeys.admin)
class GroupAuthorizationController {
  @RequirePermissions(permissionKeys.groupManage)
  @RequireOrganizationalUnitScope({ field: 'groupId', resource: 'group' })
  getGroup(): void {}

  @RequireAllPermissions(permissionKeys.reportsExport, permissionKeys.auditExport)
  exportCombinedReports(): void {}
}

function requestForGroup() {
  return Object.assign(
    {
      headers: { 'x-request-id': 'req-superadmin-1' },
      params: { groupId: 'group-23' },
      method: 'GET',
      baseUrl: '/groups',
      route: { path: '/:groupId' },
    },
    {
      [AUTHENTICATED_PRINCIPAL_REQUEST_KEY]: {
        subjectId: 'super-admin-1',
        isLocalOnly: true,
      },
    },
  );
}

function executionContext(
  request: object,
  handler: () => void = GroupAuthorizationController.prototype.getGroup,
) {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => handler,
    getClass: () => GroupAuthorizationController,
  } as never;
}

function createAuthorizationService(
  reason: string = authorizationDecisionReasons.superAdminAllowed,
) {
  return {
    resolveGroupOrganizationalUnitId: jest.fn().mockResolvedValue('ou-target'),
    authorizeWithDecision: jest.fn().mockResolvedValue({
      allowed: true,
      reason,
      decisionInput: {} as never,
    }),
    recordSuperAdminBypass: jest.fn().mockResolvedValue(undefined),
  };
}

describe('authorizeHttpExecution SuperAdmin bypass audit (5.2.1 M4 B5)', () => {
  it('keeps the legacy permission decorator in any mode and selects all mode explicitly', () => {
    const reflector = new Reflector();
    const request = requestForGroup();
    const legacy = readAuthorizationRequirements(
      reflector,
      executionContext(request),
      { requireOrganizationalUnitScope: false },
    );
    const all = readAuthorizationRequirements(
      reflector,
      executionContext(request, GroupAuthorizationController.prototype.exportCombinedReports),
      { requireOrganizationalUnitScope: false },
    );

    expect(legacy.permissionMatchMode).toBe('any');
    expect(all.requiredPermissions).toEqual([
      permissionKeys.reportsExport,
      permissionKeys.auditExport,
    ]);
    expect(all.permissionMatchMode).toBe('all');
  });

  it('writes one linked audit event across multiple guards and records the resolved target OU/resource', async () => {
    const request = requestForGroup();
    const context = executionContext(request);
    const authorizationService = createAuthorizationService();
    const reflector = new Reflector();
    const roleGuard = new RoleGuard(reflector, authorizationService as never);
    const ouAccessGuard = new OuAccessGuard(reflector, authorizationService as never);

    await expect(roleGuard.canActivate(context)).resolves.toBe(true);
    await expect(ouAccessGuard.canActivate(context)).resolves.toBe(true);

    expect(authorizationService.resolveGroupOrganizationalUnitId).toHaveBeenCalledWith('group-23');
    expect(authorizationService.recordSuperAdminBypass).toHaveBeenCalledTimes(1);
    expect(authorizationService.recordSuperAdminBypass).toHaveBeenCalledWith({
      actorUserId: 'super-admin-1',
      requestId: 'req-superadmin-1',
      route: '/groups/:groupId',
      method: 'GET',
      requiredRoles: [authorizationRoleKeys.admin],
      requiredPermissions: [permissionKeys.groupManage],
      permissionMatchMode: 'any',
      organizationalUnitId: 'ou-target',
      serviceId: null,
      resourceType: 'groupId',
      resourceId: 'group-23',
    });
  });

  it('does not log an ordinary allowed assignment or a denied decision', async () => {
    const ordinary = createAuthorizationService(authorizationDecisionReasons.assignmentAllowed);
    await expect(
      authorizeHttpExecution({
        context: executionContext(requestForGroup()),
        reflector: new Reflector(),
        authorizationService: ordinary as never,
        requireOrganizationalUnitScope: false,
      }),
    ).resolves.toBe(true);
    expect(ordinary.recordSuperAdminBypass).not.toHaveBeenCalled();

    const denied = createAuthorizationService(authorizationDecisionReasons.noMatchingAssignment);
    denied.authorizeWithDecision.mockResolvedValue({
      allowed: false,
      reason: authorizationDecisionReasons.noMatchingAssignment,
      decisionInput: {} as never,
    });
    await expect(
      authorizeHttpExecution({
        context: executionContext(requestForGroup()),
        reflector: new Reflector(),
        authorizationService: denied as never,
        requireOrganizationalUnitScope: false,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(denied.recordSuperAdminBypass).not.toHaveBeenCalled();
  });

  it('fails closed when the audit sink is unavailable', async () => {
    const authorizationService = createAuthorizationService();
    authorizationService.recordSuperAdminBypass.mockRejectedValueOnce(new Error('audit database unavailable'));

    await expect(
      authorizeHttpExecution({
        context: executionContext(requestForGroup()),
        reflector: new Reflector(),
        authorizationService: authorizationService as never,
        requireOrganizationalUnitScope: false,
      }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(authorizationService.recordSuperAdminBypass).toHaveBeenCalledTimes(1);
  });
});
