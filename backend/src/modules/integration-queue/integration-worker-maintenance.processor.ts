import { Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import { formatJobMetrics } from '../../common/scheduled-jobs/format-job-metrics';
import { IntegrationJobDispatchReconcilerService } from './integration-job-dispatch-reconciler.service';
import { IntegrationJobDlqRetentionService } from './integration-job-dlq-retention.service';
import { IntegrationQueueWorkerHeartbeatService } from './integration-queue-worker-heartbeat.service';
import {
  integrationDlqRetentionJobLogContext,
  integrationDlqRetentionJobName,
  integrationJobDispatchReconcileJobLogContext,
  integrationJobDispatchReconcileJobName,
  integrationWorkerHeartbeatJobLogContext,
  integrationWorkerHeartbeatJobName,
  integrationWorkerMaintenanceLockDurationMilliseconds,
  integrationWorkerMaintenanceQueueName,
} from './integration-worker-maintenance.job.constants';

/**
 * One processor serializes heartbeat, DLQ-retention, and dispatch-reconcile jobs.
 *
 * `concurrency: 1` is the "no overlapping runs" guarantee from the plan: a slow
 * sweep delays the next occurrence instead of running beside it, and the queue's
 * lock means a second worker cannot pick up the same occurrence.
 */
@Processor(integrationWorkerMaintenanceQueueName, {
  concurrency: 1,
  lockDuration: integrationWorkerMaintenanceLockDurationMilliseconds,
})
export class IntegrationWorkerMaintenanceProcessor extends WorkerHost {
  private readonly heartbeatLogger = new Logger(
    integrationWorkerHeartbeatJobLogContext,
  );
  private readonly retentionLogger = new Logger(
    integrationDlqRetentionJobLogContext,
  );
  private readonly dispatchReconcileLogger = new Logger(
    integrationJobDispatchReconcileJobLogContext,
  );

  constructor(
    private readonly heartbeat: IntegrationQueueWorkerHeartbeatService,
    private readonly dlqRetention: IntegrationJobDlqRetentionService,
    private readonly dispatchReconciler: IntegrationJobDispatchReconcilerService,
  ) {
    super();
  }

  async process(job: Job): Promise<void> {
    if (job.name === integrationDlqRetentionJobName) {
      await this.run(
        integrationDlqRetentionJobName,
        this.retentionLogger,
        async () => this.dlqRetention.sweep(),
      );
      return;
    }
    if (job.name === integrationJobDispatchReconcileJobName) {
      await this.run(
        integrationJobDispatchReconcileJobName,
        this.dispatchReconcileLogger,
        async () => this.dispatchReconciler.sweep(),
      );
      return;
    }
    if (job.name === integrationWorkerHeartbeatJobName) {
      await this.run(
        integrationWorkerHeartbeatJobName,
        this.heartbeatLogger,
        async () => {
          await this.heartbeat.writeHeartbeat();
          return 1;
        },
      );
      return;
    }
    this.heartbeatLogger.warn(
      `job_ignored job=${job.name} reason=unknown_scheduled_job`,
    );
  }

  private async run(
    jobName: string,
    logger: Logger,
    execute: () => Promise<number | { processed: number; failed: number }>,
  ): Promise<void> {
    const startedAt = Date.now();
    try {
      const result = await execute();
      const processed = typeof result === 'number' ? result : result.processed;
      const failed = typeof result === 'number' ? 0 : result.failed;
      logger.log(
        formatJobMetrics({
          job: jobName,
          durationMs: Date.now() - startedAt,
          processed,
          failed,
        }),
      );
    } catch (error) {
      logger.error(
        formatJobMetrics({
          job: jobName,
          durationMs: Date.now() - startedAt,
          processed: 0,
          failed: 1,
        }),
      );
      throw error;
    }
  }
}
