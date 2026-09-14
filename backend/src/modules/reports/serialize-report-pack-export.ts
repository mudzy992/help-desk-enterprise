import type { ReportExportFormat, ReportPackKey } from './reports.constants';
import type { ReportExportResult, ReportExportRow } from './reports.types';
import {
  serializeReportCsv,
  serializeReportJson,
} from './serialize-report-export';

export function serializeReportPackExport(
  pack: ReportPackKey,
  format: ReportExportFormat,
  columns: readonly string[],
  rows: readonly ReportExportRow[],
): ReportExportResult {
  if (format === 'csv') {
    return {
      format,
      fileName: `${pack}.csv`,
      contentType: 'text/csv; charset=utf-8',
      content: serializeReportCsv(columns, rows),
    };
  }
  return {
    format,
    fileName: `${pack}.json`,
    contentType: 'application/json; charset=utf-8',
    content: serializeReportJson(rows),
  };
}
