import type { InstallWizardStep } from "@/services/install-api";

export type InstallRailState = "done" | "current" | "deferred" | "locked" | "upcoming";

export type InstallRailItem = {
  readonly key: InstallWizardStep;
  readonly state: InstallRailState;
};

/** Resolves presentation state exclusively from the server-backed step facts. */
export function resolveInstallRailState(input: {
  readonly isActive: boolean;
  readonly isCompleted: boolean;
  readonly isDeferred: boolean;
  readonly isOffered: boolean;
}): InstallRailState {
  if (!input.isOffered) return "locked";
  if (input.isActive) return "current";
  if (input.isCompleted) return "done";
  if (input.isDeferred) return "deferred";
  return "upcoming";
}
