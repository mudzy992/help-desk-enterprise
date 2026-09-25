import type {
  TicketPriority,
  TicketStatus,
} from "@/services/tickets-api";

export type TicketSortField =
  | "updatedAt"
  | "createdAt"
  | "priority"
  | "status"
  | "slaDueAt";

/** Server-side list query: every filter is optional and applied by the API. */
export type TicketPageQuery = {
  readonly originUnitId?: string;
  readonly serviceId?: string;
  readonly status?: TicketStatus | readonly TicketStatus[];
  readonly assignedUserId?: string;
  readonly priority?: TicketPriority;
  readonly requesterId?: string;
  readonly groupId?: string;
  readonly unassigned?: boolean;
  /** Package 1.6 (staff only; the API ignores it for requesters). */
  readonly forwarded?: "any" | "toMyGroups";
  /** Package 1.2: leave merged children out. */
  readonly hideMerged?: boolean;
  /** Paket 1.7 (U3). */
  readonly unroutedOverdue?: boolean;
  readonly overdue?: boolean;
  readonly atRisk?: boolean;
  readonly createdFrom?: string;
  readonly createdTo?: string;
  readonly q?: string;
  /** Search the description as well (the ticket list search box does). */
  readonly searchDescription?: boolean;
  readonly includeArchived?: boolean;
  readonly sort?: TicketSortField;
  readonly dir?: "asc" | "desc";
  readonly page?: number;
  readonly pageSize?: number;
};

const textFilters = [
  "originUnitId",
  "serviceId",
  "assignedUserId",
  "priority",
  "requesterId",
  "groupId",
  "forwarded",
  "createdFrom",
  "createdTo",
  "sort",
  "dir",
] as const;

const flagFilters = [
  "unassigned",
  "overdue",
  "atRisk",
  "includeArchived",
  "searchDescription",
  "hideMerged",
  "unroutedOverdue",
] as const;

/**
 * Builds the query string of GET /tickets. Empty values and `false` flags are
 * left out (the API treats absence as "no filter"), and `page` is always sent:
 * the API only answers with `{ items, total, page, pageSize }` when it is asked
 * for a page, otherwise it returns the legacy plain array.
 */
export function toTicketListSearchParams(
  query: TicketPageQuery,
): URLSearchParams {
  const search = new URLSearchParams();
  for (const key of textFilters) {
    const value = query[key];
    if (value !== undefined && value !== "") {
      search.set(key, value);
    }
  }
  for (const key of flagFilters) {
    if (query[key] === true) {
      search.set(key, "true");
    }
  }
  const statuses =
    query.status === undefined
      ? []
      : typeof query.status === "string"
        ? [query.status]
        : query.status;
  for (const status of statuses) {
    search.append("status", status);
  }
  const term = query.q?.trim() ?? "";
  if (term.length > 0) {
    search.set("q", term);
  }
  search.set("page", String(query.page ?? 1));
  if (query.pageSize !== undefined) {
    search.set("pageSize", String(query.pageSize));
  }
  return search;
}

/** The narrowing filters `GET /tickets/counts` accepts (no status, sort, paging). */
export type TicketCountsQuery = Pick<
  TicketPageQuery,
  | "originUnitId"
  | "serviceId"
  | "assignedUserId"
  | "priority"
  | "requesterId"
  | "groupId"
  | "unassigned"
  | "forwarded"
  | "hideMerged"
  | "createdFrom"
  | "createdTo"
  | "q"
>;

const countsTextFilters = [
  "originUnitId",
  "serviceId",
  "assignedUserId",
  "priority",
  "requesterId",
  "groupId",
  "forwarded",
  "createdFrom",
  "createdTo",
] as const;

/** Query string of GET /tickets/counts; empty values and `false` are omitted. */
export function toTicketCountsSearchParams(
  query: TicketCountsQuery,
): URLSearchParams {
  const search = new URLSearchParams();
  for (const key of countsTextFilters) {
    const value = query[key];
    if (value !== undefined && value !== "") {
      search.set(key, value);
    }
  }
  if (query.unassigned === true) {
    search.set("unassigned", "true");
  }
  if (query.hideMerged === true) {
    search.set("hideMerged", "true");
  }
  const term = query.q?.trim() ?? "";
  if (term.length > 0) {
    search.set("q", term);
  }
  return search;
}
