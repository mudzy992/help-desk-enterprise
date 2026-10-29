import type { InstallAddonsService } from './install-addons.service';
import type { InstallCompleteService } from './install-complete.service';
import type { InstallIdentityService } from './install-identity.service';
import type { InstallLoginProviderService } from './install-login-provider.service';
import type { InstallSeedService } from './install-seed.service';
import type { InstallSetupService } from './install-setup.service';
import type { InstallSmtpService } from './install-smtp.service';
import type { InstallSuperAdminService } from './install-super-admin.service';
import type { InstallTeamService } from './install-team.service';
import { InstallController } from './install.controller';
import { createInstallWizardHarness } from './create-install-wizard-harness';

/**
 * Install wizard v2 (F2): the first-run routes are thin — the controller only
 * shapes the request. The spec runs them against the real services over the
 * in-memory doubles, so a wrong wiring (e.g. forgetting the names resolution)
 * fails here. The package/skip/readiness routes have their own controller and
 * spec (`install-steps.controller.spec.ts`).
 */
async function createController() {
  const harness = await createInstallWizardHarness();
  const controller = new InstallController(
    harness.setupService as unknown as InstallSetupService,
    {} as InstallSuperAdminService,
    harness.identityService as unknown as InstallIdentityService,
    harness.teamService as unknown as InstallTeamService,
    {} as InstallLoginProviderService,
    {} as InstallSmtpService,
    harness.seedService as unknown as InstallSeedService,
    harness.addonsService as unknown as InstallAddonsService,
    {} as InstallCompleteService,
  );
  return { harness, controller };
}

describe('InstallController (first-run steps)', () => {
  it('answers the status endpoint with the stored package and step flags', async () => {
    const { controller, harness } = await createController();
    await harness.profileService.save({ profile: 'full' });
    await harness.saveSmtp();

    const status = await controller.getStatus();
    expect(status.profile).toBe('full');
    expect(status.steps.smtp).toMatchObject({
      completed: true,
      required: true,
      blocking: false,
    });
    expect(status.steps.addons.blocking).toBe(true);
  });

  it('exposes the F2 identity step through the controller', async () => {
    const { controller } = await createController();

    await expect(controller.getIdentity()).resolves.toMatchObject({
      identity: { isConfigured: false, organizationName: '' },
    });
    const saved = await controller.saveIdentity({
      organizationName: 'Visoko Grad',
    });
    expect(saved.organizationName).toBe('Visoko Grad');
    await expect(controller.getIdentity()).resolves.toMatchObject({
      identity: { isConfigured: true, organizationName: 'Visoko Grad' },
    });
  });

  it('takes the structure names in the seed body and answers the stored ones', async () => {
    const { controller } = await createController();
    const result = await controller.createSeed({
      organizationalUnitName: 'Gradska uprava',
      handlerGroupName: 'Podrška',
      serviceName: 'Zahtjev za pomoć',
      categoryName: 'Opće',
    });

    expect(result.service?.name).toBe('Zahtjev za pomoć');
    expect(result.fallbackGroup?.name).toBe('Podrška');
    expect(result.warning).toBeUndefined();
  });

  it('keeps the body-less seed working and reports the stored names when they differ', async () => {
    const { controller } = await createController();
    await controller.createSeed({ serviceName: 'Zahtjev za pomoć' });

    const repeated = await controller.createSeed();
    expect(repeated.service?.name).toBe('Zahtjev za pomoć');
    expect(repeated.fallbackGroup?.name).toBe('Fallback');
    expect(repeated.warning).toMatchObject({
      code: 'NAMES_ALREADY_SEEDED',
      stored: { serviceName: 'Zahtjev za pomoć' },
    });
  });

  it('lists the team of the handler group through the controller', async () => {
    const { controller, harness } = await createController();
    await harness.seedMinimum();

    await expect(controller.getTeam()).resolves.toMatchObject({
      team: { groupName: 'Fallback', isTeamInvited: false },
    });
  });
});
