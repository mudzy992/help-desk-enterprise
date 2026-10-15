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
import {
  installStepDefinitionByKey,
  resolveInstallStepSkippedKey,
} from './steps/install-step.registry';
import {
  isInstallProfile,
  isInstallStepBlocking,
  type InstallProfile,
  type InstallStepKey,
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
    smtp,
    seed,
    team,
    blueprintApplied,
    policyPackApplied,
    slaReviewDone,
    addonsSaved,
    profile,
    skipped,
  ] = await Promise.all([
    findInstallSuperAdmin(prisma),
    readInstallIdentityStatus(settingsService),
    readInstallLoginProviderStatus(settingsService),
    readInstallSmtpStatus(settingsService, readInstallSmtpEnvPrefill()),
    readInstallSeedStatus(prisma),
    readInstallTeamStatus(prisma),
    hasStoredInstallMarker(settingsService, settingKeys.privateInstallBlueprint),
    hasStoredInstallMarker(settingsService, settingKeys.privateInstallPolicyPack),
    hasStoredInstallMarker(settingsService, settingKeys.privateInstallSlaReview),
    hasSavedInstallAddons(settingsService),
    readInstallProfile(settingsService),
    readInstallSkippedSteps(settingsService),
  ]);
  return {
    profile,
    progress: {
      // The package step counts as done as soon as a package is stored; while
      // none is stored it is offered, not blocking (`resolve-install-next-step`).
      profile: { completed: profile !== null, skipped: skipped.profile },
      superAdmin: { completed: superAdmin !== null, skipped: skipped.superAdmin },
      // F2: the identity step is done once the organisation name is stored —
      // the same value the sign-in page reads.
      identity: { completed: identity.isConfigured, skipped: skipped.identity },
      loginProvider: {
        completed: isLoginProviderSaved(loginProvider),
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
    },
  };
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
          (await settingsService.getSetting(resolveInstallStepSkippedKey(stepKey))) ===
            true,
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
