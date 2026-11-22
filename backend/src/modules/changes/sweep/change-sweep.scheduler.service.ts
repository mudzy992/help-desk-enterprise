import { InjectQueue } from "@nestjs/bullmq";
import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { Queue } from "bullmq";
import { isSchedulerRegistered } from "../../../common/scheduled-jobs/job-scheduler-presence";
import { registerRepeatableJob } from "../../../common/scheduled-jobs/register-repeatable-job";
import {
  changeSweepCompletedJobsToKeep,
  changeSweepCronPattern,
  changeSweepFailedJobsToKeep,
  changeSweepJobAttempts,
  changeSweepJobBackoffMilliseconds,
  changeSweepJobLabel,
  changeSweepJobName,
  changeSweepQueueName,
  changeSweepReconcileMilliseconds,
  changeSweepSchedulerId,
} from "./change-sweep.constants";

/**
 * Paket 3.4 registered the quarter-hourly sweep once, on module init. W7.69
 * (`BA-changes-13`) closes the two holes that left behind, the same way W7.32
 * did for the problem sweep:
 *
 * - **Redis loss after boot** (flush, failover to an empty instance) deleted the
 *   scheduler; nothing put it back until the next deploy, so start reminders and
 *   overrun warnings stopped silently. Every worker now verifies the schedule
 *   once a minute and restores it — idempotent by scheduler id, so N workers
 *   converge on exactly one schedule.
 * - **A failure after boot**: the boot registration still fails fast (a worker
 *   that cannot schedule must not pretend to be healthy), but the reconcile loop
 *   logs every failed attempt as `change_sweep_schedule_reconcile_failed` and
 *   the next minute tries again.
 *
 * The health side lives in `ops-health`: the sweep is an expected scheduler, so
 * `scheduler.late` reports `not_registered`, `not_picked_up`, `failing` and
 * `no_recent_success` — the last one meaning no reminder was produced for a
 * whole quarter-hour window plus grace.
 */
@Injectable()
export class ChangeSweepSchedulerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ChangeSweepSchedulerService.name);
  private reconcileTimer: NodeJS.Timeout | null = null;

  constructor(@InjectQueue(changeSweepQueueName) private readonly queue: Queue) {}

  async onModuleInit(): Promise<void> {
    // The sweep is mandatory: without it no reminder leaves and no overrun is
    // flagged, so a worker that cannot register it fails its boot.
    await this.registerSchedule();
    this.reconcileTimer = setInterval(() => {
      void this.reconcileSchedule().catch((error: unknown) => {
        this.logger.error(
          `change_sweep_schedule_reconcile_failed type=${error instanceof Error ? error.name : "UnknownError"}`,
        );
      });
    }, changeSweepReconcileMilliseconds);
    // A timer must not keep the process alive on a graceful shutdown.
    this.reconcileTimer.unref();
  }

  onModuleDestroy(): void {
    if (this.reconcileTimer !== null) clearInterval(this.reconcileTimer);
    this.reconcileTimer = null;
  }

  /** Restores the sweep scheduler when Redis lost it; returns the restored ids. */
  async reconcileSchedule(): Promise<readonly string[]> {
    const existing = await this.queue.getJobSchedulers(0, -1);
    if (isSchedulerRegistered(existing, changeSweepSchedulerId)) return [];
    await this.registerSchedule();
    this.logger.warn(`change_sweep_schedule_recovered id=${changeSweepSchedulerId}`);
    return [changeSweepSchedulerId];
  }

  private async registerSchedule(): Promise<void> {
    await registerRepeatableJob({
      queue: this.queue,
      schedulerId: changeSweepSchedulerId,
      jobName: changeSweepJobName,
      label: changeSweepJobLabel,
      schedule: { kind: "pattern", pattern: changeSweepCronPattern },
      attempts: changeSweepJobAttempts,
      backoffMilliseconds: changeSweepJobBackoffMilliseconds,
      completedJobsToKeep: changeSweepCompletedJobsToKeep,
      failedJobsToKeep: changeSweepFailedJobsToKeep,
      logger: this.logger,
    });
  }
}
