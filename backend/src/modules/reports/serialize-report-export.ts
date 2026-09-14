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
  return `${lines.join('\n')}\n`;
}

function csvCell(value: string | number | null): string {
  const text = value === null ? '' : String(value);
  if (!/[",\n]/.test(text)) {
    return text;
  }
  return `"${text.replaceAll('"', '""')}"`;
}
