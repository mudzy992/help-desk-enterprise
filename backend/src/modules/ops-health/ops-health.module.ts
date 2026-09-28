import { Module } from '@nestjs/common';
import { AuthenticationModule } from '../authentication/authentication.module';
import { AuthorizationModule } from '../authorization/authorization.module';
import { MAIL_TRANSPORT } from '../notifications/email/mail-transport';
import { SmtpMailTransport } from '../notifications/email/smtp-mail-transport';
import { SettingsModule } from '../settings/settings.module';
import { HttpMetricsService } from './http-metrics.service';
import { OpsAlertEngine } from './ops-alert.engine';
import { OpsAlertNotifier, OPS_TEAMS_POSTER } from './ops-alert-notifier.service';
import { OpsConfigurationLoader } from './ops-configuration.loader';
import { OpsHealthController } from './ops-health.controller';
import { OpsHealthService } from './ops-health.service';
import { OpsWatchdogService } from './ops-watchdog.service';
import { postTeamsWebhook } from './teams-webhook';

/** Paket 2.7: "System health" API, worker watchdog and HTTP metrics in the API process. */
@Module({
  imports: [SettingsModule, AuthenticationModule, AuthorizationModule],
  controllers: [OpsHealthController],
  providers: [
    OpsConfigurationLoader,
    OpsAlertNotifier,
    OpsAlertEngine,
    OpsHealthService,
    OpsWatchdogService,
    HttpMetricsService,
    SmtpMailTransport,
    { provide: MAIL_TRANSPORT, useExisting: SmtpMailTransport },
    { provide: OPS_TEAMS_POSTER, useValue: postTeamsWebhook },
  ],
  exports: [HttpMetricsService],
})
export class OpsHealthModule {}
