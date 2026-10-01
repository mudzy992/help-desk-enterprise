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
