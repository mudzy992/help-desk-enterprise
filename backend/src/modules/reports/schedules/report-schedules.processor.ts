import { Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import {
  reportSchedulesManualJobName,
  reportSchedulesQueueName,
  reportSchedulesRetentionJobName,
} from './report-schedule.constants';
import { ScheduledReportRunner } from './scheduled-report.runner';

@Processor(reportSchedulesQueueName)
export class ReportSchedulesProcessor extends WorkerHost {
  private readonly logger = new Logger('ScheduledReports');

  constructor(private readonly runner: ScheduledReportRunner) {
    super();
  }

  async process(
    job: Job<{ scheduleId?: unknown; actorUserId?: unknown; commandKey?: unknown }>,
  ): Promise<void> {
    // W7.103 (`BA-reports-14`): retention has its own job, so it no longer depends on a due schedule or on the
    // delivery sweep. A failure is rethrown on purpose: BullMQ retries it and the queue reports the failure.
    if (job.name === reportSchedulesRetentionJobName) {
      await this.runner.pruneExpiredRuns();
      return;
    }
    if (job.name === reportSchedulesManualJobName) {
      const scheduleId = typeof job.data.scheduleId === 'string' ? job.data.scheduleId : null;
      if (scheduleId === null) return;
      const actorUserId = typeof job.data.actorUserId === 'string' ? job.data.actorUserId : null;
      // W7.106 (`BA-reports-16`): the command key travels with the job, so a second job for the same command stops
      // at the unique run insert instead of sending a second e-mail.
      const commandKey = typeof job.data.commandKey === 'string' ? job.data.commandKey : undefined;
      const outcome = await this.runner.runManual({ scheduleId, actorUserId, commandKey });
      if (outcome.outcome === 'missing') {
        this.logger.warn(`report_schedule_manual_missing schedule=${scheduleId}`);
      }
      return;
    }
    await this.runner.runDue();
  }
}
