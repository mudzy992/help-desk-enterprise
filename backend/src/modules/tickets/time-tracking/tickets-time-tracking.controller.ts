import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
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
import { SessionAuthenticationGuard } from '../../authentication/session-authentication.guard';
import type { AuthenticatedHttpRequest } from '../../authentication/authenticated-request';
import { readAuthenticatedPrincipal } from '../../authentication/authenticated-request';
import { authorizationRoleKeys } from '../../authorization/authorization.constants';
import { RequireRoles } from '../../authorization/require-roles.decorator';
import { RoleGuard } from '../../authorization/role.guard';
import { TicketsTimeTrackingService } from '../tickets-time-tracking.service';
import type { TicketMutationContext } from '../tickets.types';
import {
  CorrectTimeLogDto,
  DeleteTimeLogDto,
  ListTimeLogsQueryDto,
  ManualTimeLogDto,
  StartTimeLogDto,
  StopTimeLogDto,
} from './dto/time-tracking.dto';

const validation = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
});

/** Package 1.3: time entries of a ticket (staff; the domain checks access). */
@Controller('tickets')
@UseGuards(SessionAuthenticationGuard, RoleGuard)
@RequireRoles(
  authorizationRoleKeys.user,
  authorizationRoleKeys.agent,
  authorizationRoleKeys.admin,
  authorizationRoleKeys.superAdmin,
)
@UsePipes(validation)
export class TicketsTimeTrackingController {
  constructor(private readonly service: TicketsTimeTrackingService) {}

  @Get(':ticketId/time-logs')
  list(
    @Param('ticketId') ticketId: string,
    @Query() query: ListTimeLogsQueryDto,
    @Req() request: AuthenticatedHttpRequest,
  ) {
    return this.service.listTimeLogs(ticketId, readContext(request), {
      includeDeleted: query.includeDeleted === true,
    });
  }

  @Post(':ticketId/time-logs/start')
  start(
    @Param('ticketId') ticketId: string,
    @Body() body: StartTimeLogDto,
    @Req() request: AuthenticatedHttpRequest,
  ) {
    return this.service.startTimeLog(ticketId, readContext(request), undefined, {
      switchFromActive: body?.switchFromActive === true,
    });
  }

  @Post(':ticketId/time-logs/manual')
  manual(
    @Param('ticketId') ticketId: string,
    @Body() body: ManualTimeLogDto,
    @Req() request: AuthenticatedHttpRequest,
  ) {
    return this.service.addManual(ticketId, body, readContext(request));
  }

  @Post(':ticketId/time-logs/:timeLogId/stop')
  stop(
    @Param('ticketId') ticketId: string,
    @Param('timeLogId') timeLogId: string,
    @Body() body: StopTimeLogDto,
    @Req() request: AuthenticatedHttpRequest,
  ) {
    return this.service.stopTimeLog(ticketId, timeLogId, readContext(request), undefined, {
      reason: body?.reason,
      endedAt: body?.endedAt,
    });
  }

  @Post(':ticketId/time-logs/:timeLogId/heartbeat')
  @HttpCode(204)
  async heartbeat(
    @Param('ticketId') ticketId: string,
    @Param('timeLogId') timeLogId: string,
    @Req() request: AuthenticatedHttpRequest,
  ): Promise<void> {
    await this.service.heartbeat(ticketId, timeLogId, readContext(request));
  }

  @Patch(':ticketId/time-logs/:timeLogId')
  correct(
    @Param('ticketId') ticketId: string,
    @Param('timeLogId') timeLogId: string,
    @Body() body: CorrectTimeLogDto,
    @Req() request: AuthenticatedHttpRequest,
  ) {
    return this.service.correct(ticketId, timeLogId, body, readContext(request));
  }

  @Delete(':ticketId/time-logs/:timeLogId')
  remove(
    @Param('ticketId') ticketId: string,
    @Param('timeLogId') timeLogId: string,
    @Body() body: DeleteTimeLogDto,
    @Req() request: AuthenticatedHttpRequest,
  ) {
    return this.service.remove(ticketId, timeLogId, body, readContext(request));
  }
}

/** T10: the caller's running timer and the idle policy for the browser. */
@Controller('me')
@UseGuards(SessionAuthenticationGuard, RoleGuard)
@RequireRoles(
  authorizationRoleKeys.user,
  authorizationRoleKeys.agent,
  authorizationRoleKeys.admin,
  authorizationRoleKeys.superAdmin,
)
export class MyActiveTimerController {
  constructor(private readonly service: TicketsTimeTrackingService) {}

  @Get('active-timer')
  activeTimer(@Req() request: AuthenticatedHttpRequest) {
    return this.service.activeTimer(readContext(request));
  }
}

function readContext(request: AuthenticatedHttpRequest): TicketMutationContext {
  const actorUserId = readAuthenticatedPrincipal(request)?.subjectId ?? '';
  if (actorUserId.length === 0) {
    throw new ForbiddenException({ code: 'FORBIDDEN', message: 'Authorization failed' });
  }
  return { actorUserId };
}
