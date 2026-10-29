import {
  installStepDefinitionByKey,
  resolveInstallStepSkippedKey,
} from './steps/install-step.registry';
import {
  isStepIncludedInProfile,
  type InstallProfile,
  type InstallStepDefinition,
  type InstallStepKey,
} from './steps/install-step.types';

export type InstallProfileResetPlan = {
  /** "Podesi kasnije" flags of steps the new package no longer contains. */
  readonly clearSkippedKeys: readonly string[];
  /** Step-owned settings whose removal is harmless (registry-declared only). */
  readonly resetSettingKeys: readonly string[];
  readonly droppedStepKeys: readonly InstallStepKey[];
  /**
   * IN19: steps the new package requires and the previous one merely offered.
   * A deferral made under the old package is not an answer to the new one, so
   * the wizard asks again — the flag is dropped and the step comes back into
   * the flow. Steps that were already required keep whatever the operator chose.
   */
  readonly reopenedStepKeys: readonly InstallStepKey[];
};

/**
 * Install wizard v2 (F1) + owner decision 5: a package may change as long as the
 * operator is back on the package step. Everything the **new** package does not
 * contain is reset — but only state the registry explicitly allows to be dropped
 * (skipped flags, add-on flags). Steps that stay in both packages keep their
 * state, and credentials, identity records and seeded data are never touched.
 *
 * IN19 (F3 review): "included in both packages" is not the whole story — a step
 * that the new package *requires* after being optional is reopened, because the
 * deferral was a decision about the old package. The plan reports those steps
 * separately so the wizard can say why the step is suddenly in the way again.
 */
export function planInstallProfileReset(input: {
  readonly nextProfile: InstallProfile;
  /** The package in effect before the change; `null` means none was chosen yet. */
  readonly previousProfile?: InstallProfile | null;
  readonly definitions?: readonly InstallStepDefinition[];
}): InstallProfileResetPlan {
  const definitions =
    input.definitions ?? Object.values(installStepDefinitionByKey);
  const previousProfile = input.previousProfile ?? 'minimum';
  const clearSkippedKeys: string[] = [];
  const resetSettingKeys: string[] = [];
  const droppedStepKeys: InstallStepKey[] = [];
  const reopenedStepKeys: InstallStepKey[] = [];
  for (const definition of definitions) {
    if (!isStepIncludedInProfile(definition, input.nextProfile)) {
      // F5: only a step the **previous** package contained can be lost. Until
      // every package had the same content the two questions were the same one;
      // now that Full carries eleven steps Standard does not have, an upgrade
      // would otherwise „drop“ steps that were never in the flow — and clear
      // markers that do not exist. The state a package change may reset is the
      // state of a step the operator actually had.
      if (isStepIncludedInProfile(definition, previousProfile)) {
        droppedStepKeys.push(definition.key);
        clearSkippedKeys.push(resolveInstallStepSkippedKey(definition.key));
        resetSettingKeys.push(...definition.resettableSettingKeys);
      }
      continue;
    }
    if (
      definition.requiredIn.includes(input.nextProfile) &&
      !definition.requiredIn.includes(previousProfile)
    ) {
      reopenedStepKeys.push(definition.key);
    }
  }
  // One step key appears at most once in every list. The registry cannot declare
  // a step twice, but a caller that passes its own `definitions` (the specs, and
  // the F4 consistency guard) must get the same deterministic answer either way —
  // the old comment claimed this and the code only did it for the settings.
  return {
    clearSkippedKeys: [...new Set(clearSkippedKeys)],
    resetSettingKeys: [...new Set(resetSettingKeys)],
    droppedStepKeys: [...new Set(droppedStepKeys)],
    reopenedStepKeys: [...new Set(reopenedStepKeys)],
  };
}
