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
  readonly targetAt: string | null;
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
  readonly canRead: boolean;
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
  readonly permissions: { readonly canManage: boolean; readonly canClose: boolean };
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
  readonly groupId?: string | null;
  readonly serviceId?: string | null;
};

export const problemDetailKeys = {
  capabilities: ["problems", "capabilities"] as const,
  options: ["problems", "options"] as const,
  list: (filters: ProblemListFilters) => ["problems", "list", filters] as const,
  detail: (id: string) => ["problems", "detail", id] as const,
  events: (id: string) => ["problems", "detail", id, "events"] as const,
  owners: (search: string) => ["problems", "owners", search] as const,
};

export function getProblemCapabilities(): Promise<ProblemCapabilities> {
  return apiRequest("/problems/capabilities");
}

export function getProblemOptions(): Promise<ProblemOptions> {
  return apiRequest("/problems/options");
}

export function searchProblemOwners(search: string): Promise<{ readonly items: readonly UserRef[] }> {
  return apiRequest(`/problems/owners?search=${encodeURIComponent(search)}`);
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

export function changeProblemStatus(
  id: string,
  input: { readonly version: number; readonly status: ProblemStatus; readonly reason?: string },
): Promise<ProblemDetail> {
  return apiRequest(`/problems/${encodeURIComponent(id)}/status`, { method: "POST", ...json(input) });
}

export function getProblemEvents(id: string): Promise<{ readonly items: readonly ProblemEvent[] }> {
  return apiRequest(`/problems/${encodeURIComponent(id)}/events`);
}
