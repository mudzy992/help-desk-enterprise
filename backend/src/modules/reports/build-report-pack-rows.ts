import { reportPackKeys, type ReportPackKey } from './reports.constants';
import {
  buildForwardPingPongReport,
  forwardPingPongColumns,
} from './packs/build-forward-ping-pong-report';
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
import {
  buildTimeTrackingReport,
  timeTrackingColumns,
} from './packs/build-time-tracking-report';
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
  if (pack === reportPackKeys.forwardPingPong) {
    return {
      columns: forwardPingPongColumns,
      rows: buildForwardPingPongReport(input),
    };
  }
  if (pack === reportPackKeys.timeTracking) {
    return { columns: timeTrackingColumns, rows: buildTimeTrackingReport(input) };
  }
  return {
    columns: kbHelpfulnessColumns,
    rows: buildKbHelpfulnessReport(input),
  };
}

/** Column list per pack without building anything (for `GET /reports/packs`). */
export function reportPackColumns(pack: ReportPackKey): readonly string[] {
  return buildReportPackRows(pack, emptyBuildInput).columns;
}

const emptyBuildInput: ReportPackBuildInput = {
  window: { from: new Date(0), to: new Date(0) },
  tickets: [],
  csatByTicketId: new Map(),
  closeCodesById: new Map(),
  articles: [],
  feedback: [],
  serviceNamesById: new Map(),
  forwardTickets: [],
  pingPongThreshold: 3,
  timeEntries: [],
};
