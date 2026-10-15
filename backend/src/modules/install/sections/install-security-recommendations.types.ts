import type { SettingValue } from '../../settings/settings.types';

/**
 * F5: one line of the „Preporučeno za produkciju“ panel. `recommendedValue: null`
 * marks a recommendation the wizard never applies itself (see
 * `install-security-recommendations.ts`).
 */
export type InstallSecurityRecommendationStatus = {
  readonly key: string;
  readonly titleKey: string;
  readonly helpKey: string;
  readonly recommendedValue: SettingValue | null;
  readonly currentValue: SettingValue | null;
  readonly isApplied: boolean;
};

export type InstallSecurityRecommendationsStatus = {
  readonly recommendations: readonly InstallSecurityRecommendationStatus[];
  /** At least one recommendation the wizard may write is still not in place. */
  readonly canApply: boolean;
  /** The operator already used „Primijeni preporuke“ (or left the panel). */
  readonly answered: boolean;
};
