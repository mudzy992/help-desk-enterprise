import type { SettingsService } from '../../settings/settings.service';
import type { SettingValue } from '../../settings/settings.types';
import { resolveInstallStepSavedKey } from '../steps/install-step.registry';
import {
  installSecurityRecommendations,
  type InstallSecurityRecommendation,
} from './install-security-recommendations';
import type { InstallSecurityRecommendationsStatus } from './install-security-recommendations.types';

/**
 * F5: what the panel shows. Every recommendation is compared against the value
 * the deployment has right now — reading goes through `SettingsService`, so a
 * secret (none of the recommended keys is one, but the rule holds for the next
 * entry) would come back redacted instead of readable.
 */
export async function readInstallSecurityRecommendations(
  settingsService: SettingsService,
): Promise<InstallSecurityRecommendationsStatus> {
  const [values, answered] = await Promise.all([
    Promise.all(
      installSecurityRecommendations.map(
        async (entry) => [entry.key, await settingsService.getSetting(entry.key)] as const,
      ),
    ),
    settingsService.getSetting(resolveInstallStepSavedKey('securityRecommendations')),
  ]);
  const byKey = new Map(values);
  const recommendations = installSecurityRecommendations.map((entry) => {
    const currentValue = byKey.get(entry.key) ?? null;
    return {
      key: entry.key,
      titleKey: entry.titleKey,
      helpKey: entry.helpKey,
      recommendedValue: entry.recommendedValue,
      currentValue,
      isApplied: isRecommendationApplied(entry, currentValue),
    };
  });
  return {
    recommendations,
    canApply: recommendations.some((entry) => entry.recommendedValue !== null && !entry.isApplied),
    answered: answered === true,
  };
}

function isRecommendationApplied(
  entry: InstallSecurityRecommendation,
  currentValue: SettingValue | null,
): boolean {
  if (entry.recommendedValue === null) {
    // „Nothing for the wizard to write“ — the recommendation counts as in place
    // once the deployment configured the provider itself.
    return currentValue !== null && currentValue !== '' && currentValue !== 'none';
  }
  return currentValue === entry.recommendedValue;
}
