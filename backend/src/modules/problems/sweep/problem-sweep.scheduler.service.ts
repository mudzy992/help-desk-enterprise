import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Queue } from 'bullmq';
import {
  problemSweepCronPattern,
  problemSweepJobAttempts,
  problemSweepJobBackoffMilliseconds,
  problemSweepJobName,
  problemSweepQueueName,
  problemSweepSchedulerId,
} from './problem-sweep.constants';

/** Idempotent by scheduler id, so restarts and extra workers converge on one schedule. */
@Injectable()
export class ProblemSweepSchedulerService implements OnModuleInit {
  private readonly logger = new Logger(ProblemSweepSchedulerService.name);

  constructor(@InjectQueue(problemSweepQueueName) private readonly queue: Queue) {}

  async onModuleInit(): Promise<void> {
    try {
      await this.queue.upsertJobScheduler(
        problemSweepSchedulerId,
        { pattern: problemSweepCronPattern },
        {
          name: problemSweepJobName,
          data: {},
          opts: {
            attempts: problemSweepJobAttempts,
            backoff: { type: 'exponential', delay: problemSweepJobBackoffMilliseconds },
            removeOnComplete: { count: 5 },
            removeOnFail: { count: 20 },
          },
        },
      );
    } catch (error) {
      this.logger.warn(`problem_sweep_schedule_failed reason=${error instanceof Error ? error.message : String(error)}`);
    }
  }
}
