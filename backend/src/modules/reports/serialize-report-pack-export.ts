import type { ReportExportFormat, ReportPackKey } from './reports.constants';
import type { ReportExportResult, ReportExportRow, ReportWindow } from './reports.types';
import {
  serializeReportCsv,
  serializeReportJson,
} from './serialize-report-export';

export function serializeReportPackExport(
  pack: ReportPackKey,
  format: ReportExportFormat,
  columns: readonly string[],
  rows: readonly ReportExportRow[],
  naming: { readonly unitCode: string | null; readonly window: ReportWindow } | null = null,
): ReportExportResult {
  const base = naming === null ? pack : reportFileBaseName(pack, naming);
  if (format === 'csv') {
    return {
      format,
      fileName: `${base}.csv`,
      contentType: 'text/csv; charset=utf-8',
      content: serializeReportCsv(columns, rows),
    };
  }
  return {
    format,
    fileName: `${base}.json`,
    contentType: 'application/json; charset=utf-8',
    content: serializeReportJson(rows),
  };
}

/** `ephelpdesk_<pack>_<unit>_<from>_<to>` with ASCII-safe unit code (plan §3 D6). */
export function reportFileBaseName(
  pack: ReportPackKey,
  naming: { readonly unitCode: string | null; readonly window: ReportWindow },
): string {
  const unit = (naming.unitCode ?? 'unit')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'dj')
    .replace(/Đ/g, 'Dj')
    .replace(/[^A-Za-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase() || 'unit';
  const day = (value: Date) => value.toISOString().slice(0, 10);
  return `ephelpdesk_${pack}_${unit}_${day(naming.window.from)}_${day(naming.window.to)}`;
}
