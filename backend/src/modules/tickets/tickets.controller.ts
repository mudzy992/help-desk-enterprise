import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { SessionAuthenticationGuard } from '../authentication/session-authentication.guard';
import type { AuthenticatedHttpRequest } from '../authentication/authenticated-request';
import { readAuthenticatedPrincipal } from '../authentication/authenticated-request';
import { authorizationRoleKeys } from '../authorization/authorization.constants';
import { RequireRoles } from '../authorization/require-roles.decorator';
import { RoleGuard } from '../authorization/role.guard';
import type { GroupInboxStatus } from './assignment/read-group-inbox-status';
import { ListInboxQueryDto } from './dto/list-inbox-query.dto';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { RoutingPreviewDto } from './dto/routing-preview.dto';
import type { TicketRoutingPreview } from './routing-preview/routing-preview.types';
import type { TicketCounts } from './counts/counts.types';
import { ListTicketsQueryDto } from './dto/list-tickets-query.dto';
import { TicketCountsQueryDto } from './dto/ticket-counts-query.dto';
import { UpdateTicketDto } from './dto/update-ticket.dto';
import { TicketsService } from './tickets.service';
import type {
  TicketListResponse,
  TicketMutationContext,
  TicketResponse,
} from './tickets.types';

@Controller('tickets')
@UseGuards(SessionAuthenticationGuard, RoleGuard)
@RequireRoles(
  authorizationRoleKeys.user,
  authorizationRoleKeys.agent,
  authorizationRoleKeys.admin,
  authorizationRoleKeys.superAdmin,
)
@UsePipes(
  new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  }),
)
export class TicketsController {
  constructor(private readonly ticketsService: TicketsService) {}

  @Post()
  create(
    @Body() body: CreateTicketDto,
    @Req() request: AuthenticatedHttpRequest,
  ): Promise<TicketResponse> {
    return this.ticketsService.create(body, readTicketMutationContext(request));
  }

  /** Same routing decision `create` would make; nothing is created. */
  @Post('routing-preview')
  previewRouting(
    @Body() body: RoutingPreviewDto,
    @Req() request: AuthenticatedHttpRequest,
  ): Promise<TicketRoutingPreview> {
    return this.ticketsService.previewRouting(
      body,
      readTicketMutationContext(request),
    );
  }

  /**
   * Without `page`/`pageSize` this returns the plain array older clients read;
   * with either one it returns `{ items, total, page, pageSize }`.
   */
  @Get()
  list(
    @Query() query: ListTicketsQueryDto,
    @Req() request: AuthenticatedHttpRequest,
  ): Promise<readonly TicketResponse[] | TicketListResponse> {
    const context = readTicketMutationContext(request);
    return query.page === undefined && query.pageSize === undefined
      ? this.ticketsService.list(query, context)
      : this.ticketsService.listPage(query, context);
  }

  @Get('counts')
  getCounts(
    @Query() query: TicketCountsQueryDto,
    @Req() request: AuthenticatedHttpRequest,
  ): Promise<TicketCounts> {
    return this.ticketsService.getCounts(
      query,
      readTicketMutationContext(request),
    );
  }

  @Get('inbox')
  listInbox(
    @Query() query: ListInboxQueryDto,
    @Req() request: AuthenticatedHttpRequest,
  ): Promise<TicketListResponse> {
    return this.ticketsService.listInbox(
      query,
      readTicketMutationContext(request),
    );
  }

  @Get('inbox/status')
  getInboxStatus(
    @Req() request: AuthenticatedHttpRequest,
  ): Promise<GroupInboxStatus> {
    return this.ticketsService.getInboxStatus(
      readTicketMutationContext(request),
    );
  }

  @Get(':ticketId')
  getById(
    @Param('ticketId') ticketId: string,
    @Req() request: AuthenticatedHttpRequest,
  ): Promise<TicketResponse> {
    return this.ticketsService.getById(
      ticketId,
      readTicketMutationContext(request),
    );
  }

  @Post(':ticketId/claim')
  claim(
    @Param('ticketId') ticketId: string,
    @Req() request: AuthenticatedHttpRequest,
  ): Promise<TicketResponse> {
    return this.ticketsService.claim(
      ticketId,
      readTicketMutationContext(request),
    );
  }

  @Patch(':ticketId')
  update(
    @Param('ticketId') ticketId: string,
    @Body() body: UpdateTicketDto,
    @Req() request: AuthenticatedHttpRequest,
  ): Promise<TicketResponse> {
    return this.ticketsService.update(
      ticketId,
      body,
      readTicketMutationContext(request),
    );
  }
}

function readTicketMutationContext(
  request: AuthenticatedHttpRequest,
): TicketMutationContext {
  const actorUserId = readAuthenticatedPrincipal(request)?.subjectId ?? '';
  if (actorUserId.length === 0) {
    throw new ForbiddenException({
      code: 'FORBIDDEN',
      message: 'Authorization failed',
    });
  }
  return { actorUserId };
}
