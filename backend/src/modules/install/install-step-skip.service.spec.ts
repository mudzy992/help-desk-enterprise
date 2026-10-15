import { createInstallWizardHarness } from './create-install-wizard-harness';

describe('InstallStepSkipService', () => {
  it('refuses to defer a step that must be configured now', async () => {
    const harness = await createInstallWizardHarness();
    await expect(harness.skipService.skip('superAdmin')).rejects.toMatchObject({
      response: { code: 'INSTALL_STEP_NOT_SKIPPABLE' },
    });
  });

  it('rejects unknown step keys instead of writing a stray setting', async () => {
    const harness = await createInstallWizardHarness();
    await expect(harness.skipService.skip('nope')).rejects.toMatchObject({
      response: { code: 'INSTALL_STEP_UNKNOWN' },
    });
  });

  it('requires the initial SuperAdmin before any deferral is recorded', async () => {
    const harness = await createInstallWizardHarness({ withSuperAdmin: false });
    await expect(harness.skipService.skip('smtp')).rejects.toMatchObject({
      response: { code: 'SUPER_ADMIN_REQUIRED' },
    });
  });

  it('stores and clears the deferred flag through the settings registry', async () => {
    const harness = await createInstallWizardHarness();

    await expect(harness.skipService.skip('smtp')).resolves.toEqual({
      stepKey: 'smtp',
      skipped: true,
    });
    expect(harness.readStored('private.install.steps.smtp.skipped')?.value).toBe(
      true,
    );
    expect(harness.settingsMemory.changeLogs.at(-1)).toMatchObject({
      entityId: 'private.install.steps.smtp.skipped',
      reason: 'install_step_skip',
      actorUserId: harness.actorUserId,
    });

    await expect(harness.skipService.unskip('smtp')).resolves.toEqual({
      stepKey: 'smtp',
      skipped: false,
    });
    expect(harness.readStored('private.install.steps.smtp.skipped')?.value).toBe(
      false,
    );
  });

  it('lets the wizard move past a deferred step', async () => {
    const harness = await createInstallWizardHarness();
    await harness.profileService.save({ profile: 'minimum' });
    await harness.saveSmtp();
    await harness.saveIdentity();
    await harness.seedMinimum();
    // F2: the team is the other step Minimum may defer.
    await harness.skipService.skip('team');
    await harness.skipService.skip('addons');

    const status = await harness.setupService.getStatus();
    expect(status.nextStep).toBe('complete');
    expect(status.steps.addons).toEqual({
      completed: false,
      skipped: true,
      required: true,
      offered: true,
      skippable: true,
      blocking: false,
    });
  });
});
