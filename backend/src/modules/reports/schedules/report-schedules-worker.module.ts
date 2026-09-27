import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { PrincipalContextLoader } from '../../../common/principal-context/principal-context.loader';
import { AuthorizationContextLoader } from '../../authorization/authorization-context.loader';
import { AuthorizationService } from '../../authorization/authorization.service';
import { MAIL_TRANSPORT } from '../../notifications/email/mail-transport';
import { SmtpMailTransport } from '../../notifications/email/smtp-mail-transport';
import { SettingsModule } from '../../settings/settings.module';
import { reportTrendsProviders } from '../trends/report-trends.providers';
import { reportSchedulesQueueName } from './report-schedule.constants';
import { ReportSchedulesProcessor } from './report-schedules.processor';
import { reportSchedulesCoreProviders } from './report-schedules.providers';
import { ReportSchedulesSchedulerService } from './report-schedules.scheduler.service';

/**
 * Paket 2.5 (§5.4): scheduled reports in the worker. Services only — no
 * reports/authorization modules with controllers are imported here.
 */
@Module({
  imports: [SettingsModule, BullModule.registerQueue({ name: reportSchedulesQueueName })],
  providers: [
    PrincipalContextLoader,
    AuthorizationContextLoader,
    AuthorizationService,
    SmtpMailTransport,
    { provide: MAIL_TRANSPORT, useExisting: SmtpMailTransport },
    ...reportTrendsProviders,
    ...reportSchedulesCoreProviders,
    ReportSchedulesProcessor,
    ReportSchedulesSchedulerService,
  ],
})
export class ReportSchedulesWorkerModule {}
