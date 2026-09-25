import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuthorizationContextLoader } from '../authorization/authorization-context.loader';
import type { TicketMessageRecord, TicketTimeLogResponse } from './collaboration.types';
import { executeTicketOperation } from './execute-ticket-operation';
import { listTicketTimeLogs } from './list-ticket-time-logs';
import { publishForTicketId } from './publish-for-ticket-id';
import { startTicketTimeLog } from './start-ticket-time-log';
import { stopTicketTimeLog, type StopTicketTimeLogOptions } from './stop-ticket-time-log';
import { TicketAccessPolicyBinder } from './ticket-access-policy-binder';
import { TicketRealtimeHub } from './ticket-realtime.hub';
import type { TicketMutationContext } from './tickets.types';
import {
  correctTicketTimeLog,
  deleteTicketTimeLog,
  type CorrectTimeLogInput,
} from './time-tracking/correct-ticket-time-log';
import { heartbeatTicketTimeLog } from './time-tracking/heartbeat-ticket-time-log';
import { loadActiveTimer } from './time-tracking/load-active-timer';
import {
  addManualTicketTimeLog,
  type ManualTimeLogInput,
} from './time-tracking/manual-ticket-time-log';
import { TimeTrackingConfigurationLoader } from './time-tracking/time-tracking-configuration.loader';

/** Realtime event in the owner's room; the browser re-reads its active timer. */
export const timerChangedEventName = 'time.timer.changed';

@Injectable()
export class TicketsTimeTrackingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorizationContextLoader: AuthorizationContextLoader,
    private readonly accessPolicies: TicketAccessPolicyBinder,
    private readonly realtimeHub: TicketRealtimeHub,
    private readonly configurationLoader: TimeTrackingConfigurationLoader,
  ) {}

  listTimeLogs(
    ticketId: string,
    context: TicketMutationContext,
    options: { readonly includeDeleted?: boolean } = {},
  ) {
    return executeTicketOperation(async () =>
      listTicketTimeLogs(
        this.prisma,
        this.authorizationContextLoader,
        ticketId,
        await this.accessPolicies.bind(context),
        options,
      ),
    );
  }

  activeTimer(context: TicketMutationContext) {
    return executeTicketOperation(async () =>
      loadActiveTimer(this.prisma, context.actorUserId, await this.configurationLoader.load()),
    );
  }

  startTimeLog(
    ticketId: string,
    context: TicketMutationContext,
    now?: Date,
    options: { readonly switchFromActive?: boolean } = {},
  ): Promise<TicketTimeLogResponse> {
    return executeTicketOperation(async () => {
      const result = await startTicketTimeLog(
        this.prisma,
        this.authorizationContextLoader,
        ticketId,
        await this.accessPolicies.bind(context),
        now,
        { ...options, configuration: await this.configurationLoader.load() },
      );
      await this.publish(
        [ticketId, result.switchedTicketId],
        result.messages,
        context.actorUserId,
      );
      return result.timeLog;
    });
  }

  stopTimeLog(
    ticketId: string,
    timeLogId: string,
    context: TicketMutationContext,
    now?: Date,
    options: Omit<StopTicketTimeLogOptions, 'configuration'> = {},
  ): Promise<TicketTimeLogResponse> {
    return executeTicketOperation(async () => {
      const result = await stopTicketTimeLog(
        this.prisma,
        this.authorizationContextLoader,
        ticketId,
        timeLogId,
        await this.accessPolicies.bind(context),
        now,
        { ...options, configuration: await this.configurationLoader.load() },
      );
      await this.publish([ticketId], result.messages, result.timeLog.userId);
      return result.timeLog;
    });
  }

  heartbeat(
    ticketId: string,
    timeLogId: string,
    context: TicketMutationContext,
    now?: Date,
  ): Promise<void> {
    return executeTicketOperation(() =>
      heartbeatTicketTimeLog(this.prisma, ticketId, timeLogId, context, now),
    );
  }

  addManual(
    ticketId: string,
    input: ManualTimeLogInput,
    context: TicketMutationContext,
    now?: Date,
  ): Promise<TicketTimeLogResponse> {
    return executeTicketOperation(async () => {
      const result = await addManualTicketTimeLog(
        this.prisma,
        this.authorizationContextLoader,
        ticketId,
        input,
        await this.accessPolicies.bind(context),
        await this.configurationLoader.load(),
        now,
      );
      await this.publish([ticketId], result.messages, null);
      return result.timeLog;
    });
  }

  correct(
    ticketId: string,
    timeLogId: string,
    input: CorrectTimeLogInput,
    context: TicketMutationContext,
    now?: Date,
  ): Promise<TicketTimeLogResponse> {
    return executeTicketOperation(async () => {
      const result = await correctTicketTimeLog(
        this.prisma,
        this.authorizationContextLoader,
        ticketId,
        timeLogId,
        input,
        await this.accessPolicies.bind(context),
        await this.configurationLoader.load(),
        now,
      );
      await this.publish([ticketId], result.messages, null);
      return result.timeLog;
    });
  }

  remove(
    ticketId: string,
    timeLogId: string,
    input: { readonly reason?: unknown },
    context: TicketMutationContext,
    now?: Date,
  ): Promise<TicketTimeLogResponse> {
    return executeTicketOperation(async () => {
      const result = await deleteTicketTimeLog(
        this.prisma,
        this.authorizationContextLoader,
        ticketId,
        timeLogId,
        input,
        await this.accessPolicies.bind(context),
        await this.configurationLoader.load(),
        now,
      );
      await this.publish([ticketId], result.messages, null);
      return result.timeLog;
    });
  }

  private async publish(
    ticketIds: readonly (string | null)[],
    messages: readonly TicketMessageRecord[],
    timerOwnerId: string | null,
  ): Promise<void> {
    for (const ticketId of new Set(ticketIds.filter((id): id is string => id !== null))) {
      await publishForTicketId(
        this.prisma,
        this.realtimeHub,
        ticketId,
        messages.filter((message) => message.ticketId === ticketId),
      );
    }
    if (timerOwnerId !== null) {
      this.realtimeHub.publishEdgeEvent({
        userId: timerOwnerId,
        eventName: timerChangedEventName,
        data: { at: new Date().toISOString() },
      });
    }
  }
}
