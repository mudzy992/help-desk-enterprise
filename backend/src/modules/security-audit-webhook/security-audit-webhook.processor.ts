import { Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { securityAuditWebhookQueueName } from './security-audit-webhook.constants';
import { SecurityAuditWebhookDelivery } from './security-audit-webhook.delivery';

/** Paket 5.4.2 (stavka 3): the export tick runs in the worker, never in an API request. */
@Processor(securityAuditWebhookQueueName)
export class SecurityAuditWebhookProcessor extends WorkerHost {
  private readonly logger = new Logger('SecurityAuditWebhookProcessor');

  constructor(private readonly delivery: SecurityAuditWebhookDelivery) {
    super();
  }

  async process(): Promise<void> {
    try {
      await this.delivery.runTick(new Date());
    } catch (error) {
      // A database or settings error must not crash the worker; the next tick retries.
      this.logger.error(`security_audit_webhook_tick_error=${error instanceof Error ? error.name : 'unknown'}`);
    }
  }
}
