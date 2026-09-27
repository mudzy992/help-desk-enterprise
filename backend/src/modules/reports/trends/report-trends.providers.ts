import type { Provider } from '@nestjs/common';
import { ReportsConfigurationLoader } from '../reports-configuration.loader';
import { ReportTrendsCache } from './report-trends.cache';
import { ReportTrendsConfigurationLoader } from './report-trends-configuration.loader';
import { ReportTrendsService } from './report-trends.service';
import { reportTrendSourceToken } from './report-trends.tokens';
import { SqlReportTrendSource } from './sql-report-trend-source';

/**
 * Paket 2.5: the trend layer without controllers, shared by the API module and
 * the worker (scheduled reports) so both compute the same numbers.
 */
export const reportTrendsProviders: Provider[] = [
  ReportsConfigurationLoader,
  ReportTrendsConfigurationLoader,
  ReportTrendsCache,
  SqlReportTrendSource,
  { provide: reportTrendSourceToken, useExisting: SqlReportTrendSource },
  ReportTrendsService,
];
