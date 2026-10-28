import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Queue } from 'bullmq';
import {
  statusIncidentStartDeliveryCronPattern,
  statusIncidentStartDeliveryJobName,
  statusIncidentStartDeliveryQueueName,
  statusIncidentStartDeliverySchedulerId,
} from './status-incident-start-delivery.constants';

@Injectable()
export class StatusIncidentStartDeliveryScheduler implements OnModuleInit {
  private readonly logger = new Logger(StatusIncidentStartDeliveryScheduler.name);
  constructor(@InjectQueue(statusIncidentStartDeliveryQueueName) private readonly queue: Queue) {}
  async onModuleInit(): Promise<void> {
    try {
      await this.queue.upsertJobScheduler(
        statusIncidentStartDeliverySchedulerId,
        { pattern: statusIncidentStartDeliveryCronPattern },
        { name: statusIncidentStartDeliveryJobName, data: {}, opts: { removeOnComplete: { count: 10 }, removeOnFail: { count: 50 } } },
      );
    } catch (error) {
      this.logger.error(`status_incident_start_schedule_failed type=${error instanceof Error ? error.name : 'UnknownError'}`);
      throw new Error('status incident start delivery schedule registration failed', { cause: error });
    }
  }
}
