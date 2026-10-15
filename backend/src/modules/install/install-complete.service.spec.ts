import { ServiceUnavailableException } from '@nestjs/common';
import { settingKeys } from '../settings/setting-keys';
import { createInstallCompleteHarness, createReadinessResult } from './create-install-complete-harness';
import { enforceInstallSetupGate } from './enforce-install-setup-gate';
import { installSetupErrorCodes } from './install-setup.constants';

const firstCompletedAt = '2026-09-11T10:00:00.000Z';
const secondCompletedAt = '2026-09-11T12:00:00.000Z';

describe('InstallCompleteService', () => {
  it('keeps the setup gate active until completion', async () => {
    const { setupService } = await createInstallCompleteHarness();
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
        loadCompletedAt: () => Promise.reject(new Error('db down')),
      }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('persists completedAt, restores API access, and is safe to repeat', async () => {
    const harness = await createInstallCompleteHarness();
    await expect(
      harness.completeService.completeAt(firstCompletedAt),
    ).resolves.toMatchObject({ isCompleted: true });
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
    ).resolves.toMatchObject({ isCompleted: true });
    expect(
      harness.settingsMemory.getStored(settingKeys.privateInstallCompletedAt)
        ?.value,
    ).toBe(firstCompletedAt);
    expect(
      harness.settingsMemory.getStored(settingKeys.privateAuthJwtSigningSecret)
        ?.value,
    ).toEqual(expect.any(String));
    expect(
      String(
        harness.settingsMemory.getStored(
          settingKeys.privateAuthJwtSigningSecret,
        )?.value,
      ).length,
    ).toBeGreaterThanOrEqual(32);
    expect(harness.settingsMemory.changeLogs).toHaveLength(2);
    expect(
      harness.settingsMemory.changeLogs.some(
        (entry) =>
          entry.entityId === settingKeys.privateInstallCompletedAt &&
          entry.reason === 'install_wizard',
      ),
    ).toBe(true);
  });

  it('rejects completion before SuperAdmin exists', async () => {
    const { completeService, settingsMemory } = await createInstallCompleteHarness({
      withSuperAdmin: false,
    });
    await expect(
      completeService.completeAt(firstCompletedAt),
    ).rejects.toMatchObject({
      response: { code: 'SUPER_ADMIN_REQUIRED' },
    });
    expect(
      settingsMemory.getStored(settingKeys.privateInstallCompletedAt),
    ).toBeUndefined();
  });

  it('refuses to finish while a readiness check is red', async () => {
    const harness = await createInstallCompleteHarness({
      readiness: async () =>
        createReadinessResult([
          { key: 'service', status: 'ok', messageKey: 'install.readiness.service' },
          {
            key: 'routing',
            status: 'missing',
            messageKey: 'install.readiness.routing',
          },
          {
            key: 'slaProfile',
            status: 'skipped',
            messageKey: 'install.readiness.slaProfile',
          },
        ]),
    });
    await expect(
      harness.completeService.completeAt(firstCompletedAt),
    ).rejects.toMatchObject({
      response: {
        code: 'INSTALL_NOT_READY',
        details: { missing: ['routing'] },
      },
    });
    expect(
      harness.settingsMemory.getStored(settingKeys.privateInstallCompletedAt),
    ).toBeUndefined();
  });

  it('provisions a missing JWT signing secret when install is already completed', async () => {
    const harness = await createInstallCompleteHarness();
    await harness.settingsMemory.prisma.appSetting.upsert({
      where: { key: settingKeys.privateInstallCompletedAt },
      create: {
        key: settingKeys.privateInstallCompletedAt,
        value: firstCompletedAt,
        scope: 'PRIVATE',
        isSecret: false,
        description: 'completed',
      },
      update: {
        value: firstCompletedAt,
        scope: 'PRIVATE',
        isSecret: false,
        description: 'completed',
      },
    });
    await harness.completeService.onModuleInit();
    expect(
      String(
        harness.settingsMemory.getStored(
          settingKeys.privateAuthJwtSigningSecret,
        )?.value,
      ).length,
    ).toBeGreaterThanOrEqual(32);
    await expect(harness.setupService.isCompleted()).resolves.toBe(true);
  });
});
