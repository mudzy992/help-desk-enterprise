import { Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import { privacyJobs, privacyQueueName } from './privacy.constants';
import { DataSubjectRequestsService } from './requests/data-subject-requests.service';

@Processor(privacyQueueName)
export class PrivacyProcessor extends WorkerHost {
  private readonly logger = new Logger('Privacy');

  constructor(private readonly requestsService: DataSubjectRequestsService) {
    super();
  }

  async process(job: Job): Promise<void> {
    if (job.name === privacyJobs.maintenance) {
      const sent = await this.requestsService.sendDueReminders();
      if (sent > 0) this.logger.log(`privacy_request_reminders sent=${sent}`);
      return;
    }
    this.logger.warn(`privacy_job_unknown name=${job.name}`);
  }
}
