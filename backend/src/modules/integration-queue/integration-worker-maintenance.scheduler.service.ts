import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { registerRepeatableJob } from '../../common/scheduled-jobs/register-repeatable-job';
import { SettingsService } from '../settings/settings.service';
import {
  integrationDlqRetentionCompletedJobsToKeep,
  integrationDlqRetentionFailedJobsToKeep,
  integrationDlqRetentionJobAttempts,
  integrationDlqRetentionJobBackoffMilliseconds,
  integrationDlqRetentionJobLabel,
  integrationDlqRetentionJobName,
  integrationDlqRetentionSchedulerId,
  integrationWorkerHeartbeatCompletedJobsToKeep,
  integrationWorkerHeartbeatFailedJobsToKeep,
  integrationWorkerHeartbeatJobAttempts,
  integrationWorkerHeartbeatJobBackoffMilliseconds,
  integrationWorkerHeartbeatJobLabel,
  integrationWorkerHeartbeatJobName,
  integrationWorkerHeartbeatRepeatEveryMilliseconds,
  integrationWorkerHeartbeatSchedulerId,
  integrationWorkerMaintenanceQueueName,
} from './integration-worker-maintenance.job.constants';
import { loadIntegrationQueueSettings } from './load-integration-queue-settings';

const fallbackPollSeconds = 15;

/**
 * Phase 4.1 (plan §4.1): registers the worker's two maintenance schedules in Redis.
 *
 * Both are idempotent by scheduler id, so starting a second worker (or restarting
 * one) never doubles them. The DLQ interval keeps coming from the same settings
 * value the old `setInterval` used, so the cadence is unchanged; the heartbeat keeps
 * its own 10 s constant.
 */
@Injectable()
export class IntegrationWorkerMaintenanceSchedulerService implements OnModuleInit {
  private readonly logger = new Logger(
    IntegrationWorkerMaintenanceSchedulerService.name,
  );

  constructor(
    @InjectQueue(integrationWorkerMaintenanceQueueName)
    private readonly queue: Queue,
    private readonly settingsService: SettingsService,
  ) {}

  async onModuleInit(): Promise<void> {
    await registerRepeatableJob({
      queue: this.queue,
      schedulerId: integrationWorkerHeartbeatSchedulerId,
      jobName: integrationWorkerHeartbeatJobName,
      label: integrationWorkerHeartbeatJobLabel,
      schedule: {
        kind: 'every',
        milliseconds: integrationWorkerHeartbeatRepeatEveryMilliseconds,
      },
      attempts: integrationWorkerHeartbeatJobAttempts,
      backoffMilliseconds: integrationWorkerHeartbeatJobBackoffMilliseconds,
      completedJobsToKeep: integrationWorkerHeartbeatCompletedJobsToKeep,
      failedJobsToKeep: integrationWorkerHeartbeatFailedJobsToKeep,
      logger: this.logger,
    });

    await registerRepeatableJob({
      queue: this.queue,
      schedulerId: integrationDlqRetentionSchedulerId,
      jobName: integrationDlqRetentionJobName,
      label: integrationDlqRetentionJobLabel,
      schedule: {
        kind: 'every',
        milliseconds: await this.resolvePollMilliseconds(),
      },
      attempts: integrationDlqRetentionJobAttempts,
      backoffMilliseconds: integrationDlqRetentionJobBackoffMilliseconds,
      completedJobsToKeep: integrationDlqRetentionCompletedJobsToKeep,
      failedJobsToKeep: integrationDlqRetentionFailedJobsToKeep,
      logger: this.logger,
    });
  }

  /**
   * Settings may be unreachable at boot; the schedule must still be registered —
   * `sweep()` reads the very same settings on every run, so the fallback only
   * affects the cadence until the next restart.
   */
  private async resolvePollMilliseconds(): Promise<number> {
    try {
      const settings = await loadIntegrationQueueSettings(this.settingsService);
      return Math.max(settings.workerPollSeconds, 1) * 1000;
    } catch (error) {
      this.logger.warn(
        `integration_dlq_retention_settings_failed reason=${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return fallbackPollSeconds * 1000;
    }
  }
}
