import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuthorizationContextLoader } from '../authorization/authorization-context.loader';
import type { TicketTimeLogResponse } from './collaboration.types';
import { executeTicketOperation } from './execute-ticket-operation';
import { listTicketTimeLogs } from './list-ticket-time-logs';
import { publishForTicketId } from './publish-for-ticket-id';
import { startTicketTimeLog } from './start-ticket-time-log';
import { stopTicketTimeLog } from './stop-ticket-time-log';
import { TicketRealtimeHub } from './ticket-realtime.hub';
import type { TicketMutationContext } from './tickets.types';

@Injectable()
export class TicketsTimeTrackingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorizationContextLoader: AuthorizationContextLoader,
    private readonly realtimeHub: TicketRealtimeHub,
  ) {}

  listTimeLogs(ticketId: string, context: TicketMutationContext) {
    return executeTicketOperation(() =>
      listTicketTimeLogs(
        this.prisma,
        this.authorizationContextLoader,
        ticketId,
        context,
      ),
    );
  }

  startTimeLog(
    ticketId: string,
    context: TicketMutationContext,
    now?: Date,
  ): Promise<TicketTimeLogResponse> {
    return executeTicketOperation(async () => {
      const result = await startTicketTimeLog(
        this.prisma,
        this.authorizationContextLoader,
        ticketId,
        context,
        now,
      );
      await publishForTicketId(
        this.prisma,
        this.realtimeHub,
        ticketId,
        result.messages,
      );
      return result.timeLog;
    });
  }

  stopTimeLog(
    ticketId: string,
    timeLogId: string,
    context: TicketMutationContext,
    now?: Date,
  ): Promise<TicketTimeLogResponse> {
    return executeTicketOperation(async () => {
      const result = await stopTicketTimeLog(
        this.prisma,
        this.authorizationContextLoader,
        ticketId,
        timeLogId,
        context,
        now,
      );
      await publishForTicketId(
        this.prisma,
        this.realtimeHub,
        ticketId,
        result.messages,
      );
      return result.timeLog;
    });
  }
}
