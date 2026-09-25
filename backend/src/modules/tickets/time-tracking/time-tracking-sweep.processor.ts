import { Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { formatJobMetrics } from '../../../common/scheduled-jobs/format-job-metrics';
import { publishForTicketId } from '../publish-for-ticket-id';
import { TicketRealtimeHub } from '../ticket-realtime.hub';
import { sweepTimeLogs } from './sweep-time-logs';
import {
  timeTrackingSweepJobLogContext,
  timeTrackingSweepJobName,
  timeTrackingSweepJobTimeoutMilliseconds,
  timeTrackingSweepQueueName,
} from './time-tracking-sweep.job.constants';
import { TimeTrackingConfigurationLoader } from './time-tracking-configuration.loader';

/** Closes forgotten (max duration) and abandoned (idle) timers; see sweep-time-logs. */
@Processor(timeTrackingSweepQueueName, {
  concurrency: 1,
  lockDuration: timeTrackingSweepJobTimeoutMilliseconds,
})
export class TimeTrackingSweepProcessor extends WorkerHost {
  private readonly logger = new Logger(timeTrackingSweepJobLogContext);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configurationLoader: TimeTrackingConfigurationLoader,
    private readonly realtimeHub: TicketRealtimeHub,
  ) {
    super();
  }

  async process(): Promise<void> {
    const startedAt = Date.now();
    try {
      const result = await sweepTimeLogs(this.prisma, await this.configurationLoader.load());
      const ticketIds = new Set(result.messages.map((message) => message.ticketId));
      for (const ticketId of ticketIds) {
        await publishForTicketId(
          this.prisma,
          this.realtimeHub,
          ticketId,
          result.messages.filter((message) => message.ticketId === ticketId),
        );
      }
      for (const userId of result.ownerUserIds) {
        this.realtimeHub.publishEdgeEvent({
          userId,
          eventName: 'time.timer.changed',
          data: { at: new Date().toISOString() },
        });
      }
      this.logger.log(
        formatJobMetrics({
          job: timeTrackingSweepJobName,
          durationMs: Date.now() - startedAt,
          processed: result.idleClosed + result.maxDurationClosed,
          failed: 0,
        }),
      );
    } catch (error) {
      this.logger.error(
        formatJobMetrics({
          job: timeTrackingSweepJobName,
          durationMs: Date.now() - startedAt,
          processed: 0,
          failed: 1,
        }),
      );
      throw error;
    }
  }
}
