import { Processor, WorkerHost } from '@nestjs/bullmq';
import { statusIncidentStartDeliveryQueueName } from './status-incident-start-delivery.constants';
import { StatusIncidentStartDeliveryService } from './status-incident-start-delivery.service';

@Processor(statusIncidentStartDeliveryQueueName)
export class StatusIncidentStartDeliveryProcessor extends WorkerHost {
  constructor(private readonly delivery: StatusIncidentStartDeliveryService) { super(); }
  async process(): Promise<void> { await this.delivery.runSweep(); }
}
