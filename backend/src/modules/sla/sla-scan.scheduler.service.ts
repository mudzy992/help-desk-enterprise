import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import {
  slaScanCompletedJobsToKeep,
  slaScanFailedJobsToKeep,
  slaScanJobAttempts,
  slaScanJobBackoffMilliseconds,
  slaScanJobName,
  slaScanQueueName,
  slaScanRegistrationReconcileMilliseconds,
  slaScanRegistrationRetryBaseMilliseconds,
  slaScanRegistrationRetryMaximumMilliseconds,
  slaScanRepeatEveryMilliseconds,
  slaScanSchedulerId,
} from './sla-scan.constants';

export type SlaScanSchedulerRegistrationHealth = {
  readonly ready: boolean;
  readonly consecutiveFailures: number;
  readonly lastAttemptAt: Date | null;
  readonly lastSuccessAt: Date | null;
  readonly lastFailureAt: Date | null;
  readonly nextAttemptAt: Date | null;
};

/** Idempotently registers and continuously reconciles the mandatory SLA scan schedule. */
@Injectable()
export class SlaScanSchedulerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SlaScanSchedulerService.name);
  private timer: NodeJS.Timeout | null = null;
  private stopped = false;
  private inFlight: Promise<void> | null = null;
  private health: SlaScanSchedulerRegistrationHealth = {
    ready: false,
    consecutiveFailures: 0,
    lastAttemptAt: null,
    lastSuccessAt: null,
    lastFailureAt: null,
    nextAttemptAt: null,
  };

  constructor(@InjectQueue(slaScanQueueName) private readonly queue: Queue) {}

  async onModuleInit(): Promise<void> {
    this.stopped = false;
    await this.reconcile();
  }

  onModuleDestroy(): void {
    this.stopped = true;
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
    this.health = { ...this.health, ready: false, nextAttemptAt: null };
  }

  getRegistrationHealth(): SlaScanSchedulerRegistrationHealth {
    return { ...this.health };
  }

  async reconcile(): Promise<void> {
    if (this.inFlight !== null) return this.inFlight;
    this.inFlight = this.registerAndSchedule().finally(() => {
      this.inFlight = null;
    });
    return this.inFlight;
  }

  private async registerAndSchedule(): Promise<void> {
    if (this.stopped) return;
    const attemptedAt = new Date();
    this.health = { ...this.health, lastAttemptAt: attemptedAt };
    try {
      await this.queue.upsertJobScheduler(
        slaScanSchedulerId,
        { every: slaScanRepeatEveryMilliseconds },
        {
          name: slaScanJobName,
          data: {},
          opts: {
            attempts: slaScanJobAttempts,
            backoff: { type: 'exponential', delay: slaScanJobBackoffMilliseconds },
            removeOnComplete: { count: slaScanCompletedJobsToKeep },
            removeOnFail: { count: slaScanFailedJobsToKeep },
          },
        },
      );
      const completedAt = new Date();
      this.health = {
        ready: true,
        consecutiveFailures: 0,
        lastAttemptAt: attemptedAt,
        lastSuccessAt: completedAt,
        lastFailureAt: this.health.lastFailureAt,
        nextAttemptAt: new Date(completedAt.getTime() + slaScanRegistrationReconcileMilliseconds),
      };
      this.schedule(slaScanRegistrationReconcileMilliseconds);
    } catch (error) {
      const failures = this.health.consecutiveFailures + 1;
      const delay = Math.min(
        slaScanRegistrationRetryMaximumMilliseconds,
        slaScanRegistrationRetryBaseMilliseconds * 2 ** (failures - 1),
      );
      const failedAt = new Date();
      this.health = {
        ...this.health,
        ready: false,
        consecutiveFailures: failures,
        lastAttemptAt: attemptedAt,
        lastFailureAt: failedAt,
        nextAttemptAt: new Date(failedAt.getTime() + delay),
      };
      this.logger.error(
        `sla_scan_schedule_reconcile_failed failures=${failures} retry_ms=${delay} type=${error instanceof Error ? error.name : 'UnknownError'}`,
      );
      this.schedule(delay);
    }
  }

  private schedule(delay: number): void {
    if (this.stopped) return;
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.reconcile();
    }, delay);
    this.timer.unref?.();
  }
}
