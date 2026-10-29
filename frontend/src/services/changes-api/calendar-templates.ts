import { apiRequest } from "@/services/api";
import type {
  ChangeConflictPreviewInput,
  ChangeFreezePeriod,
  ChangeLevel,
  ChangeRisk,
  ChangeStatus,
  ChangeType,
} from "../changes-api";

type NamedRef = { readonly id: string; readonly name: string };
const json = (body: unknown): RequestInit => ({ body: JSON.stringify(body) });

export type ChangeCalendar = {
  readonly from: string;
  readonly to: string;
  readonly timeZone: string;
  readonly changes: readonly {
    readonly id: string;
    readonly number: string;
    readonly title: string;
    readonly type: ChangeType;
    readonly status: ChangeStatus;
    readonly risk: ChangeRisk;
    readonly plannedStart: string;
    readonly plannedEnd: string;
    readonly causesDowntime: boolean;
    readonly services: readonly NamedRef[];
  }[];
  readonly downtime: readonly {
    readonly id: string;
    readonly service: NamedRef;
    readonly startsAt: string;
    readonly endsAt: string;
    readonly message: string | null;
    readonly changeRequestId: string | null;
  }[];
  readonly freezePeriods: readonly ChangeFreezePeriod[];
  /** More than 500 items in the period: the view is incomplete. */
  readonly truncated: boolean;
};

export type ChangeTemplate = {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly implementationPlan: string;
  readonly backoutPlan: string;
  readonly testPlan: string | null;
  readonly impact: ChangeLevel;
  readonly likelihood: ChangeLevel;
  readonly risk: ChangeRisk;
  readonly causesDowntime: boolean;
  readonly isActive: boolean;
  readonly services: readonly NamedRef[];
  readonly usageCount: number;
  readonly createdAt: string;
  readonly updatedAt: string;
};

export type ChangeTemplateInput = {
  readonly name: string;
  readonly description: string;
  readonly implementationPlan: string;
  readonly backoutPlan: string;
  readonly testPlan?: string | null;
  readonly impact: ChangeLevel;
  readonly likelihood: ChangeLevel;
  readonly causesDowntime?: boolean;
  readonly isActive?: boolean;
  readonly serviceIds?: readonly string[];
};

export type ChangeAssetOption = {
  readonly id: string;
  readonly assetTag: string;
  readonly name: string;
};
export type ChangeProblemOption = {
  readonly id: string;
  readonly number: string;
  readonly title: string;
  readonly status: string;
};

export const changeExtraKeys = {
  calendar: (from: string, to: string) => ["changes", "calendar", from, to] as const,
  templates: (includeInactive: boolean) => ["changes", "templates", includeInactive] as const,
  assetSearch: (search: string) => ["changes", "link-search", "assets", search] as const,
  problemSearch: (search: string) => ["changes", "link-search", "problems", search] as const,
  preview: (input: ChangeConflictPreviewInput) => ["changes", "conflicts-preview", input] as const,
};

export function getChangeCalendar(from: string, to: string): Promise<ChangeCalendar> {
  return apiRequest(`/changes/calendar?${new URLSearchParams({ from, to }).toString()}`);
}

export function listChangeTemplates(
  includeInactive: boolean,
): Promise<{ readonly items: readonly ChangeTemplate[] }> {
  return apiRequest(`/changes/templates${includeInactive ? "?includeInactive=true" : ""}`);
}

export function createChangeTemplate(input: ChangeTemplateInput): Promise<ChangeTemplate> {
  return apiRequest("/changes/templates", { method: "POST", ...json(input) });
}

export function updateChangeTemplate(
  id: string,
  input: ChangeTemplateInput,
): Promise<ChangeTemplate> {
  return apiRequest(`/changes/templates/${encodeURIComponent(id)}`, {
    method: "PUT",
    ...json(input),
  });
}

export function searchChangeAssets(
  search: string,
): Promise<{ readonly items: readonly ChangeAssetOption[] }> {
  return apiRequest(`/changes/link-search/assets?${new URLSearchParams({ search }).toString()}`);
}

export function searchChangeProblems(
  search: string,
): Promise<{ readonly items: readonly ChangeProblemOption[] }> {
  return apiRequest(`/changes/link-search/problems?${new URLSearchParams({ search }).toString()}`);
}
