import { Module } from '@nestjs/common';
import { AuthenticationModule } from '../authentication/authentication.module';
import { AuthorizationModule } from '../authorization/authorization.module';
import { SettingsModule } from '../settings/settings.module';
import { TicketsModule } from '../tickets/tickets.module';
import { EdgeEventRealtimeSubscriber } from './edge-event-realtime.subscriber';
import { IntegrationQueueController } from './integration-queue.controller';
import { IntegrationQueueCoreModule } from './integration-queue-core.module';
import { IntegrationQueueService } from './integration-queue.service';

@Module({
  imports: [
    IntegrationQueueCoreModule,
    AuthenticationModule,
    AuthorizationModule,
    SettingsModule,
    TicketsModule,
  ],
  controllers: [IntegrationQueueController],
  providers: [IntegrationQueueService, EdgeEventRealtimeSubscriber],
  exports: [IntegrationQueueCoreModule],
})
export class IntegrationQueueModule {}
