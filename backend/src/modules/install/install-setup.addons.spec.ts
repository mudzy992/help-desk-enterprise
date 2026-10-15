import { settingKeys } from '../settings/setting-keys';
import { createInstallWizardHarness } from './create-install-wizard-harness';
import { listInstallStepDefinitions } from './steps/install-step.registry';

/**
 * F0.5: the add-ons step used to report `completed: true` unconditionally, so a
 * refresh after the seed skipped it and the catalog defaults were never
 * confirmed — while `install-complete.service.ts` claimed the same.
 */
describe('InstallSetupService add-ons step', () => {
  it('keeps asking for the add-ons step after the seed until it is saved', async () => {
    const harness = await createInstallWizardHarness();
    await harness.profileService.save({ profile: 'minimum' });
    await harness.saveSmtp();
    await harness.saveIdentity();
    await harness.seedMinimum();
    await harness.skipService.skip('team');

    const status = await harness.setupService.getStatus();
    expect(status.nextStep).toBe('addons');
    expect(status.steps.addons.completed).toBe(false);
  });

  it('moves to the final screen once the catalog was saved', async () => {
    const harness = await createInstallWizardHarness();
    await harness.profileService.save({ profile: 'minimum' });
    await harness.saveSmtp();
    await harness.saveIdentity();
    await harness.seedMinimum();
    await harness.skipService.skip('team');
    await harness.addonsService.save({ addons: { csat: true } });

    const status = await harness.setupService.getStatus();
    expect(status.nextStep).toBe('complete');
    expect(status.steps.addons.completed).toBe(true);
    expect(harness.readStored('private.addons.csat')?.value).toBe(true);
  });

  it('reports every wizard step and its package flags', async () => {
    const harness = await createInstallWizardHarness();
    await harness.profileService.save({ profile: 'full' });
    const status = await harness.setupService.getStatus();

    expect(status.profile).toBe('full');
    expect(status.isCompleted).toBe(false);
    // F4: derived from the registry — the wizard's step list is the registry's.
    expect(Object.keys(status.steps)).toEqual(
      listInstallStepDefinitions().map((definition) => definition.key),
    );
    expect(status.steps.profile).toEqual({
      completed: true,
      skipped: false,
      required: true,
      offered: true,
      skippable: false,
      blocking: false,
    });
    expect(status.steps.smtp.required).toBe(true);
  });

  it('reports a completed installation with the stored package', async () => {
    const harness = await createInstallWizardHarness();
    await harness.settingsService.setSettingValue(
      settingKeys.privateInstallCompletedAt,
      '2026-09-11T10:00:00.000Z',
      { reason: 'install_wizard', actorUserId: harness.actorUserId },
    );
    await harness.profileService.save({ profile: 'minimum' });

    const status = await harness.setupService.getStatus();
    expect(status.isCompleted).toBe(true);
    expect(status.nextStep).toBe('complete');
    expect(status.profile).toBe('minimum');
    expect(status.steps.superAdmin.completed).toBe(true);
  });
});
