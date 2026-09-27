import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  Post,
  Put,
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
import { AddTicketLinkDto, MentionCandidatesQueryDto } from './add-ticket-link.dto';
import { TicketsAgentCollaborationService } from './tickets-agent-collaboration.service';

/** Paket 2.4 — following, @mention candidates and related tickets (staff only). */
@Controller('tickets')
@UseGuards(SessionAuthenticationGuard, RoleGuard)
@UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }))
export class TicketsAgentCollaborationController {
  constructor(private readonly service: TicketsAgentCollaborationService) {}

  /** Switches the UI needs (presence, mentions, followers, links); readable by every signed-in user. */
  @Get('collaboration/configuration')
  @RequireRoles(
    authorizationRoleKeys.user,
    authorizationRoleKeys.agent,
    authorizationRoleKeys.admin,
    authorizationRoleKeys.superAdmin,
  )
  configuration() {
    return this.service.getClientConfiguration();
  }

  @Get(':ticketId/follow')
  @RequireRoles(authorizationRoleKeys.agent, authorizationRoleKeys.admin, authorizationRoleKeys.superAdmin)
  followState(@Param('ticketId') ticketId: string, @Req() request: AuthenticatedHttpRequest) {
    return this.service.getFollowState(ticketId, readContext(request));
  }

  @Put(':ticketId/follow')
  @RequireRoles(authorizationRoleKeys.agent, authorizationRoleKeys.admin, authorizationRoleKeys.superAdmin)
  follow(@Param('ticketId') ticketId: string, @Req() request: AuthenticatedHttpRequest) {
    return this.service.follow(ticketId, readContext(request));
  }

  @Delete(':ticketId/follow')
  @RequireRoles(authorizationRoleKeys.agent, authorizationRoleKeys.admin, authorizationRoleKeys.superAdmin)
  unfollow(@Param('ticketId') ticketId: string, @Req() request: AuthenticatedHttpRequest) {
    return this.service.unfollow(ticketId, readContext(request));
  }

  @Get(':ticketId/mention-candidates')
  @RequireRoles(authorizationRoleKeys.agent, authorizationRoleKeys.admin, authorizationRoleKeys.superAdmin)
  mentionCandidates(
    @Param('ticketId') ticketId: string,
    @Query() query: MentionCandidatesQueryDto,
    @Req() request: AuthenticatedHttpRequest,
  ) {
    return this.service.listMentionCandidates(ticketId, query.q, readContext(request));
  }

  @Get(':ticketId/links')
  @RequireRoles(authorizationRoleKeys.agent, authorizationRoleKeys.admin, authorizationRoleKeys.superAdmin)
  links(@Param('ticketId') ticketId: string, @Req() request: AuthenticatedHttpRequest) {
    return this.service.listLinks(ticketId, readContext(request));
  }

  @Post(':ticketId/links')
  @RequireRoles(authorizationRoleKeys.agent, authorizationRoleKeys.admin, authorizationRoleKeys.superAdmin)
  addLink(
    @Param('ticketId') ticketId: string,
    @Body() body: AddTicketLinkDto,
    @Req() request: AuthenticatedHttpRequest,
  ) {
    return this.service.addLink(ticketId, body, readContext(request));
  }

  @Delete(':ticketId/links/:linkId')
  @RequireRoles(authorizationRoleKeys.agent, authorizationRoleKeys.admin, authorizationRoleKeys.superAdmin)
  removeLink(
    @Param('ticketId') ticketId: string,
    @Param('linkId') linkId: string,
    @Req() request: AuthenticatedHttpRequest,
  ) {
    return this.service.removeLink(ticketId, linkId, readContext(request));
  }
}

function readContext(request: AuthenticatedHttpRequest): TicketMutationContext {
  const actorUserId = readAuthenticatedPrincipal(request)?.subjectId ?? '';
  if (actorUserId.length === 0) {
    throw new ForbiddenException({ code: 'FORBIDDEN', message: 'Authorization failed' });
  }
  return { actorUserId };
}
