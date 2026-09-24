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
import { SearchService } from './search.service';
import type { SearchResponse } from './search.types';

/**
 * One request for the header search (plan §1.2).
 *
 * Before this the palette pulled every ticket, every article and the users of
 * every organizational unit in the tree — one HTTP request per unit, each with
 * the full auth chain — and filtered in the browser. `q` matches numbers and
 * titles of tickets, article titles and (for admins) people; every group is
 * narrowed by the visibility of its own list and capped at 15 hits.
 */
@Controller('search')
@UseGuards(SessionAuthenticationGuard, RoleGuard)
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
