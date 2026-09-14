import { Module } from '@nestjs/common';
import { AuthenticationModule } from '../authentication/authentication.module';
import { AuthorizationModule } from '../authorization/authorization.module';
import { IntegrationQueueModule } from '../integration-queue/integration-queue.module';
import { SettingsModule } from '../settings/settings.module';
import { TicketsModule } from '../tickets/tickets.module';
import { MAIL_TRANSPORT } from './email/mail-transport';
import { SmtpMailTransport } from './email/smtp-mail-transport';
import { NotificationsFanOutService } from './fan-out/notifications-fan-out.service';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { TeamsIntegrationService } from './teams/teams-integration.service';

@Module({
  imports: [
    AuthenticationModule,
    AuthorizationModule,
    SettingsModule,
    TicketsModule,
    IntegrationQueueModule,
  ],
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    NotificationsFanOutService,
    TeamsIntegrationService,
    SmtpMailTransport,
    { provide: MAIL_TRANSPORT, useExisting: SmtpMailTransport },
  ],
})
export class NotificationsModule {}
