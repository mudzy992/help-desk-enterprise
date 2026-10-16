import type { InstallStepKey, InstallStepState, InstallWizardStep } from "@/services/install-api";

/**
 * The steps the shell can render. F3 added the package picker, so this list is
 * now the whole registry; the shell keeps the check anyway because the server may
 * grow a step before the UI learns how to draw it (`InstallWizardStep` is a
 * union the API owns).
 */
export const renderableInstallSteps = [
  "profile",
  "superAdmin",
  "identity",
  "loginProvider",
  "smtp",
  "seed",
  "team",
  "addons",
  // F6.1/F6.2: the provisioning screen and the „Sistem je spreman“ screen.
  "provisioning",
  "complete",
] as const;

export type RenderedInstallStep = (typeof renderableInstallSteps)[number];

function isRenderable(step: InstallWizardStep | undefined): step is RenderedInstallStep {
  return step !== undefined && (renderableInstallSteps as readonly string[]).includes(step);
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
  // `profile` is the wizard's first step (F3), so it is the honest last resort.
  return firstBlockingStep(input.steps) ?? "profile";
}

function firstBlockingStep(
  steps: Readonly<Record<InstallStepKey, InstallStepState>> | undefined,
): RenderedInstallStep | null {
  if (steps === undefined) return null;
  for (const step of renderableInstallSteps) {
    if (step === "complete") continue;
    if (steps[step]?.blocking === true) return step;
  }
  return null;
}
