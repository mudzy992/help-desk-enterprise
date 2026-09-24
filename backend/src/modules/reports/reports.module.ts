import { Module } from '@nestjs/common';
import { AuthenticationModule } from '../authentication/authentication.module';
import { AuthorizationModule } from '../authorization/authorization.module';
import { SettingsModule } from '../settings/settings.module';
import { ReportsConfigurationLoader } from './reports-configuration.loader';
import { ReportSummaryCache } from './report-summary.cache';
import { ReportSummaryController } from './report-summary.controller';
import { ReportSummaryService } from './report-summary.service';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';

@Module({
  imports: [AuthenticationModule, AuthorizationModule, SettingsModule],
  controllers: [ReportsController, ReportSummaryController],
  providers: [
    ReportsConfigurationLoader,
    ReportsService,
    ReportSummaryService,
    ReportSummaryCache,
  ],
})
export class ReportsModule {}
