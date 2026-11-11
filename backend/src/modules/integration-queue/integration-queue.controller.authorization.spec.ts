import 'reflect-metadata';
import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { AUTHENTICATED_PRINCIPAL_REQUEST_KEY } from '../authentication/authenticated-request';
import type { AuthorizationPrincipal } from '../authentication/authentication.types';
import {
  authorizationRoleKeys,
  permissionKeys,
} from '../authorization/authorization.constants';
import type {
  AuthorizationContext,
  AuthorizationDecisionInput,
} from '../authorization/authorization.types';
import { decideAuthorizationAccess } from '../authorization/evaluate-authorization-access';
import { RoleGuard } from '../authorization/role.guard';
import type { AuthorizationService } from '../authorization/authorization.service';
import { IntegrationQueueController } from './integration-queue.controller';

jest.mock('../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

function createExecutionContext(
  principal: AuthorizationPrincipal,
): ExecutionContext {
  const request = {
    method: 'GET',
    baseUrl: '/integration-jobs',
    route: { path: '/' },
    headers: {},
    params: {},
    [AUTHENTICATED_PRINCIPAL_REQUEST_KEY]: principal,
  };
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => IntegrationQueueController.prototype.list,
    getClass: () => IntegrationQueueController,
  } as unknown as ExecutionContext;
}

function createGuard(authorizationContext: AuthorizationContext) {
  const authorizeWithDecision = jest.fn(
    async (input: {
      readonly principal: AuthorizationPrincipal | null;
      readonly requirements: {
        readonly requiredRoles: readonly string[];
        readonly requiredPermissions: readonly string[];
        readonly permissionMatchMode?: 'any' | 'all';
        readonly requireOrganizationalUnitScope: boolean;
        readonly requireServiceScope: boolean;
      };
      readonly organizationalUnitId: string | null;
      readonly serviceId: string | null;
    }) => {
      const decisionInput: AuthorizationDecisionInput = {
        context: authorizationContext,
        requiredRoles: input.requirements.requiredRoles,
        requiredPermissions: input.requirements.requiredPermissions,
        permissionMatchMode: input.requirements.permissionMatchMode ?? 'any',
        organizationalUnitId: input.organizationalUnitId,
        organizationalUnitPath: null,
        serviceId: input.serviceId,
        requireOrganizationalUnitScope:
          input.requirements.requireOrganizationalUnitScope,
        requireServiceScope: input.requirements.requireServiceScope,
      };
      return { ...decideAuthorizationAccess(decisionInput), decisionInput };
    },
  );
  const recordSuperAdminBypass = jest.fn().mockResolvedValue(undefined);
  const authorizationService = {
    authorizeWithDecision,
    recordSuperAdminBypass,
  } as unknown as AuthorizationService;
  return {
    guard: new RoleGuard(new Reflector(), authorizationService),
    authorizeWithDecision,
    recordSuperAdminBypass,
  };
}

function principal(
  subjectId: string,
  isLocalOnly = false,
): AuthorizationPrincipal {
  return {
    subjectId,
    email: `${subjectId}@example.test`,
    displayName: subjectId,
    isLocalOnly,
  };
}

function assignment(input: {
  readonly roleKey?: string;
  readonly organizationalUnitId?: string | null;
  readonly organizationalUnitPath?: string | null;
  readonly serviceId?: string | null;
  readonly permissionKeys?: readonly string[];
}) {
  return {
    roleKey: input.roleKey ?? authorizationRoleKeys.admin,
    permissionKeys: input.permissionKeys ?? [
      permissionKeys.integrationsQueueManage,
    ],
    organizationalUnitId: input.organizationalUnitId ?? null,
    organizationalUnitPath: input.organizationalUnitPath ?? null,
    serviceId: input.serviceId ?? null,
  };
}

async function assertScopedQueueAssignmentDenied(
  queueAssignment: ReturnType<typeof assignment>,
): Promise<void> {
  const { guard, authorizeWithDecision } = createGuard({
    subjectId: 'scoped-admin',
    isLocalOnly: true,
    isSuperAdmin: false,
    assignments: [queueAssignment],
  });

  await expect(
    guard.canActivate(createExecutionContext(principal('scoped-admin', true))),
  ).rejects.toBeInstanceOf(ForbiddenException);
  expect(authorizeWithDecision).toHaveBeenCalledWith(
    expect.objectContaining({
      requirements: expect.objectContaining({
        requiredRoles: [authorizationRoleKeys.admin],
        requiredPermissions: [permissionKeys.integrationsQueueManage],
        requireOrganizationalUnitScope: false,
        requireServiceScope: false,
      }),
      organizationalUnitId: null,
      serviceId: null,
    }),
  );
}

describe('IntegrationQueueController authorization', () => {
  it('wires the canonical RoleGuard at controller scope for every queue route', () => {
    const guards = Reflect.getMetadata(
      GUARDS_METADATA,
      IntegrationQueueController,
    ) as unknown[];
    expect(guards).toContain(RoleGuard);
  });

  it('denies an OU-scoped queue permission before the list handler runs', async () => {
    await assertScopedQueueAssignmentDenied(
      assignment({
        organizationalUnitId: 'ou-a',
        organizationalUnitPath: '/a',
      }),
    );
  });

  it('denies a service-scoped queue permission before the list handler runs', async () => {
    await assertScopedQueueAssignmentDenied(
      assignment({ serviceId: 'service-a' }),
    );
  });

  it('allows a global ADMIN assignment with integrations.queue.manage', async () => {
    const { guard, authorizeWithDecision } = createGuard({
      subjectId: 'global-admin',
      isLocalOnly: true,
      isSuperAdmin: false,
      assignments: [assignment({})],
    });

    await expect(
      guard.canActivate(
        createExecutionContext(principal('global-admin', true)),
      ),
    ).resolves.toBe(true);
    expect(authorizeWithDecision.mock.calls[0]?.[0].requirements).toMatchObject(
      {
        requiredRoles: [authorizationRoleKeys.admin],
        requiredPermissions: [permissionKeys.integrationsQueueManage],
        requireOrganizationalUnitScope: false,
        requireServiceScope: false,
      },
    );
  });

  it('does not allow the queue permission without the required ADMIN role', async () => {
    const { guard } = createGuard({
      subjectId: 'non-admin',
      isLocalOnly: true,
      isSuperAdmin: false,
      assignments: [assignment({ roleKey: authorizationRoleKeys.agent })],
    });

    await expect(
      guard.canActivate(createExecutionContext(principal('non-admin', true))),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('keeps the local-only SUPER_ADMIN bypass and records its audit before access', async () => {
    const { guard, recordSuperAdminBypass } = createGuard({
      subjectId: 'super-admin',
      isLocalOnly: true,
      isSuperAdmin: true,
      assignments: [
        assignment({
          roleKey: authorizationRoleKeys.superAdmin,
          permissionKeys: [],
        }),
      ],
    });

    await expect(
      guard.canActivate(createExecutionContext(principal('super-admin', true))),
    ).resolves.toBe(true);
    expect(recordSuperAdminBypass).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: 'super-admin',
        method: 'GET',
        requiredRoles: [authorizationRoleKeys.admin],
        requiredPermissions: [permissionKeys.integrationsQueueManage],
      }),
    );
  });
});
