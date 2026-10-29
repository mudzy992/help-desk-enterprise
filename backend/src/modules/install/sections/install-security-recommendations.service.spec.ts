import { settingKeys } from '../../settings/setting-keys';
import { createInstallWizardHarness } from '../create-install-wizard-harness';
import { InstallSecurityRecommendationsService } from './install-security-recommendations.service';
import { installSettingsSectionConstants } from './install-settings-section.constants';

/**
 * F5 + owner decision 7: „Primijeni preporuke za produkciju“. The panel states
 * what is missing, one action writes the agreed values, and the captcha is
 * deliberately never written — switching it on without Turnstile keys would lock
 * everybody out of the sign-in page.
 */
async function createRecommendationHarness(withSuperAdmin = true) {
  const harness = await createInstallWizardHarness({ withSuperAdmin });
  return {
    ...harness,
    service: new InstallSecurityRecommendationsService(
      harness.prisma,
      harness.settingsService,
      harness.registry,
    ),
  };
}

describe('InstallSecurityRecommendationsService', () => {
  it('reports every recommendation with its current state', async () => {
    const harness = await createRecommendationHarness();
    const status = await harness.service.getStatus();

    expect(status.recommendations.map((entry) => entry.key)).toEqual([
      settingKeys.privateAuthMfaRequiredForAdmins,
      settingKeys.privateAuthMfaAllowOptional,
      settingKeys.privateSecurityHibpEnabled,
      settingKeys.privateSecuritySessionIdleTimeoutSeconds,
      settingKeys.privateSecurityCaptchaProvider,
    ]);
    // HIBP is on by default (owner decision, 2026-10-09) — the panel says so
    // instead of claiming work that is already done.
    expect(
      status.recommendations.find(
        (entry) => entry.key === settingKeys.privateSecurityHibpEnabled,
      )?.isApplied,
    ).toBe(true);
    // The idle window ships at 0 (disabled) and the recommendation is 1800 s.
    expect(
      status.recommendations.find(
        (entry) => entry.key === settingKeys.privateSecuritySessionIdleTimeoutSeconds,
      )?.isApplied,
    ).toBe(false);
    expect(status.canApply).toBe(true);
    expect(status.answered).toBe(false);
    // The captcha line carries no value to write, only the reason it waits.
    expect(
      status.recommendations.find(
        (entry) => entry.key === settingKeys.privateSecurityCaptchaProvider,
      ),
    ).toMatchObject({ recommendedValue: null, isApplied: false });
  });

  it('writes the agreed values, the marker and nothing else', async () => {
    const harness = await createRecommendationHarness();
    const applied = await harness.service.apply();

    expect(applied.answered).toBe(true);
    expect(applied.canApply).toBe(false);
    expect(
      harness.readStored(settingKeys.privateAuthMfaRequiredForAdmins)?.value,
    ).toBe(true);
    expect(harness.readStored(settingKeys.privateAuthMfaAllowOptional)?.value).toBe(
      true,
    );
    expect(
      harness.readStored(settingKeys.privateSecuritySessionIdleTimeoutSeconds)?.value,
    ).toBe(1800);
    // The captcha stays exactly as the deployment had it.
    expect(harness.readStored(settingKeys.privateSecurityCaptchaProvider)).toBeUndefined();
    expect(
      harness.settingsMemory.changeLogs
        .filter((entry) => entry.entityId === settingKeys.privateAuthMfaRequiredForAdmins)
        .map((entry) => entry.reason),
    ).toEqual([installSettingsSectionConstants.changeLogReason]);
  });

  it('counts a provider the deployment configured itself as in place', async () => {
    const harness = await createRecommendationHarness();
    await harness.settingsService.setSettingValue(
      settingKeys.privateSecurityCaptchaProvider,
      'turnstile',
      { reason: 'test', actorUserId: harness.actorUserId },
    );

    const status = await harness.service.getStatus();
    expect(
      status.recommendations.find(
        (entry) => entry.key === settingKeys.privateSecurityCaptchaProvider,
      )?.isApplied,
    ).toBe(true);
  });

  it('refuses to apply anything before the founder account exists', async () => {
    const harness = await createRecommendationHarness(false);
    await expect(harness.service.apply()).rejects.toMatchObject({
      status: 409,
      response: { code: 'SUPER_ADMIN_REQUIRED' },
    });
  });
});
