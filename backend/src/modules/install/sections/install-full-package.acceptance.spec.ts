import { settingKeys } from '../../settings/setting-keys';
import { createInstallWizardHarness } from '../create-install-wizard-harness';
import { readMissingReadinessKeys } from '../evaluate-install-readiness';
import { installSectionStepKeys } from './install-settings-section.keys';

/**
 * F5 acceptance: „Podesi kasnije“ has to work for **every** section of the Full
 * package and readiness has to stay green. A deferred step counts as answered
 * (owner decision D4), so the wizard can finish, and the deferrals show up in the
 * post-install checklist instead of blocking the final screen.
 */
async function createFullHarness() {
  const harness = await createInstallWizardHarness();
  harness.memory.seedSlaProfile({
    id: 'sla-full',
    key: 'default',
    name: 'Default',
    isActive: true,
  });
  await harness.saveAuthMode('local');
  await harness.saveIdentity();
  await harness.saveSmtp();
  await harness.seedMinimum();
  await harness.addonsService.save({ addons: { csat: true } });
  await harness.profileService.save({ profile: 'full' });
  // The content the Full package requires, answered the way the wizard answers it:
  // the two markers the blueprint and the policy-pack steps leave behind.
  await harness.settingsService.setSettingValue(
    settingKeys.privateInstallBlueprint,
    'itServiceDesk',
    { reason: 'install_wizard', actorUserId: harness.actorUserId },
  );
  await harness.settingsService.setSettingValue(
    settingKeys.privateInstallPolicyPack,
    'itStandard',
    { reason: 'install_wizard', actorUserId: harness.actorUserId },
  );
  return harness;
}

async function deferEverythingOptional(
  harness: Awaited<ReturnType<typeof createInstallWizardHarness>>,
): Promise<void> {
  await harness.skipService.skip('team');
  await harness.skipService.skip('slaReview');
  for (const stepKey of installSectionStepKeys) {
    await harness.skipService.skip(stepKey);
  }
  await harness.skipService.skip('securityRecommendations');
}

describe('the Full package walked with „Podesi kasnije“', () => {
  it('is ready, with the deferred sections on the post-install checklist', async () => {
    const harness = await createFullHarness();
    await deferEverythingOptional(harness);

    const readiness = await harness.readinessService.check();
    expect(readiness.isReady).toBe(true);
    expect(readMissingReadinessKeys(readiness.checks)).toEqual([]);
    // `skipped` is not `missing`: the installation may finish, and the checklist
    // still knows what the operator pushed to later.
    expect(readiness.checks.find((entry) => entry.key === 'profileSteps')).toMatchObject({
      status: 'skipped',
      stepKeys: ['team', 'slaReview', ...installSectionStepKeys, 'securityRecommendations'],
    });
  });

  it('offers every section, requires none and blocks on nothing', async () => {
    const harness = await createFullHarness();
    await deferEverythingOptional(harness);

    const status = await harness.setupService.getStatus();
    const states = status.steps ?? {};
    const sectionSteps = [...installSectionStepKeys, 'securityRecommendations'] as const;

    expect(sectionSteps.map((stepKey) => states[stepKey])).toEqual(
      sectionSteps.map(() => ({
        completed: false,
        skipped: true,
        required: false,
        offered: true,
        blocking: false,
        skippable: true,
      })),
    );
    // Nothing else is in the way either, so the wizard reaches the final screen.
    expect(Object.values(states).filter((state) => state.blocking)).toEqual([]);
  });
});
