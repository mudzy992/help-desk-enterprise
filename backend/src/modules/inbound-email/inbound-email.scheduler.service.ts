import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { InjectQueue } from "@nestjs/bullmq";
import { Queue } from "bullmq";
import {
  inboundEmailPollJobName,
  inboundEmailPollSchedulerId,
  inboundEmailQueueName,
  inboundEmailRetentionCronPattern,
  inboundEmailRetentionJobName,
  inboundEmailRetentionSchedulerId,
  inboundEmailTickMilliseconds,
} from "./inbound-email.constants";

/** How often the worker verifies its mandatory schedules still exist in Redis. */
export const inboundEmailScheduleReconcileMilliseconds = 60_000;

type JobSchedulerLike = { readonly id?: string | null };

/** Idempotent by id: restarts and extra workers converge on one schedule. */
@Injectable()
export class InboundEmailSchedulerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(InboundEmailSchedulerService.name);
  private reconcileTimer: NodeJS.Timeout | null = null;

  constructor(
    @InjectQueue(inboundEmailQueueName) private readonly queue: Queue,
  ) {}

  async onModuleInit(): Promise<void> {
    try {
      await this.registerSchedules();
    } catch (error) {
      this.logger.error(
        `inbound_email_schedule_failed type=${error instanceof Error ? error.name : "UnknownError"}`,
      );
      throw new Error("inbound_email mandatory schedule registration failed", {
        cause: error,
      });
    }
    // Redis can lose every scheduler after boot (flush, failover to an empty
    // instance). Without reconciliation the poll would never run again until
    // a restart, so the worker periodically verifies and restores them.
    this.reconcileTimer = setInterval(() => {
      void this.reconcileSchedules().catch((error: unknown) => {
        this.logger.error(
          `inbound_email_schedule_reconcile_failed type=${error instanceof Error ? error.name : "UnknownError"}`,
        );
      });
    }, inboundEmailScheduleReconcileMilliseconds);
    this.reconcileTimer.unref();
  }

  onModuleDestroy(): void {
    if (this.reconcileTimer !== null) clearInterval(this.reconcileTimer);
    this.reconcileTimer = null;
  }

  /** Restores any mandatory scheduler missing from Redis; returns restored ids. */
  async reconcileSchedules(): Promise<readonly string[]> {
    const existing = (await this.queue.getJobSchedulers(0, -1)) as readonly JobSchedulerLike[];
    const present = new Set(existing.map((entry) => entry.id));
    const missing = [inboundEmailPollSchedulerId, inboundEmailRetentionSchedulerId].filter(
      (id) => !present.has(id),
    );
    if (missing.length === 0) return [];
    await this.registerSchedules();
    for (const id of missing) {
      this.logger.warn(`inbound_email_schedule_recovered id=${id}`);
    }
    return missing;
  }

  private async registerSchedules(): Promise<void> {
    const opts = {
      attempts: 1,
      removeOnComplete: { count: 5 },
      removeOnFail: { count: 20 },
    };
    await this.queue.upsertJobScheduler(
      inboundEmailPollSchedulerId,
      { every: inboundEmailTickMilliseconds },
      { name: inboundEmailPollJobName, data: {}, opts },
    );
    await this.queue.upsertJobScheduler(
      inboundEmailRetentionSchedulerId,
      { pattern: inboundEmailRetentionCronPattern },
      { name: inboundEmailRetentionJobName, data: {}, opts },
    );
  }
}
