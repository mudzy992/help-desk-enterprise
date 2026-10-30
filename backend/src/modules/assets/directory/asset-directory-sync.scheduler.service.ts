import { InjectQueue } from "@nestjs/bullmq";
import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { Queue } from "bullmq";
import { withTimeout } from "../../health/health-probes";
import { assetSchedulerRegistrationTimeoutMs } from "../assets.constants";
import {
  assetDirectorySyncCronPattern,
  assetDirectorySyncJobAttempts,
  assetDirectorySyncJobName,
  assetDirectorySyncQueueName,
  assetDirectorySyncSchedulerId,
} from "./asset-directory-sync.constants";

/** Idempotent by scheduler id, so restarts and extra workers converge on one schedule. */
@Injectable()
export class AssetDirectorySyncSchedulerService implements OnModuleInit {
  private readonly logger = new Logger(AssetDirectorySyncSchedulerService.name);

  constructor(
    @InjectQueue(assetDirectorySyncQueueName) private readonly queue: Queue,
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
            assetDirectorySyncSchedulerId,
            { pattern: assetDirectorySyncCronPattern },
            {
              name: assetDirectorySyncJobName,
              data: {},
              opts: {
                attempts: assetDirectorySyncJobAttempts,
                removeOnComplete: { count: 5 },
                removeOnFail: { count: 20 },
              },
            },
          ),
        assetSchedulerRegistrationTimeoutMs,
      );
    } catch (error) {
      this.logger.error(
        `asset_directory_sync_schedule_failed type=${error instanceof Error ? error.name : "UnknownError"}`,
      );
      throw new Error(
        "asset_directory_sync mandatory schedule registration failed",
        { cause: error },
      );
    }
  }
}
