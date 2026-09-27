import { Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import { inboundEmailQueueName, inboundEmailRetentionJobName } from './inbound-email.constants';
import { InboundEmailService } from './inbound-email.service';

/** Concurrency 1 (default): never two passes over the same mailbox. */
@Processor(inboundEmailQueueName)
export class InboundEmailProcessor extends WorkerHost {
  private readonly logger = new Logger('InboundEmail');

  constructor(private readonly service: InboundEmailService) {
    super();
  }

  async process(job: Job): Promise<void> {
    if (job.name === inboundEmailRetentionJobName) {
      const result = await this.service.applyRetention();
      if (result.rawRemoved + result.rowsRemoved > 0) {
        this.logger.log(`inbound_email_retention raw_removed=${result.rawRemoved} rows_removed=${result.rowsRemoved}`);
      }
      return;
    }
    await this.service.runDue();
  }
}
