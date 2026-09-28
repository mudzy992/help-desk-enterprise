import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { SettingsModule } from '../settings/settings.module';
import { privacyQueueName } from './privacy.constants';
import { PrivacyProcessor } from './privacy.processor';
import { privacyCoreProviders } from './privacy.providers';
import { PrivacySchedulerService } from './privacy.scheduler.service';

/** Paket 2.6: privacy jobs in the worker (no controllers). */
@Module({
  imports: [SettingsModule, BullModule.registerQueue({ name: privacyQueueName })],
  providers: [...privacyCoreProviders, PrivacyProcessor, PrivacySchedulerService],
})
export class PrivacyWorkerModule {}
