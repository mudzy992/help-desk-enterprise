import { reportErrorCodes, reportPackKeys } from './reports.constants';
import type { ReportPackKey } from './reports.constants';
import { ReportsError } from './reports.error';

const packSlugToKey: Readonly<Record<string, ReportPackKey>> = {
  'monthly-kpi': reportPackKeys.monthlyKpi,
  'overdue-by-service': reportPackKeys.overdueByService,
  'top-close-codes': reportPackKeys.topCloseCodes,
  'kb-helpfulness': reportPackKeys.kbHelpfulness,
};

export function parseReportPackSlug(packSlug: string): ReportPackKey {
  const pack = packSlugToKey[packSlug];
  if (pack === undefined) {
    throw new ReportsError(reportErrorCodes.packNotEnabled);
  }
  return pack;
}
