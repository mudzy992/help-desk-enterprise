import { apiRequest } from "@/services/api";
import type { TicketPriority, TicketStatus } from "@/services/tickets-api";

/**
 * Paket 3.3: `/problems/*`. Types mirror `backend/src/modules/problems`.
 * The server enforces the module switch, permissions and the unit scope;
 * these calls only decide what the UI renders.
 */

export const problemStatuses = ["NEW", "INVESTIGATING", "KNOWN_ERROR", "RESOLVED", "CLOSED", "CANCELLED"] as const;
export type ProblemStatus = (typeof problemStatuses)[number];
export const problemOpenStatuses: readonly ProblemStatus[] = ["NEW", "INVESTIGATING", "KNOWN_ERROR"];
/** P5: a resolved problem still accepts links; the link is recorded as a recurrence. */
export const problemLinkableStatuses: readonly ProblemStatus[] = [...problemOpenStatuses, "RESOLVED"];
export type ProblemSeverity = TicketPriority;

type NamedRef = { readonly id: string; readonly name: string };
type UserRef = { readonly id: string; readonly displayName: string; readonly email?: string };

export type ProblemListItem = {
  readonly id: string;
  readonly number: string;
  readonly title: string;
  readonly status: ProblemStatus;
  readonly priority: ProblemSeverity;
  readonly rootCauseCategory: string | null;
  readonly owner: UserRef | null;
  readonly group: NamedRef | null;
  readonly organizationalUnit: NamedRef & { readonly ouPath: string };
  readonly service: NamedRef | null;
  readonly ticketCount: number;
  /** Linked tickets not yet resolved, closed or archived (register only). */
  readonly openTicketCount?: number;
  readonly targetAt: string | null;
  /** P5: running target already passed (NEW/INVESTIGATING only). */
  readonly targetOverdue: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
};

export type ProblemListResponse = {
  readonly items: readonly ProblemListItem[];
  readonly total: number;
  readonly nextCursor: string | null;
};

export type ProblemTicketSkipReason = "not_found" | "merged" | "already_linked" | "other_problem" | "read_only";

export type ProblemTicketLinkResult = {
  readonly linked: readonly { readonly ticketId: string; readonly ticketNumber: string }[];
  readonly skipped: readonly {
    readonly ticketId: string;
    readonly ticketNumber: string | null;
    readonly reason: ProblemTicketSkipReason;
  }[];
};

export type CreatedProblem = ProblemListItem & {
  readonly version: number;
  /** Present when tickets were linked on creation. */
  readonly ticketLinks: ProblemTicketLinkResult | null;
};

export type TicketProblemPanel = {
  readonly enabled: boolean;
  readonly visible: boolean;
  readonly canLink: boolean;
  readonly canUnlink: boolean;
  readonly problem: {
    readonly id: string;
    readonly number: string;
    readonly title: string;
    readonly status: ProblemStatus;
    readonly priority: ProblemSeverity;
    readonly workaround: string | null;
    readonly workaroundAt: string | null;
    readonly canOpen: boolean;
  } | null;
};

export type ProblemTicketItem = {
  readonly id: string;
  readonly ticketNumber: string;
  /** null for confidential tickets. */
  readonly title: string | null;
  readonly confidential: boolean;
  readonly status: TicketStatus;
  readonly priority: TicketPriority;
  readonly requester: UserRef | null;
  readonly organizationalUnit: NamedRef;
  readonly assignee: UserRef | null;
  readonly createdAt: string;
  readonly linkedAt: string;
};

export type ProblemTicketsResponse = {
  readonly total: number;
  readonly open: number;
  readonly items: readonly ProblemTicketItem[];
};

export type CreateProblemInput = {
  readonly title: string;
  readonly description: string;
  readonly impact?: ProblemSeverity;
  readonly urgency?: ProblemSeverity;
  readonly ticketIds?: readonly string[];
  /** Decision 2026-10-01: every problem belongs to a problem group. */
  readonly groupId: string;
};

const json = (body: unknown): RequestInit => ({ body: JSON.stringify(body) });

export const problemQueryKeys = {
  all: ["problems"] as const,
  ticketPanel: (ticketId: string) => ["problems", "ticket", ticketId] as const,
  search: (search: string) => ["problems", "search", search] as const,
  tickets: (problemId: string) => ["problems", problemId, "tickets"] as const,
};

export function listProblems(query: { readonly search?: string; readonly status?: readonly ProblemStatus[]; readonly limit?: number }) {
  const params = new URLSearchParams();
  if (query.search) params.set("search", query.search);
  if (query.status && query.status.length > 0) params.set("status", query.status.join(","));
  if (query.limit !== undefined) params.set("limit", String(query.limit));
  const suffix = params.toString();
  return apiRequest<ProblemListResponse>(`/problems${suffix ? `?${suffix}` : ""}`);
}

export function createProblem(input: CreateProblemInput): Promise<CreatedProblem> {
  return apiRequest("/problems", { method: "POST", ...json(input) });
}

export function getTicketProblem(ticketId: string): Promise<TicketProblemPanel> {
  return apiRequest(`/problems/tickets/${encodeURIComponent(ticketId)}`);
}

export function linkProblemTickets(problemId: string, ticketIds: readonly string[]): Promise<ProblemTicketLinkResult> {
  return apiRequest(`/problems/${encodeURIComponent(problemId)}/tickets`, { method: "POST", ...json({ ticketIds }) });
}

export function unlinkProblemTicket(problemId: string, ticketId: string): Promise<void> {
  return apiRequest(`/problems/${encodeURIComponent(problemId)}/tickets/${encodeURIComponent(ticketId)}`, { method: "DELETE" });
}

export function getProblemTickets(problemId: string): Promise<ProblemTicketsResponse> {
  return apiRequest(`/problems/${encodeURIComponent(problemId)}/tickets`);
}

// ------------------------------------------------------------ P3: list, detail, editing

export type ProblemCapabilities = {
  readonly enabled: boolean;
  /** The addon is on but no group is marked as a problem group yet. */
  readonly setupRequired: boolean;
  readonly canRead: boolean;
  readonly canReport: boolean;
  readonly canManage: boolean;
  readonly canClose: boolean;
  readonly configuration: {
    readonly numberPrefix: string;
    readonly rootCauseCategories: readonly string[];
    readonly requireWorkaroundForKnownError: boolean;
    readonly autoCloseDays: number;
    readonly bulkResolveMax: number;
    readonly targetEnabled: boolean;
  } | null;
};

export type ProblemWhy = { readonly question: string; readonly answer: string };

export type ProblemDetail = ProblemListItem & {
  readonly description: string;
  readonly impact: ProblemSeverity;
  readonly urgency: ProblemSeverity;
  readonly rootCause: string | null;
  readonly rcaWhys: readonly ProblemWhy[];
  readonly workaround: string | null;
  readonly workaroundAt: string | null;
  readonly resolution: string | null;
  readonly knowledgeArticle: { readonly id: string; readonly title: string; readonly status: string } | null;
  readonly identifiedAt: string | null;
  readonly resolvedAt: string | null;
  readonly closedAt: string | null;
  readonly cancelledAt: string | null;
  readonly cancelReason: string | null;
  readonly createdBy: UserRef | null;
  readonly version: number;
  readonly allowedTransitions: readonly ProblemStatus[];
  readonly permissions: { readonly canManage: boolean; readonly canClose: boolean; readonly canClaim: boolean; readonly canLink: boolean };
};

export type ProblemOptions = {
  readonly units: readonly { readonly id: string; readonly name: string; readonly path: string }[];
  readonly services: readonly NamedRef[];
  readonly groups: readonly NamedRef[];
  readonly rootCauseCategories: readonly string[];
  readonly homeOrganizationalUnitId: string | null;
};

export type ProblemEvent = {
  readonly id: string;
  readonly action: string;
  readonly actor: UserRef | null;
  readonly detail: Record<string, unknown> | null;
  readonly createdAt: string;
};

export type ProblemListFilters = {
  readonly search?: string;
  readonly status?: readonly ProblemStatus[];
  readonly priority?: readonly ProblemSeverity[];
  /** "me" = the viewer. */
  readonly ownerUserId?: string;
  readonly groupId?: string;
  readonly serviceId?: string;
  readonly organizationalUnitId?: string;
  /** P5: only problems whose running target has passed. */
  readonly overdue?: boolean;
  /** Root-cause category; "none" = not categorised. */
  readonly rootCauseCategory?: string;
};

export type UpdateProblemInput = {
  readonly version: number;
  readonly title?: string;
  readonly description?: string;
  readonly impact?: ProblemSeverity;
  readonly urgency?: ProblemSeverity;
  readonly organizationalUnitId?: string;
  readonly ownerUserId?: string | null;
  readonly groupId?: string | null;
  readonly serviceId?: string | null;
  readonly rootCauseCategory?: string | null;
  readonly rootCause?: string | null;
  readonly rcaWhys?: readonly ProblemWhy[] | null;
  readonly workaround?: string | null;
  readonly resolution?: string | null;
};

export type CreateProblemFullInput = CreateProblemInput & {
  readonly organizationalUnitId?: string;
  readonly ownerUserId?: string | null;
  readonly serviceId?: string | null;
};

export const problemDetailKeys = {
  capabilities: ["problems", "capabilities"] as const,
  options: ["problems", "options"] as const,
  list: (filters: ProblemListFilters) => ["problems", "list", filters] as const,
  detail: (id: string) => ["problems", "detail", id] as const,
  events: (id: string) => ["problems", "detail", id, "events"] as const,
  owners: (search: string, groupId: string) => ["problems", "owners", groupId, search] as const,
  resolvePreview: (id: string) => ["problems", "detail", id, "resolve-preview"] as const,
  articleDraft: (id: string) => ["problems", "detail", id, "article-draft"] as const,
};

export function getProblemCapabilities(): Promise<ProblemCapabilities> {
  return apiRequest("/problems/capabilities");
}

export function getProblemOptions(): Promise<ProblemOptions> {
  return apiRequest("/problems/options");
}

export function searchProblemOwners(search: string, groupId: string): Promise<{ readonly items: readonly UserRef[] }> {
  const params = new URLSearchParams({ search, groupId });
  return apiRequest(`/problems/owners?${params.toString()}`);
}

export function claimProblem(id: string): Promise<ProblemDetail> {
  return apiRequest(`/problems/${encodeURIComponent(id)}/claim`, { method: "POST" });
}

export function listProblemsPage(filters: ProblemListFilters, cursor?: string, limit = 25): Promise<ProblemListResponse> {
  const params = new URLSearchParams();
  if (filters.search) params.set("search", filters.search);
  if (filters.status && filters.status.length > 0) params.set("status", filters.status.join(","));
  if (filters.priority && filters.priority.length > 0) params.set("priority", filters.priority.join(","));
  if (filters.ownerUserId) params.set("ownerUserId", filters.ownerUserId);
  if (filters.groupId) params.set("groupId", filters.groupId);
  if (filters.serviceId) params.set("serviceId", filters.serviceId);
  if (filters.organizationalUnitId) params.set("organizationalUnitId", filters.organizationalUnitId);
  if (filters.overdue) params.set("overdue", "true");
  if (filters.rootCauseCategory) params.set("rootCauseCategory", filters.rootCauseCategory);
  if (cursor) params.set("cursor", cursor);
  params.set("limit", String(limit));
  return apiRequest(`/problems?${params.toString()}`);
}

export function createProblemFull(input: CreateProblemFullInput): Promise<CreatedProblem> {
  return apiRequest("/problems", { method: "POST", ...json(input) });
}

export function getProblem(id: string): Promise<ProblemDetail> {
  return apiRequest(`/problems/${encodeURIComponent(id)}`);
}

export function updateProblem(id: string, input: UpdateProblemInput): Promise<ProblemDetail> {
  return apiRequest(`/problems/${encodeURIComponent(id)}`, { method: "PATCH", ...json(input) });
}

export type ProblemTicketResolveSkip = "waiting_for_user" | "pending_approval" | "merged" | "no_access" | "limit";

export type ProblemTicketResolveOutcome = {
  readonly resolved: readonly { readonly ticketId: string; readonly ticketNumber: string; readonly messageSent: boolean }[];
  readonly skipped: readonly { readonly ticketId: string; readonly ticketNumber: string; readonly reason: ProblemTicketResolveSkip }[];
  readonly failed: readonly { readonly ticketId: string; readonly ticketNumber: string; readonly code: string }[];
};

export type ProblemResolvePreview = {
  readonly max: number;
  readonly resolvable: number;
  readonly items: readonly {
    readonly id: string;
    readonly ticketNumber: string;
    readonly title: string | null;
    readonly status: string;
    readonly resolvable: boolean;
    readonly reason: ProblemTicketResolveSkip | null;
  }[];
  readonly closeCodes: {
    readonly enabled: boolean;
    readonly required: boolean;
    readonly codes: readonly { readonly key: string; readonly name: string }[];
  };
};

export type ProblemArticleDraft = {
  readonly title: string;
  readonly body: string;
  readonly serviceId: string | null;
  readonly organizationalUnitId: string;
  readonly replacements: { readonly email: number; readonly person: number; readonly ip: number; readonly phone: number };
};

export type ProblemStatusInput = {
  readonly version: number;
  readonly status: ProblemStatus;
  readonly reason?: string;
  /** P4 (§8.4): with RESOLVED, also resolve the open linked tickets. */
  readonly resolveTickets?: boolean;
  readonly message?: string;
  readonly closeCode?: string;
};

export function getProblemResolvePreview(id: string): Promise<ProblemResolvePreview> {
  return apiRequest(`/problems/${encodeURIComponent(id)}/resolve-preview`);
}

export function getProblemArticleDraft(id: string): Promise<ProblemArticleDraft> {
  return apiRequest(`/problems/${encodeURIComponent(id)}/knowledge-article/draft`);
}

export function createProblemArticle(
  id: string,
  input: { readonly title: string; readonly body: string; readonly serviceId: string; readonly organizationalUnitId: string },
): Promise<{ readonly id: string; readonly title: string; readonly status: string }> {
  return apiRequest(`/problems/${encodeURIComponent(id)}/knowledge-article`, { method: "POST", ...json(input) });
}

export function changeProblemStatus(
  id: string,
  input: ProblemStatusInput,
): Promise<ProblemDetail & { readonly ticketResolution: ProblemTicketResolveOutcome | null }> {
  return apiRequest(`/problems/${encodeURIComponent(id)}/status`, { method: "POST", ...json(input) });
}

export function getProblemEvents(id: string): Promise<{ readonly items: readonly ProblemEvent[] }> {
  return apiRequest(`/problems/${encodeURIComponent(id)}/events`);
}

// ------------------------------------------------------------ P5b: CMDB items, services, incidents

export type ProblemLinkedAsset = {
  readonly id: string;
  readonly assetTag: string;
  readonly name: string;
  readonly status: string;
  readonly typeNameBs: string;
  readonly typeNameEn: string;
  readonly organizationalUnitName: string;
};

export type ProblemLinkedIncident = {
  readonly id: string;
  readonly title: string;
  readonly impact: string;
  readonly status: string;
  readonly startedAt: string;
  readonly resolvedAt: string | null;
};

export type ProblemLinks = {
  readonly cmdbEnabled: boolean;
  readonly statusEnabled: boolean;
  readonly canEdit: boolean;
  readonly assets: readonly (ProblemLinkedAsset & { readonly linkedAt: string })[];
  /** Items attached to the problem's tickets, not linked yet. */
  readonly suggestedAssets: readonly (ProblemLinkedAsset & { readonly ticketCount: number })[];
  readonly services: readonly NamedRef[];
  readonly incidents: readonly ProblemLinkedIncident[];
};

export type ProblemReference = {
  readonly id: string;
  readonly number: string;
  readonly title: string;
  readonly status: ProblemStatus;
  readonly priority: ProblemSeverity;
};

export const problemLinkKeys = {
  links: (problemId: string) => ["problems", problemId, "links"] as const,
  assetSearch: (problemId: string, search: string) => ["problems", problemId, "links", "assets", search] as const,
  incidentSearch: (problemId: string, search: string) => ["problems", problemId, "links", "incidents", search] as const,
  byAsset: (assetId: string) => ["problems", "by-asset", assetId] as const,
  byIncident: (incidentId: string) => ["problems", "by-incident", incidentId] as const,
};

const problemPath = (problemId: string) => `/problems/${encodeURIComponent(problemId)}`;

export function getProblemLinks(problemId: string): Promise<ProblemLinks> {
  return apiRequest(`${problemPath(problemId)}/links`);
}

export function searchProblemAssets(problemId: string, search: string): Promise<{ readonly items: readonly ProblemLinkedAsset[] }> {
  return apiRequest(`${problemPath(problemId)}/links/asset-search?${new URLSearchParams({ search }).toString()}`);
}

export function linkProblemAssets(problemId: string, assetIds: readonly string[]): Promise<{ readonly linked: number }> {
  return apiRequest(`${problemPath(problemId)}/assets`, { method: "POST", ...json({ assetIds }) });
}

export function unlinkProblemAsset(problemId: string, assetId: string): Promise<void> {
  return apiRequest(`${problemPath(problemId)}/assets/${encodeURIComponent(assetId)}`, { method: "DELETE" });
}

export function linkProblemService(problemId: string, serviceId: string): Promise<{ readonly linked: number }> {
  return apiRequest(`${problemPath(problemId)}/services`, { method: "POST", ...json({ serviceId }) });
}

export function unlinkProblemService(problemId: string, serviceId: string): Promise<void> {
  return apiRequest(`${problemPath(problemId)}/services/${encodeURIComponent(serviceId)}`, { method: "DELETE" });
}

export function searchProblemIncidents(problemId: string, search: string): Promise<{ readonly items: readonly ProblemLinkedIncident[] }> {
  return apiRequest(`${problemPath(problemId)}/links/incident-search?${new URLSearchParams({ search }).toString()}`);
}

export function linkProblemIncident(problemId: string, incidentId: string): Promise<{ readonly linked: number }> {
  return apiRequest(`${problemPath(problemId)}/incidents`, { method: "POST", ...json({ incidentId }) });
}

export function unlinkProblemIncident(problemId: string, incidentId: string): Promise<void> {
  return apiRequest(`${problemPath(problemId)}/incidents/${encodeURIComponent(incidentId)}`, { method: "DELETE" });
}

export function getProblemsForAsset(assetId: string): Promise<{ readonly items: readonly ProblemReference[] }> {
  return apiRequest(`/problems/by-asset/${encodeURIComponent(assetId)}`);
}

export function getProblemsForIncident(incidentId: string): Promise<{ readonly items: readonly ProblemReference[] }> {
  return apiRequest(`/problems/by-incident/${encodeURIComponent(incidentId)}`);
}
