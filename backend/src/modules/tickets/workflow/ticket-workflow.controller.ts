import { Controller, Get, UseGuards } from '@nestjs/common';
import { SessionAuthenticationGuard } from '../../authentication/session-authentication.guard';
import { authorizationRoleKeys } from '../../authorization/authorization.constants';
import { RequireRoles } from '../../authorization/require-roles.decorator';
import { RoleGuard } from '../../authorization/role.guard';
import { TicketWorkflowService, type TicketWorkflowResponse } from './ticket-workflow.service';

/** Package 1.7 (W2/W3): read-only; the flow is not editable from the UI (W4). */
@Controller('workflow')
@UseGuards(SessionAuthenticationGuard, RoleGuard)
@RequireRoles(authorizationRoleKeys.admin, authorizationRoleKeys.superAdmin)
export class TicketWorkflowController {
  constructor(private readonly workflow: TicketWorkflowService) {}

  @Get('ticket-status')
  describe(): Promise<TicketWorkflowResponse> {
    return this.workflow.describe();
  }
}
