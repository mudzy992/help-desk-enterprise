import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { SessionAuthenticationGuard } from '../../authentication/session-authentication.guard';
import type { AuthenticatedHttpRequest } from '../../authentication/authenticated-request';
import { readAuthenticatedPrincipal } from '../../authentication/authenticated-request';
import { authorizationRoleKeys } from '../../authorization/authorization.constants';
import { RequireRoles } from '../../authorization/require-roles.decorator';
import { RoleGuard } from '../../authorization/role.guard';
import type { TicketMutationContext } from '../tickets.types';
import {
  MergeCandidatesQueryDto,
  MergeTicketDto,
  OverrideTicketPriorityDto,
  UnmergeTicketDto,
} from './dto/merge.dto';
import { TicketsMergeService } from './tickets-merge.service';

const validation = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
});

/**
 * Package 1.2 — manual priority, merge and unmerge. Staff-only routes need an
 * AGENT/ADMIN/SUPER_ADMIN role; the permission itself (`ticket.priority.override`,
 * `ticket.merge`) is checked in the use case. `GET :id/merged` is open to any
 * signed-in person with access to the ticket and returns [] for non-staff.
 */
@Controller('tickets')
@UseGuards(SessionAuthenticationGuard)
@UsePipes(validation)
export class TicketsMergeController {
  constructor(private readonly mergeService: TicketsMergeService) {}

  @Post(':ticketId/priority')
  @UseGuards(RoleGuard)
  @RequireRoles(...staffRoles())
  overridePriority(
    @Param('ticketId') ticketId: string,
    @Body() body: OverrideTicketPriorityDto,
    @Req() request: AuthenticatedHttpRequest,
  ) {
    return this.mergeService.overridePriority(ticketId, body, readContext(request));
  }

  @Post(':ticketId/merge')
  @UseGuards(RoleGuard)
  @RequireRoles(...staffRoles())
  merge(
    @Param('ticketId') ticketId: string,
    @Body() body: MergeTicketDto,
    @Req() request: AuthenticatedHttpRequest,
  ) {
    return this.mergeService.merge(ticketId, body, readContext(request));
  }

  @Post(':ticketId/unmerge')
  @UseGuards(RoleGuard)
  @RequireRoles(...staffRoles())
  unmerge(
    @Param('ticketId') ticketId: string,
    @Body() body: UnmergeTicketDto,
    @Req() request: AuthenticatedHttpRequest,
  ) {
    return this.mergeService.unmerge(ticketId, body, readContext(request));
  }

  @Get(':ticketId/merge-candidates')
  @UseGuards(RoleGuard)
  @RequireRoles(...staffRoles())
  listCandidates(
    @Param('ticketId') ticketId: string,
    @Query() query: MergeCandidatesQueryDto,
    @Req() request: AuthenticatedHttpRequest,
  ) {
    return this.mergeService.listCandidates(ticketId, query.q, readContext(request));
  }

  @Get(':ticketId/merged')
  listMerged(
    @Param('ticketId') ticketId: string,
    @Req() request: AuthenticatedHttpRequest,
  ) {
    return this.mergeService.listMerged(ticketId, readContext(request));
  }
}

function staffRoles(): string[] {
  return [
    authorizationRoleKeys.agent,
    authorizationRoleKeys.admin,
    authorizationRoleKeys.superAdmin,
  ];
}

function readContext(request: AuthenticatedHttpRequest): TicketMutationContext {
  const actorUserId = readAuthenticatedPrincipal(request)?.subjectId ?? '';
  if (actorUserId.length === 0) {
    throw new ForbiddenException({
      code: 'FORBIDDEN',
      message: 'Authorization failed',
    });
  }
  return { actorUserId };
}
