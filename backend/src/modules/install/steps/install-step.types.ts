/**
 * Install wizard v2 (F1): the wizard used to be a hard-coded chain inside
 * `install-setup.service.ts`. A step is now a declaration — which packages
 * require it, which merely offer it, whether "Podesi kasnije" is allowed — and
 * the next step is computed from the registry plus the selected package.
 */
export type InstallProfile = 'minimum' | 'standard' | 'full';

export const installProfiles: readonly InstallProfile[] = [
  'minimum',
  'standard',
  'full',
];

import type { InstallSectionStepKey } from '../sections/install-settings-section.keys';

/** Steps that own a saved state; `complete` is the final screen, not a step. */
export type InstallStepKey =
  | 'profile'
  | 'superAdmin'
  | 'identity'
  | 'loginProvider'
  | 'smtp'
  | 'seed'
  | 'team'
  // F4: Standard/Full content — catalog from a blueprint, the IT policy pack and
  // the SLA review. Minimum keeps the single service the seed step created.
  | 'blueprint'
  | 'policyPack'
  | 'slaReview'
  // F5: one step per settings section of the Full package (`section.<key>`), plus
  // the security-recommendations panel Standard and Full share. All of them are
  // offered, never required, and every one may be deferred.
  | InstallSectionStepKey
  | 'securityRecommendations'
  | 'addons'
  // F6.1: the last screen before the end of the wizard. It owns no marker — the
  // step is done exactly while the readiness checks are green, so a stale flag
  // cannot declare an installation ready that is not.
  | 'provisioning';

export type InstallWizardStepKey = InstallStepKey | 'complete';

export type InstallStepDefinition = {
  readonly key: InstallStepKey;
  /** Ascending wizard position; new phases append their steps between seed and complete. */
  readonly order: number;
  readonly requiredIn: readonly InstallProfile[];
  readonly offeredIn: readonly InstallProfile[];
  /** May the operator defer this step with "Podesi kasnije"? */
  readonly skippable: boolean;
  /**
   * Settings the step owns whose removal is harmless when a package change
   * drops the step (flags and install bookkeeping). Credentials, imported data
   * and identity records never belong here — a downgrade must not erase what
   * the installation still needs.
   */
  readonly resettableSettingKeys: readonly string[];
};

export type InstallStepProgress = {
  readonly completed: boolean;
  readonly skipped: boolean;
};

export type InstallStepProgressMap = Readonly<Record<InstallStepKey, InstallStepProgress>>;

export type InstallStepState = InstallStepProgress & {
  /** Required by the package in effect (which defaults to `minimum`). */
  readonly required: boolean;
  /** Present in the wizard of the package in effect. */
  readonly offered: boolean;
  /**
   * Still in the way of the final screen: contained in the package, neither
   * completed nor deferred. The wizard's next step is the first blocking step.
   */
  readonly blocking: boolean;
  /**
   * F3: may the operator defer this step? The shell shows „Podesi kasnije“ from
   * this flag instead of keeping its own list of deferrable steps.
   */
  readonly skippable: boolean;
};

export type InstallStepStates = Readonly<Record<InstallStepKey, InstallStepState>>;

export function isInstallProfile(value: unknown): value is InstallProfile {
  return typeof value === 'string' && installProfiles.includes(value as InstallProfile);
}

/** Package order: every package contains the previous one (owner decision D1). */
export function installProfileRank(profile: InstallProfile): number {
  return installProfiles.indexOf(profile);
}

export function isPackageDowngrade(
  from: InstallProfile | null,
  to: InstallProfile,
): boolean {
  return installProfileRank(to) < installProfileRank(from ?? 'minimum');
}

/**
 * The one place that answers "is this step still in the way?" — the status
 * endpoint, the next-step resolver and the readiness check all read the same
 * answer instead of re-deriving it from their own copy of the rules.
 *
 * F3: the package step is the first thing the wizard asks for (§4 lists „Izbor
 * paketa“ as required in all three packages), so an installation without a
 * stored package cannot reach the final screen. F1 kept the package step
 * non-blocking while no package was stored because the picker did not exist
 * yet; the screen now exists, and the hedge moved to the callers that need a
 * package to work with (`profile ?? 'minimum'` is still the profile in effect).
 */
export function isInstallStepBlocking(input: {
  readonly definition: InstallStepDefinition;
  readonly profile: InstallProfile | null;
  readonly completed: boolean;
  readonly skipped: boolean;
}): boolean {
  if (input.completed || input.skipped) {
    return false;
  }
  return isStepIncludedInProfile(input.definition, input.profile ?? 'minimum');
}

export function isStepIncludedInProfile(
  definition: InstallStepDefinition,
  profile: InstallProfile,
): boolean {
  return (
    definition.requiredIn.includes(profile) || definition.offeredIn.includes(profile)
  );
}
