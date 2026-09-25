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
  ForwardTargetsQueryDto,
  ForwardTicketDto,
} from './dto/forward-ticket.dto';
import { TicketsForwardingService } from './tickets-forwarding.service';

/** Package 1.1 — forwarding (escalation) between groups and OUs. */
@Controller('tickets')
@UseGuards(SessionAuthenticationGuard, RoleGuard)
@RequireRoles(
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
export class TicketsForwardingController {
  constructor(private readonly forwardingService: TicketsForwardingService) {}

  @Get(':ticketId/forward-targets')
  listTargets(
    @Param('ticketId') ticketId: string,
    @Query() query: ForwardTargetsQueryDto,
    @Req() request: AuthenticatedHttpRequest,
  ) {
    return this.forwardingService.listTargets(
      ticketId,
      query.q,
      readContext(request),
    );
  }

  @Get(':ticketId/forward-history')
  listHistory(
    @Param('ticketId') ticketId: string,
    @Req() request: AuthenticatedHttpRequest,
  ) {
    return this.forwardingService.listHistory(ticketId, readContext(request));
  }

  @Post(':ticketId/forward')
  forward(
    @Param('ticketId') ticketId: string,
    @Body() body: ForwardTicketDto,
    @Req() request: AuthenticatedHttpRequest,
  ) {
    return this.forwardingService.forward(ticketId, body, readContext(request));
  }
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
