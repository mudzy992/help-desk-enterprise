import type { searchTypes } from './search.constants';
import type { TicketSearchMatch } from '../tickets/tickets.types';

export type SearchType = (typeof searchTypes)[number];

export type ArticleSearchMatch = {
  readonly id: string;
  readonly slug: string;
  readonly title: string;
};

export type UserSearchMatch = {
  readonly id: string;
  readonly displayName: string;
  /**
   * W7.55 (BA-search-01): `null` when the caller's directory reach is an
   * organizational-unit subtree — the discovery surface shows the name, the
   * unit list remains the screen that shows the record in full.
   */
  readonly email: string | null;
};

/**
 * Answer of `GET /search` (plan §1.2): one request, three groups, each already
 * narrowed by the same visibility rules as the matching list. An empty group is
 * a valid answer — it also means "this caller may not see that type".
 */
export type SearchResponse = {
  readonly tickets: readonly TicketSearchMatch[];
  readonly articles: readonly ArticleSearchMatch[];
  readonly users: readonly UserSearchMatch[];
  /**
   * W7.57 (BA-search-03): `true` when the article group stopped scanning before
   * the matching rows were exhausted (the scan budget ran out, or more hits
   * existed than `limit` allows). `false` means the group is exhaustive. Ticket
   * and user groups keep their existing contract; this flag is the article
   * group's "incomplete" signal, so a short or empty list never claims "nothing
   * else matches" when the answer was cut.
   */
  readonly articlesIncomplete: boolean;
};

export type SearchQuery = {
  readonly q: string;
  readonly types: readonly SearchType[];
  readonly limit: number;
};
