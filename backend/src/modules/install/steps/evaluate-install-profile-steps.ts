import { installReadinessMessageKey } from '../evaluate-install-readiness';
import type { InstallReadinessCheck } from '../evaluate-install-readiness';
import { listInstallStepDefinitions } from './install-step.registry';
import type { InstallStepDefinition, InstallStepKey, InstallStepStates } from './install-step.types';

/**
 * Install wizard v2 (F1): `profileSteps` from overview §3 — nothing the selected
 * package still asks for is left unanswered.
 *
 * F6.1: the readiness screen is left out. It is not a step the package asks for
 * but the gate this check feeds: it reports itself as unfinished until the
 * installation is finished, so counting it here would make readiness impossible
 * to reach.
 *
 * Whether a step is in the way is decided once, in `isInstallStepBlocking`,
 * which the next-step resolver reads too; this check only groups the result.
 *
 * `ok`      — nothing outstanding;
 * `skipped` — outstanding items exist but the operator deferred them, which D4
 *             allows; it does **not** block completion, it only feeds the
 *             post-install checklist;
 * `missing` — a step of the package is neither done nor deferred; blocks
 *             completion (`POST /install/complete` → `INSTALL_NOT_READY`).
 */
/** F6.1: steps that gate readiness instead of being checked by it. */
const readinessGateStepKeys: readonly InstallStepKey[] = ['provisioning'];

export function evaluateInstallProfileSteps(input: {
  readonly states: InstallStepStates;
  readonly definitions?: readonly InstallStepDefinition[];
}): InstallReadinessCheck {
  const definitions = (input.definitions ?? listInstallStepDefinitions()).filter(
    (definition) => !readinessGateStepKeys.includes(definition.key),
  );
  const missingSteps: InstallStepKey[] = [];
  const skippedSteps: InstallStepKey[] = [];
  for (const definition of definitions) {
    const state = input.states[definition.key];
    if (state.completed) {
      continue;
    }
    if (state.skipped) {
      skippedSteps.push(definition.key);
      continue;
    }
    if (state.blocking) {
      missingSteps.push(definition.key);
    }
  }
  if (missingSteps.length > 0) {
    return {
      key: 'profileSteps',
      status: 'missing',
      messageKey: installReadinessMessageKey('profileSteps'),
      stepKeys: missingSteps,
    };
  }
  return {
    key: 'profileSteps',
    status: skippedSteps.length > 0 ? 'skipped' : 'ok',
    messageKey: installReadinessMessageKey('profileSteps'),
    ...(skippedSteps.length > 0 ? { stepKeys: skippedSteps } : {}),
  };
}
