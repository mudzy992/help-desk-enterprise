import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { OutboxModule } from '../../common/outbox/outbox.module';
import { SettingsModule } from '../settings/settings.module';
import { statusIncidentStartDeliveryQueueName } from './status-incident-start-delivery.constants';
import { StatusIncidentStartDeliveryProcessor } from './status-incident-start-delivery.processor';
import { StatusIncidentStartDeliveryScheduler } from './status-incident-start-delivery.scheduler';
import { StatusIncidentStartDeliveryService } from './status-incident-start-delivery.service';

@Module({
  imports: [BullModule.registerQueue({ name: statusIncidentStartDeliveryQueueName }), OutboxModule, SettingsModule],
  providers: [StatusIncidentStartDeliveryService, StatusIncidentStartDeliveryProcessor, StatusIncidentStartDeliveryScheduler],
})
export class StatusPageWorkerModule {}
