import { useCallback, useEffect, useMemo, useState } from "react";
import type { InstallStepState, InstallWizardStep } from "@/services/install-api";
import { installWizardSteps } from "@/lib/install/install-step-presentation";

/*
  Install wizard v2 (F3): „Nazad“ lets the operator review a step they already
  answered, without moving the wizard. The reviewed step is **local to the
  shell** — the server's `nextStep` stays the source of truth, and „Nastavi“
  simply drops the review. A refresh therefore always lands on the real step, and
  a review can never skip a blocker: only steps before the server's step, in the
  wizard order, can be opened.
*/

export type InstallStepNavigation = {
  /** The step to render: the reviewed one, or the step the server asks for. */
  readonly step: InstallWizardStep;
  readonly canGoBack: boolean;
  readonly goBack: () => void;
  /** „Nastavi“ — leave the review and follow the server again. */
  readonly continueForward: () => void;
};

export function useInstallStepNavigation(input: {
  readonly serverStep: InstallWizardStep;
  readonly states: Readonly<Record<string, InstallStepState>> | undefined;
}): InstallStepNavigation {
  const { serverStep, states } = input;
  const [reviewedStep, setReviewedStep] = useState<InstallWizardStep | null>(null);

  // A save (or a reload after „Podesi kasnije“) moves the wizard; the review
  // does not survive a real step change.
  useEffect(() => {
    setReviewedStep(null);
  }, [serverStep]);

  const step = reviewedStep ?? serverStep;

  const goBack = useCallback(() => {
    setReviewedStep((current) => findPreviousReviewable(current ?? serverStep, states) ?? current);
  }, [serverStep, states]);

  const continueForward = useCallback(() => setReviewedStep(null), []);

  return useMemo(
    () => ({
      step,
      canGoBack: findPreviousReviewable(step, states) !== null,
      goBack,
      continueForward,
    }),
    [step, states, goBack, continueForward],
  );
}

/**
 * The nearest step before `step` that the operator can actually open. Only steps
 * this package offers **and** the operator already answered (completed or
 * deferred) count: „Nazad“ is a review of an answer, not a second way to fill the
 * wizard out of order, and a locked step must never appear as a form.
 */
function findPreviousReviewable(
  step: InstallWizardStep,
  states: Readonly<Record<string, InstallStepState>> | undefined,
): InstallWizardStep | null {
  const index = installWizardSteps.indexOf(step);
  for (let candidate = index - 1; candidate >= 0; candidate -= 1) {
    const previous = installWizardSteps[candidate];
    if (isReviewable(previous, states)) {
      return previous;
    }
  }
  return null;
}

function isReviewable(
  step: InstallWizardStep,
  states: Readonly<Record<string, InstallStepState>> | undefined,
): boolean {
  if (step === "complete") {
    return false;
  }
  const state = states?.[step];
  if (state === undefined) {
    return false;
  }
  return state.offered !== false && (state.completed === true || state.skipped === true);
}
