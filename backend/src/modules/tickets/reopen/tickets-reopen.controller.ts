import {
  BadRequestException,
  Body,
  Controller,
  Headers,
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
import type { TicketMutationContext, TicketResponse } from '../tickets.types';
import { ReopenTicketDto } from './dto/reopen-ticket.dto';
import { TicketsReopenService } from './tickets-reopen.service';

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
export class TicketsReopenController {
  constructor(private readonly reopenService: TicketsReopenService) {}

  @Post(':ticketId/reopen')
  reopen(
    @Param('ticketId') ticketId: string,
    @Body() body: ReopenTicketDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() request: AuthenticatedHttpRequest,
  ): Promise<TicketResponse> {
    if (idempotencyKey === undefined || idempotencyKey.trim().length === 0) {
      throw new BadRequestException({ code: 'IDEMPOTENCY_KEY_REQUIRED', message: 'Idempotency-Key header is required' });
    }
    return this.reopenService.reopen(ticketId, body, readContext(request), new Date(), idempotencyKey.trim());
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
