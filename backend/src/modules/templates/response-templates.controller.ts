import { Body, Controller, Delete, Get, Param, Post, Put, Query, Req, UseGuards, UsePipes } from '@nestjs/common';
import { AdminConfigDomains } from '../../common/admin-realtime/admin-config-domain.decorator';
import { SessionAuthenticationGuard } from '../authentication/session-authentication.guard';
import type { AuthenticatedHttpRequest } from '../authentication/authenticated-request';
import { RequireRoles } from '../authorization/require-roles.decorator';
import { RoleGuard } from '../authorization/role.guard';
import {
  DeleteWithReasonDto,
  ListResponseTemplatesQueryDto,
  ManageResponseTemplatesQueryDto,
  PreviewResponseTemplateDto,
  RenderResponseTemplateDto,
  SaveResponseTemplateDto,
} from './dto/templates.dto';
import { executeTemplatesOperation } from './map-templates-error';
import { ResponseTemplatesService } from './response-templates.service';
import { readActor, staffRoleKeys, templatesValidationPipe } from './templates-http';

/**
 * Package 1.4 — response templates. Shared templates live under
 * `/response-templates`, personal ones under `/response-templates/mine`, so
 * only shared changes notify other admins (R2 domain `templates`).
 */
@Controller('response-templates')
@UseGuards(SessionAuthenticationGuard, RoleGuard)
@RequireRoles(...staffRoleKeys)
@UsePipes(templatesValidationPipe)
export class ResponseTemplatesController {
  constructor(private readonly templates: ResponseTemplatesService) {}

  /** Composer picker (T5). */
  @Get()
  picker(@Query() query: ListResponseTemplatesQueryDto, @Req() request: AuthenticatedHttpRequest) {
    return executeTemplatesOperation(() =>
      this.templates.listForPicker(
        { ticketId: query.ticketId, kind: query.kind, q: query.q, all: query.all === 'true' },
        readActor(request),
      ),
    );
  }

  @Get('manage')
  listManaged(@Query() query: ManageResponseTemplatesQueryDto, @Req() request: AuthenticatedHttpRequest) {
    return executeTemplatesOperation(() => this.templates.listManaged(query, readActor(request)));
  }

  @Post('preview')
  preview(@Body() body: PreviewResponseTemplateDto, @Req() request: AuthenticatedHttpRequest) {
    return executeTemplatesOperation(() => this.templates.preview(body, readActor(request)));
  }

  @Post('mine')
  createPersonal(@Body() body: SaveResponseTemplateDto, @Req() request: AuthenticatedHttpRequest) {
    return executeTemplatesOperation(() => this.templates.create('personal', body, readActor(request)));
  }

  @Put('mine/:templateId')
  updatePersonal(
    @Param('templateId') templateId: string,
    @Body() body: SaveResponseTemplateDto,
    @Req() request: AuthenticatedHttpRequest,
  ) {
    return executeTemplatesOperation(() =>
      this.templates.update('personal', templateId, body, readActor(request)),
    );
  }

  @Delete('mine/:templateId')
  removePersonal(@Param('templateId') templateId: string, @Req() request: AuthenticatedHttpRequest) {
    return executeTemplatesOperation(() =>
      this.templates.remove('personal', templateId, undefined, readActor(request)),
    );
  }

  @Get(':templateId')
  get(@Param('templateId') templateId: string, @Req() request: AuthenticatedHttpRequest) {
    return executeTemplatesOperation(() => this.templates.get(templateId, readActor(request)));
  }

  @Post()
  @AdminConfigDomains('templates')
  createShared(@Body() body: SaveResponseTemplateDto, @Req() request: AuthenticatedHttpRequest) {
    return executeTemplatesOperation(() => this.templates.create('shared', body, readActor(request)));
  }

  @Put(':templateId')
  @AdminConfigDomains('templates')
  updateShared(
    @Param('templateId') templateId: string,
    @Body() body: SaveResponseTemplateDto,
    @Req() request: AuthenticatedHttpRequest,
  ) {
    return executeTemplatesOperation(() =>
      this.templates.update('shared', templateId, body, readActor(request)),
    );
  }

  @Delete(':templateId')
  @AdminConfigDomains('templates')
  removeShared(
    @Param('templateId') templateId: string,
    @Body() body: DeleteWithReasonDto,
    @Req() request: AuthenticatedHttpRequest,
  ) {
    return executeTemplatesOperation(() =>
      this.templates.remove('shared', templateId, body.reason, readActor(request)),
    );
  }
}

/** T3: `POST /tickets/:ticketId/response-templates/:templateId/render`. */
@Controller('tickets')
@UseGuards(SessionAuthenticationGuard, RoleGuard)
@RequireRoles(...staffRoleKeys)
@UsePipes(templatesValidationPipe)
export class TicketResponseTemplatesController {
  constructor(private readonly templates: ResponseTemplatesService) {}

  @Post(':ticketId/response-templates/:templateId/render')
  render(
    @Param('ticketId') ticketId: string,
    @Param('templateId') templateId: string,
    @Body() body: RenderResponseTemplateDto,
    @Req() request: AuthenticatedHttpRequest,
  ) {
    return executeTemplatesOperation(() =>
      this.templates.render(ticketId, templateId, body.locale, readActor(request)),
    );
  }
}
