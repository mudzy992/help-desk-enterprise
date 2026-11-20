import { apiRequest } from "@/services/api";
import type {
  ChangeConflictPreviewInput,
  ChangeFreezePeriod,
  ChangeLevel,
  ChangePage,
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
  /**
   * Change-owned downtime windows outside the reader's scope (BA-changes-05):
   * counted, never named. Absent in responses from servers before W7.46.
   */
  readonly restrictedDowntime?: number;
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
  /**
   * W7.71 (BA-changes-15): the token the editor sends back in `If-Match`.
   * Without it the server refuses the save (428) instead of letting two
   * managers overwrite each other.
   */
  readonly revision: string;
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

/**
 * W7.76 (`BA-changes-18`): the catalogue is a cursor page. It used to stop at
 * 500 rows with no way to reach the rest and no hint that anything was cut.
 */
export function listChangeTemplates(
  includeInactive: boolean,
  options: { readonly limit?: number; readonly cursor?: string } = {},
): Promise<ChangePage<ChangeTemplate>> {
  const params = new URLSearchParams();
  if (includeInactive) params.set("includeInactive", "true");
  if (options.limit !== undefined) params.set("limit", String(options.limit));
  if (options.cursor !== undefined) params.set("cursor", options.cursor);
  const query = params.toString();
  return apiRequest(`/changes/templates${query === "" ? "" : `?${query}`}`);
}

export function createChangeTemplate(input: ChangeTemplateInput): Promise<ChangeTemplate> {
  return apiRequest("/changes/templates", { method: "POST", ...json(input) });
}

export function updateChangeTemplate(
  id: string,
  input: ChangeTemplateInput,
  revision: string,
): Promise<ChangeTemplate> {
  return apiRequest(`/changes/templates/${encodeURIComponent(id)}`, {
    method: "PUT",
    headers: { "If-Match": revision },
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
