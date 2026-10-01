import { apiRequest } from "@/services/api";

/**
 * Paket 3.4: `/changes/*`. Types mirror `backend/src/modules/changes`.
 * The server enforces the module switch, permissions, the unit scope and the
 * CAB membership; these calls only decide what the UI renders.
 */

export const changeTypes = ["STANDARD", "NORMAL", "EMERGENCY"] as const;
export type ChangeType = (typeof changeTypes)[number];

export const changeStatuses = [
  "DRAFT",
  "ASSESSMENT",
  "AUTHORIZATION",
  "SCHEDULED",
  "IMPLEMENTING",
  "REVIEW",
  "CLOSED",
  "REJECTED",
  "CANCELLED",
] as const;
export type ChangeStatus = (typeof changeStatuses)[number];
export const changeOpenStatuses: readonly ChangeStatus[] = ["DRAFT", "ASSESSMENT", "AUTHORIZATION", "SCHEDULED", "IMPLEMENTING", "REVIEW"];

export const changeLevels = ["LOW", "MEDIUM", "HIGH"] as const;
export type ChangeLevel = (typeof changeLevels)[number];

export const changeRisks = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;
export type ChangeRisk = (typeof changeRisks)[number];

export const changeOutcomes = ["SUCCESSFUL", "PARTIAL", "FAILED", "ROLLED_BACK"] as const;
export type ChangeOutcome = (typeof changeOutcomes)[number];

export const changeActions = ["submit", "return", "authorize", "withdraw", "schedule", "start", "finish", "close", "cancel"] as const;
export type ChangeAction = (typeof changeActions)[number];

type NamedRef = { readonly id: string; readonly name: string };
type UserRef = { readonly id: string; readonly displayName: string; readonly email?: string };

export type ChangeFreezePeriod = { readonly from: string; readonly to: string; readonly label: string };

export type ChangeConfiguration = {
  readonly numberPrefix: string;
  readonly normalQuorum: number;
  readonly emergencyQuorum: number;
  readonly minLeadTimeHours: number;
  readonly requireTestPlan: boolean;
  readonly freezePeriods: readonly ChangeFreezePeriod[];
  readonly reminderHoursBeforeStart: number;
  readonly timeZone: string;
};

export type ChangeCapabilities = {
  readonly enabled: boolean;
  /** The addon is on but no group is marked as a CAB yet. */
  readonly setupRequired: boolean;
  readonly canRead: boolean;
  readonly canRequest: boolean;
  readonly canManage: boolean;
  readonly canApprove: boolean;
  readonly cmdbEnabled: boolean;
  readonly problemsEnabled: boolean;
  readonly configuration: ChangeConfiguration | null;
};

export type ChangeListItem = {
  readonly id: string;
  readonly number: string;
  readonly title: string;
  readonly type: ChangeType;
  readonly status: ChangeStatus;
  readonly risk: ChangeRisk;
  readonly plannedStart: string | null;
  readonly plannedEnd: string | null;
  readonly causesDowntime: boolean;
  readonly owner: UserRef | null;
  readonly requester: UserRef | null;
  readonly cabGroup: NamedRef | null;
  readonly organizationalUnit: NamedRef & { readonly ouPath: string };
  readonly services: readonly NamedRef[];
  readonly serviceCount: number;
  readonly assetCount: number;
  readonly createdAt: string;
  readonly updatedAt: string;
};

export type ChangeListResponse = {
  readonly items: readonly ChangeListItem[];
  readonly total: number;
  readonly nextCursor: string | null;
};

export type ChangeEditScope = "all" | "window" | "none";

export type ChangeDetail = ChangeListItem & {
  readonly description: string;
  readonly reason: string;
  readonly impact: ChangeLevel;
  readonly likelihood: ChangeLevel;
  readonly implementationPlan: string | null;
  readonly backoutPlan: string | null;
  readonly testPlan: string | null;
  readonly communicationPlan: string | null;
  readonly actualStart: string | null;
  readonly actualEnd: string | null;
  readonly outcome: ChangeOutcome | null;
  readonly reviewNotes: string | null;
  readonly template: NamedRef | null;
  readonly problem: { readonly id: string; readonly number: string; readonly title: string; readonly status: string } | null;
  readonly assets: readonly { readonly id: string; readonly assetTag: string; readonly name: string }[];
  readonly approvalRound: number;
  readonly conflictsAcknowledgedAt: string | null;
  readonly submittedAt: string | null;
  readonly authorizedAt: string | null;
  readonly closedAt: string | null;
  readonly cancelledAt: string | null;
  readonly cancelReason: string | null;
  readonly version: number;
  readonly allowedActions: readonly ChangeAction[];
  readonly permissions: {
    readonly canManage: boolean;
    readonly canEdit: boolean;
    /** "window": only the planned window and the owner (SCHEDULED). */
    readonly editScope: ChangeEditScope;
    readonly canClaim: boolean;
  };
};

export type ChangeTemplateOption = NamedRef & {
  readonly impact: ChangeLevel;
  readonly likelihood: ChangeLevel;
  readonly causesDowntime: boolean;
  readonly risk: ChangeRisk;
};

export type ChangeOptions = {
  readonly units: readonly { readonly id: string; readonly name: string; readonly path: string }[];
  readonly services: readonly NamedRef[];
  readonly cabGroups: readonly NamedRef[];
  readonly templates: readonly ChangeTemplateOption[];
  readonly homeOrganizationalUnitId: string | null;
  readonly freezePeriods: readonly ChangeFreezePeriod[];
  readonly requireTestPlan: boolean;
  readonly minLeadTimeHours: number;
};

export type ChangeEvent = {
  readonly id: string;
  readonly action: string;
  readonly actor: UserRef | null;
  readonly detail: Record<string, unknown> | null;
  readonly createdAt: string;
};

export type ChangeConflicts = {
  readonly changes: readonly {
    readonly id: string;
    readonly number: string;
    readonly title: string;
    readonly status: ChangeStatus;
    readonly plannedStart: string;
    readonly plannedEnd: string;
    readonly sharedServices: readonly NamedRef[];
    readonly sharedAssetCount: number;
  }[];
  readonly downtime: readonly {
    readonly id: string;
    readonly service: NamedRef;
    readonly startsAt: string;
    readonly endsAt: string;
    readonly message: string | null;
    readonly changeRequestId: string | null;
  }[];
  readonly freeze: ChangeFreezePeriod | null;
  /** The freeze blocks this type (STANDARD, NORMAL); EMERGENCY only warns. */
  readonly freezeBlocks: boolean;
  readonly hasWarnings: boolean;
  /** Only on a saved change. */
  readonly acknowledgedAt?: string | null;
};

export type ChangeVoteDecision = "APPROVED" | "REJECTED";

export type ChangeApprovals = {
  readonly round: number;
  readonly quorum: number;
  readonly approvals: number;
  readonly cabGroup: NamedRef | null;
  readonly voters: readonly (UserRef & { readonly voted: boolean })[];
  readonly votes: readonly {
    readonly id: string;
    readonly round: number;
    readonly decision: ChangeVoteDecision;
    readonly comment: string | null;
    readonly decidedAt: string;
    readonly approver: UserRef | null;
  }[];
  readonly canVote: boolean;
  readonly isRequester: boolean;
};

export type ChangeListFilters = {
  readonly search?: string;
  readonly status?: readonly ChangeStatus[];
  readonly type?: readonly ChangeType[];
  readonly risk?: readonly ChangeRisk[];
  /** "me" = the viewer. */
  readonly ownerUserId?: string;
  readonly cabGroupId?: string;
  readonly serviceId?: string;
  readonly mine?: boolean;
  readonly awaitingMyVote?: boolean;
  readonly problemId?: string;
  readonly assetId?: string;
};

type ChangeWritable = {
  readonly title?: string;
  readonly description?: string;
  readonly reason?: string;
  readonly impact?: ChangeLevel;
  readonly likelihood?: ChangeLevel;
  readonly implementationPlan?: string | null;
  readonly backoutPlan?: string | null;
  readonly testPlan?: string | null;
  readonly communicationPlan?: string | null;
  readonly causesDowntime?: boolean;
  readonly plannedStart?: string | null;
  readonly plannedEnd?: string | null;
  readonly organizationalUnitId?: string;
  readonly cabGroupId?: string | null;
  readonly ownerUserId?: string | null;
  readonly problemId?: string | null;
  readonly serviceIds?: readonly string[];
  readonly assetIds?: readonly string[];
};

export type CreateChangeInput = ChangeWritable & {
  readonly type: ChangeType;
  readonly title: string;
  readonly templateId?: string | null;
};

export type UpdateChangeInput = ChangeWritable & { readonly version: number; readonly type?: ChangeType };

export type ChangeActionInput = {
  readonly version: number;
  readonly action: ChangeAction;
  readonly reason?: string;
  readonly outcome?: ChangeOutcome;
  readonly reviewNotes?: string;
  readonly acknowledgeConflicts?: boolean;
};

export type ChangeConflictPreviewInput = {
  readonly type: ChangeType;
  readonly plannedStart: string;
  readonly plannedEnd: string;
  readonly serviceIds?: readonly string[];
  readonly assetIds?: readonly string[];
  readonly changeId?: string;
};

const json = (body: unknown): RequestInit => ({ body: JSON.stringify(body) });
const path = (id: string) => `/changes/${encodeURIComponent(id)}`;

export const changeQueryKeys = {
  all: ["changes"] as const,
  capabilities: ["changes", "capabilities"] as const,
  options: ["changes", "options"] as const,
  list: (filters: ChangeListFilters) => ["changes", "list", filters] as const,
  detail: (id: string) => ["changes", "detail", id] as const,
  events: (id: string) => ["changes", "detail", id, "events"] as const,
  conflicts: (id: string) => ["changes", "detail", id, "conflicts"] as const,
  approvals: (id: string) => ["changes", "detail", id, "approvals"] as const,
  owners: (search: string) => ["changes", "owners", search] as const,
};

export function getChangeCapabilities(): Promise<ChangeCapabilities> {
  return apiRequest("/changes/capabilities");
}

export function getChangeOptions(): Promise<ChangeOptions> {
  return apiRequest("/changes/options");
}

export function searchChangeOwners(search: string): Promise<{ readonly items: readonly UserRef[] }> {
  return apiRequest(`/changes/owners?${new URLSearchParams({ search }).toString()}`);
}

export function listChangesPage(filters: ChangeListFilters, cursor?: string, limit = 25): Promise<ChangeListResponse> {
  const params = new URLSearchParams();
  if (filters.search) params.set("search", filters.search);
  if (filters.status && filters.status.length > 0) params.set("status", filters.status.join(","));
  if (filters.type && filters.type.length > 0) params.set("type", filters.type.join(","));
  if (filters.risk && filters.risk.length > 0) params.set("risk", filters.risk.join(","));
  if (filters.ownerUserId) params.set("ownerUserId", filters.ownerUserId);
  if (filters.cabGroupId) params.set("cabGroupId", filters.cabGroupId);
  if (filters.serviceId) params.set("serviceId", filters.serviceId);
  if (filters.mine) params.set("mine", "true");
  if (filters.awaitingMyVote) params.set("awaitingMyVote", "true");
  if (filters.problemId) params.set("problemId", filters.problemId);
  if (filters.assetId) params.set("assetId", filters.assetId);
  if (cursor) params.set("cursor", cursor);
  params.set("limit", String(limit));
  return apiRequest(`/changes?${params.toString()}`);
}

export function getChange(id: string): Promise<ChangeDetail> {
  return apiRequest(path(id));
}

export function createChange(input: CreateChangeInput): Promise<ChangeDetail> {
  return apiRequest("/changes", { method: "POST", ...json(input) });
}

export function updateChange(id: string, input: UpdateChangeInput): Promise<ChangeDetail> {
  return apiRequest(path(id), { method: "PATCH", ...json(input) });
}

export function actOnChange(id: string, input: ChangeActionInput): Promise<ChangeDetail> {
  return apiRequest(`${path(id)}/actions`, { method: "POST", ...json(input) });
}

export function claimChange(id: string): Promise<ChangeDetail> {
  return apiRequest(`${path(id)}/claim`, { method: "POST" });
}

export function getChangeEvents(id: string): Promise<{ readonly items: readonly ChangeEvent[] }> {
  return apiRequest(`${path(id)}/events`);
}

export function getChangeConflicts(id: string): Promise<ChangeConflicts> {
  return apiRequest(`${path(id)}/conflicts`);
}

export function previewChangeConflicts(input: ChangeConflictPreviewInput): Promise<ChangeConflicts> {
  return apiRequest("/changes/conflicts/preview", { method: "POST", ...json(input) });
}

export function getChangeApprovals(id: string): Promise<ChangeApprovals> {
  return apiRequest(`${path(id)}/approvals`);
}

export function voteOnChange(id: string, input: { readonly version: number; readonly decision: ChangeVoteDecision; readonly comment?: string }): Promise<unknown> {
  return apiRequest(`${path(id)}/approvals`, { method: "POST", ...json(input) });
}
