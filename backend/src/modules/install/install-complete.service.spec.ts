import { ServiceUnavailableException } from '@nestjs/common';
import { hashLocalPassword } from '../authentication/hash-local-password';
import { applicationSettings } from '../settings/definitions/application-settings';
import { createInMemorySettingsPrisma } from '../settings/create-in-memory-settings-prisma';
import { createSettingsRegistry } from '../settings/registry/create-settings-registry';
import { settingKeys } from '../settings/setting-keys';
import { SettingsService } from '../settings/settings.service';
import type { PrismaService } from '../../common/prisma/prisma.service';
import { createInMemoryInstallSuperAdminPrisma } from './create-in-memory-install-super-admin-prisma';
import { createInstallSuperAdmin } from './create-install-super-admin';
import { enforceInstallSetupGate } from './enforce-install-setup-gate';
import { installSetupErrorCodes } from './install-setup.constants';
import { InstallCompleteService } from './install-complete.service';
import { InstallSetupService } from './install-setup.service';

jest.mock('../../common/prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

const firstCompletedAt = '2026-09-11T10:00:00.000Z';
const secondCompletedAt = '2026-09-11T12:00:00.000Z';

async function createHarness(withSuperAdmin = true) {
  const users = createInMemoryInstallSuperAdminPrisma();
  const settingsMemory = createInMemorySettingsPrisma();
  const prisma = {
    user: users.prisma.user,
    appSetting: settingsMemory.prisma.appSetting,
    changeLog: settingsMemory.prisma.changeLog,
    $transaction: settingsMemory.prisma.$transaction,
  };
  const registry = createSettingsRegistry(applicationSettings);
  const settingsService = new SettingsService(
    registry,
    settingsMemory.prisma as unknown as PrismaService,
  );
  if (withSuperAdmin) {
    await createInstallSuperAdmin(
      users.prisma as unknown as PrismaService,
      {
        email: 'admin@example.com',
        displayName: 'Super Admin',
        password: 'correct-horse-battery',
      },
      (value) => hashLocalPassword(value, 4),
    );
  }
  return {
    settingsMemory,
    settingsService,
    setupService: new InstallSetupService(settingsService),
    completeService: new InstallCompleteService(
      prisma as unknown as PrismaService,
      registry,
    ),
  };
}

describe('InstallCompleteService', () => {
  it('keeps the setup gate active until completion', async () => {
    const { setupService } = await createHarness();
    await expect(setupService.isCompleted()).resolves.toBe(false);
    await expect(
      enforceInstallSetupGate({
        method: 'PUT',
        path: '/settings',
        loadCompletedAt: () => setupService.readCompletedAt(),
      }),
    ).rejects.toMatchObject({
      response: { code: installSetupErrorCodes.setupRequired },
    });
    await expect(
      enforceInstallSetupGate({
        method: 'PUT',
        path: '/settings',
        loadCompletedAt: () => setupService.readCompletedAt(),
      }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('persists completedAt, restores API access, and is safe to repeat', async () => {
    const harness = await createHarness();
    await expect(
      harness.completeService.completeAt(firstCompletedAt),
    ).resolves.toEqual({ isCompleted: true });
    expect(
      harness.settingsMemory.getStored(settingKeys.privateInstallCompletedAt)
        ?.value,
    ).toBe(firstCompletedAt);
    await expect(harness.setupService.isCompleted()).resolves.toBe(true);
    await expect(
      enforceInstallSetupGate({
        method: 'PUT',
        path: '/settings',
        loadCompletedAt: () => harness.setupService.readCompletedAt(),
      }),
    ).resolves.toBeUndefined();
    await expect(
      harness.completeService.completeAt(secondCompletedAt),
    ).resolves.toEqual({ isCompleted: true });
    expect(
      harness.settingsMemory.getStored(settingKeys.privateInstallCompletedAt)
        ?.value,
    ).toBe(firstCompletedAt);
    expect(harness.settingsMemory.changeLogs).toHaveLength(1);
    expect(harness.settingsMemory.changeLogs[0]).toMatchObject({
      entityId: settingKeys.privateInstallCompletedAt,
      reason: 'install_wizard',
    });
  });

  it('rejects completion before SuperAdmin exists', async () => {
    const { completeService, settingsMemory } = await createHarness(false);
    await expect(
      completeService.completeAt(firstCompletedAt),
    ).rejects.toMatchObject({
      response: { code: 'SUPER_ADMIN_REQUIRED' },
    });
    expect(
      settingsMemory.getStored(settingKeys.privateInstallCompletedAt),
    ).toBeUndefined();
  });
});
