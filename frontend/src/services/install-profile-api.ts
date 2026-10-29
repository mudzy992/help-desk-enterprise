import { apiRequest } from "@/services/api";

/**
 * Install wizard v2 (F1): the package screen talks to `/install/profile`, the
 * per-step "Podesi kasnije" to `/install/steps/:stepKey/skip`, and the final
 * screen reads `/install/readiness` before it posts `complete`. Kept next to the
 * step APIs so `install-api.ts` stays the shared status/step contract.
 */
export type InstallProfile = "minimum" | "standard" | "full";

import type { InstallStepKey } from "@/services/install-step-key";

export type { InstallStepKey } from "@/services/install-step-key";

export type InstallProfileItem = {
  readonly key: string;
  readonly labelKey: string;
  readonly required: boolean;
};

export type InstallProfilePackage = {
  readonly profile: InstallProfile;
  readonly titleKey: string;
  readonly descriptionKey: string;
  readonly estimatedMinutes: number;
  readonly recommended: boolean;
  readonly requiredSteps: readonly InstallStepKey[];
  readonly offeredSteps: readonly InstallStepKey[];
  readonly defaultEnabledAddons: readonly string[];
  readonly items: readonly InstallProfileItem[];
};

export type InstallProfileStatus = {
  readonly profile: InstallProfile | null;
  readonly packages: readonly InstallProfilePackage[];
  /**
   * IN19: steps the save just put back into the flow because the new package
   * requires them. Empty when reading the package.
   */
  readonly reopenedSteps: readonly InstallStepKey[];
};

export type InstallStepSkipStatus = {
  readonly stepKey: InstallStepKey;
  readonly skipped: boolean;
};

export type InstallReadinessStatus = "ok" | "missing" | "skipped";

export type InstallReadinessCheck = {
  readonly key: string;
  readonly status: InstallReadinessStatus;
  readonly messageKey: string;
  /** F1: the steps behind a `profileSteps` answer that is not green. */
  readonly stepKeys?: readonly string[];
  /**
   * F6.1: the step that answers a red check, when there is one. `roles` is a
   * product-side problem, so the provisioning screen shows it without a link.
   */
  readonly stepKey?: string | null;
};

export type InstallReadiness = {
  readonly isReady: boolean;
  readonly checks: readonly InstallReadinessCheck[];
};

export function loadInstallProfile(): Promise<InstallProfileStatus> {
  return apiRequest<InstallProfileStatus>("/install/profile");
}

export function saveInstallProfile(profile: InstallProfile): Promise<InstallProfileStatus> {
  return apiRequest<InstallProfileStatus>("/install/profile", {
    method: "POST",
    body: JSON.stringify({ profile }),
  });
}

export function skipInstallStep(stepKey: InstallStepKey): Promise<InstallStepSkipStatus> {
  return apiRequest<InstallStepSkipStatus>(`/install/steps/${stepKey}/skip`, {
    method: "POST",
  });
}

export function unskipInstallStep(stepKey: InstallStepKey): Promise<InstallStepSkipStatus> {
  return apiRequest<InstallStepSkipStatus>(`/install/steps/${stepKey}/skip`, {
    method: "DELETE",
  });
}

export function loadInstallReadiness(): Promise<InstallReadiness> {
  return apiRequest<InstallReadiness>("/install/readiness");
}
