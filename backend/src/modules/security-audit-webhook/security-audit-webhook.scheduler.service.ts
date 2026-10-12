import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { registerRepeatableJob } from '../../common/scheduled-jobs/register-repeatable-job';
import {
  securityAuditWebhookIntervalMs,
  securityAuditWebhookJobName,
  securityAuditWebhookQueueName,
  securityAuditWebhookSchedulerId,
} from './security-audit-webhook.constants';

/** Idempotent by scheduler id, so restarts and extra workers converge on one schedule. */
@Injectable()
export class SecurityAuditWebhookSchedulerService implements OnModuleInit {
  private readonly logger = new Logger('SecurityAuditWebhookScheduler');

  constructor(@InjectQueue(securityAuditWebhookQueueName) private readonly queue: Queue) {}

  async onModuleInit(): Promise<void> {
    await registerRepeatableJob({
      queue: this.queue,
      schedulerId: securityAuditWebhookSchedulerId,
      jobName: securityAuditWebhookJobName,
      label: 'security_audit_webhook',
      schedule: { kind: 'every', milliseconds: securityAuditWebhookIntervalMs },
      // A missed tick is replaced by the next one; the cursor makes the retry safe.
      attempts: 1,
      backoffMilliseconds: 1_000,
      completedJobsToKeep: 5,
      failedJobsToKeep: 20,
      logger: this.logger,
    });
  }
}
