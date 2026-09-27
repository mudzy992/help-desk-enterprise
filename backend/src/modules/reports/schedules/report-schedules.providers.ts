import type { Provider } from '@nestjs/common';
import { ReportAccessChecker } from './report-access.checker';
import { ReportSchedulesConfigurationLoader } from './report-schedules-configuration.loader';
import { ScheduledReportRunner } from './scheduled-report.runner';

/** Paket 2.5: schedule building/sending, shared by the API (test send) and the worker. */
export const reportSchedulesCoreProviders: Provider[] = [
  ReportSchedulesConfigurationLoader,
  ReportAccessChecker,
  ScheduledReportRunner,
];
