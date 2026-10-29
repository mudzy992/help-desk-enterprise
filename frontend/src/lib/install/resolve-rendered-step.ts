import { installWizardSteps } from "@/lib/install/install-wizard-order";
import type { InstallStepKey, InstallStepState, InstallWizardStep } from "@/services/install-api";

/**
 * Every step the shell can draw. Sourced from the wizard order so Standard/Full
 * steps (blueprint, policy pack, sections, …) are never treated as foreign and
 * bounced to a later blocker like provisioning.
 */
export const renderableInstallSteps = installWizardSteps;

export type RenderedInstallStep = InstallWizardStep;

function isRenderable(step: InstallWizardStep | undefined): step is InstallWizardStep {
  return step !== undefined && (installWizardSteps as readonly string[]).includes(step);
}

/**
 * F0.3: the shell no longer guesses. It shows the step the server reports as
 * next; if the answer were a step this shell cannot draw, it falls back to the
 * first step the package still blocks on — never to a blind `superAdmin`.
 */
export function resolveRenderedStep(input: {
  readonly nextStep: InstallWizardStep | undefined;
  readonly isCompleted: boolean;
  readonly steps: Readonly<Record<InstallStepKey, InstallStepState>> | undefined;
}): RenderedInstallStep {
  if (input.isCompleted) return "complete";
  if (isRenderable(input.nextStep)) return input.nextStep;
  // `profile` is the wizard's first step , so it is the honest last resort.
  return firstBlockingStep(input.steps) ?? "profile";
}

function firstBlockingStep(
  steps: Readonly<Record<InstallStepKey, InstallStepState>> | undefined,
): InstallWizardStep | null {
  if (steps === undefined) return null;
  for (const step of installWizardSteps) {
    if (step === "complete") continue;
    if (steps[step as InstallStepKey]?.blocking === true) return step;
  }
  return null;
}
