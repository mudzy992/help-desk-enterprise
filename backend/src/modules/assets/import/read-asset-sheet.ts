import { Workbook, type CellValue } from 'exceljs';
import { AssetError, assetErrorCodes } from '../assets.constants';

export type ParsedSheet = {
  readonly headers: string[];
  /** Data rows (header row excluded), cells as trimmed text; `rowNumbers` keeps the sheet row numbers. */
  readonly rows: string[][];
  readonly rowNumbers: number[];
};

export type SheetFormat = 'xlsx' | 'csv';

const zipMagic = Buffer.from([0x50, 0x4b, 0x03, 0x04]);

/** §11: `.xlsx` or `.csv` only; `.xlsm`/`.xls` and anything else is refused. */
export function detectSheetFormat(fileName: string, buffer: Buffer): SheetFormat {
  const lower = fileName.toLowerCase();
  if (lower.endsWith('.xlsx')) {
    if (!buffer.subarray(0, 4).equals(zipMagic)) throw new AssetError(assetErrorCodes.importFileInvalid, 'not_xlsx');
    return 'xlsx';
  }
  if (lower.endsWith('.csv') || lower.endsWith('.txt')) {
    if (buffer.subarray(0, 4).equals(zipMagic)) throw new AssetError(assetErrorCodes.importFileInvalid, 'not_csv');
    return 'csv';
  }
  throw new AssetError(assetErrorCodes.importFileInvalid, 'extension');
}

function isoDate(value: Date): string {
  return Number.isNaN(value.getTime()) ? '' : value.toISOString().slice(0, 10);
}

/** Text of one Excel cell: formulas by result, rich text flattened, dates as YYYY-MM-DD. */
export function cellText(value: CellValue): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return isoDate(value);
  if (typeof value === 'number') return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(6)));
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'object') {
    if ('richText' in value && Array.isArray(value.richText)) return value.richText.map((part) => part.text).join('').trim();
    if ('formula' in value || 'sharedFormula' in value) return cellText((value as { result?: CellValue }).result ?? null);
    if ('text' in value && typeof value.text === 'string') return value.text.trim();
    if ('error' in value) return '';
  }
  return String(value).trim();
}

function finish(allRows: string[][], firstRowNumber: number, maxRows: number): ParsedSheet {
  const headerIndex = allRows.findIndex((row) => row.some((cell) => cell !== ''));
  if (headerIndex === -1) throw new AssetError(assetErrorCodes.importFileInvalid, 'empty');
  const headers = allRows[headerIndex].map((cell) => cell.trim());
  while (headers.length > 0 && headers[headers.length - 1] === '') headers.pop();
  if (headers.length === 0) throw new AssetError(assetErrorCodes.importFileInvalid, 'empty');
  const rows: string[][] = [];
  const rowNumbers: number[] = [];
  allRows.slice(headerIndex + 1).forEach((raw, index) => {
    const row = headers.map((_, column) => (raw[column] ?? '').trim());
    if (!row.some((cell) => cell !== '')) return; // blank lines are skipped, numbering stays true to the sheet
    rows.push(row);
    rowNumbers.push(firstRowNumber + headerIndex + 1 + index);
  });
  if (rows.length === 0) throw new AssetError(assetErrorCodes.importFileInvalid, 'no_rows');
  if (rows.length > maxRows) throw new AssetError(assetErrorCodes.importTooManyRows, String(maxRows));
  return { headers, rows, rowNumbers };
}

/** First worksheet that has any value; macros, images and other sheets are ignored. */
export async function readXlsx(buffer: Buffer, maxRows: number): Promise<ParsedSheet> {
  const workbook = new Workbook();
  try {
    await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
  } catch {
    throw new AssetError(assetErrorCodes.importFileInvalid, 'unreadable');
  }
  const sheet = workbook.worksheets.find((candidate) => candidate.actualRowCount > 0);
  if (sheet === undefined) throw new AssetError(assetErrorCodes.importFileInvalid, 'empty');
  // Header + maxRows data rows, plus slack for blank lines; anything beyond is "too many".
  if (sheet.actualRowCount > maxRows + 1 + 50) throw new AssetError(assetErrorCodes.importTooManyRows, String(maxRows));
  const rows: string[][] = [];
  const columnCount = Math.min(sheet.actualColumnCount, 200);
  for (let rowNumber = 1; rowNumber <= sheet.rowCount; rowNumber += 1) {
    const row = sheet.getRow(rowNumber);
    const cells: string[] = [];
    for (let column = 1; column <= columnCount; column += 1) cells.push(cellText(row.getCell(column).value));
    rows.push(cells);
  }
  return finish(rows, 1, maxRows);
}

/** `;`, `,` or tab — whichever splits the header line into the most columns. */
export function detectDelimiter(firstLine: string): string {
  const candidates = [';', ',', '\t'];
  let best = ',';
  let bestCount = 0;
  for (const candidate of candidates) {
    const count = splitCsvLine(firstLine, candidate).length;
    if (count > bestCount) {
      best = candidate;
      bestCount = count;
    }
  }
  return best;
}

function splitCsvLine(line: string, delimiter: string): string[] {
  return parseCsv(line, delimiter)[0] ?? [];
}

/** RFC 4180 parser: quoted fields, doubled quotes, newlines inside quotes. */
export function parseCsv(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index += 1;
        } else quoted = false;
      } else field += char;
      continue;
    }
    if (char === '"' && field === '') quoted = true;
    else if (char === delimiter) {
      row.push(field);
      field = '';
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[index + 1] === '\n') index += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += char;
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

export function readCsv(buffer: Buffer, maxRows: number): ParsedSheet {
  let text = buffer.toString('utf8');
  if (text.includes('\uFFFD')) throw new AssetError(assetErrorCodes.importFileInvalid, 'encoding');
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const firstLine = text.split(/\r?\n/, 1)[0] ?? '';
  const rows = parseCsv(text, detectDelimiter(firstLine));
  if (rows.length > maxRows + 1 + 50) throw new AssetError(assetErrorCodes.importTooManyRows, String(maxRows));
  return finish(rows, 1, maxRows);
}

export async function readAssetSheet(fileName: string, buffer: Buffer, maxRows: number): Promise<ParsedSheet> {
  return detectSheetFormat(fileName, buffer) === 'xlsx' ? readXlsx(buffer, maxRows) : readCsv(buffer, maxRows);
}
