import { settingKeys } from '../settings/setting-keys';
import { createInstallWizardHarness } from './create-install-wizard-harness';
import { readMissingReadinessKeys } from './evaluate-install-readiness';

/** Everything `POST /install/complete` needs, in the order the wizard walks it. */
async function createReadyHarness() {
  const harness = await createInstallWizardHarness();
  harness.memory.seedSlaProfile({
    id: 'sla-default',
    key: 'default',
    name: 'Default',
    isActive: true,
  });
  // F3: the package is the wizard's first question, so a ready installation has
  // one stored; Minimum is the package that may run without a team.
  await harness.profileService.save({ profile: 'minimum' });
  await harness.saveAuthMode('local');
  await harness.saveIdentity();
  await harness.saveSmtp();
  await harness.seedMinimum();
  // F2 acceptance: Minimum finishes without a team, because the step may be
  // deferred; the founder is already a member of the handler group.
  await harness.skipService.skip('team');
  await harness.addonsService.save({ addons: { csat: true } });
  return harness;
}

/** Standard makes SMTP mandatory, which is the step the operator may defer. */
async function createStandardHarness(smtpDeferred: boolean) {
  const harness = await createInstallWizardHarness();
  harness.memory.seedSlaProfile({
    id: 'sla-default',
    key: 'default',
    name: 'Default',
    isActive: true,
  });
  await harness.saveAuthMode('local');
  await harness.saveIdentity();
  await harness.seedMinimum();
  await harness.addonsService.save({ addons: { csat: true } });
  await harness.profileService.save({ profile: 'standard' });
  // F4: Standard also asks for the catalog and the policy pack (required) and for
  // the SLA review (offered, so deferrable). The two tests below are about the
  // SMTP step, so the harness answers the F4 steps the way the wizard would —
  // exactly the markers `readInstallStepProgress` reads back.
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
  await harness.skipService.skip('slaReview');
  // F5: Standard offers the security-recommendations panel too; the harness
  // answers it the way the wizard would, so the SMTP step is what is under test.
  await harness.skipService.skip('securityRecommendations');
  await harness.skipService.skip('team');
  if (smtpDeferred) {
    await harness.skipService.skip('smtp');
  }
  return harness;
}

describe('InstallReadinessService', () => {
  it('refuses a fresh installation and names every unmet requirement', async () => {
    const harness = await createInstallWizardHarness({ withSuperAdmin: false });
    const readiness = await harness.readinessService.check();

    expect(readiness.isReady).toBe(false);
    expect(readMissingReadinessKeys(readiness.checks)).toEqual([
      'superAdmin',
      'authMode',
      'organizationalUnit',
      'handlerGroup',
      'service',
      'routing',
      'slaProfile',
      'roles',
      'profileSteps',
    ]);
    expect(readiness.profile).toBeNull();
  });

  it('is ready once the seeded installation can receive tickets', async () => {
    const harness = await createReadyHarness();
    const readiness = await harness.readinessService.check();

    expect(readiness.isReady).toBe(true);
    // F2: a deferred step is answered, so `skipped` is allowed here — only
    // `missing` would block the final screen.
    expect(
      readiness.checks.filter((entry) => entry.status !== 'ok'),
    ).toEqual([
      {
        key: 'profileSteps',
        status: 'skipped',
        messageKey: 'install.readiness.profileSteps',
        stepKeys: ['team'],
      },
    ]);
    expect(
      readiness.checks.find((entry) => entry.key === 'slaProfile')?.status,
    ).toBe('ok');
  });

  it('does not ask Minimum for a team the installation may configure later', async () => {
    const harness = await createReadyHarness();
    const readiness = await harness.readinessService.check();

    expect(readiness.profile).toBe('minimum');
    expect(readiness.states.team).toMatchObject({
      completed: false,
      skipped: true,
      blocking: false,
    });
  });

  it('keeps readiness red while the seeded service has no SLA profile', async () => {
    // F2: `slaProfile` used to pass on any active profile in the deployment;
    // the first ticket still needs a clock on the service itself.
    const harness = await createInstallWizardHarness();
    await harness.saveAuthMode('local');
    await harness.saveIdentity();
    await harness.saveSmtp();
    await harness.seedMinimum();
    harness.memory.seedSlaProfile({
      id: 'sla-late',
      key: 'STANDARD_REQUEST',
      name: 'Standard request',
      isActive: true,
    });

    const readiness = await harness.readinessService.check();
    expect(readiness.isReady).toBe(false);
    expect(
      readiness.checks.find((entry) => entry.key === 'slaProfile')?.status,
    ).toBe('missing');
  });

  it('treats a deferred required step as answered but not as green', async () => {
    const readiness = await (await createStandardHarness(true)).readinessService.check();

    expect(readiness.isReady).toBe(true);
    expect(
      readiness.checks.find((entry) => entry.key === 'profileSteps'),
    ).toEqual({
      key: 'profileSteps',
      status: 'skipped',
      messageKey: 'install.readiness.profileSteps',
      // Standard also asks for the team, which the harness deferred; the SLA
      // review (F4) and the security recommendations (F5) are offered rather
      // than required, and both are deferred too. The sections of the Full
      // package are not part of Standard, so they are not listed.
      stepKeys: ['smtp', 'team', 'slaReview', 'securityRecommendations'],
    });
  });

  it('blocks when a required step was neither done nor deferred', async () => {
    const readiness = await (await createStandardHarness(false)).readinessService.check();

    expect(readiness.isReady).toBe(false);
    expect(readMissingReadinessKeys(readiness.checks)).toEqual(['profileSteps']);
    expect(
      readiness.checks.find((entry) => entry.key === 'profileSteps'),
    ).toMatchObject({ status: 'missing', stepKeys: ['smtp'] });
  });

  it('keeps the public answer free of internal wizard state', async () => {
    const harness = await createReadyHarness();
    const status = await harness.readinessService.getStatus();
    expect(Object.keys(status).sort()).toEqual(['checks', 'isReady']);
  });
});
