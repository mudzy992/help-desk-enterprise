import {
  Controller,
  Get,
  Query,
  Req,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import type { AuthenticatedHttpRequest } from '../authentication/authenticated-request';
import { SessionAuthenticationGuard } from '../authentication/session-authentication.guard';
import { RequireRoles } from '../authorization/require-roles.decorator';
import { RoleGuard } from '../authorization/role.guard';
import { organizationalUnitTreeReadRoles } from '../organizational-units/organizational-unit-tree-read-roles';
import { readTicketMutationContext } from '../tickets/read-ticket-mutation-context';
import { SearchQueryDto, toSearchQuery } from './search-query.dto';
import { SearchRateLimitGuard } from './search-rate-limit.guard';
import { SearchService } from './search.service';
import type { SearchResponse } from './search.types';

/**
 * One request for the header search (plan §1.2).
 *
 * Before this the palette pulled every ticket, every article and the users of
 * every organizational unit in the tree — one HTTP request per unit, each with
 * the full auth chain — and filtered in the browser. `q` matches numbers and
 * titles of tickets, article titles and people; every group is narrowed by the
 * visibility of its own list and capped at 15 hits. The people group follows
 * the directory policy of `search-directory-scope.ts` (permission
 * `user.directory.read` over organizational-unit subtrees, W7.55).
 *
 * W7.59 (BA-search-05): the endpoint carries a distributed request budget
 * (`SearchRateLimitGuard`): a per-actor and a per-address bucket, charged before
 * validation and before any group query, answered with `429` +
 * `Retry-After` when exhausted and `503` when the budget cannot be evaluated at
 * all (fail-closed). Browser debounce is not a server-side control; this is.
 */
@Controller('search')
@UseGuards(SessionAuthenticationGuard, RoleGuard, SearchRateLimitGuard)
@RequireRoles(...organizationalUnitTreeReadRoles)
@UsePipes(
  new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  }),
)
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Get()
  search(
    @Query() query: SearchQueryDto,
    @Req() request: AuthenticatedHttpRequest,
  ): Promise<SearchResponse> {
    return this.searchService.search(
      toSearchQuery(query),
      readTicketMutationContext(request),
    );
  }
}
