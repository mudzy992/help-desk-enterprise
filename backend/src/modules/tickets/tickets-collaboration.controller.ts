import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  Param,
  Post,
  Req,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { SessionAuthenticationGuard } from '../authentication/session-authentication.guard';
import type { AuthenticatedHttpRequest } from '../authentication/authenticated-request';
import { readAuthenticatedPrincipal } from '../authentication/authenticated-request';
import { authorizationRoleKeys } from '../authorization/authorization.constants';
import { RequireRoles } from '../authorization/require-roles.decorator';
import { RoleGuard } from '../authorization/role.guard';
import { AddTicketParticipantDto } from './dto/add-ticket-participant.dto';
import { CreateTicketMessageDto } from './dto/create-ticket-message.dto';
import { TicketsCollaborationService } from './tickets-collaboration.service';
import { TicketsTimeTrackingService } from './tickets-time-tracking.service';
import type { TicketMutationContext } from './tickets.types';

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
export class TicketsCollaborationController {
  constructor(
    private readonly ticketsCollaborationService: TicketsCollaborationService,
    private readonly ticketsTimeTrackingService: TicketsTimeTrackingService,
  ) {}

  @Get(':ticketId/participants')
  listParticipants(
    @Param('ticketId') ticketId: string,
    @Req() request: AuthenticatedHttpRequest,
  ) {
    return this.ticketsCollaborationService.listParticipants(
      ticketId,
      readContext(request),
    );
  }

  @Post(':ticketId/participants')
  addParticipant(
    @Param('ticketId') ticketId: string,
    @Body() body: AddTicketParticipantDto,
    @Req() request: AuthenticatedHttpRequest,
  ) {
    return this.ticketsCollaborationService.addParticipant(
      ticketId,
      body,
      readContext(request),
    );
  }

  @Delete(':ticketId/participants/:participantId')
  @HttpCode(204)
  removeParticipant(
    @Param('ticketId') ticketId: string,
    @Param('participantId') participantId: string,
    @Req() request: AuthenticatedHttpRequest,
  ) {
    return this.ticketsCollaborationService.removeParticipant(
      ticketId,
      participantId,
      readContext(request),
    );
  }

  @Get(':ticketId/messages')
  listMessages(
    @Param('ticketId') ticketId: string,
    @Req() request: AuthenticatedHttpRequest,
  ) {
    return this.ticketsCollaborationService.listMessages(
      ticketId,
      readContext(request),
    );
  }

  @Post(':ticketId/messages')
  createMessage(
    @Param('ticketId') ticketId: string,
    @Body() body: CreateTicketMessageDto,
    @Req() request: AuthenticatedHttpRequest,
  ) {
    return this.ticketsCollaborationService.createMessage(
      ticketId,
      body,
      readContext(request),
    );
  }

  @Get(':ticketId/time-logs')
  listTimeLogs(
    @Param('ticketId') ticketId: string,
    @Req() request: AuthenticatedHttpRequest,
  ) {
    return this.ticketsTimeTrackingService.listTimeLogs(
      ticketId,
      readContext(request),
    );
  }

  @Post(':ticketId/time-logs/start')
  startTimeLog(
    @Param('ticketId') ticketId: string,
    @Req() request: AuthenticatedHttpRequest,
  ) {
    return this.ticketsTimeTrackingService.startTimeLog(
      ticketId,
      readContext(request),
    );
  }

  @Post(':ticketId/time-logs/:timeLogId/stop')
  stopTimeLog(
    @Param('ticketId') ticketId: string,
    @Param('timeLogId') timeLogId: string,
    @Req() request: AuthenticatedHttpRequest,
  ) {
    return this.ticketsTimeTrackingService.stopTimeLog(
      ticketId,
      timeLogId,
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
