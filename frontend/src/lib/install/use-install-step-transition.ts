import { useEffect, useRef } from "react";
import type { InstallWizardStep } from "@/services/install-api";
import { usePrefersReducedMotion } from "@/lib/install/use-prefers-reduced-motion";

/*
  Install wizard v2 a step change is a small, functional movement — fade
  plus an 8 px shift (`page-in`, ~240 ms) — and the headline takes focus so a
  keyboard or screen-reader user lands on the new question instead of staying on
  the button they pressed. Both are switched off by `prefers-reduced-motion`
  (the class disappears; focus stays, because it is navigation, not decoration).
*/

export type InstallStepTransition = {
  /** Attach to the heading of the step; it is the element that takes focus. */
  readonly titleRef: (node: HTMLHeadingElement | null) => void;
  /** `page-in` while motion is allowed, empty string when it is not. */
  readonly stepClassName: string;
};

export function useInstallStepTransition(stepKey: InstallWizardStep): InstallStepTransition {
  const isReducedMotion = usePrefersReducedMotion();
  const titleElement = useRef<HTMLHeadingElement | null>(null);
  const previousStep = useRef<InstallWizardStep | null>(null);

  useEffect(() => {
    const isSameStep = previousStep.current === stepKey;
    previousStep.current = stepKey;
    if (isSameStep) {
      return;
    }
    const title = titleElement.current;
    if (title === null) {
      return;
    }
    // `preventScroll` keeps the operator where they were: the shell scrolls the
    // content column itself, and jumping to the top of the page on every save
    // would hide the answer they just gave.
    title.focus({ preventScroll: true });
  }, [stepKey]);

  return {
    titleRef: (node) => {
      titleElement.current = node;
    },
    stepClassName: isReducedMotion ? "" : "page-in",
  };
}
