import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuthorizationContextLoader } from '../authorization/authorization-context.loader';
import { KnowledgeBaseService } from '../knowledge-base/knowledge-base.service';
import { TicketsService } from '../tickets/tickets.service';
import type { TicketMutationContext } from '../tickets/tickets.types';
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
    const types = new Set(query.types);
    const [tickets, articles, users] = await Promise.all([
      types.has('ticket')
        ? this.ticketsService.searchTickets(
            { q: query.q, limit: query.limit },
            context,
          )
        : Promise.resolve([]),
      types.has('article')
        ? this.knowledgeBaseService.searchTitles(
            {
              q: query.q,
              limit: query.limit,
              candidateMultiplier: searchConstants.candidateMultiplier,
            },
            context,
          )
        : Promise.resolve([]),
      types.has('user') ? this.searchUsers(query, context) : Promise.resolve([]),
    ]);
    return { tickets, articles, users };
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
