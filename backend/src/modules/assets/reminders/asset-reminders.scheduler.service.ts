import { InjectQueue } from "@nestjs/bullmq";
import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { Queue } from "bullmq";
import { withTimeout } from "../../health/health-probes";
import { assetSchedulerRegistrationTimeoutMs } from "../assets.constants";
import {
  assetRemindersCronPattern,
  assetRemindersJobAttempts,
  assetRemindersJobBackoffMilliseconds,
  assetRemindersJobName,
  assetRemindersQueueName,
  assetRemindersSchedulerId,
} from "./asset-reminders.constants";

/** Idempotent by scheduler id, so restarts and extra workers converge on one schedule. */
@Injectable()
export class AssetRemindersSchedulerService implements OnModuleInit {
  private readonly logger = new Logger(AssetRemindersSchedulerService.name);

  constructor(
    @InjectQueue(assetRemindersQueueName) private readonly queue: Queue,
  ) {}

  async onModuleInit(): Promise<void> {
    // A transient Redis error must not abort worker startup: the worker-wide
    // reconciler retries this schedule as soon as bootstrap completes and then
    // periodically. Keep the throwing operation separately callable so the
    // reconciler can observe failures and leave the retry loop armed.
    await this.reconcileSchedule().catch(() => undefined);
  }

  async reconcileSchedule(): Promise<void> {
    try {
      await withTimeout(
        () =>
          this.queue.upsertJobScheduler(
            assetRemindersSchedulerId,
            { pattern: assetRemindersCronPattern },
            {
              name: assetRemindersJobName,
              data: {},
              opts: {
                attempts: assetRemindersJobAttempts,
                backoff: {
                  type: "exponential",
                  delay: assetRemindersJobBackoffMilliseconds,
                },
                removeOnComplete: { count: 5 },
                removeOnFail: { count: 20 },
              },
            },
          ),
        assetSchedulerRegistrationTimeoutMs,
      );
    } catch (error) {
      this.logger.error(
        `asset_reminders_schedule_failed type=${error instanceof Error ? error.name : "UnknownError"}`,
      );
      throw new Error(
        "asset_reminders mandatory schedule registration failed",
        { cause: error },
      );
    }
  }
}
