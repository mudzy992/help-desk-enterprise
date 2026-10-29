import { settingKeys } from '../settings/setting-keys';
import { createInstallWizardHarness } from './create-install-wizard-harness';
import { installRerunConstants } from './install-rerun.constants';
import { InstallRerunService } from './install-rerun.service';
import { resolveInstallStepSkippedKey } from './steps/install-step.registry';

const completedAt = '2026-10-15T09:00:00.000Z';

/**
 * Owner decision 6, through the real settings service over the in-memory
 * doubles: the switch is the gate, the lock is the only thing cleared by default,
 * the markers only on request, and everything lands in the change log under the
 * rerun reason.
 */
async function createRerunHarness() {
  const harness = await createInstallWizardHarness();
  return {
    ...harness,
    rerunService: new InstallRerunService(
      harness.prisma,
      harness.registry,
      harness.settingsService,
      harness.setupService,
    ),
    /** What `POST /install/complete` stores, without the readiness ceremony. */
    complete: async () => {
      const mutation = { reason: 'install_wizard', actorUserId: harness.actorUserId };
      await harness.settingsService.setSettingValue(
        settingKeys.privateInstallCompletedAt,
        completedAt,
        mutation,
      );
      await harness.settingsService.setSettingValue(
        settingKeys.privateInstallCompletedByUserId,
        harness.actorUserId,
        mutation,
      );
    },
  };
}

describe('InstallRerunService', () => {
  const original = process.env.INSTALL_ALLOW_RERUN;

  afterEach(() => {
    if (original === undefined) delete process.env.INSTALL_ALLOW_RERUN;
    else process.env.INSTALL_ALLOW_RERUN = original;
  });

  it('refuses to reopen the wizard while the ops switch is off', async () => {
    delete process.env.INSTALL_ALLOW_RERUN;
    const harness = await createRerunHarness();
    await harness.complete();

    await expect(harness.rerunService.restart()).rejects.toMatchObject({
      response: { code: 'INSTALL_RERUN_NOT_ALLOWED' },
    });
    expect(await harness.settingsService.getSetting(settingKeys.privateInstallCompletedAt)).toBe(
      completedAt,
    );
  });

  it('clears the lock and reports where the wizard opens next', async () => {
    process.env.INSTALL_ALLOW_RERUN = 'true';
    const harness = await createRerunHarness();
    await harness.complete();

    const result = await harness.rerunService.restart();

    expect(result).toMatchObject({
      restarted: true,
      alreadyOpen: false,
      includeStepMarkers: false,
      previousCompletedAt: completedAt,
    });
    expect(result.clearedKeys).toEqual([
      settingKeys.privateInstallCompletedAt,
      settingKeys.privateInstallCompletedByUserId,
    ]);
    expect(await harness.settingsService.getSetting(settingKeys.privateInstallCompletedAt)).toBe(
      '',
    );
    // The wizard is open again and the server says which step it asks for.
    expect((await harness.setupService.getStatus()).isCompleted).toBe(false);
    expect(result.nextStep).toBe('profile');
  });

  it('is a no-op on a system whose wizard is already open', async () => {
    process.env.INSTALL_ALLOW_RERUN = 'true';
    const harness = await createRerunHarness();
    const logsBefore = harness.settingsMemory.changeLogs.length;

    const result = await harness.rerunService.restart();

    expect(result).toMatchObject({
      restarted: false,
      alreadyOpen: true,
      previousCompletedAt: null,
      clearedKeys: [],
    });
    // A second run must not fill the change log with empty entries.
    expect(harness.settingsMemory.changeLogs).toHaveLength(logsBefore);
  });

  it('clears the wizard markers only when the operator asks for them', async () => {
    process.env.INSTALL_ALLOW_RERUN = 'true';
    const harness = await createRerunHarness();
    await harness.profileService.save({ profile: 'full' });
    await harness.skipService.skip('addons');
    await harness.complete();

    const kept = await harness.rerunService.restart();
    expect(kept.clearedKeys).not.toContain(settingKeys.privateInstallProfile);
    expect(await harness.settingsService.getSetting(settingKeys.privateInstallProfile)).toBe(
      'full',
    );

    const cleared = await harness.rerunService.restart({
      includeStepMarkers: true,
    });
    expect(cleared.includeStepMarkers).toBe(true);
    expect(cleared.clearedKeys).toContain(settingKeys.privateInstallProfile);
    expect(cleared.clearedKeys).toContain(resolveInstallStepSkippedKey('addons'));
    expect(await harness.settingsService.getSetting(settingKeys.privateInstallProfile)).toBe('');
    expect(await harness.settingsService.getSetting(resolveInstallStepSkippedKey('addons'))).toBe(
      false,
    );
  });

  it('writes every cleared key into the change log under the rerun reason', async () => {
    process.env.INSTALL_ALLOW_RERUN = 'true';
    const harness = await createRerunHarness();
    await harness.complete();

    await harness.rerunService.restart();

    const reasons = harness.settingsMemory.changeLogs.map((entry) => entry.reason);
    expect(reasons).toContain(installRerunConstants.changeLogReason);
    expect(harness.settingsMemory.changeLogs.map((entry) => entry.entityId)).toContain(
      settingKeys.privateInstallCompletedAt,
    );
  });
});
