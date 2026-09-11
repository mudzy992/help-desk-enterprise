import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { SessionAuthenticationGuard } from '../authentication/session-authentication.guard';
import type { AuthenticatedHttpRequest } from '../authentication/authenticated-request';
import {
  authorizationRoleKeys,
  permissionKeys,
} from '../authorization/authorization.constants';
import { RequirePermissions } from '../authorization/require-permissions.decorator';
import { RequireRoles } from '../authorization/require-roles.decorator';
import { RoleGuard } from '../authorization/role.guard';
import {
  CreateBusinessHoursCalendarDto,
  UpdateBusinessHoursCalendarDto,
} from './dto/calendar.dto';
import { ChangeReasonDto } from './dto/change-reason.dto';
import { readSlaMutationContext } from './read-sla-mutation-context';
import { SlaCalendarsService } from './sla-calendars.service';
import type {
  BusinessHoursCalendarResponse,
  SlaChangeLogResponse,
} from './sla.types';

@Controller('sla/calendars')
@UseGuards(SessionAuthenticationGuard, RoleGuard)
@RequireRoles(authorizationRoleKeys.admin)
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
  list(): Promise<readonly BusinessHoursCalendarResponse[]> {
    return this.slaCalendarsService.list();
  }

  @Get(':calendarId/changes')
  listChanges(
    @Param('calendarId') calendarId: string,
  ): Promise<readonly SlaChangeLogResponse[]> {
    return this.slaCalendarsService.listChanges(calendarId);
  }

  @Get(':calendarId')
  get(
    @Param('calendarId') calendarId: string,
  ): Promise<BusinessHoursCalendarResponse> {
    return this.slaCalendarsService.get(calendarId);
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
