import { settingKeys } from '../settings/setting-keys';
import { createInstallWizardHarness } from './create-install-wizard-harness';

describe('InstallProfileService', () => {
  it('offers the three packages while nothing is chosen', async () => {
    const harness = await createInstallWizardHarness();
    const status = await harness.profileService.getStatus();

    expect(status.profile).toBeNull();
    expect(status.packages.map((entry) => entry.profile)).toEqual([
      'minimum',
      'standard',
      'full',
    ]);
    expect(status.packages.every((entry) => entry.titleKey.startsWith('install.profile.'))).toBe(
      true,
    );
  });

  it('records the chosen package in the settings registry', async () => {
    const harness = await createInstallWizardHarness();
    const status = await harness.profileService.save({ profile: 'standard' });

    expect(status.profile).toBe('standard');
    expect(harness.readStored(settingKeys.privateInstallProfile)?.value).toBe(
      'standard',
    );
    expect(harness.settingsMemory.changeLogs.at(-1)).toMatchObject({
      entityId: settingKeys.privateInstallProfile,
      reason: 'install_profile',
      actorUserId: harness.actorUserId,
    });
    expect((await harness.setupService.getStatus()).profile).toBe('standard');
  });

  it('lets an installation that has not seeded yet switch packages freely', async () => {
    const harness = await createInstallWizardHarness();
    await harness.profileService.save({ profile: 'full' });
    await harness.profileService.save({ profile: 'minimum' });

    expect(harness.readStored(settingKeys.privateInstallProfile)?.value).toBe(
      'minimum',
    );
  });

  it('accepts an upgrade after the seed but refuses a downgrade', async () => {
    const harness = await createInstallWizardHarness();
    await harness.profileService.save({ profile: 'minimum' });
    await harness.seedMinimum();

    await expect(
      harness.profileService.save({ profile: 'full' }),
    ).resolves.toMatchObject({ profile: 'full' });
    await expect(
      harness.profileService.save({ profile: 'minimum' }),
    ).rejects.toMatchObject({
      response: { code: 'INSTALL_PROFILE_LOCKED_AFTER_SEED' },
      status: 409,
    });
    expect(harness.readStored(settingKeys.privateInstallProfile)?.value).toBe(
      'full',
    );
  });

  it('reopens a step the new package requires instead of carrying over the deferral', async () => {
    const harness = await createInstallWizardHarness();
    await harness.profileService.save({ profile: 'minimum' });
    await harness.skipService.skip('smtp');
    expect(harness.readStored('private.install.steps.smtp.skipped')?.value).toBe(true);

    const status = await harness.profileService.save({ profile: 'standard' });

    // IN19: "Podesi kasnije" under Minimum is not an answer to Standard.
    expect(status.reopenedSteps).toEqual(['smtp']);
    expect(harness.readStored('private.install.steps.smtp.skipped')).toBeUndefined();
    const setup = await harness.setupService.getStatus();
    expect(setup.steps.smtp).toMatchObject({ skipped: false, required: true, blocking: true });
  });

  it('reports no reopened step when the deferral was never made', async () => {
    const harness = await createInstallWizardHarness();
    await harness.profileService.save({ profile: 'minimum' });

    const status = await harness.profileService.save({ profile: 'standard' });

    expect(status.reopenedSteps).toEqual([]);
    // An upgrade still puts the step Standard asks for back in the way.
    expect((await harness.setupService.getStatus()).steps.smtp).toMatchObject({
      required: true,
      blocking: true,
    });
  });

  it('never erases what an upgrade path still needs', async () => {
    const harness = await createInstallWizardHarness();
    await harness.saveSmtp();
    await harness.profileService.save({ profile: 'full' });
    await harness.profileService.save({ profile: 'minimum' });

    expect(harness.readStored(settingKeys.privateSmtpEnabled)?.value).toBe(true);
    expect(harness.readStored(settingKeys.privateAuthMode)).toBeUndefined();
  });
});
