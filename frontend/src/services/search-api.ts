import { apiRequest } from "@/services/api";

export type TicketSearchHit = {
  readonly id: string;
  readonly ticketNumber: string;
  readonly title: string;
};

export type ArticleSearchHit = {
  readonly id: string;
  readonly slug: string;
  readonly title: string;
};

export type UserSearchHit = {
  readonly id: string;
  readonly displayName: string;
  readonly email: string;
};

export type GlobalSearchResponse = {
  readonly tickets: readonly TicketSearchHit[];
  readonly articles: readonly ArticleSearchHit[];
  readonly users: readonly UserSearchHit[];
};

export type GlobalSearchOptions = {
  /** Cancels the request when a newer keystroke supersedes it (phase 1.2). */
  readonly signal?: AbortSignal;
  readonly limit?: number;
};

/**
 * One request for the header search (phase 1.2, plan §1.2).
 *
 * `GET /search` replaces the three old sources — the full ticket table, every
 * article, and one user request per organizational unit — with a single call
 * whose groups are already narrowed by the caller's visibility.
 */
export function searchEverywhere(
  query: string,
  options: GlobalSearchOptions = {},
): Promise<GlobalSearchResponse> {
  const search = new URLSearchParams({ q: query });
  if (options.limit !== undefined) {
    search.set("limit", String(options.limit));
  }
  return apiRequest(`/search?${search.toString()}`, {
    signal: options.signal,
  });
}
