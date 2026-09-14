import { ForbiddenException } from '@nestjs/common';
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
import { SupportBundleController } from './support-bundle.controller';

jest.mock('../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

function createPrincipal(subjectId: string): AuthorizationPrincipal {
  return {
    subjectId,
    email: `${subjectId}@example.com`,
    displayName: subjectId,
    isLocalOnly: true,
  };
}

describe('support bundle authorization compatibility', () => {
  it('rejects an Admin who has supportBundle.export but is not SuperAdmin', async () => {
    const harness = createTestAuthorizationHarness();
    harness.loadBySubjectId.mockResolvedValue(
      createAuthorizationContext({
        id: 'local-admin',
        isActive: true,
        isLocalOnly: true,
        entraObjectId: null,
        assignments: [
          createTestAssignment({
            roleKey: authorizationRoleKeys.admin,
            permissionKeys: [permissionKeys.supportBundleExport],
          }),
        ],
      }),
    );
    const guard = new RoleGuard(new Reflector(), harness.authorizationService);
    await expect(
      guard.canActivate({
        switchToHttp: () => ({
          getRequest: () => ({
            [AUTHENTICATED_PRINCIPAL_REQUEST_KEY]: createPrincipal('local-admin'),
          }),
        }),
        getHandler: () => SupportBundleController.prototype.download,
        getClass: () => SupportBundleController,
      } as never),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('allows a local SuperAdmin', async () => {
    const harness = createTestAuthorizationHarness();
    harness.loadBySubjectId.mockResolvedValue(
      createAuthorizationContext({
        id: 'local-super',
        isActive: true,
        isLocalOnly: true,
        entraObjectId: null,
        assignments: [
          createTestAssignment({
            roleKey: authorizationRoleKeys.superAdmin,
            permissionKeys: [permissionKeys.supportBundleExport],
          }),
        ],
      }),
    );
    const guard = new RoleGuard(new Reflector(), harness.authorizationService);
    await expect(
      guard.canActivate({
        switchToHttp: () => ({
          getRequest: () => ({
            [AUTHENTICATED_PRINCIPAL_REQUEST_KEY]: createPrincipal('local-super'),
          }),
        }),
        getHandler: () => SupportBundleController.prototype.download,
        getClass: () => SupportBundleController,
      } as never),
    ).resolves.toBe(true);
  });
});
