import { ticketExportColumns } from './export.constants';
import type { TicketExportRow } from './export.types';

const utf8ByteOrderMark = '\uFEFF';
const formulaTriggerPattern = /^[=+\-@\t\r]/;

/**
 * Neutralizes spreadsheet formula injection: user-controlled text such as a
 * ticket title must never be interpreted as a formula by Excel or Sheets.
 */
export function neutralizeCsvFormula(text: string): string {
  return formulaTriggerPattern.test(text) ? `'${text}` : text;
}

export function toCsvCell(value: string | number | null): string {
  if (value === null) {
    return '';
  }
  const text =
    typeof value === 'number' ? String(value) : neutralizeCsvFormula(value);
  if (!/[",\r\n]/.test(text)) {
    return text;
  }
  return `"${text.replaceAll('"', '""')}"`;
}

export function serializeTicketsCsv(rows: readonly TicketExportRow[]): string {
  const lines = [
    ticketExportColumns.join(','),
    ...rows.map((row) =>
      ticketExportColumns.map((column) => toCsvCell(row[column])).join(','),
    ),
  ];
  // BOM keeps Bosnian diacritics intact when the file is opened in Excel.
  return `${utf8ByteOrderMark}${lines.join('\r\n')}\r\n`;
}
