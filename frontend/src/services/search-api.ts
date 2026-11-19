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
  /**
   * W7.55 (BA-search-01): `null` when the caller searches an organizational-unit
   * subtree — the palette then shows the name only.
   */
  readonly email: string | null;
};

export type GlobalSearchResponse = {
  readonly tickets: readonly TicketSearchHit[];
  readonly articles: readonly ArticleSearchHit[];
  readonly users: readonly UserSearchHit[];
  /**
   * W7.57 (BA-search-03): `true` kada je server stao sa skeniranjem članaka
   * prije nego što su svi pogoci pročitani — grupa je tada samo prefiks.
   */
  readonly articlesIncomplete: boolean;
  /**
   * W7.62 (BA-search-08): tražene grupe koje nisu odgovorile zbog dostupnosti.
   * Njihovi nizovi su prazni, a ovo polje je ono što prazan niz razlikuje od
   * „nema pogodaka”. Autorizacijska greška nikad ne stiže ovdje — ona ruši
   * cijeli zahtjev (`401`/`403`), a ako nijedna grupa nije odgovorila, server
   * vraća `503 SEARCH_UNAVAILABLE`.
   */
  readonly failedGroups?: readonly string[];
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
