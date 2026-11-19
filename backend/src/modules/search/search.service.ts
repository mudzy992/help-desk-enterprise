import { BadRequestException, Injectable } from '@nestjs/common';
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
import { searchDirectoryUsers } from './search-users';
import type { SearchQuery, SearchResponse } from './search.types';

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
    const [tickets, articleResult, users] = await Promise.all([
      types.has('ticket')
        ? this.ticketsService.searchTickets(
            { q: usable.q, limit: usable.limit },
            context,
          )
        : Promise.resolve([]),
      // W7.57 (BA-search-03): the article group is a bounded keyset scan, so it
      // also reports whether it had to stop early. A group that was not
      // requested is not "incomplete" — it is simply absent.
      types.has('article')
        ? this.knowledgeBaseService.searchTitles(
            { q: usable.q, limit: usable.limit },
            context,
          )
        : Promise.resolve({ items: [], incomplete: false }),
      types.has('user')
        ? this.searchUsers(usable, context)
        : Promise.resolve([]),
    ]);
    return {
      tickets,
      articles: articleResult.items,
      users,
      articlesIncomplete: articleResult.incomplete,
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
