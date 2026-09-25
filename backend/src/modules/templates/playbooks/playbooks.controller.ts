import { Body, Controller, Delete, Get, Param, Post, Put, Query, Req, UseGuards, UsePipes } from '@nestjs/common';
import { AdminConfigDomains } from '../../../common/admin-realtime/admin-config-domain.decorator';
import { SessionAuthenticationGuard } from '../../authentication/session-authentication.guard';
import type { AuthenticatedHttpRequest } from '../../authentication/authenticated-request';
import { RequireRoles } from '../../authorization/require-roles.decorator';
import { RoleGuard } from '../../authorization/role.guard';
import { DeleteWithReasonDto, ManagePlaybooksQueryDto, SavePlaybookDto } from '../dto/templates.dto';
import { executeTemplatesOperation } from '../map-templates-error';
import { readActor, staffRoleKeys, templatesValidationPipe } from '../templates-http';
import { PlaybooksService } from './playbooks.service';

/** Package 1.4 (A1) — shared playbooks; `ticket.templates.manage`. */
@AdminConfigDomains('templates')
@Controller('playbooks')
@UseGuards(SessionAuthenticationGuard, RoleGuard)
@RequireRoles(...staffRoleKeys)
@UsePipes(templatesValidationPipe)
export class PlaybooksController {
  constructor(private readonly playbooks: PlaybooksService) {}

  @Get()
  list(@Query() query: ManagePlaybooksQueryDto, @Req() request: AuthenticatedHttpRequest) {
    return executeTemplatesOperation(() => this.playbooks.list(query, readActor(request)));
  }

  @Get(':playbookId')
  get(@Param('playbookId') playbookId: string, @Req() request: AuthenticatedHttpRequest) {
    return executeTemplatesOperation(() => this.playbooks.get(playbookId, readActor(request)));
  }

  @Post()
  create(@Body() body: SavePlaybookDto, @Req() request: AuthenticatedHttpRequest) {
    return executeTemplatesOperation(() => this.playbooks.create(body, readActor(request)));
  }

  @Put(':playbookId')
  update(
    @Param('playbookId') playbookId: string,
    @Body() body: SavePlaybookDto,
    @Req() request: AuthenticatedHttpRequest,
  ) {
    return executeTemplatesOperation(() => this.playbooks.update(playbookId, body, readActor(request)));
  }

  @Delete(':playbookId')
  remove(
    @Param('playbookId') playbookId: string,
    @Body() body: DeleteWithReasonDto,
    @Req() request: AuthenticatedHttpRequest,
  ) {
    return executeTemplatesOperation(() => this.playbooks.remove(playbookId, body.reason, readActor(request)));
  }
}
