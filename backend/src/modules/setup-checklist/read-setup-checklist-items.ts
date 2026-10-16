import type { InstallSecurityRecommendationsStatus } from '../install/sections/install-security-recommendations.types';
import { listInstallStepDefinitions } from '../install/steps/install-step.registry';
import type { InstallStepStates } from '../install/steps/install-step.types';
import type { SetupChecklistItem } from './setup-checklist.types';

/**
 * Install wizard v2 (F6.3): what is still open after the installation. Two
 * families, both read from state the product already keeps:
 *
 * - a step the operator deferred („Podesi kasnije“) — it stays on the list until
 *   the step's own state reads `completed`, which is what makes the item vanish
 *   when the thing behind it is configured;
 * - a production recommendation that is not in place yet (F5, owner decision 7).
 *
 * Nothing here writes or remembers anything: the list is a view over the same
 * reads the wizard and the settings screen use.
 */
export function buildSetupChecklistItems(input: {
  readonly states: InstallStepStates;
  readonly recommendations: InstallSecurityRecommendationsStatus;
}): readonly SetupChecklistItem[] {
  return [...readDeferredSteps(input.states), ...readOpenRecommendations(input.recommendations)];
}

function readDeferredSteps(states: InstallStepStates): readonly SetupChecklistItem[] {
  return listInstallStepDefinitions()
    .filter((definition) => {
      const state = states[definition.key];
      return state.skipped === true && state.completed !== true;
    })
    .map((definition) => ({
      key: `step.${definition.key}`,
      kind: 'step' as const,
      targetKey: definition.key,
      // The wizard's own name for the step, so the dashboard and the rail agree.
      titleKey: `dashboard.setupChecklist.item.${definition.key}`,
    }));
}

function readOpenRecommendations(
  status: InstallSecurityRecommendationsStatus,
): readonly SetupChecklistItem[] {
  return status.recommendations
    .filter((entry) => !entry.isApplied)
    .map((entry) => ({
      key: `recommendation.${entry.key}`,
      kind: 'recommendation' as const,
      targetKey: entry.key,
      titleKey: entry.titleKey,
      helpKey: entry.helpKey,
    }));
}
