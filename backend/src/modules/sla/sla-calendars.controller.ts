import { AdminConfigDomains } from '../../common/admin-realtime/admin-config-domain.decorator';
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { SessionAuthenticationGuard } from '../authentication/session-authentication.guard';
import type { AuthenticatedHttpRequest } from '../authentication/authenticated-request';
import {
  permissionKeys,
} from '../authorization/authorization.constants';
import { RequirePermissions } from '../authorization/require-permissions.decorator';
import { RoleGuard } from '../authorization/role.guard';
import { SlaGlobalAdministrationGuard } from './sla-global-administration.guard';
import {
  CreateBusinessHoursCalendarDto,
  UpdateBusinessHoursCalendarDto,
} from './dto/calendar.dto';
import { ChangeReasonDto } from './dto/change-reason.dto';
import { readSlaMutationContext } from './read-sla-mutation-context';
import { readSlaReadScope } from './sla-read-scope';
import { SlaListQueryDto } from './dto/sla-list-query.dto';
import { SlaCalendarsService } from './sla-calendars.service';
import type {
  BusinessHoursCalendarResponse,
  SlaChangeLogResponse,
  SlaPage,
} from './sla.types';

@AdminConfigDomains('sla')
@Controller('sla/calendars')
@UseGuards(SessionAuthenticationGuard, RoleGuard, SlaGlobalAdministrationGuard)
@RequirePermissions(permissionKeys.slaRead)
@UsePipes(
  new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  }),
)
export class SlaCalendarsController {
  constructor(private readonly slaCalendarsService: SlaCalendarsService) {}

  @Post()
  @RequirePermissions(permissionKeys.slaWrite)
  create(
    @Body() body: CreateBusinessHoursCalendarDto,
    @Req() request: AuthenticatedHttpRequest,
  ): Promise<BusinessHoursCalendarResponse> {
    return this.slaCalendarsService.create(body, readSlaMutationContext(request));
  }

  @Get()
  list(@Query() query: SlaListQueryDto, @Req() request: AuthenticatedHttpRequest): Promise<SlaPage<BusinessHoursCalendarResponse>> {
    return this.slaCalendarsService.list({ ...query, scope: readSlaReadScope(request) });
  }

  @Get(':calendarId/changes')
  listChanges(
    @Param('calendarId') calendarId: string,
    @Query() query: SlaListQueryDto,
    @Req() request: AuthenticatedHttpRequest,
  ): Promise<SlaPage<SlaChangeLogResponse>> {
    return this.slaCalendarsService.listChanges(calendarId, { ...query, scope: readSlaReadScope(request) });
  }

  @Get(':calendarId')
  get(
    @Param('calendarId') calendarId: string,
    @Req() request: AuthenticatedHttpRequest,
  ): Promise<BusinessHoursCalendarResponse> {
    return this.slaCalendarsService.get(calendarId, readSlaReadScope(request));
  }

  @Patch(':calendarId')
  @RequirePermissions(permissionKeys.slaWrite)
  update(
    @Param('calendarId') calendarId: string,
    @Body() body: UpdateBusinessHoursCalendarDto,
    @Req() request: AuthenticatedHttpRequest,
  ): Promise<BusinessHoursCalendarResponse> {
    return this.slaCalendarsService.update(
      calendarId,
      body,
      readSlaMutationContext(request),
    );
  }

  @Delete(':calendarId')
  @HttpCode(204)
  @RequirePermissions(permissionKeys.slaWrite)
  async delete(
    @Param('calendarId') calendarId: string,
    @Body() body: ChangeReasonDto,
    @Req() request: AuthenticatedHttpRequest,
  ): Promise<void> {
    await this.slaCalendarsService.delete(
      calendarId,
      body.reason,
      readSlaMutationContext(request),
    );
  }
}
