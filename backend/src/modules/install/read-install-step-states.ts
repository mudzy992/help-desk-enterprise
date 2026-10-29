import type { PrismaService } from '../../common/prisma/prisma.service';
import { settingKeys } from '../settings/setting-keys';
import type { SettingsService } from '../settings/settings.service';
import { findInstallSuperAdmin } from './find-install-super-admin';
import { hasSavedInstallAddons } from './has-saved-install-addons';
import {
  isLoginProviderSaved,
  readInstallLoginProviderStatus,
} from './read-install-login-provider-status';
import { readInstallIdentityStatus } from './read-install-identity-status';
import { readInstallSeedStatus } from './read-install-seed-status';
import { readInstallTeamStatus } from './read-install-team-status';
import { readInstallSmtpEnvPrefill } from './read-install-smtp-env-prefill';
import { readInstallSmtpStatus } from './read-install-smtp-status';
import { installStepSavedKeys } from '../settings/setting-keys';
import {
  installStepDefinitionByKey,
  resolveInstallStepSavedKey,
  resolveInstallStepSkippedKey,
} from './steps/install-step.registry';
import {
  isInstallProfile,
  isInstallStepBlocking,
  type InstallProfile,
  type InstallStepKey,
  type InstallStepProgress,
  type InstallStepProgressMap,
  type InstallStepStates,
} from './steps/install-step.types';

export type InstallStepProgressSnapshot = {
  readonly profile: InstallProfile | null;
  readonly progress: InstallStepProgressMap;
};

/**
 * Install wizard v2 (F1): this is where the per-step status reads used to live
 * inside `install-setup.service.ts`. One read per step; the status endpoint,
 * the package service and the readiness check all consume the same result.
 */
export async function readInstallStepProgress(
  prisma: PrismaService,
  settingsService: SettingsService,
): Promise<InstallStepProgressSnapshot> {
  const [
    superAdmin,
    identity,
    loginProvider,
    authModeStored,
    smtp,
    seed,
    team,
    blueprintApplied,
    policyPackApplied,
    slaReviewDone,
    addonsSaved,
    profile,
    skipped,
    savedSteps,
  ] = await Promise.all([
    findInstallSuperAdmin(prisma),
    readInstallIdentityStatus(settingsService),
    readInstallLoginProviderStatus(settingsService),
    // Readiness `authMode` needs a *stored* value; the settings default is
    // `local`, and that must not mark the step done before the operator saves.
    settingsService.hasStoredValue(settingKeys.privateAuthMode),
    readInstallSmtpStatus(settingsService, readInstallSmtpEnvPrefill()),
    readInstallSeedStatus(prisma),
    readInstallTeamStatus(prisma),
    hasStoredInstallMarker(settingsService, settingKeys.privateInstallBlueprint),
    hasStoredInstallMarker(settingsService, settingKeys.privateInstallPolicyPack),
    hasStoredInstallMarker(settingsService, settingKeys.privateInstallSlaReview),
    hasSavedInstallAddons(settingsService),
    readInstallProfile(settingsService),
    readInstallSkippedSteps(settingsService),
    readInstallSavedSteps(settingsService),
  ]);
  const progress = {
    // The package step counts as done as soon as a package is stored; while none
    // is stored it is offered, not blocking (`resolve-install-next-step`).
    profile: { completed: profile !== null, skipped: skipped.profile },
    superAdmin: { completed: superAdmin !== null, skipped: skipped.superAdmin },
    // F2: the identity step is done once the organisation name is stored —
    // the same value the sign-in page reads.
    identity: { completed: identity.isConfigured, skipped: skipped.identity },
    loginProvider: {
      completed: authModeStored && isLoginProviderSaved(loginProvider),
      skipped: skipped.loginProvider,
    },
    smtp: { completed: smtp.isConfigured, skipped: skipped.smtp },
    seed: { completed: seed.isSeeded, skipped: skipped.seed },
    // F2: the founder alone does not answer the team step; inviting somebody
    // (or deferring the step) does.
    team: { completed: team.isTeamInvited, skipped: skipped.team },
    // F4: the three content steps record what the wizard did (the blueprint and
    // the pack that were applied, the SLA review that was confirmed) — the same
    // "stored marker means done" rule the add-ons step uses.
    blueprint: {
      completed: blueprintApplied,
      skipped: skipped.blueprint,
    },
    policyPack: {
      completed: policyPackApplied,
      skipped: skipped.policyPack,
    },
    slaReview: { completed: slaReviewDone, skipped: skipped.slaReview },
    addons: { completed: addonsSaved, skipped: skipped.addons },
    // F6.1: the readiness screen owns no marker and is never reported as done
    // here — it is the wizard's last stop, and the installation being finished is
    // what ends it (`completedStatus` reports every registry step as done then).
    // Deriving it from the readiness checks would let the wizard walk straight
    // past the screen that is supposed to show them.
    provisioning: { completed: false, skipped: skipped.provisioning },
  } as Record<InstallStepKey, InstallStepProgress>;
  // F5: a section — and the security-recommendations step — is answered when its
  // own save wrote the marker. Nothing is derived from the section's settings: an
  // operator may answer a section without changing a key, and a key may already
  // carry a value from an earlier installation.
  for (const [stepKey, completed] of Object.entries(savedSteps)) {
    const key = stepKey as InstallStepKey;
    progress[key] = { completed, skipped: skipped[key] === true };
  }
  return { profile, progress };
}

/** F5: which of the new steps the operator answered (`steps.<step>.saved`). */
async function readInstallSavedSteps(
  settingsService: SettingsService,
): Promise<Readonly<Record<string, boolean>>> {
  const stepKeys = Object.keys(installStepSavedKeys) as (keyof typeof installStepSavedKeys)[];
  const entries = await Promise.all(
    stepKeys.map(
      async (stepKey) =>
        [
          stepKey,
          (await settingsService.getSetting(resolveInstallStepSavedKey(stepKey))) === true,
        ] as const,
    ),
  );
  return Object.fromEntries(entries);
}

/**
 * F4: „done“ for the content steps is a marker the step itself wrote. An empty
 * value is not a marker — `private.install.*` keys exist with defaults.
 */
async function hasStoredInstallMarker(
  settingsService: SettingsService,
  key: string,
): Promise<boolean> {
  const stored = await settingsService.getSetting(key);
  return typeof stored === 'string' && stored.trim().length > 0;
}

export async function readInstallProfile(
  settingsService: SettingsService,
): Promise<InstallProfile | null> {
  const stored = await settingsService.getSetting(settingKeys.privateInstallProfile);
  return isInstallProfile(stored) ? stored : null;
}

export async function readInstallSkippedSteps(
  settingsService: SettingsService,
): Promise<Readonly<Record<InstallStepKey, boolean>>> {
  const keys = Object.keys(installStepDefinitionByKey) as InstallStepKey[];
  const entries = await Promise.all(
    keys.map(
      async (stepKey) =>
        [
          stepKey,
          (await settingsService.getSetting(resolveInstallStepSkippedKey(stepKey))) === true,
        ] as const,
    ),
  );
  return Object.fromEntries(entries) as Record<InstallStepKey, boolean>;
}

/** F1: merges the registry flags (required/offered) into the raw progress. */
export function toInstallStepStates(
  profile: InstallProfile | null,
  progress: InstallStepProgressMap,
): InstallStepStates {
  const effectiveProfile = profile ?? 'minimum';
  const states = {} as Record<InstallStepKey, InstallStepStates[InstallStepKey]>;
  for (const [stepKey, definition] of Object.entries(installStepDefinitionByKey)) {
    const key = stepKey as InstallStepKey;
    const { completed, skipped } = progress[key];
    states[key] = {
      completed,
      skipped,
      required: definition.requiredIn.includes(effectiveProfile),
      offered: definition.offeredIn.includes(effectiveProfile),
      skippable: definition.skippable,
      blocking: isInstallStepBlocking({
        definition,
        profile,
        completed,
        skipped,
      }),
    };
  }
  return states;
}
