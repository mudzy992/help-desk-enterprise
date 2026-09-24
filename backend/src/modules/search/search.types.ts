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
  readonly email: string;
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
};

export type SearchQuery = {
  readonly q: string;
  readonly types: readonly SearchType[];
  readonly limit: number;
};
