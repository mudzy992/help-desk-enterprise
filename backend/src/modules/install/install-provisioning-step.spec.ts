import { settingKeys } from '../settings/setting-keys';
import { createInstallWizardHarness } from './create-install-wizard-harness';
import { installReadinessCheckKeys } from './evaluate-install-readiness';
import { installStepDefinitionByKey } from './steps/install-step.registry';

/**
 * Install wizard v2 (F6.1): the readiness screen is the wizard's last stop. It
 * owns no marker, so the two rules that keep it honest are pinned here — it is
 * always in the way until the installation is finished, and the readiness check
 * it presents never counts it (that would make readiness unreachable).
 */
describe('the readiness step (provisioning)', () => {
  /** The wizard walked to the point where nothing but the readiness screen is left. */
  async function walkToTheEnd() {
    const harness = await createInstallWizardHarness();
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
    // Minimum may defer the team step; readiness still holds the founder.
    await harness.skipService.skip('team');
    await harness.addonsService.save({ addons: { csat: true } });
    return harness;
  }

  it('is the last step of the registry and is never offered for deferral', () => {
    const definition = installStepDefinitionByKey.provisioning;
    expect(definition.skippable).toBe(false);
    expect(definition.requiredIn).toEqual(['minimum', 'standard', 'full']);
    expect(definition.offeredIn).toEqual(['minimum', 'standard', 'full']);
    // The provisioning status route knows the key and answers 409, not 400.
    expect(definition.order).toBeGreaterThan(installStepDefinitionByKey.addons.order);
  });

  it('stands in the way even when everything it checks is green', async () => {
    const harness = await walkToTheEnd();

    const readiness = await harness.readinessService.check();
    expect(readiness.isReady).toBe(true);

    const status = await harness.setupService.getStatus();
    expect(status.nextStep).toBe('provisioning');
    expect(status.steps.provisioning).toMatchObject({
      completed: false,
      skipped: false,
      required: true,
      offered: true,
      skippable: false,
      blocking: true,
    });
    // „Podesi kasnije“ is refused: the installation cannot finish without it.
    await expect(harness.skipService.skip('provisioning')).rejects.toMatchObject({
      response: { code: 'INSTALL_STEP_NOT_SKIPPABLE' },
    });
  });

  it('is reported as done once the installation is complete', async () => {
    const harness = await walkToTheEnd();
    await harness.settingsService.setSettingValue(
      settingKeys.privateInstallCompletedAt,
      '2026-10-15T09:00:00.000Z',
      { reason: 'install_wizard', actorUserId: harness.actorUserId },
    );

    const status = await harness.setupService.getStatus();
    expect(status.isCompleted).toBe(true);
    expect(status.steps.provisioning.completed).toBe(true);
  });

  it('is left out of the readiness check it presents', async () => {
    const harness = await walkToTheEnd();

    const readiness = await harness.readinessService.check();
    const profileSteps = readiness.checks.find((check) => check.key === 'profileSteps');
    // `skipped` (deferred steps exist) and not `missing`: the deferred team step is
    // the checklist's business, never a reason to stay on the readiness screen.
    expect(profileSteps).toMatchObject({ status: 'skipped', stepKeys: ['team'] });
    expect(profileSteps?.stepKeys).not.toContain('provisioning');
  });

  it('names the step that answers a red check, and none for the system roles', async () => {
    const harness = await createInstallWizardHarness();

    const readiness = await harness.readinessService.check();
    const byKey = new Map(readiness.checks.map((check) => [check.key, check]));
    for (const key of installReadinessCheckKeys) {
      expect(byKey.get(key)).toBeDefined();
    }
    expect(byKey.get('authMode')).toMatchObject({ status: 'missing', stepKey: 'loginProvider' });
    expect(byKey.get('service')).toMatchObject({ status: 'missing', stepKey: 'seed' });
    expect(byKey.get('handlerGroup')).toMatchObject({ status: 'missing', stepKey: 'team' });
    expect(byKey.get('slaProfile')).toMatchObject({ status: 'missing', stepKey: 'slaReview' });
    // Roles are created by the product itself: no step can be offered for them,
    // whatever the check answers.
    expect(byKey.get('roles')?.stepKey).toBeNull();
    // The map is closed: every link the screen may show points at a registry step.
    for (const key of installReadinessCheckKeys) {
      const stepKey = byKey.get(key)?.stepKey ?? null;
      if (stepKey !== null) {
        expect(installStepDefinitionByKey[stepKey]).toBeDefined();
      }
    }
  });
});
