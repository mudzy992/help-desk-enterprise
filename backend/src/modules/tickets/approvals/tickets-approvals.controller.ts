import {
  Body,
  Controller,
  ForbiddenException,
  Get,
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
import { DecideTicketApprovalDto } from './dto/decide-ticket-approval.dto';
import { TicketsApprovalsService } from './tickets-approvals.service';

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
export class TicketsApprovalsController {
  constructor(private readonly approvalsService: TicketsApprovalsService) {}

  @Get(':ticketId/approvals')
  list(
    @Param('ticketId') ticketId: string,
    @Req() request: AuthenticatedHttpRequest,
  ) {
    return this.approvalsService.list(ticketId, readContext(request));
  }

  @Post(':ticketId/approvals/:approvalId/approve')
  approve(
    @Param('ticketId') ticketId: string,
    @Param('approvalId') approvalId: string,
    @Body() body: DecideTicketApprovalDto,
    @Req() request: AuthenticatedHttpRequest,
  ) {
    return this.approvalsService.approve(
      ticketId,
      approvalId,
      body,
      readContext(request),
    );
  }

  @Post(':ticketId/approvals/:approvalId/reject')
  reject(
    @Param('ticketId') ticketId: string,
    @Param('approvalId') approvalId: string,
    @Body() body: DecideTicketApprovalDto,
    @Req() request: AuthenticatedHttpRequest,
  ) {
    return this.approvalsService.reject(
      ticketId,
      approvalId,
      body,
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
