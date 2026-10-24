import { InjectQueue } from "@nestjs/bullmq";
import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { Queue } from "bullmq";
import {
  changeSweepCronPattern,
  changeSweepJobAttempts,
  changeSweepJobBackoffMilliseconds,
  changeSweepJobName,
  changeSweepQueueName,
  changeSweepSchedulerId,
} from "./change-sweep.constants";

/** Idempotent by scheduler id, so restarts and extra workers converge on one schedule. */
@Injectable()
export class ChangeSweepSchedulerService implements OnModuleInit {
  private readonly logger = new Logger(ChangeSweepSchedulerService.name);

  constructor(
    @InjectQueue(changeSweepQueueName) private readonly queue: Queue,
  ) {}

  async onModuleInit(): Promise<void> {
    try {
      await this.queue.upsertJobScheduler(
        changeSweepSchedulerId,
        { pattern: changeSweepCronPattern },
        {
          name: changeSweepJobName,
          data: {},
          opts: {
            attempts: changeSweepJobAttempts,
            backoff: {
              type: "exponential",
              delay: changeSweepJobBackoffMilliseconds,
            },
            removeOnComplete: { count: 5 },
            removeOnFail: { count: 20 },
          },
        },
      );
    } catch (error) {
      this.logger.error(
        `change_sweep_schedule_failed type=${error instanceof Error ? error.name : "UnknownError"}`,
      );
      throw new Error("change_sweep mandatory schedule registration failed", {
        cause: error,
      });
    }
  }
}
