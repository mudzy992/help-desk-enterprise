import { Module } from '@nestjs/common';
import { AuthenticationModule } from '../authentication/authentication.module';
import { AuthorizationModule } from '../authorization/authorization.module';
import { IntegrationQueueModule } from '../integration-queue/integration-queue.module';
import { SettingsModule } from '../settings/settings.module';
import { TicketsModule } from '../tickets/tickets.module';
import { MAIL_TRANSPORT } from './email/mail-transport';
import { SmtpMailTransport } from './email/smtp-mail-transport';
import { NotificationsFanOutService } from './fan-out/notifications-fan-out.service';
import { NotificationUnreadCountCache } from './notification-unread-count.cache';
import { NotificationsController } from './notifications.controller';
import { EmailTemplatesController } from './email-templates/email-templates.controller';
import { EmailTemplatesService } from './email-templates/email-templates.service';
import { NotificationsService } from './notifications.service';
import { TeamsIntegrationService } from './teams/teams-integration.service';
import { NotificationDigestService } from './preferences/notification-digest.service';
import { NotificationPreferencesController } from './preferences/notification-preferences.controller';
import { NotificationPreferencesService } from './preferences/notification-preferences.service';

@Module({
  imports: [
    AuthenticationModule,
    AuthorizationModule,
    SettingsModule,
    TicketsModule,
    IntegrationQueueModule,
  ],
  controllers: [NotificationsController, EmailTemplatesController, NotificationPreferencesController],
  providers: [
    NotificationsService,
    EmailTemplatesService,
    NotificationsFanOutService,
    NotificationUnreadCountCache,
    TeamsIntegrationService,
    NotificationPreferencesService,
    NotificationDigestService,
    SmtpMailTransport,
    { provide: MAIL_TRANSPORT, useExisting: SmtpMailTransport },
  ],
  exports: [SmtpMailTransport, MAIL_TRANSPORT],
})
export class NotificationsModule {}
