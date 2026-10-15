import type { InstallProfileService } from './install-profile.service';
import type { InstallReadinessService } from './install-readiness.service';
import type { InstallStepSkipService } from './install-step-skip.service';
import { createInstallWizardHarness } from './create-install-wizard-harness';
import { InstallStepsController } from './install-steps.controller';

/**
 * F2: the package, "Podesi kasnije" and readiness routes. They run against the
 * real services over the in-memory doubles, so a wrong wiring (e.g. a step the
 * registry does not mark skippable) fails here rather than in the browser.
 */
async function createController() {
  const harness = await createInstallWizardHarness();
  const controller = new InstallStepsController(
    harness.profileService as unknown as InstallProfileService,
    harness.skipService as unknown as InstallStepSkipService,
    harness.readinessService as unknown as InstallReadinessService,
  );
  return { harness, controller };
}

describe('InstallStepsController (package, skip, readiness)', () => {
  it('returns the package catalogue and the stored package', async () => {
    const { controller } = await createController();

    await expect(controller.getProfile()).resolves.toMatchObject({ profile: null });
    await controller.saveProfile({ profile: 'standard' });
    await expect(controller.getProfile()).resolves.toMatchObject({ profile: 'standard' });
  });

  it('defers and restores a skippable step', async () => {
    const { controller } = await createController();

    await expect(controller.skipStep({ stepKey: 'team' })).resolves.toEqual({
      stepKey: 'team',
      skipped: true,
    });
    await expect(controller.unskipStep({ stepKey: 'team' })).resolves.toEqual({
      stepKey: 'team',
      skipped: false,
    });
    await expect(controller.skipStep({ stepKey: 'superAdmin' })).rejects.toMatchObject({
      response: { code: 'INSTALL_STEP_NOT_SKIPPABLE' },
    });
  });

  it('reports readiness including the package steps', async () => {
    const { controller, harness } = await createController();
    harness.memory.seedSlaProfile({
      id: 'sla-standard',
      key: 'STANDARD_REQUEST',
      name: 'Standardni zahtjev',
      isActive: true,
    });
    await harness.profileService.save({ profile: 'minimum' });
    await harness.saveAuthMode('local');
    await harness.saveSmtp();
    await harness.saveIdentity();
    await harness.seedMinimum();
    await harness.skipService.skip('team');
    await harness.addonsService.save({ addons: { csat: true } });

    const readiness = await controller.getReadiness();
    expect(readiness.isReady).toBe(true);
    expect(readiness.checks.map((entry) => entry.key)).toContain('profileSteps');
  });
});
