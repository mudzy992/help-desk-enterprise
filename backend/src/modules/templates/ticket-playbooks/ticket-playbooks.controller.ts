import { Body, Controller, Delete, Get, Param, Post, Put, Req, UseGuards, UsePipes } from '@nestjs/common';
import { SessionAuthenticationGuard } from '../../authentication/session-authentication.guard';
import type { AuthenticatedHttpRequest } from '../../authentication/authenticated-request';
import { RequireRoles } from '../../authorization/require-roles.decorator';
import { RoleGuard } from '../../authorization/role.guard';
import { AttachTicketPlaybookDto, DeleteWithReasonDto, SetTicketPlaybookStepDto } from '../dto/templates.dto';
import { executeTemplatesOperation } from '../map-templates-error';
import { readActor, staffRoleKeys, templatesValidationPipe } from '../templates-http';
import { TicketPlaybooksService } from './ticket-playbooks.service';

/** Package 1.4 (P2–P4) — the checklist on a ticket (staff only). */
@Controller('tickets')
@UseGuards(SessionAuthenticationGuard, RoleGuard)
@RequireRoles(...staffRoleKeys)
@UsePipes(templatesValidationPipe)
export class TicketPlaybooksController {
  constructor(private readonly playbooks: TicketPlaybooksService) {}

  @Get(':ticketId/playbook')
  get(@Param('ticketId') ticketId: string, @Req() request: AuthenticatedHttpRequest) {
    return executeTemplatesOperation(() => this.playbooks.get(ticketId, readActor(request)));
  }

  @Post(':ticketId/playbook')
  attach(
    @Param('ticketId') ticketId: string,
    @Body() body: AttachTicketPlaybookDto,
    @Req() request: AuthenticatedHttpRequest,
  ) {
    return executeTemplatesOperation(() => this.playbooks.attach(ticketId, body.playbookId, readActor(request)));
  }

  @Delete(':ticketId/playbook')
  detach(
    @Param('ticketId') ticketId: string,
    @Body() body: DeleteWithReasonDto,
    @Req() request: AuthenticatedHttpRequest,
  ) {
    return executeTemplatesOperation(() => this.playbooks.detach(ticketId, body.reason, readActor(request)));
  }

  @Post(':ticketId/playbook/upgrade')
  upgrade(@Param('ticketId') ticketId: string, @Req() request: AuthenticatedHttpRequest) {
    return executeTemplatesOperation(() => this.playbooks.upgrade(ticketId, readActor(request)));
  }

  @Put(':ticketId/playbook/steps/:stepKey')
  setStep(
    @Param('ticketId') ticketId: string,
    @Param('stepKey') stepKey: string,
    @Body() body: SetTicketPlaybookStepDto,
    @Req() request: AuthenticatedHttpRequest,
  ) {
    return executeTemplatesOperation(() =>
      this.playbooks.setStep(ticketId, stepKey, body.checked, readActor(request)),
    );
  }
}
