import {
  Controller,
  ForbiddenException,
  Param,
  Post,
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
import type { TicketRemoteRequestResponse } from './remote.types';
import { TicketsRemoteService } from './tickets-remote.service';

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
export class TicketsRemoteController {
  constructor(private readonly ticketsRemoteService: TicketsRemoteService) {}

  @Post(':ticketId/remote-requests')
  requestRemote(
    @Param('ticketId') ticketId: string,
    @Req() request: AuthenticatedHttpRequest,
  ): Promise<TicketRemoteRequestResponse> {
    return this.ticketsRemoteService.requestRemote(
      ticketId,
      readContext(request),
    );
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
