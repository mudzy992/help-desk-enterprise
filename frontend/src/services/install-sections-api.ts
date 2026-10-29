import { apiRequest } from "@/services/api";

/*
  Install wizard v2 (F5): the Full package's settings sections and the security
  recommendations. Kept out of `install-content-api.ts` (F4's blueprint/policy
  pack/SLA review) because the two answer different questions: that one confirms
  content the wizard created, this one edits settings the registry owns.
*/

export const installSectionKeys = [
  "inboundEmail",
  "directory",
  "knowledgeBase",
  "statusPage",
  "onCall",
  "announcements",
  "security",
  "privacy",
  "auditWebhook",
  "itsm",
  "integrations",
] as const;

export type InstallSettingsSectionKey = (typeof installSectionKeys)[number];

export type InstallSectionStepKey = `section.${InstallSettingsSectionKey}`;

export const installSectionStepPrefix = "section.";

export const installSectionStepKeys: readonly InstallSectionStepKey[] = installSectionKeys.map(
  resolveInstallSectionStepKey,
);

export function resolveInstallSectionStepKey(
  sectionKey: InstallSettingsSectionKey,
): InstallSectionStepKey {
  return `${installSectionStepPrefix}${sectionKey}`;
}

export function readInstallSectionKeyFromStep(stepKey: string): InstallSettingsSectionKey | null {
  if (!stepKey.startsWith(installSectionStepPrefix)) return null;
  const sectionKey = stepKey.slice(installSectionStepPrefix.length);
  return (installSectionKeys as readonly string[]).includes(sectionKey)
    ? (sectionKey as InstallSettingsSectionKey)
    : null;
}

export type InstallSettingsSectionDependency = "service" | "directoryLogin" | "team";

export type SettingValueLike = string | number | boolean;

export type InstallSettingsSectionField = {
  readonly key: string;
  readonly valueType: "string" | "number" | "boolean";
  readonly visibility: "private" | "secret";
  /** Existing registry slots — the wizard never invents a second wording. */
  readonly titleKey: string;
  readonly helpKey: string;
  readonly description: string;
  readonly value: SettingValueLike | null;
  readonly defaultValue: SettingValueLike | null;
  readonly isSet: boolean;
  readonly isRequired: boolean;
  readonly allowedValues?: readonly string[];
  readonly inactiveValue?: string;
  readonly group: string | null;
  /** Conditions of the definition itself (`requires`) — reported, not re-checked. */
  readonly definitionRequires: readonly { readonly key: string }[];
  /** Present when the value can only be one of a list this deployment knows. */
  readonly options?: readonly { readonly value: string; readonly label: string }[];
};

export type InstallSettingsSectionStatus = {
  readonly sectionKey: InstallSettingsSectionKey;
  readonly stepKey: InstallSectionStepKey;
  readonly titleKey: string;
  readonly answered: boolean;
  readonly dependencies: readonly {
    readonly dependency: InstallSettingsSectionDependency;
    readonly satisfied: boolean;
  }[];
  readonly fields: readonly InstallSettingsSectionField[];
};

export type InstallSettingsSectionsList = {
  readonly sections: readonly {
    readonly sectionKey: InstallSettingsSectionKey;
    readonly stepKey: InstallSectionStepKey;
    readonly titleKey: string;
    readonly answered: boolean;
    readonly requires: readonly InstallSettingsSectionDependency[];
  }[];
};

export type InstallSecurityRecommendationStatus = {
  readonly key: string;
  readonly titleKey: string;
  readonly helpKey: string;
  readonly recommendedValue: SettingValueLike | null;
  readonly currentValue: SettingValueLike | null;
  readonly isApplied: boolean;
};

export type InstallSecurityRecommendationsStatus = {
  readonly recommendations: readonly InstallSecurityRecommendationStatus[];
  readonly canApply: boolean;
  readonly answered: boolean;
};

export function loadInstallSections(): Promise<InstallSettingsSectionsList> {
  return apiRequest<InstallSettingsSectionsList>("/install/sections");
}

export function loadInstallSection(
  sectionKey: InstallSettingsSectionKey,
): Promise<InstallSettingsSectionStatus> {
  return apiRequest<InstallSettingsSectionStatus>(
    `/install/sections/${encodeURIComponent(sectionKey)}`,
  );
}

export function saveInstallSection(
  sectionKey: InstallSettingsSectionKey,
  values: readonly { readonly key: string; readonly value: SettingValueLike }[],
): Promise<InstallSettingsSectionStatus> {
  return apiRequest<InstallSettingsSectionStatus>(
    `/install/sections/${encodeURIComponent(sectionKey)}`,
    { method: "POST", body: JSON.stringify({ values }) },
  );
}

export function loadInstallSecurityRecommendations(): Promise<InstallSecurityRecommendationsStatus> {
  return apiRequest<InstallSecurityRecommendationsStatus>("/install/security-recommendations");
}

export function applyInstallSecurityRecommendations(): Promise<InstallSecurityRecommendationsStatus> {
  return apiRequest<InstallSecurityRecommendationsStatus>("/install/security-recommendations", {
    method: "POST",
  });
}
