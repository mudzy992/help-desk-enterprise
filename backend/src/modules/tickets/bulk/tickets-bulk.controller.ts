import {
  Body,
  Controller,
  ForbiddenException,
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
import { ExecuteTicketBulkDto } from './dto/execute-ticket-bulk.dto';
import { PreviewTicketBulkDto } from './dto/preview-ticket-bulk.dto';
import { TicketsBulkService } from './tickets-bulk.service';

@Controller('tickets/bulk')
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
export class TicketsBulkController {
  constructor(private readonly bulkService: TicketsBulkService) {}

  @Post('preview')
  preview(
    @Body() body: PreviewTicketBulkDto,
    @Req() request: AuthenticatedHttpRequest,
  ) {
    return this.bulkService.preview(body.ticketIds, readContext(request));
  }

  @Post()
  execute(
    @Body() body: ExecuteTicketBulkDto,
    @Req() request: AuthenticatedHttpRequest,
  ) {
    return this.bulkService.execute(body, readContext(request));
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
