import { apiRequest } from "@/services/api";

/**
 * Install wizard v2 (F4): the steps that confirm content — the catalog from a
 * template, the policy pack, the SLA review — plus the SMTP test send. Kept out of
 * `install-api.ts` (the shared status/step contract) and out of
 * `install-profile-api.ts` (package and deferral), so each file stays a topic.
 */

export type InstallBlueprintLocale = "bs" | "en";

export type InstallBlueprintNames = Readonly<Record<InstallBlueprintLocale, string>>;

export type InstallBlueprintServiceDefinition = {
  readonly key: string;
  readonly names: InstallBlueprintNames;
  readonly slug: string;
};

export type InstallBlueprintCategoryDefinition = {
  readonly key: string;
  readonly names: InstallBlueprintNames;
  readonly slug: string;
  readonly services: readonly InstallBlueprintServiceDefinition[];
};

export type InstallBlueprintTierGroup = {
  readonly key: string;
  readonly names: InstallBlueprintNames;
  readonly groupKey: string;
  readonly level: 1 | 2;
};

export type InstallBlueprint = {
  readonly key: string;
  readonly names: InstallBlueprintNames;
  readonly slaProfileKey: string;
  readonly policyPackKeys: readonly string[];
  readonly categories: readonly InstallBlueprintCategoryDefinition[];
  readonly tierGroups: readonly InstallBlueprintTierGroup[];
};

export type InstallBlueprintCatalog = {
  readonly locale: InstallBlueprintLocale;
  readonly applied: string | null;
  readonly blueprints: readonly InstallBlueprint[];
};

export type InstallBlueprintAppliedService = {
  readonly key: string;
  readonly categoryKey: string;
  readonly serviceId: string;
  readonly name: string;
  readonly slug: string;
  readonly created: boolean;
  readonly routed: boolean;
};

export type InstallBlueprintApplyResult = {
  readonly blueprintKey: string;
  readonly locale: InstallBlueprintLocale;
  readonly createdCategoryCount: number;
  readonly createdServiceCount: number;
  readonly existingServiceCount: number;
  readonly createdTierGroupCount: number;
  readonly tierGroupKeys: readonly string[];
  readonly services: readonly InstallBlueprintAppliedService[];
};

export type InstallPolicyPackSummary = {
  readonly key: string;
  readonly name: string;
  readonly description: string;
  readonly defaultClassification: string;
  readonly requiresApproval: boolean;
  readonly slaProfileKey: string | null;
  readonly grantCount: number;
};

export type InstallPolicyPackStatus = {
  readonly applied: string | null;
  readonly blueprint: string | null;
  readonly packs: readonly InstallPolicyPackSummary[];
};

export type InstallSlaReviewOutcome = "confirmed" | "adjusted";

/** Weekday key (ISO „1“–„7“) → the intervals worked that day; a closed day is `[]`. */
export type InstallSlaReviewWeeklyHours = Readonly<
  Record<string, readonly { start: string; end: string }[] | undefined>
>;

export type InstallSlaReviewCalendar = {
  readonly id: string;
  readonly key: string;
  readonly name: string;
  readonly timezone: string;
  readonly weeklyHours: InstallSlaReviewWeeklyHours;
  readonly isActive: boolean;
  readonly holidays: readonly { id: string; date: string; name: string }[];
};

export type InstallSlaReviewMatrixCell = {
  readonly id: string | null;
  readonly impact: string;
  readonly urgency: string;
  readonly priority: string;
};

export type InstallSlaReviewStatus = {
  readonly review: InstallSlaReviewOutcome | null;
  readonly calendar: InstallSlaReviewCalendar | null;
  readonly matrix: { readonly cells: readonly InstallSlaReviewMatrixCell[] };
};

export type InstallSmtpTestResult = {
  readonly isSent: true;
  readonly toAddress: string;
};

export function loadInstallBlueprints(locale: string): Promise<InstallBlueprintCatalog> {
  return apiRequest<InstallBlueprintCatalog>(
    `/install/blueprints?locale=${encodeURIComponent(locale)}`,
  );
}

export function applyInstallBlueprint(input: {
  readonly blueprintKey: string;
  readonly includeServices: readonly string[];
  readonly createTierGroups: boolean;
  readonly locale: string;
}): Promise<InstallBlueprintApplyResult> {
  return apiRequest<InstallBlueprintApplyResult>("/install/blueprints/apply", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function loadInstallPolicyPack(): Promise<InstallPolicyPackStatus> {
  return apiRequest<InstallPolicyPackStatus>("/install/policy-pack");
}

export function applyInstallPolicyPack(policyPackKey: string): Promise<unknown> {
  return apiRequest("/install/policy-pack", {
    method: "POST",
    body: JSON.stringify({ policyPackKey }),
  });
}

export function loadInstallSlaReview(): Promise<InstallSlaReviewStatus> {
  return apiRequest<InstallSlaReviewStatus>("/install/sla-review");
}

export type InstallSlaReviewSaveInput = {
  readonly outcome: InstallSlaReviewOutcome;
  /** Only sent when the operator actually changed the week. */
  readonly weeklyHours?: InstallSlaReviewWeeklyHours;
};

export type InstallSlaReviewSaveResult = InstallSlaReviewStatus & {
  readonly calendarUpdated: boolean;
  readonly matrixUpdated: boolean;
};

export function saveInstallSlaReview(
  input: InstallSlaReviewSaveInput,
): Promise<InstallSlaReviewSaveResult> {
  return apiRequest<InstallSlaReviewSaveResult>("/install/sla-review", {
    method: "POST",
    body: JSON.stringify(
      input.weeklyHours === undefined
        ? { outcome: input.outcome }
        : { outcome: input.outcome, calendar: { weeklyHours: input.weeklyHours } },
    ),
  });
}

export function sendInstallSmtpTest(toAddress?: string): Promise<InstallSmtpTestResult> {
  return apiRequest<InstallSmtpTestResult>("/install/smtp/test", {
    method: "POST",
    body: JSON.stringify(toAddress === undefined ? {} : { toAddress }),
  });
}
