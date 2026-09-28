import { Body, Controller, Delete, Get, Header, HttpCode, Param, Patch, Post, Req, UseGuards, UsePipes, ValidationPipe } from '@nestjs/common';
import type { AuthenticatedHttpRequest } from '../authentication/authenticated-request';
import { SessionAuthenticationGuard } from '../authentication/session-authentication.guard';
import { permissionKeys } from '../authorization/authorization.constants';
import { RequirePermissions } from '../authorization/require-permissions.decorator';
import { RoleGuard } from '../authorization/role.guard';
import { privacyActorOf } from '../privacy/privacy-actor';
import { AddIncidentUpdateDto, CreateIncidentDto, LinkTicketDto, UpdateIncidentDto } from './status-page.dto';
import { StatusIncidentsService } from './status-incidents.service';
import { StatusPageService } from './status-page.service';
import { statusViewerOf } from './status-viewer';

/**
 * Paket 2.7 (§8): the status page for signed-in users. Reading is open to
 * every signed-in user (requesters see ALL_USERS incidents only); managing
 * incidents needs `status.incidents.manage`; linking a ticket needs staff
 * access to that ticket (checked in the service, like any ticket write).
 */
@Controller('status')
// RoleGuard denies routes without a requirement, so it guards the manage routes only.
@UseGuards(SessionAuthenticationGuard)
@UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }))
export class StatusPageController {
  constructor(
    private readonly page: StatusPageService,
    private readonly incidents: StatusIncidentsService,
  ) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  overview(@Req() request: AuthenticatedHttpRequest) {
    const actor = privacyActorOf(request);
    return this.page.page(statusViewerOf(request, actor.principal.subjectId));
  }

  @Get('incidents/:id')
  @Header('Cache-Control', 'no-store')
  incident(@Req() request: AuthenticatedHttpRequest, @Param('id') id: string) {
    const actor = privacyActorOf(request);
    return this.page.incident(id, statusViewerOf(request, actor.principal.subjectId));
  }

  @Get('services/:serviceId/incidents')
  @Header('Cache-Control', 'no-store')
  async forService(@Req() request: AuthenticatedHttpRequest, @Param('serviceId') serviceId: string) {
    const actor = privacyActorOf(request);
    return { incidents: await this.page.openForService(serviceId, statusViewerOf(request, actor.principal.subjectId)) };
  }

  @Get('tickets/:ticketId/incidents')
  @Header('Cache-Control', 'no-store')
  forTicket(@Req() request: AuthenticatedHttpRequest, @Param('ticketId') ticketId: string) {
    const actor = privacyActorOf(request);
    const viewer = statusViewerOf(request, actor.principal.subjectId);
    return this.page.forTicket(ticketId, { ...viewer, userId: actor.principal.subjectId });
  }

  @Post('incidents')
  @UseGuards(RoleGuard)
  @RequirePermissions(permissionKeys.statusIncidentsManage)
  create(@Req() request: AuthenticatedHttpRequest, @Body() body: CreateIncidentDto) {
    return this.incidents.create(body, privacyActorOf(request));
  }

  @Patch('incidents/:id')
  @HttpCode(204)
  @UseGuards(RoleGuard)
  @RequirePermissions(permissionKeys.statusIncidentsManage)
  async edit(@Req() request: AuthenticatedHttpRequest, @Param('id') id: string, @Body() body: UpdateIncidentDto) {
    await this.incidents.edit(id, body, privacyActorOf(request));
  }

  @Post('incidents/:id/updates')
  @HttpCode(200)
  @UseGuards(RoleGuard)
  @RequirePermissions(permissionKeys.statusIncidentsManage)
  addUpdate(@Req() request: AuthenticatedHttpRequest, @Param('id') id: string, @Body() body: AddIncidentUpdateDto) {
    return this.incidents.addUpdate(id, body, privacyActorOf(request));
  }

  @Get('incidents/:id/resolve-preview')
  @Header('Cache-Control', 'no-store')
  @UseGuards(RoleGuard)
  @RequirePermissions(permissionKeys.statusIncidentsManage)
  resolvePreview(@Param('id') id: string) {
    return this.incidents.resolvePreview(id);
  }

  @Post('incidents/:id/tickets')
  @HttpCode(200)
  linkTicket(@Req() request: AuthenticatedHttpRequest, @Param('id') id: string, @Body() body: LinkTicketDto) {
    return this.incidents.linkTicket(id, body.ticketId, privacyActorOf(request));
  }

  @Delete('incidents/:id/tickets/:ticketId')
  @HttpCode(200)
  unlinkTicket(@Req() request: AuthenticatedHttpRequest, @Param('id') id: string, @Param('ticketId') ticketId: string) {
    return this.incidents.unlinkTicket(id, ticketId, privacyActorOf(request));
  }

  @Post('incidents/:id/subscription')
  @HttpCode(200)
  subscribe(@Req() request: AuthenticatedHttpRequest, @Param('id') id: string) {
    const actor = privacyActorOf(request);
    const viewer = statusViewerOf(request, actor.principal.subjectId);
    return this.incidents.subscribe(id, actor.principal.subjectId, viewer.isStaff);
  }

  @Delete('incidents/:id/subscription')
  @HttpCode(200)
  unsubscribe(@Req() request: AuthenticatedHttpRequest, @Param('id') id: string) {
    return this.incidents.unsubscribe(id, privacyActorOf(request).principal.subjectId);
  }
}
