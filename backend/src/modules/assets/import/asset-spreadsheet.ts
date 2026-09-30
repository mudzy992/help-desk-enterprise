import { Workbook, type Worksheet } from 'exceljs';
import { escapeSpreadsheetCell } from './asset-import-columns';

export type SheetColumn = {
  readonly key: string;
  readonly header: string;
  /** Shown as a cell note on the header (technical key, hints). */
  readonly note?: string;
  readonly width?: number;
};

export type HelpSection = { readonly title: string; readonly lines: readonly string[] };

const headerFill = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FFE8EAF6' } };

function addDataSheet(workbook: Workbook, name: string, columns: readonly SheetColumn[], rows: readonly (readonly string[])[]): Worksheet {
  const sheet = workbook.addWorksheet(name, { views: [{ state: 'frozen', ySplit: 1 }] });
  sheet.columns = columns.map((column) => ({ key: column.key, width: column.width ?? Math.min(Math.max(column.header.length + 4, 14), 40) }));
  const header = sheet.getRow(1);
  columns.forEach((column, index) => {
    const cell = header.getCell(index + 1);
    cell.value = column.header;
    cell.font = { bold: true };
    cell.fill = headerFill;
    if (column.note) cell.note = column.note;
  });
  header.commit();
  for (const row of rows) {
    // Every value is written as text (escaped): no formula can reach Excel.
    sheet.addRow(row.map((value) => escapeSpreadsheetCell(value)));
  }
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: Math.max(columns.length, 1) } };
  return sheet;
}

function addHelpSheet(workbook: Workbook, name: string, sections: readonly HelpSection[]) {
  const sheet = workbook.addWorksheet(name);
  sheet.getColumn(1).width = 110;
  for (const section of sections) {
    const title = sheet.addRow([section.title]);
    title.font = { bold: true };
    for (const line of section.lines) sheet.addRow([escapeSpreadsheetCell(line)]);
    sheet.addRow([]);
  }
}

export async function buildWorkbook(input: {
  readonly sheetName: string;
  readonly columns: readonly SheetColumn[];
  readonly rows: readonly (readonly string[])[];
  readonly helpSheetName?: string;
  readonly help?: readonly HelpSection[];
}): Promise<Buffer> {
  const workbook = new Workbook();
  workbook.creator = 'Help desk';
  workbook.created = new Date();
  addDataSheet(workbook, input.sheetName, input.columns, input.rows);
  if (input.help && input.help.length > 0) addHelpSheet(workbook, input.helpSheetName ?? 'Help', input.help);
  const output = await workbook.xlsx.writeBuffer();
  return Buffer.from(output as ArrayBuffer);
}

function csvField(value: string, delimiter: string): string {
  const escaped = escapeSpreadsheetCell(value);
  return /["\r\n]/.test(escaped) || escaped.includes(delimiter) ? `"${escaped.replace(/"/g, '""')}"` : escaped;
}

/** UTF-8 with BOM (Excel opens it with the right encoding); CRLF line ends. */
export function buildCsv(columns: readonly SheetColumn[], rows: readonly (readonly string[])[], delimiter: string): Buffer {
  const lines = [columns.map((column) => csvField(column.header, delimiter)).join(delimiter)];
  for (const row of rows) lines.push(row.map((value) => csvField(value, delimiter)).join(delimiter));
  return Buffer.from(`\uFEFF${lines.join('\r\n')}\r\n`, 'utf8');
}
