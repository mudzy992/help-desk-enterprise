import {
  Body,
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
import { RequestBreakGlassDto } from './dto/request-break-glass.dto';
import { TicketsConfidentialService } from './tickets-confidential.service';
import type { BreakGlassResponse } from './confidential.types';

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
export class TicketsConfidentialController {
  constructor(
    private readonly ticketsConfidentialService: TicketsConfidentialService,
  ) {}

  @Post(':ticketId/break-glass')
  requestBreakGlass(
    @Param('ticketId') ticketId: string,
    @Body() body: RequestBreakGlassDto,
    @Req() request: AuthenticatedHttpRequest,
  ): Promise<BreakGlassResponse> {
    return this.ticketsConfidentialService.requestBreakGlass(
      ticketId,
      body.reason,
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
