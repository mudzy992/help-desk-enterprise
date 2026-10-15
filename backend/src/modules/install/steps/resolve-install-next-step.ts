import { installStepDefinitions } from './install-step.registry';
import type {
  InstallProfile,
  InstallStepDefinition,
  InstallStepStates,
  InstallWizardStepKey,
} from './install-step.types';

export type ResolveInstallNextStepInput = {
  readonly profile: InstallProfile | null;
  readonly states: InstallStepStates;
  /** Overridable so a package that adds steps (F2–F5) can be tested in isolation. */
  readonly definitions?: readonly InstallStepDefinition[];
};

/**
 * Install wizard v2: the next step is the first step of the package in effect
 * that is neither completed nor deferred.
 *
 * F3: while no package is chosen the profile in effect is still `minimum`
 * (`profile ?? 'minimum'`), but the `profile` step itself now blocks — the
 * package is the wizard's first question, and `e2e/helpers/ensure-install.ts`
 * selects one explicitly.
 */
export function resolveInstallNextStep(
  input: ResolveInstallNextStepInput,
): InstallWizardStepKey {
  const definitions = [...(input.definitions ?? installStepDefinitions)].sort(
    (left, right) => left.order - right.order,
  );
  for (const definition of definitions) {
    // Whether a step is still in the way is decided once, when the states are
    // built (`toInstallStepStates` → `isInstallStepBlocking`).
    if (input.states[definition.key]?.blocking === true) {
      return definition.key;
    }
  }
  return 'complete';
}

