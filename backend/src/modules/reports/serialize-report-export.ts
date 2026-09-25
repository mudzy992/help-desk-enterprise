export function serializeReportJson(rows: readonly object[]): string {
  return `${JSON.stringify(rows)}\n`;
}

export function serializeReportCsv(
  columns: readonly string[],
  rows: readonly Record<string, string | number | null>[],
): string {
  const lines = [
    columns.join(','),
    ...rows.map((row) =>
      columns.map((column) => csvCell(row[column] ?? null)).join(','),
    ),
  ];
  // UTF-8 BOM: Excel otherwise opens č/ć/ž/š/đ as mojibake (plan §3 D6).
  return `\uFEFF${lines.join('\r\n')}\r\n`;
}

/** OWASP CSV injection: text starting like a formula is prefixed with `'`. */
const formulaPrefix = /^[=+\-@\t\r]/;

function csvCell(value: string | number | null): string {
  const raw = value === null ? '' : String(value);
  const text = typeof value === 'string' && formulaPrefix.test(raw) ? `'${raw}` : raw;
  if (!/[",\r\n]/.test(text)) {
    return text;
  }
  return `"${text.replaceAll('"', '""')}"`;
}
