import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import {
  reportSchedulesCronPattern,
  reportSchedulesQueueName,
  reportSchedulesSchedulerId,
  reportSchedulesSweepJobName,
} from './report-schedule.constants';

/** Idempotent by id: restarts and extra workers converge on one schedule. */
@Injectable()
export class ReportSchedulesSchedulerService implements OnModuleInit {
  private readonly logger = new Logger(ReportSchedulesSchedulerService.name);

  constructor(@InjectQueue(reportSchedulesQueueName) private readonly queue: Queue) {}

  async onModuleInit(): Promise<void> {
    try {
      await this.queue.upsertJobScheduler(
        reportSchedulesSchedulerId,
        { pattern: reportSchedulesCronPattern },
        {
          name: reportSchedulesSweepJobName,
          data: {},
          opts: { attempts: 1, removeOnComplete: { count: 5 }, removeOnFail: { count: 20 } },
        },
      );
    } catch (error) {
      this.logger.warn(
        `report_schedules_schedule_failed reason=${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
