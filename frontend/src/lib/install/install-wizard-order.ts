import { installSectionStepKeys } from "@/services/install-sections-api";
import type { InstallWizardStep } from "@/services/install-api";

/*
  Install wizard v2 (F6.1): the wizard's order and its label helpers. They sit
  next to the presentations rather than inside them because the shell, the rail
  and „Nazad“ read the order while nothing on those screens knows what a step
  looks like.
*/

/** The wizard's order; the step counter, the rail and „Nazad“ all read this. */
export const installWizardSteps: readonly InstallWizardStep[] = [
  "profile",
  "superAdmin",
  "identity",
  "loginProvider",
  "smtp",
  "seed",
  "team",
  // F4: Standard/Full content, in the order the registry declares it.
  "blueprint",
  "policyPack",
  "slaReview",
  // F5: the sections of the Full package, in the order the registry declares
  // them, then the recommendations panel Standard and Full share.
  ...installSectionStepKeys,
  "securityRecommendations",
  "addons",
  // F6.1: the provisioning screen, then the „Sistem je spreman“ screen.
  "provisioning",
  "complete",
];

export type InstallStepLabelKey = `install.steps.${InstallWizardStep}`;

export function installStepLabelKey(step: InstallWizardStep): InstallStepLabelKey {
  return `install.steps.${step}`;
}

export function installStepIndex(step: InstallWizardStep): number {
  return installWizardSteps.indexOf(step);
}

/**
 * F6.1: step keys arrive from the API as plain strings (a readiness check names
 * the step that answers it, the summary lists the deferred ones). A widget that
 * turns one into a label or a link checks it here first, so an unknown step
 * shows nothing instead of a raw key.
 */
export function isKnownInstallStepKey(
  value: string,
): value is Exclude<InstallWizardStep, "complete"> {
  return value !== "complete" && (installWizardSteps as readonly string[]).includes(value);
}
