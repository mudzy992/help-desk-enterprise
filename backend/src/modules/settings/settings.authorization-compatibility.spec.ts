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
import { SettingsController } from './settings.controller';

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

describe('settings authorization compatibility', () => {
  it.each([
    { label: 'global', organizationalUnitId: null, organizationalUnitPath: null, allowed: true },
    { label: 'OU-scoped', organizationalUnitId: 'ou-1', organizationalUnitPath: '/ou-1', allowed: false },
  ])('$label settings.read grant has the expected global-read decision', async ({ organizationalUnitId, organizationalUnitPath, allowed }) => {
    const harness = createTestAuthorizationHarness();
    harness.loadBySubjectId.mockResolvedValue(
      createAuthorizationContext({
        id: 'settings-reader',
        isActive: true,
        isLocalOnly: true,
        entraObjectId: null,
        assignments: [createTestAssignment({
          roleKey: authorizationRoleKeys.admin,
          permissionKeys: [permissionKeys.settingsRead],
          organizationalUnitId,
          organizationalUnitPath,
        })],
      }),
    );
    const guard = new RoleGuard(new Reflector(), harness.authorizationService);
    const decision = guard.canActivate({
      switchToHttp: () => ({ getRequest: () => ({ [AUTHENTICATED_PRINCIPAL_REQUEST_KEY]: createPrincipal('settings-reader') }) }),
      getHandler: () => SettingsController.prototype.listSettingsRegistry,
      getClass: () => SettingsController,
    } as never);
    if (allowed) await expect(decision).resolves.toBe(true);
    else await expect(decision).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('does not allow an OU-scoped settings.write grant to change installation-wide configuration', async () => {
    const harness = createTestAuthorizationHarness();
    harness.loadBySubjectId.mockResolvedValue(
      createAuthorizationContext({
        id: 'scoped-admin',
        isActive: true,
        isLocalOnly: true,
        entraObjectId: null,
        assignments: [createTestAssignment({
          roleKey: authorizationRoleKeys.admin,
          permissionKeys: [permissionKeys.settingsWrite],
          organizationalUnitId: 'ou-1',
          organizationalUnitPath: '/ou-1',
        })],
      }),
    );
    const guard = new RoleGuard(new Reflector(), harness.authorizationService);

    await expect(
      guard.canActivate({
        switchToHttp: () => ({
          getRequest: () => ({
            [AUTHENTICATED_PRINCIPAL_REQUEST_KEY]: createPrincipal('scoped-admin'),
          }),
        }),
        getHandler: () => SettingsController.prototype.updateSetting,
        getClass: () => SettingsController,
      } as never),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('requires settings.write and does not reach the mutation when denied', async () => {
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
            permissionKeys: [permissionKeys.routingWrite],
          }),
        ],
      }),
    );
    const guard = new RoleGuard(new Reflector(), harness.authorizationService);
    const setSettingValue = jest.fn();
    await expect(
      guard.canActivate({
        switchToHttp: () => ({
          getRequest: () => ({
            [AUTHENTICATED_PRINCIPAL_REQUEST_KEY]: createPrincipal('local-admin'),
            body: {
              key: 'private.auth.mode',
              value: 'entra_ad',
              reason: 'Switch provider',
            },
          }),
        }),
        getHandler: () => SettingsController.prototype.updateSetting,
        getClass: () => SettingsController,
      } as never),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(setSettingValue).not.toHaveBeenCalled();
  });
});
