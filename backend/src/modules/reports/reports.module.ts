import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { MAIL_TRANSPORT } from '../notifications/email/mail-transport';
import { SmtpMailTransport } from '../notifications/email/smtp-mail-transport';
import { AuthenticationModule } from '../authentication/authentication.module';
import { AuthorizationModule } from '../authorization/authorization.module';
import { SettingsModule } from '../settings/settings.module';
import { ReportSummaryCache } from './report-summary.cache';
import { ReportSummaryController } from './report-summary.controller';
import { ReportSummaryService } from './report-summary.service';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';
import { reportTrendsProviders } from './trends/report-trends.providers';
import { reportSchedulesQueueName } from './schedules/report-schedule.constants';
import { ReportSchedulesController } from './schedules/report-schedules.controller';
import { reportSchedulesCoreProviders } from './schedules/report-schedules.providers';
import { ReportSchedulesService } from './schedules/report-schedules.service';

@Module({
  imports: [
    AuthenticationModule,
    AuthorizationModule,
    SettingsModule,
    // Producer only: the worker owns the processor.
    BullModule.registerQueue({ name: reportSchedulesQueueName }),
  ],
  controllers: [ReportsController, ReportSummaryController, ReportSchedulesController],
  providers: [
    ...reportTrendsProviders,
    ...reportSchedulesCoreProviders,
    ReportSchedulesService,
    SmtpMailTransport,
    { provide: MAIL_TRANSPORT, useExisting: SmtpMailTransport },
    ReportsService,
    ReportSummaryService,
    ReportSummaryCache,
  ],
})
export class ReportsModule {}
