import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuthorizationContextLoader } from '../authorization/authorization-context.loader';
import { KnowledgeBaseService } from '../knowledge-base/knowledge-base.service';
import { TicketsService } from '../tickets/tickets.service';
import type { TicketMutationContext } from '../tickets/tickets.types';
import {
  countSearchQueryCharacters,
  isUsableSearchQuery,
  normalizeSearchQuery,
} from './normalize-search-query';
import { searchConstants } from './search.constants';
import {
  resolveDirectorySearchGrant,
  resolveDirectorySearchScope,
} from './search-directory-scope';
import { isFatalSearchGroupFailure } from './search-group-failure';
import { searchDirectoryUsers } from './search-users';
import type {
  SearchGroupName,
  SearchQuery,
  SearchResponse,
} from './search.types';

/**
 * `GET /search` (plan §1.2): one request, three parallel groups, each narrowed
 * by the visibility rules of the list it belongs to. The service adds no rules
 * of its own — it calls the ticket list query, the knowledge-base visibility
 * check and the directory read that already exist.
 */
@Injectable()
export class SearchService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorizationContextLoader: AuthorizationContextLoader,
    private readonly ticketsService: TicketsService,
    private readonly knowledgeBaseService: KnowledgeBaseService,
  ) {}

  async search(
    query: SearchQuery,
    context: TicketMutationContext,
  ): Promise<SearchResponse> {
    // W7.56: the HTTP path normalizes and validates `q` in the DTO; the service
    // repeats both so a caller that builds `SearchQuery` by hand can never send
    // an empty needle (an empty `contains` matches the newest rows of a group).
    const usable = this.requireUsableQuery(query);
    const types = new Set(query.types);
    // W7.62 (BA-search-08): the groups settle independently so one unavailable
    // dependency cannot take the other answers down with it — but every outcome
    // is classified before anything is returned (see `search-group-failure.ts`):
    // an authorization failure still fails the whole request.
    const [ticketOutcome, articleOutcome, userOutcome] = await Promise.all([
      readSearchGroup(types.has('ticket'), () =>
        this.ticketsService.searchTickets(
          { q: usable.q, limit: usable.limit },
          context,
        ),
      ),
      // W7.57 (BA-search-03): the article group is a bounded keyset scan, so it
      // also reports whether it had to stop early. A group that was not
      // requested is not "incomplete" — it is simply absent.
      readSearchGroup(types.has('article'), () =>
        this.knowledgeBaseService.searchTitles(
          { q: usable.q, limit: usable.limit },
          context,
        ),
      ),
      readSearchGroup(types.has('user'), () => this.searchUsers(usable, context)),
    ]);

    const outcomes: readonly { group: SearchGroupName; outcome: SearchGroupOutcome<unknown> }[] = [
      { group: 'ticket', outcome: ticketOutcome },
      { group: 'article', outcome: articleOutcome },
      { group: 'user', outcome: userOutcome },
    ];
    const fatal = outcomes.find(
      (entry) => entry.outcome.kind === 'failed' && isFatalSearchGroupFailure(entry.outcome.error),
    );
    if (fatal !== undefined && fatal.outcome.kind === 'failed') {
      // Fail-closed: 401/403 and other client errors are decisions about this
      // request, never a group that "happened to be empty".
      throw fatal.outcome.error;
    }
    const failedGroups = outcomes
      .filter((entry) => entry.outcome.kind === 'failed')
      .map((entry) => entry.group);
    if (failedGroups.length > 0 && failedGroups.length === outcomes.length) {
      // Nothing could be read: there is no partial answer to give, so the
      // endpoint says so instead of returning three empty groups.
      throw new ServiceUnavailableException({
        code: 'SEARCH_UNAVAILABLE',
        message: 'The search groups are temporarily unavailable',
        details: { failedGroups },
      });
    }
    const articles =
      articleOutcome.kind === 'ok'
        ? articleOutcome.value
        : { items: [], incomplete: false };
    return {
      tickets: ticketOutcome.kind === 'ok' ? ticketOutcome.value : [],
      articles: articles.items,
      users: userOutcome.kind === 'ok' ? userOutcome.value : [],
      // The scan-completeness flag belongs to a group that actually answered;
      // a failed group is reported in `failedGroups` instead.
      articlesIncomplete: articles.incomplete,
      failedGroups: failedGroups.filter(
        (group) => types.has(group),
      ),
    };
  }

  private requireUsableQuery(query: SearchQuery): SearchQuery {
    const q = normalizeSearchQuery(query.q);
    if (!isUsableSearchQuery(q)) {
      throw new BadRequestException(
        `q must contain between ${searchConstants.minimumQueryLength} and ` +
          `${searchConstants.maximumQueryLength} characters after normalization ` +
          `(got ${countSearchQueryCharacters(q)})`,
      );
    }
    return { ...query, q };
  }

  private async searchUsers(
    query: SearchQuery,
    context: TicketMutationContext,
  ) {
    const authorization = await this.authorizationContextLoader.loadBySubjectId(
      context.actorUserId,
    );
    if (authorization === null) {
      return [];
    }
    // W7.55: the grant is a permission and the reach is an organizational-unit
    // subtree; the unit table is read only when a scoped grant needs it.
    const grant = resolveDirectorySearchGrant(authorization);
    const scope = resolveDirectorySearchScope({
      grant,
      organizationalUnits:
        grant.kind === 'organizationalUnits'
          ? await this.prisma.organizationalUnit.findMany({
              select: { id: true, ouPath: true },
            })
          : [],
    });
    return searchDirectoryUsers({
      prisma: this.prisma,
      query: query.q,
      limit: query.limit,
      scope,
    });
  }
}

/**
 * Outcome of one requested group. `skipped` is a group the caller did not ask
 * for: it is neither answered nor failed, and it must never appear in
 * `failedGroups`.
 */
type SearchGroupOutcome<T> =
  | { readonly kind: 'skipped' }
  | { readonly kind: 'ok'; readonly value: T }
  | { readonly kind: 'failed'; readonly error: unknown };

async function readSearchGroup<T>(
  requested: boolean,
  read: () => Promise<T>,
): Promise<SearchGroupOutcome<T>> {
  if (!requested) {
    return { kind: 'skipped' };
  }
  try {
    return { kind: 'ok', value: await read() };
  } catch (error) {
    return { kind: 'failed', error };
  }
}
