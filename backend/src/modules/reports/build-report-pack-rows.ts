import { reportPackKeys, type ReportPackKey } from './reports.constants';
import {
  buildKbHelpfulnessReport,
  kbHelpfulnessColumns,
} from './packs/build-kb-helpfulness-report';
import {
  buildMonthlyKpiReport,
  monthlyKpiColumns,
} from './packs/build-monthly-kpi-report';
import {
  buildOverdueByServiceReport,
  overdueByServiceColumns,
} from './packs/build-overdue-by-service-report';
import {
  buildTopCloseCodesReport,
  topCloseCodesColumns,
} from './packs/build-top-close-codes-report';
import type { ReportExportRow, ReportPackBuildInput } from './reports.types';

export function buildReportPackRows(
  pack: ReportPackKey,
  input: ReportPackBuildInput,
): {
  readonly columns: readonly string[];
  readonly rows: readonly ReportExportRow[];
} {
  if (pack === reportPackKeys.monthlyKpi) {
    return { columns: monthlyKpiColumns, rows: buildMonthlyKpiReport(input) };
  }
  if (pack === reportPackKeys.overdueByService) {
    return {
      columns: overdueByServiceColumns,
      rows: buildOverdueByServiceReport(input),
    };
  }
  if (pack === reportPackKeys.topCloseCodes) {
    return {
      columns: topCloseCodesColumns,
      rows: buildTopCloseCodesReport(input),
    };
  }
  return {
    columns: kbHelpfulnessColumns,
    rows: buildKbHelpfulnessReport(input),
  };
}
